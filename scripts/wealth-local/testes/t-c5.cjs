const { open } = require('../drv.cjs'); const fs = require('fs');
const WID='680c3ff2-31af-4259-bfb3-5b0114466f01'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, r); await P.waitForTimeout(1300); };
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
(async () => {
  const w = await open({ width: 390, height: 844 }); const P = w.page;
  await w.go('#/entrar'); await P.fill('#email','ana.gestora@exemplo.com.br'); await P.fill('#password','senha-exemplo-1'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  await go(P, '/w/'+WID+'/gastos'); await P.click('[data-act=spend-imp-open]'); await P.waitForTimeout(400); await P.setInputFiles('.modal input[type=file]', '/tmp/claude-0/-home-user-lottusfinance/f8c4e172-3039-5828-90f4-993db0db5edc/scratchpad/wdb/fx/malicioso.csv'); await P.waitForTimeout(700); await P.click('.modal [data-go]'); await P.waitForTimeout(1500); await P.click('.modal [data-act=imp-done]').catch(()=>{});
  console.log('X5 aspas no banco:', q("select description from w_spend_tx where description like 'PADARIA%'"));
  await go(P, '/w/'+WID+'/relatorios');
  const forms = await P.$$('form[data-form=report]');
  for (const f of forms) { const kind = await f.getAttribute('data-kind'); const btn = await f.$('button[value=csv], button[type=submit]'); const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 8000 }).catch(()=>null), btn.click()]); if (!dl) { console.log(kind, 'sem download'); continue; } const pth = await dl.path(); const txt = fs.readFileSync(pth, 'utf8'); const lines = txt.split(/\r\n/);
    console.log('CSV', kind, '|', lines[0].slice(0,90)); if (kind === 'gastos') console.log('  X1:', lines.filter((l)=>/FORMULA|SUM/.test(l)).join(' || '), '| X2 decimal:', (lines.find((l)=>/CONTA DE LUZ/.test(l))||'').slice(0,80)); if (kind === 'posicao') console.log('  X2 posição:', lines.slice(1,3).join(' || ').slice(0,200)); }
  // V1: voltar com folha aberta
  await go(P, '/w/'+WID+'/transacoes'); await P.click('#view input.date-input[readonly]'); await P.waitForTimeout(300); await P.goBack(); await P.waitForTimeout(800); console.log('V1 calendário fechou ao voltar:', !(await P.$('.cal')));
  console.log('erros:', w.errors); await w.close();
  // X4 com Fund
  q("update w_profiles set plan='fund', payment_ok=true where user_id='a0000000-0000-4000-8000-000000000001'");
  const w2 = await open({ width: 1280 }); const P2 = w2.page; await w2.go('#/entrar'); await P2.fill('#email','ana.gestora@exemplo.com.br'); await P2.fill('#password','senha-exemplo-1'); await P2.click('button[type=submit]'); await P2.waitForTimeout(1200);
  await go(P2, '/carteiras'); await P2.click('[data-act=group-new]'); await P2.fill('.modal [name=name]', 'Grupo X4'); await P2.check('.modal input[name=w]'); await P2.click('.modal button[type=submit]'); await P2.waitForTimeout(1500);
  await P2.fill('[data-form=brand-save] [name=logo_url]', 'http://exemplo.com/logo.png'); await P2.click('[data-form=brand-save] button[type=submit]'); await P2.waitForTimeout(900);
  console.log('X4:', await P2.$eval('[data-form=brand-save] .field-err', (e)=>e.textContent).catch(()=>'sem erro no campo'), '| img na prévia:', await P2.$$eval('#gb-prev img', (i)=>i.length));
  console.log('erros:', w2.errors.filter((e)=>!/fonts/.test(e))); await w2.close();
})();
