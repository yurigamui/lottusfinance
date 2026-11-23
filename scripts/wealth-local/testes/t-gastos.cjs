const { open, overflow } = require('../drv.cjs');
const WID='528dbed1-d0da-4e4a-9319-50f26bb4e49b'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, '/w/'+WID+'/'+r); await P.waitForTimeout(1300); };
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
const toast = async (P) => ((await P.innerText('body')).replace(/\s+/g,' ').match(/Não deu certo.{0,100}/) || [null])[0];
(async () => {
  const w = await open({ width: 1280 }); const P = w.page;
  await w.go('#/entrar'); await P.fill('#email','bruno.editor@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  for (const f of ['extrato.csv','extrato.ofx','extrato.csv']) {
    await go(P, 'gastos'); await P.click('[data-act=spend-imp-open]'); await P.waitForTimeout(500);
    await P.setInputFiles('.modal input[type=file]', require('path').resolve(__dirname, '../fx') + '/'+f); await P.waitForTimeout(800);
    console.log(f, 'prévia:', (await P.innerText('.modal')).replace(/\s+/g,' ').match(/\d+ linhas prontas[^.]*/)?.[0]);
    await P.click('.modal [data-go]'); await P.waitForTimeout(1500);
    console.log(f, 'resultado:', (await P.innerText('.modal')).replace(/\s+/g,' ').match(/\d+ lançamentos novos.{0,120}/)?.[0]);
    await P.click('.modal [data-act=imp-done]').catch(()=>{}); await P.waitForTimeout(500);
  }
  // classificar um lançamento como contraparte
  await go(P, 'gastos/transacoes');
  await P.click('#view [data-act=sp-edit]'); await P.waitForTimeout(500);
  const sels = await P.$$eval('.modal select', (s) => s.map((x) => x.name));
  console.log('edição: campos', sels.join(','));
  const opt = await P.$eval('.modal select[name=counterparty_id] option:nth-child(2)', (o) => o.value).catch(()=>null);
  if (opt) await P.selectOption('.modal select[name=counterparty_id]', opt);
  await P.click('.modal button[type=submit]'); await P.waitForTimeout(1200); console.log('classificar:', await toast(P) || 'ok', '| modal?', !!(await P.$('.modal')));
  // excluir conta com lançamentos
  await go(P, 'gastos'); const del = await P.$('[data-act=bank-del]'); if (del) { await del.click(); await P.waitForTimeout(1200); console.log('excluir conta com lançamentos:', await toast(P)); } else console.log('sem botão bank-del em gastos');
  // cadastros e regras
  await go(P, 'gastos/cadastros'); await P.click('[data-act=cad-new]'); await P.waitForTimeout(300); await P.fill('.modal [name=name]', 'Supermercado Exemplo'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1000); console.log('cadastro duplicado:', await toast(P) || 'aceito (sem erro)');
  await P.click('.modal [data-act=modal-close]').catch(()=>{});
  await P.click('[data-act=rules-apply]'); await P.waitForTimeout(1500); console.log('reaplicar regras:', await toast(P) || 'ok');
  console.log('banco: gastos', q("select count(*) from w_spend_tx"), '| imports', q("select string_agg(filename||':'||rows_new||'/'||rows_dup, ' ') from w_imports"));
  console.log('erros:', w.errors);
  await w.close();
})();
