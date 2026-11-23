const { open, overflow } = require('../drv.cjs');
const WID='3bfa150e-729f-44d6-bb89-4199f8888232', AID='11111111-0000-4000-8000-000000000001';
const ROUTES = ['/carteiras','/carteiras/nova','/conta','/white-label','/w/WID/patrimonio','/w/WID/bens','/w/WID/investimentos','/w/WID/posicao','/w/WID/transacoes','/w/WID/ativos','/w/WID/ativo/AID','/w/WID/gastos','/w/WID/gastos/transacoes','/w/WID/gastos/cadastros','/w/WID/relatorios','/w/WID/acessos','/w/WID/config'].map(r=>r.replace('WID',WID).replace('AID',AID));
(async () => {
  const user = process.argv[2] || 'ana.gestora@exemplo.com.br';
  for (const width of (process.argv[3]||'1440,390,320').split(',').map(Number)) {
    const w = await open({ width, height: 900 });
    await w.go('#/entrar'); await w.page.fill('#email', user); await w.page.fill('#password', 'senha-exemplo-1'); await w.page.click('button[type=submit]'); await w.page.waitForTimeout(1200);
    for (const r of ROUTES) {
      const before = w.errors.length;
      await w.page.evaluate((h) => { location.hash = h; }, r); await w.page.waitForTimeout(1300);
      const o = await overflow(w.page); const t = (await w.page.innerText('#view').catch(()=>w.page.innerText('body'))).replace(/\s+/g,' ');
      const hash = await w.page.evaluate(()=>location.hash);
      const bad = /Não foi possível abrir|Algo deu errado|undefined|NaN|\[object Object\]|null\b/.test(t);
      if (width===1440 || o.hscroll || o.over.length || bad || w.errors.length>before) console.log(`[${width}] ${r.replace(WID,'W').replace(AID,'A')} -> ${hash.replace(WID,'W').slice(0,40)} ${o.hscroll?'HSCROLL ':''}${o.over.length?'OVER '+o.over.join(','):''} ${bad?'TEXTO-SUSPEITO ':''}${w.errors.slice(before).join(' | ')}\n   ${t.slice(0, width===1440?330:160)}`);
      if (width!==1440) await w.page.screenshot({ path: process.env.SHOTS + `/${user.split('.')[0]}-${r.split('/').filter(Boolean).slice(-1)[0].slice(0,12)}-${width}.png`, fullPage: true });
    }
    await w.close();
  }
})();
