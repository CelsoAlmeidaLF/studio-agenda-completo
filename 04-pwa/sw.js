// Service worker: guarda só os arquivos do app (shell) para funcionar offline.
// Os dados NUNCA passam por aqui: ficam no IndexedDB, criptografados.
const VERSION = 'studio-agenda-v1.1.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/adapters/in/ui/base.js',
  './js/adapters/in/ui/dom.js',
  './js/adapters/in/ui/kit.js',
  './js/adapters/in/ui/telas/agenda.js',
  './js/adapters/in/ui/telas/auth.js',
  './js/adapters/in/ui/telas/clientes.js',
  './js/adapters/in/ui/telas/comanda.js',
  './js/adapters/in/ui/telas/equipe.js',
  './js/adapters/in/ui/telas/financeiro.js',
  './js/adapters/in/ui/telas/gestao.js',
  './js/adapters/out/cofre-cifrado.js',
  './js/adapters/out/indexeddb.js',
  './js/adapters/out/relogio.js',
  './js/adapters/out/webcrypto.js',
  './js/application/app.js',
  './js/application/casos/agenda.js',
  './js/application/casos/consultas.js',
  './js/application/casos/dados.js',
  './js/application/casos/financeiro.js',
  './js/application/casos/gestao.js',
  './js/application/casos/sessao.js',
  './js/application/contexto.js',
  './js/application/erros.js',
  './js/application/ports.js',
  './js/domain/agenda.js',
  './js/domain/equipe.js',
  './js/domain/financeiro.js',
  './js/domain/permissoes.js',
  './js/domain/pin.js',
  './js/domain/validacao.js',
  './js/main.js',
  './js/shared/datas.js',
  './js/shared/money.js',
  './js/shared/texto.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// Cache primeiro para o shell (abre instantâneo e offline); só requisições do próprio app.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
