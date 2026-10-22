// Permissões (RN-40 a RN-44): catálogo, perfis prontos e a política única de autorização (RT-03).

// Catálogo exibido na tela de permissões. Cada grupo: chave, opções (nível = índice) e extras por nível.
export const PERM_CATALOG = [
  { area: 'Agenda', grupos: [
    { k: 'agenda', t: 'Gestão dos agendamentos', ops: ['Sem acesso.', 'Apenas consulta os seus próprios agendamentos.', 'Criar e editar os seus próprios agendamentos.', 'Criar e editar todos os agendamentos, incluindo os da equipe.'],
      extras: { 3: [['ag_notif', 'Permitir envio de notificações aos clientes na criação ou alteração de agendamentos.'], ['ag_bloq', 'Permitir criar e editar todos os bloqueios de agenda, incluindo os da equipe.'], ['ag_fech', 'Permitir realizar e anular fechamentos de todas as comandas.'], ['ag_preco', 'Permitir editar o preço de todos os agendamentos.']] } },
    { k: 'ag_prod', t: 'Gestão dos produtos nos agendamentos', ops: ['Apenas consultar produtos nas comandas.', 'Permitir adicionar e editar a quantidade de produtos apenas dos seus agendamentos.', 'Permitir adicionar e editar a quantidade de produtos de todos os agendamentos, incluindo os da equipe.'] },
  ] },
  { area: 'Clientes', grupos: [
    { k: 'cli_contatos', t: 'Contatos dos clientes', ops: ['Sem acesso, ver apenas o nome dos clientes.', 'Ver e editar os contatos dos seus clientes, mas ver apenas o nome dos clientes dos outros profissionais.', 'Ver e editar os contatos de todos os clientes do estabelecimento.'] },
    { k: 'cli_conta', t: 'Conta corrente dos clientes', ops: ['Sem acesso.', 'Ver apenas o saldo.', 'Ver o saldo e os movimentos.'], extras: { 2: [['cli_lanc', 'Permitir realizar lançamentos (registrar manualmente entradas e saídas de valores).']] } },
  ] },
  { area: 'Contas correntes e comissões dos profissionais', grupos: [
    { k: 'equipe_conta', t: 'Conta corrente da equipe', ops: ['Sem acesso.', 'Ver o saldo e os movimentos.'], extras: { 1: [['eq_mov', 'Permitir criar e editar movimentos.'], ['eq_recibo', 'Pagar e anular recibos.']] } },
    { k: 'minha_conta', t: 'Minha conta (conta corrente pessoal)', ops: ['Sem acesso.', 'Ver apenas o saldo.', 'Ver o saldo e todos os movimentos.'] },
  ] },
  { area: 'Financeiro', grupos: [
    { k: 'caixa', t: 'Acesso ao caixa', ops: ['Sem acesso.', 'Apenas consulta.', 'Criação e edição de lançamentos.'], extras: { 2: [['caixa_abrir', 'Permitir abrir o caixa.']] } },
  ] },
  { area: 'Relatórios', grupos: [
    { k: 'relatorios', t: 'Relatórios (faturamento, comissões, serviços e clientes)', ops: ['Sem acesso.', 'Permitir acesso.'] },
  ] },
  { area: 'Gestão do estabelecimento', grupos: [
    { k: 'gestao_est', t: 'Configurações do estabelecimento (geral, horário e caixa)', ops: ['Sem acesso.', 'Criação e edição de dados.'] },
    { k: 'gestao_itens', t: 'Configurações dos itens (serviços e produtos)', ops: ['Sem acesso.', 'Criação e edição de dados.'] },
    { k: 'gestao_equipe', t: 'Configurações da equipe', ops: ['Sem acesso.', 'Criação e edição de dados.'], extras: { 1: [['gestao_perm', 'Permitir gestão das permissões.']] } },
    { k: 'seguranca', t: 'Segurança (auditoria, backup e exclusão de dados)', ops: ['Sem acesso.', 'Permitir acesso.'] },
  ] },
];

export const PERM_ADMIN = {
  agenda: 3, ag_notif: true, ag_bloq: true, ag_fech: true, ag_preco: true, ag_prod: 2,
  cli_contatos: 2, cli_conta: 2, cli_lanc: true, equipe_conta: 1, eq_mov: true, eq_recibo: true, minha_conta: 2,
  caixa: 2, caixa_abrir: true, relatorios: 1, gestao_est: 1, gestao_itens: 1, gestao_equipe: 1, gestao_perm: true, seguranca: 1,
};
export const PERM_PROFISSIONAL = {
  agenda: 2, ag_notif: true, ag_bloq: false, ag_fech: false, ag_preco: false, ag_prod: 1,
  cli_contatos: 1, cli_conta: 1, cli_lanc: false, equipe_conta: 0, eq_mov: false, eq_recibo: false, minha_conta: 2,
  caixa: 0, caixa_abrir: false, relatorios: 0, gestao_est: 0, gestao_itens: 0, gestao_equipe: 0, gestao_perm: false, seguranca: 0,
};
export const PERM_RECEPCAO = {
  ...PERM_PROFISSIONAL, agenda: 3, ag_prod: 2, ag_bloq: true, ag_fech: true, cli_contatos: 2, cli_conta: 2, cli_lanc: true, caixa: 2, caixa_abrir: true, minha_conta: 0,
};

// Política única de autorização usada pelos casos de uso (e, por conveniência, pela UI).
export function can(user, action, ctx = {}) {
  if (!user) return false;
  const p = user.perm || {};
  const own = ctx.profId === user.id;
  switch (action) {
    case 'agenda.ver': return p.agenda === 3 || (p.agenda >= 1 && (ctx.profId == null || own));
    case 'agenda.verTodos': return p.agenda === 3;
    case 'agenda.editar': return p.agenda === 3 || (p.agenda === 2 && own);
    case 'agenda.notificar': return p.agenda === 3 ? !!p.ag_notif : (p.agenda === 2 && own && !!p.ag_notif);
    case 'agenda.bloqueio': return (p.agenda === 3 && p.ag_bloq) || (p.agenda >= 2 && own);
    case 'comanda.fechar': return (p.agenda === 3 && p.ag_fech) || (p.agenda >= 2 && ctx.soProprios);
    case 'comanda.anular': return p.agenda === 3 && p.ag_fech;
    case 'preco.editar': return p.agenda === 3 && p.ag_preco;
    // RN-59: lançar produtos na comanda (os próprios ou de todos).
    // Cadastros anteriores aos produtos não têm ag_prod: vale o mesmo alcance da agenda (todos, os próprios ou nenhum).
    case 'produto.vender': { const n = p.ag_prod ?? (p.agenda === 3 ? 2 : p.agenda === 2 ? 1 : 0); return n === 2 || (n === 1 && own); }
    case 'cliente.criar': return p.agenda >= 2;
    case 'cliente.editar': return p.agenda === 3 || (p.agenda === 2 && !!ctx.ehMeuCliente);
    case 'cliente.contatos': return p.cli_contatos === 2 || (p.cli_contatos === 1 && !!ctx.ehMeuCliente);
    case 'cliente.saldo': return p.cli_conta >= 1;
    case 'cliente.movimentos': return p.cli_conta === 2;
    case 'cliente.lancar': return p.cli_conta === 2 && p.cli_lanc;
    case 'equipe.ver': return own ? p.minha_conta >= 1 : p.equipe_conta >= 1;
    case 'equipe.movimentos': return own ? p.minha_conta === 2 : p.equipe_conta >= 1;
    case 'equipe.lancar': return p.equipe_conta >= 1 && p.eq_mov;
    case 'equipe.recibo': return p.equipe_conta >= 1 && p.eq_recibo;
    case 'caixa.ver': return p.caixa >= 1;
    case 'caixa.lancar': return p.caixa === 2;
    case 'caixa.abrir': return p.caixa === 2 && p.caixa_abrir;
    case 'relatorios': return p.relatorios === 1;
    case 'gestao.est': return p.gestao_est === 1;
    case 'gestao.itens': return p.gestao_itens === 1;
    case 'gestao.equipe': return p.gestao_equipe === 1;
    case 'gestao.perm': return p.gestao_equipe === 1 && p.gestao_perm;
    case 'seguranca': return p.seguranca === 1;
    default: return false;
  }
}

// Verdadeiro se "alvo" tem algum acesso que "meu" não tem.
// Quem não gere permissões não pode mexer no PIN, no acesso ou no cadastro de alguém com mais poder (evita escalada).
export function excede(alvo = {}, meu = {}) {
  for (const area of PERM_CATALOG) for (const g of area.grupos) {
    if ((alvo[g.k] || 0) > (meu[g.k] || 0)) return true;
    for (const lvl of Object.values(g.extras || {})) for (const [ek] of lvl) if (alvo[ek] && !meu[ek]) return true;
  }
  return false;
}

// Normaliza permissões vindas da tela: só chaves do catálogo, níveis válidos e extras booleanos.
export function normalizarPermissoes(perm = {}) {
  const valid = {};
  for (const area of PERM_CATALOG) for (const g of area.grupos) {
    const n = Number(perm[g.k]);
    valid[g.k] = Number.isInteger(n) && n >= 0 && n < g.ops.length ? n : 0;
    for (const lvl of Object.values(g.extras || {})) for (const [ek] of lvl) valid[ek] = !!perm[ek];
  }
  return valid;
}

export const ehGestorDePermissoes = (perm) => !!(perm?.gestao_perm && perm?.gestao_equipe === 1);
