const { open } = require('../drv.cjs');
(async () => {
  for (const who of ['carla.visual','bruno.editor','ana.gestora']) {
    const w = await open({ width: 1280 }); await w.go('#/entrar'); await w.page.fill('#email', who+'@exemplo.com.br'); await w.page.fill('#password','senha-exemplo-1'); await w.page.click('button[type=submit]'); await w.page.waitForTimeout(1200);
    for (const r of ['acessos','config']) { await w.page.evaluate((h)=>{location.hash=h}, '/w/3bfa150e-729f-44d6-bb89-4199f8888232/'+r); await w.page.waitForTimeout(1200); console.log(who, r, '=>', (await w.page.innerText('#view')).replace(/\s+/g,' ').slice(0,420)); }
    await w.close();
  }
})();
