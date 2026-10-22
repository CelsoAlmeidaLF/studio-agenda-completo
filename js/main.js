// Raiz de composição (arquitetura hexagonal): cria os adaptadores de saída, monta a aplicação
// e entrega o resultado às telas (adaptador de entrada). Também cuida da guarda de rotas, do menu,
// do bloqueio por inatividade, da instância única e do service worker.
// Nada aqui é exportado: a aplicação montada fica só neste escopo e nas telas que a receberam.
import * as db from './adapters/out/indexeddb.js';
import { createCofreCifrado } from './adapters/out/cofre-cifrado.js';
import { relogioDoSistema, idsAleatorios } from './adapters/out/relogio.js';
import { createBiometriaWebAuthn } from './adapters/out/biometria-webauthn.js';
import { createApp } from './application/app.js';
import { can } from './domain/permissoes.js';
import { h, icon } from './adapters/in/ui/dom.js';
import { render, go, current, setNav, closeDrawer, toast, avatar } from './adapters/in/ui/kit.js';
import { registerAuth } from './adapters/in/ui/telas/auth.js';
import { registerAgenda } from './adapters/in/ui/telas/agenda.js';
import { registerComanda } from './adapters/in/ui/telas/comanda.js';
import { registerClientes } from './adapters/in/ui/telas/clientes.js';
import { registerEquipe } from './adapters/in/ui/telas/equipe.js';
import { registerFinanceiro } from './adapters/in/ui/telas/financeiro.js';
import { registerGestao } from './adapters/in/ui/telas/gestao.js';

const VERSAO = '1.4.0';
const PUBLIC = new Set(['setup', 'login']);

const app = createApp({ cofre: createCofreCifrado({ db }), relogio: relogioDoSistema, ids: idsAleatorios, biometria: createBiometriaWebAuthn({ nomeApp: 'Studio Agenda' }) });

// Bloquear apaga a chave da memória; recarregar a página descarta o resto (telas, rascunhos).
function bloquear() { app.bloquear(); location.reload(); }

registerAuth(app, { onLogin: () => { startIdleLock(); const r = current(); go(PUBLIC.has(r.name) ? 'agenda' : r.name, PUBLIC.has(r.name) ? {} : r.params); } });
registerAgenda(app); registerComanda(app); registerClientes(app); registerEquipe(app); registerFinanceiro(app); registerGestao(app);

setNav(() => {
  if (!app.desbloqueado()) return null;
  const me = app.me(), e = app.est();
  const r = current().name;
  const item = (name, label, ic, show = true) => show ? h('button', { class: 'nav-i' + (r === name ? ' on' : ''), 'aria-current': r === name ? 'page' : null, onclick: () => { closeDrawer(); go(name); } }, icon(ic, 24), h('span', null, label)) : null;
  return h('nav', { class: 'nav', 'aria-label': 'Menu principal' },
    h('div', { class: 'nav-h' }, h('div', { class: 'acts-row' }, avatar(me, 52), h('div', null, h('b', null, me.nome), h('small', null, me.area))), h('b', { class: 'est' }, e.nome)),
    item('agenda', 'Agenda', 'agenda', can(me, 'agenda.ver', { profId: me.id })),
    item('financeiro', 'Financeiro', 'money', can(me, 'caixa.ver') || can(me, 'relatorios') || can(me, 'equipe.ver', { profId: me.id })),
    item('clientes', 'Clientes', 'clientes'),
    item('equipe', 'Equipe', 'equipe', can(me, 'equipe.ver', { profId: me.id }) || can(me, 'equipe.ver', {})),
    item('gestao', 'Gestão', 'gestao'),
    h('hr'),
    h('button', { class: 'nav-i lock', onclick: bloquear }, icon('lock', 24), h('span', null, 'Bloquear agora')),
    h('small', { class: 'ver' }, `Studio Agenda v${VERSAO}`));
});

// ---------- Guarda de rotas ----------
async function guard() {
  const { name } = current();
  if (!(await app.estaConfigurado())) { if (name !== 'setup') { location.hash = '#/setup'; return; } }
  else if (!app.desbloqueado()) { if (name !== 'login') { location.hash = '#/login'; return; } }
  else if (PUBLIC.has(name)) { location.hash = '#/agenda'; return; }
  render();
}

// ---------- Bloqueio automático por inatividade (RNF-15) ----------
let last = Date.now(), timer = null;
function startIdleLock() {
  last = Date.now();
  const bump = () => { last = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((ev) => addEventListener(ev, bump, { passive: true }));
  clearInterval(timer);
  timer = setInterval(check, 10000);
  document.addEventListener('visibilitychange', check);
}
function check() {
  if (!app.desbloqueado()) return;
  const min = app.est()?.lockMin || 5;
  if (Date.now() - last > min * 60000) bloquear();
}

// ---------- Instância única ----------
// Duas abas abertas teriam caches separados e poderiam gravar por cima uma da outra
// (ex.: números de fechamento repetidos). A trava do navegador garante uma aba ativa por vez.
function instanciaUnica() {
  if (!navigator.locks?.request) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request('studio-agenda-instancia', { ifAvailable: true }, (lock) => {
      resolve(!!lock);
      return lock ? new Promise(() => {}) : undefined; // segura a trava enquanto a página existir
    }).catch(() => resolve(true));
  });
}
function telaOutraAba() {
  return h('div', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('agenda', 30)), h('div', null, h('b', null, 'Studio Agenda'), h('small', null, 'Já está aberto'))),
    h('p', null, 'O Studio Agenda já está aberto em outra aba ou janela deste aparelho. Para proteger os dados, só uma pode ficar aberta por vez.'),
    h('button', { class: 'btn pri block with-ic', onclick: () => location.reload() }, icon('refresh', 20), 'Fechei a outra, tentar de novo')));
}

// ---------- Service worker (PWA offline) ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const b = h('button', { class: 'update', onclick: () => { nw.postMessage('skipWaiting'); } }, 'Nova versão disponível. Toque para atualizar.');
          document.body.append(b);
        }
      });
    });
  }).catch(() => {});
  // Só recarrega quando uma versão nova substitui outra (não na primeira instalação).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}

if (!window.isSecureContext || !crypto?.subtle) {
  document.getElementById('app').replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-card' }, h('b', { class: 'big' }, 'Conexão não segura'), h('p', null, 'O Studio Agenda precisa ser aberto em HTTPS (ou em localhost) para usar a criptografia do navegador.'))));
} else {
  instanciaUnica().then((ok) => {
    if (!ok) { document.getElementById('app').replaceChildren(telaOutraAba()); return; }
    window.addEventListener('hashchange', guard);
    guard().catch((e) => toast(e.message));
  });
}
