// Configuração inicial, entrada com PIN e recuperação.
import { h, icon } from '../base.js';
import { pinProblem } from '../../../../domain/pin.js';
import { route, go, toast, field, input, avatar, sheet, closeSheet } from '../kit.js';

let S; // aplicação (casos de uso), injetada pela raiz de composição

const pinInput = (attrs = {}) => input({ type: 'password', inputmode: 'numeric', maxlength: 6, pattern: '\\d{6}', placeholder: '••••••', ...attrs });

export function registerAuth(app, { onLogin }) {
  S = app;
  route('setup', () => {
    const est = input({ maxlength: 80, placeholder: 'Ex.: Studio Bella Forma', required: true });
    const nome = input({ maxlength: 60, placeholder: 'Seu nome', required: true });
    const pin1 = pinInput({ autocomplete: 'new-password', required: true });
    const pin2 = pinInput({ autocomplete: 'new-password', required: true });
    const ex = h('input', { type: 'checkbox', id: 'ex', checked: true });
    const err = h('p', { class: 'err', role: 'alert' });
    const btn = h('button', { class: 'btn pri block', type: 'submit' }, 'Criar e proteger com PIN');
    const form = h('form', { class: 'auth-card', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const p = pin1.value;
      const prob = pinProblem(p);
      if (!est.value.trim() || !nome.value.trim()) { err.textContent = 'Preencha o nome do estabelecimento e o seu nome.'; return; }
      if (prob) { err.textContent = prob; return; }
      if (p !== pin2.value) { err.textContent = 'Os dois PINs não são iguais.'; return; }
      btn.disabled = true; btn.textContent = 'Gerando chaves de segurança…';
      try {
        const adminId = await S.configurar({ estNome: est.value, adminNome: nome.value, pin: p, comExemplos: ex.checked });
        try { await navigator.storage?.persist?.(); } catch {}
        toast('Pronto! Entre com o seu PIN.', true);
        go('login', { id: adminId });
      } catch (e2) { err.textContent = e2.message; btn.disabled = false; btn.textContent = 'Criar e proteger com PIN'; }
    } },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('agenda', 30)), h('div', null, h('b', null, 'Studio Agenda'), h('small', null, 'Configuração inicial'))),
      h('p', { class: 'muted' }, 'Os dados ficam só neste aparelho, criptografados. Cada profissional entra com o próprio PIN de 6 números.'),
      field('Nome do estabelecimento', est),
      field('Seu nome (gestor)', nome),
      h('div', { class: 'row2' }, field('Crie um PIN', pin1), field('Repita o PIN', pin2)),
      h('label', { class: 'chk', for: 'ex' }, ex, h('span', null, 'Incluir equipe, serviços e clientes de exemplo')),
      err, btn,
      h('p', { class: 'muted small' }, 'Guarde o PIN: ele não pode ser recuperado. Se esquecer, outro gestor pode redefinir, ou você restaura um backup.'));
    return { bare: true, body: h('div', { class: 'auth' }, form) };
  });

  route('login', async (params) => {
    const users = await S.listarAcessos();
    const info = await S.infoCofre();
    const wrap = h('div', { class: 'auth' });
    const sel = users.find((u) => u.id === params.id) || (users.length === 1 ? users[0] : null);
    if (!sel) {
      wrap.append(h('div', { class: 'auth-card' },
        h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('agenda', 30)), h('div', null, h('b', null, info?.estNome || 'Studio Agenda'), h('small', null, 'Quem vai entrar?'))),
        h('div', { class: 'who' }, users.map((u) => h('button', { class: 'who-b', onclick: () => go('login', { id: u.id }) }, avatar(u, 64), h('span', null, u.nome)))),
        recovery()));
      return { bare: true, body: wrap };
    }
    let pin = '';
    const dots = h('div', { class: 'dots', 'aria-hidden': 'true' }, [...Array(6)].map(() => h('i')));
    const msg = h('p', { class: 'err', role: 'alert', 'aria-live': 'assertive' });
    const live = h('span', { class: 'sr' });
    const paint = () => { [...dots.children].forEach((d, i) => d.classList.toggle('on', i < pin.length)); live.textContent = `${pin.length} de 6 dígitos`; };
    let busy = false;
    const tryLogin = async () => {
      busy = true; pad.classList.add('busy'); msg.textContent = 'Verificando…';
      try { const prof = await S.entrar(sel.id, pin); msg.textContent = ''; onLogin(prof); }
      catch (e) { msg.textContent = e.message; pin = ''; paint(); dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 400); }
      finally { busy = false; pad.classList.remove('busy'); }
    };
    const press = (d) => { if (busy) return; if (d === 'del') pin = pin.slice(0, -1); else if (pin.length < 6) pin += d; paint(); if (pin.length === 6) tryLogin(); };
    const pad = h('div', { class: 'keypad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((d) => d === ''
      ? h('span')
      : h('button', { type: 'button', 'aria-label': d === 'del' ? 'Apagar dígito' : d, onclick: () => press(d) }, d === 'del' ? icon('back', 24) : d)));
    const onKey = (e) => { if (!document.body.contains(pad)) return document.removeEventListener('keydown', onKey); if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
    document.addEventListener('keydown', onKey);
    if (sel.until > Date.now()) msg.textContent = `Acesso bloqueado por segurança. Tente de novo em ${Math.ceil((sel.until - Date.now()) / 1000)} s.`;
    wrap.append(h('div', { class: 'auth-card pin' },
      users.length > 1 ? h('button', { class: 'link with-ic', onclick: () => go('login') }, icon('left', 18), 'Trocar profissional') : null,
      avatar(sel, 72), h('b', { class: 'big' }, sel.nome), h('small', { class: 'muted' }, 'Digite o seu PIN de 6 números'),
      dots, live, msg, pad, recovery()));
    paint();
    return { bare: true, body: wrap };
  });
}

function recovery() {
  return h('button', { class: 'link muted small', onclick: () => {
    const conf = input({ placeholder: 'Digite APAGAR', maxlength: 10 });
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'inp' });
    const pinB = pinInput({ autocomplete: 'off', 'aria-label': 'PIN usado na época do backup' });
    sheet('Esqueci o PIN', h('div', { class: 'stack' },
      h('p', null, 'Por segurança, o PIN não pode ser recuperado: ele é a chave que abre os dados criptografados.'),
      h('p', null, h('b', null, '1. '), 'Peça a um gestor que entre e redefina o seu PIN em Gestão › Equipe.'),
      h('p', null, h('b', null, '2. '), 'Ou restaure um backup com o PIN de um profissional que existia na época do backup:'),
      file, field('PIN do backup', pinB),
      h('button', { class: 'btn', onclick: async () => {
        if (!file.files[0]) return toast('Escolha o arquivo de backup.');
        try { await S.restaurarBackup(await file.files[0].text(), pinB.value); toast('Backup restaurado. Entre com o PIN.', true); closeSheet(); location.hash = '#/login'; location.reload(); } catch (e) { toast(e.message); }
      } }, 'Restaurar backup'),
      h('hr'),
      h('p', null, h('b', null, '3. '), 'Ou apague tudo deste aparelho e comece do zero. Isso não pode ser desfeito.'),
      conf,
      h('button', { class: 'btn danger', onclick: async () => {
        try { await S.apagarTudo(conf.value); location.hash = '#/setup'; location.reload(); } catch (e) { toast(e.message); }
      } }, 'Apagar todos os dados deste aparelho')));
  } }, 'Esqueci o PIN');
}
