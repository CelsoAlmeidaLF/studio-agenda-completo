// Gestão › Produtos: lista, ficha (informações, consumo, venda) e comissões de venda (RN-54 a RN-59).
import { h, icon, money, parseMoney, centsToInput, fmtDateTime, norm } from '../base.js';
import { can } from '../../../../domain/permissoes.js';
import { UNIDADES_CONSUMO } from '../../../../domain/financeiro.js';
import { route, go, sheet, closeSheet, toast, run, field, input, select, emptyState, rerender, pill, avatar, telaLarga } from '../kit.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição

const ATIVO = '#16a34a', INATIVO = '#7d7f86';
const deny = (t) => ({ title: t, back: 'gestao', body: emptyState('lock', 'Sem permissão', 'Peça ao gestor para liberar o acesso.') });

export function registerProdutos(app) {
  S = app;

  // ---------- Lista de produtos ----------
  route('produtos', ({ q = '' }) => {
    if (!can(S.me(), 'gestao.itens')) return deny('Produtos');
    const fab = { label: 'Novo produto', onclick: () => infoSheet(null) };
    const sub = `${S.produtos(true).length} cadastrados`;
    // Tela larga: lista à esquerda e a ficha escolhida à direita.
    if (telaLarga()) return { title: 'Produtos', sub, back: 'gestao', layout: 'largo', fab,
      body: h('div', { class: 'split' }, h('div', { class: 'mestre' }, listaProdutos(q, null)), h('div', { class: 'card' }, emptyState('box', 'Escolha um produto', 'A ficha aparece aqui, ao lado da lista.'))) };
    return { title: 'Produtos', sub, back: 'gestao', body: listaProdutos(q, null), fab };
  });

  // ---------- Ficha do produto ----------
  route('produto', ({ id }) => {
    if (!can(S.me(), 'gestao.itens')) return deny('Produto');
    const p = S.produto(id);
    if (!p) return { title: 'Produto', back: 'produtos', body: emptyState('box', 'Produto não encontrado', '') };
    const ficha = fichaProduto(p);
    if (telaLarga()) return { title: 'Produtos', sub: p.nome, back: 'gestao', layout: 'largo', fab: { label: 'Novo produto', onclick: () => infoSheet(null) },
      body: h('div', { class: 'split' }, h('div', { class: 'mestre' }, listaProdutos('', p.id)), h('div', { class: 'detalhe' }, ficha)) };
    return { title: 'Ficha do produto', back: 'produtos', body: ficha };
  });

  // ---------- Comissões de venda ----------
  route('produto-comissoes', ({ id }) => {
    if (!can(S.me(), 'gestao.itens')) return deny('Comissões de venda');
    const p = S.produto(id);
    if (!p) return { title: 'Comissões de venda', back: 'produtos', body: emptyState('box', 'Produto não encontrado', '') };
    const areas = new Map();
    for (const x of S.profs()) { if (!areas.has(x.area)) areas.set(x.area, []); areas.get(x.area).push(x); }
    const body = h('div', { class: 'stack' },
      h('div', { class: 'card pad pricebox' }, h('span', null, h('b', null, p.nome), h('small', { class: 'muted block' }, p.venda.ativo ? 'Preço de venda' : 'Venda inativa')), h('b', { class: 'big' }, money(p.venda.preco))),
      h('p', { class: 'muted small' }, 'A comissão é paga a quem vendeu o produto, calculada sobre o valor do item depois do desconto. Sem comissão = 0%.'),
      [...areas].map(([area, ps]) => h('div', null, h('h3', { class: 'gtitle' }, area), h('div', { class: 'card' }, ps.map((x) => {
        const pct = Number(p.comissoes?.[x.id] || 0);
        return h('button', { class: 'prow', onclick: () => comissaoSheet(p, x) }, avatar(x, 40),
          h('span', { class: 'pn' }, h('b', null, x.nome), h('small', null, pct ? `${money(Math.round(p.venda.preco * pct / 100))} por unidade vendida` : 'Toque para definir')),
          pct ? pill(`${pct}%`, ATIVO) : pill('Sem comissão', INATIVO));
      })))));
    return { title: 'Comissões de venda', sub: p.nome, back: () => go('produto', { id }), body };
  });
}

// Lista agrupada por categoria, com busca por nome, categoria ou código. "sel" destaca o produto aberto (tela larga).
function listaProdutos(q0, sel) {
  const q = input({ placeholder: 'Buscar produto', 'aria-label': 'Buscar produto', maxlength: 60, class: 'inp search', value: q0 });
  const box = h('div', { class: 'stack' });
  const draw = () => {
    const t = norm(q.value.trim());
    const all = S.produtos(true).filter((p) => !t || norm(p.nome).includes(t) || norm(p.categoria).includes(t) || String(p.codigo) === t.replace(/^#/, ''));
    const cats = new Map();
    for (const p of all) { if (!cats.has(p.categoria)) cats.set(p.categoria, []); cats.get(p.categoria).push(p); }
    box.replaceChildren(...(all.length ? [...cats].map(([c, ps]) => h('div', null,
      h('h3', { class: 'gtitle' }, c, h('small', { class: 'muted' }, ` · ${ps.length}`)),
      h('div', { class: 'card' }, ps.map((p) => h('button', { class: 'srow' + (p.ativo === false ? ' off' : '') + (p.id === sel ? ' on' : ''), 'aria-current': p.id === sel ? 'true' : null, onclick: () => go('produto', { id: p.id }) },
        h('span', null, h('b', null, p.nome), h('small', null, [p.venda?.ativo ? `Venda ${money(p.venda.preco)}` : 'Sem venda', `Uso interno ${money(p.consumo?.precoInterno || 0)}`, p.ativo === false ? 'inativo' : ''].filter(Boolean).join(' | '))),
        p.venda?.ativo && p.ativo !== false ? h('span', { class: 'ic-cart', title: 'À venda', 'aria-label': 'À venda' }, icon('cart', 18)) : null,
        icon('right', 16, 'chev')))))) : [emptyState('box', t ? 'Nenhum produto encontrado' : 'Nenhum produto', t ? 'Tente outro nome, categoria ou código.' : 'Toque em + para cadastrar.')]));
  };
  q.addEventListener('input', draw);
  draw();
  return h('div', null, h('div', { class: 'searchbar' }, icon('search', 20), q), box);
}

function fichaProduto(p) {
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, k), h('b', null, v));
  const sec = (titulo, ic, conteudo, onEdit, extra) => h('details', { class: 'card perm', open: true },
    h('summary', null, h('span', { class: 'sec-t' }, icon(ic, 20), h('b', null, titulo)), extra || null, icon('down', 18, 'chev')),
    h('div', { class: 'pad stack-s' }, conteudo, onEdit ? h('button', { class: 'link right block with-ic', onclick: onEdit }, icon('edit', 16), 'Editar') : null));
  const nCom = Object.values(p.comissoes || {}).filter((x) => x > 0).length;
  return h('div', { class: 'stack' },
    h('div', { class: 'prod-head' },
      h('span', { class: 'prod-ic' }, icon('box', 34)),
      h('div', null, h('b', { class: 'big' }, p.nome), h('small', { class: 'muted block' }, p.categoria), p.ativo === false ? pill('Inativo', INATIVO) : pill('Ativo', ATIVO))),
    sec('Informações básicas', 'info', [kv('Nome', p.nome), kv('Categoria', p.categoria), kv('Código', '#' + p.codigo)], () => infoSheet(p)),
    sec('Consumo', 'scissors', [kv('Unidade de consumo', p.consumo.unidade), kv('Preço para uso interno', money(p.consumo.precoInterno)), kv('Preço para profissionais', money(p.consumo.precoProf)),
      h('p', { class: 'muted small' }, 'Preço de uso interno: custo do produto usado nos serviços. Preço para profissionais: valor cobrado quando o profissional compra para si. São só referências: não movimentam caixa nem estoque.')], () => consumoSheet(p)),
    sec('Venda', 'cart', [kv('Venda', p.venda.ativo ? 'Ativa' : 'Inativa'), kv('Preço de venda', p.venda.ativo ? money(p.venda.preco) : '—')], () => vendaSheet(p), p.venda.ativo ? pill('Ativa', ATIVO) : pill('Inativa', INATIVO)),
    h('button', { class: 'card navrow', onclick: () => go('produto-comissoes', { id: p.id }) },
      h('span', { class: 'sec-t' }, icon('equipe', 20), h('span', null, h('b', null, 'Comissões de venda'), h('small', { class: 'muted block' }, nCom ? `${nCom} profissional(is) com comissão` : 'Nenhum profissional com comissão'))), icon('right', 16, 'chev')),
    h('button', { class: 'btn block ' + (p.ativo === false ? 'pri' : 'danger'), onclick: () => run(() => S.alternarProduto(p.id), p.ativo === false ? 'Produto ativado' : 'Produto desativado').then(rerender).catch(() => {}) }, p.ativo === false ? 'Ativar produto' : 'Desativar produto'),
    h('div', { class: 'meta muted small' },
      h('p', null, `Produto #${p.codigo}`),
      h('p', null, `Criado em ${fmtDateTime(p.criadoEm)} · Por ${S.nomeProf(p.criadoPor)}`),
      h('p', null, `Última alteração em ${fmtDateTime(p.alteradoEm)} · Por ${S.nomeProf(p.alteradoPor)}`)));
}

function infoSheet(p) {
  const n = input({ value: p?.nome || '', maxlength: 80 });
  const cat = input({ value: p?.categoria || '', maxlength: 40, list: 'pcats', placeholder: 'Ex.: Home care' });
  const dl = h('datalist', { id: 'pcats' }, [...new Set(S.produtos(true).map((x) => x.categoria))].map((c) => h('option', { value: c })));
  sheet(p ? 'Informações básicas' : 'Novo produto', h('div', { class: 'stack' }, field('Nome', n), field('Categoria', cat), dl,
    p ? null : h('p', { class: 'muted small' }, 'Depois de salvar, defina o consumo, a venda e as comissões na ficha do produto.')),
  h('button', { class: 'btn pri', onclick: () => run(() => S.salvarProduto({ id: p?.id, nome: n.value, categoria: cat.value }), 'Produto salvo').then((obj) => { closeSheet(); p ? rerender() : go('produto', { id: obj.id }); }).catch(() => {}) }, 'Salvar'));
}

function consumoSheet(p) {
  const un = select(UNIDADES_CONSUMO.map((u) => [u, u]), p.consumo.unidade);
  const pi = input({ inputmode: 'decimal', value: centsToInput(p.consumo.precoInterno) });
  const pp = input({ inputmode: 'decimal', value: centsToInput(p.consumo.precoProf) });
  sheet('Consumo', h('div', { class: 'stack' }, field('Unidade de consumo', un), field('Preço para uso interno (R$)', pi), field('Preço para profissionais (R$)', pp)),
    h('button', { class: 'btn pri', onclick: () => {
      const a = parseMoney(pi.value || '0'), b = parseMoney(pp.value || '0');
      if (!(a >= 0 && b >= 0)) return toast('Preço inválido.');
      run(() => S.salvarProduto({ id: p.id, consumo: { unidade: un.value, precoInterno: a, precoProf: b } }), 'Consumo salvo').then(() => { closeSheet(); rerender(); }).catch(() => {});
    } }, 'Salvar'));
}

function vendaSheet(p) {
  const at = h('input', { type: 'checkbox', id: 'vat', checked: !!p.venda.ativo });
  const pr = input({ inputmode: 'decimal', value: p.venda.preco ? centsToInput(p.venda.preco) : '', placeholder: '0,00' });
  sheet('Venda', h('div', { class: 'stack' }, h('label', { class: 'chk', for: 'vat' }, at, h('span', null, 'Produto disponível para venda na comanda')), field('Preço de venda (R$)', pr)),
    h('button', { class: 'btn pri', onclick: () => {
      const v = parseMoney(pr.value || '0');
      if (!(v >= 0)) return toast('Preço inválido.');
      run(() => S.salvarProduto({ id: p.id, venda: { ativo: at.checked, preco: v } }), 'Venda salva').then(() => { closeSheet(); rerender(); }).catch(() => {});
    } }, 'Salvar'));
}

function comissaoSheet(p, prof) {
  const pc = input({ type: 'number', min: 0, max: 100, step: 0.5, value: p.comissoes?.[prof.id] || 0, inputmode: 'decimal' });
  const prev = h('p', { class: 'muted small' });
  const upd = () => { const n = Number(pc.value) || 0; prev.textContent = `Por unidade vendida: ${money(Math.round(p.venda.preco * n / 100))}`; };
  pc.addEventListener('input', upd); upd();
  sheet(`Comissão de ${prof.nome}`, h('div', { class: 'stack' }, field('Comissão de venda (%)', pc, '0 = sem comissão.'), prev),
    h('button', { class: 'btn pri', onclick: () => run(() => S.salvarComissaoProduto(p.id, prof.id, pc.value), 'Comissão salva').then(() => { closeSheet(); rerender(); }).catch(() => {}) }, 'Salvar'));
}
