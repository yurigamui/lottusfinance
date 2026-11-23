const { open } = require('../drv.cjs');
(async () => {
  for (const [email, id] of [['davi.intruso@exemplo.com.br','a3549d0b-1412-49a5-b9c2-76c7831c4e9d'],['ana.gestora@exemplo.com.br','ae729559-9f0f-44e0-bea2-7db241866028']]) {
    const w = await open({ width: 1280 }); const P = w.page;
    await w.go('#/entrar'); await P.fill('#email', email); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
    await P.evaluate((h)=>{location.hash=h}, '/w/'+id+'/transacoes'); await P.waitForTimeout(1300);
    console.log(email.split('.')[0], 'opções do filtro Ativo:', await P.$$eval('select[name=asset] option', (o)=>o.map((x)=>x.textContent).join(', ')));
    if (email.startsWith('ana')) { await P.selectOption('select[name=asset]', { label: 'XPTO11' }); await P.waitForTimeout(1200); console.log('  filtrado por XPTO11:', (await P.innerText('#view tbody')).replace(/\s+/g,' ').slice(0,120)); }
    console.log('  erros:', w.errors); await w.close();
  }
})();
