const { open } = require('../drv.cjs');
const WID='b66f2ed1-48fc-493f-86b1-d86de070550b';
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
(async () => {
  const w = await open({ width: 1280 }); const P = w.page;
  await w.go('#/entrar'); await P.fill('#email','bruno.editor@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  const nova = async (kind, ticker, qty, pu, date, dbl) => {
    await P.evaluate((h)=>{location.hash=h}, '/w/'+WID+'/transacoes'); await P.waitForTimeout(1200);
    await P.click('#view button:has-text("Nova transação")'); await P.waitForTimeout(300);
    await P.selectOption('.modal [name=kind]', kind);
    if (date) { await P.click('.modal [name=date]'); await P.waitForTimeout(100); await P.keyboard.type(date); await P.keyboard.press('Tab'); }
    await P.fill('.modal [name=asset_q]', ticker); await P.waitForTimeout(900);
    const opt = await P.$('.modal [data-combo=asset] .combo-list [role=option], .modal [data-combo=asset] .combo-list button, .modal [data-combo=asset] .combo-list li'); if (opt) await opt.click(); else console.log('  (combo sem opção)');
    await P.fill('.modal [name=qty]', qty); await P.fill('.modal [name=unit_price]', pu);
    if (dbl) await P.dblclick('.modal button[type=submit]'); else await P.click('.modal button[type=submit]');
    await P.waitForTimeout(1500);
    const toast = (await P.innerText('body')).replace(/\s+/g,' ').match(/Não deu certo.{0,90}/); return { modal: !!(await P.$('.modal')), toast: toast && toast[0] };
  };
  const n0 = +q("select count(*) from w_invest_tx");
  console.log('compra PETR4 com duplo clique:', JSON.stringify(await nova('compra','PETR4','10','35,00', null, true)), '| novas linhas:', +q("select count(*) from w_invest_tx") - n0);
  console.log('venda maior que a posição:', JSON.stringify(await nova('venda','PETR4','500','35,00')), '| posição PETR4:', q("select sum(case kind when 'venda' then -qty when 'compra' then qty else 0 end) from w_invest_tx where asset_id='11111111-0000-4000-8000-000000000001'"));
  await P.keyboard.press('Escape'); await P.click('.modal [data-act=modal-close]').catch(()=>{});
  console.log('data futura:', JSON.stringify(await nova('compra','XPTO11','1','100,00','01/01/2030')));
  await P.click('.modal [data-act=modal-close]').catch(()=>{});
  await P.evaluate((h)=>{location.hash=h}, '/w/'+WID+'/posicao'); await P.waitForTimeout(1200);
  console.log('posição:', (await P.innerText('#view')).replace(/\s+/g,' ').match(/PETR4.{0,160}/)?.[0]);
  console.log('erros:', w.errors);
  await w.close();
})();
