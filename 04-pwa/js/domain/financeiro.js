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
// Serviço: % padrão do profissional. Produto: % de venda definido no produto para aquele profissional, 0% por padrão (RN-58).
export const pctComissao = (item, prof, prod) => (item.tipo === 'produto' ? Number(prod?.comissoes?.[item.profId] || 0) : Number(prof?.comissao || 0));

// ---------- Produtos (RN-54 a RN-60) ----------
export const UNIDADES_CONSUMO = ['Unidades', 'Mililitros', 'Gramas'];
export const QTD_MAX_PRODUTO = 99;

export const TIPOS_LANC_CAIXA = ['entrada', 'saida'];
export const TIPOS_LANC_CLIENTE = ['credito', 'debito'];
export const TIPOS_LANC_PROF = { recibo: 'Recibo', adiantamento: 'Adiantamento', credito: 'Outros (crédito)', debito: 'Outros (débito)' };
