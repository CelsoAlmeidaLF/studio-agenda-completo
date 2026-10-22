// Testes unitários dos bugs de dinheiro e de regra (revisão de 22/10/2026). Rodar: node --test 05-testes/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import { prontoComoAdmin } from './apoio.mjs';
import { parseMoney } from '../../04-pwa/js/shared/money.js';
import { NeedCaixa } from '../../04-pwa/js/application/erros.js';

const DIA = '2026-10-22'; // mesmo dia do relógio fixo de apoio.mjs

async function comandaDaRenata(m, hora = '10:00') {
  const camila = m.byNome('Camila Rocha');
  const renata = m.app.clientes().find((c) => c.nome === 'Renata Oliveira');
  const srv = m.app.servicos().find((s) => s.profs.includes(camila.id));
  return { it: await m.app.agendar({ cliId: renata.id, data: DIA, hora, profId: camila.id, srvId: srv.id }), renata };
}

test('parseMoney: ponto de milhar no padrão brasileiro', () => {
  assert.equal(parseMoney('1.500'), 150000);
  assert.equal(parseMoney('1.234.567'), 123456700);
  assert.equal(parseMoney('R$ 2.000'), 200000);
  assert.equal(parseMoney('1.500,00'), 150000);
  assert.equal(parseMoney('12,5'), 1250);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('12.50'), 1250);
  assert.equal(parseMoney('150'), 15000);
});

test('pagamento parcial: o pago entra no caixa e só o resto fica pendente para o cliente', async () => {
  const m = await prontoComoAdmin();
  const { it, renata } = await comandaDaRenata(m);
  await m.app.abrirCaixa(DIA, 0);
  const f = await m.app.fechar(it.comandaId, { linhas: m.app.previaFechamento(it.comandaId), data: DIA, pagamentos: [{ forma: 'pix', valor: 5000 }], semPagamento: true });
  assert.equal(f.pendente, it.preco - 5000);
  assert.deepEqual(f.pagamentos, [{ forma: 'pix', valor: 5000 }]);
  assert.equal(m.app.saldoCaixa(DIA), 5000);
  assert.equal(m.app.saldo('cli:' + renata.id), -(it.preco - 5000));
});

test('pagamento parcial: valor completo ou acima do total não passa como pendente', async () => {
  const m = await prontoComoAdmin();
  const { it } = await comandaDaRenata(m);
  await m.app.abrirCaixa(DIA, 0);
  const base = { linhas: m.app.previaFechamento(it.comandaId), data: DIA, semPagamento: true };
  await assert.rejects(m.app.fechar(it.comandaId, { ...base, pagamentos: [{ forma: 'pix', valor: it.preco }] }), /completo/);
  await assert.rejects(m.app.fechar(it.comandaId, { ...base, pagamentos: [{ forma: 'pix', valor: it.preco + 1 }] }), /passou/);
});

test('item cancelado não volta a ativo numa comanda já fechada', async () => {
  const m = await prontoComoAdmin();
  const { it } = await comandaDaRenata(m, '09:00');
  const { it: it2 } = await comandaDaRenata(m, '14:00');
  await m.app.mudarStatus(it2.id, 'cancelado');
  await m.app.abrirCaixa(DIA, 0);
  await m.app.fechar(it.comandaId, { linhas: m.app.previaFechamento(it.comandaId), data: DIA, pagamentos: [{ forma: 'dinheiro', valor: it.preco }] });
  await assert.rejects(m.app.mudarStatus(it2.id, 'marcado'), /já foi fechada/);
});

test('anular fechamento estorna no caixa de hoje só com o caixa aberto', async () => {
  const m = await prontoComoAdmin();
  const { it } = await comandaDaRenata(m);
  const ontem = '2026-10-21';
  await m.app.abrirCaixa(ontem, 0);
  const f = await m.app.fechar(it.comandaId, { linhas: m.app.previaFechamento(it.comandaId), data: ontem, pagamentos: [{ forma: 'pix', valor: it.preco }] });
  await assert.rejects(m.app.anularFechamento(f.id), (e) => e instanceof NeedCaixa && e.data === DIA);
  await m.app.abrirCaixa(DIA, 0);
  await m.app.anularFechamento(f.id);
  assert.equal(m.app.saldoCaixa(DIA), -it.preco);
  assert.equal(m.app.comanda(it.comandaId).status, 'aberta');
});
