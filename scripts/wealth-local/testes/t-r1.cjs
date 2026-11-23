const { open } = require('../drv.cjs');
const WID='b54175f7-a337-4e7f-8bf0-e5db43afc44d';
(async () => {
  for (const [width, height] of [[320,568],[390,844],[768,1024],[1280,720]]) {
    const w = await open({ width, height }); const P = w.page;
    await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
    for (const r of ['transacoes','gastos','gastos/transacoes']) {
      await P.evaluate((h)=>{location.hash=h}, '/w/'+WID+'/'+r); await P.waitForTimeout(1300);
      const inp = await P.$('#view input.date-input[readonly]'); if (!inp) { console.log(width, r, 'sem campo de período'); continue; }
      await inp.scrollIntoViewIfNeeded(); await inp.click(); await P.waitForTimeout(300);
      const b = await P.$eval('.cal', (c) => { const x = c.getBoundingClientRect(); return { top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right), sheet: c.classList.contains('cal-sheet') }; });
      const inside = b.top >= 0 && b.bottom <= height && b.left >= 0 && b.right <= width;
      const isos = await P.$$eval('.cal [data-iso]', (d) => d.map((x) => x.dataset.iso)); await P.click('.cal [data-iso="' + isos[2] + '"]'); await P.waitForTimeout(150); await P.click('.cal [data-iso="' + isos[9] + '"]'); await P.waitForTimeout(1200);
      const val = await inp.inputValue();
      await inp.click(); await P.waitForTimeout(250); const clear = (await P.$('.cal [data-clear]:visible')) || (await P.$('.cal [data-sp]:has-text("Desde o início")')); let cleared = 'sem Limpar'; if (clear) { await clear.click(); await P.waitForTimeout(1000); cleared = (await inp.inputValue()) || '(vazio)'; }
      console.log(width+'x'+height, r.padEnd(17), 'dentro da tela:', inside, JSON.stringify(b), '| período escolhido:', val, '| Limpar:', cleared);
    }
    console.log('erros', w.errors); await w.close();
  }
})();
