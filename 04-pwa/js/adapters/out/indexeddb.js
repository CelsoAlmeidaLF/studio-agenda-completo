// Adaptador de persistência: IndexedDB (banco nativo do navegador).
// Guarda apenas: registros cifrados (recs), chaves embrulhadas por profissional (keys) e metadados (meta).

const DB_NAME = 'studio-agenda';
const DB_VER = 1;
let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recs')) db.createObjectStore('recs', { keyPath: 'id' }).createIndex('type', 'type');
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Feche as outras abas do Studio Agenda e tente de novo.'));
  });
  return dbp;
}

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Transação cancelada')); });
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function getAll(store) {
  const db = await openDB();
  return reqP(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await openDB();
  return reqP(db.transaction(store).objectStore(store).get(key));
}
export async function put(store, val) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(val);
  return done(tx);
}
export async function del(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

// Escrita atômica: tudo ou nada (fechamento + pagamentos + caixa + comissões + auditoria).
export async function atomic(ops) {
  const db = await openDB();
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const o of ops) {
    const s = tx.objectStore(o.store);
    if (o.del) s.delete(o.key); else s.put(o.val);
  }
  return done(tx);
}

export async function wipeAll() {
  const db = await openDB();
  const tx = db.transaction(['recs', 'keys', 'meta'], 'readwrite');
  tx.objectStore('recs').clear(); tx.objectStore('keys').clear(); tx.objectStore('meta').clear();
  return done(tx);
}

// Substitui o conteúdo de algumas stores numa única transação (restaurar backup, trocar a chave dos dados).
// Se qualquer gravação falhar, nada é apagado.
export async function replace(clearStores, ops) {
  const db = await openDB();
  const stores = [...new Set([...clearStores, ...ops.map((o) => o.store)])];
  const tx = db.transaction(stores, 'readwrite');
  for (const s of clearStores) tx.objectStore(s).clear();
  for (const o of ops) tx.objectStore(o.store).put(o.val);
  return done(tx);
}
