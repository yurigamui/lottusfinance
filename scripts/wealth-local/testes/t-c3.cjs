const { open, overflow } = require('../drv.cjs');
const WID='6c558055-45e8-4643-911a-3ccd8f7a4b73'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, r); await P.waitForTimeout(1300); };
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
(async () => {
  for (const width of [320, 390, 1280]) {
    const w = await open({ width, height: 700 }); const P = w.page;
    await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
    await go(P, '/w/'+WID+'/bens'); await P.click('[data-act=other-new][data-kind=divida]'); await P.fill('.modal [name=name]', 'C3 '+width); await P.fill('.modal [name=value]', '10');
    const ib = await P.$eval('.modal [name=ref_date]', (i) => { const r = i.getBoundingClientRect(); return { x: r.right - 20, y: r.top + r.height / 2 }; }); await P.mouse.click(ib.x, ib.y); await P.waitForTimeout(200);
    const cal = await P.$('.cal'); const sb = await P.$eval('.modal button[type=submit]', (b) => { b.scrollIntoView({block:'nearest'}); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const top = await P.evaluate(({x,y}) => { const e = document.elementFromPoint(x,y); return e.tagName + '.' + e.className; }, sb);
    await P.screenshot({ path: (process.env.SHOTS || '.') + '/c3-cal-'+width+'.png' });
    console.log(width, 'calendário aberto:', !!cal, '| no ponto do Salvar:', top, '| overflow:', JSON.stringify(await overflow(P)));
    await P.mouse.click(sb.x, sb.y); await P.waitForTimeout(1200);
    console.log(width, 'salvou com a data original:', q("select ref_date from w_other where name='C3 "+width+"'") || 'NÃO SALVOU', '| modal aberto:', !!(await P.$('.modal')));
    // escolher um dia no calendário embutido
    await P.click('[data-act=other-new][data-kind=bem]'); await P.fill('.modal [name=name]', 'D3 '+width); await P.fill('.modal [name=value]', '10');
    const ib2 = await P.$eval('.modal [name=ref_date]', (i) => { const r = i.getBoundingClientRect(); return { x: r.right - 20, y: r.top + r.height / 2 }; }); await P.mouse.click(ib2.x, ib2.y); await P.waitForTimeout(200);
    await P.click('.cal [data-iso$="-10"]'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1200); console.log(width, 'dia escolhido no calendário:', q("select ref_date from w_other where name='D3 "+width+"'") || 'NÃO SALVOU');
    // N3/N1
    await go(P, '/w/'+WID+'/bens'); await P.click('[data-act=other-new][data-kind=bem]'); await P.fill('.modal [name=name]', 'N3'); await P.fill('.modal [name=value]', '1'); await P.fill('.modal [name=ref_date]', '31/02/2025'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(800);
    console.log(width, 'N3 toast duplicado?', /Não deu certo/.test(await P.innerText('body')), '| erro no campo:', await P.$eval('.modal .field-err', (e)=>e.textContent).catch(()=>'nenhum'));
    console.log(width, 'erros:', w.errors); await w.close();
  }
})();
