// Consultas para a interface. A visibilidade (RN-42, RN-43) é aplicada aqui, na aplicação, e não só na tela.
import { can } from '../../domain/permissoes.js';
import { isActive } from '../../domain/agenda.js';
import { comissao, pctComissao } from '../../domain/financeiro.js';
import { norm, onlyDigits } from '../../shared/texto.js';
import { Denied } from '../erros.js';

export function consultas(ctx, d) {
  const R = ctx.cofre;
  const me = ctx.me;
  const podeVerItem = (i) => can(me(), 'agenda.ver', { profId: i.profId });
  const exige = (ok, msg) => { if (!R.isUnlocked() || !ok) throw new Denied(msg || 'Você não tem permissão para ver isto.'); };

  // Conta corrente: "caixa", "cli:<id>" ou "prof:<id>".
  function podeVerConta(conta, movimentos) {
    if (conta === 'caixa') return can(me(), 'caixa.ver');
    if (conta.startsWith('cli:')) return can(me(), movimentos ? 'cliente.movimentos' : 'cliente.saldo');
    if (conta.startsWith('prof:')) return can(me(), movimentos ? 'equipe.movimentos' : 'equipe.ver', { profId: conta.slice(5) });
    return false;
  }

  const clientes = () => R.all('cli').filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));

  return {
    me, est: ctx.est, nomeProf: ctx.nomeProf, nomeCliente: d.nomeCliente, ehMeuCliente: d.ehMeuCliente,
    profs: d.profs,
    prof: (id) => R.get('prof', id),
    servicos: (incluirInativos = false) => R.all('srv').filter((s) => incluirInativos || s.ativo !== false).sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.nome.localeCompare(b.nome)),
    servico: (id) => R.get('srv', id),
    produtos: (incluirInativos = false) => R.all('prod').filter((p) => incluirInativos || p.ativo !== false).sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.nome.localeCompare(b.nome)),
    produtosAVenda: () => R.all('prod').filter((p) => p.ativo !== false && p.venda?.ativo && p.venda.preco > 0).sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.nome.localeCompare(b.nome)),
    produto: (id) => R.get('prod', id),
    clientes,
    cliente: (id) => R.get('cli', id),
    buscarClientes(q) {
      const t = norm(q), dg = onlyDigits(q);
      if (t.length < 2 && dg.length < 2) return [];
      return clientes().filter((c) => norm(c.nome).includes(t) || (dg.length >= 2 && onlyDigits(c.cel).includes(dg))).slice(0, 30);
    },
    celularEmUso: (cel, exceptId) => d.celularEmUso(onlyDigits(cel), exceptId),
    // Data do último agendamento visível de cada cliente (para agrupar a lista).
    ultimaVisitaPorCliente() {
      const m = new Map();
      for (const i of R.all('item')) if (i.cliId && podeVerItem(i) && (!m.has(i.cliId) || i.data > m.get(i.cliId))) m.set(i.cliId, i.data);
      return m;
    },

    // ---------- Agenda e comandas ----------
    item: (id) => { const i = R.get('item', id); return i && podeVerItem(i) ? i : null; },
    itensDoDia: (data) => R.all('item').filter((i) => i.data === data && podeVerItem(i)),
    bloqueiosDoDia: (data) => R.all('bloq').filter((b) => b.data === data && can(me(), 'agenda.ver', { profId: b.profId })),
    comandasDoDia: (data) => R.all('comanda').filter((c) => c.data === data),
    itensDaComanda: (cid) => d.itensDaComanda(cid).filter(podeVerItem),
    // A comanda só abre para quem vê ao menos um item dela.
    comanda(id) {
      const c = R.get('comanda', id);
      if (!c) return null;
      exige(d.itensDaComanda(id).some(podeVerItem), 'Você não tem acesso a esta comanda.');
      return c;
    },
    podeFechar(cid) {
      const ativos = d.itensDaComanda(cid).filter(isActive);
      return ativos.length > 0 && can(me(), 'comanda.fechar', { soProprios: ativos.every((i) => i.profId === R.userId()) });
    },
    itensDoCliente: (cid) => R.all('item').filter((i) => i.cliId === cid && podeVerItem(i)).sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora)),
    fechamento: (id) => R.get('fech', id),
    // Quem só vê os próprios atendimentos vê só os fechamentos em que trabalhou.
    fechamentosDoCliente: (cid) => R.all('fech').filter((f) => f.cliId === cid && (can(me(), 'agenda.verTodos') || f.linhas.some((l) => l.profId === R.userId()))).sort((a, b) => b.em.localeCompare(a.em)),

    // ---------- Contas e caixa ----------
    saldo(conta) { exige(podeVerConta(conta, false)); return d.saldo(conta); },
    lancs(conta) { exige(podeVerConta(conta, true)); return R.all('lanc').filter((l) => l.conta === conta).sort((a, b) => b.em.localeCompare(a.em)); },
    caixaDia(data) { exige(can(me(), 'caixa.ver')); return d.caixaDia(data); },
    lancsCaixaDia(data) { exige(can(me(), 'caixa.ver')); return d.lancsCaixaDia(data); },
    saldoCaixa(data) { exige(can(me(), 'caixa.ver')); return (d.caixaDia(data)?.inicial || 0) + d.lancsCaixaDia(data).reduce((s, l) => s + l.valor, 0); },
    // Atendimentos já realizados que ainda não foram fechados: comissão prevista.
    comissoesPrevistas(profId) {
      exige(can(me(), 'equipe.ver', { profId }));
      const p = R.get('prof', profId);
      return R.all('item').filter((i) => i.profId === profId && i.data <= ctx.hoje() && ['confirmado', 'iniciado', 'marcado', 'atrasado', 'espera'].includes(i.status))
        .sort((a, b) => b.data.localeCompare(a.data))
        .map((i) => ({ ...i, comissaoPrevista: comissao({ preco: i.preco, desconto: 0 }, pctComissao(i, p, i.tipo === 'produto' ? R.get('prod', i.prodId) : null)) }));
    },

    // ---------- Segurança ----------
    auditoria() { exige(can(me(), 'seguranca')); return R.all('audit').sort((a, b) => b.em.localeCompare(a.em)).slice(0, 300); },
    integridade: () => R.integrity(),
    async acessos() { exige(can(me(), 'gestao.equipe')); return R.listLogins(); },
  };
}
