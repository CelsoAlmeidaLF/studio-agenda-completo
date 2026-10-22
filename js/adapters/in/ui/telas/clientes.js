// Clientes: lista e ficha (visão geral, conta corrente, agendamentos, fechamentos).
import { h, icon, money, parseMoney, fmtPhone, fmtDate, toMin, fromMin, norm, onlyDigits, relDay, today } from '../base.js';
import { can } from '../../../../domain/permissoes.js';
import { STATUS } from '../../../../domain/agenda.js';
import { FORMAS, FORMAS_CAIXA } from '../../../../domain/financeiro.js';
import { NeedCaixa } from '../../../../application/erros.js';
import { route, go, sheet, closeSheet, toast, run, field, input, select, avatar, pill, emptyState, tabs, rerender, dangerBtn, telaLarga } from '../kit.js';
import { waLink, telLink } from './agenda.js';
import { abrirCaixaSheet } from './comanda.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição

export function registerClientes(app) {
  S = app;
  route('clientes', ({ q = '' }) => {
    const me = S.me();
    const fab = can(me, 'cliente.criar') ? { label: 'Novo cliente', onclick: () => editarCliente(null) } : null;
    // Tela larga: lista à esquerda e a ficha escolhida à direita.
    if (telaLarga()) return { title: 'Clientes', layout: 'largo', fab,
      body: h('div', { class: 'split' }, h('div', { class: 'mestre' }, listaClientes(q, null)), h('div', { class: 'card' }, emptyState('clientes', 'Escolha um cliente', 'A ficha aparece aqui, ao lado da lista.'))) };
    return { title: 'Clientes', body: listaClientes(q, null), fab };
  });

  route('cliente', ({ id, t = 'visao' }) => {
    const c = S.cliente(id);
    if (!c) return { title: 'Cliente', back: 'clientes', body: emptyState('clientes', 'Cliente não encontrado', '') };
    const me = S.me();
    const meu = S.ehMeuCliente(c.id);
    const podeContato = can(me, 'cliente.contatos', { ehMeuCliente: meu });
    const podeSaldo = can(me, 'cliente.saldo');
    const sld = podeSaldo ? S.saldo('cli:' + c.id) : null;
    const head = h('div', { class: 'cli-head' }, h('div', null, h('b', { class: 'big' }, c.nome), podeSaldo ? h('span', { class: 'saldo' + (sld < 0 ? ' neg' : sld > 0 ? ' pos' : '') }, money(sld)) : null));
    const tb = tabs([
      ['visao', 'Visão geral', () => go('cliente', { id, t: 'visao' })],
      podeSaldo ? ['conta', 'Conta corrente', () => go('cliente', { id, t: 'conta' })] : null,
      ['agend', 'Agendamentos', () => go('cliente', { id, t: 'agend' })],
      ['fech', 'Fechamentos', () => go('cliente', { id, t: 'fech' })],
    ].filter(Boolean), t);
    let body;
    if (t === 'conta' && podeSaldo) body = contaCliente(c, sld);
    else if (t === 'agend') body = agendamentosCliente(c);
    else if (t === 'fech') body = fechamentosCliente(c);
    else body = visaoCliente(c, podeContato);
    const ficha = h('div', { class: 'stack' }, head, tb, body);
    const fab = t === 'agend' ? { label: 'Agendar', onclick: () => go('novo', {}) } : null;
    if (telaLarga()) return { title: 'Clientes', sub: c.nome, layout: 'largo', fab, body: h('div', { class: 'split' }, h('div', { class: 'mestre' }, listaClientes('', c.id)), h('div', { class: 'detalhe' }, ficha)) };
    return { title: 'Ficha de cliente', back: 'clientes', body: ficha, fab };
  });
}

// Lista de clientes agrupada pela data do último agendamento. "sel" destaca o cliente aberto (tela larga).
function listaClientes(q, sel) {
  const qi = input({ value: q, placeholder: 'Procurar cliente', 'aria-label': 'Procurar cliente', class: 'inp search' });
  const list = h('div');
  const me = S.me();
  const ultimo = S.ultimaVisitaPorCliente();
  const draw = () => {
    const t = norm(qi.value), d = onlyDigits(qi.value);
    const cs = S.clientes().filter((c) => !t || norm(c.nome).includes(t) || (d.length >= 2 && onlyDigits(c.cel).includes(d)));
    list.replaceChildren();
    if (!cs.length) { list.append(emptyState('clientes', 'Nenhum cliente encontrado', 'Toque em + para cadastrar.')); return; }
    const groups = new Map();
    for (const c of cs.sort((a, b) => (ultimo.get(b.id) || '').localeCompare(ultimo.get(a.id) || '') || a.nome.localeCompare(b.nome))) {
      const k = ultimo.get(c.id) || 'Sem agendamentos';
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c);
    }
    for (const [k, arr] of groups) {
      list.append(h('div', { class: 'gh-row' }, h('b', null, k === 'Sem agendamentos' ? k : fmtDate(k, { day: 'numeric', month: 'long', year: 'numeric' })), h('span', null, `${arr.length} cliente${arr.length > 1 ? 's' : ''}`)));
      for (const c of arr) {
        const vis = can(me, 'cliente.contatos', { ehMeuCliente: S.ehMeuCliente(c.id) });
        list.append(h('button', { class: 'clirow block' + (c.id === sel ? ' on' : ''), 'aria-current': c.id === sel ? 'true' : null, onclick: () => go('cliente', { id: c.id }) }, h('span', { class: 'cn' }, c.nome), h('small', null, vis && c.cel ? fmtPhone(c.cel) : ''), c.obs ? h('i', { class: 'muted small' }, c.obs) : null));
      }
    }
  };
  qi.addEventListener('input', draw);
  draw();
  return h('div', null, h('div', { class: 'searchbar' }, icon('search', 20), qi), h('p', { class: 'muted small padx' }, 'Clientes dos últimos agendamentos (sem clientes avulsos):'), list);
}

function visaoCliente(c, podeContato) {
  const itens = S.itensDoCliente(c.id).filter((i) => i.status !== 'cancelado');
  const hoje = today();
  const passadas = itens.filter((i) => i.data < hoje), futuras = itens.filter((i) => i.data >= hoje).reverse();
  const visita = (titulo, ic, data) => {
    const do_ = itens.filter((i) => i.data === data).sort((a, b) => a.hora.localeCompare(b.hora));
    return h('div', { class: 'card pad' }, h('h3', { class: 'ch' }, icon(ic, 22), titulo),
      data ? [h('div', { class: 'vis-h' }, h('span', null, fmtDate(data, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })), h('span', null, h('b', null, do_[0].hora), ` - ${fromMin(toMin(do_.at(-1).hora) + do_.at(-1).duracao)}`)),
        do_.map((i) => h('div', { class: 'cmd-i' }, h('i', { class: 'dot', style: { '--sc': STATUS[i.status].cor } }), h('span', null, i.nome), avatar(S.prof(i.profId), 24)))] : h('p', { class: 'muted' }, 'Nenhuma.'));
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'card pad' }, h('h3', { class: 'ch' }, icon('clientes', 22), 'Dados do cliente'),
      podeContato ? h('div', { class: 'vis-h' }, h('div', null, h('small', { class: 'muted' }, 'Celular'), h('div', null, c.cel ? fmtPhone(c.cel) : '—'), c.email ? h('small', null, c.email) : null),
        c.cel ? h('div', { class: 'acts-row' }, h('a', { class: 'circ wa', href: waLink(c.cel, `Olá, ${c.nome.split(' ')[0]}!`), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'WhatsApp' }, icon('whats', 22)), h('a', { class: 'circ tel', href: telLink(c.cel), 'aria-label': 'Ligar' }, icon('phone', 22))) : null)
        : h('p', { class: 'muted small' }, 'Você não tem permissão para ver os contatos deste cliente.'),
      c.obs ? h('p', { class: 'note' }, c.obs) : null,
      can(S.me(), 'cliente.editar', { ehMeuCliente: S.ehMeuCliente(c.id) }) ? h('button', { class: 'link center block', onclick: () => editarCliente(c) }, icon('edit', 16), ' Editar cliente') : null),
    visita('Última visita', 'agenda', passadas[0]?.data),
    visita('Próxima visita', 'agenda', futuras[0]?.data));
}

function contaCliente(c, sld) {
  const me = S.me();
  const podeMov = can(me, 'cliente.movimentos');
  const ls = podeMov ? S.lancs('cli:' + c.id) : [];
  let acc = sld;
  return h('div', { class: 'stack' },
    h('div', { class: 'card pad kv' }, h('span', null, 'Saldo'), h('b', { class: sld < 0 ? 'neg' : 'pos' }, money(sld))),
    can(me, 'cliente.lancar') ? h('div', { class: 'acts-row' }, h('button', { class: 'btn', onclick: () => lancarSheet(c, 'credito') }, icon('in', 18), 'Lançar crédito'), h('button', { class: 'btn', onclick: () => lancarSheet(c, 'debito') }, icon('out', 18), 'Lançar débito')) : null,
    podeMov ? (ls.length ? h('div', { class: 'card' }, ls.map((l) => { const saldoApos = acc; acc -= l.valor; return movRow(l, saldoApos); })) : emptyState('money', 'Sem movimentos', '')) : h('p', { class: 'muted' }, 'Você pode ver apenas o saldo.'));
}

export function movRow(l, saldoApos) {
  const ent = l.valor >= 0;
  return h('div', { class: 'mov' },
    h('div', { class: 'mov-l' }, h('span', { class: 'mi ' + (ent ? 'in' : 'out') }, icon(ent ? 'in' : 'out', 16)), h('small', null, new Date(l.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))),
    h('div', { class: 'mov-c' }, h('small', { class: 'muted' }, fmtDate(l.data, { weekday: 'short', day: 'numeric', month: 'short' })), h('b', null, l.cat), l.desc ? h('span', null, l.desc) : null, h('small', { class: 'muted' }, 'Por: ' + S.nomeProf(l.autor))),
    h('div', { class: 'mov-r' }, h('b', null, (ent ? '+' : '-') + money(Math.abs(l.valor))), l.forma ? h('small', null, FORMAS[l.forma] || l.forma) : null, saldoApos != null ? h('small', { class: 'muted' }, 'Saldo: ' + money(saldoApos)) : null));
}

function agendamentosCliente(c) {
  const itens = S.itensDoCliente(c.id);
  if (!itens.length) return emptyState('agenda', 'Nenhum agendamento', '');
  const byDay = new Map();
  for (const i of itens) { if (!byDay.has(i.data)) byDay.set(i.data, []); byDay.get(i.data).push(i); }
  return h('div', { class: 'stack' }, [...byDay].map(([d, arr]) => h('div', { class: 'stack-s' }, h('h3', { class: 'hour' }, `${relDay(d)}, ${fmtDate(d)}`),
    arr.sort((a, b) => a.hora.localeCompare(b.hora)).map((i) => h('button', { class: 'card item', onclick: () => go('comanda', { id: i.comandaId }) },
      h('div', { class: 'item-h' }, h('span', { class: 'hr' }, i.hora, h('small', null, ` - ${fromMin(toMin(i.hora) + i.duracao)}`)), pill(STATUS[i.status].nome, STATUS[i.status].cor)),
      h('div', { class: 'item-r' }, icon('scissors', 20), h('b', null, i.nome), h('span', { class: 'muted' }, money(i.preco))),
      h('div', { class: 'item-r' }, avatar(S.prof(i.profId), 24), h('span', null, S.nomeProf(i.profId))))))));
}

function fechamentosCliente(c) {
  const fs = S.fechamentosDoCliente(c.id);
  if (!fs.length) return emptyState('money', 'Nenhum fechamento', '');
  return h('div', { class: 'stack' }, fs.map((f) => h('div', { class: 'stack-s' }, h('h3', { class: 'hour' }, fmtDate(f.data, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })),
    h('button', { class: 'card pad fc', onclick: () => go('comanda', { id: f.comandaId }) },
      h('div', { class: 'vis-h' }, h('span', null, f.anulado ? pill('Anulado', '#7d7f86') : f.pendente ? pill('Pendente', '#f08a24') : pill('Pago', '#16a34a'), h('small', { class: 'muted' }, ` #${String(f.numero).padStart(6, '0')}`)), h('span', { class: 'right' }, h('small', { class: 'muted' }, 'Valor total'), h('b', null, money(f.total)))),
      h('small', { class: 'muted' }, f.linhas.map((l) => l.nome).join(' · ') + (f.pagamentos.length ? ' · ' + f.pagamentos.map((p) => FORMAS[p.forma]).join(' + ') : ''))))));
}

export function editarCliente(c) {
  const me = S.me();
  const meu = c ? S.ehMeuCliente(c.id) : false;
  if (c ? !can(me, 'cliente.editar', { ehMeuCliente: meu }) : !can(me, 'cliente.criar')) return toast('Você não tem permissão para editar este cliente.');
  const podeContato = !c || can(me, 'cliente.contatos', { ehMeuCliente: meu });
  const n = input({ value: c?.nome || '', maxlength: 80, required: true });
  const cel = input({ value: c?.cel ? fmtPhone(c.cel) : '', inputmode: 'tel', maxlength: 20, disabled: !podeContato, placeholder: '(11) 90000-0000' });
  const em = input({ value: c?.email || '', type: 'email', maxlength: 120, disabled: !podeContato });
  const obs = h('textarea', { class: 'inp', rows: 3, maxlength: 500, placeholder: 'Preferências, alergias a produtos…' }, c?.obs || '');
  sheet(c ? 'Editar cliente' : 'Novo cliente', h('div', { class: 'stack' }, field('Nome', n), h('div', { class: 'row2' }, field('Celular', cel), field('E-mail', em)), field('Observações (só a equipe vê)', obs)),
    [c ? dangerBtn('Inativar', () => run(() => S.inativarCliente(c.id), 'Cliente inativado').then(() => { closeSheet(); go('clientes'); })) : null,
      h('button', { class: 'btn pri', onclick: async () => { const r = await run(() => S.salvarCliente({ id: c?.id, nome: n.value, cel: cel.value, email: em.value, obs: obs.value }), 'Cliente salvo').catch(() => null); if (r) { closeSheet(); go('cliente', { id: r.id }); } } }, 'Salvar')]);
}

function lancarSheet(c, tipo) {
  const v = input({ inputmode: 'decimal', placeholder: '0,00' });
  const f = select([['nenhuma', 'Sem entrada no caixa (ajuste)'], ...FORMAS_CAIXA.map((k) => [k, FORMAS[k]])], 'pix');
  const d = input({ maxlength: 120, placeholder: tipo === 'credito' ? 'Ex.: sinal de agendamento, vale-presente' : 'Ex.: ajuste' });
  const go2 = async () => {
    try { await S.lancarCliente(c.id, { tipo, valor: parseMoney(v.value), forma: tipo === 'credito' ? f.value : null, desc: d.value }); closeSheet(); toast('Lançamento registrado', true); rerender(); }
    catch (e) { if (e instanceof NeedCaixa) abrirCaixaSheet(e.data, go2); else toast(e.message); }
  };
  sheet(tipo === 'credito' ? 'Lançar crédito' : 'Lançar débito', h('div', { class: 'stack' }, field('Valor (R$)', v), tipo === 'credito' ? field('Recebido em', f, 'Se recebeu dinheiro agora, o valor entra no caixa do dia.') : null, field('Descrição', d)),
    h('button', { class: 'btn pri', onclick: go2 }, 'Lançar'));
}
