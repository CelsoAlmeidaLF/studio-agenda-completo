// Domínio da agenda: status, horário de funcionamento e conflitos (RN-01 a RN-07).
import { toMin, fromMin, weekday } from '../shared/datas.js';

// ---------- Status do item (RN-06) ----------
export const STATUS = {
  marcado: { nome: 'Marcado', cor: '#1eaee8' },
  confirmado: { nome: 'Confirmado', cor: '#5b73c4' },
  espera: { nome: 'Em espera', cor: '#d9a800' },
  iniciado: { nome: 'Iniciado', cor: '#7cb342' },
  atrasado: { nome: 'Atrasado', cor: '#f08a24' },
  cancelado: { nome: 'Cancelado', cor: '#7d7f86' },
  pago: { nome: 'Pago', cor: '#16a34a' },
};
const TRANS = {
  marcado: ['confirmado', 'espera', 'atrasado', 'iniciado', 'cancelado'],
  confirmado: ['marcado', 'espera', 'atrasado', 'iniciado', 'cancelado'],
  espera: ['confirmado', 'iniciado', 'atrasado', 'cancelado'],
  atrasado: ['confirmado', 'espera', 'iniciado', 'cancelado'],
  iniciado: ['confirmado', 'cancelado'],
  cancelado: ['marcado'],
  pago: [],
};
export const nextStatuses = (s) => TRANS[s] || [];
export const isActive = (it) => it.status !== 'cancelado';
export const ehProduto = (it) => it?.tipo === 'produto';

// ---------- Horário de funcionamento (RN-03, RN-04) ----------
export const DEFAULT_HORARIO = { 0: [], 1: [], 2: [['08:00', '19:00']], 3: [['08:00', '19:00']], 4: [['08:00', '19:00']], 5: [['08:00', '19:00']], 6: [['08:00', '18:00']] };
export const SLOTS = [15, 30, 60];

export function intervalsOf(est, date) { return (est.horario?.[weekday(date)] || []).map(([a, b]) => [toMin(a), toMin(b)]); }

export function dayBounds(est, date) {
  const iv = intervalsOf(est, date);
  if (!iv.length) return [toMin('08:00'), toMin('19:00'), true];
  return [Math.min(...iv.map((i) => i[0])), Math.max(...iv.map((i) => i[1])), false];
}

export function withinOpening(est, date, start, end) {
  return intervalsOf(est, date).some(([a, b]) => start >= a && end <= b);
}

export const overlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

// RN-02 e RN-03: devolve mensagem de problema ou null
export function scheduleProblem({ est, items, bloqueios, item, nomeDe }) {
  const s = toMin(item.hora), e = s + item.duracao;
  if (!withinOpening(est, item.data, s, e)) {
    const iv = intervalsOf(est, item.data);
    return iv.length ? `Fora do horário de funcionamento (${iv.map(([a, b]) => `${fromMin(a)}–${fromMin(b)}`).join(', ')}).` : 'O estabelecimento está fechado neste dia.';
  }
  for (const b of bloqueios) {
    if (b.profId !== item.profId || b.data !== item.data) continue;
    if (overlap(s, e, toMin(b.inicio), toMin(b.fim))) return `${nomeDe(item.profId)} tem um bloqueio (${b.motivo || 'ausência'}) das ${b.inicio} às ${b.fim}.`;
  }
  for (const o of items) {
    // Produto vendido não ocupa horário (RN-56).
    if (o.tipo === 'produto' || o.id === item.id || o.profId !== item.profId || o.data !== item.data || !isActive(o)) continue;
    const os = toMin(o.hora), oe = os + o.duracao;
    if (overlap(s, e, os, oe)) return `${nomeDe(item.profId)} já tem um atendimento às ${o.hora} (até ${fromMin(oe)}).`;
  }
  return null;
}
