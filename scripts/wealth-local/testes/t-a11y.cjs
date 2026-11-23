const { open } = require('../drv.cjs');
const WID='45e496cb-04fa-486d-993a-926862a80ecf'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, r); await P.waitForTimeout(1300); };
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
(async () => {
  const w = await open({ width: 1280 }); const P = w.page;
  await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  const routes = ['/carteiras','/carteiras/nova','/conta','/white-label', ...['patrimonio','bens','investimentos','posicao','transacoes','ativos','gastos','gastos/transacoes','gastos/cadastros','relatorios','acessos','config'].map((r)=>'/w/'+WID+'/'+r)];
  const issues = {};
  for (const r of routes) {
    await go(P, r);
    const res = await P.evaluate(() => {
      const vis = (e) => e.offsetParent !== null;
      const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title || (e.labels && e.labels.length && e.labels[0].textContent) || e.textContent || '').trim();
      const inputs = [...document.querySelectorAll('#view input:not([type=hidden]), #view select, #view textarea')].filter(vis).filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.title).map((e) => e.name || e.id || e.type);
      const btns = [...document.querySelectorAll('button, a[href]')].filter(vis).filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 60));
      const small = [...document.querySelectorAll('#view button, #view a.btn, #view input, #view select')].filter(vis).filter((e) => { const b = e.getBoundingClientRect(); return b.height < 32; }).length;
      return { inputs, btns: btns.slice(0, 3), small };
    });
    if (res.inputs.length || res.btns.length) issues[r.replace(WID,'W')] = res;
  }
  console.log('acessibilidade (desktop):', JSON.stringify(issues, null, 0));
  // teclado: foco visível no primeiro botão
  await go(P, '/w/'+WID+'/patrimonio'); await P.keyboard.press('Tab'); await P.keyboard.press('Tab');
  console.log('foco visível:', await P.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return e.tagName + ' outline=' + cs.outlineStyle + ' ' + cs.outlineWidth + ' box-shadow=' + (cs.boxShadow !== 'none'); }));
  // ativo personalizado (CDB 110% CDI) e P.U. manual
  await go(P, '/w/'+WID+'/ativos'); await P.click('[data-act=asset-new]'); await P.waitForTimeout(300);
  await P.fill('.modal [name=name]', 'CDB Banco Exemplo 110% CDI'); await P.selectOption('.modal [name=kind]', { index: 0 });
  const kinds = await P.$$eval('.modal [name=kind] option', (o)=>o.map((x)=>x.value+':'+x.textContent).join(' | ')); console.log('tipos de ativo:', kinds);
  await P.click('.modal button[type=submit]'); await P.waitForTimeout(1300);
  console.log('ativo criado:', q("select count(*) from w_assets where wallet_id='"+WID+"'"), ((await P.innerText('body')).replace(/\s+/g,' ').match(/Não deu certo.{0,80}/)||['sem erro'])[0]);
  // grupo
  await go(P, '/carteiras'); await P.click('[data-act=group-new]'); await P.waitForTimeout(300); await P.fill('.modal [name=name]', 'Família consolidada'); await P.check('.modal input[name=w]'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1500);
  console.log('grupo:', await P.evaluate(()=>location.hash).then((h)=>h.slice(0,10)), (await P.innerText('#view')).replace(/\s+/g,' ').slice(0,200));
  console.log('erros:', w.errors); await w.close();
})();
