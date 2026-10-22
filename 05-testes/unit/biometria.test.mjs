// Testes unitários da biometria (WebAuthn PRF) com um autenticador falso. Rodar: node --test 05-testes/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import { prontoComoAdmin, entrarComo, PIN_ADMIN } from './apoio.mjs';

test('ativar exige o PIN certo; depois a biometria abre os dados sem PIN', async () => {
  const m = await prontoComoAdmin();
  assert.equal(await m.app.biometriaDisponivel(), true);
  await assert.rejects(m.app.ativarBiometria('000001'), /PIN incorreto/);
  assert.equal(await m.app.minhaBiometria(), false);
  await m.app.ativarBiometria(PIN_ADMIN);
  assert.equal(await m.app.minhaBiometria(), true);
  assert.equal((await m.app.listarAcessos()).find((l) => l.id === m.adminId).bio, true);
  m.app.bloquear();
  const prof = await m.app.entrarComBiometria(m.adminId);
  assert.equal(prof.id, m.adminId);
  assert.equal(m.app.clientes().length, 3, 'os dados abriram decifrados');
  assert.ok(m.biometria.entregues.every((s) => s.every((b) => b === 0)), 'o segredo PRF é apagado da memória depois do uso');
});

test('outro segredo, biometria cancelada ou profissional sem biometria não entram', async () => {
  const m = await prontoComoAdmin();
  await m.app.ativarBiometria(PIN_ADMIN);
  const cred = (await m.cofre.bioInfo(m.adminId)).credentialId;
  m.app.bloquear();
  m.biometria.cancelar = true;
  await assert.rejects(m.app.entrarComBiometria(m.adminId), /cancelada/);
  m.biometria.cancelar = false;
  m.biometria.trocarSegredo(cred);
  await assert.rejects(m.app.entrarComBiometria(m.adminId), /não abre os dados/);
  assert.equal(m.app.desbloqueado(), false);
  const camila = (await m.app.listarAcessos()).find((l) => l.nome === 'Camila Rocha');
  assert.equal(camila, undefined, 'Camila nem tem PIN');
});

test('trocar o próprio PIN mantém a biometria; PIN definido pelo gestor apaga a biometria da pessoa', async () => {
  const m = await prontoComoAdmin();
  const camila = m.byNome('Camila Rocha');
  await m.app.definirPin(camila.id, '135790');
  await entrarComo(m, camila.id, '135790');
  await m.app.ativarBiometria('135790');
  await m.app.trocarMeuPin('135790', '246813');
  m.app.bloquear();
  await m.app.entrarComBiometria(camila.id);
  await entrarComo(m, m.adminId, PIN_ADMIN);
  await m.app.definirPin(camila.id, '975310');
  assert.equal((await m.app.listarAcessos()).find((l) => l.id === camila.id).bio, false);
  m.app.bloquear();
  await assert.rejects(m.app.entrarComBiometria(camila.id), /não está ativada/);
});

test('desativar apaga a biometria e pede ao navegador para esquecer a passkey', async () => {
  const m = await prontoComoAdmin();
  await m.app.ativarBiometria(PIN_ADMIN);
  const cred = (await m.cofre.bioInfo(m.adminId)).credentialId;
  await m.app.desativarBiometria();
  assert.equal(await m.app.minhaBiometria(), false);
  assert.deepEqual(m.biometria.esquecidas, [cred]);
  m.app.bloquear();
  await assert.rejects(m.app.entrarComBiometria(m.adminId), /não está ativada/);
});

test('backup não leva a biometria e a troca da chave dos dados a remove', async () => {
  const m = await prontoComoAdmin();
  await m.app.ativarBiometria(PIN_ADMIN);
  const backup = JSON.parse(await m.app.exportarBackup());
  assert.ok(backup.keys.every((k) => !('bio' in k)));
  const cred = (await m.cofre.bioInfo(m.adminId)).credentialId;
  await m.app.trocarChaveDosDados(PIN_ADMIN);
  assert.equal(await m.app.minhaBiometria(), false);
  assert.ok(m.biometria.esquecidas.includes(cred));
});

test('sem o adaptador de biometria, o app segue só com PIN', async () => {
  const m = await prontoComoAdmin({ biometria: null });
  assert.equal(await m.app.biometriaDisponivel(), false);
  await assert.rejects(m.app.ativarBiometria(PIN_ADMIN), /não oferece biometria/);
});
