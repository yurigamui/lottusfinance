const { open, overflow } = require('../drv.cjs');
const WID='0a49ea5a-d12f-4aa7-beda-96d05be0bcc9', DWID='88d5c33d-974f-4b96-b383-cf3ca5daa7d0'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, r); await P.waitForTimeout(1300); };
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
async function login(email, ctxOpts) { const w = await open({ width: 1280, ...ctxOpts }); await w.go('#/entrar'); await w.page.fill('#email', email); await w.page.fill('#password','senha-exemplo-1'); await w.page.click('button[type=submit]'); await w.page.waitForTimeout(1200); return w; }
(async () => {
  // estados vazios na carteira nova do Davi
  let w = await login('davi.intruso@exemplo.com.br'); let P = w.page;
  for (const r of ['patrimonio','bens','investimentos','posicao','transacoes','ativos','gastos','gastos/transacoes','gastos/cadastros','relatorios','acessos']) { await go(P, '/w/'+DWID+'/'+r); const t = (await P.innerText('#view')).replace(/\s+/g,' '); console.log('vazio', r.padEnd(18), /NaN|undefined|Infinity|null/.test(t) ? 'TEXTO-SUSPEITO ' : '', t.slice(0,150)); }
  // relatório CSV
  const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 8000 }).catch(()=>null), (async () => { await go(P, '/w/'+DWID+'/relatorios'); await P.click('form[data-form=report] button[value=csv], form[data-form=report] button[type=submit]'); })()]);
  console.log('download CSV carteira vazia:', dl ? dl.suggestedFilename() : 'NENHUM');
  // MFA e senha
  await go(P, '/conta'); await P.click('[data-act=mfa-on]'); await P.waitForTimeout(600);
  const boxes = await P.$$('.modal .otp-box'); for (const [i, b] of boxes.entries()) await b.type('999999'[i]); await P.click('.modal button[type=submit]'); await P.waitForTimeout(800); console.log('2FA código errado:', ((await P.innerText('body')).replace(/\s+/g,' ').match(/Código incorreto|Não deu certo.{0,40}/)||['(nada)'])[0]);
  for (const b of boxes) await b.fill(''); for (const [i, b] of boxes.entries()) await b.type('123456'[i]); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1200); console.log('2FA ativado:', (await P.innerText('#view')).replace(/\s+/g,' ').match(/Autenticação em duas etapas.{0,90}/)?.[0]);
  await P.fill('#np', 'nova-senha-exemplo-2'); await P.click('[data-form=newpass-in] button[type=submit]'); await P.waitForTimeout(1000); console.log('trocar senha:', ((await P.innerText('body')).replace(/\s+/g,' ').match(/Senha alterada|Não deu certo.{0,60}/)||['(nada)'])[0]);
  await P.click('#avatar'); await P.click('[data-act=logout]'); await P.waitForTimeout(800);
  await P.fill('#email','davi.intruso@exemplo.com.br'); await P.fill('#password','nova-senha-exemplo-2'); await P.click('button[type=submit]'); await P.waitForTimeout(1200);
  console.log('login com 2FA pede código?', ((await P.innerText('body')).replace(/\s+/g,' ').match(/Código do autenticador/)||['NÃO'])[0]);
  console.log('erros:', w.errors); await w.close();
  // ativo personalizado + plano Fund
  q("update w_profiles set plan='fund', payment_ok=true where user_id='a0000000-0000-4000-8000-000000000001'");
  w = await login('ana.gestora@exemplo.com.br'); P = w.page;
  await go(P, '/w/'+WID+'/ativos'); await P.click('[data-act=asset-new]'); await P.waitForTimeout(400);
  console.log('campos ativo:', await P.$$eval('.modal [name]', (e)=>e.map((x)=>x.name+':'+x.type).join(' ')));
  await go(P, '/white-label'); console.log('white-label Fund:', (await P.innerText('#view')).replace(/\s+/g,' ').slice(0,160));
  await P.click('[data-act=key-new]'); await P.fill('.modal [name=label]', 'Integração exemplo'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1200);
  const key = (await P.innerText('.modal')).replace(/\s+/g,' '); console.log('chave mostrada uma vez:', /wk_[A-Za-z0-9]/.test(key), '| no banco só hash:', q("select (key_hash !~ '^wk_')::text||' prefixo '||length(prefix) from w_api_keys"));
  await P.click('[data-act=key-done]'); await P.waitForTimeout(800);
  await go(P, '/carteiras'); console.log('grupos com Fund:', (await P.innerText('#view')).replace(/\s+/g,' ').match(/Grupos de carteiras.{0,80}/)?.[0]);
  console.log('erros:', w.errors); await w.close();
})();
