// Contexto compartilhado pelos casos de uso: portas injetadas + ajudantes (permissão, auditoria, lançamento).
import { can } from '../domain/permissoes.js';
import { isoDate } from '../shared/datas.js';
import { clip } from '../shared/texto.js';
import { Denied } from './erros.js';
import { PORTAS, SEM_BIOMETRIA } from './ports.js';

export function criarContexto(portas) {
  for (const p of PORTAS) if (!portas[p]) throw new Error(`Porta ausente: ${p}`);
  const { cofre, relogio, ids } = portas;
  const biometria = portas.biometria || SEM_BIOMETRIA;
  const me = () => cofre.get('prof', cofre.userId());
  const est = () => cofre.get('est', 'est');
  const hoje = () => isoDate(relogio.agora());
  const agoraISO = () => relogio.agora().toISOString();
  const uid = () => ids.novo();
  const nomeProf = (id) => cofre.get('prof', id)?.nome || 'Profissional';
  function need(action, ctx, msg) {
    if (!cofre.isUnlocked()) throw new Denied('Sessão bloqueada. Entre com seu PIN.');
    if (!can(me(), action, ctx)) throw new Denied(msg || 'Você não tem permissão para esta ação.');
  }
  const audit = (acao, alvo, detalhe = '') => ({ put: 'audit', obj: { id: uid(), em: agoraISO(), autor: cofre.userId(), acao, alvo, detalhe: clip(detalhe, 300) } });
  const lanc = (o) => ({ put: 'lanc', obj: { id: uid(), em: agoraISO(), autor: cofre.userId(), forma: null, origem: null, ...o } });
  return { cofre, relogio, ids, biometria, me, est, hoje, agoraISO, uid, nomeProf, need, audit, lanc, can: (a, c) => can(me(), a, c) };
}
