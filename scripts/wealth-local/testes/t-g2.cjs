const { open } = require('../drv.cjs');
(async () => {
  const w = await open({ width: 1280 }); const P = w.page;
  await w.go('#/entrar'); await P.fill('#email','bruno.editor@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  await P.evaluate((h)=>{location.hash=h}, '/w/1a3be775-ba9c-4d55-b0a6-6b0a23d0a020/gastos'); await P.waitForTimeout(1200);
  await P.click('[data-act=spend-imp-open]'); await P.waitForTimeout(500); await P.setInputFiles('.modal input[type=file]', require('path').resolve(__dirname, '../fx') + '/extrato.csv'); await P.waitForTimeout(800);
  console.log('prévia com 31/02:', (await P.innerText('.modal')).replace(/\s+/g,' ').match(/\d+ linhas prontas[^I]*/)?.[0]);
  await P.click('.modal [data-act=modal-close]');
  await P.click('[data-act=bank-del]'); await P.waitForTimeout(400); console.log('confirmação:', (await P.innerText('.modal')).replace(/\s+/g,' ').slice(0,120));
  await P.click('.modal [data-act=confirm-ok]'); await P.waitForTimeout(1200);
  console.log('resultado:', ((await P.innerText('body')).replace(/\s+/g,' ').match(/Não deu certo.{0,80}|Conta excluída.{0,30}/) || ['(nada)'])[0]);
  console.log('erros:', w.errors); await w.close();
})();
