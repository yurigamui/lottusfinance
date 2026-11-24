const { open } = require('../drv.cjs');
const WID = 'f46c9b36-3319-4545-95fb-7d41023cbd42';
(async () => {
  const out = [];
  for (const width of [1280, 390]) {
    const w = await open({ width }); const P = w.page; const shot = (n) => process.env.SHOTS && P.screenshot({ path: `${process.env.SHOTS}/${n}-${width}.png`, fullPage: true });
    await w.go('#/entrar'); await P.fill('#email', 'ana.gestora@exemplo.com.br'); await P.fill('#password', 'senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1500);
    const go = async (h) => { await P.evaluate((x) => { location.hash = x; }, h); await P.waitForTimeout(1600); };
    const txt = async () => (await P.innerText('#view')).replace(/\s+/g, ' ');
    await go(`/w/${WID}/patrimonio`); const pat = await txt(); await shot('patrimonio');
    out.push([width, 'patrimonio', /Relatórios/.test(pat), /Vencimentos e liquidez/.test(pat), !/Na curva: renda/.test(pat), !/Os mesmos aportes/.test(pat)]);
    const overflow = await P.evaluate(() => [...document.querySelectorAll('.kpi .big')].filter((e) => e.scrollWidth > e.clientWidth + 1).length); out.push([width, 'kpi-overflow', overflow, 'horiz-scroll', await P.evaluate(() => document.documentElement.scrollWidth > innerWidth)]);
    await P.click('[data-act=reports-open]'); await P.waitForTimeout(500); out.push([width, 'modal-relatorios', await P.evaluate(() => document.querySelectorAll('.modal .rpt-item').length)]); await shot('relatorios'); await P.keyboard.press('Escape'); await P.click('.modal [data-act=modal-close]').catch(() => {});
    await go(`/w/${WID}/investimentos`); await shot('invest');
    await go(`/w/${WID}/posicao`); await shot('posicao'); const pos = await txt();
    out.push([width, 'posicao', await P.evaluate(() => document.querySelectorAll('table.pos tr.g').length), await P.evaluate(() => document.querySelectorAll('table.pos tr.a').length), /% do portfólio/.test(pos)]);
    await P.click('table.pos tr.g >> nth=0'); await P.waitForTimeout(200); out.push([width, 'recolhe', await P.evaluate(() => document.querySelectorAll('table.pos tr.a').length)]);
    await go(`/w/${WID}/transacoes?new=1`); await P.waitForTimeout(500);
    await P.fill('.modal [name=qty]', '1234,5'); await P.fill('.modal [name=unit_price]', '10,25'); await P.waitForTimeout(200);
    out.push([width, 'total-tx', await P.inputValue('.modal [name=qty]'), await P.innerText('#tx-total')]); await shot('tx');
    await P.click('.modal [data-act=modal-close]').catch(() => {});
    const nav = await P.evaluate(() => [...document.querySelectorAll('.nav-sec')].map((s) => s.dataset.group + ':' + s.querySelectorAll('.fly-item').length)); out.push([width, 'nav', nav.join(' ')]);
    await go(`/w/${WID}/config`); out.push([width, 'config', /Gerenciar acessos/.test(await txt()), !/cobrança/i.test((await txt()).match(/Só o titular.{0,40}/)?.[0] || '')]);
    // arrastar no gráfico
    await go(`/w/${WID}/patrimonio`); const box = await P.$('#ch-eq svg'); if (box) { await box.scrollIntoViewIfNeeded(); const b = await box.boundingBox(); await P.mouse.move(b.x + b.width * .3, b.y + b.height / 2); await P.mouse.down(); await P.mouse.move(b.x + b.width * .7, b.y + b.height / 2, { steps: 8 }); await P.mouse.up(); await P.waitForTimeout(200); out.push([width, 'selecao', await P.evaluate(() => { const e = document.querySelector('.chart-sel'); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ') : 'sem balão'; })]); await shot('selecao'); }
    out.push([width, 'erros', JSON.stringify(w.errors)]);
    await w.close();
  }
  console.log(out.map((o) => o.join(' | ')).join('\n'));
})();
