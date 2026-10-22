// Gestão: estabelecimento, horário, caixa, serviços, equipe, permissões e segurança.
import { h, icon, money, parseMoney, centsToInput, fmtDateTime, onlyDigits, fmtPhone, DIAS } from '../base.js';
import { can, PERM_CATALOG } from '../../../../domain/permissoes.js';
import { CORES, AREAS, SERVICO_PRINCIPAL, UFS } from '../../../../domain/equipe.js';
import { pinProblem } from '../../../../domain/pin.js';
import { route, go, sheet, closeSheet, toast, run, field, input, select, avatar, emptyState, navRow, rerender, dangerBtn, pill } from '../kit.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição
const pinInput = (attrs = {}) => input({ type: 'password', inputmode: 'numeric', maxlength: 6, ...attrs });

export function registerGestao(app) {
  S = app;
  route('gestao', () => {
    const me = S.me();
    const grp = (t, ...rows) => { const r = rows.filter(Boolean); return r.length ? h('div', null, h('h3', { class: 'gtitle' }, t), h('div', { class: 'card' }, r)) : null; };
    // Tela larga: os grupos ficam em duas colunas.
    const body = h('div', { class: 'duo' },
      h('p', { class: 'divider span-2' }, 'OPERAÇÃO'),
      grp('Estabelecimento', can(me, 'gestao.est') && navRow('Geral', () => go('estabelecimento')), can(me, 'gestao.est') && navRow('Horário de funcionamento', () => go('horario')), can(me, 'gestao.est') && navRow('Agenda e caixa', () => go('preferencias'))),
      grp('Serviços', can(me, 'gestao.itens') && navRow('Lista de serviços', () => go('servicos'))),
      grp('Produtos', can(me, 'gestao.itens') && navRow('Lista de produtos', () => go('produtos'))),
      grp('Equipe', can(me, 'gestao.equipe') && navRow('Lista de profissionais', () => go('profissionais'))),
      h('p', { class: 'divider span-2' }, 'SISTEMA'),
      grp('Segurança', navRow('Meu PIN e biometria', () => go('meupin')), can(me, 'seguranca') && navRow('Bloqueio, backup e dados', () => go('seguranca')), can(me, 'seguranca') && navRow('Auditoria', () => go('auditoria'))));
    return { title: 'Gestão', sub: S.est().nome, layout: 'largo', body };
  });

  route('estabelecimento', () => {
    if (!can(S.me(), 'gestao.est')) return deny('Estabelecimento');
    const e = S.est();
    const f = {
      nome: input({ value: e.nome, maxlength: 80 }), servicoPrincipal: select(SERVICO_PRINCIPAL.map((x) => [x, x]), e.servicoPrincipal),
      razao: input({ value: e.razao, maxlength: 120 }), cnpj: input({ value: e.cnpj, maxlength: 18, inputmode: 'numeric', placeholder: '00.000.000/0000-00' }),
      cep: input({ value: e.endereco.cep, maxlength: 9, inputmode: 'numeric' }), rua: input({ value: e.endereco.rua, maxlength: 120 }), num: input({ value: e.endereco.num, maxlength: 10 }), comp: input({ value: e.endereco.comp, maxlength: 40, placeholder: 'Opcional' }),
      bairro: input({ value: e.endereco.bairro, maxlength: 60 }), cidade: input({ value: e.endereco.cidade, maxlength: 60 }), uf: select(UFS.map((x) => [x, x]), e.endereco.uf),
      tel1: input({ value: fmtPhone(e.tel1), inputmode: 'tel', maxlength: 20 }), tel2: input({ value: fmtPhone(e.tel2), inputmode: 'tel', maxlength: 20, placeholder: 'Opcional' }), email: input({ value: e.email, type: 'email', maxlength: 120, placeholder: 'Opcional' }),
    };
    const salvar = () => {
      const cnpj = onlyDigits(f.cnpj.value);
      if (cnpj && cnpj.length !== 14) return toast('CNPJ deve ter 14 números.');
      run(() => S.salvarEstabelecimento({ nome: f.nome.value, servicoPrincipal: f.servicoPrincipal.value, razao: f.razao.value.trim(), cnpj: f.cnpj.value.trim(),
        endereco: { cep: f.cep.value.trim(), rua: f.rua.value.trim(), num: f.num.value.trim(), comp: f.comp.value.trim(), bairro: f.bairro.value.trim(), cidade: f.cidade.value.trim(), uf: f.uf.value },
        tel1: onlyDigits(f.tel1.value), tel2: onlyDigits(f.tel2.value), email: f.email.value.trim() }), 'Dados salvos').catch(() => {});
    };
    return { title: 'Estabelecimento', back: 'gestao', body: h('div', { class: 'stack' },
      h('div', { class: 'card pad stack' }, field('Nome', f.nome, 'Nome ou marca pela qual o estabelecimento é conhecido.'), field('Serviço principal', f.servicoPrincipal), field('Razão social', f.razao), field('CNPJ', f.cnpj)),
      h('h3', { class: 'gtitle' }, 'Endereço'),
      h('div', { class: 'card pad stack' }, h('div', { class: 'row2' }, field('CEP', f.cep), field('Estado', f.uf)), field('Rua', f.rua), h('div', { class: 'row2' }, field('Número', f.num), field('Complemento', f.comp)), h('div', { class: 'row2' }, field('Bairro', f.bairro), field('Cidade', f.cidade))),
      h('h3', { class: 'gtitle' }, 'Contatos'),
      h('div', { class: 'card pad stack' }, h('p', { class: 'muted small' }, 'O número principal e o e-mail aparecem nas mensagens enviadas aos clientes.'), h('div', { class: 'row2' }, field('Número principal', f.tel1), field('Número secundário', f.tel2)), field('E-mail', f.email))),
      footer: h('button', { class: 'bar pri', onclick: salvar }, h('span', null, 'Salvar alterações')) };
  });

  route('horario', () => {
    if (!can(S.me(), 'gestao.est')) return deny('Horário de funcionamento');
    const hor = structuredClone(S.est().horario);
    const box = h('div', { class: 'stack' });
    const draw = () => {
      box.replaceChildren(...[1, 2, 3, 4, 5, 6, 0].map((d) => h('div', null, h('h3', { class: 'gtitle' }, DIAS[d]), h('div', { class: 'card' },
        hor[d].length ? hor[d].map((iv, i) => h('div', { class: 'ivrow' },
          input({ type: 'time', value: iv[0], step: 300, 'aria-label': `${DIAS[d]} início`, onchange: (e) => { iv[0] = e.target.value; } }), h('span', null, 'até'),
          input({ type: 'time', value: iv[1], step: 300, 'aria-label': `${DIAS[d]} fim`, onchange: (e) => { iv[1] = e.target.value; } }),
          h('button', { class: 'hbtn', 'aria-label': 'Remover intervalo', onclick: () => { hor[d].splice(i, 1); draw(); } }, icon('close', 18)))) : h('div', { class: 'ivrow muted' }, 'Estabelecimento fechado'),
        h('button', { class: 'link right block', onclick: () => { hor[d].push(hor[d].length ? ['13:00', '19:00'] : ['08:00', '19:00']); draw(); } }, '+ Adicionar intervalo')))));
    };
    draw();
    return { title: 'Horário de funcionamento', back: 'gestao', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Indique os dias e horários de atendimento. Use mais de um intervalo para marcar pausas, como o almoço.'), box),
      footer: h('button', { class: 'bar pri', onclick: () => run(() => S.salvarHorario(hor), 'Horário salvo').catch(() => {}) }, h('span', null, 'Salvar horário')) };
  });

  route('preferencias', () => {
    if (!can(S.me(), 'gestao.est')) return deny('Agenda e caixa');
    const e = S.est();
    const slot = select([[15, '15 minutos'], [30, '30 minutos'], [60, '60 minutos']], e.slot);
    const opt = (val, t, d) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'cx', value: val, checked: e.usaCaixa === (val === 'sim') }), h('span', null, h('b', null, t), h('small', null, d)));
    const body = h('div', { class: 'stack' },
      h('div', { class: 'card pad' }, field('Intervalo da grade da agenda', slot)),
      h('h3', { class: 'gtitle' }, 'Fechamento de caixa'),
      h('p', { class: 'muted' }, 'O estabelecimento usa fechamento de caixa para controlar entradas e saídas?'),
      h('div', { class: 'card' }, opt('nao', 'Não', 'O estabelecimento não usa fechamento de caixa.'), opt('sim', 'Sim', 'É preciso informar todo dia o valor inicial do caixa.')));
    return { title: 'Agenda e caixa', back: 'gestao', body,
      footer: h('button', { class: 'bar pri', onclick: () => run(() => S.salvarPreferencias({ slot: Number(slot.value), usaCaixa: body.querySelector('input[name=cx]:checked')?.value === 'sim' }), 'Preferências salvas').catch(() => {}) }, h('span', null, 'Salvar')) };
  });

  route('servicos', () => {
    if (!can(S.me(), 'gestao.itens')) return deny('Serviços');
    const all = S.servicos(true);
    const cats = new Map();
    for (const s of all) { if (!cats.has(s.categoria)) cats.set(s.categoria, []); cats.get(s.categoria).push(s); }
    return { title: 'Serviços', back: 'gestao',
      body: all.length ? h('div', { class: 'stack' }, [...cats].map(([c, ss]) => h('div', null, h('h3', { class: 'gtitle' }, c), h('div', { class: 'card' }, ss.map((s) => h('button', { class: 'srow' + (s.ativo === false ? ' off' : ''), onclick: () => editarServico(s) }, h('span', null, h('b', null, s.nome), h('small', null, `${money(s.preco)} | ${s.duracao >= 60 ? Math.floor(s.duracao / 60) + 'h' + (s.duracao % 60 ? ' ' + (s.duracao % 60) + 'm' : '') : s.duracao + ' min'}${s.ativo === false ? ' · inativo' : ''}`)), icon('right', 16, 'chev'))))))) : emptyState('scissors', 'Nenhum serviço', 'Toque em + para cadastrar.'),
      fab: { label: 'Novo serviço', onclick: () => editarServico(null) } };
  });

  route('profissionais', async () => {
    if (!can(S.me(), 'gestao.equipe')) return deny('Equipe');
    const logins = new Set((await S.acessos()).map((l) => l.id));
    return { title: 'Profissionais', back: 'gestao',
      body: h('div', { class: 'card' }, S.profs(true).map((p) => h('button', { class: 'prow' + (p.ativo === false ? ' off' : ''), onclick: () => editarProf(p, logins.has(p.id)) }, avatar(p, 46),
        h('span', { class: 'pn' }, h('b', null, p.nome), h('small', null, `${p.area} · comissão ${p.comissao}%${p.ativo === false ? ' · inativo' : ''}`)),
        logins.has(p.id) ? pill('Com PIN', '#16a34a') : pill('Sem acesso', '#7d7f86')))),
      fab: { label: 'Novo profissional', onclick: () => editarProf(null, false) } };
  });

  route('permissoes', ({ id }) => {
    const me = S.me();
    if (!can(me, 'gestao.perm')) return deny('Permissões');
    const p = S.prof(id);
    if (!p) return deny('Permissões');
    const perm = { ...p.perm };
    const box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(...PERM_CATALOG.map((area) => h('details', { class: 'card perm', open: true },
      h('summary', null, h('b', null, area.area), icon('down', 18, 'chev')),
      area.grupos.map((g) => h('fieldset', { class: 'pg' }, h('legend', null, g.t),
        g.ops.map((txt, lvl) => [
          h('label', { class: 'radio' + (perm[g.k] === lvl ? ' on' : '') }, h('input', { type: 'radio', name: g.k, checked: perm[g.k] === lvl, onchange: () => { perm[g.k] = lvl; draw(); } }), h('span', null, txt)),
          perm[g.k] === lvl ? (g.extras?.[lvl] || []).map(([ek, et]) => h('label', { class: 'chk sub' }, h('input', { type: 'checkbox', checked: !!perm[ek], onchange: (e) => { perm[ek] = e.target.checked; } }), h('span', null, et))) : null,
        ]))))));
    draw();
    return { title: 'Permissões', sub: p.nome, back: 'profissionais', body: box,
      footer: h('button', { class: 'bar pri', onclick: () => run(() => S.salvarPermissoes(p.id, perm), 'Permissões salvas').then(() => go('profissionais')).catch(() => {}) }, h('span', null, 'Salvar permissões')) };
  });

  route('meupin', async () => {
    const a = pinInput({ autocomplete: 'current-password' });
    const b = pinInput({ autocomplete: 'new-password' });
    const c = pinInput({ autocomplete: 'new-password' });
    return { title: 'Meu PIN e biometria', back: 'gestao', body: h('div', { class: 'stack' },
      h('div', { class: 'card pad stack' }, h('p', { class: 'muted' }, 'O PIN é a chave que abre os dados criptografados neste aparelho. Use 6 números, sem sequências.'), field('PIN atual', a), field('Novo PIN', b), field('Repita o novo PIN', c)),
      await cartaoBiometria()),
      footer: h('button', { class: 'bar pri', onclick: async () => {
        const prob = pinProblem(b.value);
        if (prob) return toast(prob);
        if (b.value !== c.value) return toast('Os novos PINs não são iguais.');
        const ok = await run(() => S.trocarMeuPin(a.value, b.value), 'PIN alterado').then(() => true, () => false);
        if (ok) a.value = b.value = c.value = '';
      } }, h('span', null, 'Trocar PIN')) };
  });

  route('seguranca', async () => {
    if (!can(S.me(), 'seguranca')) return deny('Segurança');
    const e = S.est();
    const lock = select([[1, '1 minuto'], [3, '3 minutos'], [5, '5 minutos'], [10, '10 minutos'], [15, '15 minutos']], e.lockMin || 5);
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    const est = await navigator.storage?.estimate?.().catch(() => null);
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'inp' });
    const pinB = pinInput({ autocomplete: 'off', 'aria-label': 'PIN usado na época do backup' });
    const pinK = pinInput({ autocomplete: 'current-password', 'aria-label': 'Seu PIN' });
    const conf = input({ placeholder: 'Digite APAGAR', maxlength: 10, 'aria-label': 'Confirmação' });
    return { title: 'Segurança', back: 'gestao', body: h('div', { class: 'stack' },
      h('div', { class: 'card pad stack-s' }, h('h3', { class: 'ch' }, icon('shield', 22), 'Proteção dos dados'),
        h('p', { class: 'small' }, 'Os dados ficam no banco do navegador (IndexedDB), cifrados com AES-256-GCM. A chave é aberta pelo PIN de cada profissional (PBKDF2-SHA256, 600 mil iterações).'),
        h('div', { class: 'kv' }, h('span', null, 'Armazenamento persistente'), h('b', null, persisted ? 'Ativado' : 'Não garantido')),
        est ? h('div', { class: 'kv' }, h('span', null, 'Espaço usado'), h('b', null, `${(est.usage / 1048576).toFixed(1)} MB`)) : null,
        h('div', { class: 'kv' }, h('span', null, 'Registros com falha de integridade'), h('b', { class: S.integridade() ? 'neg' : '' }, String(S.integridade()))),
        !persisted ? h('button', { class: 'btn sm', onclick: async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Armazenamento persistente ativado' : 'O navegador não liberou. Instale o app na tela inicial.', ok); rerender(); } }, 'Pedir armazenamento persistente') : null),
      h('div', { class: 'card pad stack-s' }, field('Bloquear automaticamente após inatividade', lock),
        h('button', { class: 'btn', onclick: () => run(() => S.salvarBloqueioAutomatico(Number(lock.value)), 'Bloqueio automático salvo').catch(() => {}) }, 'Salvar')),
      h('div', { class: 'card pad stack-s' }, h('h3', { class: 'ch' }, 'Backup'),
        h('p', { class: 'small muted' }, 'O arquivo continua criptografado. Para restaurar, será preciso o PIN de um profissional que existia na data do backup. Guarde fora deste aparelho.'),
        h('button', { class: 'btn pri', onclick: async () => {
          const data = await run(() => S.exportarBackup()).catch(() => null);
          if (!data) return;
          const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
          const a = h('a', { href: url, download: `studio-agenda-backup-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('Backup gerado', true);
        } }, 'Baixar backup criptografado'),
        file, field('PIN do backup', pinB, 'PIN de um profissional que existia na data do backup.'),
        dangerBtn('Restaurar backup (substitui os dados atuais)', async () => {
          if (!file.files[0]) return toast('Escolha o arquivo de backup.');
          try { await S.restaurarBackup(await file.files[0].text(), pinB.value); toast('Backup restaurado. Entre de novo.', true); setTimeout(() => { S.bloquear(); location.reload(); }, 800); } catch (err) { toast(err.message); }
        })),
      can(S.me(), 'gestao.equipe') ? h('div', { class: 'card pad stack-s' }, h('h3', { class: 'ch' }, icon('key', 22), 'Trocar a chave dos dados'),
        h('p', { class: 'small muted' }, 'Use depois de desligar alguém da equipe. Todos os dados são cifrados de novo com uma chave nova: cópias antigas do banco e backups antigos deixam de abrir os dados atuais. Só você continua com acesso; crie de novo o PIN de cada profissional em Gestão › Equipe. Faça um backup novo em seguida.'),
        field('Seu PIN', pinK),
        dangerBtn('Trocar a chave e remover os outros PINs', async () => {
          try { const n = await S.trocarChaveDosDados(pinK.value); pinK.value = ''; toast(`Chave trocada. ${n} acesso(s) por PIN removido(s).`, true); rerender(); } catch (err) { toast(err.message); }
        })) : null,
      h('div', { class: 'card pad stack-s' }, h('h3', { class: 'ch' }, 'Apagar dados'),
        h('p', { class: 'small muted' }, 'Remove todos os dados e chaves deste aparelho. Não pode ser desfeito. Faça um backup antes.'),
        conf,
        dangerBtn('Apagar tudo deste aparelho', async () => { try { await S.apagarTudo(conf.value); location.hash = '#/setup'; location.reload(); } catch (err) { toast(err.message); } }))) };
  });

  route('auditoria', () => {
    if (!can(S.me(), 'seguranca')) return deny('Auditoria');
    const list = S.auditoria();
    return { title: 'Auditoria', back: 'gestao', body: h('div', { class: 'card' }, list.map((a) => h('div', { class: 'mov' },
      h('div', { class: 'mov-c' }, h('small', { class: 'muted' }, `${fmtDateTime(a.em)} · ${S.nomeProf(a.autor)}`), h('b', null, a.acao), a.alvo ? h('span', null, a.alvo) : null, a.detalhe ? h('small', { class: 'muted' }, a.detalhe) : null)))) };
  });
}

// Biometria: liga com o PIN e passa a abrir o app pela digital ou pelo rosto deste aparelho.
async function cartaoBiometria() {
  const [disp, ativa] = await Promise.all([S.biometriaDisponivel(), S.minhaBiometria()]);
  const tit = h('h3', { class: 'ch' }, icon('fingerprint', 22), 'Biometria');
  const txt = 'Entre com a digital ou o rosto deste aparelho, sem digitar o PIN. A biometria fica só neste aparelho, abre os dados com criptografia e o PIN continua valendo.';
  if (!disp) return h('div', { class: 'card pad stack-s' }, tit, h('p', { class: 'small muted' }, txt), h('p', { class: 'note' }, 'Este aparelho ou navegador não oferece biometria com criptografia (WebAuthn com PRF). Continue usando o PIN. No Android, use o Chrome atualizado com o bloqueio de tela ativo.'));
  if (ativa) return h('div', { class: 'card pad stack-s' }, tit, h('p', { class: 'small muted' }, txt),
    h('div', { class: 'kv' }, h('span', null, 'Situação'), h('b', { class: 'pos' }, 'Ativada neste aparelho')),
    dangerBtn('Desativar a biometria', () => run(() => S.desativarBiometria(), 'Biometria desativada').then(rerender).catch(() => {})));
  const p = pinInput({ autocomplete: 'current-password', 'aria-label': 'Seu PIN para ativar a biometria' });
  return h('div', { class: 'card pad stack-s' }, tit, h('p', { class: 'small muted' }, txt),
    field('Seu PIN', p, 'O PIN confirma que é você antes de cadastrar a biometria.'),
    h('button', { class: 'btn pri with-ic', onclick: async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      try { await S.ativarBiometria(p.value); toast('Biometria ativada. Na próxima entrada, é só tocar na digital.', true); rerender(); }
      catch (e) { toast(e.message); b.disabled = false; }
    } }, icon('fingerprint', 20), 'Ativar a biometria'));
}

const deny = (t) => ({ title: t, back: 'gestao', body: emptyState('lock', 'Sem acesso', 'Peça ao gestor para liberar esta permissão.') });

function editarServico(s) {
  const n = input({ value: s?.nome || '', maxlength: 80 });
  const cat = input({ value: s?.categoria || '', maxlength: 40, list: 'cats', placeholder: 'Ex.: Cílios' });
  const dl = h('datalist', { id: 'cats' }, [...new Set(S.servicos(true).map((x) => x.categoria))].map((c) => h('option', { value: c })));
  const dur = input({ type: 'number', min: 5, max: 720, step: 5, value: s?.duracao || 30 });
  const pr = input({ inputmode: 'decimal', value: s ? centsToInput(s.preco) : '' });
  const profs = S.profs().filter((p) => p.atende !== false);
  const sel = new Set(s?.profs || []);
  const pbox = h('div', { class: 'chips' }, profs.map((p) => h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: sel.has(p.id), onchange: (e) => (e.target.checked ? sel.add(p.id) : sel.delete(p.id)) }), h('span', null, p.nome))));
  const at = h('input', { type: 'checkbox', checked: s?.ativo !== false, id: 'sat' });
  sheet(s ? 'Editar serviço' : 'Novo serviço', h('div', { class: 'stack' }, field('Nome', n), field('Categoria', cat), dl, h('div', { class: 'row2' }, field('Duração (min)', dur), field('Preço (R$)', pr)),
    h('div', { class: 'field' }, h('label', null, 'Profissionais que executam'), pbox, h('small', null, 'Nenhum marcado = todos executam.')),
    h('label', { class: 'chk', for: 'sat' }, at, h('span', null, 'Serviço ativo'))),
    h('button', { class: 'btn pri', onclick: () => run(() => S.salvarServico({ id: s?.id, nome: n.value, categoria: cat.value, duracao: Number(dur.value), preco: parseMoney(pr.value), profs: [...sel], ativo: at.checked }), 'Serviço salvo').then(() => { closeSheet(); rerender(); }).catch(() => {}) }, 'Salvar'));
}

function editarProf(p, temLogin) {
  const me = S.me();
  const n = input({ value: p?.nome || '', maxlength: 60 });
  const sg = input({ value: p?.sigla || '', maxlength: 3, placeholder: 'Auto' });
  const ar = select(AREAS.map((a) => [a, a]), p?.area || 'Outros');
  const cm = input({ type: 'number', min: 0, max: 100, step: 0.5, value: p?.comissao ?? 40 });
  let cor = p?.cor || CORES[S.profs(true).length % CORES.length];
  const sw = h('div', { class: 'chips' }, CORES.map((c) => h('label', { class: 'sw' }, h('input', { type: 'radio', name: 'cor', checked: c === cor, onchange: () => { cor = c; }, 'aria-label': 'Cor ' + c }), h('i', { style: { '--c': c } }))));
  const atende = h('input', { type: 'checkbox', id: 'pat', checked: p?.atende !== false });
  const ativo = h('input', { type: 'checkbox', id: 'pav', checked: p?.ativo !== false });
  const proprio = p && p.id === me.id;
  const pin1 = proprio ? null : pinInput({ autocomplete: 'new-password', placeholder: temLogin ? 'Deixe vazio para manter' : '6 números' });
  const salvar = async () => {
    if (pin1?.value) { const prob = pinProblem(pin1.value); if (prob) return toast(prob); }
    try {
      const obj = await S.salvarProfissional({ id: p?.id, nome: n.value, sigla: sg.value, area: ar.value, comissao: Number(cm.value), cor, ativo: ativo.checked, atende: atende.checked });
      if (pin1?.value) await S.definirPin(obj.id, pin1.value);
      closeSheet(); toast('Profissional salvo', true); rerender();
    } catch (e) { toast(e.message); }
  };
  sheet(p ? 'Editar profissional' : 'Novo profissional', h('div', { class: 'stack' }, field('Nome', n), h('div', { class: 'row2' }, field('Sigla', sg), field('Área', ar)), field('Comissão padrão (%)', cm), h('div', { class: 'field' }, h('label', null, 'Cor na agenda'), sw),
    h('label', { class: 'chk', for: 'pat' }, atende, h('span', null, 'Atende clientes (aparece na agenda)')),
    h('label', { class: 'chk', for: 'pav' }, ativo, h('span', null, 'Profissional ativo')),
    pin1 ? field(temLogin ? 'Redefinir PIN de acesso' : 'Criar PIN de acesso', pin1, 'Passe o PIN pessoalmente ao profissional. Ele pode trocar depois em Gestão › Meu PIN.') : h('p', { class: 'muted small' }, 'O seu PIN é trocado em Gestão › Meu PIN.'),
    p && can(me, 'gestao.perm') ? h('button', { class: 'btn block', onclick: () => { closeSheet(); go('permissoes', { id: p.id }); } }, icon('shield', 18), 'Permissões') : null,
    p && temLogin && p.id !== me.id ? dangerBtn('Remover acesso por PIN', () => run(() => S.removerAcesso(p.id), 'Acesso removido').then(() => { closeSheet(); rerender(); })) : null),
    h('button', { class: 'btn pri', onclick: salvar }, 'Salvar'));
}
