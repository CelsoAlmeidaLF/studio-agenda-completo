// Texto puro: busca sem acento, siglas, telefone.
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
export function fmtPhone(s) {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || '';
}
export const clip = (s, n) => String(s ?? '').slice(0, n).trim();
// Telefone em E.164 sem o "+" (RT-22): acrescenta 55 quando vier só DDD + número.
export function e164(cel) {
  const n = onlyDigits(cel);
  if (!n) return '';
  return n.length <= 11 ? '55' + n : n;
}
