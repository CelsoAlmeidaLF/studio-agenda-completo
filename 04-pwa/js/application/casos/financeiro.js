// Casos de uso financeiros: caixa, fechamento, pagamento, anulação, contas correntes e relatórios (RN-17 a RN-36).
import { isActive } from '../../domain/agenda.js';
import { comandaTotals, comissao, FORMAS, FORMAS_CAIXA, TIPOS_LANC_CAIXA, TIPOS_LANC_CLIENTE, TIPOS_LANC_PROF } from '../../domain/financeiro.js';
import { isData, isMes, isCentavos, isPositivo } from '../../domain/validacao.js';
import { clip } from '../../shared/texto.js';
import { money } from '../../shared/money.js';
import { Denied, NeedCaixa } from '../erros.js';

export function casosFinanceiro(ctx, d) {
  const R = ctx.cofre;
  const { need, audit, lanc, uid, agoraISO, est } = ctx;
  const exigeData = (data) => { if (!isData(data)) throw new Error('Data inválida.'); };
  const formaCaixa = (f, padrao) => { const v = f || padrao; if (!FORMAS_CAIXA.includes(v)) throw new Error('Forma de pagamento inválida.'); return v; };

  return {
    // ---------- Caixa (RN-33 a RN-36) ----------
    caixaAberto: (data) => d.caixaAberto(data),
    async abrirCaixa(data, inicial) {
      need('caixa.abrir', {}, 'Você não tem permissão para abrir o caixa.');
      exigeData(data);
      if (d.caixaDia(data)) throw new Error('O caixa deste dia já está aberto.');
      if (!isCentavos(inicial)) throw new Error('Valor inicial inválido.');
      await R.commit([{ put: 'cx', obj: { id: data, data, inicial, abertoPor: R.userId(), em: agoraISO() } }, audit('Abriu o caixa', data, money(inicial))]);
    },
    async lancarCaixa({ data, tipo, valor, forma, desc }) {
      need('caixa.lancar');
      exigeData(data);
      if (!TIPOS_LANC_CAIXA.includes(tipo)) throw new Error('Tipo de lançamento inválido.');
      if (!isPositivo(valor)) throw new Error('Informe um valor maior que zero.');
      const f = formaCaixa(forma, 'dinheiro');
      if (!d.caixaAberto(data)) throw new NeedCaixa(data);
      const v = tipo === 'saida' ? -valor : valor;
      await R.commit([lanc({ conta: 'caixa', data, cat: tipo === 'saida' ? 'Saída' : 'Entrada', valor: v, forma: f, desc: clip(desc, 120) }), audit(`Lançou ${tipo} no caixa`, clip(desc, 60), money(valor))]);
    },

    // ---------- Fechamento e pagamento ----------
    previaFechamento(comandaId) {
      return d.itensDaComanda(comandaId).filter(isActive).map((i) => ({ itemId: i.id, nome: i.nome, profId: i.profId, preco: i.preco, desconto: 0 }));
    },
    async fechar(comandaId, { linhas, gorjeta, data, pagamentos, semPagamento }) {
      const comanda = R.get('comanda', comandaId);
      if (!comanda || comanda.status !== 'aberta') throw new Error('Esta comanda não está aberta.');
      const itens = d.itensDaComanda(comandaId).filter(isActive);
      if (!itens.length) throw new Error('A comanda não tem itens para fechar.');
      const soProprios = itens.every((i) => i.profId === R.userId());
      need('comanda.fechar', { soProprios }, 'Você não tem permissão para fechar esta comanda.');
      exigeData(data);
      const e = est();
      const ls = itens.map((it) => {
        const l = (linhas || []).find((x) => x.itemId === it.id) || { preco: it.preco, desconto: 0 };
        if (l.preco !== it.preco && !ctx.can('preco.editar')) throw new Denied('Você não tem permissão para alterar preços.');
        if (!isCentavos(l.preco)) throw new Error(`Preço inválido em ${it.nome}.`);
        const desconto = l.desconto || 0;
        if (!(isCentavos(desconto) && desconto <= l.preco)) throw new Error(`O desconto de ${it.nome} não pode ser maior que o preço.`);
        const prof = R.get('prof', it.profId);
        const linha = { itemId: it.id, nome: it.nome, profId: it.profId, preco: l.preco, desconto };
        linha.comissao = comissao(linha, prof?.comissao || 0);
        return linha;
      });
      let g = null;
      if (gorjeta && gorjeta.valor) {
        if (!isPositivo(gorjeta.valor)) throw new Error('Valor da gorjeta inválido.');
        if (!itens.some((i) => i.profId === gorjeta.profId)) throw new Error('A gorjeta precisa ir para um profissional desta comanda.');
        g = { profId: gorjeta.profId, valor: gorjeta.valor };
      }
      const t = comandaTotals(ls, g?.valor || 0);
      const pags = (pagamentos || []).filter((p) => p.valor);
      for (const p of pags) {
        if (!FORMAS[p.forma]) throw new Error('Forma de pagamento inválida.');
        if (!isPositivo(p.valor)) throw new Error('Valor de pagamento inválido.');
      }
      const pago = pags.reduce((s, p) => s + p.valor, 0);
      // "Sem pagamento" aceita um pagamento parcial: o que foi pago entra no caixa e só o resto vira débito do cliente (RN-23).
      if (pago > t.total) throw new Error(`O pagamento passou ${money(pago - t.total)} do total.`);
      if (!semPagamento && pago < t.total) throw new Error(`Faltam ${money(t.total - pago)} para fechar o pagamento.`);
      if (semPagamento && pago === t.total) throw new Error('O valor já está completo. Use Confirmar pagamento.');
      const pendente = t.total - pago;
      const usaCreditoCli = pags.filter((p) => p.forma === 'credito_cliente').reduce((s, p) => s + p.valor, 0);
      if (usaCreditoCli) {
        if (!comanda.cliId) throw new Error('Cliente avulso não tem crédito.');
        if (usaCreditoCli > d.saldo('cli:' + comanda.cliId)) throw new Error(`O crédito do cliente é ${money(Math.max(0, d.saldo('cli:' + comanda.cliId)))}.`);
      }
      if (semPagamento && !comanda.cliId) throw new Error('Cliente avulso precisa pagar no fechamento.');
      const precisaCaixa = pags.some((p) => p.forma !== 'credito_cliente');
      if (precisaCaixa && !d.caixaAberto(data)) throw new NeedCaixa(data);

      const seq = (e.seqFech || 0) + 1;
      const nomeCli = d.nomeCliente(comanda);
      const fech = { id: uid(), numero: seq, comandaId, cliId: comanda.cliId, avulso: comanda.avulso, data, linhas: ls, gorjeta: g, bruto: t.bruto, desconto: t.desc, total: t.total, pagamentos: pags.map((p) => ({ forma: p.forma, valor: p.valor })), pendente, autor: R.userId(), em: agoraISO(), anulado: null };
      const numero = String(seq).padStart(6, '0');
      const ops = [{ put: 'fech', obj: fech }, { put: 'est', obj: { ...e, seqFech: seq } }, { put: 'comanda', obj: { ...comanda, status: 'fechada', fechId: fech.id } }];
      for (const it of itens) ops.push({ put: 'item', obj: { ...it, status: 'pago', preco: ls.find((l) => l.itemId === it.id).preco } });
      for (const p of fech.pagamentos) {
        if (p.forma === 'credito_cliente') ops.push(lanc({ conta: 'cli:' + comanda.cliId, data, cat: 'Pagamento com crédito do cliente', valor: -p.valor, forma: p.forma, desc: `Fechamento nº ${numero}`, origem: fech.id }));
        else ops.push(lanc({ conta: 'caixa', data, cat: 'Fechamento', valor: p.valor, forma: p.forma, desc: `Fechamento nº ${numero} · ${nomeCli}`, origem: fech.id }));
      }
      if (pendente) ops.push(lanc({ conta: 'cli:' + comanda.cliId, data, cat: 'Fechamento pendente', valor: -pendente, desc: `Fechamento nº ${numero}`, origem: fech.id }));
      for (const l of ls) if (l.comissao > 0) ops.push(lanc({ conta: 'prof:' + l.profId, data, cat: 'Comissão', valor: l.comissao, desc: `${l.nome} · Fechamento nº ${numero} · ${nomeCli}`, origem: fech.id }));
      if (g) ops.push(lanc({ conta: 'prof:' + g.profId, data, cat: 'Gorjeta', valor: g.valor, desc: `Fechamento nº ${numero} · ${nomeCli}`, origem: fech.id }));
      ops.push(audit('Fechou comanda', `Fechamento nº ${numero}`, `${nomeCli} · ${money(t.total)}${pendente ? ` · pendente ${money(pendente)}` : ''}`));
      await R.commit(ops);
      return fech;
    },

    async anularFechamento(fechId) {
      need('comanda.anular', {}, 'Você não tem permissão para anular fechamentos.');
      const f = R.get('fech', fechId);
      if (!f || f.anulado) throw new Error('Este fechamento já foi anulado.');
      const numero = String(f.numero).padStart(6, '0');
      const origem = R.all('lanc').filter((x) => x.origem === fechId);
      const hoje = ctx.hoje();
      if (origem.some((l) => l.conta === 'caixa') && !d.caixaAberto(hoje)) throw new NeedCaixa(hoje);
      const ops = [{ put: 'fech', obj: { ...f, anulado: { por: R.userId(), em: agoraISO() } } }];
      const c = R.get('comanda', f.comandaId);
      if (c) ops.push({ put: 'comanda', obj: { ...c, status: 'aberta', fechId: null } });
      for (const l of f.linhas) { const it = R.get('item', l.itemId); if (it) ops.push({ put: 'item', obj: { ...it, status: 'confirmado' } }); }
      for (const l of origem) ops.push(lanc({ conta: l.conta, data: hoje, cat: 'Estorno', valor: -l.valor, forma: l.forma, desc: `Anulação do fechamento nº ${numero}`, origem: fechId }));
      ops.push(audit('Anulou fechamento', `Fechamento nº ${numero}`, money(f.total)));
      await R.commit(ops);
    },

    // ---------- Contas correntes ----------
    async lancarCliente(cliId, { tipo, valor, forma, desc, data = ctx.hoje() }) {
      need('cliente.lancar');
      const c = R.get('cli', cliId);
      if (!c) throw new Error('Cliente não encontrado.');
      if (!TIPOS_LANC_CLIENTE.includes(tipo)) throw new Error('Tipo de lançamento inválido.');
      if (!isPositivo(valor)) throw new Error('Informe um valor maior que zero.');
      exigeData(data);
      const ops = [];
      if (tipo === 'credito') {
        const recebeu = forma && forma !== 'nenhuma';
        if (recebeu) {
          const f = formaCaixa(forma);
          if (!d.caixaAberto(data)) throw new NeedCaixa(data);
          ops.push(lanc({ conta: 'caixa', data, cat: 'Crédito de cliente', valor, forma: f, desc: `${clip(desc, 80) || 'Crédito'} · ${c.nome}` }));
        }
        ops.push(lanc({ conta: 'cli:' + cliId, data, cat: 'Crédito', valor, forma: recebeu ? forma : null, desc: clip(desc, 120) }));
      } else {
        ops.push(lanc({ conta: 'cli:' + cliId, data, cat: 'Débito', valor: -valor, desc: clip(desc, 120) }));
      }
      ops.push(audit(`Lançou ${tipo} na conta do cliente`, c.nome, money(valor)));
      await R.commit(ops);
    },
    async lancarProfissional(profId, { tipo, valor, forma, desc, data = ctx.hoje() }) {
      const cat = TIPOS_LANC_PROF[tipo];
      if (!cat) throw new Error('Tipo de lançamento inválido.');
      if (tipo === 'recibo') need('equipe.recibo'); else need('equipe.lancar');
      const p = R.get('prof', profId);
      if (!p) throw new Error('Profissional não encontrado.');
      if (!isPositivo(valor)) throw new Error('Informe um valor maior que zero.');
      exigeData(data);
      const sai = tipo === 'recibo' || tipo === 'adiantamento';
      const ops = [];
      let f = null;
      if (sai) {
        f = formaCaixa(forma, 'dinheiro');
        if (!d.caixaAberto(data)) throw new NeedCaixa(data);
        ops.push(lanc({ conta: 'caixa', data, cat: tipo === 'recibo' ? 'Recibo de profissional' : 'Adiantamento', valor: -valor, forma: f, desc: p.nome }));
      }
      ops.push(lanc({ conta: 'prof:' + profId, data, cat, valor: (sai || tipo === 'debito') ? -valor : valor, forma: f, desc: clip(desc, 120) }));
      ops.push(audit(`Lançou ${cat.toLowerCase()} para profissional`, p.nome, money(valor)));
      await R.commit(ops);
    },

    // ---------- Relatórios ----------
    relatorioMes(ym) {
      need('relatorios');
      if (!isMes(ym)) throw new Error('Mês inválido.');
      const validos = R.all('fech').filter((f) => !f.anulado);
      const fs = validos.filter((f) => f.data.startsWith(ym));
      const fat = fs.reduce((s, f) => s + f.total - (f.gorjeta?.valor || 0), 0);
      const linhas = fs.flatMap((f) => f.linhas);
      const porProf = new Map(), porSrv = new Map(), porForma = new Map(), cli = new Set();
      for (const l of linhas) {
        const a = porProf.get(l.profId) || { fat: 0, com: 0, n: 0 }; a.fat += l.preco - l.desconto; a.com += l.comissao; a.n++; porProf.set(l.profId, a);
        const b = porSrv.get(l.nome) || { n: 0, fat: 0 }; b.n++; b.fat += l.preco - l.desconto; porSrv.set(l.nome, b);
      }
      for (const f of fs) { for (const p of f.pagamentos) porForma.set(p.forma, (porForma.get(p.forma) || 0) + p.valor); if (f.cliId) cli.add(f.cliId); }
      const meses = [];
      const [y, m] = ym.split('-').map(Number);
      for (let k = 5; k >= 0; k--) {
        const dt = new Date(y, m - 1 - k, 1);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const v = validos.filter((f) => f.data.startsWith(key)).reduce((s, f) => s + f.total - (f.gorjeta?.valor || 0), 0);
        meses.push({ key, label: dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), v });
      }
      const novos = R.all('cli').filter((c) => c.ativo !== false && (c.criadoEm || '').startsWith(ym)).length;
      return { fat, n: linhas.length, ticket: fs.length ? Math.round(fat / fs.length) : 0, com: linhas.reduce((s, l) => s + l.comissao, 0), porProf, porSrv: [...porSrv.entries()].sort((a, b) => b[1].n - a[1].n), porForma, clientes: cli.size, novos, meses };
    },
  };
}
