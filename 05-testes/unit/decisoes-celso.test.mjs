// Decisões do Celso de 18/11/2026: R1 preço obrigatório no serviço, R4 reativar cliente, R5 horário passado com confirmação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prontoComoAdmin } from './apoio.mjs';
import { HorarioPassado } from '../../04-pwa/js/application/erros.js';

// O relógio fixo dos testes é 2026-10-22 08:00.
const renata = (m) => m.app.clientes().find((c) => c.nome === 'Renata Oliveira');
const base = (m) => { const camila = m.byNome('Camila Rocha'); return { camila, srv: m.app.servicos().find((s) => s.profs.includes(camila.id)) }; };

test('R1: serviço sem preço dá "Informe o preço"; 0 digitado é aceito; NaN é "Preço inválido"', async () => {
  const m = await prontoComoAdmin();
  const novo = { nome: 'Cortesia', categoria: 'Geral', duracao: 30, profs: [] };
  await assert.rejects(m.app.salvarServico({ ...novo, preco: null }), /Informe o preço/);
  await assert.rejects(m.app.salvarServico({ ...novo }), /Informe o preço/);
  await assert.rejects(m.app.salvarServico({ ...novo, preco: NaN }), /Preço inválido/);
  const s = await m.app.salvarServico({ ...novo, preco: 0 });
  assert.equal(s.preco, 0);
});

test('R4: reativar cliente inativo; sem efeito em ativo; barra se outro ativo usa o celular', async () => {
  const m = await prontoComoAdmin();
  const c = await m.app.salvarCliente({ nome: 'Volta', cel: '11 95555-4444' });
  await m.app.inativarCliente(c.id);
  assert.equal(m.app.cliente(c.id).ativo, false);
  await m.app.reativarCliente(c.id);
  assert.notEqual(m.app.cliente(c.id).ativo, false);
  await m.app.reativarCliente(c.id); // idempotente
  await m.app.inativarCliente(c.id);
  await m.app.salvarCliente({ nome: 'Ocupou', cel: '11 95555-4444' });
  await assert.rejects(m.app.reativarCliente(c.id), /celular/);
  assert.equal(m.app.cliente(c.id).ativo, false);
  await assert.rejects(m.app.reativarCliente('nao-existe'), /não encontrado/);
});

test('R5: horário passado exige confirmação (novo e remarcar); futuro e agora passam; editar sem mudar horário não pergunta', async () => {
  const m = await prontoComoAdmin();
  const { camila, srv } = base(m);
  const req = { cliId: renata(m).id, profId: camila.id, srvId: srv.id };
  // data passada
  await assert.rejects(m.app.agendar({ ...req, data: '2026-10-21', hora: '09:00' }), HorarioPassado);
  assert.equal(m.app.itensDoDia('2026-10-21').length, 0, 'não grava sem confirmar');
  const passado = await m.app.agendar({ ...req, data: '2026-10-21', hora: '09:00', confirmarPassado: true });
  assert.equal(passado.data, '2026-10-21');
  // futuro e "agora" passam direto
  const f = await m.app.agendar({ ...req, data: '2026-10-22', hora: '09:00' });
  assert.equal(f.hora, '09:00');
  // editar só a nota de um item passado: não pergunta
  const ed = await m.app.agendar({ ...req, itemId: passado.id, data: '2026-10-21', hora: '09:00', nota: 'x' });
  assert.equal(ed.nota, 'x');
  // remarcar para o passado: pergunta
  await assert.rejects(m.app.agendar({ ...req, itemId: f.id, data: '2026-10-20', hora: '09:00' }), HorarioPassado);
  const rem = await m.app.agendar({ ...req, itemId: f.id, data: '2026-10-20', hora: '09:00', confirmarPassado: true });
  assert.equal(rem.data, '2026-10-20');
});
