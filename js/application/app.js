// Monta a aplicação a partir das portas (cofre, relógio, ids). É a única entrada da interface.
// A raiz de composição (main.js) chama createApp e entrega o objeto às telas; nenhum módulo guarda
// ou exporta a instância, então ela não fica ao alcance de um import feito pelo console.
import { criarContexto } from './contexto.js';
import { dados } from './casos/dados.js';
import { consultas } from './casos/consultas.js';
import { casosSessao } from './casos/sessao.js';
import { casosGestao } from './casos/gestao.js';
import { casosAgenda } from './casos/agenda.js';
import { casosFinanceiro } from './casos/financeiro.js';
import { casosProdutos } from './casos/produtos.js';

export function createApp(portas) {
  const ctx = criarContexto(portas);
  const d = dados(ctx);
  return Object.freeze({
    ...consultas(ctx, d),
    ...casosSessao(ctx),
    ...casosGestao(ctx, d),
    ...casosAgenda(ctx, d),
    ...casosFinanceiro(ctx, d),
    ...casosProdutos(ctx, d),
  });
}
