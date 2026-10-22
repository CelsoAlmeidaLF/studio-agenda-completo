// Casos de uso de clientes, agendamentos, status, lembretes e bloqueios (RN-01 a RN-17).
import { scheduleProblem, nextStatuses } from '../../domain/agenda.js';
import { isData, isHora, isCelular, isCentavos } from '../../domain/validacao.js';
import { clip, onlyDigits } from '../../shared/texto.js';

export function casosAgenda(ctx, d) {
  const R = ctx.cofre;
  const { need, audit, uid, agoraISO, nomeProf, est } = ctx;

  const celularValido = (raw) => {
    const cel = onlyDigits(raw);
    if (cel && !isCelular(cel)) throw new Error('Celular inválido. Use DDD + número.');
    return cel;
  };
  const exigeItem = (id) => { const it = R.get('item', id); if (!it) throw new Error('Agendamento não encontrado.'); return it; };

  return {
    // ---------- Clientes ----------
    async salvarCliente(c) {
      const atual = c.id ? R.get('cli', c.id) : null;
      if (c.id && !atual) throw new Error('Cliente não encontrado.');
      const meu = d.ehMeuCliente(c.id);
      if (atual) need('cliente.editar', { ehMeuCliente: meu }, 'Você não tem permissão para editar este cliente.');
      else need('cliente.criar', {}, 'Você não tem permissão para cadastrar clientes.');
      const nome = clip(c.nome, 80);
      if (!nome) throw new Error('Informe o nome do cliente.');
      const podeContato = !atual || ctx.can('cliente.contatos', { ehMeuCliente: meu });
      const cel = podeContato ? celularValido(c.cel) : atual.cel;
      if (podeContato && d.celularEmUso(cel, c.id)) throw new Error('Já existe um cliente com este celular.');
      const obj = {
        favoritos: [], criadoEm: agoraISO(), ativo: true, ...(atual || {}),
        id: c.id || uid(), nome, cel, email: podeContato ? clip(c.email, 120) : atual.email, obs: clip(c.obs, 500),
      };
      await R.commit([{ put: 'cli', obj }, audit(atual ? 'Editou cliente' : 'Criou cliente', nome)]);
      return obj;
    },
    async inativarCliente(cid) {
      const c = R.get('cli', cid);
      if (!c) throw new Error('Cliente não encontrado.');
      need('cliente.editar', { ehMeuCliente: d.ehMeuCliente(cid) }, 'Você não tem permissão para inativar este cliente.');
      await R.commit([{ put: 'cli', obj: { ...c, ativo: false } }, audit('Inativou cliente', c.nome)]);
    },
    async alternarFavorito(cliId, profId) {
      const c = R.get('cli', cliId);
      if (!c || !R.get('prof', profId)) throw new Error('Cliente ou profissional não encontrado.');
      need('agenda.editar', { profId });
      const fav = new Set(c.favoritos || []);
      fav.has(profId) ? fav.delete(profId) : fav.add(profId);
      await R.commit([{ put: 'cli', obj: { ...c, favoritos: [...fav] } }]);
      return fav.has(profId);
    },

    // ---------- Agendamento ----------
    async agendar(input) {
      const prof = R.get('prof', input.profId), srv = R.get('srv', input.srvId);
      if (!prof || prof.ativo === false) throw new Error('Escolha um profissional ativo.');
      if (!srv || srv.ativo === false) throw new Error('Escolha um serviço ativo.');
      need('agenda.editar', { profId: prof.id }, `Você não pode criar agendamentos para ${prof.nome}.`);
      const atual = input.itemId ? exigeItem(input.itemId) : null;
      if (atual) {
        need('agenda.editar', { profId: atual.profId });
        if (atual.status === 'pago') throw new Error('Este item já foi pago. Anule o fechamento para editar.');
      }
      if (!isData(input.data) || !isHora(input.hora)) throw new Error('Data ou hora inválida.');
      const ops = [];
      let cliId = input.cliId || null, avulso = null;
      if (input.novoNome) {
        need('cliente.criar', {}, 'Você não tem permissão para cadastrar clientes.');
        const nc = { id: uid(), nome: clip(input.novoNome, 80), cel: celularValido(input.novoCel), email: '', obs: '', ativo: true, criadoEm: agoraISO(), favoritos: [] };
        if (!nc.nome) throw new Error('Informe o nome do cliente.');
        if (d.celularEmUso(nc.cel)) throw new Error('Já existe um cliente com este celular.');
        ops.push({ put: 'cli', obj: nc }, audit('Criou cliente', nc.nome));
        cliId = nc.id;
      } else if (cliId) {
        const c = R.get('cli', cliId);
        if (!c || c.ativo === false) throw new Error('Escolha um cliente ativo.');
      } else {
        avulso = clip(input.avulso, 80) || 'Cliente avulso';
      }
      let preco = atual && atual.srvId === srv.id ? atual.preco : srv.preco;
      if (input.preco != null && ctx.can('preco.editar')) {
        if (!isCentavos(input.preco)) throw new Error('Preço inválido.');
        preco = input.preco;
      }
      const item = {
        ...(atual || { id: uid(), status: 'marcado', notificado: false, criadoPor: R.userId(), criadoEm: agoraISO() }),
        cliId, avulso, data: input.data, hora: input.hora, duracao: srv.duracao, profId: prof.id, srvId: srv.id, nome: srv.nome, preco, nota: clip(input.nota, 300),
      };
      if (atual && (atual.data !== item.data || atual.hora !== item.hora || atual.profId !== item.profId)) {
        if (atual.status === 'confirmado') item.status = 'marcado';
        item.notificado = false; // RN-07
      }
      const problema = scheduleProblem({ est: est(), items: R.all('item'), bloqueios: R.all('bloq'), item, nomeDe: nomeProf });
      if (problema) throw new Error(problema);

      // Comanda: mesmo cliente + mesma data (RN-17). Avulso sempre ganha comanda própria, a menos que já esteja nela.
      let comanda = null;
      if (atual && R.get('comanda', atual.comandaId)?.data === item.data && atual.cliId === cliId && (cliId || atual.avulso === avulso)) comanda = R.get('comanda', atual.comandaId);
      if (!comanda && cliId) comanda = R.all('comanda').find((c) => c.cliId === cliId && c.data === item.data && c.status === 'aberta');
      if (!comanda) { comanda = { id: uid(), cliId, avulso, data: item.data, status: 'aberta', fechId: null, criadaEm: agoraISO() }; ops.push({ put: 'comanda', obj: comanda }); }
      if (comanda.status !== 'aberta') throw new Error('A comanda deste cliente neste dia já foi fechada. Anule o fechamento para adicionar itens.');
      if (atual && atual.comandaId !== comanda.id) {
        const restantes = d.itensDaComanda(atual.comandaId).filter((i) => i.id !== atual.id);
        if (!restantes.length) ops.push({ del: 'comanda', id: atual.comandaId });
      }
      item.comandaId = comanda.id;
      const nomeCli = cliId ? (R.get('cli', cliId)?.nome || clip(input.novoNome, 80)) : avulso;
      ops.push({ put: 'item', obj: item }, audit(atual ? 'Editou agendamento' : 'Criou agendamento', `${nomeCli} · ${srv.nome}`, `${item.data} ${item.hora} · ${prof.nome}`));
      await R.commit(ops);
      return item;
    },

    async mudarStatus(itemId, status) {
      const it = exigeItem(itemId);
      need('agenda.editar', { profId: it.profId });
      if (!nextStatuses(it.status).includes(status)) throw new Error('Mudança de status não permitida.');
      if (status === 'marcado' && it.status === 'cancelado') {
        const p = scheduleProblem({ est: est(), items: R.all('item'), bloqueios: R.all('bloq'), item: { ...it, status }, nomeDe: nomeProf });
        if (p) throw new Error(p);
      }
      await R.commit([{ put: 'item', obj: { ...it, status } }, audit('Mudou status', it.nome, `${it.status} → ${status}`)]);
    },

    async removerItem(itemId) {
      const it = exigeItem(itemId);
      need('agenda.editar', { profId: it.profId });
      if (it.status === 'pago') throw new Error('Item pago não pode ser excluído. Anule o fechamento primeiro.');
      const ops = [{ del: 'item', id: it.id }, audit('Excluiu agendamento', it.nome, `${it.data} ${it.hora}`)];
      if (!d.itensDaComanda(it.comandaId).some((i) => i.id !== it.id)) ops.push({ del: 'comanda', id: it.comandaId });
      await R.commit(ops);
    },

    async marcarNotificado(itemIds) {
      const ops = [];
      for (const id of itemIds) {
        const it = R.get('item', id);
        if (!it || !ctx.can('agenda.notificar', { profId: it.profId })) continue;
        ops.push({ put: 'item', obj: { ...it, notificado: true } });
      }
      if (ops.length) await R.commit([...ops, audit('Enviou lembrete por WhatsApp', `${ops.length} item(ns)`)]);
    },

    // ---------- Bloqueios ----------
    async salvarBloqueio(b) {
      if (!R.get('prof', b.profId)) throw new Error('Profissional não encontrado.');
      need('agenda.bloqueio', { profId: b.profId });
      const atual = b.id ? R.get('bloq', b.id) : null;
      if (b.id && !atual) throw new Error('Bloqueio não encontrado.');
      if (atual) need('agenda.bloqueio', { profId: atual.profId });
      if (!isData(b.data) || !isHora(b.inicio) || !isHora(b.fim)) throw new Error('Data ou horário inválido.');
      if (!(b.inicio < b.fim)) throw new Error('O fim do bloqueio precisa ser depois do início.');
      const obj = { id: b.id || uid(), profId: b.profId, data: b.data, inicio: b.inicio, fim: b.fim, motivo: clip(b.motivo, 60) || 'Ausência' };
      await R.commit([{ put: 'bloq', obj }, audit('Salvou bloqueio de agenda', nomeProf(b.profId), `${b.data} ${b.inicio}–${b.fim}`)]);
    },
    async removerBloqueio(id) {
      const b = R.get('bloq', id);
      if (!b) throw new Error('Bloqueio não encontrado.');
      need('agenda.bloqueio', { profId: b.profId });
      await R.commit([{ del: 'bloq', id }, audit('Removeu bloqueio', nomeProf(b.profId), `${b.data} ${b.inicio}–${b.fim}`)]);
    },
  };
}

