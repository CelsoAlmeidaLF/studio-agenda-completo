import asyncio, sys
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/-home-claude/d6dc7d6b-75d1-518b-acf6-7e50baafe7b1/scratchpad/gen/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=1, bypass_csp=True)
        pg = await ctx.new_page()
        errs=[]
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
        await pg.goto('http://localhost:8123/')
        await pg.wait_for_selector('form.auth-card')
        await pg.screenshot(path=OUT+'01-setup.png')
        ins = pg.locator('form.auth-card input.inp')
        await ins.nth(0).fill('Studio Bella Forma')
        await ins.nth(1).fill('Patrícia Souza')
        await ins.nth(2).fill('123456')
        await ins.nth(3).fill('123456')
        await pg.click('button[type=submit]')
        await pg.wait_for_timeout(300)
        print('setup err (weak pin):', await pg.locator('.err').inner_text())
        await ins.nth(2).fill('482916'); await ins.nth(3).fill('482916')
        await pg.click('button[type=submit]')
        await pg.wait_for_selector('.keypad', timeout=20000)
        await pg.screenshot(path=OUT+'02-pin.png')
        # PIN errado
        for d in '111111': await pg.keyboard.press(d)
        await pg.wait_for_function("document.querySelector('.err').textContent.includes('incorreto')", timeout=20000)
        print('wrong pin:', await pg.locator('.err').inner_text())
        for d in '482916': await pg.keyboard.press(d)
        await pg.wait_for_selector('.grid, .empty', timeout=30000)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT+'03-agenda.png')
        # Agendar
        await pg.evaluate("location.hash='#/novo'")
        await pg.fill('.searchbar input', 'Ren')
        await pg.click('.clirow')
        await pg.wait_for_selector('form.stack select')
        sels = pg.locator('form.stack select')
        opts = await sels.nth(0).locator('option').all_inner_texts()
        print('profs:', opts)
        await sels.nth(0).select_option(index=[i for i,o in enumerate(opts) if 'Camila' in o][0])
        await pg.locator('input[type=time]').fill('10:00')
        await pg.screenshot(path=OUT+'04-adicionar.png')
        await pg.click('form.stack button[type=submit]')
        await pg.wait_for_selector('.item', timeout=5000)
        await pg.screenshot(path=OUT+'05-comanda.png')
        # conflito
        await pg.evaluate("location.hash='#/novo'")
        await pg.fill('.searchbar input', 'Mari'); await pg.click('.clirow')
        await pg.wait_for_selector('form.stack select')
        sels = pg.locator('form.stack select'); opts = await sels.nth(0).locator('option').all_inner_texts()
        await sels.nth(0).select_option(index=[i for i,o in enumerate(opts) if 'Camila' in o][0])
        await pg.locator('input[type=time]').fill('10:30')
        await pg.click('form.stack button[type=submit]')
        await pg.wait_for_selector('.toast'); print('conflict toast:', await pg.locator('.toast').inner_text())
        # fechar a comanda da Renata
        await pg.evaluate("history.back()"); await pg.wait_for_timeout(200)
        cid = await pg.evaluate("(async()=>{const m=await import('./js/vault.js');return m.all('comanda')[0].id})()")
        await pg.evaluate(f"location.hash='#/fechamento?id={cid}'")
        await pg.wait_for_selector('.fl')
        await pg.locator('.fl input').nth(1).fill('10,00')  # desconto
        await pg.screenshot(path=OUT+'06-fechamento.png')
        await pg.click('.foot .bar')
        await pg.wait_for_selector('.payrow')
        await pg.click('.payrow.pix .payname')
        await pg.screenshot(path=OUT+'07-pagamento.png')
        await pg.click('.foot .bar.pri')
        await pg.wait_for_selector('.sheet', timeout=5000)
        print('sheet:', await pg.locator('.sheet-h b').inner_text())
        await pg.fill('.sheet input', '50,00')
        await pg.click('.sheet-f .btn.pri')
        await pg.wait_for_selector('.okbar', timeout=5000)
        print('okbar:', await pg.locator('.okbar').inner_text())
        await pg.screenshot(path=OUT+'08-pago.png')
        await pg.evaluate("location.hash='#/caixa'"); await pg.wait_for_selector('.mov'); await pg.screenshot(path=OUT+'09-caixa.png')
        print('caixa saldo:', await pg.locator('.ok-t').inner_text())
        await pg.evaluate("location.hash='#/equipe'"); await pg.wait_for_selector('.prow'); print('equipe:', await pg.locator('.card').inner_text())
        await pg.evaluate("location.hash='#/relatorios'"); await pg.wait_for_selector('.kpis'); await pg.screenshot(path=OUT+'10-relatorios.png', full_page=True)
        await pg.evaluate("location.hash='#/permissoes?id='+(await import('./js/vault.js')).userId()") if False else None
        await pg.evaluate("location.hash='#/gestao'"); await pg.wait_for_selector('.navrow'); await pg.screenshot(path=OUT+'11-gestao.png')
        # dados cifrados no IndexedDB?
        raw = await pg.evaluate("""(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('studio-agenda');q.onsuccess=()=>r(q.result)});
          const all=await new Promise(r=>{const q=db.transaction('recs').objectStore('recs').getAll();q.onsuccess=()=>r(q.result)});
          const keys=await new Promise(r=>{const q=db.transaction('keys').objectStore('keys').getAll();q.onsuccess=()=>r(q.result)});
          const txt=new TextDecoder('latin1');
          const blob=all.map(x=>x.id+':'+txt.decode(x.ct)).join('|');
          return {n:all.length, renata: blob.includes('Renata'), bella: blob.includes('Bella'), types:[...new Set(all.map(x=>x.type))], keyFields:Object.keys(keys[0]), pinInKeys: JSON.stringify(keys).includes('482916')}})()""")
        print('idb:', raw)
        # desktop
        await pg.set_viewport_size({'width':1366,'height':860})
        await pg.evaluate("location.hash='#/agenda'"); await pg.wait_for_selector('.grid'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT+'12-desktop.png')
        # bloquear e checar que a memória foi limpa
        await pg.evaluate("(async()=>{(await import('./js/vault.js')).lock()})()")
        await pg.wait_for_selector('.keypad', timeout=10000)
        print('after lock unlocked?', await pg.evaluate("(async()=>(await import('./js/vault.js')).isUnlocked())()"))
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
