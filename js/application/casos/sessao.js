// Casos de uso de sessão e segurança: configuração inicial, entrada, PIN, backup, troca de chave e exclusão.
import { pinProblem } from '../../domain/pin.js';
import { DEFAULT_HORARIO } from '../../domain/agenda.js';
import { PERM_ADMIN, PERM_PROFISSIONAL, PERM_RECEPCAO } from '../../domain/permissoes.js';
import { CORES } from '../../domain/equipe.js';
import { clip, initials } from '../../shared/texto.js';

// Traduz os erros do navegador (DOMException) para mensagens de tela.
function erroBiometria(e) {
  if (e?.name === 'NotAllowedError') return new Error('Biometria cancelada ou não reconhecida. Use o PIN.');
  if (e?.name === 'InvalidStateError') return new Error('Esta biometria já está cadastrada neste aparelho.');
  if (e?.name === 'SecurityError') return new Error('A biometria só funciona com o app aberto em HTTPS ou em localhost.');
  return e instanceof Error ? e : new Error('Não foi possível usar a biometria. Use o PIN.');
}

export function casosSessao(ctx) {
  const R = ctx.cofre;
  const B = ctx.biometria;
  const { need, audit, uid, agoraISO } = ctx;

  function registrosIniciais(estNome, adminNome, comExemplos) {
    const admin = { id: uid(), nome: clip(adminNome, 60), sigla: initials(adminNome), cor: CORES[0], area: 'Gerência', comissao: 0, ativo: true, perm: { ...PERM_ADMIN } };
    const recs = [
      { type: 'est', obj: { id: 'est', nome: clip(estNome, 80), servicoPrincipal: 'Estética', razao: '', cnpj: '', endereco: { cep: '', rua: '', num: '', comp: '', bairro: '', cidade: '', uf: 'SP' }, tel1: '', tel2: '', email: '', horario: DEFAULT_HORARIO, slot: 30, usaCaixa: true, lockMin: 5, seqFech: 0 } },
      { type: 'prof', obj: admin },
      { type: 'audit', obj: { id: uid(), em: agoraISO(), autor: admin.id, acao: 'Configuração inicial', alvo: 'Estabelecimento', detalhe: '' } },
    ];
    if (comExemplos) {
      const p1 = { id: uid(), nome: 'Camila Rocha', sigla: 'CR', cor: CORES[1], area: 'Estética', comissao: 40, ativo: true, perm: { ...PERM_PROFISSIONAL } };
      const p2 = { id: uid(), nome: 'Bianca Lopes', sigla: 'BL', cor: CORES[2], area: 'Manicure', comissao: 40, ativo: true, perm: { ...PERM_PROFISSIONAL } };
      const p3 = { id: uid(), nome: 'Recepção', sigla: 'RE', cor: CORES[3], area: 'Recepção', comissao: 0, ativo: true, atende: false, perm: { ...PERM_RECEPCAO } };
      recs.push({ type: 'prof', obj: p1 }, { type: 'prof', obj: p2 }, { type: 'prof', obj: p3 });
      const srv = [
        ['Sobrancelha', 'Design de sobrancelha', 40, 5000, [p1.id]], ['Sobrancelha', 'Design + Buço - COMBO', 60, 7000, [p1.id]],
        ['Cílios', 'Alongamento de cílios - Fio a fio', 120, 14000, [p1.id]], ['Cílios', 'Lash lifting', 120, 15000, [p1.id]],
        ['Unhas', 'Mão', 30, 4000, [p2.id]], ['Unhas', 'Pé', 30, 4500, [p2.id]], ['Unhas', 'Esmaltação tradicional', 30, 2500, [p2.id]], ['Unhas', 'Mão & Pé - COMBO', 90, 7500, [p2.id]],
      ];
      for (const [categoria, nome, duracao, preco, profIds] of srv) recs.push({ type: 'srv', obj: { id: uid(), categoria, nome, duracao, preco, profs: profIds, ativo: true } });
      for (const [nome, cel] of [['Renata Oliveira', '11900001234'], ['Mariana Luz', '11900000102'], ['Ana Paula Prado', '11900000103']])
        recs.push({ type: 'cli', obj: { id: uid(), nome, cel, email: '', obs: '', ativo: true, criadoEm: agoraISO(), favoritos: [] } });
    }
    return { admin, recs };
  }

  return {
    estaConfigurado: () => R.isSetup(),
    infoCofre: () => R.vaultInfo(),
    listarAcessos: () => R.listLogins(),
    desbloqueado: () => R.isUnlocked(),
    bloquear: () => R.lock(),

    // Devolve o id do gestor criado, para a tela de entrada já abrir nele.
    async configurar({ estNome, adminNome, pin, comExemplos }) {
      if (!clip(estNome, 80) || !clip(adminNome, 60)) throw new Error('Preencha o nome do estabelecimento e o seu nome.');
      const prob = pinProblem(pin);
      if (prob) throw new Error(prob);
      const { admin, recs } = registrosIniciais(estNome, adminNome, comExemplos);
      await R.setup(clip(estNome, 80), admin, pin, recs);
      return admin.id;
    },
    entrar: (profId, pin) => R.login(profId, pin),

    // ---------- Biometria (WebAuthn PRF) ----------
    biometriaDisponivel: () => B.disponivel(),
    async entrarComBiometria(profId) {
      const info = await R.bioInfo(profId);
      if (!info) throw new Error('A biometria não está ativada para este profissional.');
      let segredo;
      try { segredo = await B.liberar(info.credentialId, info.prfSalt); } catch (e) { throw erroBiometria(e); }
      try { return await R.loginBio(profId, segredo); } finally { segredo.fill(0); }
    },
    async minhaBiometria() { return R.isUnlocked() ? !!(await R.bioInfo(R.userId())) : false; },
    // O PIN confirma a ativação: quem pegou o aparelho desbloqueado não cadastra a própria digital.
    async ativarBiometria(pin) {
      if (!R.isUnlocked()) throw new Error('Sessão bloqueada.');
      if (!/^\d{6}$/.test(pin || '')) throw new Error('Digite o seu PIN de 6 números para ativar.');
      if (!(await B.disponivel())) throw new Error('Este aparelho não oferece biometria com criptografia. Continue usando o PIN.');
      await R.verifyPin(pin); // confere antes de abrir o cadastro do aparelho (e conta tentativas)
      const me = ctx.me();
      let cred;
      try { cred = await B.cadastrar(me); } catch (e) { throw erroBiometria(e); }
      try {
        const anterior = await R.enableBio(pin, cred);
        if (anterior && anterior !== cred.credentialId) B.esquecer(anterior);
      } finally { cred.secret.fill(0); }
      await R.commit([audit('Ativou a biometria', me.nome)]);
    },
    async desativarBiometria() {
      if (!R.isUnlocked()) throw new Error('Sessão bloqueada.');
      const anterior = await R.disableBio();
      if (anterior) B.esquecer(anterior);
      await R.commit([audit('Desativou a biometria', ctx.me().nome)]);
    },

    async trocarMeuPin(atual, novo) {
      if (!R.isUnlocked()) throw new Error('Sessão bloqueada.');
      const prob = pinProblem(novo);
      if (prob) throw new Error(prob);
      await R.verifyPin(atual);
      const me = ctx.me();
      await R.commit([{ putKey: me, pin: novo, manterBiometria: true }, audit('Trocou o próprio PIN', me.nome)]);
    },

    async exportarBackup() {
      need('seguranca');
      const texto = await R.exportBackup();
      await R.commit([audit('Exportou backup', '')]);
      return texto;
    },
    // Com a sessão aberta exige a permissão de segurança; na tela "Esqueci o PIN" vale o PIN do próprio backup.
    async restaurarBackup(texto, pin) {
      if (R.isUnlocked()) need('seguranca');
      if (!/^\d{6}$/.test(pin || '')) throw new Error('Informe o PIN de 6 números usado na época do backup.');
      await R.importBackup(texto, pin);
    },
    async apagarTudo(confirmacao) {
      if (R.isUnlocked()) need('seguranca');
      if (String(confirmacao || '').trim().toUpperCase() !== 'APAGAR') throw new Error('Digite APAGAR para confirmar.');
      await R.wipe();
    },
    // Depois de desligar alguém da equipe: chave nova, acesso só para quem fez a troca; os outros PINs são recriados.
    async trocarChaveDosDados(pin) {
      need('seguranca');
      need('gestao.equipe', {}, 'Só quem gere a equipe pode trocar a chave, porque os PINs da equipe precisam ser recriados.');
      const bioAntiga = await R.bioInfo(R.userId());
      const removidos = await R.rotateDEK(pin);
      if (bioAntiga) B.esquecer(bioAntiga.credentialId); // a chave antiga sumiu; a biometria precisa ser ativada de novo
      await R.commit([audit('Trocou a chave dos dados', '', `${removidos} acesso(s) por PIN removido(s)`)]);
      return removidos;
    },
  };
}
