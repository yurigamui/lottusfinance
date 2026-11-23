const { open } = require('../drv.cjs');
(async () => {
  for (const width of [1280, 390]) {
  const w = await open({ width, height: 800 }); const P = w.page;
  await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  await P.evaluate((h)=>{location.hash=h}, '/w/3bfa150e-729f-44d6-bb89-4199f8888232/bens'); await P.waitForTimeout(1200);
  await P.click('[data-act=other-new][data-kind=divida]'); await P.fill('.modal [name=name]', 'Cartão exemplo'); await P.fill('.modal [name=value]', '1.234,56');
  await P.click('.modal [name=ref_date]'); await P.waitForTimeout(150); await P.keyboard.type('01/01/2026'); await P.waitForTimeout(300);
  await P.screenshot({ path: process.env.SHOTS + '/cal-aberto-'+width+'.png' });
  const box = await P.$eval('.modal button[type=submit]', (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
  const top = await P.evaluate(({x,y}) => { const e = document.elementFromPoint(x,y); return e.className + ' ' + (e.dataset.iso||'') + ' ' + e.textContent.trim().slice(0,20); }, box);
  console.log(width, 'no centro do botão Salvar está:', top);
  await P.mouse.click(box.x, box.y); await P.waitForTimeout(1200);
  console.log(width, 'data no campo depois do clique:', await P.$eval('.modal [name=ref_date]', (i)=>i.value).catch(()=>'(modal fechou)'));
  const row = await P.evaluate(() => { const t = [...document.querySelectorAll('#view tr')].find((r)=>r.textContent.includes('Cartão exemplo')); return t ? t.textContent.replace(/\s+/g,' ') : null; });
  console.log(width, 'linha salva:', row);
  await w.close(); }
})();
