"""Teste ponta a ponta do Studio Agenda no Chrome headless via CDP (sem Playwright).

Uso:  python3 05-testes/e2e_cdp.py            (sobe o servidor e o Chrome sozinho)
Requer: google-chrome (ou CHROME=/caminho) e o pacote python "websockets".
A CSP do app fica ATIVA: nada de bypass. Cada verificação usa assert; qualquer falha encerra com código 1.
"""
import asyncio, base64, json, os, shutil, signal, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

import websockets

AQUI = Path(__file__).resolve().parent
APP = AQUI.parent / '04-pwa'
OUT = AQUI / 'capturas' / 'v1.5.0'
PORTA_APP, PORTA_CDP = 8123, 9333
CHROME = os.environ.get('CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
PIN = '482916'


class Pagina:
    def __init__(self, ws):
        self.ws, self.n, self.pend, self.eventos, self.erros = ws, 0, {}, [], []

    async def ler(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if 'id' in m and m['id'] in self.pend:
                self.pend.pop(m['id']).set_result(m)
            elif m.get('method') == 'Runtime.exceptionThrown':
                self.erros.append(m['params']['exceptionDetails'].get('exception', {}).get('description') or m['params']['exceptionDetails'].get('text'))
            elif m.get('method') == 'Runtime.consoleAPICalled' and m['params']['type'] in ('error', 'warning'):
                self.erros.append(' '.join(str(a.get('value', a.get('description', ''))) for a in m['params']['args']))
            elif m.get('method') == 'Log.entryAdded' and m['params']['entry']['level'] == 'error':
                self.erros.append(m['params']['entry']['text'])

    async def cmd(self, method, **params):
        self.n += 1
        fut = asyncio.get_running_loop().create_future()
        self.pend[self.n] = fut
        await self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params}))
        r = await asyncio.wait_for(fut, 60)
        if 'error' in r:
            raise RuntimeError(f'{method}: {r["error"]}')
        return r.get('result', {})

    async def js(self, expr):
        r = await self.cmd('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(r['exceptionDetails'].get('exception', {}).get('description') or r['exceptionDetails'])
        return r['result'].get('value')

    async def esperar(self, expr, timeout=30):
        fim = time.time() + timeout
        while time.time() < fim:
            try:
                if await self.js(f"!!({expr})"):
                    return
            except RuntimeError:
                pass
            await asyncio.sleep(0.15)
        tela = await self.js("document.body.innerText.slice(0, 400)")
        raise AssertionError(f'tempo esgotado esperando: {expr}\n  tela: {tela!r}\n  erros: {self.erros}')

    async def clicar(self, seletor, texto=None):
        alvo = f"[...document.querySelectorAll({json.dumps(seletor)})].find(e => {json.dumps(texto)} === null || e.textContent.includes({json.dumps(texto)}))"
        ok = await self.js(f"(() => {{ const e = {alvo}; if (!e) return false; e.click(); return true; }})()")
        assert ok, f'não achei para clicar: {seletor} {texto or ""}'

    async def tocar(self, seletor):
        # Clique "de verdade" (evento confiável do navegador): necessário para gestos como pedir a biometria.
        r = await self.js(f"(() => {{ const e = document.querySelector({json.dumps(seletor)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }})()")
        assert r, f'não achei para tocar: {seletor}'
        for t in ('mousePressed', 'mouseReleased'):
            await self.cmd('Input.dispatchMouseEvent', type=t, x=r[0], y=r[1], button='left', clickCount=1)

    async def preencher(self, seletor, valor, i=0):
        ok = await self.js(f"""(() => {{ const e = document.querySelectorAll({json.dumps(seletor)})[{i}]; if (!e) return false;
            e.focus(); e.value = {json.dumps(valor)}; e.dispatchEvent(new Event('input', {{bubbles: true}})); e.dispatchEvent(new Event('change', {{bubbles: true}})); return true; }})()""")
        assert ok, f'campo não encontrado: {seletor}[{i}]'

    async def teclar(self, texto):
        for ch in texto:
            await self.cmd('Input.dispatchKeyEvent', type='keyDown', key=ch, text=ch)
            await self.cmd('Input.dispatchKeyEvent', type='keyUp', key=ch)

    async def foto(self, nome):
        r = await self.cmd('Page.captureScreenshot', format='png')
        (OUT / nome).write_bytes(base64.b64decode(r['data']))


def abrir_aba(url):
    req = urllib.request.Request(f'http://127.0.0.1:{PORTA_CDP}/json/new?{url}', method='PUT')
    return json.loads(urllib.request.urlopen(req).read())


async def conectar(info, largura=390, altura=844):
    ws = await websockets.connect(info['webSocketDebuggerUrl'], max_size=50_000_000)
    p = Pagina(ws)
    asyncio.create_task(p.ler())
    for d in ('Page.enable', 'Runtime.enable', 'Log.enable'):
        await p.cmd(d)
    await p.cmd('Emulation.setDeviceMetricsOverride', width=largura, height=altura, deviceScaleFactor=1, mobile=largura < 600)
    return p


async def principal():
    OUT.mkdir(parents=True, exist_ok=True)
    base = f'http://localhost:{PORTA_APP}/'
    p = await conectar(abrir_aba('about:blank'))
    await p.cmd('Page.navigate', url=base)
    await p.esperar("document.querySelector('form.auth-card')")
    await p.foto('01-setup.png')

    # Configuração inicial (PIN fraco recusado na tela e no caso de uso)
    await p.preencher('form.auth-card input.inp', 'Studio Bella Forma', 0)
    await p.preencher('form.auth-card input.inp', 'Patrícia Souza', 1)
    await p.preencher('form.auth-card input.inp', '123456', 2)
    await p.preencher('form.auth-card input.inp', '123456', 3)
    await p.clicar('button[type=submit]')
    await p.esperar("document.querySelector('.err').textContent.includes('sequências')")
    await p.preencher('form.auth-card input.inp', PIN, 2)
    await p.preencher('form.auth-card input.inp', PIN, 3)
    await p.clicar('button[type=submit]')
    await p.esperar("document.querySelector('.keypad')", 40)

    # PIN errado e certo pelo teclado
    await p.teclar('111111')
    await p.esperar("document.querySelector('.err').textContent.includes('incorreto')", 30)
    await p.teclar(PIN)
    await p.esperar("document.querySelector('.grid')", 40)
    await p.foto('02-agenda.png')

    # Console: importar os módulos não dá acesso à sessão aberta
    exp = await p.js("""(async () => {
      const r = {};
      for (const f of ['main', 'application/app', 'adapters/out/cofre-cifrado', 'application/contexto', 'adapters/in/ui/kit'])
        r[f] = Object.keys(await import('./js/' + f + '.js'));
      return r; })()""")
    assert exp['main'] == [], exp
    assert exp['application/app'] == ['createApp'], exp
    assert exp['adapters/out/cofre-cifrado'] == ['createCofreCifrado'], exp
    novo = await p.js("""(async () => { const db = await import('./js/adapters/out/indexeddb.js');
      const c = (await import('./js/adapters/out/cofre-cifrado.js')).createCofreCifrado({ db });
      return { aberto: c.isUnlocked(), commit: await c.commit([]).then(() => 'gravou', (e) => e.message) }; })()""")
    assert novo == {'aberto': False, 'commit': 'Sessão bloqueada. Entre com seu PIN.'}, novo

    # Agendar, fechar e pagar (CSP ativa)
    await p.js("location.hash = '#/novo?d=' + new Date().toISOString().slice(0, 10)")
    await p.esperar("document.querySelector('.searchbar input')")
    await p.preencher('.searchbar input', 'Ren')
    await p.esperar("document.querySelector('.clirow')")
    await p.clicar('.clirow')
    await p.esperar("document.querySelector('form.stack select')")
    await p.js("""(() => { const s = document.querySelectorAll('form.stack select')[0];
      s.value = [...s.options].find(o => o.textContent.includes('Camila')).value; s.dispatchEvent(new Event('change')); })()""")
    await p.preencher('form.stack input[type=time]', '10:00')
    assert await p.js("!!document.querySelector('.hbtn.fav svg.ic')"), 'favorito deve ser ícone SVG'
    await p.clicar('.hbtn.fav')
    await p.esperar("document.querySelector('.hbtn.fav.on')")
    await p.foto('03-adicionar.png')
    await p.js("document.querySelector('form.stack').requestSubmit()")
    await p.esperar("location.hash.startsWith('#/comanda')")
    await p.esperar("document.querySelector('.circ.tel svg.ic')")
    tel = await p.js("document.querySelector('.circ.tel').getAttribute('href')")
    assert tel == 'tel:+5511900001234', tel
    assert await p.js("!!document.querySelector('.stbtn svg.ic')"), 'seta do status deve ser SVG'
    await p.foto('04-comanda.png')
    # Abre o fechamento, volta e inclui outro item: o fechamento acompanha a comanda
    await p.clicar('.bar.pri', 'Fechamento')
    await p.esperar("location.hash.startsWith('#/fechamento')")
    await p.js("history.back()")
    await p.esperar("location.hash.startsWith('#/comanda')")
    await p.clicar('.fab')
    await p.esperar("document.querySelector('form.stack select')")
    await p.js("""(() => { const s = document.querySelectorAll('form.stack select')[0];
      s.value = [...s.options].find(o => o.textContent.includes('Camila')).value; s.dispatchEvent(new Event('change')); })()""")
    await p.preencher('form.stack input[type=time]', '13:00')
    await p.js("document.querySelector('form.stack').requestSubmit()")
    await p.esperar("location.hash.startsWith('#/comanda') && document.querySelectorAll('.card.item').length === 2")
    await p.clicar('.bar.pri', 'Fechamento')
    await p.esperar("document.querySelectorAll('.fl').length === 2")
    await p.clicar('.bar.pri', 'Pagamento')
    await p.esperar("document.querySelector('.payrow.pix')")
    total = await p.js("document.querySelector('.paytot b').textContent")
    assert total == '280,00', total

    # Pagamento parcial: R$ 100 no Pix e o resto pendente na conta do cliente
    await p.preencher('.payrow.pix input', '100')
    await p.esperar("document.querySelector('.foot .bar:not(.pri)').textContent.includes('180,00 pendente')")
    await p.clicar('.foot .bar:not(.pri)')
    await p.esperar("document.querySelector('.sheet-root')")
    await p.preencher('.sheet-root input', '0,00')
    await p.clicar('.sheet-root .btn.pri', 'Abrir')
    await p.esperar("document.querySelector('.okbar')", 20)
    ok = await p.js("document.querySelector('.okbar').textContent")
    assert 'Pendente' in ok and '180,00' in ok, ok
    await p.foto('05-pago.png')

    # Caixa: "1.500" é mil e quinhentos reais
    await p.js("location.hash = '#/caixa'"); await p.esperar("document.querySelector('.fab')")
    await p.clicar('.fab'); await p.esperar("document.querySelector('.sheet-root')")
    await p.js("(() => { const s = document.querySelector('.sheet-root select'); s.value = 'entrada'; s.dispatchEvent(new Event('change')); })()")
    await p.preencher('.sheet-root input.inp', '1.500', 0)
    await p.clicar('.sheet-root .btn.pri', 'Lançar')
    await p.esperar("!document.querySelector('.sheet-root')")
    saldo = await p.js("document.querySelector('.ok-t').textContent")
    assert '1.600,00' in saldo, saldo  # 100 do Pix + 1.500 de entrada
    gaveta = await p.js("document.querySelector('.kv.gaveta b').textContent")
    assert '1.500,00' in gaveta, gaveta
    await p.foto('09-caixa.png')

    # Todas as telas abrem para o administrador, sem erro
    await p.js("location.hash = '#/clientes'"); await p.esperar("document.querySelector('.clirow')")
    await p.clicar('.clirow', 'Renata'); await p.esperar("location.hash.startsWith('#/cliente?')")
    cli_hash = await p.js("location.hash")
    rotas = [cli_hash, cli_hash + '&t=conta', cli_hash + '&t=agend', cli_hash + '&t=fech', '#/equipe', '#/profissional', '#/profissional?t=pend',
             '#/estabelecimento', '#/horario', '#/preferencias', '#/servicos', '#/profissionais', '#/meupin', '#/auditoria', '#/financeiro', '#/comandas']
    for rota in rotas:
        await p.js(f"location.hash = {json.dumps(rota)}")
        await asyncio.sleep(0.4)
        bloqueio = await p.js("[...document.querySelectorAll('.empty b')].map(e => e.textContent).join(' | ')")
        assert 'Sem acesso' not in bloqueio and 'Algo deu errado' not in bloqueio, (rota, bloqueio)
    await p.js("location.hash = '#/profissionais'"); await p.esperar("document.querySelector('.prow')")
    await p.clicar('.prow', 'Camila'); await p.esperar("document.querySelector('.sheet-root')")
    await p.clicar('.sheet-root .btn.block', 'Permissões'); await p.esperar("location.hash.startsWith('#/permissoes')")
    await p.esperar("document.querySelectorAll('fieldset.pg').length > 5")
    await p.foto('08-permissoes.png')
    assert not p.erros, p.erros

    # Nenhum caractere usado como ícone na interface
    for rota in ['#/agenda', '#/comanda', '#/clientes', '#/gestao']:
        await p.js(f"location.hash = '{rota}'")
        await asyncio.sleep(0.4)
    glifos = await p.js("(() => { const t = document.body.innerText; return ['♥','☎','▾','‹','✏','🗑'].filter(g => t.includes(g)); })()")
    assert glifos == [], glifos

    # Segurança: tela com troca de chave e restauração pedindo PIN
    await p.js("location.hash = '#/seguranca'")
    await p.esperar("document.body.innerText.includes('Trocar a chave dos dados')")
    assert await p.js("document.querySelectorAll('input[type=password]').length") >= 2
    await p.foto('06-seguranca.png')

    # Biometria (WebAuthn com PRF) com o autenticador virtual do Chrome
    await p.cmd('WebAuthn.enable', enableUI=False)
    aut = (await p.cmd('WebAuthn.addVirtualAuthenticator', options={'protocol': 'ctap2', 'ctap2Version': 'ctap2_1', 'transport': 'internal',
        'hasResidentKey': True, 'hasUserVerification': True, 'isUserVerified': True, 'automaticPresenceSimulation': True, 'hasPrf': True}))['authenticatorId']
    await p.js("location.hash = '#/meupin'")
    await p.esperar("document.body.innerText.includes('Ativar a biometria')")
    await p.preencher('input[aria-label="Seu PIN para ativar a biometria"]', '111111')
    await p.clicar('button', 'Ativar a biometria')
    await p.esperar("document.querySelector('.toast') && document.querySelector('.toast').textContent.includes('PIN incorreto')", 30)
    await p.preencher('input[aria-label="Seu PIN para ativar a biometria"]', PIN)
    await p.clicar('button', 'Ativar a biometria')
    await p.esperar("document.body.innerText.includes('Ativada neste aparelho')", 40)
    await p.foto('10-biometria-ativa.png')
    # Bloqueia e entra de novo pela biometria (o pedido abre sozinho na tela do PIN)
    await p.js("document.querySelector('.nav-i.lock').click()")
    await p.esperar("document.querySelector('.who-b, .keypad')", 40)
    if await p.js("!!document.querySelector('.who-b')"):
        await p.clicar('.who-b', 'Patrícia')
    await p.esperar("document.querySelector('.grid')", 40)
    print('biometria: entrou sem PIN')

    # Sem rolagem horizontal no celular
    for rota in ['#/agenda', '#/comandas', '#/clientes', '#/gestao', '#/seguranca', '#/caixa', '#/relatorios']:
        await p.js(f"location.hash = '{rota}'")
        await asyncio.sleep(0.35)
        larg = await p.js("[document.documentElement.scrollWidth, innerWidth]")
        assert larg[0] <= larg[1], (rota, larg)

    # Layout por tamanho de tela: tablet em pé com menu fixo; notebook com lista ao lado da ficha e duas colunas
    await p.cmd('Emulation.setDeviceMetricsOverride', width=768, height=1024, deviceScaleFactor=1, mobile=True)
    await p.js("location.hash = '#/agenda'"); await asyncio.sleep(.4)
    assert await p.js("getComputedStyle(document.querySelector('.side')).display !== 'none'"), 'tablet em pé deveria ter menu fixo'
    await p.cmd('Emulation.setDeviceMetricsOverride', width=1366, height=768, deviceScaleFactor=1, mobile=False)
    await p.js("location.hash = '#/clientes'"); await p.esperar("document.querySelector('.split .mestre .clirow')")
    await p.clicar('.split .clirow', 'Renata'); await p.esperar("document.querySelector('.split .detalhe .tabs') && document.querySelector('.clirow.on')")
    await p.js("location.hash = '#/relatorios'"); await asyncio.sleep(.4)
    cols = await p.js("getComputedStyle(document.querySelector('.duo')).gridTemplateColumns.split(' ').length")
    assert cols == 2, cols
    await p.cmd('Emulation.setDeviceMetricsOverride', width=390, height=844, deviceScaleFactor=1, mobile=True)

    # Segunda aba: fica travada (instância única)
    p2 = await conectar(abrir_aba(base))
    await p2.esperar("document.body.innerText.includes('já está aberto em outra aba')", 20)
    await p2.foto('07-outra-aba.png')

    erros = [e for e in p.erros + p2.erros if e and 'favicon' not in e]
    assert not erros, erros
    print('E2E OK: setup, PIN, agenda, comanda, pagamento, ícones SVG, console sem acesso, segurança, biometria, layout tablet/notebook, aba única, sem rolagem horizontal')


def main():
    assert CHROME, 'Chrome não encontrado (defina CHROME=/caminho)'
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORTA_APP), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    perfil = tempfile.mkdtemp(prefix='sa-e2e-')
    chrome = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORTA_CDP}', f'--user-data-dir={perfil}', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORTA_CDP}/json/version'); urllib.request.urlopen(f'http://127.0.0.1:{PORTA_APP}/'); break
            except Exception:
                time.sleep(0.1)
        asyncio.run(principal())
    except AssertionError as e:
        print('FALHOU:', e); sys.exit(1)
    finally:
        # O google-chrome é um script que abre outros processos: encerra o grupo inteiro.
        try: os.killpg(chrome.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        srv.terminate(); srv.wait(5)
        shutil.rmtree(perfil, ignore_errors=True)


if __name__ == '__main__':
    main()
