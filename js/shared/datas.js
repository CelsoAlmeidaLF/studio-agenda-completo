// Datas puras. A "data de negócio" é yyyy-mm-dd no fuso do aparelho (esperado America/Sao_Paulo).
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const toMin = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const weekday = (s) => parseDate(s).getDay(); // 0 = domingo
export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const fmtDate = (s, opt = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  parseDate(s).toLocaleDateString('pt-BR', opt).replace('.', '');
export function relDay(s) {
  const t = today();
  if (s === t) return 'Hoje';
  if (s === addDays(t, 1)) return 'Amanhã';
  if (s === addDays(t, -1)) return 'Ontem';
  return parseDate(s).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
}
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
