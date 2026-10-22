// Agenda em grade, lista de comandas, lembretes e bloqueios.
import { h, icon, today, addDays, toMin, fromMin, nowMin, relDay, fmtDate, parseDate, e164 } from '../base.js';
import { can } from '../../../../domain/permissoes.js';
import { STATUS, dayBounds, intervalsOf } from '../../../../domain/agenda.js';
import { route, go, sheet, closeSheet, run, field, input, avatar, pill, emptyState, rerender, dangerBtn } from '../kit.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição

const RH = 56; // altura de cada linha da grade

function dateBar(name, d) {
  const di = input({ type: 'date', value: d, 'aria-label': 'Escolher data', onchange: (e) => e.target.value && go(name, { d: e.target.value }) });
  return h('div', { class: 'datebar' },
    h('button', { class: 'hbtn', 'aria-label': 'Dia anterior', onclick: () => go(name, { d: addDays(d, -1) }) }, icon('left', 22)),
    h('button', { class: 'btn sm', disabled: d === today(), onclick: () => go(name, { d: today() }) }, 'Hoje'),
    h('button', { class: 'hbtn', 'aria-label': 'Próximo dia', onclick: () => go(name, { d: addDays(d, 1) }) }, icon('right', 22)),
    di);
}
export function dayTitle(d) {
  const r = relDay(d);
  return ['Hoje', 'Amanhã', 'Ontem'].includes(r) ? `${r}, ${fmtDate(d, { day: 'numeric', month: 'short' })}` : fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function visibleProfs() {
  const me = S.me();
  const all = S.profs().filter((p) => p.atende !== false);
  return can(me, 'agenda.verTodos') ? all : all.filter((p) => p.id === me.id);
}

function pendentesLembrete(d) {
  return S.itensDoDia(d).filter((i) => !i.notificado && ['marcado', 'confirmado'].includes(i.status) && can(S.me(), 'agenda.notificar', { profId: i.profId }));
}
function headerActions(name, d) {
  const n = pendentesLembrete(d).length + pendentesLembrete(addDays(d, 1)).length;
  return [
    h('button', { class: 'hbtn badge-wrap', 'aria-label': `Lembretes por WhatsApp (${n} pendentes)`, onclick: () => lembretes(d) }, icon('bell', 24), n ? h('span', { class: 'badge' }, n) : null),
    name === 'agenda'
      ? h('button', { class: 'hbtn', 'aria-label': 'Ver comandas em lista', onclick: () => go('comandas', { d }) }, icon('list', 24))
      : h('button', { class: 'hbtn', 'aria-label': 'Ver agenda em grade', onclick: () => go('agenda', { d }) }, icon('agenda', 24)),
  ];
}

export function registerAgenda(app) {
  S = app;
  route('agenda', ({ d = today() }) => {
    const me = S.me();
    if (!can(me, 'agenda.ver', { profId: me.id })) return { title: 'Agenda', body: emptyState('lock', 'Sem acesso à agenda', 'Peça ao gestor para liberar a sua permissão.') };
    const e = S.est();
    const ps = visibleProfs();
    const [ini, fim, fechado] = dayBounds(e, d);
    const slot = e.slot || 30;
    const start = Math.floor(ini / 60) * 60, end = Math.ceil(fim / 60) * 60;
    const nSlots = (end - start) / slot;
    const itens = S.itensDoDia(d).filter((i) => i.status !== 'cancelado');
    const blqs = S.bloqueiosDoDia(d);
    const ivs = intervalsOf(e, d);
    const gaps = []; // períodos fechados para hachurar
    let cur = start;
    for (const [a, b] of [...ivs].sort((x, y) => x[0] - y[0])) { if (a > cur) gaps.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < end) gaps.push([cur, end]);
    if (!ivs.length) gaps.splice(0, gaps.length, [start, end]);
    const y = (m) => ((m - start) / slot) * RH;

    const cols = ps.map((p) => {
      const col = h('div', { class: 'gcol' });
      col.style.setProperty('height', nSlots * RH + 'px');
      for (const [a, b] of gaps) col.append(h('div', { class: 'hatch', style: { top: y(a) + 'px', height: y(b) - y(a) + 'px' } }));
      if (can(me, 'agenda.editar', { profId: p.id })) {
        for (let k = 0; k < nSlots; k++) {
          const hm = fromMin(start + k * slot);
          col.append(h('button', { class: 'slot' + ((start + (k + 1) * slot) % 60 === 0 ? ' hr' : ''), style: { top: k * RH + 'px', height: RH + 'px' }, 'aria-label': `Novo em ${hm} com ${p.nome}`, onclick: () => slotMenu(d, hm, p) }));
        }
      }
      for (const b of blqs.filter((x) => x.profId === p.id)) {
        col.append(h('button', { class: 'blk', style: { top: y(toMin(b.inicio)) + 2 + 'px', height: Math.max(26, y(toMin(b.fim)) - y(toMin(b.inicio)) - 4) + 'px' }, onclick: () => bloqueioSheet(d, p, b) },
          h('b', null, `${b.inicio} Bloqueio`), h('span', null, b.motivo)));
      }
      for (const it of itens.filter((x) => x.profId === p.id)) {
        const top = y(toMin(it.hora)), hgt = Math.max(30, (it.duracao / slot) * RH - 4);
        col.append(h('button', { class: 'ap st-' + it.status, style: { top: top + 2 + 'px', height: hgt + 'px', '--sc': STATUS[it.status].cor }, onclick: () => go('comanda', { id: it.comandaId }) },
          h('span', { class: 't' }, `${it.hora} - ${fromMin(toMin(it.hora) + it.duracao)}`),
          h('b', null, S.nomeCliente(it)),
          h('span', null, it.nome),
          it.nota ? h('i', { class: 'flag', 'aria-label': 'Tem nota interna' }) : null));
      }
      if (d === today()) { const nm = nowMin(); if (nm > start && nm < end) col.append(h('div', { class: 'now', style: { top: y(nm) + 'px' } })); }
      return col;
    });

    const grid = h('div', { class: 'grid', style: { '--n': String(Math.max(1, ps.length)) } },
      h('div', { class: 'gh corner' }),
      ps.map((p) => h('div', { class: 'gh', style: { '--c': p.cor } }, avatar(p, 26), h('span', null, p.nome), h('small', null, String(itens.filter((i) => i.profId === p.id).length)))),
      h('div', { class: 'tcol' }, [...Array(nSlots)].map((_, k) => { const m = start + k * slot; return h('div', { class: 'tl' + (m % 60 ? ' half' : ''), style: { height: RH + 'px' } }, m % 60 ? '' : String(m / 60).padStart(2, '0')); })),
      cols);

    return {
      title: dayTitle(d), sub: e.nome, actions: headerActions('agenda', d), wide: true,
      body: h('div', null, dateBar('agenda', d), fechado ? h('p', { class: 'note' }, 'O estabelecimento está fechado neste dia (veja Gestão › Horário de funcionamento).') : null,
        ps.length ? h('div', { class: 'gwrap card' }, grid) : emptyState('equipe', 'Nenhum profissional na agenda', 'Cadastre a equipe em Gestão › Equipe.')),
      fab: can(me, 'agenda.editar', { profId: me.id }) || can(me, 'agenda.verTodos') ? { label: 'Agendar ou vender', onclick: () => go('novo', { d }) } : null,
      after: (main) => { const g = main.querySelector('.gwrap'); if (g && d === today()) g.scrollTop = Math.max(0, y(nowMin()) - 120); },
    };
  });

  route('comandas', ({ d = today() }) => {
    const me = S.me();
    if (!can(me, 'agenda.ver', { profId: me.id })) return { title: 'Comandas', body: emptyState('lock', 'Sem acesso à agenda', '') };
    const vis = new Set(visibleProfs().map((p) => p.id));
    const cs = S.comandasDoDia(d).map((c) => ({ c, itens: S.itensDaComanda(c.id).filter((i) => vis.has(i.profId) && i.status !== 'cancelado') })).filter((x) => x.itens.length)
      .sort((a, b) => a.itens[0].hora.localeCompare(b.itens[0].hora));
    const byHour = new Map();
    for (const x of cs) { const k = x.itens[0].hora.slice(0, 2) + ':00'; if (!byHour.has(k)) byHour.set(k, []); byHour.get(k).push(x); }
    return {
      title: dayTitle(d), sub: `Comandas · ${cs.length}`, actions: headerActions('comandas', d),
      body: h('div', null, dateBar('comandas', d),
        cs.length ? [...byHour].map(([hr, list]) => h('div', null, h('h3', { class: 'hour' }, hr),
          list.map(({ c, itens }) => {
            const last = itens[itens.length - 1];
            return h('button', { class: 'card cmd', onclick: () => go('comanda', { id: c.id }) },
              h('div', { class: 'cmd-h' }, h('b', null, S.nomeCliente(c)), h('span', null, h('b', null, itens[0].hora), ` - ${fromMin(toMin(last.hora) + last.duracao)}`)),
              itens.map((i) => h('div', { class: 'cmd-i' }, h('i', { class: 'dot', style: { '--sc': STATUS[i.status].cor } }), h('span', null, i.nome), avatar(S.prof(i.profId), 24))),
              c.status === 'fechada' ? pill('Pago', STATUS.pago.cor) : null);
          }))) : emptyState('agenda', 'Nenhuma comanda neste dia', 'Toque em + para agendar ou vender.')),
      fab: { label: 'Agendar ou vender', onclick: () => go('novo', { d }) },
    };
  });
}

function slotMenu(d, hora, prof) {
  const me = S.me();
  sheet(`${hora} · ${prof.nome}`, h('div', { class: 'stack' },
    h('button', { class: 'btn pri block', onclick: () => { closeSheet(); go('novo', { d, h: hora, p: prof.id }); } }, 'Agendar cliente neste horário'),
    can(me, 'agenda.bloqueio', { profId: prof.id }) ? h('button', { class: 'btn block', onclick: () => bloqueioSheet(d, prof, null, hora) }, 'Bloquear horário (ausência, almoço)') : null));
}

function bloqueioSheet(d, prof, b, hora) {
  const me = S.me();
  const podeEditar = can(me, 'agenda.bloqueio', { profId: prof.id });
  const ini = input({ type: 'time', value: b?.inicio || hora || '12:00', step: 300, disabled: !podeEditar });
  const fim = input({ type: 'time', value: b?.fim || fromMin(toMin(hora || '12:00') + 60), step: 300, disabled: !podeEditar });
  const mot = input({ value: b?.motivo || 'Almoço', maxlength: 60, disabled: !podeEditar });
  sheet(b ? 'Bloqueio de agenda' : 'Novo bloqueio', h('div', { class: 'stack' },
    h('p', { class: 'muted' }, `${prof.nome} · ${fmtDate(d)}`),
    h('div', { class: 'row2' }, field('Início', ini), field('Fim', fim)), field('Motivo', mot)),
    podeEditar ? [b ? dangerBtn('Remover', () => run(() => S.removerBloqueio(b.id), 'Bloqueio removido').then(() => { closeSheet(); rerender(); })) : null,
      h('button', { class: 'btn pri', onclick: () => run(() => S.salvarBloqueio({ id: b?.id, profId: prof.id, data: d, inicio: ini.value, fim: fim.value, motivo: mot.value }), 'Bloqueio salvo').then(() => { closeSheet(); rerender(); }) }, 'Salvar')] : null);
}

export function waLink(cel, text) {
  const n = e164(cel);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
export const telLink = (cel) => { const n = e164(cel); return n ? 'tel:+' + n : null; };
export function mensagemLembrete(itens) {
  const e = S.est();
  const c = itens[0];
  const nome = (S.nomeCliente(c) || '').split(' ')[0];
  const d = c.data === today() ? 'hoje' : c.data === addDays(today(), 1) ? 'amanhã' : `no dia ${parseDate(c.data).toLocaleDateString('pt-BR')}`;
  const servs = itens.map((i) => `${i.nome} às ${i.hora} com ${S.nomeProf(i.profId).split(' ')[0]}`).join('; ');
  return `Olá, ${nome}! Lembrete do seu horário ${d} no ${e.nome}: ${servs}. Podemos confirmar?${e.tel1 ? ` Contato: ${e.tel1}` : ''}`;
}

function lembretes(d) {
  const dias = [d, addDays(d, 1)];
  const blocks = dias.map((dia) => {
    const its = pendentesLembrete(dia);
    const porComanda = new Map();
    for (const i of its) { if (!porComanda.has(i.comandaId)) porComanda.set(i.comandaId, []); porComanda.get(i.comandaId).push(i); }
    return h('div', null, h('h3', { class: 'hour' }, `${relDay(dia)} · ${fmtDate(dia)}`),
      porComanda.size ? [...porComanda.values()].map((list) => {
        list.sort((a, b) => a.hora.localeCompare(b.hora));
        const cli = list[0].cliId ? S.cliente(list[0].cliId) : null;
        const podeContato = cli && can(S.me(), 'cliente.contatos', { ehMeuCliente: S.ehMeuCliente(cli.id) });
        const link = podeContato ? waLink(cli.cel, mensagemLembrete(list)) : null;
        return h('div', { class: 'card pad stack-s' }, h('b', null, `${list[0].hora} · ${S.nomeCliente(list[0])}`), h('p', { class: 'muted small' }, mensagemLembrete(list)),
          h('div', { class: 'acts-row' },
            link ? h('a', { class: 'btn ok sm', href: link, target: '_blank', rel: 'noopener noreferrer', onclick: () => setTimeout(() => S.marcarNotificado(list.map((i) => i.id)).then(() => { closeSheet(); rerender(); }), 300) }, icon('whats', 18), 'Abrir no WhatsApp')
              : h('span', { class: 'muted small' }, cli ? (podeContato ? 'Cliente sem celular.' : 'Sem permissão para ver o contato.') : 'Cliente avulso, sem contato.'),
            h('button', { class: 'btn sm', onclick: () => run(() => S.marcarNotificado(list.map((i) => i.id)), 'Marcado como avisado').then(() => { closeSheet(); rerender(); }) }, 'Marcar avisado')));
      }) : h('p', { class: 'muted' }, 'Nenhum lembrete pendente.'));
  });
  sheet('Lembretes por WhatsApp', h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'O botão abre o WhatsApp com a mensagem pronta. Envie e o cliente fica marcado como avisado.'), blocks));
}

