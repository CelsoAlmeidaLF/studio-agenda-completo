// Domínio financeiro: formas de pagamento, totais e comissão (RN-18, RN-21, RN-28).
import { pct } from '../shared/money.js';

export const FORMAS = {
  pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', credito_cliente: 'Crédito do cliente',
};
// Formas que movimentam o caixa (o crédito do cliente só mexe na conta corrente dele).
export const FORMAS_CAIXA = Object.keys(FORMAS).filter((k) => k !== 'credito_cliente');

export function comandaTotals(linhas, gorjeta = 0) {
  let bruto = 0, desc = 0;
  for (const l of linhas) { bruto += l.preco; desc += l.desconto || 0; }
  return { bruto, desc, gorjeta, total: bruto - desc + gorjeta };
}
export const comissao = (linha, pctProf) => pct(Math.max(0, linha.preco - (linha.desconto || 0)), pctProf);

export const TIPOS_LANC_CAIXA = ['entrada', 'saida'];
export const TIPOS_LANC_CLIENTE = ['credito', 'debito'];
export const TIPOS_LANC_PROF = { recibo: 'Recibo', adiantamento: 'Adiantamento', credito: 'Outros (crédito)', debito: 'Outros (débito)' };
