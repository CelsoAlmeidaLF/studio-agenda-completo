// Testes unitários: vínculos inativos (B1, B3, B4), celular/DDI (B5, B7), e-mail (B8) e preço (B6).
// Rodar: node --test 05-testes/unit/agenda-vinculos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { prontoComoAdmin } from './apoio.mjs';
import { parseMoney } from '../../04-pwa/js/shared/money.js';
import { normalizaCelular, isEmail } from '../../04-pwa/js/domain/validacao.js';

const DIA = '2026-10-22';
const renata = (m) => m.app.clientes().find((c) => c.nome === 'Renata Oliveira');
const srvDe = (m, profId) => m.app.servicos().find((s) => s.profs.includes(profId));

async function agendamento(m) {
  const camila = m.byNome('Camila Rocha');
  const srv = srvDe(m, camila.id);
  const it = await m.app.agendar({ cliId: renata(m).id, data: DIA, hora: '09:00', profId: camila.id, srvId: srv.id });
  return { it, camila, srv };
}

test('B1: serviço inativado continua valendo ao editar só a nota; trocar para outro inativo é barrado', async () => {
  const m = await prontoComoAdmin();
  const { it, camila, srv } = await agendamento(m);
  await m.app.salvarServico({ ...srv, ativo: false });
  const ed = await m.app.agendar({ itemId: it.id, cliId: it.cliId, data: DIA, hora: '09:00', profId: camila.id, srvId: srv.id, nota: 'nova nota' });
  assert.equal(ed.srvId, srv.id);
  assert.equal(ed.nota, 'nova nota');
  assert.equal(ed.preco, it.preco);
  // Novo agendamento com serviço inativo: continua barrado.
  await assert.rejects(m.app.agendar({ cliId: renata(m).id, data: DIA, hora: '14:00', profId: camila.id, srvId: srv.id }), /serviço ativo/);
  // Editar trocando para outro serviço inativo: barrado.
  const outro = m.app.servicos().find((s) => s.id !== srv.id && s.profs.includes(camila.id));
  await m.app.salvarServico({ ...outro, ativo: false });
  await assert.rejects(m.app.agendar({ itemId: it.id, cliId: it.cliId, data: DIA, hora: '09:00', profId: camila.id, srvId: outro.id }), /serviço ativo/);
});

test('B3: profissional inativado continua valendo ao editar; novo agendamento com ele é barrado', async () => {
  const m = await prontoComoAdmin();
  const { it, camila, srv } = await agendamento(m);
  await m.app.salvarProfissional({ ...camila, comissao: camila.comissao, ativo: false });
  const ed = await m.app.agendar({ itemId: it.id, cliId: it.cliId, data: DIA, hora: '09:00', profId: camila.id, srvId: srv.id, nota: 'só a nota' });
  assert.equal(ed.profId, camila.id);
  await assert.rejects(m.app.agendar({ cliId: renata(m).id, data: DIA, hora: '15:00', profId: camila.id, srvId: srv.id }), /profissional ativo/);
});

test('B4: cliente inativado não impede editar o agendamento dele; cliente inativo novo continua barrado', async () => {
  const m = await prontoComoAdmin();
  const { it, camila, srv } = await agendamento(m);
  await m.app.inativarCliente(it.cliId);
  const ed = await m.app.agendar({ itemId: it.id, cliId: it.cliId, data: DIA, hora: '10:00', profId: camila.id, srvId: srv.id });
  assert.equal(ed.hora, '10:00');
  assert.equal(ed.cliId, it.cliId);
  await assert.rejects(m.app.agendar({ cliId: it.cliId, data: DIA, hora: '15:00', profId: camila.id, srvId: srv.id }), /cliente ativo/);
  // Trocar o agendamento para outro cliente inativo também é barrado.
  const outra = m.app.clientes().find((c) => c.nome === 'Mariana Luz');
  await m.app.inativarCliente(outra.id);
  await assert.rejects(m.app.agendar({ itemId: it.id, cliId: outra.id, data: DIA, hora: '10:00', profId: camila.id, srvId: srv.id }), /cliente ativo/);
});

test('B5: normalizaCelular tira o 55 só quando sobram 10-11 dígitos', () => {
  assert.equal(normalizaCelular('5511988887777'), '11988887777');
  assert.equal(normalizaCelular('551133334444'), '1133334444');
  assert.equal(normalizaCelular('11988887777'), '11988887777');
  assert.equal(normalizaCelular('5599998888'), '5599998888', '10 dígitos com DDD 55 não é DDI');
  assert.equal(normalizaCelular('55999998888'), '55999998888', '11 dígitos com DDD 55 não é DDI');
  assert.equal(normalizaCelular(''), '');
});

test('B5/RN-13: celular com DDI duplica cliente existente, mas a edição do próprio cliente é livre', async () => {
  const m = await prontoComoAdmin();
  const a = await m.app.salvarCliente({ nome: 'Cliente A', cel: '(11) 98888-7777' });
  assert.equal(a.cel, '11988887777');
  await assert.rejects(m.app.salvarCliente({ nome: 'Cliente B', cel: '+55 11 98888-7777' }), /já existe um cliente/i);
  const a2 = await m.app.salvarCliente({ id: a.id, nome: 'Cliente A2', cel: '+55 11 98888-7777' });
  assert.equal(a2.cel, '11988887777', 'grava normalizado');
  // pelo agendamento com cliente novo também
  const camila = m.byNome('Camila Rocha');
  await assert.rejects(m.app.agendar({ novoNome: 'Outro', novoCel: '5511988887777', data: DIA, hora: '09:00', profId: camila.id, srvId: srvDe(m, camila.id).id }), /já existe um cliente/i);
});

test('B5: cliente já gravado com DDI (dados antigos) é pego pela comparação normalizada', async () => {
  const m = await prontoComoAdmin();
  const velho = { id: 'velho1', nome: 'Antigo', cel: '5511977776666', email: '', obs: '', ativo: true, criadoEm: '2026-01-01T00:00:00.000Z', favoritos: [] };
  await m.cofre.commit([{ put: 'cli', obj: velho }]);
  assert.equal(m.app.celularEmUso('(11) 97777-6666'), true);
  await assert.rejects(m.app.salvarCliente({ nome: 'Novo', cel: '11 97777-6666' }), /já existe um cliente/i);
});

test('B7: celular com letras ou sem dígitos é "Celular inválido"; vazio continua permitido', async () => {
  const m = await prontoComoAdmin();
  await assert.rejects(m.app.salvarCliente({ nome: 'X', cel: 'abcdefghijk' }), /Celular inválido/);
  await assert.rejects(m.app.salvarCliente({ nome: 'X', cel: '11 9888a-7777' }), /Celular inválido/);
  await assert.rejects(m.app.salvarCliente({ nome: 'X', cel: '---' }), /Celular inválido/);
  const ok = await m.app.salvarCliente({ nome: 'Sem celular', cel: '' });
  assert.equal(ok.cel, '');
});

test('B8: e-mail inválido é recusado; válido e vazio passam; e-mail antigo não bloqueia edição do resto', async () => {
  const m = await prontoComoAdmin();
  await assert.rejects(m.app.salvarCliente({ nome: 'X', cel: '', email: 'isto-nao-e-email' }), /E-mail inválido/);
  await assert.rejects(m.app.salvarCliente({ nome: 'X', cel: '', email: 'a@b' }), /E-mail inválido/);
  const c = await m.app.salvarCliente({ nome: 'Com email', cel: '', email: 'ana@exemplo.com.br' });
  assert.equal(c.email, 'ana@exemplo.com.br');
  assert.equal((await m.app.salvarCliente({ nome: 'Sem email', cel: '', email: '' })).email, '');
  assert.equal(isEmail('a b@c.d'), false);
  const velho = { id: 'velho2', nome: 'Velho', cel: '', email: 'lixo', obs: '', ativo: true, criadoEm: '2026-01-01T00:00:00.000Z', favoritos: [] };
  await m.cofre.commit([{ put: 'cli', obj: velho }]);
  const ed = await m.app.salvarCliente({ id: 'velho2', nome: 'Velho Editado', cel: '', email: 'lixo' });
  assert.equal(ed.nome, 'Velho Editado');
});

test('B6: parseMoney devolve NaN para texto sem número; vazio e valores válidos não mudam', () => {
  assert.ok(Number.isNaN(parseMoney('abc')));
  assert.ok(Number.isNaN(parseMoney('R$')));
  assert.ok(Number.isNaN(parseMoney('-')));
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('   '), 0);
  assert.equal(parseMoney('12,50'), 1250);
  assert.equal(parseMoney('R$ 1.234,56'), 123456);
  assert.equal(parseMoney('1.500'), 150000);
  assert.equal(parseMoney(7), 700);
});

test('B6: salvar serviço e agendar com preço NaN dá "Preço inválido"', async () => {
  const m = await prontoComoAdmin();
  const camila = m.byNome('Camila Rocha');
  const srv = srvDe(m, camila.id);
  await assert.rejects(m.app.salvarServico({ ...srv, preco: parseMoney('abc') }), /Preço inválido/);
  await assert.rejects(m.app.agendar({ cliId: renata(m).id, data: DIA, hora: '09:00', profId: camila.id, srvId: srv.id, preco: parseMoney('abc') }), /Preço inválido/);
});
