// Agendar/Vender, adicionar à comanda, comanda, status, fechamento e pagamento.
import { h, icon, today, toMin, fromMin, money, parseMoney, centsToInput, norm, fmtPhone, fmtDate, onlyDigits } from '../base.js';
import { can } from '../../../../domain/permissoes.js';
import { STATUS, nextStatuses, isActive } from '../../../../domain/agenda.js';
import { FORMAS, comandaTotals } from '../../../../domain/financeiro.js';
import { isCelular } from '../../../../domain/validacao.js';
import { NeedCaixa } from '../../../../application/erros.js';
import { route, go, sheet, closeSheet, toast, run, field, input, select, avatar, pill, emptyState, dangerBtn, rerender } from '../kit.js';
import { dayTitle, waLink, telLink } from './agenda.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição

// Rascunhos só em memória (não vão para a URL nem para o disco).
let selecao = null;        // cliente escolhido no fluxo Agendar/Vender
const rascunhos = new Map(); // comandaId -> dados do fechamento

// O rascunho acompanha a comanda: itens incluídos ou excluídos depois de abrir o fechamento
// entram ou saem dele, e o que já foi digitado (preço, desconto) nos itens que continuam é mantido.
function rascunhoAtual(id) {
  const base = S.previaFechamento(id);
  const r = rascunhos.get(id);
  if (!r) return { linhas: base, gorjeta: { profId: '', valor: 0 }, data: today() };
  const antes = new Map(r.linhas.map((l) => [l.itemId, l]));
  const linhas = base.map((l) => antes.get(l.itemId) || l);
  const gorjeta = linhas.some((l) => l.profId === r.gorjeta.profId) ? r.gorjeta : { profId: '', valor: 0 };
  return { ...r, linhas, gorjeta };
}
const mesmosItens = (a, b) => a.length === b.length && a.every((l, i) => l.itemId === b[i].itemId);

export function registerComanda(app) {
  S = app;
  // ---------- Agendar / Vender: buscar cliente ----------
  route('novo', ({ d = today(), h: hora, p }) => {
    const q = input({ placeholder: 'Nome ou celular do cliente', 'aria-label': 'Nome ou celular do cliente', maxlength: 80, class: 'inp search' });
    const res = h('div', { class: 'results' });
    const seguir = (sel) => { selecao = sel; go('adicionar', { d, h: hora, p }); };
    const draw = () => {
      res.replaceChildren();
      const t = q.value.trim();
      if (t.length < 2) { res.append(emptyState('clientes', '', 'Escreva o nome ou o celular do cliente.')); return; }
      const ehNumero = onlyDigits(t).length >= 8 && !/[a-z]/i.test(t);
      res.append(
        h('button', { class: 'bigopt pri', onclick: () => novoClienteSheet(ehNumero ? '' : t, ehNumero ? t : '', seguir) }, h('span', null, h('small', null, 'Criar novo cliente com o nome:'), h('b', null, ehNumero ? 'Novo cliente' : t)), icon('right', 26)),
        h('button', { class: 'bigopt', onclick: () => seguir({ avulso: ehNumero ? 'Cliente avulso' : t }) }, h('span', null, h('small', null, 'Avançar com cliente avulso'), h('b', null, ehNumero ? 'Cliente avulso' : t)), icon('right', 26)));
      const found = S.buscarClientes(t);
      if (found.length) {
        res.append(h('p', { class: 'lbl' }, 'Escolher um cliente existente:'));
        for (const c of found) {
          const podeVer = can(S.me(), 'cliente.contatos', { ehMeuCliente: S.ehMeuCliente(c.id) });
          res.append(h('button', { class: 'clirow', onclick: () => seguir({ cliId: c.id }) }, hl(c.nome, t), h('small', null, podeVer && c.cel ? fmtPhone(c.cel) : '')));
        }
      }
    };
    q.addEventListener('input', draw);
    draw();
    return { title: 'Agendar / Vender', back: () => go('agenda', { d }), body: h('div', null, h('div', { class: 'searchbar' }, q), res), after: () => q.focus() };
  });

  // ---------- Adicionar à comanda ----------
  route('adicionar', ({ d = today(), h: hora, p, item: itemId, tab }) => {
    const me = S.me();
    const atual = itemId ? S.item(itemId) : null;
    if (atual) selecao = atual.cliId ? { cliId: atual.cliId } : { avulso: atual.avulso };
    if (!selecao) { go('novo', { d }); return { title: '', body: h('div') }; }
    if (tab === 'produto' || atual?.tipo === 'produto') return produtoForm({ d, p, atual });
    const cli = selecao.cliId ? S.cliente(selecao.cliId) : null;
    const nomeCli = cli?.nome || selecao.novoNome || selecao.avulso;
    const favs = new Set(cli?.favoritos || []);
    const profsOk = S.profs().filter((x) => x.atende !== false && can(me, 'agenda.editar', { profId: x.id }))
      .sort((a, b) => (favs.has(b.id) - favs.has(a.id)) || a.nome.localeCompare(b.nome));
    if (!profsOk.length) return { title: 'Adicionar à comanda', back: true, body: emptyState('lock', 'Sem permissão para agendar', '') };
    const di = input({ type: 'date', value: atual?.data || d, required: true });
    const hi = input({ type: 'time', value: atual?.hora || hora || '09:00', step: 300, required: true });
    const ps = select(profsOk.map((x) => [x.id, `${x.nome} · ${x.area}${favs.has(x.id) ? ' · favorito' : ''}`]), atual?.profId || p || (profsOk.find((x) => x.id === me.id) || profsOk[0]).id);
    const soDoProf = h('input', { type: 'checkbox', id: 'sdp', checked: true });
    const ss = select([], '');
    const precoI = can(me, 'preco.editar') ? input({ inputmode: 'decimal', placeholder: 'Preço do serviço' }) : null;
    const nota = h('textarea', { class: 'inp', maxlength: 300, rows: 2, placeholder: 'Notas internas (não aparecem para o cliente)' }, atual?.nota || '');
    const resumo = h('p', { class: 'muted small' });
    const fillSrv = () => {
      const lista = S.servicos().filter((s) => !soDoProf.checked || !s.profs?.length || s.profs.includes(ps.value));
      const prev = ss.value || atual?.srvId;
      ss.replaceChildren(...groupOptions(lista));
      if (prev && lista.some((s) => s.id === prev)) ss.value = prev;
      upd();
    };
    const upd = () => {
      const s = S.servico(ss.value);
      if (!s) { resumo.textContent = 'Nenhum serviço disponível para este profissional.'; return; }
      if (precoI && !precoI.dataset.touched) precoI.value = centsToInput(atual?.srvId === s.id ? atual.preco : s.preco);
      resumo.textContent = `${s.duracao} min · termina às ${fromMin(toMin(hi.value || '00:00') + s.duracao)} · ${money(precoI ? parseMoney(precoI.value) : s.preco)}`;
    };
    ps.addEventListener('change', fillSrv); soDoProf.addEventListener('change', fillSrv); ss.addEventListener('change', () => { if (precoI) delete precoI.dataset.touched; upd(); }); hi.addEventListener('input', upd);
    precoI?.addEventListener('input', () => { precoI.dataset.touched = '1'; upd(); });
    fillSrv();
    const fav = cli ? h('button', { class: 'hbtn fav', type: 'button', 'aria-label': 'Profissional favorito do cliente', onclick: async () => {
      try { const on = await S.alternarFavorito(cli.id, ps.value); on ? favs.add(ps.value) : favs.delete(ps.value); paintFav(); toast(on ? 'Marcado como favorito' : 'Removido dos favoritos', true); } catch (e) { toast(e.message); }
    } }, icon('heart', 22)) : null;
    const paintFav = () => { if (!fav) return; const on = favs.has(ps.value); fav.classList.toggle('on', on); fav.setAttribute('aria-pressed', String(on)); };
    ps.addEventListener('change', paintFav); paintFav();
    const salvar = async () => {
      const preco = precoI ? parseMoney(precoI.value) : null;
      if (precoI && !(preco >= 0)) return toast('Preço inválido.');
      const it = await run(() => S.agendar({ itemId, ...selecao, data: di.value, hora: hi.value, profId: ps.value, srvId: ss.value, nota: nota.value, preco }), atual ? 'Agendamento atualizado' : 'Adicionado à comanda');
      selecao = null;
      go('comanda', { id: it.comandaId });
    };
    return {
      title: atual ? 'Editar item' : 'Adicionar à comanda…', sub: nomeCli, back: true,
      body: h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); salvar().catch(() => {}); } },
        atual ? null : segTabs('servico', { d, h: hora, p }),
        h('div', { class: 'card pad row2' }, field('Data', di), field('Hora', hi)),
        h('div', { class: 'row-end' }, field('Profissional', ps), fav),
        h('label', { class: 'chk', for: 'sdp' }, soDoProf, h('span', null, 'Mostrar só os serviços executados por este profissional')),
        field('Serviço', ss), precoI ? field('Preço (R$)', precoI) : null, resumo,
        field('Notas internas', nota),
        h('button', { class: 'btn pri block', type: 'submit' }, atual ? 'Salvar alterações' : 'Salvar na comanda')),
    };
  });

  // ---------- Comanda ----------
  route('comanda', ({ id }) => {
    const c = S.comanda(id);
    if (!c) return { title: 'Comanda', back: () => go('agenda'), body: emptyState('list', 'Comanda não encontrada', 'Ela pode ter sido excluída.') };
    const me = S.me();
    const itens = S.itensDaComanda(id);
    const cli = c.cliId ? S.cliente(c.cliId) : null;
    const podeContato = cli && can(me, 'cliente.contatos', { ehMeuCliente: S.ehMeuCliente(cli.id) });
    const ativos = itens.filter(isActive);
    const total = ativos.reduce((s, i) => s + i.preco, 0);
    const fech = c.fechId ? S.fechamento(c.fechId) : null;
    const saldoCli = cli && can(me, 'cliente.saldo') ? S.saldo('cli:' + cli.id) : null;
    const head = h('div', { class: 'cli-head span-2' },
      h('button', { class: 'link-plain', onclick: () => cli && go('cliente', { id: cli.id }), disabled: !cli }, h('b', { class: 'big' }, S.nomeCliente(c)), saldoCli != null ? h('span', { class: 'saldo' + (saldoCli < 0 ? ' neg' : saldoCli > 0 ? ' pos' : '') }, money(saldoCli)) : null, !cli ? h('small', { class: 'muted' }, 'Cliente avulso') : null),
      podeContato && cli.cel ? h('div', { class: 'acts-row' },
        h('a', { class: 'circ wa', href: waLink(cli.cel, `Olá, ${cli.nome.split(' ')[0]}!`), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Abrir WhatsApp' }, icon('whats', 22)),
        h('a', { class: 'circ tel', href: telLink(cli.cel), 'aria-label': 'Ligar' }, icon('phone', 22))) : null);
    const cards = itens.map((it) => {
      if (it.tipo === 'produto') return produtoCard(it, c, id);
      const podeEd = can(me, 'agenda.editar', { profId: it.profId });
      return h('div', { class: 'card item' + (it.nota ? ' hl' : '') + (it.status === 'cancelado' ? ' off' : '') },
        h('div', { class: 'item-h' }, h('span', { class: 'hr' }, it.hora, h('small', null, ` - ${fromMin(toMin(it.hora) + it.duracao)}`)),
          h('button', { class: 'stbtn', style: { '--sc': STATUS[it.status].cor }, disabled: !podeEd || it.status === 'pago', onclick: () => statusSheet(it) }, STATUS[it.status].nome, it.status !== 'pago' && podeEd ? icon('down', 16) : null)),
        h('div', { class: 'item-r' }, icon('scissors', 20), h('b', null, it.nome), h('span', { class: 'muted' }, money(it.preco))),
        h('div', { class: 'item-r' }, avatar(S.prof(it.profId), 24), h('span', null, S.nomeProf(it.profId))),
        it.nota ? h('div', { class: 'item-r note-i' }, icon('edit', 18), h('i', null, it.nota)) : null,
        podeEd && it.status !== 'pago' ? h('div', { class: 'acts-row end' },
          h('button', { class: 'btn sm', onclick: () => go('adicionar', { item: it.id }) }, icon('edit', 16), 'Editar'),
          dangerBtn('Excluir', () => run(() => S.removerItem(it.id), 'Item excluído').then(() => (aindaVisivel(id) ? rerender() : go('agenda', { d: c.data }))), 'btn sm danger')) : null);
    });
    let footer = null;
    if (c.status === 'aberta' && S.podeFechar(id)) footer = h('button', { class: 'bar pri', onclick: () => go('fechamento', { id }) }, h('span', null, 'Fechamento'), h('b', null, money(total)));
    else if (fech) footer = h('div', { class: 'stack-s' }, h('div', { class: 'bar okbar' + (fech.pendente ? ' pend' : '') }, h('span', null, `${fech.pendente ? `Pendente ${money(fech.pendente)}` : 'Pago'} · Fechamento nº ${String(fech.numero).padStart(6, '0')}`), h('b', null, money(fech.total))),
      can(me, 'comanda.anular') ? dangerBtn('Anular fechamento', () => anular(fech.id), 'btn danger block') : null);
    return {
      title: dayTitle(c.data), sub: 'Comanda', back: () => go('agenda', { d: c.data }), layout: 'largo',
      // Tela larga: os itens da comanda ficam em duas colunas.
      body: h('div', { class: 'duo' }, head, cards.length ? cards : h('div', { class: 'span-2' }, emptyState('list', 'Comanda vazia', ''))),
      footer,
      fab: c.status === 'aberta' ? { label: 'Adicionar à comanda', onclick: () => { selecao = c.cliId ? { cliId: c.cliId } : { avulso: c.avulso }; go('adicionar', { d: c.data }); } } : null,
    };
  });

  // ---------- Fechamento ----------
  route('fechamento', ({ id }) => {
    const c = S.comanda(id);
    if (!c || c.status !== 'aberta') { go('comanda', { id }); return { title: '', body: h('div') }; }
    const me = S.me();
    const r = rascunhoAtual(id);
    rascunhos.set(id, r);
    const editPreco = can(me, 'preco.editar');
    const totalEl = h('b', null);
    const btnEl = h('b', null);
    const upd = () => { const t = comandaTotals(r.linhas, r.gorjeta.valor); totalEl.textContent = money(t.total); btnEl.textContent = money(t.total); };
    const linhas = r.linhas.map((l) => {
      const pi = input({ inputmode: 'decimal', value: centsToInput(l.preco), disabled: !editPreco, 'aria-label': `Preço de ${l.nome}` });
      const de = input({ inputmode: 'decimal', value: l.desconto ? centsToInput(l.desconto) : '', placeholder: '0,00', 'aria-label': `Desconto em ${l.nome}` });
      pi.addEventListener('input', () => { const v = parseMoney(pi.value); if (v >= 0) { l.preco = v; upd(); } });
      de.addEventListener('input', () => { const v = parseMoney(de.value); l.desconto = v >= 0 ? v : 0; upd(); });
      return h('div', { class: 'fl' }, h('div', { class: 'fl-n' }, icon(l.tipo === 'produto' ? 'cart' : 'scissors', 18), h('span', null, h('b', null, l.nome), h('small', null, S.nomeProf(l.profId)))),
        h('div', { class: 'fl-v' }, field('Preço', pi), field('Desconto', de)));
    });
    const gp = select([['', 'Sem gorjeta'], ...[...new Set(r.linhas.map((l) => l.profId))].map((pid) => [pid, S.nomeProf(pid)])], r.gorjeta.profId);
    const gv = input({ inputmode: 'decimal', value: r.gorjeta.valor ? centsToInput(r.gorjeta.valor) : '', placeholder: '0,00' });
    const syncG = () => { r.gorjeta = { profId: gp.value, valor: gp.value ? Math.max(0, parseMoney(gv.value) || 0) : 0 }; upd(); };
    gp.addEventListener('change', syncG); gv.addEventListener('input', syncG);
    const di = input({ type: 'date', value: r.data, onchange: () => { r.data = di.value; } });
    upd();
    return {
      title: 'Fechamento', back: () => go('comanda', { id }), layout: 'largo',
      // Tela larga: itens à esquerda; gorjeta, total e data à direita.
      body: h('div', { class: 'duo lado' },
        h('div', { class: 'cli-head span-2' }, h('b', { class: 'big' }, S.nomeCliente(c))),
        h('div', { class: 'card' }, h('div', { class: 'fl-hd' }, h('b', null, fmtDate(c.data, { day: 'numeric', month: 'long', year: 'numeric' })), h('span', null, `${r.linhas.length} itens`)), linhas),
        h('div', { class: 'stack' },
          h('div', { class: 'card pad' }, h('div', { class: 'row2' }, field('Gorjeta para', gp), field('Valor da gorjeta', gv))),
          h('div', { class: 'totrow' }, h('span', null, 'Total a pagar'), totalEl),
          field('Data do fechamento', di, 'Define em que dia o valor entra no caixa.'))),
      footer: h('button', { class: 'bar pri', onclick: () => {
        if (r.linhas.some((l) => l.desconto > l.preco)) return toast('O desconto não pode ser maior que o preço.');
        go('pagamento', { id });
      } }, h('span', null, 'Pagamento'), btnEl),
    };
  });

  // ---------- Pagamento ----------
  route('pagamento', ({ id }) => {
    const c = S.comanda(id);
    const r = rascunhos.get(id);
    if (!c || !r || c.status !== 'aberta') { go('comanda', { id }); return { title: '', body: h('div') }; }
    if (!mesmosItens(r.linhas, S.previaFechamento(id))) { toast('A comanda mudou. Confira o fechamento de novo.'); go('fechamento', { id }); return { title: '', body: h('div') }; }
    const total = comandaTotals(r.linhas, r.gorjeta.valor).total;
    const cred = c.cliId && can(S.me(), 'cliente.saldo') ? Math.max(0, S.saldo('cli:' + c.cliId)) : 0;
    const vals = Object.fromEntries(Object.keys(FORMAS).map((k) => [k, 0]));
    const restanteEl = h('b');
    const inputs = {};
    const upd = () => { const pago = Object.values(vals).reduce((a, b) => a + b, 0); const f = total - pago; restanteEl.textContent = f === 0 ? 'Valor completo' : f > 0 ? `Faltam ${money(f)}` : `Passou ${money(-f)}`; restanteEl.className = f === 0 ? 'ok' : 'warn'; confirmar.disabled = f !== 0;
      if (pendenteBtn) { pendenteBtn.disabled = f <= 0; pendenteTxt.textContent = pago > 0 ? `Registrar e deixar ${money(Math.max(0, f))} pendente` : 'Continuar sem pagamento'; } };
    const pendenteTxt = h('span', null, 'Continuar sem pagamento');
    const pendenteBtn = c.cliId ? h('button', { class: 'bar', onclick: () => finalizar(true) }, pendenteTxt, icon('right', 18)) : null;
    const confirmar = h('button', { class: 'bar pri', onclick: () => finalizar(false) }, h('span', null, 'Confirmar pagamento'), h('b', null, money(total)));
    const rows = Object.entries(FORMAS).filter(([k]) => k !== 'credito_cliente' || (c.cliId && cred > 0)).map(([k, nome]) => {
      const inp = input({ inputmode: 'decimal', placeholder: '0,00', 'aria-label': `Valor em ${nome}` });
      inputs[k] = inp;
      inp.addEventListener('input', () => { const v = parseMoney(inp.value); vals[k] = v > 0 ? v : 0; upd(); });
      const fill = () => { const outros = Object.entries(vals).filter(([x]) => x !== k).reduce((a, [, v]) => a + v, 0); let v = Math.max(0, total - outros); if (k === 'credito_cliente') v = Math.min(v, cred); vals[k] = v; inp.value = centsToInput(v); upd(); inp.focus(); };
      return h('div', { class: 'payrow' + (k === 'pix' ? ' pix' : '') }, h('button', { class: 'payname', onclick: fill, 'aria-label': `Preencher restante em ${nome}` }, h('b', null, nome), k === 'credito_cliente' ? h('small', null, `Disponível ${money(cred)}`) : h('small', null, 'Toque para preencher o restante')), inp);
    });
    async function finalizar(semPagamento) {
      const pagamentos = Object.entries(vals).filter(([, v]) => v > 0).map(([forma, valor]) => ({ forma, valor }));
      try {
        await S.fechar(id, { linhas: r.linhas, gorjeta: r.gorjeta.profId ? r.gorjeta : null, data: r.data, pagamentos, semPagamento });
        rascunhos.delete(id); toast(semPagamento ? 'Comanda fechada com saldo pendente na conta do cliente' : 'Pagamento registrado', true); go('comanda', { id });
      } catch (e) {
        if (e instanceof NeedCaixa) abrirCaixaSheet(e.data, () => finalizar(semPagamento)); else toast(e.message);
      }
    }
    upd();
    return {
      title: 'Pagamento', back: () => go('fechamento', { id }),
      body: h('div', { class: 'stack' }, h('div', { class: 'paytot' }, h('span', null, 'R$'), h('b', null, centsToInput(total))),
        h('p', null, 'Escolha a forma de pagamento (pode dividir entre várias):'), rows, h('p', { class: 'center' }, restanteEl)),
      footer: h('div', { class: 'stack-s' }, confirmar, pendenteBtn),
    };
  });
}

// O estorno sai do caixa de hoje; se ele não foi aberto, pede a abertura e tenta de novo.
async function anular(fechId) {
  try { await S.anularFechamento(fechId); toast('Fechamento anulado e valores estornados', true); rerender(); }
  catch (e) { if (e instanceof NeedCaixa) abrirCaixaSheet(e.data, () => anular(fechId)); else toast(e.message); }
}

export function abrirCaixaSheet(data, then) {
  const me = S.me();
  if (!can(me, 'caixa.abrir')) { toast('O caixa deste dia não foi aberto. Peça a quem tem permissão para abrir o caixa.'); return; }
  const v = input({ inputmode: 'decimal', placeholder: '0,00', 'aria-label': 'Valor inicial do caixa' });
  sheet('Abrir o caixa', h('div', { class: 'stack' }, h('p', null, `O caixa de ${fmtDate(data)} ainda não foi aberto. Informe o valor em dinheiro na gaveta.`), field('Valor inicial (R$)', v)),
    h('button', { class: 'btn pri', onclick: async () => { const c = parseMoney(v.value || '0'); try { await S.abrirCaixa(data, c); closeSheet(); toast('Caixa aberto', true); then?.(); } catch (e) { toast(e.message); } } }, 'Abrir caixa'));
}

// Produto vendido na comanda: sem horário de atendimento e sem status (RN-56).
function produtoCard(it, c, id) {
  const podeEd = can(S.me(), 'produto.vender', { profId: it.profId }) && it.status !== 'pago';
  return h('div', { class: 'card item prod' + (it.nota ? ' hl' : '') },
    h('div', { class: 'item-h' }, h('span', { class: 'hr' }, it.hora, h('small', null, ' · venda')), it.status === 'pago' ? pill('Pago', STATUS.pago.cor) : pill('Produto', 'var(--prod)')),
    h('div', { class: 'item-r' }, icon('cart', 20), h('b', null, `${it.qtd}× ${it.nome}`), h('span', { class: 'muted' }, money(it.preco))),
    h('div', { class: 'item-r' }, avatar(S.prof(it.profId), 24), h('span', null, 'Vendido por ' + S.nomeProf(it.profId))),
    it.nota ? h('div', { class: 'item-r note-i' }, icon('edit', 18), h('i', null, it.nota)) : null,
    podeEd ? h('div', { class: 'acts-row end' },
      h('button', { class: 'btn sm', onclick: () => go('adicionar', { item: it.id }) }, icon('edit', 16), 'Editar'),
      dangerBtn('Excluir', () => run(() => S.removerItem(it.id), 'Produto removido').then(() => (aindaVisivel(id) ? rerender() : go('agenda', { d: c.data }))), 'btn sm danger')) : null);
}

// ---------- Abas Serviço / Produto de "Adicionar à comanda" ----------
function segTabs(on, params) {
  const me = S.me();
  const podeProd = S.profs().some((x) => can(me, 'produto.vender', { profId: x.id }));
  return h('div', { class: 'seg', role: 'tablist' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(on === 'servico'), class: on === 'servico' ? 'on' : '', onclick: () => on !== 'servico' && go('adicionar', { ...params, tab: '' }) }, icon('scissors', 18), 'Serviço'),
    podeProd ? h('button', { type: 'button', role: 'tab', 'aria-selected': String(on === 'produto'), class: on === 'produto' ? 'on' : '', onclick: () => on !== 'produto' && go('adicionar', { ...params, tab: 'produto' }) }, icon('cart', 18), 'Produto') : null);
}

function produtoForm({ d, p, atual }) {
  const me = S.me();
  const cli = selecao.cliId ? S.cliente(selecao.cliId) : null;
  const nomeCli = cli?.nome || selecao.novoNome || selecao.avulso;
  const vendedores = S.profs().filter((x) => can(me, 'produto.vender', { profId: x.id }));
  const lista = S.produtosAVenda();
  const topo = atual ? null : segTabs('produto', { d, p });
  if (!vendedores.length) return { title: 'Adicionar à comanda…', sub: nomeCli, back: true, body: h('div', { class: 'stack' }, topo, emptyState('lock', 'Sem permissão para lançar produtos', 'Peça ao gestor para liberar "Gestão dos produtos nos agendamentos".')) };
  if (!lista.length) return { title: 'Adicionar à comanda…', sub: nomeCli, back: true, body: h('div', { class: 'stack' }, topo, emptyState('cart', 'Nenhum produto à venda', 'Cadastre produtos e ative a venda em Gestão › Lista de produtos.')) };
  const groups = new Map();
  for (const x of lista) { if (!groups.has(x.categoria)) groups.set(x.categoria, []); groups.get(x.categoria).push(x); }
  const ps = h('select', { class: 'inp' }, [...groups].map(([cat, xs]) => h('optgroup', { label: cat }, xs.map((x) => h('option', { value: x.id, selected: atual?.prodId === x.id }, `${x.nome} · ${money(x.venda.preco)}`)))));
  const qtd = input({ type: 'number', min: 1, max: 99, step: 1, value: atual?.qtd || 1, inputmode: 'numeric' });
  const vend = select(vendedores.map((x) => [x.id, `${x.nome} · ${x.area}`]), atual?.profId || p || (vendedores.find((x) => x.id === me.id) || vendedores[0]).id);
  const nota = h('textarea', { class: 'inp', maxlength: 300, rows: 2, placeholder: 'Notas internas (opcional)' }, atual?.nota || '');
  const resumo = h('p', { class: 'totrow' });
  const hint = h('p', { class: 'muted small' });
  const upd = () => {
    const pr = S.produto(ps.value), q = Math.max(0, parseInt(qtd.value, 10) || 0);
    const pct = Number(pr?.comissoes?.[vend.value] || 0);
    resumo.replaceChildren(h('span', null, `${q} × ${money(pr?.venda.preco || 0)}`), h('b', null, money((pr?.venda.preco || 0) * q)));
    hint.textContent = pct ? `Comissão de venda para ${S.nomeProf(vend.value)}: ${pct}%` : `${S.nomeProf(vend.value)} não tem comissão neste produto.`;
  };
  [ps, qtd, vend].forEach((el) => el.addEventListener('input', upd));
  upd();
  const salvar = async () => {
    const it = await run(() => S.venderProduto({ itemId: atual?.id, ...selecao, data: atual?.data || d, prodId: ps.value, qtd: Number(qtd.value), profId: vend.value, nota: nota.value }), atual ? 'Produto atualizado' : 'Produto adicionado à comanda');
    selecao = null; go('comanda', { id: it.comandaId });
  };
  return {
    title: atual ? 'Editar produto' : 'Adicionar à comanda…', sub: nomeCli, back: true,
    body: h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); salvar().catch(() => {}); } },
      topo,
      field('Produto', ps), h('div', { class: 'row2' }, field('Quantidade', qtd), field('Vendido por', vend)), hint, resumo, field('Notas internas', nota),
      h('button', { class: 'btn pri block', type: 'submit' }, atual ? 'Salvar alterações' : 'Salvar na comanda')),
  };
}

function statusSheet(it) {
  const opts = nextStatuses(it.status);
  sheet(`${it.hora} · ${it.nome}`, h('div', { class: 'opts' },
    h('div', { class: 'opt cur' }, h('i', { class: 'dot', style: { '--sc': STATUS[it.status].cor } }), h('b', null, STATUS[it.status].nome), icon('check', 20)),
    opts.map((s) => h('button', { class: 'opt', onclick: () => run(() => S.mudarStatus(it.id, s), `Status: ${STATUS[s].nome}`).then(() => { closeSheet(); rerender(); }) }, h('i', { class: 'dot', style: { '--sc': STATUS[s].cor } }), h('span', null, STATUS[s].nome)))));
}

function novoClienteSheet(nome, cel, seguir) {
  const n = input({ value: nome, maxlength: 80, required: true });
  const t = input({ value: cel, inputmode: 'tel', maxlength: 20, placeholder: '(11) 90000-0000' });
  sheet('Novo cliente', h('div', { class: 'stack' }, field('Nome', n), field('Celular (opcional)', t)),
    h('button', { class: 'btn pri', onclick: () => {
      if (!n.value.trim()) return toast('Informe o nome.');
      const d = onlyDigits(t.value);
      if (d && !isCelular(d)) return toast('Celular inválido. Use DDD + número.');
      if (d && S.celularEmUso(d)) return toast('Já existe um cliente com este celular.');
      closeSheet(); seguir({ novoNome: n.value.trim(), novoCel: d });
    } }, 'Continuar'));
}

// Depois de excluir um item, a comanda pode ter sumido ou deixado de ter itens visíveis.
function aindaVisivel(id) { try { return !!S.comanda(id); } catch { return false; } }

function groupOptions(lista) {
  const groups = new Map();
  for (const s of lista) { if (!groups.has(s.categoria)) groups.set(s.categoria, []); groups.get(s.categoria).push(s); }
  return [...groups].map(([cat, ss]) => h('optgroup', { label: cat }, ss.map((s) => h('option', { value: s.id }, `${s.nome} · ${money(s.preco)} · ${s.duracao} min`))));
}

// Destaca o trecho buscado sem usar HTML.
function hl(nome, q) {
  const i = norm(nome).indexOf(norm(q));
  if (i < 0) return h('span', null, nome);
  return h('span', null, nome.slice(0, i), h('b', null, nome.slice(i, i + q.length)), nome.slice(i + q.length));
}
