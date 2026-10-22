// Equipe: lista com saldo e ficha do profissional (conta corrente e comissões pendentes).
import { money, parseMoney, fmtDate, h } from '../base.js';
import { can } from '../../../../domain/permissoes.js';
import { FORMAS, FORMAS_CAIXA } from '../../../../domain/financeiro.js';
import { NeedCaixa } from '../../../../application/erros.js';
import { route, go, sheet, closeSheet, toast, field, input, select, avatar, emptyState, tabs, rerender } from '../kit.js';
import { movRow } from './clientes.js';
import { abrirCaixaSheet } from './comanda.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição

export function registerEquipe(app) {
  S = app;
  route('equipe', () => {
    const me = S.me();
    const lista = S.profs().filter((p) => can(me, 'equipe.ver', { profId: p.id }));
    if (!lista.length) return { title: 'Equipe', body: emptyState('lock', 'Sem acesso à conta da equipe', '') };
    return { title: 'Equipe', body: h('div', { class: 'card' },
      h('div', { class: 'thead' }, h('b', null, 'Profissional'), h('b', null, 'Saldo')),
      lista.map((p) => { const s = S.saldo('prof:' + p.id); return h('button', { class: 'prow', onclick: () => go('profissional', { id: p.id }) }, avatar(p, 46), h('span', { class: 'pn' }, h('b', null, p.nome), h('small', null, p.area)), h('span', { class: 'pv' + (s ? '' : ' muted') }, money(s))); })) };
  });

  route('profissional', ({ id, t = 'conta' }) => {
    const me = S.me();
    const p = S.prof(id || me.id);
    if (!p || !can(me, 'equipe.ver', { profId: p.id })) return { title: 'Ficha do profissional', back: 'equipe', body: emptyState('lock', 'Sem acesso', 'Você não tem permissão para ver esta conta.') };
    const s = S.saldo('prof:' + p.id);
    const head = h('div', { class: 'cli-head' }, avatar(p, 58), h('div', null, h('b', { class: 'big' }, p.nome), h('span', { class: 'saldo ' + (s >= 0 ? 'pos solid' : 'neg') }, money(s))));
    const tb = tabs([['conta', 'Conta corrente', () => go('profissional', { id: p.id, t: 'conta' })], ['pend', 'Comissões pendentes', () => go('profissional', { id: p.id, t: 'pend' })]], t);
    let body;
    if (t === 'pend') {
      // Atendimentos já realizados que ainda não foram fechados: comissão prevista.
      const pend = S.comissoesPrevistas(p.id);
      body = pend.length ? h('div', { class: 'card' }, pend.map((i) => h('button', { class: 'mov', onclick: () => go('comanda', { id: i.comandaId }) },
        h('div', { class: 'mov-c' }, h('small', { class: 'muted' }, `${fmtDate(i.data)} · ${i.hora}`), h('b', null, i.nome), h('span', null, 'Cliente: ' + S.nomeCliente(i))),
        h('div', { class: 'mov-r' }, h('b', null, money(i.comissaoPrevista)), h('small', { class: 'muted' }, 'prevista')))))
        : emptyState('chart', 'Sem resultados', 'Não existem comissões pendentes.');
    } else {
      const podeMov = can(me, 'equipe.movimentos', { profId: p.id });
      const ls = podeMov ? S.lancs('prof:' + p.id) : [];
      const ent = ls.filter((l) => l.valor > 0), sai = ls.filter((l) => l.valor < 0);
      let acc = s;
      body = h('div', { class: 'stack' },
        podeMov ? h('div', { class: 'card pad row2' }, h('div', null, h('small', { class: 'in-t' }, `Entradas | ${ent.length}`), h('div', null, money(ent.reduce((a, l) => a + l.valor, 0)))), h('div', null, h('small', { class: 'out-t' }, `Saídas | ${sai.length}`), h('div', null, money(sai.reduce((a, l) => a + l.valor, 0))))) : h('p', { class: 'muted' }, 'Você pode ver apenas o saldo.'),
        podeMov ? (ls.length ? h('div', { class: 'card' }, ls.map((l) => { const ap = acc; acc -= l.valor; return movRow(l, ap); })) : emptyState('money', 'Sem movimentos', 'As comissões aparecem aqui quando as comandas são fechadas.')) : null);
    }
    const podeLancar = can(me, 'equipe.lancar') || can(me, 'equipe.recibo');
    return { title: 'Ficha do profissional', back: 'equipe', body: h('div', { class: 'stack' }, head, tb, body), fab: podeLancar && t === 'conta' ? { label: 'Lançar movimento', onclick: () => lancarProf(p) } : null };
  });
}

function lancarProf(p) {
  const me = S.me();
  const tipos = [
    can(me, 'equipe.recibo') ? ['recibo', 'Recibo (pagar o profissional — sai do caixa)'] : null,
    can(me, 'equipe.lancar') ? ['adiantamento', 'Adiantamento (sai do caixa)'] : null,
    can(me, 'equipe.lancar') ? ['credito', 'Outros — crédito'] : null,
    can(me, 'equipe.lancar') ? ['debito', 'Outros — débito'] : null,
  ].filter(Boolean);
  const tp = select(tipos, tipos[0][0]);
  const v = input({ inputmode: 'decimal', placeholder: '0,00' });
  const f = select(FORMAS_CAIXA.map((k) => [k, FORMAS[k]]), 'pix');
  const d = input({ maxlength: 120, placeholder: 'Descrição' });
  const s = S.saldo('prof:' + p.id);
  const fill = h('button', { class: 'link small', type: 'button', onclick: () => { v.value = (Math.max(0, s) / 100).toFixed(2).replace('.', ','); } }, `Usar saldo total (${money(Math.max(0, s))})`);
  const go2 = async () => {
    try { await S.lancarProfissional(p.id, { tipo: tp.value, valor: parseMoney(v.value), forma: f.value, desc: d.value }); closeSheet(); toast('Movimento registrado', true); rerender(); }
    catch (e) { if (e instanceof NeedCaixa) abrirCaixaSheet(e.data, go2); else toast(e.message); }
  };
  sheet(`Lançar para ${p.nome}`, h('div', { class: 'stack' }, field('Tipo', tp), field('Valor (R$)', v), fill, field('Forma (quando sai do caixa)', f), field('Descrição', d)), h('button', { class: 'btn pri', onclick: go2 }, 'Lançar'));
}
