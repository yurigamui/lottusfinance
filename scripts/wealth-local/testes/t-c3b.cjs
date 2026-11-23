const { open, overflow } = require('../drv.cjs');
const WID='6c558055-45e8-4643-911a-3ccd8f7a4b73'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, r); await P.waitForTimeout(1300); };
(async () => {
  for (const width of [320, 768]) {
    const w = await open({ width, height: 700 }); const P = w.page;
    await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
    for (const [route, btn, field] of [['transacoes','#view button:has-text("Nova transação")','date'],['ativos','[data-act=asset-new]','issue_date'],['ativos','[data-act=asset-new]','maturity']]) {
      await go(P, '/w/'+WID+'/'+route); await P.click(btn); await P.waitForTimeout(300);
      const ib = await P.$eval('.modal [name='+field+']', (i) => { i.scrollIntoView({block:'center'}); const r = i.getBoundingClientRect(); return { x: r.right - 20, y: r.top + r.height / 2 }; }); await P.mouse.click(ib.x, ib.y); await P.waitForTimeout(250);
      const calBox = await P.$eval('.cal', (c) => { const r = c.getBoundingClientRect(); const m = c.closest('.modal').getBoundingClientRect(); return { cal: [Math.round(r.left), Math.round(r.right)], modal: [Math.round(m.left), Math.round(m.right)] }; }).catch(()=>null);
      console.log(width, route, field, 'cal', JSON.stringify(calBox), JSON.stringify(await overflow(P)));
      await P.screenshot({ path: (process.env.SHOTS || '.') + '/c3b-'+field+'-'+width+'.png' }); await P.keyboard.press('Escape'); await P.click('.modal [data-act=modal-close]').catch(()=>{});
    }
    console.log('erros', w.errors); await w.close();
  }
})();
