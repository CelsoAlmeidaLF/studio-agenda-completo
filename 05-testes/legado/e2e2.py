import asyncio
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/-home-claude/d6dc7d6b-75d1-518b-acf6-7e50baafe7b1/scratchpad/gen/'
async def pin(pg, p):
    for d in p: await pg.keyboard.press(d)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844}, bypass_csp=True)
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8123/')
        await pg.wait_for_selector('form.auth-card')
        ins = pg.locator('form.auth-card input.inp')
        for i,v in enumerate(['Studio X','Ana Gestora','482916','482916']): await ins.nth(i).fill(v)
        await pg.click('button[type=submit]'); await pg.wait_for_selector('.keypad', timeout=20000)
        await pin(pg,'482916'); await pg.wait_for_selector('.grid', timeout=30000)
        await pg.evaluate("""(async()=>{const V=await import('./js/vault.js');const S=await import('./js/services.js');
           const c=S.profs().find(p=>p.nome.startsWith('Camila')); await S.definirPin(c.id,'739205');})()""")
        await pg.evaluate("(async()=>(await import('./js/vault.js')).lock())()")
        await pg.wait_for_selector('.who-b', timeout=10000)
        await pg.screenshot(path=OUT+'13-who.png')
        await pg.click('.who-b:has-text("Camila")'); await pg.wait_for_selector('.keypad')
        await pin(pg,'739205'); await pg.wait_for_selector('.grid', timeout=30000)
        cols = await pg.locator('.gh:not(.corner)').all_inner_texts()
        print('Camila vê colunas:', cols)
        await pg.click('button[aria-label="Abrir menu"]'); await pg.wait_for_selector('.drawer')
        print('Menu Camila:', await pg.locator('.drawer .nav-i').all_inner_texts())
        await pg.screenshot(path=OUT+'14-menu-camila.png')
        await pg.keyboard.press('Escape')
        await pg.evaluate("location.hash='#/caixa'"); await pg.wait_for_timeout(300)
        print('Caixa p/ Camila:', await pg.locator('.empty b').first.inner_text())
        r = await pg.evaluate("""(async()=>{const S=await import('./js/services.js');try{await S.abrirCaixa('2026-10-22',0);return 'abriu'}catch(e){return e.message}})()""")
        print('Serviço abrirCaixa como Camila:', r)
        # lockout
        await pg.evaluate("(async()=>(await import('./js/vault.js')).lock())()")
        await pg.wait_for_selector('.who-b'); await pg.click('.who-b:has-text("Ana")'); await pg.wait_for_selector('.keypad')
        for k in range(5):
            await pin(pg,'111111'); await pg.wait_for_function(f"document.querySelector('.err').textContent.includes('PIN incorreto')", timeout=20000)
            msg = await pg.locator('.err').inner_text()
        print('após 5 erros:', msg)
        await pin(pg,'482916'); await pg.wait_for_timeout(1500)
        print('PIN certo durante bloqueio:', await pg.locator('.err').inner_text())
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
