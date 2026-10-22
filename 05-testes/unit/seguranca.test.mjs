// Testes unitários das regras de segurança (revisão de 22/10/2026). Rodar: node --test 05-testes/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import { prontoComoAdmin, entrarComo, montar, PIN_ADMIN } from './apoio.mjs';
import { PERM_RECEPCAO, excede, PERM_PROFISSIONAL, PERM_ADMIN } from '../../04-pwa/js/domain/permissoes.js';
import { parseMoney } from '../../04-pwa/js/shared/money.js';
import { pinProblem } from '../../04-pwa/js/domain/pin.js';
import { criarContexto } from '../../04-pwa/js/application/contexto.js';
import { dados } from '../../04-pwa/js/application/casos/dados.js';
import { consultas } from '../../04-pwa/js/application/casos/consultas.js';
import { casosSessao } from '../../04-pwa/js/application/casos/sessao.js';
import { casosGestao } from '../../04-pwa/js/application/casos/gestao.js';
import { casosAgenda } from '../../04-pwa/js/application/casos/agenda.js';
import { casosFinanceiro } from '../../04-pwa/js/application/casos/financeiro.js';

const PIN_CAMILA = '135790', PIN_RECEP = '246810', PIN_BIANCA = '147258';
const DIA = '2026-10-22'; // quinta-feira, aberto das 08:00 às 19:00

async function equipeComPins() {
  const m = await prontoComoAdmin();
  const camila = m.byNome('Camila Rocha'), bianca = m.byNome('Bianca Lopes'), recep = m.byNome('Recepção');
  await m.app.definirPin(camila.id, PIN_CAMILA);
  await m.app.definirPin(bianca.id, PIN_BIANCA);
  await m.app.definirPin(recep.id, PIN_RECEP);
  return { ...m, camila, bianca, recep };
}
const srvDe = (m, profId) => m.app.servicos().find((s) => s.profs.includes(profId));
const cli = (m, nome) => m.app.clientes().find((c) => c.nome === nome);

test('arquitetura: a aplicação não expõe o cofre e não tem nomes repetidos entre os casos de uso', () => {
  const { app, cofre } = montar();
  assert.ok(Object.isFrozen(app));
  for (const v of Object.values(app)) assert.notEqual(v, cofre);
  assert.ok(!('cofre' in app) && !('commit' in app) && !('get' in app) && !('all' in app));
  const ctx = criarContexto({ cofre, relogio: { agora: () => new Date() }, ids: { novo: () => 'x' } });
  const d = dados(ctx);
  const partes = [consultas(ctx, d), casosSessao(ctx), casosGestao(ctx, d), casosAgenda(ctx, d), casosFinanceiro(ctx, d)];
  const vistos = new Map();
  for (const [i, p] of partes.entries()) for (const k of Object.keys(p)) { assert.ok(!vistos.has(k), `"${k}" aparece em dois módulos`); vistos.set(k, i); }
});

test('escalada: gestor de equipe sem gestão de permissões não mexe no PIN nem no acesso do administrador', async () => {
  const m = await equipeComPins();
  await m.app.salvarPermissoes(m.recep.id, { ...PERM_RECEPCAO, gestao_equipe: 1, gestao_perm: false });
  await entrarComo(m, m.recep.id, PIN_RECEP);
  await assert.rejects(m.app.definirPin(m.adminId, '975310'), /mais acesso/);
  await assert.rejects(m.app.removerAcesso(m.adminId), /mais acesso/);
  await assert.rejects(m.app.salvarProfissional({ ...m.app.prof(m.adminId), ativo: false }), /mais acesso/);
  // O administrador continua entrando com o PIN dele.
  await entrarComo(m, m.adminId, PIN_ADMIN);
});

test('escalada: o próprio PIN só troca com o PIN atual; PIN fraco é recusado no caso de uso', async () => {
  const m = await equipeComPins();
  await assert.rejects(m.app.definirPin(m.adminId, '975310'), /Meu PIN/);
  await assert.rejects(m.app.definirPin(m.camila.id, '123456'), /sequências/);
  await assert.rejects(m.app.trocarMeuPin('000001', '975310'), /PIN incorreto/);
  await m.app.trocarMeuPin(PIN_ADMIN, '975310');
  await entrarComo(m, m.adminId, '975310');
});

test('não é possível remover o acesso do último gestor de permissões', async () => {
  const m = await equipeComPins();
  await m.app.salvarPermissoes(m.recep.id, { ...PERM_ADMIN });
  await entrarComo(m, m.recep.id, PIN_RECEP);
  await m.app.removerAcesso(m.adminId); // ainda sobra a Recepção como gestora
  await assert.rejects(entrarComo(m, m.adminId, PIN_ADMIN), /sem acesso/);
});

test('inativar um profissional apaga o acesso por PIN dele', async () => {
  const m = await equipeComPins();
  await m.app.salvarProfissional({ ...m.camila, ativo: false });
  assert.ok(!(await m.app.listarAcessos()).some((l) => l.id === m.camila.id));
  await assert.rejects(entrarComo(m, m.camila.id, PIN_CAMILA), /sem acesso/);
});

test('estabelecimento: só campos conhecidos; numeração e bloqueio automático não mudam por ali', async () => {
  const m = await equipeComPins();
  const antes = m.app.est();
  await m.app.salvarEstabelecimento({ ...antes, nome: 'Novo nome', seqFech: 0, lockMin: 999, usaCaixa: false, horario: {} });
  const e = m.app.est();
  assert.equal(e.nome, 'Novo nome');
  assert.equal(e.lockMin, antes.lockMin);
  assert.equal(e.usaCaixa, antes.usaCaixa);
  assert.deepEqual(e.horario, antes.horario);
  await assert.rejects(m.app.salvarBloqueioAutomatico(99), /entre 1 e 15/);
  await assert.rejects(m.app.salvarPreferencias({ slot: 7, usaCaixa: true }), /Intervalo/);
  await entrarComo(m, m.camila.id, PIN_CAMILA);
  await assert.rejects(m.app.salvarBloqueioAutomatico(1), /permissão/);
});

test('clientes: editar exige permissão e só vale para os próprios clientes de quem tem agenda própria', async () => {
  const m = await equipeComPins();
  const renata = cli(m, 'Renata Oliveira');
  await entrarComo(m, m.camila.id, PIN_CAMILA);
  await assert.rejects(m.app.salvarCliente({ ...renata, nome: 'Outro nome' }), /permissão/);
  await assert.rejects(m.app.inativarCliente(renata.id), /permissão/);
  await m.app.agendar({ cliId: renata.id, data: DIA, hora: '10:00', profId: m.camila.id, srvId: srvDe(m, m.camila.id).id });
  await m.app.salvarCliente({ ...renata, nome: 'Renata O.' });
  assert.equal(m.app.cliente(renata.id).nome, 'Renata O.');
  assert.equal(m.app.cliente(renata.id).ativo, true, 'editar não muda o status do cliente');
});

test('visibilidade: quem só vê os próprios agendamentos não abre a comanda de um colega', async () => {
  const m = await equipeComPins();
  const ana = cli(m, 'Ana Paula Prado');
  const it = await m.app.agendar({ cliId: ana.id, data: DIA, hora: '11:00', profId: m.bianca.id, srvId: srvDe(m, m.bianca.id).id });
  await entrarComo(m, m.camila.id, PIN_CAMILA);
  assert.throws(() => m.app.comanda(it.comandaId), /acesso/);
  assert.equal(m.app.itensDoCliente(ana.id).length, 0);
  assert.equal(m.app.item(it.id), null);
  assert.throws(() => m.app.lancs('caixa'), /permissão/);
  assert.throws(() => m.app.saldo('prof:' + m.bianca.id), /permissão/);
  assert.throws(() => m.app.auditoria(), /permissão/);
});

test('validação no caso de uso: datas, formas, tipos, gorjeta e valores', async () => {
  const m = await equipeComPins();
  const renata = cli(m, 'Renata Oliveira');
  const it = await m.app.agendar({ cliId: renata.id, data: DIA, hora: '09:00', profId: m.camila.id, srvId: srvDe(m, m.camila.id).id });
  await m.app.abrirCaixa(DIA, 0);
  const base = { linhas: m.app.previaFechamento(it.comandaId), pagamentos: [{ forma: 'pix', valor: it.preco }] };
  await assert.rejects(m.app.fechar(it.comandaId, { ...base, data: '22/10/2026' }), /Data inválida/);
  await assert.rejects(m.app.fechar(it.comandaId, { ...base, data: DIA, gorjeta: { profId: m.bianca.id, valor: 500 } }), /gorjeta/);
  await assert.rejects(m.app.fechar(it.comandaId, { ...base, data: DIA, pagamentos: [{ forma: 'bitcoin', valor: it.preco }] }), /Forma/);
  await assert.rejects(m.app.fechar(it.comandaId, { ...base, data: DIA, pagamentos: [{ forma: 'pix', valor: it.preco / 3 }] }), /inválido/);
  await assert.rejects(m.app.lancarProfissional(m.camila.id, { tipo: 'bonus', valor: 100 }), /Tipo/);
  await assert.rejects(m.app.lancarCaixa({ data: DIA, tipo: 'saida', valor: 100, forma: 'cheque' }), /Forma/);
  await assert.rejects(m.app.agendar({ novoNome: 'Fulana', novoCel: '123', data: DIA, hora: '15:00', profId: m.camila.id, srvId: srvDe(m, m.camila.id).id }), /Celular/);
  await assert.rejects(m.app.agendar({ cliId: renata.id, data: DIA, hora: '25:00', profId: m.camila.id, srvId: srvDe(m, m.camila.id).id }), /hora inválida/);
  const f = await m.app.fechar(it.comandaId, { ...base, data: DIA });
  assert.equal(f.numero, 1);
});

test('cofre: tipo vem do id autenticado e registro adulterado é contado como falha de integridade', async () => {
  const m = await prontoComoAdmin();
  const [k, rec] = [...m.db.stores.recs.entries()].find(([id]) => id.startsWith('cli:'));
  m.db.stores.recs.set(k, { ...rec, type: 'prof' }); // troca só o campo em claro
  const outro = [...m.db.stores.recs.entries()].find(([id]) => id.startsWith('srv:'));
  const ct = new Uint8Array(outro[1].ct); ct[0] ^= 1;
  m.db.stores.recs.set(outro[0], { ...outro[1], ct });
  await entrarComo(m, m.adminId, PIN_ADMIN);
  assert.equal(m.app.clientes().length, 3, 'o cliente continua em clientes');
  assert.equal(m.app.profs(true).length, 4, 'nenhum cliente virou profissional');
  assert.equal(m.app.integridade(), 1);
});

test('cofre: uma tentativa de PIN por vez e bloqueio após 5 erros, também na troca do próprio PIN', async () => {
  const m = await prontoComoAdmin();
  const a = m.app.trocarMeuPin('000001', '975310');
  await assert.rejects(m.app.trocarMeuPin('000002', '975310'), /Aguarde/);
  await assert.rejects(a, /PIN incorreto/);
  for (let i = 0; i < 4; i++) await assert.rejects(m.app.trocarMeuPin('00000' + i, '975310'), /PIN incorreto/);
  await assert.rejects(m.app.trocarMeuPin(PIN_ADMIN, '975310'), /bloqueado/);
});

test('backup: só restaura com um PIN do backup, recusa arquivo adulterado e não apaga nada se falhar', async () => {
  const m = await equipeComPins();
  const texto = await m.app.exportarBackup();
  await m.app.salvarServico({ nome: 'Serviço novo', categoria: 'X', duracao: 30, preco: 1000 });
  await assert.rejects(m.app.restaurarBackup(texto, '975310'), /não abre o backup/);
  assert.ok(m.app.servicos().some((s) => s.nome === 'Serviço novo'), 'os dados atuais continuam');
  const adulterado = JSON.parse(texto);
  adulterado.recs[0].ct = Buffer.from('adulterado').toString('base64');
  await assert.rejects(m.app.restaurarBackup(JSON.stringify(adulterado), PIN_ADMIN), /adulterado/);
  await m.app.restaurarBackup(texto, PIN_CAMILA);
  await m.app.entrar(m.adminId, PIN_ADMIN);
  assert.ok(!m.app.servicos().some((s) => s.nome === 'Serviço novo'), 'voltou ao estado do backup');
});

test('troca da chave dos dados: só quem trocou continua; backup antigo não abre os dados novos', async () => {
  const m = await equipeComPins();
  const chavesAntigas = [...m.db.stores.keys.values()].map((k) => structuredClone(k));
  await assert.rejects(m.app.trocarChaveDosDados('000000'), /PIN incorreto/);
  const removidos = await m.app.trocarChaveDosDados(PIN_ADMIN);
  assert.equal(removidos, 3);
  assert.deepEqual((await m.app.listarAcessos()).map((l) => l.id), [m.adminId]);
  assert.equal(m.app.clientes().length, 3);
  // Quem guardou a chave antiga (ex.: cópia do banco) não abre mais os registros novos.
  const { deriveKEK, unwrapDEK, open } = await import('../../04-pwa/js/adapters/out/webcrypto.js');
  const kCamila = chavesAntigas.find((k) => k.id === m.camila.id);
  const dekAntiga = await unwrapDEK(kCamila.wrapped, kCamila.iv, await deriveKEK(PIN_CAMILA, kCamila.salt, kCamila.iter));
  const rec = [...m.db.stores.recs.values()][0];
  await assert.rejects(open(dekAntiga, rec));
  await entrarComo(m, m.adminId, PIN_ADMIN);
});

test('domínio: regras puras', () => {
  assert.equal(excede(PERM_PROFISSIONAL, PERM_ADMIN), false);
  assert.equal(excede(PERM_ADMIN, PERM_RECEPCAO), true);
  assert.equal(pinProblem('112233') !== null, true);
  assert.equal(parseMoney('1.500,00'), 150000);
});
