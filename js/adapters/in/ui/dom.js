// DOM seguro (sem innerHTML) e ícones SVG no traço Lucide (24x24, currentColor, pontas arredondadas).
// Constrói elementos só com textContent/atributos: nenhum dado do usuário vira HTML (anti-XSS).
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const c of [kids].flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

const SVGNS = 'http://www.w3.org/2000/svg';
const ICONS = {
  menu: ['M3 6h18M3 12h18M3 18h18'],
  back: ['M20 12H4M10 6l-6 6 6 6'],
  close: ['M6 6l12 12M18 6L6 18'],
  plus: ['M12 5v14M5 12h14'],
  left: ['M15 6l-6 6 6 6'],
  right: ['M9 6l6 6-6 6'],
  down: ['M6 9l6 6 6-6'],
  up: ['M6 15l6-6 6 6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  agenda: ['M3 9h18M8 2.5v4M16 2.5v4', 'M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v11.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V7a2.5 2.5 0 0 1 2.5-2.5z'],
  list: ['M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01'],
  money: ['M12 3v18M16.5 7.5c-.6-1.6-2.4-2.5-4.5-2.5-2.5 0-4.5 1.3-4.5 3.4 0 4.6 9.5 2.3 9.5 7.1 0 2-2 3.5-4.8 3.5-2.4 0-4.4-1-5-2.8'],
  clientes: ['M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c.9-4 3.6-6 7-6s6.1 2 7 6'],
  equipe: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.5 3 5.2'],
  gestao: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'],
  chart: ['M3 4v16h18M8 16v-4M12 16V8M16 16v-6M20 16V6'],
  lock: ['M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9M10 19a2 2 0 0 0 4 0'],
  scissors: ['M8.5 8.5 20 19M8.5 15.5 20 5M6 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  whats: ['M4 19.5 5.3 16A8 8 0 1 1 8 18.7z'],
  edit: ['M4 20h4L19 9l-4-4L4 16z'],
  trash: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'],
  search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.5-4.5'],
  shield: ['M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z'],
  filter: ['M3 4h18l-7 8.5V20l-4-2v-5.5z'],
  in: ['M12 5v13M6 13l6 6 6-6'],
  out: ['M12 19V6M6 11l6-6 6 6'],
  cart: ['M3 4h2.5l2.2 10.5h10.8L21 7H6.6', 'M9.5 19.5a1.2 1.2 0 1 0 0-.01M17 19.5a1.2 1.2 0 1 0 0-.01'],
  box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5 8-4.5M12 12v9'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.5h.01'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
  key: ['M15.5 7.5l3 3M21 2l-9.6 9.6M15.5 7.5L19 4M7.5 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z'],
  fingerprint: ['M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4', 'M14 13.12c0 2.38 0 6.38-1 8.88', 'M17.29 21.02c.12-.6.43-2.3.5-3.02', 'M2 12a10 10 0 0 1 18-6', 'M2 16h.01', 'M21.8 16c.2-2 .131-5.354 0-6', 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2', 'M8.65 22c.21-.66.45-1.32.57-2', 'M9 6.8a6 6 0 0 1 9 5.2v2'],
  refresh: ['M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5'],
};
export function icon(name, size = 22, cls = '') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'ic ' + cls);
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}
