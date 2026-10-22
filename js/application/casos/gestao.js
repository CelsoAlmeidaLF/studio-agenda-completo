// Casos de uso de gestão: estabelecimento, horário, preferências, serviços e equipe (RN-44 a RN-47).
import { excede, normalizarPermissoes, ehGestorDePermissoes, PERM_PROFISSIONAL } from '../../domain/permissoes.js';
import { SLOTS } from '../../domain/agenda.js';
import { CORES, AREAS, SERVICO_PRINCIPAL, UFS } from '../../domain/equipe.js';
import { pinProblem } from '../../domain/pin.js';
import { isHora, isCentavos } from '../../domain/validacao.js';
import { clip, initials, onlyDigits } from '../../shared/texto.js';
import { money } from '../../shared/money.js';
import { Denied } from '../erros.js';

export function casosGestao(ctx, d) {
  const R = ctx.cofre;
  const { need, audit, uid, me, est } = ctx;

  const telefone = (s, rotulo) => {
    const t = onlyDigits(s);
    if (t && !/^\d{10,13}$/.test(t)) throw new Error(`${rotulo}: use DDD + número.`);
    return t;
  };

  // Quem não gere permissões não mexe em quem tem mais acesso do que ele (evita escalada de privilégio).
  function exigeNaoSuperar(alvo, msg) {
    if (alvo.id !== R.userId() && excede(alvo.perm, me().perm) && !ctx.can('gestao.perm')) throw new Denied(msg);
  }
  async function gestoresComAcesso(exceto) {
    const comPin = new Set((await R.listLogins()).map((l) => l.id));
    return d.profs().filter((p) => p.id !== exceto && comPin.has(p.id) && ehGestorDePermissoes(p.perm)).length;
  }
  function gestoresRestantes(exceptId, novaPerm) {
    return d.profs().filter((p) => ehGestorDePermissoes(p.id === exceptId ? novaPerm : p.perm)).length;
  }

  return {
    // ---------- Estabelecimento (só campos conhecidos: nada de sobrescrever numeração ou segurança) ----------
    async salvarEstabelecimento(dados) {
      need('gestao.est');
      const nome = clip(dados.nome, 80);
      if (!nome) throw new Error('Informe o nome do estabelecimento.');
      const cnpj = onlyDigits(dados.cnpj);
      if (cnpj && cnpj.length !== 14) throw new Error('CNPJ deve ter 14 números.');
      const en = dados.endereco || {};
      const e = {
        ...est(),
        nome,
        servicoPrincipal: SERVICO_PRINCIPAL.includes(dados.servicoPrincipal) ? dados.servicoPrincipal : est().servicoPrincipal,
        razao: clip(dados.razao, 120), cnpj,
        endereco: { cep: clip(onlyDigits(en.cep), 8), rua: clip(en.rua, 120), num: clip(en.num, 10), comp: clip(en.comp, 40), bairro: clip(en.bairro, 60), cidade: clip(en.cidade, 60), uf: UFS.includes(en.uf) ? en.uf : 'SP' },
        tel1: telefone(dados.tel1, 'Número principal'), tel2: telefone(dados.tel2, 'Número secundário'),
        email: clip(dados.email, 120),
      };
      await R.commit([{ put: 'est', obj: e }, audit('Editou dados do estabelecimento', e.nome)]);
    },
    async salvarHorario(horario) {
      need('gestao.est');
      const novo = {};
      for (let dia = 0; dia < 7; dia++) {
        const ivs = Array.isArray(horario?.[dia]) ? horario[dia] : [];
        if (ivs.some((iv) => !Array.isArray(iv) || !isHora(iv[0]) || !isHora(iv[1]))) throw new Error('Use horários no formato HH:MM.');
        const sorted = ivs.map(([a, b]) => [a, b]).sort((a, b) => a[0].localeCompare(b[0]));
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i][0] >= sorted[i][1]) throw new Error('Em cada intervalo, o fim precisa ser depois do início.');
          if (i && sorted[i][0] < sorted[i - 1][1]) throw new Error('Há intervalos sobrepostos no mesmo dia.');
        }
        novo[dia] = sorted;
      }
      await R.commit([{ put: 'est', obj: { ...est(), horario: novo } }, audit('Alterou horário de funcionamento', '')]);
    },
    async salvarPreferencias({ slot, usaCaixa }) {
      need('gestao.est');
      if (!SLOTS.includes(Number(slot))) throw new Error('Intervalo da agenda inválido.');
      const p = { slot: Number(slot), usaCaixa: !!usaCaixa };
      await R.commit([{ put: 'est', obj: { ...est(), ...p } }, audit('Alterou preferências', '', JSON.stringify(p))]);
    },
    async salvarBloqueioAutomatico(lockMin) {
      need('seguranca');
      const m = Number(lockMin);
      if (!(Number.isInteger(m) && m >= 1 && m <= 15)) throw new Error('Escolha entre 1 e 15 minutos.');
      await R.commit([{ put: 'est', obj: { ...est(), lockMin: m } }, audit('Alterou bloqueio automático', '', `${m} min`)]);
    },

    // ---------- Serviços ----------
    async salvarServico(s) {
      need('gestao.itens');
      const nome = clip(s.nome, 80);
      if (!nome) throw new Error('Informe o nome do serviço.');
      if (!(s.duracao >= 5 && s.duracao <= 720 && s.duracao % 5 === 0)) throw new Error('A duração deve ser múltiplo de 5 minutos, entre 5 e 720.');
      if (!isCentavos(s.preco)) throw new Error('Preço inválido.');
      if (s.id && !R.get('srv', s.id)) throw new Error('Serviço não encontrado.');
      const validos = new Set(d.profs(true).map((p) => p.id));
      const obj = { id: s.id || uid(), nome, categoria: clip(s.categoria, 40) || 'Geral', duracao: s.duracao, preco: s.preco, profs: (s.profs || []).filter((id) => validos.has(id)), ativo: s.ativo !== false };
      await R.commit([{ put: 'srv', obj }, audit(s.id ? 'Editou serviço' : 'Criou serviço', nome, money(obj.preco))]);
      return obj;
    },

    // ---------- Equipe ----------
    async salvarProfissional(p) {
      need('gestao.equipe');
      const nome = clip(p.nome, 60);
      if (!nome) throw new Error('Informe o nome do profissional.');
      const atual = p.id ? R.get('prof', p.id) : null;
      if (p.id && !atual) throw new Error('Profissional não encontrado.');
      if (atual) exigeNaoSuperar(atual, 'Só quem gere permissões pode editar um profissional com mais acesso do que você.');
      const com = Number(p.comissao);
      if (!(com >= 0 && com <= 100)) throw new Error('A comissão deve estar entre 0 e 100%.');
      const obj = { ...(atual || { perm: { ...PERM_PROFISSIONAL } }), id: p.id || uid(), nome, sigla: clip(p.sigla, 3).toUpperCase() || initials(nome), cor: CORES.includes(p.cor) ? p.cor : CORES[0], area: AREAS.includes(p.area) ? p.area : 'Outros', comissao: com, ativo: p.ativo !== false, atende: p.atende !== false };
      if (obj.id === R.userId() && obj.ativo === false) throw new Error('Você não pode inativar a si mesmo.');
      if (atual && obj.ativo === false && gestoresRestantes(obj.id, { ...obj.perm, gestao_perm: false }) === 0) throw new Error('Não é possível inativar o último gestor de permissões.');
      const ops = [{ put: 'prof', obj }, audit(atual ? 'Editou profissional' : 'Criou profissional', nome)];
      // Inativar apaga o acesso por PIN: para voltar, o gestor cria um PIN novo.
      if (atual && obj.ativo === false && await R.hasLogin(obj.id)) ops.push({ delKey: obj.id }, audit('Removeu acesso por PIN (inativação)', nome));
      else ops.push({ keyLabel: obj });
      await R.commit(ops);
      return obj;
    },
    async salvarPermissoes(profId, perm) {
      need('gestao.perm', {}, 'Você não tem permissão para alterar permissões.');
      const prof = R.get('prof', profId);
      if (!prof) throw new Error('Profissional não encontrado.');
      const valid = normalizarPermissoes(perm);
      if (gestoresRestantes(profId, valid) === 0) throw new Error('Precisa existir pelo menos um profissional com gestão de permissões.');
      await R.commit([{ put: 'prof', obj: { ...prof, perm: valid } }, audit('Alterou permissões', prof.nome)]);
    },
    // PIN de outro profissional. O próprio PIN é trocado em trocarMeuPin (pede o PIN atual).
    async definirPin(profId, pin) {
      need('gestao.equipe');
      if (profId === R.userId()) throw new Error('Para trocar o seu PIN, use Gestão › Meu PIN.');
      const prof = R.get('prof', profId);
      if (!prof || prof.ativo === false) throw new Error('Escolha um profissional ativo.');
      exigeNaoSuperar(prof, 'Só quem gere permissões pode definir o PIN de alguém com mais acesso do que você.');
      const prob = pinProblem(pin);
      if (prob) throw new Error(prob);
      await R.commit([{ putKey: prof, pin }, audit('Definiu PIN de acesso', prof.nome)]);
    },
    async removerAcesso(profId) {
      need('gestao.equipe');
      if (profId === R.userId()) throw new Error('Você não pode remover o seu próprio acesso.');
      const prof = R.get('prof', profId);
      if (!prof) throw new Error('Profissional não encontrado.');
      exigeNaoSuperar(prof, 'Só quem gere permissões pode remover o acesso de alguém com mais acesso do que você.');
      if (ehGestorDePermissoes(prof.perm) && await gestoresComAcesso(profId) === 0) throw new Error('Não é possível remover o acesso do último gestor de permissões.');
      await R.commit([{ delKey: profId }, audit('Removeu acesso por PIN', prof.nome)]);
    },
  };
}
