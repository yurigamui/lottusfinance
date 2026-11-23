const { open, overflow } = require('../drv.cjs');
const LONG = 'Apartamento na praia com vista para o mar e garagem para dois carros <img src=x onerror=alert(1)> "aspas" e d\'Ávila';
(async () => {
  const w = await open({ width: 1280 }); const P = w.page; let alerted = false; P.on('dialog', () => { alerted = true; });
  await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  await P.evaluate((h)=>{location.hash=h}, '/w/33003e43-06ab-4ea5-b191-b102ec35beea/bens'); await P.waitForTimeout(1200);
  await P.click('[data-act=other-new][data-kind=bem]'); await P.waitForTimeout(300);
  await P.fill('.modal [name=name]', LONG); await P.fill('.modal [name=value]', '999.999.999,99'); 
  await P.click('.modal [name=ref_date]'); await P.keyboard.type('29/02/2024'); await P.keyboard.press('Tab');
  console.log('antes de salvar:', await P.$eval('.modal [name=ref_date]', (i)=>i.value), await P.evaluate(() => W.form(document.querySelector('.modal form')).ref_date));
  await P.click('.modal button[type=submit]'); await P.waitForTimeout(1500);
  console.log('após salvar:', (await P.innerText('#view')).replace(/\s+/g,' ').slice(0,400));
  console.log('img injetada?', await P.$$eval('#view img', (i)=>i.length), 'alerta?', alerted);
  // valor zero e negativo
  await P.click('[data-act=other-new][data-kind=divida]'); await P.fill('.modal [name=name]', 'Dívida negativa'); await P.fill('.modal [name=value]', '-50'); await P.click('.modal [name=ref_date]'); await P.keyboard.type('01/01/2026'); await P.keyboard.press('Tab'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1200);
  console.log('valor negativo:', (await P.innerText('body')).replace(/\s+/g,' ').match(/Não deu certo.{0,80}|Valor inválido.{0,40}/)?.[0] || 'sem mensagem de erro', '| modal aberto?', !!(await P.$('.modal')));
  await P.keyboard.press('Escape'); await P.click('.modal [data-act=modal-close]').catch(()=>{});
  for (const width of [320, 390]) { await P.setViewportSize({ width, height: 800 }); for (const r of ['bens','patrimonio']) { await P.evaluate((h)=>{location.hash=h}, '/w/33003e43-06ab-4ea5-b191-b102ec35beea/'+r); await P.waitForTimeout(1200); console.log(width, r, JSON.stringify(await overflow(P))); await P.screenshot({ path: process.env.SHOTS + '/borda-'+r+'-'+width+'.png', fullPage: true }); } }
  console.log('erros:', w.errors);
  await w.close();
})();
