// Adaptador "cofre cifrado": implementa as portas Sessao, Repositorio, Chaves e Backup (application/ports.js)
// sobre o IndexedDB, com envelope encryption (PIN -> KEK -> DEK -> registros).
//
// É uma fábrica: a instância (com a DEK em memória) só existe dentro da raiz de composição (main.js) e
// da aplicação montada por ela. Nenhum módulo exporta essa instância, então importar este arquivo pelo
// console não dá acesso à sessão aberta.
import { deriveKEK, newDEK, wrapDEK, unwrapDEK, seal, open, rand, PBKDF2_ITER, toB64, fromB64 } from './webcrypto.js';

const MAX_FREE = 5;            // tentativas antes do bloqueio temporário
const BASE_LOCK_MS = 30000;    // 30 s, dobra a cada erro seguinte
const MAX_LOCK_MS = 3600000;   // teto de 1 h

// O tipo do registro sai do id ("tipo:uuid"), que é o dado autenticado (AAD) do AES-GCM.
// O campo "type" em claro serve só para o índice do banco e não é confiável.
const typeOf = (recId) => String(recId).slice(0, String(recId).indexOf(':'));

// O cache guarda objetos congelados: quem lê não altera o estado sem passar por commit().
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

export function createCofreCifrado({ db }) {
  let DEK = null;          // chave de dados: só em memória, só enquanto desbloqueado
  let USER_ID = null;
  const cache = new Map(); // type -> Map(id -> objeto decifrado)
  let integrityErrors = 0;
  let tentando = false;    // uma tentativa de PIN por vez (o contador não pode ser contornado em paralelo)

  const isUnlocked = () => !!DEK;
  const lockRemaining = (entry) => Math.max(0, (entry.until || 0) - Date.now());
  function exigeSessao() { if (!DEK) throw new Error('Sessão bloqueada. Entre com seu PIN.'); }

  async function writeKeyEntry(prof, pin, dek = DEK) {
    const salt = rand(16);
    const kek = await deriveKEK(pin, salt, PBKDF2_ITER);
    const { iv, wrapped } = await wrapDEK(dek, kek);
    return { id: prof.id, nome: prof.nome, sigla: prof.sigla, cor: prof.cor, salt, iv, wrapped, iter: PBKDF2_ITER, fails: 0, until: 0, pinEm: new Date().toISOString() };
  }

  // Abre a DEK com o PIN, contando erros e aplicando o bloqueio progressivo.
  async function unlockEntry(profId, pin) {
    if (tentando) throw new Error('Aguarde a verificação anterior.');
    tentando = true;
    try {
      const k = await db.get('keys', profId);
      if (!k) throw new Error('Profissional sem acesso configurado.');
      const wait = lockRemaining(k);
      if (wait > 0) throw new Error(`Acesso bloqueado por segurança. Tente de novo em ${Math.ceil(wait / 1000)} s.`);
      try {
        const kek = await deriveKEK(pin, k.salt, k.iter);
        const dek = await unwrapDEK(k.wrapped, k.iv, kek);
        if (k.fails || k.until) { k.fails = 0; k.until = 0; await db.put('keys', k); }
        return dek;
      } catch {
        k.fails = (k.fails || 0) + 1;
        if (k.fails >= MAX_FREE) k.until = Date.now() + Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (k.fails - MAX_FREE));
        await db.put('keys', k);
        const left = MAX_FREE - k.fails;
        throw new Error(left > 0 ? `PIN incorreto. Restam ${left} tentativa${left > 1 ? 's' : ''} antes do bloqueio.` : `PIN incorreto. Acesso bloqueado por ${Math.ceil((k.until - Date.now()) / 1000)} s.`);
      }
    } finally { tentando = false; }
  }

  async function decryptAll(dek, recs) {
    const out = new Map();
    let bad = 0;
    for (const r of recs) {
      try {
        const type = typeOf(r.id);
        const obj = await open(dek, r);
        if (!type || `${type}:${obj.id}` !== r.id) throw new Error('id');
        if (!out.has(type)) out.set(type, new Map());
        out.get(type).set(obj.id, deepFreeze(obj));
      } catch { bad++; }
    }
    return { out, bad };
  }

  // ---------- Sessão ----------
  async function isSetup() { return !!(await db.get('meta', 'vault')); }
  async function vaultInfo() { return db.get('meta', 'vault'); }
  async function listLogins() {
    const ks = await db.getAll('keys');
    return ks.map((k) => ({ id: k.id, nome: k.nome, sigla: k.sigla, cor: k.cor, until: k.until || 0, fails: k.fails || 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // Primeira configuração: cria a DEK, o estabelecimento e o administrador.
  async function setup(estNome, adminProf, pin, initialRecords) {
    if (await isSetup()) throw new Error('O Studio Agenda já está configurado neste aparelho.');
    const dek = await newDEK();
    const keyEntry = await writeKeyEntry(adminProf, pin, dek);
    const sealed = [];
    for (const r of initialRecords) sealed.push(await seal(dek, `${r.type}:${r.obj.id}`, r.type, r.obj));
    await db.atomic([
      { store: 'meta', val: { k: 'vault', v: 1, estNome, criadoEm: new Date().toISOString() } },
      { store: 'keys', val: keyEntry },
      ...sealed.map((s) => ({ store: 'recs', val: s })),
    ]);
  }

  async function login(profId, pin) {
    const dek = await unlockEntry(profId, pin);
    const { out, bad } = await decryptAll(dek, await db.getAll('recs'));
    const prof = out.get('prof')?.get(profId);
    if (!prof || prof.ativo === false) throw new Error('Este profissional está inativo.');
    cache.clear();
    for (const [t, m] of out) cache.set(t, m);
    integrityErrors = bad;
    DEK = dek; USER_ID = profId;
    return prof;
  }

  // Apaga a chave e os dados da memória. Quem chama deve recarregar a página para descartar o resto.
  function lock() { DEK = null; USER_ID = null; cache.clear(); }

  // ---------- Repositório (registros decifrados em memória) ----------
  const all = (type) => [...(cache.get(type)?.values() || [])];
  const get = (type, id) => cache.get(type)?.get(id) || null;

  // Gravação atômica cifrada. ops:
  //   { put: type, obj } | { del: type, id }                   registros
  //   { putKey: prof, pin } | { delKey: profId } | { keyLabel: prof }   acesso por PIN
  async function commit(ops) {
    exigeSessao();
    const dbOps = [];
    for (const o of ops) {
      if (o.put) dbOps.push({ store: 'recs', val: await seal(DEK, `${o.put}:${o.obj.id}`, o.put, o.obj) });
      else if (o.del) dbOps.push({ store: 'recs', del: true, key: `${o.del}:${o.id}` });
      else if (o.putKey) dbOps.push({ store: 'keys', val: await writeKeyEntry(o.putKey, o.pin) });
      else if (o.delKey) dbOps.push({ store: 'keys', del: true, key: o.delKey });
      else if (o.keyLabel) {
        const k = await db.get('keys', o.keyLabel.id);
        if (k) dbOps.push({ store: 'keys', val: { ...k, nome: o.keyLabel.nome, sigla: o.keyLabel.sigla, cor: o.keyLabel.cor } });
      }
    }
    await db.atomic(dbOps);
    for (const o of ops) {
      if (o.put) { if (!cache.has(o.put)) cache.set(o.put, new Map()); cache.get(o.put).set(o.obj.id, deepFreeze(structuredClone(o.obj))); }
      else if (o.del) cache.get(o.del)?.delete(o.id);
    }
  }

  // ---------- Chaves ----------
  async function hasLogin(profId) { exigeSessao(); return !!(await db.get('keys', profId)); }
  // Confere o PIN de quem está na sessão, com o mesmo contador de tentativas do login.
  async function verifyPin(pin) { exigeSessao(); await unlockEntry(USER_ID, pin); return true; }

  // Troca a chave dos dados (DEK): recifra tudo com uma chave nova e deixa acesso só para quem está na sessão.
  // Depois disso, PINs antigos, cópias do banco e backups antigos não abrem os dados novos.
  async function rotateDEK(pin) {
    exigeSessao();
    await unlockEntry(USER_ID, pin);
    const me = get('prof', USER_ID);
    const dek = await newDEK();
    const ops = [];
    for (const [type, m] of cache) for (const obj of m.values()) ops.push({ store: 'recs', val: await seal(dek, `${type}:${obj.id}`, type, obj) });
    ops.push({ store: 'keys', val: await writeKeyEntry(me, pin, dek) });
    const removidos = (await db.getAll('keys')).filter((k) => k.id !== USER_ID).length;
    await db.replace(['recs', 'keys'], ops);
    DEK = dek;
    integrityErrors = 0;
    return removidos;
  }

  // ---------- Backup (continua cifrado: só abre com o PIN de quem estava no aparelho) ----------
  async function exportBackup() {
    exigeSessao();
    const [recs, keys, meta] = await Promise.all([db.getAll('recs'), db.getAll('keys'), db.getAll('meta')]);
    return JSON.stringify({
      formato: 'studio-agenda-backup', v: 1, geradoEm: new Date().toISOString(),
      meta,
      keys: keys.map((k) => ({ ...k, salt: toB64(k.salt), iv: toB64(k.iv), wrapped: toB64(k.wrapped) })),
      recs: recs.map((r) => ({ id: r.id, type: r.type, iv: toB64(r.iv), ct: toB64(r.ct) })),
    });
  }

  // Restaura só se o PIN informado abrir o backup e todos os registros passarem na verificação de integridade.
  // A troca é feita numa única transação: se falhar, os dados atuais continuam como estavam.
  async function importBackup(text, pin) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('O arquivo não é um backup válido.'); }
    if (data?.formato !== 'studio-agenda-backup' || !Array.isArray(data.recs) || !Array.isArray(data.keys) || !data.keys.length) throw new Error('O arquivo não é um backup do Studio Agenda.');
    let keys, recs, meta;
    try {
      keys = data.keys.map((k) => ({ id: String(k.id), nome: String(k.nome || ''), sigla: String(k.sigla || ''), cor: String(k.cor || ''), salt: fromB64(k.salt), iv: fromB64(k.iv), wrapped: fromB64(k.wrapped), iter: Number(k.iter) || PBKDF2_ITER, fails: 0, until: 0, pinEm: k.pinEm || null }));
      recs = data.recs.map((r) => ({ id: String(r.id), type: typeOf(r.id), iv: fromB64(r.iv), ct: fromB64(r.ct) }));
      meta = (data.meta || []).filter((m) => m && m.k === 'vault').map((m) => ({ k: 'vault', v: Number(m.v) || 1, estNome: String(m.estNome || ''), criadoEm: m.criadoEm || null }));
    } catch { throw new Error('O arquivo de backup está corrompido.'); }
    if (!meta.length) throw new Error('O arquivo de backup está incompleto.');
    let dek = null;
    for (const k of keys) {
      if (!(k.iter >= 100000)) continue;
      try { dek = await unwrapDEK(k.wrapped, k.iv, await deriveKEK(pin, k.salt, k.iter)); break; } catch { /* outro profissional */ }
    }
    if (!dek) throw new Error('Esse PIN não abre o backup. Use o PIN de um profissional que existia na data do backup.');
    const { bad } = await decryptAll(dek, recs);
    if (bad) throw new Error(`O backup tem ${bad} registro(s) adulterado(s) ou corrompido(s). Nada foi alterado.`);
    await db.replace(['recs', 'keys', 'meta'], [
      ...meta.map((m) => ({ store: 'meta', val: m })),
      ...keys.map((k) => ({ store: 'keys', val: k })),
      ...recs.map((r) => ({ store: 'recs', val: r })),
    ]);
    lock();
  }

  async function wipe() { await db.wipeAll(); lock(); }

  return Object.freeze({
    isSetup, vaultInfo, listLogins, setup, login, lock, isUnlocked,
    userId: () => USER_ID, integrity: () => integrityErrors, lockRemaining,
    all, get, commit,
    hasLogin, verifyPin, rotateDEK,
    exportBackup, importBackup, wipe,
  });
}
