// Dinheiro: sempre centavos inteiros (RT-07). Formatação só na borda.
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (c) => BRL.format((c || 0) / 100);
export function parseMoney(str) {
  if (typeof str === 'number') return Math.round(str * 100);
  const s = String(str || '').replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  // Padrão brasileiro: "1.234,56", "12,5" e também "1.500" (ponto como separador de milhar).
  // Sem vírgula, ponto seguido de exatamente 3 dígitos é milhar; caso contrário vale como decimal ("12.5").
  let n;
  if (s.includes(',')) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ''));
  else n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}
export const centsToInput = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');
export const pct = (base, p) => Math.round(base * p / 100);
