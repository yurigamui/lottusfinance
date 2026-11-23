const { open } = require('../drv.cjs');
const WID='82537368-802c-4671-9cbc-9a420f36c903'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, r); await P.waitForTimeout(1300); };
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
const body = async (P) => (await P.innerText('body')).replace(/\s+/g,' ');
(async () => {
  for (const width of [390, 1280]) {
    const w = await open({ width, height: 800 }); const P = w.page;
    await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
    // A1: clicar no texto da data e depois em Salvar
    await go(P, '/w/'+WID+'/bens'); await P.click('[data-act=other-new][data-kind=bem]'); await P.fill('.modal [name=name]', 'A1 '+width); await P.fill('.modal [name=value]', '100');
    const box = await P.$eval('.modal [name=ref_date]', (i) => { const r = i.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; }); await P.mouse.click(box.x, box.y);
    console.log(width, 'A1 calendário aberto ao clicar no texto?', !!(await P.$('.cal')));
    await P.click('.modal button[type=submit]'); await P.waitForTimeout(1200); console.log(width, 'A1 salvo:', q("select ref_date from w_other where name='A1 "+width+"'"));
    // ícone abre o calendário
    await P.click('[data-act=other-new][data-kind=bem]'); const ib = await P.$eval('.modal [name=ref_date]', (i) => { const r = i.getBoundingClientRect(); return { x: r.right - 20, y: r.top + r.height / 2 }; }); await P.mouse.click(ib.x, ib.y); console.log(width, 'ícone abre calendário:', !!(await P.$('.cal'))); await P.keyboard.press('Escape');
    // A2: data impossível
    await P.fill('.modal [name=name]', 'A2 '+width); await P.fill('.modal [name=value]', '100'); await P.fill('.modal [name=ref_date]', '31/02/2025');
    await P.click('.modal button[type=submit]'); await P.waitForTimeout(1000);
    console.log(width, 'A2:', (await P.$eval('.modal .field-err', (e)=>e.textContent).catch(()=>'SEM ERRO NO CAMPO')), '| modal aberto:', !!(await P.$('.modal')), '| gravou:', q("select count(*) from w_other where name='A2 "+width+"'"));
    await P.fill('.modal [name=ref_date]', '12/03'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(800); console.log(width, 'A2 incompleta gravou:', q("select count(*) from w_other where name='A2 "+width+"'"));
    await P.click('.modal [data-act=modal-close]');
    // M1: transação com data impossível
    await go(P, '/w/'+WID+'/transacoes'); await P.click('#view button:has-text("Nova transação")'); await P.fill('.modal [name=date]', '31/02/2025'); await P.fill('.modal [name=asset_q]', 'PETR4'); await P.waitForTimeout(900); const o = await P.$('.modal [data-combo=asset] .combo-list [role=option], .modal [data-combo=asset] .combo-list button'); if (o) await o.click(); await P.fill('.modal [name=qty]', '1'); await P.fill('.modal [name=unit_price]', '10'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1000);
    console.log(width, 'M1:', (await body(P)).match(/Data inválida[^.]*\.|Algo deu errado[^.]*\./)?.[0]); await P.click('.modal [data-act=modal-close]').catch(()=>{});
    // invalid_reference pela RPC na página
    if (width === 1280) { const r = await P.evaluate(async ({ wid, fr }) => { const tx = (await W.rpc('w_spend_list', { p_wallet: wid, p_filters: {}, p_page: 1 })).rows[0].id; try { await W.rpc('w_spend_update', { p_wallet: wid, p_id: tx, p: { counterparty_id: fr } }); return 'ACEITOU'; } catch (e) { return e.message; } }, { wid: WID, fr: '9f6861c1-e5c6-4f8d-a425-42853cb3dd87' }); console.log('invalid_reference na tela:', r); }
    // B4 e B2
    await go(P, '/w/'+WID+'/acessos'); console.log(width, 'B4 select do titular desabilitado:', await P.$eval('select[data-role-user="a0000000-0000-4000-8000-000000000001"]', (s)=>s.disabled).catch(()=>'n/a'));
    await go(P, '/w/'+WID+'/gastos'); await P.click('[data-act=bank-del]'); await P.click('.modal [data-act=confirm-ok]'); await P.waitForTimeout(1000); console.log(width, 'B2 modal fechado após recusa:', !(await P.$('.modal')));
    console.log(width, 'erros:', w.errors); await w.close();
  }
  // M2: cobrança do Davi
  const w = await open({ width: 1280 }); const P = w.page; await w.go('#/entrar'); await P.fill('#email','davi.intruso@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  await go(P, '/carteiras/nova'); await P.click('[data-act=pay-request]'); await P.waitForTimeout(400);
  for (const [k, v] of [['doc','76321894087'],['zip','01310-100'],['street','Rua Exemplo'],['number','1'],['district','Centro'],['city','São Paulo']]) await P.fill('.modal [name='+k+']', v); await P.selectOption('.modal [name=state]','SP');
  await P.click('.modal button[type=submit]'); await P.waitForTimeout(1800); console.log('M2 confirmação:', (await P.innerText('.modal').catch(()=>'SEM MODAL')).replace(/\s+/g,' ').slice(0,80));
  console.log('erros:', w.errors); await w.close();
})();
