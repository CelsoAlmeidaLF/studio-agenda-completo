// Casos de uso de produtos: cadastro, comissão de venda e venda na comanda (RN-54 a RN-60).
import { UNIDADES_CONSUMO, QTD_MAX_PRODUTO } from '../../domain/financeiro.js';
import { isData, isCentavos, isCelular } from '../../domain/validacao.js';
import { clip, onlyDigits } from '../../shared/texto.js';
import { money } from '../../shared/money.js';
import { fromMin } from '../../shared/datas.js';

export function casosProdutos(ctx, d) {
  const R = ctx.cofre;
  const { need, audit, uid, agoraISO, est } = ctx;

  return {
    async salvarProduto(p) {
      need('gestao.itens');
      const atual = p.id ? R.get('prod', p.id) : null;
      if (p.id && !atual) throw new Error('Produto não encontrado.');
      const nome = clip(p.nome ?? atual?.nome, 80);
      if (!nome) throw new Error('Informe o nome do produto.');
      const consumo = { ...(atual?.consumo || { unidade: 'Unidades', precoInterno: 0, precoProf: 0 }), ...(p.consumo || {}) };
      const venda = { ...(atual?.venda || { ativo: false, preco: 0 }), ...(p.venda || {}) };
      for (const v of [consumo.precoInterno, consumo.precoProf, venda.preco]) if (!isCentavos(v)) throw new Error('Preço inválido.');
      if (!UNIDADES_CONSUMO.includes(consumo.unidade)) throw new Error('Unidade de consumo inválida.');
      venda.ativo = !!venda.ativo;
      if (venda.ativo && venda.preco <= 0) throw new Error('Informe o preço de venda para ativar a venda.');
      const e = est();
      const ops = [];
      let codigo = atual?.codigo;
      if (!atual) { codigo = (e.seqProd || 0) + 1; ops.push({ put: 'est', obj: { ...e, seqProd: codigo } }); }
      const obj = {
        comissoes: {}, criadoEm: agoraISO(), criadoPor: R.userId(), ...(atual || {}),
        id: p.id || uid(), codigo, nome, categoria: clip(p.categoria ?? atual?.categoria, 40) || 'Geral',
        ativo: atual ? atual.ativo !== false : true,
        consumo: { unidade: consumo.unidade, precoInterno: consumo.precoInterno, precoProf: consumo.precoProf },
        venda: { ativo: venda.ativo, preco: venda.preco },
        alteradoEm: agoraISO(), alteradoPor: R.userId(),
      };
      ops.push({ put: 'prod', obj }, audit(atual ? 'Editou produto' : 'Criou produto', nome, venda.ativo ? `venda ${money(venda.preco)}` : 'sem venda'));
      await R.commit(ops);
      return obj;
    },
    async salvarComissaoProduto(prodId, profId, pctVal) {
      need('gestao.itens');
      const prod = R.get('prod', prodId);
      if (!prod) throw new Error('Produto não encontrado.');
      if (!R.get('prof', profId)) throw new Error('Profissional não encontrado.');
      const n = Number(pctVal);
      if (!(Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error('A comissão deve estar entre 0 e 100%.');
      const comissoes = { ...(prod.comissoes || {}) };
      if (n > 0) comissoes[profId] = n; else delete comissoes[profId];
      await R.commit([{ put: 'prod', obj: { ...prod, comissoes, alteradoEm: agoraISO(), alteradoPor: R.userId() } }, audit('Alterou comissão de venda', prod.nome, `${ctx.nomeProf(profId)}: ${n}%`)]);
    },
    // Ativo/inativo: produto não é excluído (RN-54).
    async alternarProduto(prodId) {
      need('gestao.itens');
      const prod = R.get('prod', prodId);
      if (!prod) throw new Error('Produto não encontrado.');
      const ativo = prod.ativo === false;
      await R.commit([{ put: 'prod', obj: { ...prod, ativo, alteradoEm: agoraISO(), alteradoPor: R.userId() } }, audit(ativo ? 'Ativou produto' : 'Desativou produto', prod.nome)]);
    },

    // Venda de produto na comanda (aba Produto de "Adicionar à comanda"). Não ocupa horário (RN-56, RN-57).
    async venderProduto(input) {
      const prod = R.get('prod', input.prodId), prof = R.get('prof', input.profId);
      if (!prod || prod.ativo === false || !prod.venda?.ativo || !(prod.venda.preco > 0)) throw new Error('Escolha um produto disponível para venda.');
      if (!prof || prof.ativo === false) throw new Error('Escolha quem está vendendo.');
      need('produto.vender', { profId: prof.id }, `Você não pode lançar produtos para ${prof.nome}.`);
      const qtd = Number(input.qtd);
      if (!(Number.isInteger(qtd) && qtd >= 1 && qtd <= QTD_MAX_PRODUTO)) throw new Error(`Quantidade deve ser de 1 a ${QTD_MAX_PRODUTO}.`);
      const atual = input.itemId ? R.get('item', input.itemId) : null;
      if (input.itemId && !atual) throw new Error('Item não encontrado.');
      if (atual) {
        if (atual.tipo !== 'produto') throw new Error('Este item é um serviço. Edite pelo agendamento.');
        need('produto.vender', { profId: atual.profId }, 'Você não pode alterar este produto na comanda.');
        if (atual.status === 'pago') throw new Error('Este item já foi pago. Anule o fechamento para editar.');
      }
      const data = atual?.data || input.data || ctx.hoje();
      if (!isData(data)) throw new Error('Data inválida.');
      const ops = [];
      let cliId = input.cliId || null, avulso = null;
      if (!atual) {
        if (input.novoNome) {
          need('cliente.criar', {}, 'Você não tem permissão para cadastrar clientes.');
          const cel = onlyDigits(input.novoCel);
          if (cel && !isCelular(cel)) throw new Error('Celular inválido. Use DDD + número.');
          const nc = { id: uid(), nome: clip(input.novoNome, 80), cel, email: '', obs: '', ativo: true, criadoEm: agoraISO(), favoritos: [] };
          if (!nc.nome) throw new Error('Informe o nome do cliente.');
          if (d.celularEmUso(nc.cel)) throw new Error('Já existe um cliente com este celular.');
          ops.push({ put: 'cli', obj: nc }, audit('Criou cliente', nc.nome));
          cliId = nc.id;
        } else if (cliId) {
          const c = R.get('cli', cliId);
          if (!c || c.ativo === false) throw new Error('Escolha um cliente ativo.');
        } else avulso = clip(input.avulso, 80) || 'Cliente avulso';
      }
      let comanda = atual ? R.get('comanda', atual.comandaId) : null;
      if (!comanda && cliId) comanda = R.all('comanda').find((c) => c.cliId === cliId && c.data === data && c.status === 'aberta');
      if (!comanda) { comanda = { id: uid(), cliId, avulso, data, status: 'aberta', fechId: null, criadaEm: agoraISO() }; ops.push({ put: 'comanda', obj: comanda }); }
      if (comanda.status !== 'aberta') throw new Error('A comanda já foi fechada. Anule o fechamento para adicionar itens.');
      const agora = ctx.relogio.agora();
      const item = {
        ...(atual || { id: uid(), criadoPor: R.userId(), criadoEm: agoraISO(), hora: data === ctx.hoje() ? fromMin(agora.getHours() * 60 + agora.getMinutes()) : '12:00', notificado: true }),
        tipo: 'produto', prodId: prod.id, srvId: null, nome: prod.nome, qtd, unit: prod.venda.preco, preco: prod.venda.preco * qtd, duracao: 0,
        cliId: comanda.cliId, avulso: comanda.avulso, data: comanda.data, profId: prof.id, status: 'confirmado', comandaId: comanda.id, nota: clip(input.nota, 300),
      };
      ops.push({ put: 'item', obj: item }, audit(atual ? 'Editou produto na comanda' : 'Vendeu produto', `${qtd}× ${prod.nome}`, `${d.nomeCliente(comanda)} · ${prof.nome} · ${money(item.preco)}`));
      await R.commit(ops);
      return item;
    },
  };
}
