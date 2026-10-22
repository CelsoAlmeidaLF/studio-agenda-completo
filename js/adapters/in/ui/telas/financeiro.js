// Financeiro: caixa do dia e relatórios.
import { h, icon, money, parseMoney, today, addDays, fmtDate } from '../base.js';
import { can } from '../../../../domain/permissoes.js';
import { FORMAS, FORMAS_CAIXA } from '../../../../domain/financeiro.js';
import { NeedCaixa } from '../../../../application/erros.js';
import { route, go, sheet, closeSheet, toast, field, input, select, emptyState, navRow, rerender, avatar } from '../kit.js';
import { movRow } from './clientes.js';
import { abrirCaixaSheet } from './comanda.js';
import { dayTitle } from './agenda.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição

export function registerFinanceiro(app) {
  S = app;
  route('financeiro', () => {
    const me = S.me();
    return { title: 'Financeiro', body: h('div', { class: 'card' },
      can(me, 'caixa.ver') ? navRow('Caixa', () => go('caixa')) : null,
      can(me, 'relatorios') ? navRow('Relatórios', () => go('relatorios')) : null,
      can(me, 'equipe.ver', { profId: me.id }) ? navRow('Minha conta corrente', () => go('profissional', { id: me.id })) : null) };
  });

  route('caixa', ({ d = today() }) => {
    const me = S.me();
    if (!can(me, 'caixa.ver')) return { title: 'Caixa', back: 'financeiro', body: emptyState('lock', 'Sem acesso ao caixa', '') };
    const e = S.est();
    const cx = S.caixaDia(d);
    const ls = S.lancsCaixaDia(d);
    const ent = ls.filter((l) => l.valor > 0), sai = ls.filter((l) => l.valor < 0);
    const porForma = new Map();
    for (const l of ls) porForma.set(l.forma || 'outro', (porForma.get(l.forma || 'outro') || 0) + l.valor);
    const cats = h('div', { class: 'card pad stack-s', hidden: true }, [...porForma].map(([f, v]) => h('div', { class: 'kv' }, h('span', null, FORMAS[f] || 'Outros'), h('b', null, money(v)))));
    const resumo = h('div', { class: 'card pad' },
      h('div', { class: 'row2 sep' },
        h('div', null, h('small', { class: 'lbl' }, 'Saldo final'), h('b', { class: 'big ok-t' }, money(S.saldoCaixa(d)))),
        h('div', null, h('small', { class: 'lbl' }, 'Valor inicial'), h('div', { class: 'acts-row' }, h('b', { class: 'big' }, cx ? money(cx.inicial) : e.usaCaixa ? 'Caixa fechado' : '—'),
          e.usaCaixa && !cx && can(me, 'caixa.abrir') ? h('button', { class: 'btn sm', onclick: () => abrirCaixaSheet(d, rerender) }, 'Abrir') : null))),
      h('div', { class: 'row2' },
        h('div', null, h('small', { class: 'in-t' }, `Entradas | ${ent.length}`), h('div', null, money(ent.reduce((a, l) => a + l.valor, 0)))),
        h('div', null, h('small', { class: 'out-t' }, `Saídas | ${sai.length}`), h('div', null, money(sai.reduce((a, l) => a + l.valor, 0))))),
      // O saldo final soma todas as formas; para conferir a gaveta vale só o dinheiro.
      h('div', { class: 'kv gaveta' }, h('span', null, 'Dinheiro na gaveta'), h('b', null, money((cx?.inicial || 0) + ls.filter((l) => l.forma === 'dinheiro').reduce((a, l) => a + l.valor, 0)))));
    return {
      title: 'Caixa', sub: 'Financeiro', back: 'financeiro', layout: 'largo',
      // Tela larga: resumo à esquerda e lançamentos do dia à direita.
      body: h('div', { class: 'duo' },
        h('div', { class: 'datebar span-2' }, h('button', { class: 'hbtn', 'aria-label': 'Dia anterior', onclick: () => go('caixa', { d: addDays(d, -1) }) }, icon('left', 22)),
          h('b', { class: 'grow center' }, dayTitle(d)), h('button', { class: 'hbtn', 'aria-label': 'Próximo dia', disabled: d >= today(), onclick: () => go('caixa', { d: addDays(d, 1) }) }, icon('right', 22))),
        h('div', { class: 'stack' }, resumo,
          h('button', { class: 'link center block muted', onclick: (ev) => { cats.hidden = !cats.hidden; ev.currentTarget.textContent = cats.hidden ? 'Mostrar categorias de pagamento' : 'Ocultar categorias de pagamento'; } }, 'Mostrar categorias de pagamento'),
          cats),
        ls.length ? h('div', { class: 'card' }, ls.map((l) => movRow(l))) : emptyState('money', 'Nenhum lançamento neste dia', '')),
      fab: can(me, 'caixa.lancar') ? { label: 'Lançar entrada ou saída', onclick: () => lancarCaixa(d) } : null,
    };
  });

  route('relatorios', ({ m }) => {
    const me = S.me();
    if (!can(me, 'relatorios')) return { title: 'Relatórios', back: 'financeiro', body: emptyState('lock', 'Sem acesso aos relatórios', '') };
    const ym = m || today().slice(0, 7);
    const r = S.relatorioMes(ym);
    const mi = input({ type: 'month', value: ym, 'aria-label': 'Mês', onchange: (e) => e.target.value && go('relatorios', { m: e.target.value }) });
    const max = Math.max(1, ...r.meses.map((x) => x.v));
    const maxS = Math.max(1, ...r.porSrv.map(([, v]) => v.n));
    const kpi = (t, v) => h('div', { class: 'card pad kpi' }, h('small', null, t), h('b', null, v));
    return {
      title: 'Relatórios', back: 'financeiro', layout: 'largo',
      // Tela larga: indicadores numa linha e os quadros em duas colunas.
      body: h('div', { class: 'duo' }, h('div', { class: 'row-end span-2' }, mi),
        h('div', { class: 'kpis span-2' }, kpi('Faturamento', money(r.fat)), kpi('Atendimentos', String(r.n)), kpi('Ticket médio', money(r.ticket)), kpi('Comissões', money(r.com))),
        h('div', { class: 'card pad' }, h('h3', { class: 'ch' }, 'Evolução do faturamento'),
          h('div', { class: 'bars', role: 'img', 'aria-label': 'Faturamento dos últimos 6 meses: ' + r.meses.map((x) => `${x.label} ${money(x.v)}`).join(', ') },
            r.meses.map((x) => h('div', { class: 'bar-c' + (x.key === ym ? ' cur' : '') }, h('small', null, x.v ? money(x.v).replace(',00', '') : '—'), h('i', { style: { height: Math.round((x.v / max) * 120) + 'px' } }), h('span', null, x.label))))),
        h('div', { class: 'card pad' }, h('h3', { class: 'ch' }, 'Comissão por profissional'),
          r.porProf.size ? [...r.porProf].map(([pid, v]) => h('div', { class: 'kv' }, h('span', { class: 'acts-row' }, avatar(S.prof(pid), 24), `${S.nomeProf(pid)} · ${v.n} atend. · ${money(v.fat)}`), h('b', null, money(v.com)))) : h('p', { class: 'muted' }, 'Sem fechamentos no mês.')),
        h('div', { class: 'card pad' }, h('h3', { class: 'ch' }, 'Serviços mais vendidos'),
          r.porSrv.length ? r.porSrv.slice(0, 10).map(([n, v]) => h('div', { class: 'hb' }, h('div', { class: 'kv' }, h('span', null, n), h('small', null, `${v.n}× · ${money(v.fat)}`)), h('div', { class: 'track' }, h('i', { style: { width: Math.round((v.n / maxS) * 100) + '%' } })))) : h('p', { class: 'muted' }, 'Sem vendas no mês.')),
        h('div', { class: 'card pad' }, h('h3', { class: 'ch' }, 'Recebido por forma de pagamento'),
          r.porForma.size ? [...r.porForma].map(([f, v]) => h('div', { class: 'kv' }, h('span', null, FORMAS[f]), h('b', null, money(v)))) : h('p', { class: 'muted' }, 'Sem pagamentos no mês.')),
        h('div', { class: 'card pad kv span-2' }, h('span', null, 'Clientes atendidos / novos cadastros'), h('b', null, `${r.clientes} / ${r.novos}`))),
    };
  });
}

function lancarCaixa(d) {
  const tp = select([['entrada', 'Entrada'], ['saida', 'Saída (despesa, retirada)']], 'saida');
  const v = input({ inputmode: 'decimal', placeholder: '0,00' });
  const f = select(FORMAS_CAIXA.map((k) => [k, FORMAS[k]]), 'dinheiro');
  const ds = input({ maxlength: 120, placeholder: 'Ex.: compra de materiais' });
  const go2 = async () => {
    try { await S.lancarCaixa({ data: d, tipo: tp.value, valor: parseMoney(v.value), forma: f.value, desc: ds.value }); closeSheet(); toast('Lançamento registrado', true); rerender(); }
    catch (e) { if (e instanceof NeedCaixa) abrirCaixaSheet(e.data, go2); else toast(e.message); }
  };
  sheet('Lançar no caixa', h('div', { class: 'stack' }, h('p', { class: 'muted' }, fmtDate(d)), field('Tipo', tp), field('Valor (R$)', v), field('Forma', f), field('Descrição', ds)), h('button', { class: 'btn pri', onclick: go2 }, 'Lançar'));
}
