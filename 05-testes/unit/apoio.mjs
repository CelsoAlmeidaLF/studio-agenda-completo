// Apoio aos testes unitários: banco em memória com a mesma interface do adaptador IndexedDB
// e uma aplicação montada com relógio fixo. Roda no Node (>= 20), sem navegador.
import { createCofreCifrado } from '../../04-pwa/js/adapters/out/cofre-cifrado.js';
import { createApp } from '../../04-pwa/js/application/app.js';

export function memDB() {
  const stores = { recs: new Map(), keys: new Map(), meta: new Map() };
  const keyOf = (store, val) => (store === 'meta' ? val.k : val.id);
  const clone = (v) => structuredClone(v);
  const api = {
    stores,
    async get(store, key) { const v = stores[store].get(key); return v ? clone(v) : undefined; },
    async getAll(store) { return [...stores[store].values()].map(clone); },
    async put(store, val) { stores[store].set(keyOf(store, val), clone(val)); },
    async del(store, key) { stores[store].delete(key); },
    async atomic(ops) { for (const o of ops) { if (o.del) stores[o.store].delete(o.key); else stores[o.store].set(keyOf(o.store, o.val), clone(o.val)); } },
    async wipeAll() { for (const s of Object.values(stores)) s.clear(); },
    async replace(clear, ops) { for (const s of clear) stores[s].clear(); await api.atomic(ops); },
  };
  return api;
}

export const PIN_ADMIN = '482916';

// Autenticador falso (porta Biometria): cada passkey tem um segredo PRF fixo de 32 bytes.
export function biometriaFalsa({ disponivel = true } = {}) {
  const segredos = new Map();
  const entregues = [];
  const b = {
    esquecidas: [], cancelar: false,
    async disponivel() { return disponivel; },
    async cadastrar(prof) {
      const credentialId = 'cred-' + (segredos.size + 1) + '-' + prof.id;
      segredos.set(credentialId, crypto.getRandomValues(new Uint8Array(32)));
      return { credentialId, prfSalt: 'c2FsdA==', secret: await b.liberar(credentialId) };
    },
    async liberar(credentialId) {
      if (b.cancelar) { const e = new Error('cancelado'); e.name = 'NotAllowedError'; throw e; }
      const s = segredos.get(credentialId);
      if (!s) throw new Error('passkey desconhecida');
      const copia = new Uint8Array(s); entregues.push(copia); return copia;
    },
    esquecer(id) { b.esquecidas.push(id); },
    trocarSegredo(id) { segredos.set(id, crypto.getRandomValues(new Uint8Array(32))); },
    entregues,
  };
  return b;
}

export function montar({ agora = new Date(2026, 9, 22, 10, 0), biometria = biometriaFalsa() } = {}) {
  const db = memDB();
  const cofre = createCofreCifrado({ db });
  let n = 0;
  const app = createApp({ cofre, relogio: { agora: () => agora }, ids: { novo: () => `id${++n}-${Math.random().toString(36).slice(2, 8)}` }, biometria });
  return { db, cofre, app, biometria };
}

// Configura com dados de exemplo e entra como administrador.
export async function prontoComoAdmin(opcoes) {
  const m = montar(opcoes);
  const adminId = await m.app.configurar({ estNome: 'Studio Teste', adminNome: 'Patrícia Souza', pin: PIN_ADMIN, comExemplos: true });
  await m.app.entrar(adminId, PIN_ADMIN);
  const byNome = (nome) => m.app.profs(true).find((p) => p.nome === nome);
  return { ...m, adminId, byNome };
}

// Troca de usuário: bloqueia e entra com outro PIN.
export async function entrarComo(m, profId, pin) { m.app.bloquear(); return m.app.entrar(profId, pin); }
