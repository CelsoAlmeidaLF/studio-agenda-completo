// Kit de interface: roteador por hash, menu, folhas, avisos e peças. Sem innerHTML: todo texto entra por textContent.
import { h, icon, clear } from './dom.js';
import { initials } from '../../../shared/texto.js';

// ---------- Roteador (hash) ----------
const routes = new Map();
export const route = (name, fn) => routes.set(name, fn);
export function go(name, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const target = `#/${name}${q ? '?' + q : ''}`;
  if (location.hash === target) render(); else location.hash = target;
}
export function current() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, q] = raw.split('?');
  return { name: name || 'agenda', params: Object.fromEntries(new URLSearchParams(q || '')) };
}
let navBuilder = () => null;
export const setNav = (fn) => { navBuilder = fn; };
export function render() {
  closeSheet();
  const { name, params } = current();
  const fn = routes.get(name) || routes.get('agenda');
  let scr;
  try { scr = fn(params); } catch (e) { scr = { title: 'Sem acesso', body: emptyState('shield', e.message || 'Algo deu errado.', '') }; console.error(e); }
  if (scr instanceof Promise) scr.then(paint).catch((e) => toast(e.message)); else paint(scr);
}
export const rerender = () => render();

// Telas largas (notebook e maiores): conteúdo em duas colunas e lista ao lado da ficha.
// O ponto de quebra é o mesmo do CSS (.content.largo, .duo, .split); ao cruzar, a tela é desenhada de novo.
const LARGA = typeof matchMedia === 'function' ? matchMedia('(min-width: 1200px)') : null;
export const telaLarga = () => !!LARGA?.matches;
LARGA?.addEventListener?.('change', () => { if (document.querySelector('.shell')) render(); });

function paint(scr) {
  const app = document.getElementById('app');
  clear(app);
  if (scr.bare) { app.append(scr.body); return; }
  const left = scr.back
    ? h('button', { class: 'hbtn', 'aria-label': 'Voltar', onclick: () => (typeof scr.back === 'function' ? scr.back() : typeof scr.back === 'string' ? go(scr.back) : history.length > 1 ? history.back() : go('agenda')) }, icon('back', 24))
    : h('button', { class: 'hbtn only-mobile', 'aria-label': 'Abrir menu', onclick: openDrawer }, icon('menu', 26));
  const header = h('header', { class: 'top' },
    left,
    h('div', { class: 'ttl' }, scr.sub ? h('small', null, scr.sub) : null, h('h1', null, scr.title)),
    h('div', { class: 'acts' }, scr.actions || []));
  const layout = scr.layout ? ' ' + scr.layout : '';
  const main = h('main', { class: 'content' + (scr.wide ? ' wide' : '') + layout }, scr.body);
  const nav = navBuilder();
  app.append(h('div', { class: 'shell' }, nav ? h('aside', { class: 'side' }, nav) : null, h('div', { class: 'page' }, header, main, scr.footer ? h('div', { class: 'foot' + layout }, scr.footer) : null)));
  if (scr.fab) app.append(h('button', { class: 'fab' + (scr.footer ? ' up' : ''), 'aria-label': scr.fab.label, onclick: scr.fab.onclick }, icon('plus', 28)));
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  scr.after?.(main);
}

// ---------- Drawer (menu lateral no celular) ----------
export function openDrawer() {
  const nav = navBuilder();
  if (!nav) return;
  const root = h('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu' },
    h('div', { class: 'scrim', onclick: closeDrawer }),
    h('div', { class: 'panel' }, nav));
  document.body.append(root);
  root.querySelector('a,button')?.focus();
}
export function closeDrawer() { document.querySelector('.drawer')?.remove(); }

// ---------- Folha (bottom sheet / modal) ----------
export function sheet(title, body, footer) {
  closeSheet();
  const root = h('div', { class: 'sheet-root', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'scrim', onclick: closeSheet }),
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-h' }, h('b', null, title), h('button', { class: 'hbtn', 'aria-label': 'Fechar', onclick: closeSheet }, icon('close', 22))),
      h('div', { class: 'sheet-b' }, body),
      footer ? h('div', { class: 'sheet-f' }, footer) : null));
  document.body.append(root);
  root.querySelector('input,select,textarea')?.focus();
  return root;
}
export function closeSheet() { document.querySelectorAll('.sheet-root').forEach((n) => n.remove()); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); closeDrawer(); } });

// ---------- Toast ----------
let tt;
export function toast(msg, ok = false) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast' + (ok ? ' good' : ''), role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(tt); tt = setTimeout(() => t.remove(), 3200);
}

// Executa ação assíncrona mostrando erro de forma amigável.
export async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg, true); return r; }
  catch (e) { toast(e.message || 'Não foi possível concluir.'); throw e; }
}

// Botão de confirmação em dois toques (sem confirm()).
export function dangerBtn(label, onConfirm, cls = 'btn danger') {
  const b = h('button', { class: cls, type: 'button' }, label);
  let armed = false, t;
  b.addEventListener('click', async () => {
    if (!armed) { armed = true; b.textContent = 'Toque de novo para confirmar'; t = setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
    clearTimeout(t); b.disabled = true;
    try { await onConfirm(); } finally { b.disabled = false; armed = false; b.textContent = label; }
  });
  return b;
}

// ---------- Peças ----------
export const avatar = (p, size = 32) => h('span', { class: 'av', style: { '--c': p?.cor || '#8b8e96', width: size + 'px', height: size + 'px', 'font-size': Math.round(size * 0.36) + 'px' } }, p?.sigla || initials(p?.nome));
export const pill = (txt, cor) => h('span', { class: 'pill', style: { '--sc': cor } }, txt);
export function emptyState(ic, title, txt) { return h('div', { class: 'empty' }, icon(ic, 56), h('b', null, title), txt ? h('p', null, txt) : null); }
export function field(label, input, hint) {
  const id = input.id || (input.id = 'f' + Math.random().toString(36).slice(2, 9));
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('small', null, hint) : null);
}
export const input = (attrs) => h('input', { class: 'inp', autocomplete: 'off', ...attrs });
export function select(options, value, attrs = {}) {
  return h('select', { class: 'inp', ...attrs }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t)));
}
export const sec = (title, ...kids) => h('section', { class: 'sec' }, title ? h('h2', null, title) : null, kids);
export const row = (...kids) => h('div', { class: 'row2' }, kids);
export function navRow(label, onclick, right) {
  return h('button', { class: 'navrow', onclick }, h('span', null, label), right || null, icon('right', 16, 'chev'));
}
export function tabs(items, active) {
  return h('nav', { class: 'tabs', role: 'tablist' }, items.map(([k, label, onclick]) => h('button', { role: 'tab', 'aria-selected': String(k === active), class: k === active ? 'on' : '', onclick }, label)));
}
