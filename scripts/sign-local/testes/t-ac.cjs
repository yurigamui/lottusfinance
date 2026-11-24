// Critérios de aceite AC1 a AC12 e AC15 a AC19 da seção 1.1 (Sign / Entrar e criar conta), contra o Supabase falso.
const { open } = require('./drv.cjs');
const { check, t, done, hash, text, active, authCalls, login, PW } = require('./lib.cjs');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../../..');
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 6000 });
const NEUTRO = (e) => `Se este e-mail puder ser usado, enviamos um link de confirmação para ${e}. Abra o e-mail e volte para entrar. Se você já tem conta, entre ou use Esqueci a senha.`;
async function criar(p, { email, nome = 'Ana Teste', pw = 'uma-senha-longa', aceite = true }) {
  await p.fill('#email', email); await p.fill('#nome', nome); await p.fill('#senha', pw);
  if (aceite) await p.check('#aceite');
  await p.click('form button[type=submit]');
}

(async () => {
  await t('AC1 abertura em #/entrar', open, { width: 1280 }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    check('aba Entrar ativa', (await p.getAttribute('#tab-entrar', 'aria-selected')) === 'true');
    check('foco no E-mail', (await active(p)) === 'email');
    check('1 h1 "Entrar"', (await p.locator('h1').count()) === 1 && (await text(p, 'h1')) === 'Entrar');
    check('Esqueci a senha visível', await p.getByRole('link', { name: 'Esqueci a senha' }).isVisible());
    check('Verificar um documento visível', await p.getByRole('link', { name: 'Verificar um documento' }).isVisible());
    check('logo PNG', (await p.locator('#sign img').first().getAttribute('src')) === 'img/logo-rosa.png');
    check('título da aba', (await p.title()) === 'Entrar · Lottus Sign', await p.title());
    check('raiz do site abre #/entrar', await (async () => { await p.goto(d.origin + '/'); await p.waitForSelector('h1'); return (await hash(p)) === '' || (await text(p, 'h1')) === 'Entrar'; })());
    check('sem erros de JS/CSP', d.errors.length === 0, d.errors);
    await p.goto(d.origin + '/?q=1#/criar'); await p.waitForSelector('#nome');
    check('Criar: nenhum texto "null"/"undefined" perdido na tela', !/\bnull\b|undefined/.test(await text(p, '#sign')), await text(p, '#sign'));
  });

  await t('AC2 login com onboarding pendente', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await login(p, 'ok@teste.example', PW);
    await wait(p, () => location.hash === '#/onboarding/1');
    check('rota #/onboarding/1', (await hash(p)) === '#/onboarding/1');
    check('sign_me chamada', authCalls(d, /rpc\/sign_me/).length >= 1);
    check('tela provisória com Sair', (await text(p, 'h1')) === 'Em construção' && await p.getByRole('button', { name: 'Sair' }).isVisible());
  });

  await t('AC3 retorno à origem', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await p.evaluate(() => sessionStorage.setItem('lottus.sign.de', '#/envio/novo'));
    await login(p, 'pronto@teste.example', PW);
    await wait(p, () => location.hash === '#/envio/novo');
    check('vai a #/envio/novo', (await hash(p)) === '#/envio/novo');
  });
  await t('AC3 origem externa', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await p.evaluate(() => sessionStorage.setItem('lottus.sign.de', 'https://externo.com'));
    await login(p, 'pronto@teste.example', PW);
    await wait(p, () => location.hash === '#/documentos');
    check('vai a #/documentos', (await hash(p)) === '#/documentos');
    check('permaneceu no mesmo site', (await p.evaluate(() => location.origin)) === d.origin);
  });

  await t('AC4 erro idêntico: inexistente x senha errada', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    const grab = async () => ({ msg: await text(p, '[role=alert]'), where: await p.evaluate(() => { const e = document.querySelector('[role=alert] .sg-alert'); return e ? e.parentElement.getAttribute('role') + '|' + e.className : null; }), foco: await active(p) });
    await login(p, 'ninguem@teste.example', 'qualquer-senha-1'); await wait(p, () => document.querySelector('[role=alert] .sg-alert'));
    const a = await grab();
    await p.fill('#email', 'ok@teste.example'); await p.fill('#senha', 'errada-errada-1');
    await p.evaluate(() => document.querySelector('[role=alert]').replaceChildren());
    await p.click('form button[type=submit]'); await wait(p, () => document.querySelector('[role=alert] .sg-alert'));
    const b = await grab();
    check('texto "E-mail ou senha incorretos."', a.msg === 'E-mail ou senha incorretos.', a);
    check('mesmo texto', a.msg === b.msg, [a, b]);
    check('mesmo elemento', a.where === b.where, [a, b]);
    check('mesmo foco', a.foco === b.foco && a.foco === 'senha', [a, b]);
  });

  await t('AC5 validação sem rede', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await p.fill('#email', 'abc'); await p.fill('#senha', 'x'); await p.click('form button[type=submit]');
    check('erro de e-mail', (await text(p, '#email-err')) === 'Informe um e-mail válido.');
    check('foco no e-mail', (await active(p)) === 'email');
    await p.fill('#email', 'ok@teste.example'); await p.fill('#senha', ''); await p.click('form button[type=submit]');
    check('erro de senha vazia', (await text(p, '#senha-err')) === 'Informe a senha.');
    check('foco na senha', (await active(p)) === 'senha');
    check('nenhuma chamada de login', authCalls(d, /auth\/v1\/token/).length === 0);
  });

  await t('AC6 senha de 9 x 10 caracteres', open, {}, async (d) => {
    const p = d.page; await d.go('#/criar');
    await criar(p, { email: 'novo1@teste.example', pw: '123456789' });
    check('texto com Faltam 1', (await text(p, '#senha-err')) === 'A senha precisa ter pelo menos 10 caracteres. Faltam 1.', await text(p, '#senha-err'));
    check('foco na senha', (await active(p)) === 'senha');
    check('sem signUp', authCalls(d, /auth\/v1\/signup/).length === 0);
    await p.fill('#senha', '1234567890'); await p.click('form button[type=submit]');
    await p.waitForSelector('text=Confirme seu e-mail');
    check('com 10 há signUp', authCalls(d, /auth\/v1\/signup/).length === 1);
  });

  await t('AC7 aceite obrigatório e versões', open, {}, async (d) => {
    const p = d.page; await d.go('#/criar');
    await criar(p, { email: 'novo2@teste.example', aceite: false });
    check('erro do aceite', (await text(p, '#aceite-err')) === 'Aceite os Termos e a Política para criar a conta.');
    check('foco no aceite', (await active(p)) === 'aceite');
    check('sem signUp', authCalls(d, /auth\/v1\/signup/).length === 0);
    await p.check('#aceite'); await p.click('form button[type=submit]');
    await p.waitForSelector('text=Confirme seu e-mail');
    const s = authCalls(d, /auth\/v1\/signup/);
    check('corpo tem terms_version e privacy_version', s.length === 1 && !!s[0].body.data.terms_version && !!s[0].body.data.privacy_version, s[0] && s[0].body.data);
  });

  await t('AC8 cadastro novo x existente (neutro) e sem CPF/celular', open, {}, async (d) => {
    const p = d.page; await d.go('#/criar');
    await criar(p, { email: 'novo3@teste.example' });
    await p.waitForSelector('text=Confirme seu e-mail');
    const lead1 = await text(p, '.sg-lead');
    await p.goto(d.origin + '/?r=2#/criar'); await p.waitForSelector('#nome');
    await criar(p, { email: 'ok@teste.example' });
    await p.waitForSelector('text=Confirme seu e-mail');
    const lead2 = await text(p, '.sg-lead');
    check('texto neutro (novo)', lead1 === NEUTRO('novo3@teste.example'), lead1);
    check('texto neutro (existente)', lead2 === NEUTRO('ok@teste.example'), lead2);
    check('nenhum contém "já existe"', !/já existe/i.test(lead1 + lead2));
    const bodies = JSON.stringify(authCalls(d, /signup/).map((l) => l.body));
    check('signUp sem CPF nem celular', !/cpf|phone|celular|telefone/i.test(bodies), bodies.slice(0, 200));
    d.fake.state.mode.revealExisting = true;
    await p.goto(d.origin + '/?r=3#/criar'); await p.waitForSelector('#nome'); await criar(p, { email: 'ok@teste.example' });
    await p.waitForSelector('text=Confirme seu e-mail');
    check('mesmo texto se o Auth revelar "already registered"', (await text(p, '.sg-lead')) === NEUTRO('ok@teste.example'));
  });

  await t('AC9 reenvio: 60 s (padrão)', open, {}, async (d) => {
    const p = d.page; await d.go('#/criar');
    await criar(p, { email: 'novo4@teste.example' });
    await p.waitForSelector('text=Confirme seu e-mail');
    const b = p.getByRole('button', { name: /Reenviar/ });
    check('desligado com contagem de 60 s', await b.isDisabled() && /^Reenviar em (60|59) s$/.test(await b.innerText()), await b.innerText());
  });
  await t('AC9 reenvio: limite de 3/h e 429', open, { cfg: { resendCooldownMs: 1200 } }, async (d) => {
    const p = d.page; await d.go('#/criar');
    await criar(p, { email: 'novo5@teste.example' });
    await p.waitForSelector('text=Confirme seu e-mail');
    for (let i = 1; i <= 3; i++) {
      await p.getByRole('button', { name: 'Reenviar e-mail' }).click({ timeout: 5000 });
      await p.waitForSelector('text=Enviamos de novo. Verifique também a caixa de spam.');
      if (i < 3) await p.waitForSelector('button:has-text("Reenviar e-mail"):not([disabled])');
    }
    await p.waitForSelector('button:has-text("Reenviar e-mail"):not([disabled])');
    await p.getByRole('button', { name: 'Reenviar e-mail' }).click();
    await p.waitForSelector('text=Você atingiu o limite de reenvios. Tente em 1 hora.');
    check('4º reenvio mostra o limite', true);
    check('só 3 chamadas de resend', authCalls(d, /auth\/v1\/resend/).length === 3, authCalls(d, /auth\/v1\/resend/).length);
  });
  await t('AC9 reenvio: 429 do servidor', open, { cfg: { resendCooldownMs: 1200 } }, async (d) => {
    const p = d.page; await d.go('#/criar');
    await criar(p, { email: 'novo6@teste.example' });
    await p.waitForSelector('text=Confirme seu e-mail');
    d.fake.state.mode.rl429 = { resend: true };
    await p.waitForSelector('button:has-text("Reenviar e-mail"):not([disabled])');
    await p.getByRole('button', { name: 'Reenviar e-mail' }).click();
    await p.waitForSelector('text=Você atingiu o limite de reenvios. Tente em 1 hora.');
    check('429 vira o texto de limite', true);
  });

  await t('AC10 login de conta não confirmada', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await login(p, 'pendente@teste.example', PW);
    await p.waitForSelector('text=Confirme seu e-mail');
    check('texto exato', (await text(p, '.sg-lead')) === 'Confirme seu e-mail para continuar. Enviamos um link para pendente@teste.example.', await text(p, '.sg-lead'));
    check('botão Reenviar habilitado', await p.getByRole('button', { name: 'Reenviar e-mail' }).isEnabled());
    check('nenhuma sessão guardada', await p.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-/.test(k)).length === 0));
    await p.goto(d.origin + '/#/documentos'); await p.waitForSelector('h1');
    check('rota privada não abre (volta ao Entrar)', (await hash(p)) === '#/entrar' && (await text(p, 'h1')) === 'Entrar', await hash(p));
    check('com aviso de sessão', /Sua sessão terminou/.test(await text(p, '#sign')));
  });

  await t('AC11 link do e-mail (signup)', open, {}, async (d) => {
    const p = d.page; const tk = d.fake.mint('ok@teste.example');
    await p.goto(d.origin + '/#/entrar'); await p.waitForSelector('h1');
    await p.goto(d.origin + `/?x=1#access_token=${tk.access_token}&refresh_token=${tk.refresh_token}&expires_in=3600&token_type=bearer&type=signup`);
    await wait(p, () => location.hash === '#/onboarding/1');
    const u = p.url();
    check('hash apagado (sem token na URL)', !/access_token|refresh_token/.test(u), u);
    check('resultado #/onboarding/1', (await hash(p)) === '#/onboarding/1');
    check('sem "rota desconhecida"', !/não encontramos|não encontrada/i.test(await text(p, '#sign')));
    await p.goBack(); await p.waitForTimeout(400);
    check('Voltar não reabre o hash', !/access_token/.test(p.url()), p.url());
  });
  await t('AC11 link vencido', open, {}, async (d) => {
    const p = d.page;
    await p.goto(d.origin + '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await p.waitForSelector('h1');
    check('texto de link vencido', /Este link venceu ou já foi usado\. Peça um novo\./.test(await text(p, '#sign')));
    check('botão Reenviar e-mail', await p.getByRole('button', { name: 'Reenviar e-mail' }).isVisible());
    check('hash limpo e na tela Entrar', (await hash(p)) === '#/entrar' && !/error/.test(p.url()), p.url());
    await p.fill('#email', 'ok@teste.example');
    await p.getByRole('button', { name: 'Reenviar e-mail' }).click();
    await p.waitForSelector('text=Enviamos de novo. Verifique também a caixa de spam.');
    check('reenvio a partir do link vencido', authCalls(d, /resend/).length === 1);
  });

  await t('AC12 link de recuperação', open, {}, async (d) => {
    const p = d.page; const tk = d.fake.mint('ok@teste.example');
    await p.goto(d.origin + `/#access_token=${tk.access_token}&refresh_token=${tk.refresh_token}&type=recovery`);
    await wait(p, () => location.hash === '#/nova-senha');
    check('vai a #/nova-senha', (await hash(p)) === '#/nova-senha');
    check('sem formulário de entrar', (await p.locator('#email').count()) === 0 && (await p.locator('#senha').count()) === 0);
    check('tela provisória com saída', (await p.getByRole('button', { name: 'Sair' }).count()) === 1);
  });

  await t('AC15 sessão válida e saída em outra aba', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await login(p, 'pronto@teste.example', PW);
    await wait(p, () => location.hash === '#/documentos');
    await p.goto(d.origin + '/#/entrar'); await p.waitForSelector('h1');
    await wait(p, () => location.hash === '#/documentos');
    check('redireciona sem mostrar o formulário', (await p.locator('#email').count()) === 0 && (await hash(p)) === '#/documentos');
    await p.goto(d.origin + '/#/criar'); await wait(p, () => location.hash === '#/documentos');
    check('#/criar também redireciona', (await hash(p)) === '#/documentos');
    const p2 = await d.ctx.newPage(); await p2.goto(d.origin + '/#/entrar');
    await p2.evaluate(() => { Object.keys(localStorage).filter((k) => /^sb-/.test(k)).forEach((k) => localStorage.removeItem(k)); });
    await wait(p, () => location.hash === '#/entrar');
    check('SIGNED_OUT de outra aba leva a #/entrar', (await hash(p)) === '#/entrar');
  });
  await t('AC15 Sair da tela provisória', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar'); await login(p, 'pronto@teste.example', PW);
    await wait(p, () => location.hash === '#/documentos');
    await p.getByRole('button', { name: 'Sair' }).click();
    await wait(p, () => location.hash === '#/entrar'); await p.waitForSelector('#email');
    check('Sair volta ao Entrar, formulário limpo', (await p.inputValue('#email')) === '' && (await p.locator('h1').innerText()) === 'Entrar');
  });

  await t('AC16 teclado, foco, título, aria', open, { width: 1280 }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    check('ordem de Tab: e-mail, senha, mostrar, entrar, esqueci, verificar', await (async () => {
      const seq = [await active(p)];
      for (let i = 0; i < 5; i++) { await p.keyboard.press('Tab'); seq.push(await active(p)); }
      check('  ordem real', true); d.seq = seq; return JSON.stringify(seq) === JSON.stringify(['email', 'senha', 'button:Mostrar', 'button:Entrar', 'a:Esqueci a senha', 'a:Verificar um documento']);
    })(), d.seq);
    await p.focus('#email'); await p.keyboard.press('Shift+Tab');
    check('Shift+Tab chega à aba selecionada', (await active(p)) === 'tab-entrar', await active(p));
    await p.keyboard.press('ArrowRight');
    await wait(p, () => location.hash === '#/criar' && document.activeElement.id === 'tab-criar');
    check('seta troca para Criar conta', (await p.getAttribute('#tab-criar', 'aria-selected')) === 'true' && (await active(p)) === 'tab-criar', await active(p));
    check('título muda', (await p.title()) === 'Criar conta · Lottus Sign', await p.title());
    await p.keyboard.press('ArrowLeft'); await wait(p, () => location.hash === '#/entrar' && document.activeElement.id === 'tab-entrar');
    check('seta volta para Entrar', (await p.getAttribute('#tab-entrar', 'aria-selected')) === 'true');
    await p.focus('#email'); await p.keyboard.press('Enter');
    check('Enter envia: erro e foco no primeiro campo inválido', (await active(p)) === 'email' && (await p.getAttribute('#email', 'aria-invalid')) === 'true');
    check('aria-describedby liga o erro', /email-err/.test(await p.getAttribute('#email', 'aria-describedby')));
    check('main sem aria-live', (await p.locator('main[aria-live], #sign[aria-live]').count()) === 0);
    check('aria-live só na região de mensagens', await p.evaluate(() => [...document.querySelectorAll('[aria-live]')].every((e) => e.classList.contains('sg-msg') || e.closest('.sg-msg'))));
    await p.fill('#email', 'pronto@teste.example'); await p.fill('#senha', PW); await p.keyboard.press('Enter');
    await wait(p, () => location.hash === '#/documentos');
    await p.waitForTimeout(200);
    check('rota nova: foco no h1', (await p.evaluate(() => document.activeElement && document.activeElement.tagName)) === 'H1');
    check('rota nova: <title> muda', (await p.title()) === 'Em construção · Lottus Sign', await p.title());
  });

  await t('AC17 rede fora do ar', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    d.fake.state.mode.down = true;
    await login(p, 'ok@teste.example', PW);
    await p.waitForSelector('text=Não foi possível concluir agora. Verifique sua conexão.', { timeout: 10000 });
    check('botão volta ao normal', (await p.locator('form button[type=submit]').isEnabled()) && (await p.locator('form button[type=submit]').getAttribute('aria-busy')) === null);
    check('Tentar de novo presente', await p.getByRole('button', { name: 'Tentar de novo' }).isVisible());
    check('e-mail preservado', (await p.inputValue('#email')) === 'ok@teste.example');
    check('senha limpa', (await p.inputValue('#senha')) === '');
    d.fake.state.mode.down = false;
    await p.fill('#senha', PW); await p.getByRole('button', { name: 'Tentar de novo' }).click();
    await wait(p, () => location.hash === '#/onboarding/1');
    check('Tentar de novo conclui quando a rede volta', true);
  });
  await t('AC17 atraso (tempo limite)', open, { cfg: { timeoutMs: 1000 } }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    d.fake.state.mode.delay = 4000;
    await login(p, 'ok@teste.example', PW);
    await p.waitForSelector('text=Não foi possível concluir agora. Verifique sua conexão.', { timeout: 8000 });
    check('atraso vira erro de rede', true);
    check('digitado preservado e senha limpa', (await p.inputValue('#email')) === 'ok@teste.example' && (await p.inputValue('#senha')) === '');
    check('botão normal', await p.locator('form button[type=submit]').isEnabled());
  });
  await t('AC17 429 no login', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar'); d.fake.state.mode.rl429 = { token: true };
    await login(p, 'ok@teste.example', PW);
    await p.waitForSelector('text=Muitas tentativas. Aguarde alguns minutos e tente de novo, ou use Esqueci a senha.');
    check('texto de Muitas tentativas', true);
  });

  await t('AC18 segurança: senha fora de storage, URL e console', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await login(p, 'ok@teste.example', 'errada-errada-1'); await p.waitForSelector('[role=alert] .sg-alert');
    await login(p, 'ok@teste.example', PW); await wait(p, () => location.hash === '#/onboarding/1');
    const stor = await p.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
    check('senha ausente do storage', !stor.includes(PW) && !stor.includes('errada-errada-1'));
    check('senha ausente da URL', !p.url().includes(PW));
    check('senha ausente do console', !d.consoleAll.join(' ').includes(PW));
    check('senha ausente das URLs chamadas', !d.fake.state.log.some((l) => (l.path + l.query).includes(PW)));
    check('sem erros de JS/CSP', d.errors.length === 0, d.errors);
    check('nenhuma rede externa além do Supabase e fontes', d.external.length === 0, d.external);
  });
  (() => {
    const out = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts/check.mjs')], { encoding: 'utf8' }).stdout;
    const sign = out.split('\n').filter((l) => /apps\/sign|scripts\/sign-local/.test(l) && /ERRO|AVISO/.test(l));
    check('AC18 check.mjs sem erros no Sign', sign.length === 0, sign);
    const src = ['index.html', 'js/app.js', ...fs.readdirSync(path.join(ROOT, 'apps/sign/js/lib')).map((f) => 'js/lib/' + f), ...fs.readdirSync(path.join(ROOT, 'apps/sign/js/views')).map((f) => 'js/views/' + f)];
    const bad = src.filter((f) => { const s = fs.readFileSync(path.join(ROOT, 'apps/sign', f), 'utf8'); return /style\s*=\s*"|setAttribute\(\s*'style'|\.style\.|innerHTML|<script(?![^>]*\bsrc=)/.test(s); });
    check('AC18 sem <script> inline, style="" nem innerHTML nas views/libs', bad.length === 0, bad);
    const diff = cp.spawnSync('git', ['diff', '--stat', '--', 'apps/sign/_headers'], { cwd: ROOT, encoding: 'utf8' }).stdout;
    check('AC18 CSP (_headers) inalterada', diff.trim() === '', diff);
  })();

  await t('AC19 marca', open, {}, async (d) => {
    const p = d.page; await d.go('#/entrar');
    check('logo = img/logo-rosa.png, alt Lottus', (await p.locator('#sign img').evaluateAll((l) => l.map((i) => i.getAttribute('src') + '|' + i.alt))).join() === 'img/logo-rosa.png|Lottus');
    check('favicon = img/mark-rosa.png', (await p.getAttribute('link[rel=icon]', 'href')) === 'img/mark-rosa.png');
    check('h1 sem "Lottus Sign"', !/Lottus Sign/.test(await text(p, 'h1')));
    check('corpo sem "Lottus Sign" em texto', !/Lottus Sign/.test(await text(p, '#sign')));
  });

  done();
})();
