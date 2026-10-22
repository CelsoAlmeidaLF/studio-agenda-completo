// Leituras internas da aplicação, sem filtro de permissão. Só os casos de uso usam estas funções;
// a interface recebe as versões filtradas de consultas.js.
export function dados(ctx) {
  const R = ctx.cofre;
  const profs = (incluirInativos = false) => R.all('prof').filter((p) => incluirInativos || p.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const itensDaComanda = (cid) => R.all('item').filter((i) => i.comandaId === cid).sort((a, b) => a.hora.localeCompare(b.hora));
  const saldo = (conta) => R.all('lanc').filter((l) => l.conta === conta).reduce((s, l) => s + l.valor, 0);
  const caixaDia = (data) => R.get('cx', data);
  const caixaAberto = (data) => !ctx.est().usaCaixa || !!caixaDia(data);
  const lancsCaixaDia = (data) => R.all('lanc').filter((l) => l.conta === 'caixa' && l.data === data).sort((a, b) => b.em.localeCompare(a.em));
  const ehMeuCliente = (cliId) => !!cliId && R.all('item').some((i) => i.cliId === cliId && i.profId === R.userId());
  const nomeCliente = (x) => (x.cliId ? R.get('cli', x.cliId)?.nome : x.avulso) || 'Cliente avulso';
  const celularEmUso = (cel, exceptId) => !!cel && R.all('cli').some((x) => x.id !== exceptId && x.ativo !== false && x.cel === cel);
  return { profs, itensDaComanda, saldo, caixaDia, caixaAberto, lancsCaixaDia, ehMeuCliente, nomeCliente, celularEmUso };
}
