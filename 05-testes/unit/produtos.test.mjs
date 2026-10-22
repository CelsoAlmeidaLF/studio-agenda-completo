// Testes unitários de produtos (RN-54 a RN-60, CA-06 e CA-07). Rodar: node --test 05-testes/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import { prontoComoAdmin, entrarComo } from './apoio.mjs';
import { can, PERM_PROFISSIONAL } from '../../04-pwa/js/domain/permissoes.js';

const DIA = '2026-10-22';
const gel = (m) => m.app.produtos().find((p) => p.nome === 'Gel de sobrancelha');
const renata = (m) => m.app.clientes().find((c) => c.nome === 'Renata Oliveira');

test('CA-06: venda de produto com comissão entra no caixa, gera "Comissão de venda" e aparece no relatório', async () => {
  const m = await prontoComoAdmin();
  const camila = m.byNome('Camila Rocha');
  const g = gel(m);
  assert.equal(g.venda.preco, 2000);
  assert.equal(g.comissoes[camila.id], 10);
  const it = await m.app.venderProduto({ cliId: renata(m).id, data: DIA, prodId: g.id, qtd: 2, profId: camila.id });
  assert.equal(it.preco, 4000);
  assert.equal(m.app.itensDoDia(DIA).filter((i) => i.tipo !== 'produto').length, 0, 'produto não ocupa a grade da agenda');
  await m.app.abrirCaixa(DIA, 0);
  const f = await m.app.fechar(it.comandaId, { linhas: m.app.previaFechamento(it.comandaId), data: DIA, pagamentos: [{ forma: 'pix', valor: 4000 }] });
  assert.equal(f.linhas[0].nome, '2× Gel de sobrancelha');
  assert.equal(m.app.saldoCaixa(DIA), 4000);
  const com = m.app.lancs('prof:' + camila.id).find((l) => l.cat === 'Comissão de venda');
  assert.equal(com.valor, 400);
  const r = m.app.relatorioMes('2026-10');
  assert.equal(r.nProd, 2);
  assert.equal(r.n, 0, 'atendimentos contam só serviços');
  assert.deepEqual(r.porProd.map((x) => [x.nome, x.n]), [['Gel de sobrancelha', 2]]);
  // Anular estorna também a comissão de venda.
  await m.app.anularFechamento(f.id);
  assert.equal(m.app.saldo('prof:' + camila.id), 0);
});

test('CA-07: ativar a venda sem preço é recusado e produto sem venda não aparece para vender', async () => {
  const m = await prontoComoAdmin();
  const novo = await m.app.salvarProduto({ nome: 'Máscara capilar', categoria: 'Cabelos' });
  assert.equal(novo.codigo, 5, 'código sequencial depois dos 4 de exemplo');
  await assert.rejects(m.app.salvarProduto({ id: novo.id, venda: { ativo: true, preco: 0 } }), /Informe o preço de venda para ativar a venda/);
  assert.ok(!m.app.produtosAVenda().some((p) => p.id === novo.id));
  await assert.rejects(m.app.venderProduto({ avulso: 'Passante', data: DIA, prodId: novo.id, qtd: 1, profId: m.adminId }), /disponível para venda/);
  await m.app.salvarProduto({ id: novo.id, venda: { ativo: true, preco: 3000 } });
  assert.ok(m.app.produtosAVenda().some((p) => p.id === novo.id));
  await m.app.alternarProduto(novo.id);
  assert.ok(!m.app.produtosAVenda().some((p) => p.id === novo.id), 'produto inativo sai da venda');
});

test('validações: quantidade, unidade, comissão, produto não vira serviço e não tem status', async () => {
  const m = await prontoComoAdmin();
  const g = gel(m);
  await assert.rejects(m.app.venderProduto({ avulso: 'X', data: DIA, prodId: g.id, qtd: 0, profId: m.adminId }), /Quantidade/);
  await assert.rejects(m.app.venderProduto({ avulso: 'X', data: DIA, prodId: g.id, qtd: 100, profId: m.adminId }), /Quantidade/);
  await assert.rejects(m.app.venderProduto({ avulso: 'X', data: '22/10', prodId: g.id, qtd: 1, profId: m.adminId }), /Data/);
  await assert.rejects(m.app.salvarProduto({ id: g.id, consumo: { unidade: 'Litros' } }), /Unidade/);
  await assert.rejects(m.app.salvarComissaoProduto(g.id, m.adminId, 150), /entre 0 e 100/);
  const it = await m.app.venderProduto({ avulso: 'Passante', data: DIA, prodId: g.id, qtd: 1, profId: m.adminId });
  await assert.rejects(m.app.mudarStatus(it.id, 'cancelado'), /não têm status/);
  const srv = m.app.servicos()[0];
  await assert.rejects(m.app.agendar({ itemId: it.id, data: DIA, hora: '10:00', profId: m.adminId, srvId: srv.id }), /é um produto/);
});

test('permissão: profissional lança só os próprios produtos e não cadastra produto', async () => {
  const m = await prontoComoAdmin();
  const camila = m.byNome('Camila Rocha'), bianca = m.byNome('Bianca Lopes');
  await m.app.definirPin(camila.id, '135790');
  await entrarComo(m, camila.id, '135790');
  const g = gel(m);
  await m.app.venderProduto({ cliId: renata(m).id, data: DIA, prodId: g.id, qtd: 1, profId: camila.id });
  await assert.rejects(m.app.venderProduto({ cliId: renata(m).id, data: DIA, prodId: g.id, qtd: 1, profId: bianca.id }), /não pode lançar produtos/);
  await assert.rejects(m.app.salvarProduto({ nome: 'Outro' }), /permissão/);
  await assert.rejects(m.app.salvarComissaoProduto(g.id, camila.id, 50), /permissão/);
});

test('cadastros antigos sem a permissão de produtos herdam o alcance da agenda', () => {
  const { ag_prod, ...antigo } = PERM_PROFISSIONAL;
  const prof = { id: 'p1', perm: antigo };
  const gestor = { id: 'g1', perm: { agenda: 3 } };
  assert.equal(ag_prod, 1);
  assert.equal(can(prof, 'produto.vender', { profId: 'p1' }), true);
  assert.equal(can(prof, 'produto.vender', { profId: 'outro' }), false);
  assert.equal(can(gestor, 'produto.vender', { profId: 'outro' }), true);
  assert.equal(can({ id: 'x', perm: { agenda: 0 } }, 'produto.vender', { profId: 'x' }), false);
});

test('produto e serviço na mesma comanda: comissões separadas e conflito de horário ignora o produto', async () => {
  const m = await prontoComoAdmin();
  const camila = m.byNome('Camila Rocha');
  const srv = m.app.servicos().find((s) => s.profs.includes(camila.id));
  const p = await m.app.venderProduto({ cliId: renata(m).id, data: DIA, prodId: gel(m).id, qtd: 1, profId: camila.id });
  // A venda registra uma hora (agora: 10:00 no relógio de teste), mas não bloqueia o horário do serviço.
  const s = await m.app.agendar({ cliId: renata(m).id, data: DIA, hora: p.hora, profId: camila.id, srvId: srv.id });
  assert.equal(s.comandaId, p.comandaId, 'mesmo cliente e dia: mesma comanda');
  await m.app.abrirCaixa(DIA, 0);
  const total = srv.preco + 2000;
  await m.app.fechar(s.comandaId, { linhas: m.app.previaFechamento(s.comandaId), data: DIA, pagamentos: [{ forma: 'dinheiro', valor: total }] });
  const cats = m.app.lancs('prof:' + camila.id).map((l) => [l.cat, l.valor]).sort();
  assert.deepEqual(cats, [['Comissão', Math.round(srv.preco * 0.4)], ['Comissão de venda', 200]].sort());
});
