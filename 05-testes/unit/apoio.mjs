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

export function montar({ agora = new Date(2026, 9, 22, 10, 0) } = {}) {
  const db = memDB();
  const cofre = createCofreCifrado({ db });
  let n = 0;
  const app = createApp({ cofre, relogio: { agora: () => agora }, ids: { novo: () => `id${++n}-${Math.random().toString(36).slice(2, 8)}` } });
  return { db, cofre, app };
}

// Configura com dados de exemplo e entra como administrador.
export async function prontoComoAdmin() {
  const m = montar();
  const adminId = await m.app.configurar({ estNome: 'Studio Teste', adminNome: 'Patrícia Souza', pin: PIN_ADMIN, comExemplos: true });
  await m.app.entrar(adminId, PIN_ADMIN);
  const byNome = (nome) => m.app.profs(true).find((p) => p.nome === nome);
  return { ...m, adminId, byNome };
}

// Troca de usuário: bloqueia e entra com outro PIN.
export async function entrarComo(m, profId, pin) { m.app.bloquear(); return m.app.entrar(profId, pin); }
