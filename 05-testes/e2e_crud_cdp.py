"""E2E de CRUD do Studio Agenda pelo frontend (cliques e formulários reais, via CDP, sem Playwright).

Cobre: 1) Serviços  2) Profissionais  3) Clientes  4) Agendamentos (criar, remarcar, cancelar/concluir,
conflitos, vínculos com serviço/profissional/cliente, persistência após recarregar).

Uso:   python3 05-testes/e2e_crud_cdp.py
Env:   CHROME=/caminho  SA_PORTA_APP=8790  SA_PORTA_CDP=9633  (nunca use 9333/9533/8765: são de outras sessões)
Requer: Brave/Chromium/Chrome e o pacote python "websockets".

Diferente do e2e_cdp.py, aqui NENHUMA verificação interrompe o teste: cada uma vira PASS/FAIL e o resumo sai no fim.
Tipos: BUG = o código não cumpre o esperado; REGRA = a regra de negócio é omissa/ambígua (decisão do Celso).
Um check REGRA que "falha" só documenta o comportamento atual e NÃO faz o processo sair com erro.
Código de saída 1 se houver FAIL do tipo BUG.
"""
import asyncio, datetime, json, os, shutil, signal, subprocess, sys, tempfile, time, traceback, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import websockets  # noqa: E402
from e2e_cdp import Pagina  # noqa: E402  (o main() de lá só roda como script)

AQUI = Path(__file__).resolve().parent
APP = AQUI.parent / '04-pwa'
OUT = AQUI / 'capturas' / 'crud'
PORTA_APP = int(os.environ.get('SA_PORTA_APP', 8790))
PORTA_CDP = int(os.environ.get('SA_PORTA_CDP', 9633))
assert PORTA_CDP not in (9333, 9533) and PORTA_APP != 8765, 'portas reservadas a outras sessões'
CHROME = os.environ.get('CHROME') or shutil.which('brave-browser') or shutil.which('chromium') or shutil.which('google-chrome')
PIN = '482916'
nb = lambda s: (s or '').replace(' ', ' ')

RES = []  # (id, tipo, ok, titulo, obtido)


def chk(cid, titulo, ok, obtido='', tipo='BUG'):
    RES.append((cid, tipo, bool(ok), titulo, str(obtido)))
    print(f"  [{'PASS' if ok else 'FAIL'}] {cid} {titulo}" + ('' if ok else f'  -> {obtido}'), flush=True)


# ---------------------------------------------------------------- infraestrutura
def abrir_aba(url):
    req = urllib.request.Request(f'http://127.0.0.1:{PORTA_CDP}/json/new?{url}', method='PUT')
    return json.loads(urllib.request.urlopen(req).read())


async def conectar(info, largura=1366, altura=900):
    ws = await websockets.connect(info['webSocketDebuggerUrl'], max_size=50_000_000)
    p = Pagina(ws)
    asyncio.create_task(p.ler())
    for d in ('Page.enable', 'Runtime.enable', 'Log.enable'):
        await p.cmd(d)
    await p.cmd('Emulation.setDeviceMetricsOverride', width=largura, height=altura, deviceScaleFactor=1, mobile=False)
    return p


async def ir(p, destino, espera=0.5):
    await p.js(f"location.hash = {json.dumps(destino)}")
    await asyncio.sleep(espera)


async def toast_limpar(p):
    await p.js("document.querySelector('.toast')?.remove()")


def toast_ok(t):
    return any(k in t for k in ('salvo', 'Adicionado', 'atualizado'))


async def toast_ler(p, t=4.0):
    fim = time.time() + t
    while time.time() < fim:
        v = await p.js("document.querySelector('.toast')?.textContent || ''")
        if v:
            return nb(v)
        await asyncio.sleep(0.1)
    return ''


async def textos(p, sel):
    return [nb(x) for x in await p.js(f"[...document.querySelectorAll({json.dumps(sel)})].map(e => e.innerText || e.textContent)")]


async def entrar(p):
    for _ in range(4):
        await p.esperar("document.querySelector('.keypad') || document.querySelector('.who-b') || document.body.innerText.includes('outra aba')", 40)
        if await p.js("document.body.innerText.includes('outra aba')"):
            await asyncio.sleep(1); await p.cmd('Page.reload'); continue
        break
    if await p.js("!!document.querySelector('.who-b')"):
        await p.clicar('.who-b', 'Patrícia')
    await p.esperar("document.querySelector('.keypad')", 40)
    await p.teclar(PIN)
    await p.esperar("document.querySelector('.shell')", 40)
    await asyncio.sleep(0.4)


async def recarregar(p):
    await p.cmd('Page.reload')
    await entrar(p)


async def setup(p, base):
    await p.cmd('Page.navigate', url=base)
    await p.esperar("document.querySelector('form.auth-card')")
    await p.preencher('form.auth-card input.inp', 'Studio QA CRUD', 0)
    await p.preencher('form.auth-card input.inp', 'Patrícia Souza', 1)
    await p.preencher('form.auth-card input.inp', PIN, 2)
    await p.preencher('form.auth-card input.inp', PIN, 3)
    await p.js("(() => { const c = document.querySelector('#ex'); if (c && !c.checked) c.click(); })()")
    await p.clicar('button[type=submit]')
    await p.esperar("document.querySelector('.keypad')", 60)
    await p.teclar(PIN)
    await p.esperar("document.querySelector('.shell')", 60)


async def selecionar(p, escopo, idx, texto):
    ok = await p.js(f"""(() => {{ const s = document.querySelectorAll({json.dumps(escopo + ' select')})[{idx}]; if (!s) return false;
      const o = [...s.options].find(o => o.textContent.replace(/\u00a0/g, ' ').includes({json.dumps(texto)})); if (!o) return false;
      s.value = o.value; s.dispatchEvent(new Event('change', {{bubbles: true}})); s.dispatchEvent(new Event('input', {{bubbles: true}})); return true; }})()""")
    assert ok, f'opção não encontrada: {texto} em {escopo} select[{idx}]; opções: {await opcoes(p, escopo, idx)}'


async def opcoes(p, escopo, idx):
    return [nb(x) for x in await p.js(f"[...(document.querySelectorAll({json.dumps(escopo + ' select')})[{idx}]?.options || [])].map(o => o.textContent)")]


async def salvar_sheet(p):
    """Clica Salvar na folha. Retorna (fechou, toast)."""
    await toast_limpar(p)
    await p.clicar('.sheet-root .sheet-f .btn.pri')
    fim = time.time() + 5
    while time.time() < fim:
        aberta = await p.js("!!document.querySelector('.sheet-root')")
        t = nb(await p.js("document.querySelector('.toast')?.textContent || ''"))
        if not aberta:
            await asyncio.sleep(0.3)
            return True, nb(await p.js("document.querySelector('.toast')?.textContent || ''")) or t
        if t and 'salvo' not in t.lower():
            return False, t
        await asyncio.sleep(0.12)
    return not await p.js("!!document.querySelector('.sheet-root')"), ''


async def fechar_sheet(p):
    await p.js("document.querySelectorAll('.sheet-root').forEach(n => n.remove())")


async def dois_toques(p, escopo, texto):
    """Botão de confirmação em dois toques. Devolve o rótulo depois do 1º toque (e faz o 2º)."""
    ok = await p.js(f"""(() => {{ const b = [...document.querySelectorAll({json.dumps(escopo)})].find(e => e.textContent.includes({json.dumps(texto)})); if (!b) return false; window.__b = b; b.click(); return true; }})()""")
    assert ok, f'botão não encontrado: {escopo} {texto}'
    await asyncio.sleep(0.2)
    rot = nb(await p.js("window.__b.textContent"))
    await p.js("window.__b.click()")
    await asyncio.sleep(0.8)
    return rot


# ---------------------------------------------------------------- serviços
async def srv_abrir_novo(p):
    await ir(p, '#/servicos')
    await p.esperar("document.querySelector('.fab')")
    await p.clicar('.fab')
    await p.esperar("document.querySelector('.sheet-root input.inp')")


async def srv_form(p, nome=None, cat=None, dur=None, preco=None):
    for i, v in enumerate((nome, cat, dur, preco)):
        if v is not None:
            await p.preencher('.sheet-root input.inp', str(v), i)


async def srv_criar(p, nome, cat='Teste QA', dur=30, preco='10,00'):
    await srv_abrir_novo(p)
    await srv_form(p, nome, cat, dur, preco)
    return await salvar_sheet(p)


async def srv_linha(p, nome):
    for t in await textos(p, '.srow'):
        if t.startswith(nome):
            return t.replace('\n', ' | ')
    return None


async def srv_abrir_edicao(p, nome):
    await ir(p, '#/servicos')
    await p.esperar("document.querySelector('.srow')")
    await p.clicar('.srow', nome)
    await p.esperar("document.querySelector('.sheet-root input.inp')")


async def secao_servicos(p):
    print('\n== 1) SERVIÇOS', flush=True)
    await ir(p, '#/servicos'); await p.esperar("document.querySelector('.srow')")
    chk('SRV-01', 'lista inicial mostra os 8 serviços de exemplo', len(await textos(p, '.srow')) == 8, len(await textos(p, '.srow')))

    # criar válido + persistência
    fechou, t = await srv_criar(p, 'QA Limpeza de pele', 'QA Facial', 45, '1.500,50')
    chk('SRV-02', 'cria serviço válido (45 min, "1.500,50")', fechou, t)
    ln = await srv_linha(p, 'QA Limpeza de pele')
    chk('SRV-03', 'lista mostra preço R$ 1.500,50 e 45 min', ln and 'R$ 1.500,50' in ln and '45 min' in ln, ln)
    await recarregar(p); await ir(p, '#/servicos'); await p.esperar("document.querySelector('.srow')")
    ln = await srv_linha(p, 'QA Limpeza de pele')
    chk('SRV-04', 'serviço persiste após recarregar (IndexedDB)', ln and 'R$ 1.500,50' in ln, ln)

    # formatos de dinheiro
    casos = [('1.500', 'R$ 1.500,00'), ('1500', 'R$ 1.500,00'), ('1500,5', 'R$ 1.500,50'), ('12.5', 'R$ 12,50'), ('R$ 80,00', 'R$ 80,00'), ('0,99', 'R$ 0,99'), ('1.234.567,89', 'R$ 1.234.567,89')]
    for i, (entrada, esperado) in enumerate(casos):
        nome = f'QA Preco {i}'
        fechou, t = await srv_criar(p, nome, 'QA Preco', 30, entrada)
        ln = await srv_linha(p, nome) if fechou else None
        chk(f'SRV-05.{i}', f'preço digitado "{entrada}" vira {esperado}', ln and esperado in ln, ln or t)
    # inválidos
    for ent, rot in [('-10', 'negativo'), ('1,5,5', 'vírgulas repetidas')]:
        fechou, t = await srv_criar(p, 'QA Preco inv', 'QA Preco', 30, ent)
        chk(f'SRV-06.{rot}', f'preço {rot} ("{ent}") é recusado com aviso', (not fechou) and 'Preço inválido' in t, f'fechou={fechou} toast={t!r}')
        await fechar_sheet(p)
    fechou, t = await srv_criar(p, 'QA Preco abc', 'QA Preco', 30, 'abc')
    chk('SRV-06.texto', 'preço com texto ("abc") é recusado, não grava R$ 0,00 em silêncio', not fechou, f'gravou: {await srv_linha(p, "QA Preco abc")}')
    await fechar_sheet(p)
    fechou, t = await srv_criar(p, 'QA Preco vazio', 'QA Preco', 30, '')
    chk('SRV-06.vazio', 'preço vazio é recusado com "Informe o preço" (R1, decidido pelo Celso em 18/11/2026)', (not fechou) and 'Informe o preço' in t, f'fechou={fechou} toast={t!r} linha={await srv_linha(p, "QA Preco vazio")}')
    await fechar_sheet(p)

    # obrigatórios
    fechou, t = await srv_criar(p, '', 'QA', 30, '10,00')
    chk('SRV-07', 'nome vazio é recusado ("Informe o nome")', (not fechou) and 'nome' in t.lower(), f'{fechou} {t!r}'); await fechar_sheet(p)
    fechou, t = await srv_criar(p, '    ', 'QA', 30, '10,00')
    chk('SRV-08', 'nome só com espaços é recusado', not fechou, t); await fechar_sheet(p)
    fechou, t = await srv_criar(p, 'x' * 120, 'QA', 30, '10,00')
    ln = await srv_linha(p, 'x' * 80) if fechou else None
    chk('SRV-09', 'nome com 120 caracteres é limitado a 80', fechou and ln and 'x' * 81 not in ln, ln or t); await fechar_sheet(p)

    # duração
    for d, ok_esp, rot in [(0, False, '0'), (7, False, '7 (não múltiplo de 5)'), (725, False, '725 (acima de 720)'), (12.5, False, '12,5'), (-30, False, 'negativa'), (5, True, '5'), (720, True, '720')]:
        fechou, t = await srv_criar(p, f'QA Dur {d}', 'QA Duracao', d, '10,00')
        chk(f'SRV-10.{rot}', f'duração {rot} {"aceita" if ok_esp else "recusada"}', fechou == ok_esp, f'fechou={fechou} toast={t!r}')
        await fechar_sheet(p)
    ln = await srv_linha(p, 'QA Dur 720')
    chk('SRV-10.fmt', 'duração 720 min aparece como "12h"', ln and '12h' in ln, ln)

    # duplicado
    fechou, t = await srv_criar(p, 'Mão', 'Unhas', 30, '40,00')
    n = len([x for x in await textos(p, '.srow') if x.startswith('Mão\n') or x.startswith('Mão ')]) if fechou else 0
    chk('SRV-11', 'serviço com mesmo nome e categoria de um existente ("Mão"/Unhas): aceita ou recusa? (regra omissa)', not fechou, f'aceitou duplicado, {n} linhas "Mão"', 'REGRA')
    await fechar_sheet(p)

    # editar
    await srv_abrir_edicao(p, 'QA Limpeza de pele')
    await srv_form(p, 'QA Limpeza premium', 'QA Facial 2', 60, '99,90')
    fechou, t = await salvar_sheet(p)
    chk('SRV-12', 'edita nome, categoria, duração e preço', fechou, t)
    await recarregar(p); await ir(p, '#/servicos'); await p.esperar("document.querySelector('.srow')")
    ln = await srv_linha(p, 'QA Limpeza premium')
    chk('SRV-13', 'edição persiste após recarregar', ln and 'R$ 99,90' in ln and '1h' in ln, ln)
    ant = await srv_linha(p, 'QA Limpeza de pele')
    chk('SRV-14', 'nome antigo não fica duplicado após editar', ant is None, ant)
    cats = await textos(p, '.gtitle')
    chk('SRV-15', 'serviço migra para a nova categoria', 'QA Facial 2' in cats, cats)

    # inativar / reativar
    await srv_abrir_edicao(p, 'QA Limpeza premium')
    await p.js("document.querySelector('#sat').click()")
    fechou, t = await salvar_sheet(p)
    ln = await srv_linha(p, 'QA Limpeza premium')
    chk('SRV-16', 'inativar serviço: lista marca "inativo"', fechou and ln and 'inativo' in ln, ln or t)
    await ir(p, '#/novo'); await p.esperar("document.querySelector('.searchbar input')")
    await p.preencher('.searchbar input', 'Ren'); await p.esperar("document.querySelector('.clirow')"); await p.clicar('.clirow', 'Renata')
    await p.esperar("document.querySelector('form.stack select')")
    await selecionar(p, 'form.stack', 0, 'Camila')
    await p.js("document.querySelector('#sdp').click()")  # mostra serviços de todos
    await asyncio.sleep(0.3)
    ops = await opcoes(p, 'form.stack', 1)
    chk('SRV-17', 'serviço inativo não é oferecido para novo agendamento', not any('QA Limpeza premium' in o for o in ops), ops)
    await srv_abrir_edicao(p, 'QA Limpeza premium')
    await p.js("document.querySelector('#sat').click()")
    await salvar_sheet(p)
    ln = await srv_linha(p, 'QA Limpeza premium')
    chk('SRV-18', 'reativar serviço funciona', ln and 'inativo' not in ln, ln)

    # remover
    await srv_abrir_edicao(p, 'QA Dur 5')
    botoes = [nb(x) for x in await p.js("[...document.querySelectorAll('.sheet-root button')].map(b => b.textContent.trim())")]
    chk('SRV-19', 'existe ação de excluir serviço sem uso (RN-47 só proíbe se usado em agendamento)? hoje só há inativar', any('xclu' in b or 'emov' in b for b in botoes), botoes, 'REGRA')
    await fechar_sheet(p)

    # quem executa
    await srv_abrir_edicao(p, 'QA Dur 5')
    chips = await textos(p, '.sheet-root .chip')
    chk('SRV-20', 'sheet lista os profissionais que atendem como opções de "quem executa"', len(chips) >= 3, chips)
    await p.clicar('.sheet-root .chip', 'Bianca')
    fechou, t = await salvar_sheet(p)
    await srv_abrir_edicao(p, 'QA Dur 5')
    marcados = await p.js("[...document.querySelectorAll('.sheet-root .chip')].filter(c => c.querySelector('input').checked).map(c => c.textContent)")
    chk('SRV-21', 'profissional marcado em "executa" persiste', marcados == ['Bianca Lopes'], marcados)
    await fechar_sheet(p)


# ---------------------------------------------------------------- profissionais
async def prof_abrir_novo(p):
    await ir(p, '#/profissionais')
    await p.esperar("document.querySelector('.fab')")
    await p.clicar('.fab')
    await p.esperar("document.querySelector('.sheet-root input.inp')")


async def prof_form(p, nome=None, sigla=None, com=None, pin=None):
    for i, v in enumerate((nome, sigla, com, pin)):
        if v is not None:
            await p.preencher('.sheet-root input.inp', str(v), i)


async def prof_criar(p, nome, sigla='', com=40, pin=''):
    await prof_abrir_novo(p)
    await prof_form(p, nome, sigla, com, pin)
    return await salvar_sheet(p)


async def prof_linha(p, nome):
    for t in await textos(p, '.prow'):
        if t.startswith(nome) or f'\n{nome}' in t:
            return t.replace('\n', ' | ')
    return None


async def prof_abrir_edicao(p, nome):
    await ir(p, '#/profissionais')
    await p.esperar("document.querySelector('.prow')")
    await p.clicar('.prow', nome)
    await p.esperar("document.querySelector('.sheet-root input.inp')")


async def secao_profissionais(p):
    print('\n== 2) PROFISSIONAIS', flush=True)
    await ir(p, '#/profissionais'); await p.esperar("document.querySelector('.prow')")
    chk('PRO-01', 'lista inicial mostra os 4 profissionais de exemplo', len(await textos(p, '.prow')) == 4, len(await textos(p, '.prow')))

    fechou, t = await prof_criar(p, 'QA Teresa Prado', '', 35.5, '')
    ln = await prof_linha(p, 'QA Teresa Prado')
    chk('PRO-02', 'cria profissional (comissão 35,5) e aparece na lista', fechou and ln and 'comissão 35.5%' in ln, ln or t)
    chk('PRO-03', 'sigla automática = iniciais do nome ("QT")', ln and 'QT' in ln, ln)
    await recarregar(p); await ir(p, '#/profissionais'); await p.esperar("document.querySelector('.prow')")
    ln = await prof_linha(p, 'QA Teresa Prado')
    chk('PRO-04', 'profissional persiste após recarregar', ln and 'Sem acesso' in ln, ln)

    n0 = len(await textos(p, '.prow'))
    fechou, t = await prof_criar(p, '', '', 40, '')
    chk('PRO-05', 'nome vazio é recusado', (not fechou) and 'nome' in t.lower(), f'{fechou} {t!r}'); await fechar_sheet(p)
    for com, ok_esp in [(101, False), (-1, False), (100, True), (0, True)]:
        fechou, t = await prof_criar(p, f'QA Com {com}', '', com, '')
        chk(f'PRO-06.{com}', f'comissão {com}% {"aceita" if ok_esp else "recusada"}', fechou == ok_esp, f'fechou={fechou} {t!r}')
        await fechar_sheet(p)
    fechou, t = await prof_criar(p, 'QA Sigla', 'abcde', 40, '')
    ln = await prof_linha(p, 'QA Sigla')
    chk('PRO-07', 'sigla "abcde" vira "ABC" (3 letras, maiúscula)', ln and 'ABC' in ln and 'ABCD' not in ln, ln or t)

    # duplicado
    fechou, t = await prof_criar(p, 'Camila Rocha', '', 40, '')
    chk('PRO-08', 'profissional com nome igual a um existente ("Camila Rocha"): aceita? (regra omissa)', not fechou, 'aceitou nome duplicado', 'REGRA')
    await fechar_sheet(p)
    if fechou:  # renomeia a duplicata para não confundir os demais testes
        await ir(p, '#/profissionais'); await p.esperar("document.querySelector('.prow')")
        await p.js("[...document.querySelectorAll('.prow')].find(e => e.innerText.includes('Camila Rocha') && e.innerText.includes('Outros')).click()")
        await p.esperar("document.querySelector('.sheet-root input.inp')")
        await prof_form(p, 'QA Camila Duplicada'); await salvar_sheet(p)

    # PIN
    n1 = len(await textos(p, '.prow'))
    fechou, t = await prof_criar(p, 'QA PinFraco', '', 40, '123456')
    await toast_ler(p, 0.1)
    await ir(p, '#/profissionais'); await p.esperar("document.querySelector('.prow')")
    n2 = len(await textos(p, '.prow'))
    chk('PRO-09', 'PIN fraco (123456) é recusado e NÃO cria o profissional pela metade', (not fechou) and n2 == n1, f'fechou={fechou} toast={t!r} linhas {n1}->{n2}')
    await fechar_sheet(p)
    n1 = n2
    fechou, t = await prof_criar(p, 'QA Pin Curto', '', 40, '12345')
    await ir(p, '#/profissionais'); await p.esperar("document.querySelector('.prow')")
    n2 = len(await textos(p, '.prow'))
    chk('PRO-10', 'PIN de 5 dígitos é recusado e não cria o profissional', (not fechou) and n2 == n1, f'fechou={fechou} toast={t!r} linhas {n1}->{n2}')
    await fechar_sheet(p)
    fechou, t = await prof_criar(p, 'QA Com Pin', '', 40, '735291')
    ln = await prof_linha(p, 'QA Com Pin')
    chk('PRO-11', 'cria profissional com PIN válido -> "Com PIN"', fechou and ln and 'Com PIN' in ln, ln or t)

    # editar
    await prof_abrir_edicao(p, 'QA Teresa Prado')
    await prof_form(p, 'QA Teresa Editada', None, 50)
    await selecionar(p, '.sheet-root', 0, 'Cabelos')
    fechou, t = await salvar_sheet(p)
    await recarregar(p); await ir(p, '#/profissionais'); await p.esperar("document.querySelector('.prow')")
    ln = await prof_linha(p, 'QA Teresa Editada')
    chk('PRO-12', 'edita nome, área e comissão e persiste após recarregar', fechou and ln and 'Cabelos' in ln and 'comissão 50%' in ln, ln or t)
    chk('PRO-13', 'nome antigo não permanece', await prof_linha(p, 'QA Teresa Prado') is None, await prof_linha(p, 'QA Teresa Prado'))

    # remover acesso
    await prof_abrir_edicao(p, 'QA Com Pin')
    rot = await dois_toques(p, '.sheet-root button', 'Remover acesso por PIN')
    chk('PRO-14', '"Remover acesso por PIN" pede confirmação (2 toques)', 'confirmar' in rot.lower(), rot)
    await asyncio.sleep(0.6)
    await ir(p, '#/profissionais'); await p.esperar("document.querySelector('.prow')")
    ln = await prof_linha(p, 'QA Com Pin')
    chk('PRO-15', 'acesso removido: lista mostra "Sem acesso"', ln and 'Sem acesso' in ln, ln)

    # inativar a si mesmo
    await prof_abrir_edicao(p, 'Patrícia')
    await p.js("document.querySelector('#pav').click()")
    fechou, t = await salvar_sheet(p)
    chk('PRO-16', 'não permite inativar a si mesmo', (not fechou) and 'si mesmo' in t, f'{fechou} {t!r}'); await fechar_sheet(p)

    # inativar profissional sem agendamento
    await prof_abrir_edicao(p, 'QA Com Pin')
    await p.js("document.querySelector('#pav').click()")
    fechou, t = await salvar_sheet(p)
    ln = await prof_linha(p, 'QA Com Pin')
    chk('PRO-17', 'inativa profissional sem agendamentos', fechou and ln and 'inativo' in ln, ln or t)

    # excluir
    await prof_abrir_edicao(p, 'QA Sigla')
    botoes = [nb(x) for x in await p.js("[...document.querySelectorAll('.sheet-root button')].map(b => b.textContent.trim())")]
    chk('PRO-18', 'existe ação de excluir profissional sem uso (RN-47)? hoje só há inativar', any('xclu' in b for b in botoes), botoes, 'REGRA')
    await fechar_sheet(p)


# ---------------------------------------------------------------- clientes
async def cli_abrir_novo(p):
    await ir(p, '#/clientes')
    await p.esperar("document.querySelector('.fab')")
    await p.clicar('.fab')
    await p.esperar("document.querySelector('.sheet-root input.inp')")


async def cli_form(p, nome=None, cel=None, email=None, obs=None):
    for i, v in enumerate((nome, cel, email)):
        if v is not None:
            await p.preencher('.sheet-root input.inp', v, i)
    if obs is not None:
        await p.preencher('.sheet-root textarea', obs, 0)


async def cli_criar(p, nome, cel='', email='', obs=''):
    await cli_abrir_novo(p)
    await cli_form(p, nome, cel, email, obs)
    await toast_limpar(p)
    await p.clicar('.sheet-root .sheet-f .btn.pri')
    fim = time.time() + 5
    while time.time() < fim:
        h = await p.js("location.hash")
        if h.startswith('#/cliente?'):
            await asyncio.sleep(0.4)
            return True, h
        t = nb(await p.js("document.querySelector('.toast')?.textContent || ''"))
        if t and not toast_ok(t):
            return False, t
        await asyncio.sleep(0.12)
    return False, ''


async def cli_lista(p, q=''):
    await ir(p, '#/clientes' + (f'?q={q}' if q else ''))
    await p.esperar("document.querySelector('.searchbar')")
    return [t.replace('\n', ' | ') for t in await textos(p, '.clirow')]


async def secao_clientes(p):
    print('\n== 3) CLIENTES', flush=True)
    ls = await cli_lista(p)
    chk('CLI-01', 'lista inicial mostra os 3 clientes de exemplo', len(ls) == 3, ls)

    ok, h = await cli_criar(p, 'QA Cliente Um', '(11) 98888-7777', 'um@exemplo.com', 'alérgica a látex')
    chk('CLI-02', 'cria cliente válido e abre a ficha', ok, h)
    corpo = nb(await p.js("document.body.innerText"))
    chk('CLI-03', 'ficha mostra celular formatado, e-mail e observação', '(11) 98888-7777' in corpo and 'um@exemplo.com' in corpo and 'alérgica a látex' in corpo, corpo[:300])
    await recarregar(p)
    ls = await cli_lista(p)
    chk('CLI-04', 'cliente persiste após recarregar e aparece na lista', any('QA Cliente Um' in x and '(11) 98888-7777' in x for x in ls), ls)

    # obrigatórios e formato
    ok, t = await cli_criar(p, '', '(11) 97777-6666')
    chk('CLI-05', 'nome vazio é recusado', (not ok) and 'nome' in t.lower(), f'{ok} {t!r}'); await fechar_sheet(p)
    ok, t = await cli_criar(p, 'QA Cel Curto', '123')
    chk('CLI-06', 'celular inválido ("123") é recusado', (not ok) and 'Celular inválido' in t, f'{ok} {t!r}'); await fechar_sheet(p)
    ok, t = await cli_criar(p, 'QA Cel Letras', 'abcdefghijk')
    chk('CLI-07', 'celular só com letras ("abcdefghijk") é recusado', not ok, f'{ok} {t!r}'); await fechar_sheet(p)

    # duplicados
    ok, t = await cli_criar(p, 'QA Dup Mesmo', '(11) 98888-7777')
    chk('CLI-08', 'celular idêntico ao de outro cliente é recusado', (not ok) and 'Já existe' in t, f'{ok} {t!r}'); await fechar_sheet(p)
    ok, t = await cli_criar(p, 'QA Dup DDI', '+55 11 98888-7777')
    chk('CLI-09', 'RN-13: mesmo celular com DDI 55 ("+55 11 98888-7777") é reconhecido como duplicado', not ok, f'criou outro cliente com o mesmo número: {t}')
    await fechar_sheet(p)
    ok, t = await cli_criar(p, 'QA Sem Celular A', '')
    ok2, t2 = await cli_criar(p, 'QA Sem Celular B', '')
    chk('CLI-10', 'dois clientes sem celular são permitidos', ok and ok2, f'{t} / {t2}')
    ok, t = await cli_criar(p, 'QA Cliente Um', '(11) 96666-5555')
    chk('CLI-11', 'homônimo (mesmo nome, outro celular) aceito — regra omissa', not ok, 'aceitou homônimo', 'REGRA')
    await fechar_sheet(p)
    ok, t = await cli_criar(p, 'QA Email Ruim', '(11) 95555-4444', 'isto-nao-e-email')
    chk('CLI-12', 'e-mail inválido ("isto-nao-e-email") é recusado', not ok, f'gravou: {t}')
    await fechar_sheet(p)

    # XSS
    ok, t = await cli_criar(p, '<img src=x onerror=window.__xss=1>', '(11) 94444-3333')
    xss = await p.js("window.__xss === 1 || !!document.querySelector('.cli-head img')")
    chk('CLI-13', 'nome com HTML é exibido como texto (sem injeção)', ok and not xss, xss)

    # busca sem acento
    await cli_criar(p, 'José Ângelo QA', '(11) 93333-2222')
    ls = await cli_lista(p)
    await p.preencher('.searchbar input', 'jose angelo')
    await asyncio.sleep(0.3)
    achou = await textos(p, '.clirow')
    chk('CLI-14', 'busca ignora acento e maiúscula ("jose angelo" acha "José Ângelo")', any('José Ângelo' in x for x in achou), achou)
    await p.preencher('.searchbar input', '98888')
    await asyncio.sleep(0.3)
    achou = await textos(p, '.clirow')
    chk('CLI-15', 'busca por parte do celular acha o cliente', any('QA Cliente Um' in x for x in achou), achou)

    # editar
    await cli_lista(p)
    await p.clicar('.clirow', 'QA Cliente Um'); await p.esperar("location.hash.startsWith('#/cliente?')")
    await p.esperar("document.querySelector('button.link')")
    await p.clicar('button.link', 'Editar cliente'); await p.esperar("document.querySelector('.sheet-root input.inp')")
    await cli_form(p, 'QA Cliente Um Editado', '(11) 91111-2222', 'novo@exemplo.com', 'obs nova')
    await p.clicar('.sheet-root .sheet-f .btn.pri')
    await asyncio.sleep(1)
    await recarregar(p)
    ls = await cli_lista(p)
    chk('CLI-16', 'edição de nome e celular persiste após recarregar', any('QA Cliente Um Editado' in x and '(11) 91111-2222' in x for x in ls), ls)
    chk('CLI-17', 'celular antigo (98888-7777) não permanece em nenhum cliente após editar', not any('98888-7777' in x or '5511988887777' in x and False for x in ls), ls)
    # editar para celular de outro
    await p.clicar('.clirow', 'QA Cliente Um Editado'); await p.esperar("document.querySelector('button.link')")
    await p.clicar('button.link', 'Editar cliente'); await p.esperar("document.querySelector('.sheet-root input.inp')")
    await cli_form(p, None, '(11) 90000-1234')  # celular da Renata (exemplo)
    await toast_limpar(p); await p.clicar('.sheet-root .sheet-f .btn.pri')
    t = await toast_ler(p)
    chk('CLI-18', 'editar para o celular de outro cliente é recusado', 'Já existe' in t, t)
    await cli_form(p, None, '(11) 91111-2222')
    await toast_limpar(p); await p.clicar('.sheet-root .sheet-f .btn.pri'); await asyncio.sleep(0.8)
    chk('CLI-19', 'regravar o próprio celular não conta como duplicado', not await p.js("!!document.querySelector('.sheet-root')"), await toast_ler(p, 0.2))
    await fechar_sheet(p)

    # inativar (único "remover")
    await cli_lista(p)
    await p.clicar('.clirow', 'QA Sem Celular A'); await p.esperar("document.querySelector('button.link')")
    hash_sem_cel = await p.js("location.hash")  # guardado para reativar depois (R4)
    await p.clicar('button.link', 'Editar cliente'); await p.esperar("document.querySelector('.sheet-root input.inp')")
    botoes = [nb(x) for x in await p.js("[...document.querySelectorAll('.sheet-root button')].map(b => b.textContent.trim())")]
    chk('CLI-20', 'existe "Excluir" para cliente sem histórico (RN-15 só proíbe com histórico)? hoje só "Inativar"', any('xclu' in b for b in botoes), botoes, 'REGRA')
    rot = await dois_toques(p, '.sheet-root button', 'Inativar')
    chk('CLI-21', '"Inativar" pede confirmação (2 toques)', 'confirmar' in rot.lower(), rot)
    await asyncio.sleep(0.6)
    ls = await cli_lista(p)
    chk('CLI-22', 'cliente inativado some da lista', not any('QA Sem Celular A' in x for x in ls), ls)
    await recarregar(p)
    ls = await cli_lista(p)
    chk('CLI-23', 'inativação persiste após recarregar', not any('QA Sem Celular A' in x for x in ls), ls)
    # R4 (decidido pelo Celso em 18/11/2026): "Reativar" na ficha do cliente inativo, em 2 toques
    await ir(p, hash_sem_cel, 0.8)
    await p.esperar("document.querySelector('button.btn.block')")
    rot = await dois_toques(p, 'button.btn.block', 'Reativar')
    await asyncio.sleep(0.6)
    ls = await cli_lista(p)
    chk('CLI-24', 'cliente inativado pode ser reativado pela ficha (Reativar, 2 toques) e volta à lista', 'confirmar' in rot.lower() and any('QA Sem Celular A' in x for x in ls), f'{rot!r} {ls}')
    # volta ao estado anterior para não mudar os testes seguintes
    await p.clicar('.clirow', 'QA Sem Celular A'); await p.esperar("document.querySelector('button.link')")
    await p.clicar('button.link', 'Editar cliente'); await p.esperar("document.querySelector('.sheet-root input.inp')")
    await dois_toques(p, '.sheet-root button', 'Inativar')
    await asyncio.sleep(0.6)
    # celular de inativo é liberado para novo cadastro
    ok, t = await cli_criar(p, 'QA Reuso Celular', '(11) 91111-2222')
    chk('CLI-25', 'celular do cliente editado continua bloqueado para outro cliente', not ok, t)
    await fechar_sheet(p)


# ---------------------------------------------------------------- agendamentos
def datas():
    hoje = datetime.date.today()
    d = hoje + datetime.timedelta(days=7)
    while d.weekday() != 3:  # quinta
        d += datetime.timedelta(days=1)
    passado = hoje - datetime.timedelta(days=1)
    while passado.weekday() not in (1, 2, 3, 4):  # dia útil de funcionamento (ter-sex)
        passado -= datetime.timedelta(days=1)
    iso = lambda x: x.isoformat()
    return dict(D=iso(d), F=iso(d + datetime.timedelta(days=1)), SAB=iso(d + datetime.timedelta(days=2)), DOM=iso(d + datetime.timedelta(days=3)),
                SEG=iso(d + datetime.timedelta(days=4)), E=iso(d + datetime.timedelta(days=7)), PASSADO=iso(passado))


async def novo_form(p, d, busca, escolher, espera_form=True):
    await ir(p, f'#/novo?d={d}', 0.3)
    await p.esperar("document.querySelector('.searchbar input')")
    await p.preencher('.searchbar input', busca)
    await p.esperar(f"[...document.querySelectorAll('.clirow, .bigopt')].some(e => e.textContent.includes({json.dumps(escolher)}))")
    await p.clicar('.clirow, .bigopt', escolher)
    if espera_form:
        await p.esperar("document.querySelector('form.stack select')")


async def preencher_agendamento(p, d, hora, prof, srv, preco=None, nota=None):
    await selecionar(p, 'form.stack', 0, prof)
    await asyncio.sleep(0.15)
    await selecionar(p, 'form.stack', 1, srv)
    await p.preencher('form.stack input[type=date]', d)
    await p.preencher('form.stack input[type=time]', hora)
    if preco is not None:
        await p.preencher('form.stack input[inputmode=decimal]', preco)
    if nota is not None:
        await p.preencher('form.stack textarea', nota)


async def enviar_agendamento(p):
    """Envia o formulário e devolve (ok, toast, hash)."""
    await toast_limpar(p)
    await p.clicar('form.stack button[type=submit]')
    fim = time.time() + 5
    while time.time() < fim:
        h = await p.js("location.hash")
        if h.startswith('#/comanda'):
            await asyncio.sleep(0.4)
            return True, '', h
        t = nb(await p.js("document.querySelector('.toast')?.textContent || ''"))
        if t and not toast_ok(t):
            return False, t, h
        await asyncio.sleep(0.12)
    return False, '', await p.js("location.hash")


async def agendar(p, d, hora, prof, srv, busca='Ren', escolher='Renata', **kw):
    await novo_form(p, d, busca, escolher)
    await preencher_agendamento(p, d, hora, prof, srv, **kw)
    return await enviar_agendamento(p)


async def agenda_aps(p, d):
    await ir(p, f'#/agenda?d={d}', 0.4)
    await p.esperar("document.querySelector('.grid')")
    return [t.replace('\n', ' | ') for t in await textos(p, '.ap')]


async def abrir_comanda_de(p, d, trecho):
    await ir(p, f'#/agenda?d={d}', 0.4)
    await p.esperar("document.querySelector('.grid')")
    await p.clicar('.ap', trecho)
    await p.esperar("location.hash.startsWith('#/comanda')")
    await p.esperar("document.querySelector('.card.item')")


async def cards(p):
    return [t.replace('\n', ' | ') for t in await textos(p, '.card.item')]


async def clicar_no_card(p, trecho_card, seletor, texto=None):
    ok = await p.js(f"""(() => {{ const c = [...document.querySelectorAll('.card.item')].find(e => e.innerText.includes({json.dumps(trecho_card)}));
      if (!c) return false; const b = [...c.querySelectorAll({json.dumps(seletor)})].find(e => {json.dumps(texto)} === null || e.textContent.includes({json.dumps(texto)}));
      if (!b) return false; b.click(); return true; }})()""")
    assert ok, f'não achei {seletor} {texto} no card {trecho_card}'


async def mudar_status(p, trecho_card, novo):
    await clicar_no_card(p, trecho_card, '.stbtn')
    await p.esperar("document.querySelector('.sheet-root .opt')")
    await toast_limpar(p)
    ok = await p.js(f"""(() => {{ const o = [...document.querySelectorAll('.sheet-root button.opt')].find(e => e.textContent.includes({json.dumps(novo)})); if (!o) return false; o.click(); return true; }})()""")
    if not ok:
        ops = await textos(p, '.sheet-root .opt')
        await fechar_sheet(p)
        return False, f'opção "{novo}" indisponível; opções: {ops}'
    t = await toast_ler(p)
    await asyncio.sleep(0.4)
    return True, t


async def editar_item(p, trecho_card, d=None, hora=None, prof=None, srv=None, preco=None, nota=None):
    await clicar_no_card(p, trecho_card, 'button', 'Editar')
    await p.esperar("document.querySelector('form.stack select')")
    if prof: await selecionar(p, 'form.stack', 0, prof); await asyncio.sleep(0.15)
    if srv: await selecionar(p, 'form.stack', 1, srv)
    if d: await p.preencher('form.stack input[type=date]', d)
    if hora: await p.preencher('form.stack input[type=time]', hora)
    if preco is not None: await p.preencher('form.stack input[inputmode=decimal]', preco)
    if nota is not None: await p.preencher('form.stack textarea', nota)
    return await enviar_agendamento(p)


async def secao_agendamentos(p, D):
    print('\n== 4) AGENDAMENTOS', flush=True)
    d = D['D']
    SOB = 'Design de sobrancelha'  # 40 min, R$ 50,00 (Camila)
    MAO = 'Mão'                    # 30 min (Bianca), nome também casa "Mão & Pé"; usa texto com ·
    MAO_OPT = 'Mão · R$ 40,00'

    # criar
    ok, t, h = await agendar(p, d, '10:00', CAM, SOB)
    chk('AGD-01', 'cria agendamento válido (Renata, Camila, 10:00, Design de sobrancelha)', ok, f'{t!r} {h}')
    cs = await cards(p)
    c0 = cs[0] if cs else ''
    chk('AGD-02', 'comanda mostra horário 10:00-10:40, serviço, preço R$ 50,00 e profissional', '10:00' in c0 and '10:40' in c0 and SOB in c0 and 'R$ 50,00' in c0 and 'Camila' in c0, cs)
    cab = nb(await p.js("document.querySelector('.cli-head')?.innerText || ''"))
    chk('AGD-03', 'comanda está ligada ao cliente Renata', 'Renata' in cab, cab)
    aps = await agenda_aps(p, d)
    chk('AGD-04', 'agenda do dia mostra o bloco 10:00 - 10:40 de Renata', any('10:00 - 10:40' in a and 'Renata' in a for a in aps), aps)
    await recarregar(p)
    aps = await agenda_aps(p, d)
    chk('AGD-05', 'agendamento persiste após recarregar', any('Renata' in a and SOB in a for a in aps), aps)
    # ficha do cliente
    await ir(p, '#/clientes'); await p.esperar("document.querySelector('.clirow')")
    await p.clicar('.clirow', 'Renata'); await p.esperar("location.hash.startsWith('#/cliente?')")
    hid = await p.js("location.hash")
    await ir(p, hid + '&t=agend'); await p.esperar("document.querySelector('.card.item')")
    cs = await cards(p)
    chk('AGD-06', 'ficha da cliente > Agendamentos lista o novo item (vínculo cliente)', any(SOB in c and '10:00' in c for c in cs), cs)

    # conflitos
    ok, t, h = await agendar(p, d, '10:30', CAM, SOB, 'Mari', 'Mariana')
    chk('AGD-07', 'conflito: Camila 10:30 sobrepõe 10:00-10:40 -> recusado com mensagem', (not ok) and 'já tem um atendimento' in t, f'{ok} {t!r}')
    ok, t, h = await agendar(p, d, '09:30', CAM, SOB, 'Mari', 'Mariana')
    chk('AGD-08', 'conflito: Camila 09:30 (termina 10:10) sobrepõe -> recusado', (not ok) and 'já tem um atendimento' in t, f'{ok} {t!r}')
    ok, t, h = await agendar(p, d, '10:00', CAM, SOB, 'Mari', 'Mariana')
    chk('AGD-09', 'conflito: mesmo horário exato -> recusado', (not ok) and 'já tem um atendimento' in t, f'{ok} {t!r}')
    ok, t, h = await agendar(p, d, '10:40', CAM, SOB, 'Mari', 'Mariana')
    chk('AGD-10', 'encaixe colado: 10:40 (logo depois do fim) é permitido', ok, f'{t!r}')
    ok, t, h = await agendar(p, d, '09:20', CAM, SOB, 'Ana', 'Ana Paula')
    chk('AGD-11', 'encaixe colado: 09:20-10:00 (logo antes do início) é permitido', ok, f'{t!r}')
    ok, t, h = await agendar(p, d, '10:00', BIA, MAO_OPT, 'Mari', 'Mariana')
    chk('AGD-12', 'outro profissional no mesmo horário é permitido', ok, f'{t!r}')
    ok, t, h = await agendar(p, d, '10:30', BIA, MAO_OPT, 'Ren', 'Renata')
    chk('AGD-13', 'mesmo cliente em dois profissionais ao mesmo tempo: Renata está com Camila 10:00-10:40 e agenda Bianca 10:30 (regra omissa; RN-02 só vale por profissional)', not ok, 'aceitou (Renata em 2 lugares ao mesmo tempo)', 'REGRA')

    # horário de funcionamento
    ok, t, h = await agendar(p, d, '07:30', CAM, SOB)
    chk('AGD-14', 'fora do expediente: 07:30 -> recusado ("Fora do horário")', (not ok) and 'Fora do horário' in t, f'{ok} {t!r}')
    ok, t, h = await agendar(p, d, '18:30', CAM, SOB)
    chk('AGD-15', 'fora do expediente: 18:30 + 40 min passa das 19:00 -> recusado', (not ok) and 'Fora do horário' in t, f'{ok} {t!r}')
    ok, t, h = await agendar(p, d, '18:20', CAM, SOB)
    chk('AGD-16', 'termina exatamente às 19:00 (18:20 + 40 min) é permitido', ok, f'{t!r}')
    ok, t, h = await agendar(p, D['SEG'], '10:00', CAM, SOB)
    chk('AGD-17', 'dia fechado (segunda): recusado ("fechado")', (not ok) and 'fechado' in t, f'{ok} {t!r}')
    ok, t, h = await agendar(p, D['DOM'], '10:00', CAM, SOB)
    chk('AGD-18', 'dia fechado (domingo): recusado', (not ok) and 'fechado' in t, f'{ok} {t!r}')
    ok, t, h = await agendar(p, D['SAB'], '17:30', CAM, SOB)
    chk('AGD-19', 'sábado fecha às 18:00: 17:30 + 40 min -> recusado', (not ok) and 'Fora do horário' in t, f'{ok} {t!r}')

    # data/hora obrigatórias
    await novo_form(p, d, 'Ren', 'Renata'); await selecionar(p, 'form.stack', 0, CAM)
    await p.preencher('form.stack input[type=time]', '')
    ok, t, h = await enviar_agendamento(p)
    chk('AGD-20', 'hora vazia não envia o formulário (campo obrigatório)', (not ok) and h.startswith('#/adicionar'), f'{ok} {t!r} {h}')
    await p.preencher('form.stack input[type=time]', '11:00'); await p.preencher('form.stack input[type=date]', '')
    ok, t, h = await enviar_agendamento(p)
    chk('AGD-21', 'data vazia não envia o formulário', (not ok) and h.startswith('#/adicionar'), f'{ok} {t!r} {h}')

    # passado
    ok, t, h = await agendar(p, D['PASSADO'], '10:00', CAM, SOB)
    pede = await p.js("[...document.querySelectorAll('.sheet-root')].some(e => e.textContent.includes('Horário no passado') && e.textContent.includes('Registrar mesmo assim'))")
    chk('AGD-22', 'data passada pede confirmação e não grava sem ela (R5, decidido pelo Celso em 18/11/2026)', (not ok) and pede, f'ok={ok} confirmacao={pede} toast={t!r}')
    await p.clicar('.sheet-root button', 'Registrar mesmo assim')
    fim = time.time() + 5
    while time.time() < fim and not (await p.js("location.hash")).startswith('#/comanda'):
        await asyncio.sleep(0.15)
    chk('AGD-22b', 'confirmando "Registrar mesmo assim", o agendamento passado é gravado', (await p.js("location.hash")).startswith('#/comanda'), await p.js("location.hash"))

    # preço no formulário
    ok, t, h = await agendar(p, D['F'], '08:00', CAM, SOB, preco='1.500')
    cs = await cards(p)
    chk('AGD-23', 'preço do agendamento "1.500" vira R$ 1.500,00', ok and any('R$ 1.500,00' in c for c in cs), f'{t!r} {cs}')
    ok, t, h = await agendar(p, D['F'], '09:00', CAM, SOB, preco='abc')
    cs = await cards(p)
    chk('AGD-24', 'preço do agendamento com texto ("abc") é recusado, não grava R$ 0,00', not ok, f'gravou: {cs}')
    ok, t, h = await agendar(p, D['F'], '10:00', CAM, SOB, preco='-5')
    chk('AGD-25', 'preço negativo é recusado', not ok, f'{ok} {t!r}')

    # cliente novo e avulso no fluxo
    await novo_form(p, D['F'], 'QA Fluxo Novo', 'Criar novo cliente', False)
    await p.esperar("document.querySelector('.sheet-root input.inp')")
    await p.preencher('.sheet-root input.inp', '(11) 90000-1234', 1)  # celular da Renata
    await toast_limpar(p); await p.clicar('.sheet-root .btn.pri', 'Continuar')
    t = await toast_ler(p)
    chk('AGD-26', 'novo cliente no fluxo de agendar com celular já usado é recusado', 'Já existe' in t, t)
    await p.preencher('.sheet-root input.inp', '(11) 92222-1111', 1)
    await p.clicar('.sheet-root .btn.pri', 'Continuar')
    await p.esperar("document.querySelector('form.stack select')")
    await preencher_agendamento(p, D['F'], '11:00', CAM, SOB)
    ok, t, h = await enviar_agendamento(p)
    await ir(p, '#/clientes'); await p.esperar("document.querySelector('.clirow')")
    chk('AGD-27', 'agendar com cliente novo cria o cliente junto', ok and any('QA Fluxo Novo' in x for x in await textos(p, '.clirow')), f'{t!r}')
    await novo_form(p, D['F'], 'Fulana Avulsa', 'Avançar com cliente avulso')
    await preencher_agendamento(p, D['F'], '12:00', CAM, SOB)
    ok, t, h = await enviar_agendamento(p)
    cab = nb(await p.js("document.querySelector('.cli-head')?.innerText || ''"))
    chk('AGD-28', 'agendar para cliente avulso funciona e não entra na lista de clientes', ok and 'Fulana Avulsa' in cab and not any('Fulana' in x for x in await cli_lista(p)), f'{t!r} {cab!r}')

    # bloqueio
    await ir(p, f'#/agenda?d={d}', 0.4); await p.esperar("document.querySelector('.grid')")
    ok = await p.js("(() => { const b = document.querySelector('button.slot[aria-label=\"Novo em 14:00 com Camila Rocha\"]'); if (!b) return false; b.click(); return true; })()")
    assert ok, 'slot 14:00 da Camila não encontrado'
    await p.esperar("document.querySelector('.sheet-root')")
    await p.clicar('.sheet-root button', 'Bloquear horário'); await p.esperar("document.querySelector('.sheet-root input.inp[type=time]')")
    fechou, t = await salvar_sheet(p)
    chk('AGD-29', 'cria bloqueio 14:00-15:00 (almoço) para Camila', fechou, t)
    ok, t, h = await agendar(p, d, '14:30', CAM, SOB)
    chk('AGD-30', 'agendar dentro do bloqueio -> recusado com mensagem do bloqueio', (not ok) and 'bloqueio' in t, f'{ok} {t!r}')

    # remarcar
    await abrir_comanda_de(p, d, 'Renata')
    ok, t, h = await editar_item(p, SOB, hora='10:30')
    chk('AGD-31', 'remarcar 10:00 -> 10:30 colide com o item das 10:40 (Mariana): recusado', (not ok) and 'já tem um atendimento' in t, f'{ok} {t!r}')
    await p.js("history.back()"); await asyncio.sleep(0.4)
    await abrir_comanda_de(p, d, 'Renata')
    ok, t, h = await editar_item(p, SOB, nota='só mudei a nota')
    chk('AGD-32', 'editar só a nota (mesmo horário) não conflita consigo mesmo', ok, f'{t!r}')
    cs = await cards(p)
    chk('AGD-33', 'nota gravada aparece no card', any('só mudei a nota' in c for c in cs), cs)
    # confirmar e remarcar -> volta a Marcado (RN-07)
    ok, t = await mudar_status(p, SOB, 'Confirmado')
    cs = await cards(p)
    chk('AGD-34', 'mudar status para Confirmado', ok and any('Confirmado' in c for c in cs), f'{t!r} {cs}')
    ok, t, h = await editar_item(p, SOB, hora='15:00')
    cs = await cards(p)
    chk('AGD-35', 'remarcar para 15:00 (livre, depois do bloqueio) funciona e mostra 15:00-15:40', ok and any('15:00' in c and '15:40' in c for c in cs), f'{t!r} {cs}')
    chk('AGD-36', 'RN-07: remarcar item Confirmado volta a "Marcado"', any('Marcado' in c for c in cs), cs)
    await recarregar(p)
    aps = await agenda_aps(p, d)
    chk('AGD-37', 'remarcação persiste após recarregar', any('15:00 - 15:40' in a and 'Renata' in a for a in aps) and not any('10:00 - 10:40' in a and 'Renata' in a for a in aps), aps)
    ok, t, h = await agendar(p, d, '10:00', CAM, SOB, 'Ana', 'Ana Paula')
    chk('AGD-38', 'o horário antigo (10:00) ficou livre depois de remarcar', ok, f'{t!r}')
    # remarcar para outro dia: comanda muda
    await abrir_comanda_de(p, d, 'Renata')
    ok, t, h = await editar_item(p, SOB, d=D['F'], hora='15:00')
    chk('AGD-39', 'remarcar para outro dia (sexta 15:00) funciona', ok, f'{t!r}')
    aps_d = await agenda_aps(p, d)
    aps_f = await agenda_aps(p, D['F'])
    chk('AGD-40', 'item some do dia antigo (15:00) e aparece no novo', not any('Renata' in a and '15:00 - 15:40' in a for a in aps_d) and any('Renata' in a and '15:00 - 15:40' in a for a in aps_f), (aps_d, aps_f))
    # trocar para serviço mais longo que bate no próximo
    await abrir_comanda_de(p, d, 'Mariana')
    cs = await cards(p)
    # Mariana tem Camila 10:40 (40 min); trocar para Lash lifting (120 min) invade a próxima? Camila 11:20 está livre; use cílios em 17:00 -> 19:00 ok;
    ok, t, h = await editar_item(p, SOB, srv='Lash lifting')
    chk('AGD-41', 'trocar serviço por um mais longo (120 min) recalcula fim e checa conflito (10:40 -> 12:40 livre)', ok, f'{t!r}')
    cs = await cards(p)
    chk('AGD-42', 'card mostra 10:40-12:40 e preço do novo serviço', any('10:40' in c and '12:40' in c and 'R$ 150,00' in c for c in cs), cs)

    # cancelar / reativar
    await abrir_comanda_de(p, d, 'Ana Paula')
    ok, t = await mudar_status(p, SOB, 'Cancelado')
    aps = await agenda_aps(p, d)
    chk('AGD-43', 'cancelar item (Ana Paula 09:20) tira o bloco da agenda', ok and not any('Ana Paula' in a and '09:20' in a for a in aps), f'{t!r} {aps}')
    ok, t, h = await agendar(p, d, '09:20', CAM, SOB, 'Mari', 'Mariana')
    chk('AGD-44', 'horário do item cancelado fica livre para outro cliente', ok, f'{t!r}')
    await abrir_comanda_de(p, d, 'Ana Paula') if False else None
    await ir(p, '#/clientes'); await p.esperar("document.querySelector('.clirow')")
    await p.clicar('.clirow', 'Ana Paula'); await p.esperar("location.hash.startsWith('#/cliente?')")
    hid = await p.js("location.hash"); await ir(p, hid + '&t=agend'); await p.esperar("document.querySelector('.card.item')")
    await p.clicar('.card.item', 'Cancelado'); await p.esperar("document.querySelector('.card.item .stbtn')")
    ok, t = await mudar_status(p, SOB, 'Marcado')
    chk('AGD-45', 'reativar item cancelado em horário agora ocupado é recusado', (not ok) or 'já tem um atendimento' in t, f'{ok} {t!r}')
    await fechar_sheet(p)

    # concluir: iniciar -> fechar -> pagar
    await abrir_comanda_de(p, d, 'Mariana')
    cs = await cards(p)
    alvo = next((c for c in cs if '10:40' in c and 'Lash' in c), cs[0] if cs else '')
    ok, t = await mudar_status(p, 'Lash lifting', 'Iniciado')
    cs = await cards(p)
    chk('AGD-46', 'mudar para Iniciado', ok and any('Iniciado' in c for c in cs), f'{t!r}')
    await p.clicar('.bar.pri', 'Fechamento'); await p.esperar("location.hash.startsWith('#/fechamento')")
    await p.clicar('.bar.pri', 'Pagamento'); await p.esperar("document.querySelector('.payrow.pix')")
    total = nb(await p.js("document.querySelector('.paytot b').textContent"))
    await p.clicar('.payname', 'Pix'); await asyncio.sleep(0.2)
    await p.clicar('.bar.pri', 'Confirmar pagamento')
    await asyncio.sleep(0.8)
    if await p.js("!!document.querySelector('.sheet-root')"):  # pede abertura do caixa
        await p.preencher('.sheet-root input', '0,00'); await p.clicar('.sheet-root .btn.pri', 'Abrir')
    await p.esperar("document.querySelector('.okbar')", 20)
    ok_txt = nb(await p.js("document.querySelector('.okbar').textContent"))
    chk('AGD-47', 'concluir: fechamento + pagamento integral dá "Pago"', 'Pago' in ok_txt and 'Pendente' not in ok_txt, ok_txt)
    cs = await cards(p)
    bloqueado = await p.js("[...document.querySelectorAll('.card.item')].every(c => !c.querySelector('.btn.sm') && c.querySelector('.stbtn')?.disabled)")
    chk('AGD-48', 'item pago não pode ser editado, excluído nem mudar de status na tela', bloqueado, cs)

    # excluir (2 toques) e comanda vazia
    await abrir_comanda_de(p, d, 'Mariana') if False else None
    await abrir_comanda_de(p, D['F'], 'Renata')
    rot = await dois_toques(p, '.card.item button.danger', 'Excluir')   # exclui o 1º card (08:00)
    chk('AGD-49', '"Excluir" agendamento pede confirmação (2 toques)', 'confirmar' in rot.lower(), rot)
    await asyncio.sleep(0.8)
    aps = await agenda_aps(p, D['F'])
    chk('AGD-50', 'excluído (Renata 08:00) some da agenda e os outros itens permanecem', not any('Renata' in a and '08:00 - 08:40' in a for a in aps) and any('Renata' in a and '15:00 - 15:40' in a for a in aps), aps)
    await recarregar(p)
    aps = await agenda_aps(p, D['F'])
    chk('AGD-51', 'exclusão persiste após recarregar', not any('Renata' in a and '08:00 - 08:40' in a for a in aps), aps)
    # excluir o último item de uma comanda remove a comanda
    await abrir_comanda_de(p, D['F'], 'Fulana')
    await dois_toques(p, '.card.item button.danger', 'Excluir'); await asyncio.sleep(0.8)
    chk('AGD-52', 'excluir o único item da comanda volta para a agenda e a comanda some', (await p.js("location.hash")).startswith('#/agenda') and not any('Fulana' in a for a in await agenda_aps(p, D['F'])), await p.js("location.hash"))

    # ---- vínculos: serviço / profissional / cliente inativados com agendamento
    await secao_vinculos(p, D)


async def secao_vinculos(p, D):
    print('\n== 4b) VÍNCULOS (inativar serviço/profissional/cliente que têm agendamento)', flush=True)
    d = D['SAB']
    # serviço dedicado com agendamento
    await srv_criar(p, 'QA Servico Vinc', 'QA Vinc', 30, '30,00')
    ok, t, h = await agendar(p, d, '09:00', CAM, 'QA Servico Vinc', 'Mari', 'Mariana')
    chk('VIN-00', 'agenda serviço recém-criado (QA Servico Vinc, 30 min, R$ 30,00)', ok, t)
    # RN-19: mudar preço do serviço não muda o agendamento existente
    await srv_abrir_edicao(p, 'QA Servico Vinc'); await srv_form(p, None, None, 60, '45,00'); await salvar_sheet(p)
    await abrir_comanda_de(p, d, 'Mariana')
    cs = await cards(p)
    chk('VIN-01', 'RN-19: mudar preço/duração do serviço não altera agendamento já existente (R$ 30,00, 30 min)', any('R$ 30,00' in c and '09:30' in c for c in cs), cs)
    # inativar o serviço usado
    await srv_abrir_edicao(p, 'QA Servico Vinc'); await p.js("document.querySelector('#sat').click()")
    fechou, t = await salvar_sheet(p)
    chk('VIN-02', 'RN-47: serviço usado em agendamento pode ser inativado (não excluído)', fechou, t)
    await abrir_comanda_de(p, d, 'Mariana')
    ok, t, h = await editar_item(p, 'QA Servico Vinc', nota='editando com serviço inativo')
    cs = await cards(p)
    chk('VIN-03', 'editar a nota de agendamento cujo serviço foi inativado não troca o serviço em silêncio', ok and any('QA Servico Vinc' in c and 'editando com serviço inativo' in c for c in cs) or (not ok), f'ok={ok} toast={t!r} cards={cs}')
    chk('VIN-03b', 'editar agendamento cujo serviço foi inativado funciona (mantém o serviço) ou avisa claramente', ok and any('QA Servico Vinc' in c for c in cs), f'ok={ok} toast={t!r} cards={cs}')

    # profissional com agendamento: inativar
    ok, t, h = await agendar(p, d, '09:00', BIA, MAO_OPT, 'Ana', 'Ana Paula')
    chk('VIN-04', 'agenda Ana Paula com Bianca às 09:00', ok, t)
    await prof_abrir_edicao(p, 'Bianca'); await p.js("document.querySelector('#pav').click()")
    fechou, t = await salvar_sheet(p)
    chk('VIN-05', 'RN-47: profissional com agendamento futuro pode ser inativado', fechou, t)
    aps = await agenda_aps(p, d)
    chk('VIN-06', 'agendamento futuro de profissional inativado continua visível em algum lugar da agenda (grade)', any('Ana Paula' in a for a in aps), f'grade do dia: {aps}')
    await ir(p, f'#/comandas?d={d}', 0.5)
    lista = await textos(p, '.card.cmd')
    chk('VIN-07', 'lista de comandas do dia ainda mostra a comanda da Ana Paula (profissional inativado)', any('Ana Paula' in c for c in lista), lista)
    await ir(p, '#/clientes'); await p.esperar("document.querySelector('.clirow')")
    await p.clicar('.clirow', 'Ana Paula'); await p.esperar("location.hash.startsWith('#/cliente?')")
    hid = await p.js("location.hash"); await ir(p, hid + '&t=agend'); await p.esperar("document.querySelector('.card.item, .empty')")
    cs = await cards(p)
    chk('VIN-08', 'a ficha da cliente ainda lista o agendamento (dados não se perdem)', any('Mão' in c and '09:00' in c for c in cs), cs)
    await p.clicar('.card.item', 'Mão'); await p.esperar("location.hash.startsWith('#/comanda')"); await p.esperar("document.querySelector('.card.item')")
    ok, t, h = await editar_item(p, 'Mão', nota='com profissional inativo')
    await asyncio.sleep(0.3)
    cs = await cards(p)
    chk('VIN-09', 'editar nota de agendamento de profissional inativado mantém o profissional (Bianca) e não troca por outro em silêncio', ok and any('Bianca' in c for c in cs) or (not ok), f'ok={ok} toast={t!r} cards={cs}')
    chk('VIN-09b', 'editar agendamento de profissional inativado funciona ou avisa', ok and any('Bianca' in c for c in cs), f'ok={ok} toast={t!r} cards={cs}')
    await prof_abrir_edicao(p, 'Bianca'); await p.js("document.querySelector('#pav').click()"); await salvar_sheet(p)

    # profissional que deixa de "atender"
    ok, t, h = await agendar(p, d, '13:00', 'QA Teresa', 'QA Dur 5', 'Ren', 'Renata') if False else (True, '', '')

    # cliente inativado com agendamento futuro
    await abrir_comanda_de(p, d, 'Mariana')
    await ir(p, '#/clientes'); await p.esperar("document.querySelector('.clirow')")
    await p.clicar('.clirow', 'Mariana'); await p.esperar("location.hash.startsWith('#/cliente?')")
    await p.esperar("document.querySelector('button.link')")
    await p.clicar('button.link', 'Editar cliente'); await p.esperar("document.querySelector('.sheet-root')")
    await dois_toques(p, '.sheet-root button', 'Inativar'); await asyncio.sleep(0.6)
    aps = await agenda_aps(p, d)
    chk('VIN-10', 'cliente inativado: agendamentos dela seguem na agenda', any('Mariana' in a for a in aps), aps)
    await abrir_comanda_de(p, d, 'Mariana')
    ok, t, h = await editar_item(p, '09:00', nota='cliente inativada')
    chk('VIN-11', 'editar/remarcar agendamento de cliente inativado funciona (ou avisa claramente)', ok, f'ok={ok} toast={t!r}')
    await p.js("history.back()")

    # volume: 22 agendamentos numa única agenda (quinta, 08:00-19:00 em blocos de 30 min)
    print('  .. volume: 22 agendamentos (clientes novos) na mesma agenda', flush=True)
    await srv_criar(p, 'QA Volume', 'QA Volume', 30, '10,00')
    prof = CAM
    hs = [f'{(8 * 60 + 30 * i) // 60:02d}:{(8 * 60 + 30 * i) % 60:02d}' for i in range(22)]
    feitos = 0
    for i, hh in enumerate(hs):
        await novo_form(p, D['E'], f'QA Lote {i:02d}', 'Criar novo cliente', False)
        await p.esperar("document.querySelector('.sheet-root input.inp')")
        await p.preencher('.sheet-root input.inp', f'(11) 9{70000000 + i}', 1)
        await p.clicar('.sheet-root .btn.pri', 'Continuar'); await p.esperar("document.querySelector('form.stack select')")
        await preencher_agendamento(p, D['E'], hh, prof, 'QA Volume')
        ok, t, h = await enviar_agendamento(p)
        feitos += 1 if ok else 0
        if not ok:
            print('     falha', hh, t); break
    chk('VOL-01', f'cria {len(hs)} agendamentos seguidos pela interface', feitos == len(hs), f'{feitos}/{len(hs)}')
    aps = await agenda_aps(p, D['E'])
    chk('VOL-02', 'agenda renderiza todos os blocos do dia', len([a for a in aps if 'QA Lote' in a]) == feitos, f'{len(aps)} blocos')
    await recarregar(p)
    aps = await agenda_aps(p, D['E'])
    chk('VOL-03', 'todos persistem após recarregar', len([a for a in aps if 'QA Lote' in a]) == feitos, f'{len(aps)} blocos')
    ls = await cli_lista(p)
    chk('VOL-04', 'lista de clientes com 25+ itens carrega e todos aparecem', len([x for x in ls if 'QA Lote' in x]) == feitos, len(ls))
    larg = await p.js("[document.documentElement.scrollWidth, innerWidth]")
    chk('VOL-05', 'sem rolagem horizontal na página', larg[0] <= larg[1], larg)


CAM = 'Camila Rocha · Estética'
BIA = 'Bianca Lopes · Manicure'
MAO_OPT = 'Mão · R$ 40,00'

# ---------------------------------------------------------------- principal
async def principal():
    OUT.mkdir(parents=True, exist_ok=True)
    base = f'http://localhost:{PORTA_APP}/'
    D = datas()
    print('datas de teste:', D, flush=True)
    p = await conectar(abrir_aba('about:blank'))
    await setup(p, base)
    so = os.environ.get('SA_SECOES')  # ex.: SA_SECOES=agendamentos,clientes
    for nome, fn in [('servicos', lambda: secao_servicos(p)), ('profissionais', lambda: secao_profissionais(p)), ('clientes', lambda: secao_clientes(p)), ('agendamentos', lambda: secao_agendamentos(p, D))]:
        if so and nome not in so.split(','):
            continue
        try:
            await fn()
        except Exception as e:  # noqa: BLE001 - uma seção quebrada não derruba as outras
            tb = traceback.format_exc(limit=3)
            chk(f'ERRO-{nome}', f'o teste da seção {nome} foi interrompido (falha do teste ou da tela)', False, f'{type(e).__name__}: {str(e)[:300]}\n{tb[-400:]}')
            try:
                r = await p.cmd('Page.captureScreenshot', format='png')
                import base64
                (OUT / f'erro-{nome}.png').write_bytes(base64.b64decode(r['data']))
                await fechar_sheet(p)
                await recarregar(p)
            except Exception:  # noqa: BLE001
                pass
    erros = [e for e in p.erros if e and 'favicon' not in e]
    chk('GER-01', 'nenhum erro de console/exceção durante todo o fluxo', not erros, erros[:5])


def resumo():
    bug = [r for r in RES if not r[2] and r[1] == 'BUG']
    regra = [r for r in RES if not r[2] and r[1] == 'REGRA']
    print('\n================ RESUMO ================')
    print(f'checks: {len(RES)} | PASS: {sum(1 for r in RES if r[2])} | FAIL(BUG): {len(bug)} | FAIL(REGRA/dúvida): {len(regra)}')
    for r in bug:
        print(f'  BUG   {r[0]}: {r[3]}\n        obtido: {r[4][:400]}')
    for r in regra:
        print(f'  REGRA {r[0]}: {r[3]}\n        obtido: {r[4][:300]}')
    (OUT / 'resultado.json').write_text(json.dumps([dict(id=a, tipo=b, ok=c, titulo=d, obtido=e) for a, b, c, d, e in RES], ensure_ascii=False, indent=1))
    return 1 if bug else 0


def main():
    assert CHROME, 'Chrome/Brave não encontrado (defina CHROME=/caminho)'
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORTA_APP), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    perfil = tempfile.mkdtemp(prefix='sa-crud-')
    chrome = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORTA_CDP}', f'--user-data-dir={perfil}', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    codigo = 1
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORTA_CDP}/json/version'); urllib.request.urlopen(f'http://127.0.0.1:{PORTA_APP}/'); break
            except Exception:
                time.sleep(0.1)
        asyncio.run(principal())
        codigo = resumo()
    finally:
        try: os.killpg(chrome.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        srv.terminate(); srv.wait(5)
        shutil.rmtree(perfil, ignore_errors=True)
    sys.exit(codigo)


if __name__ == '__main__':
    main()
