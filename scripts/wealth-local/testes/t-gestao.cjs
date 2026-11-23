const { open } = require('../drv.cjs');
const WID='ec2de329-7fef-4cc8-9a74-695d5eba18b4'; const go = async (P, r) => { await P.evaluate((h)=>{location.hash=h}, r); await P.waitForTimeout(1300); };
const msg = async (P) => ((await P.innerText('body')).replace(/\s+/g,' ').match(/Não deu certo.{0,100}|Convite enviado.{0,160}|Alçada alterada|Acesso removido.{0,40}/) || ['(sem mensagem)'])[0];
const q = (s) => require('child_process').execSync(`psql -X -h 127.0.0.1 -p 54340 -U postgres -d wealth -tAc "${s}"`).toString().trim();
async function login(email) { const w = await open({ width: 1280 }); await w.go('#/entrar'); await w.page.fill('#email', email); await w.page.fill('#password','senha-exemplo-1'); await w.page.click('button[type=submit]'); await w.page.waitForTimeout(1200); return w; }
(async () => {
  let w = await login('ana.gestora@exemplo.com.br'); let P = w.page;
  const invite = async (name, cpf, email, role) => { await go(P, '/w/'+WID+'/acessos'); await P.click('[data-act=invite-new]'); await P.waitForTimeout(300); await P.fill('.modal [name=name]', name); await P.fill('.modal [name=cpf]', cpf); await P.fill('.modal [name=email]', email); await P.selectOption('.modal [name=role]', role); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1300); const m = await msg(P); await P.click('.modal [data-act=modal-close], .modal [data-act=invite-done]').catch(()=>{}); return m; };
  console.log('convite CPF com conta (e-mail digitado diferente):', await invite('Davi', '763.218.940-87', 'outro@exemplo.com.br', 'visualizador'));
  console.log('e-mail que recebeu:', q("select email from w_invites where cpf like '%76321894087%' or lower(email) like 'davi%'"), '| caixa de saída:', q("select count(*)||' e-mail(s) para '||string_agg(distinct to_addr, ',') from email_outbox"));
  console.log('convite repetido:', await invite('Davi', '763.218.940-87', 'outro@exemplo.com.br', 'editor'));
  console.log('convite CPF inválido:', await invite('Fulano', '123.456.789-00', 'fulano@exemplo.com.br', 'editor'));
  await go(P, '/w/'+WID+'/acessos');
  await P.selectOption('select[data-role-user="b0000000-0000-4000-8000-000000000002"]', 'visualizador'); await P.waitForTimeout(1300); console.log('rebaixar Bruno:', await msg(P), '->', q("select role from w_members where user_id='b0000000-0000-4000-8000-000000000002'"));
  const me = await P.$('select[data-role-user="a0000000-0000-4000-8000-000000000001"]'); if (me) { await me.selectOption('editor'); await P.waitForTimeout(1300); console.log('titular se rebaixar:', await msg(P)); } else console.log('titular: sem seletor de alçada para si mesma');
  await go(P, '/w/'+WID+'/acessos'); await P.click('[data-act=member-rm][data-id="c0000000-0000-4000-8000-000000000003"]'); await P.waitForTimeout(300); await P.click('.modal [data-act=confirm-ok]'); await P.waitForTimeout(1300); console.log('remover Carla:', await msg(P), '| membros:', q("select count(*) from w_members where wallet_id='"+WID+"'"));
  await go(P, '/w/'+WID+'/config'); await P.fill('[data-form=wallet-edit] [name=name]', 'X'); await P.click('[data-form=wallet-edit] button[type=submit]'); await P.waitForTimeout(1000); console.log('renomear para 1 letra:', await msg(P));
  await go(P, '/carteiras/nova'); console.log('2ª carteira, botão criar desabilitado?', await P.$eval('[data-form=wallet-new] button[type=submit]', (b)=>b.disabled));
  await P.click('[data-act=pay-request]'); await P.waitForTimeout(500);
  const fill = async (k, v) => P.fill('.modal [name='+k+']', v);
  await fill('doc','529.982.247-25'); await fill('zip','123'); await fill('street','Rua Exemplo'); await fill('number','10'); await fill('district','Centro'); await fill('city','São Paulo'); await P.selectOption('.modal [name=state]','SP');
  await P.click('.modal button[type=submit]'); await P.waitForTimeout(1200); console.log('CEP inválido:', await msg(P));
  await fill('zip','01310-100'); await P.click('.modal button[type=submit]'); await P.waitForTimeout(1500); console.log('cobrança salva:', (await P.innerText('.modal').catch(()=> '')).replace(/\s+/g,' ').slice(0,140));
  console.log('erros:', w.errors); await w.close();
  w = await login('bruno.editor@exemplo.com.br'); P = w.page; await go(P, '/w/'+WID+'/acessos'); await P.click('[data-act=wallet-leave]'); await P.waitForTimeout(300); await P.click('.modal [data-act=confirm-ok]'); await P.waitForTimeout(1300);
  console.log('Bruno sai:', await P.evaluate(()=>location.hash), '| membros:', q("select count(*) from w_members where wallet_id='"+WID+"'")); console.log('erros:', w.errors); await w.close();
})();
