// Seção 1.2 (Recuperar senha) + pacote C2-13 (tela): AC1 a AC19 e AC-R2 a AC-R6, em Playwright contra o Supabase falso.
// Recuperar e Nova senha rodam no Auth em memória (fake-sign.cjs: recover, PUT user, logout scope, emissor de link). As provas do pacote C2-13
// (onboarding, topo, Perfil) rodam em repasse ao Postgres local ISOLADO (SIGN_DB e SIGN_DB_ANTES SEMPRE exportados; nunca o "sign" compartilhado). Nada em produção.
// Uso: SIGN_DB=sign_c2 SIGN_DB_ANTES=sign_c2_antes [SHOTS=<pasta>] [ONLY=<regex>] node t-senha.cjs   (recria o banco no início e no fim)
const { open, overflow } = require('./drv.cjs');
const { check, t: t0, done, hash, text, login, PW } = require('./lib.cjs');
if (!process.env.SIGN_DB || !process.env.SIGN_DB_ANTES) { console.error('defina SIGN_DB e SIGN_DB_ANTES (bancos isolados; nunca o "sign" compartilhado)'); process.exit(2); }
const ONLY = process.env.ONLY;
const t = (name, ...r) => (ONLY && !new RegExp(ONLY).test(name) ? Promise.resolve() : t0(name, ...r));
const { reset, DB } = require('./perfil-lib.cjs');
const { mk } = require('./onb-lib.cjs');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const SHOTS = process.env.SHOTS || '/tmp/sign-shots-senha';
fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.resolve(__dirname, '../../..');
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 8000 });
const PG = { pg: DB };
const q = async (d, sql, a) => (await d.fake.query(sql, a)).rows;
const NEW = 'minha-senha-nova-123';
const h1 = (p) => text(p, '#sign h1');
let zn = 0;
const zera = async (d) => { await d.page.goto(d.origin + '/#/entrar'); await d.page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await d.page.goto(d.origin + '/?z=' + (++zn) + '#/entrar'); await d.page.waitForSelector('#senha'); }; /* navegador sem sessão e sem marcadores */
const novaPagina = async (d, email = 'pronto@teste.example', o) => { /* abre o link de recuperação do e-mail e espera a tela */
  await d.page.goto(d.origin + '/' + d.fake.recoveryHash(email, o)); await d.page.waitForSelector('#sign h1');
};
const preencher = async (p, a, b) => { await p.fill('#nova', a); await p.fill('#confirma', b === undefined ? a : b); };
const puts = (d) => d.fake.state.log.filter((l) => l.method === 'PUT' && l.path === '/auth/v1/user').length;
const tocar = (p) => p.evaluate(() => { /* alvos de toque < 44 px em botões, links e campos visíveis do cartão */
  const out = [];
  for (const e of document.querySelectorAll('#sign button, #sign a[href], #sign input:not([type=hidden])')) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[hidden]')) continue;
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
    if (b.width < 43.5 || b.height < 43.5) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
  }
  return out;
});
const svgs = (p) => p.evaluate(() => [...document.querySelectorAll('.banner svg, .toast svg, .empty svg, .sg-alert svg')].map((s) => { const b = s.getBoundingClientRect(); return Math.round(Math.max(b.width, b.height)); }));

(async () => {
  console.info('recriando banco local isolado...'); reset('depois');

  // ================================================================================================ Recuperar
  await t('AC1 AC2 AC3 enviar link: chamada, tela neutra idêntica, e-mail do Entrar', open, { width: 390 }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await p.fill('#email', 'Pronto@Teste.Example '); await p.getByRole('link', { name: 'Esqueci a senha' }).click();
    await wait(p, () => location.hash === '#/recuperar' && document.querySelector('h1') && document.querySelector('h1').textContent === 'Recuperar senha');
    check('AC3 o campo vem preenchido (normalizado), a URL não contém o e-mail e rec_email já foi apagado', (await p.inputValue('#email')) === 'pronto@teste.example' && !/pronto|teste\.example/i.test(p.url()) && (await p.evaluate(() => sessionStorage.getItem('lottus.sign.rec_email'))) === null, [await p.inputValue('#email'), p.url()]);
    check('título da tela "Recuperar senha", apoio exato e botão "Enviar link"', (await h1(p)) === 'Recuperar senha' && (await text(p, '.sg-lead')) === 'Informe o e-mail da sua conta. Se ele puder ser usado, enviamos um link para criar uma nova senha.' && (await p.getByRole('button', { name: 'Enviar link' }).count()) === 1);
    check('título da aba "Recuperar senha · Lottus Sign" e foco no h1', (await p.title()) === 'Recuperar senha · Lottus Sign' && (await p.evaluate(() => document.activeElement.tagName)) === 'H1', await p.title());
    await p.click('form button[type=submit]'); await p.waitForSelector('text=Verifique seu e-mail');
    const c = d.fake.state.calls.recover;
    check('AC1 POST /auth/v1/recover com o e-mail e redirect_to = origin + pathname', c.length === 1 && c[0].email === 'pronto@teste.example' && c[0].redirect_to === d.origin + '/', c);
    check('AC1 tela neutra: título, corpo exato, "Reenviar" e "Usar outro e-mail"', (await h1(p)) === 'Verifique seu e-mail' && (await text(p, '.sg-lead')) === 'Se este e-mail puder ser usado, enviamos o link. Ele vale por tempo limitado. Veja também a caixa de spam.' && (await p.getByRole('button', { name: /^Reenviar/ }).count()) === 1 && (await p.getByRole('button', { name: 'Usar outro e-mail' }).count()) === 1);
    check('a tela neutra não repete o e-mail digitado', !/pronto@teste/.test(await text(p, '#sign')));
    let nav = 0;
    const neutra = async () => (await p.locator('#sign').innerHTML()).replace(/0:\d\d/g, '0:SS');
    const base = await neutra();
    for (const [rot, email, modo] of [['e-mail inexistente', 'naoexiste@teste.example', {}], ['revealExisting + inexistente (4xx user_not_found)', 'naoexiste@teste.example', { revealExisting: true }], ['e-mail existente com revealExisting', 'pronto@teste.example', { revealExisting: true }]]) {
      await p.goto(d.origin + '/?r=' + (++nav) + '#/recuperar'); await p.waitForSelector('#email'); await p.evaluate(() => sessionStorage.clear()); d.fake.state.mode = modo;
      await p.fill('#email', email); await p.click('form button[type=submit]'); await p.waitForSelector('text=Verifique seu e-mail');
      check(`AC2 ${rot}: HTML da tela idêntico ao do e-mail existente, byte a byte`, (await neutra()) === base);
    }
    check('AC2 o fake respondeu 400 user_not_found em um dos casos (a tela mesmo assim foi neutra)', d.fake.state.calls.recover.length === 4);
    await p.getByRole('button', { name: 'Usar outro e-mail' }).click();
    check('"Usar outro e-mail" volta ao formulário com o campo vazio e foco no título', (await h1(p)) === 'Recuperar senha' && (await p.inputValue('#email')) === '');
    check('sem erro de JS/CSP e sem requisição externa', d.errors.length === 0 && d.external.length === 0, [d.errors, d.external]);
  });

  await t('AC4 reenviar: contagem de 60 s com relógio simulado e limite de 3 por hora sem rede', open, { width: 390 }, async (d) => {
    const p = d.page; await p.clock.install(); await d.go('#/recuperar');
    await p.fill('#email', 'pronto@teste.example'); await p.click('form button[type=submit]'); await p.waitForSelector('text=Verifique seu e-mail');
    const re = p.getByRole('button', { name: /^Reenviar/ });
    check('AC4 "Reenviar" desabilitado com a contagem "Reenviar em 0:SS"', (await re.isDisabled()) && /^Reenviar em 0:(59|58|57)$/.test((await re.innerText()).trim()), await re.innerText());
    await p.clock.fastForward(30000);
    check('AC4 aos 30 s continua desabilitado e a contagem andou', (await re.isDisabled()) && /^Reenviar em 0:(29|28|30|31)$/.test((await re.innerText()).trim()), await re.innerText());
    await p.clock.fastForward(31000);
    check('AC4 aos 61 s libera, com o texto "Reenviar"', (await re.isEnabled()) && (await re.innerText()).trim() === 'Reenviar', await re.innerText());
    await re.click(); await p.waitForSelector('text=Enviamos de novo. Verifique também a caixa de spam.');
    check('AC4 2º pedido enviado e o botão volta a contar', d.fake.state.calls.recover.length === 2 && (await re.isDisabled()));
    await p.clock.fastForward(61000); await re.click(); await p.waitForTimeout(200);
    check('AC4 3º pedido enviado (limite de 3 links por hora)', d.fake.state.calls.recover.length === 3);
    await p.clock.fastForward(61000); await re.click();
    await p.waitForSelector('text=/Você já pediu 3 links\\. Tente de novo em \\d+ min\\./');
    check('AC4 no 4º pedido (3º reenvio) aparece o limite SEM chamar a rede', d.fake.state.calls.recover.length === 3, d.fake.state.calls.recover.length);
    check('AC4 o texto de limite diz os minutos que faltam (1 a 60)', await (async () => { const m = /em (\d+) min/.exec(await text(p, '.sg-msg')); return m && +m[1] >= 1 && +m[1] <= 60; })(), await text(p, '.sg-msg'));
    const n = await p.evaluate(() => JSON.parse(sessionStorage.getItem('lottus.sign.rec_n') || '[]'));
    check('rec_n em sessionStorage guarda só carimbos de hora (3 números)', n.length === 3 && n.every((x) => typeof x === 'number'), n);
    check('o limite continua depois de recarregar a página (vem de sessionStorage)', await (async () => { await p.reload(); await p.waitForSelector('#sign h1'); await p.fill('#email', 'pronto@teste.example'); await p.click('form button[type=submit]'); await p.waitForSelector('text=/Você já pediu 3 links/'); return d.fake.state.calls.recover.length === 3; })());
  });

  await t('AC5 AC6 429 do Auth e rede caída (e validação do campo)', open, { width: 390, cfg: { timeoutMs: 1500 } }, async (d) => {
    const p = d.page; await d.go('#/recuperar');
    await p.click('form button[type=submit]');
    check('campo vazio: "Informe seu e-mail." e foco no campo, sem chamada', (await text(p, '#email-err')) === 'Informe seu e-mail.' && (await p.evaluate(() => document.activeElement.id)) === 'email' && d.fake.state.calls.recover.length === 0);
    await p.fill('#email', 'isso-nao-e-email'); await p.click('form button[type=submit]');
    check('e-mail inválido: "Confira o e-mail digitado."', (await text(p, '#email-err')) === 'Confira o e-mail digitado.' && d.fake.state.log.filter((l) => /recover/.test(l.path)).length === 0);
    await p.fill('#email', 'pronto@teste.example'); d.fake.state.mode.rl429 = { recover: true };
    await p.click('form button[type=submit]'); await p.waitForSelector('text=/Você já pediu 3 links/');
    check('AC5 429: texto de limite (sem expor a causa) e o botão volta a "Enviar link"', (await p.getByRole('button', { name: 'Enviar link' }).isEnabled()) && !/429|rate|limit exceeded/i.test(await text(p, '#sign')));
    d.fake.state.mode = { down: true };
    await p.click('form button[type=submit]'); await p.waitForSelector('text=Sem conexão. Verifique a internet e tente de novo.', { timeout: 9000 });
    check('AC6 rede caída: texto de rede, o digitado é mantido e o botão volta', (await p.inputValue('#email')) === 'pronto@teste.example' && (await p.getByRole('button', { name: 'Enviar link' }).isEnabled()));
    d.fake.state.mode = {};
    await p.click('form button[type=submit]'); await p.waitForSelector('text=Verifique seu e-mail');
    check('depois que a rede volta, o mesmo formulário envia (sem beco)', true);
  });

  // ================================================================================================ Nova senha
  await t('AC7 AC8 AC9 AC10 link válido, validação, olho, senha fora de lugares proibidos, duplo clique', open, { width: 390 }, async (d) => {
    const p = d.page;
    await novaPagina(d, 'pronto@teste.example');
    await wait(p, () => location.hash === '#/nova-senha');
    check('AC7 hash apagado da URL (sem tokens) e rota #/nova-senha', !/access_token|refresh_token|type=recovery/.test(p.url()) && (await hash(p)) === '#/nova-senha', p.url());
    check('AC7 título "Criar nova senha", rótulos e botão exatos', (await h1(p)) === 'Criar nova senha' && (await p.locator('label[for=nova]').innerText()) === 'Nova senha' && (await p.locator('label[for=confirma]').innerText()) === 'Confirmar nova senha' && (await p.getByRole('button', { name: 'Salvar nova senha' }).count()) === 1);
    check('AC7 campos com autocomplete="new-password" e foco no título', (await p.getAttribute('#nova', 'autocomplete')) === 'new-password' && (await p.getAttribute('#confirma', 'autocomplete')) === 'new-password' && (await p.evaluate(() => document.activeElement.tagName)) === 'H1');
    check('AC7 existe "Voltar ao Entrar"; título da aba', (await p.getByRole('link', { name: 'Voltar ao Entrar' }).count()) === 1 && (await p.title()) === 'Criar nova senha · Lottus Sign');
    check('marcador rec_ok em sessionStorage (só "1", sem segredo) e nenhum token em storage de sessão', (await p.evaluate(() => sessionStorage.getItem('lottus.sign.rec_ok'))) === '1' && !/eyJ|access/.test(await p.evaluate(() => JSON.stringify(sessionStorage))));
    // AC8
    await p.fill('#nova', 'abcdefghi');
    check('AC8 9 caracteres: "Falta 1 caractere" (singular)', (await text(p, '.sg-count')) === 'Falta 1 caractere', await text(p, '.sg-count'));
    await p.fill('#nova', 'abc');
    check('AC8 3 caracteres: "Faltam 7 caracteres"; o medidor mostra "Fraca"', (await text(p, '.sg-count')) === 'Faltam 7 caracteres' && /Fraca/.test(await text(p, '.sg-meter')), [await text(p, '.sg-count'), await text(p, '.sg-meter')]);
    await p.fill('#nova', 'abcdefghi'); await p.fill('#confirma', 'abcdefghi'); await p.click('form button[type=submit]');
    check('AC8 9 caracteres: o botão não envia (0 PUT) e o foco vai ao campo', puts(d) === 0 && (await p.evaluate(() => document.activeElement.id)) === 'nova' && (await p.getAttribute('#nova', 'aria-invalid')) === null);
    await p.fill('#nova', 'abcdefghij'); await p.fill('#confirma', 'abcdefghiX');
    check('AC8 10 caracteres e confirmação diferente: "As senhas não são iguais."', (await text(p, '#confirma-err')) === 'As senhas não são iguais.', await text(p, '#confirma-err'));
    await p.click('form button[type=submit]');
    check('AC8 com confirmação diferente o botão não envia e o foco vai à confirmação', puts(d) === 0 && (await p.evaluate(() => document.activeElement.id)) === 'confirma');
    for (const [pw, nivel] of [['abcdefghij', 'Fraca'], ['abcdefghijkl', 'Média'], ['Abcdefghij12345!', 'Forte']]) { await p.fill('#nova', pw); check(`medidor: "${pw.length} caracteres" mostra ${nivel} (texto, não só cor)`, new RegExp('Força da senha: ' + nivel).test(await text(p, '.sg-meter')), await text(p, '.sg-meter')); }
    // AC9
    const tg = p.locator('.sg-toggle').first();
    check('AC9 olho: texto "Mostrar senha", aria-pressed=false, tipo password', (await tg.innerText()) === 'Mostrar senha' && (await tg.getAttribute('aria-pressed')) === 'false' && (await p.getAttribute('#nova', 'type')) === 'password');
    await tg.click();
    check('AC9 1º clique: tipo text, aria-pressed=true, "Ocultar senha"', (await p.getAttribute('#nova', 'type')) === 'text' && (await tg.getAttribute('aria-pressed')) === 'true' && (await tg.innerText()) === 'Ocultar senha');
    await tg.click();
    check('AC9 2º clique volta a password', (await p.getAttribute('#nova', 'type')) === 'password' && (await tg.getAttribute('aria-pressed')) === 'false');
    await preencher(p, NEW); await p.click('form button[type=submit]');
    await wait(p, () => /^#\/(documentos|onboarding)/.test(location.hash));
    const onde = await p.evaluate((pw) => ({ corpo: document.body.innerText.includes(pw), html: document.documentElement.outerHTML.includes(pw), ls: JSON.stringify(localStorage).includes(pw), ss: JSON.stringify(sessionStorage).includes(pw), url: location.href.includes(pw) }), NEW);
    check('AC9 depois do envio a senha não está no texto da página, no HTML, em localStorage, sessionStorage nem na URL', !onde.corpo && !onde.html && !onde.ls && !onde.ss && !onde.url, onde);
    check('AC9 a senha não passou pelo console', !d.consoleAll.some((x) => x.includes(NEW)));
    check('AC9 só o PUT /auth/v1/user carregou a senha (nenhuma outra requisição)', d.fake.state.log.filter((l) => JSON.stringify(l.body || {}).includes(NEW) || (l.query || '').includes(NEW)).every((l) => l.method === 'PUT' && l.path === '/auth/v1/user'));
    check('sem erro de JS/CSP e sem requisição externa', d.errors.length === 0 && d.external.length === 0, [d.errors, d.external]);
  });

  await t('AC10 dois cliques rápidos em Salvar = exatamente 1 PUT', open, { width: 390 }, async (d) => {
    const p = d.page; await novaPagina(d); await p.waitForSelector('#nova');
    d.fake.state.mode.delay = 400;
    await preencher(p, NEW);
    const btn = p.getByRole('button', { name: 'Salvar nova senha' });
    await btn.dblclick();
    await p.waitForFunction(() => document.querySelector('.toast') || /^#\/(documentos|onboarding)/.test(location.hash), null, { timeout: 8000 });
    await p.waitForTimeout(500);
    check('AC10 exatamente 1 PUT /auth/v1/user (state.calls.update=1) e 1 logout', d.fake.state.calls.update === 1 && puts(d) === 1 && d.fake.state.calls.logout.length === 1, [d.fake.state.calls, puts(d)]);
  });

  await t('AC10b botão "Salvando…" enquanto espera', open, { width: 390 }, async (d) => {
    const p = d.page; await novaPagina(d); await p.waitForSelector('#nova');
    d.fake.state.mode.delay = 800; await preencher(p, NEW); await p.click('form button[type=submit]');
    check('o botão fica desabilitado com aria-busy e texto "Salvando…"', (await p.getByRole('button', { name: 'Salvando…' }).isDisabled()) && (await p.locator('form button[type=submit]').getAttribute('aria-busy')) === 'true');
  });

  await t('AC11 sucesso: logout scope=others, sessão continua, destino por onboarding_done, Voltar não reabre o formulário', open, { width: 390 }, async (d) => {
    const p = d.page;
    for (const [email, destino] of [['pronto@teste.example', '#/documentos'], ['ok@teste.example', '#/onboarding/1']]) {
      d.fake.seed();
      await novaPagina(d, email); await p.waitForSelector('#nova');
      const hist = await p.evaluate(() => history.length);
      await preencher(p, NEW); await p.click('form button[type=submit]');
      await p.waitForSelector('.toast');
      check(`AC11 [${email}] aparece "Senha alterada."`, /Senha alterada\./.test(await p.locator('#toast-root').innerText()), await p.locator('#toast-root').innerText());
      await wait(p, (x) => location.hash.startsWith(x), destino);
      check(`AC11 [${email}] destino normal ${destino} (onboarding_done)`, (await hash(p)).startsWith(destino), await hash(p));
      check(`AC11 [${email}] 1 PUT user e exatamente 1 POST logout?scope=others`, d.fake.state.calls.update === 1 && JSON.stringify(d.fake.state.calls.logout) === '["others"]' && d.fake.state.log.filter((l) => l.path === '/auth/v1/logout' && l.query === '?scope=others').length === 1, [d.fake.state.calls.logout]);
      check(`AC11 [${email}] a sessão continua (token em localStorage) e o shell abriu`, (await p.evaluate(() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)))) && (await p.locator('.shell').count()) === 1);
      check(`AC11 [${email}] rec_ok apagado`, (await p.evaluate(() => sessionStorage.getItem('lottus.sign.rec_ok'))) === null);
      check(`AC11 [${email}] replace: o histórico não ganhou entrada`, (await p.evaluate(() => history.length)) <= hist + 0, [hist, await p.evaluate(() => history.length)]);
      await p.goBack().catch(() => {}); await p.waitForTimeout(400);
      check(`AC11 [${email}] Voltar não reabre o formulário`, !/nova-senha/.test(p.url()) && (await p.locator('#nova').count()) === 0, p.url());
      await p.goto(d.origin + '/#/entrar'); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    }
    d.fake.seed(); await novaPagina(d); await p.waitForSelector('#nova'); await preencher(p, NEW); await p.click('form button[type=submit]'); await wait(p, () => location.hash === '#/documentos');
    check('a senha nova passa a valer no fake (entra de novo com ela)', await (async () => { await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await d.go('#/entrar'); await login(p, 'pronto@teste.example', NEW); await wait(p, () => location.hash === '#/documentos', null, 8000); return true; })());
  });

  await t('AC12 signOut others com erro: a troca vale e aparece o aviso', open, { width: 390 }, async (d) => {
    const p = d.page; d.fake.state.mode.others500 = true;
    await novaPagina(d); await p.waitForSelector('#nova'); await preencher(p, NEW); await p.click('form button[type=submit]');
    await p.waitForSelector('.toast'); await wait(p, () => location.hash === '#/documentos');
    const tx = await p.locator('#toast-root').innerText();
    check('AC12 a troca vale (1 PUT), o logout others foi tentado e o aviso de sessões não encerradas aparece', d.fake.state.calls.update === 1 && d.fake.state.calls.logout[0] === 'others' && /Senha alterada\./.test(tx) && /Não conseguimos encerrar as outras sessões; entre em Perfil para sair dos outros aparelhos\./.test(tx), tx);
    check('AC12 mesmo assim o usuário foi ao destino, logado', (await hash(p)) === '#/documentos' && (await p.locator('.shell').count()) === 1);
  });

  await t('AC13 AC14 link vencido, setSession com erro, #/nova-senha direto, F5', open, { width: 390 }, async (d) => {
    const p = d.page;
    for (const [rot, o] of [['#error_code=otp_expired', { expired: true }], ['link já consumido (setSession falha)', { used: true }], ['token ilegível', { bad: true }]]) {
      await novaPagina(d, 'pronto@teste.example', o); await p.waitForSelector('text=Este link venceu ou já foi usado. Peça um novo.');
      check(`AC13 [${rot}] texto exato, título "Link inválido" e URL sem hash do Auth`, (await h1(p)) === 'Link inválido' && (await hash(p)) === '#/nova-senha' && !/error|access_token/.test(p.url()), p.url());
      check(`AC13 [${rot}] há "Pedir novo link" e "Voltar ao Entrar"`, (await p.getByRole('link', { name: 'Pedir novo link' }).count()) === 1 && (await p.getByRole('link', { name: 'Voltar ao Entrar' }).count()) === 1);
      check(`AC13 [${rot}] o formulário não existe e nada foi enviado`, (await p.locator('#nova').count()) === 0 && puts(d) === 0);
    }
    await p.getByRole('link', { name: 'Pedir novo link' }).click(); await wait(p, () => location.hash === '#/recuperar' && document.querySelector('h1').textContent === 'Recuperar senha');
    check('AC13 "Pedir novo link" vai a #/recuperar', (await h1(p)) === 'Recuperar senha');
    check('após consumir rec_fail a rota #/nova-senha deixa de mostrar "link vencido" (marcador de uso único)', await (async () => { await p.evaluate(() => { location.hash = '#/nova-senha'; }); await wait(p, () => location.hash === '#/recuperar'); return (await text(p, '.sg-msg')) === 'Para trocar a senha, peça um link ao seu e-mail.'; })());
    // AC14
    await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await p.goto(d.origin + '/#/nova-senha'); await p.waitForSelector('#sign h1');
    check('AC14 #/nova-senha aberto direto (sem rec_ok): vai a #/recuperar com o aviso', (await hash(p)) === '#/recuperar' && (await text(p, '.sg-msg')) === 'Para trocar a senha, peça um link ao seu e-mail.' && (await h1(p)) === 'Recuperar senha');
    await novaPagina(d); await p.waitForSelector('#nova'); await p.fill('#nova', 'rascunho');
    await p.reload(); await p.waitForSelector('#sign h1');
    check('AC14 F5 com rec_ok e sessão: a tela permanece (o digitado não é guardado)', (await h1(p)) === 'Criar nova senha' && (await hash(p)) === '#/nova-senha' && (await p.inputValue('#nova')) === '');
    await p.evaluate(() => sessionStorage.removeItem('lottus.sign.rec_ok')); await p.reload(); await p.waitForSelector('#sign h1');
    check('AC14 F5 com a sessão mas SEM rec_ok: volta a #/recuperar com o aviso (usuário logado não troca senha por aqui)', (await hash(p)) === '#/recuperar' && (await text(p, '.sg-msg')) === 'Para trocar a senha, peça um link ao seu e-mail.');
    check('AC14 abandonar (ir a outra rota) apaga rec_ok', await (async () => { await novaPagina(d); await p.waitForSelector('#nova'); await p.evaluate(() => { location.hash = '#/recuperar'; }); await wait(p, () => location.hash === '#/recuperar'); return (await p.evaluate(() => sessionStorage.getItem('lottus.sign.rec_ok'))) === null; })());
  });

  await t('AC15 erros do Auth na troca: fraca, mesma, 401, 429, rede, 500', open, { width: 390, cfg: { timeoutMs: 1500 } }, async (d) => {
    const p = d.page; await novaPagina(d); await p.waitForSelector('#nova');
    const salvar = async () => { await p.click('form button[type=submit]'); await p.waitForTimeout(350); };
    const cru = async () => /weak|known to be|different from|password should|invalid jwt|rate limit|pwned|bad_jwt|422|401|429/i.test(await text(p, '#sign'));
    await preencher(p, NEW);
    d.fake.state.mode = { weak: true }; await salvar();
    check('AC15 senha fraca/vazada (422 weak_password): texto próprio, no campo, foco nele, sem texto cru', (await text(p, '#nova-err')) === 'Essa senha é fraca ou já apareceu em vazamentos. Escolha outra.' && (await p.evaluate(() => document.activeElement.id)) === 'nova' && !(await cru()), await text(p, '#sign'));
    check('AC15 os campos mantêm o digitado e o botão volta', (await p.inputValue('#nova')) === NEW && (await p.inputValue('#confirma')) === NEW && (await p.getByRole('button', { name: 'Salvar nova senha' }).isEnabled()));
    await p.fill('#nova', NEW + 'x'); await p.fill('#confirma', NEW + 'x');
    check('editar a senha limpa o erro da anterior', (await p.locator('#nova-err').isHidden()));
    d.fake.state.mode = { same: true }; await salvar();
    check('AC15 mesma senha (same_password): "A nova senha precisa ser diferente da atual."', (await text(p, '#nova-err')) === 'A nova senha precisa ser diferente da atual.' && !(await cru()));
    d.fake.state.mode = { rl429: { update: true } }; await salvar();
    check('AC15 429: "Muitas tentativas. Aguarde um pouco e tente de novo." e sem texto cru', (await text(p, '.sg-msg')) === 'Muitas tentativas. Aguarde um pouco e tente de novo.' && !(await cru()));
    d.fake.state.mode = { down: true }; await p.click('form button[type=submit]'); await p.waitForSelector('text=Sem conexão. Verifique a internet e tente de novo.', { timeout: 9000 });
    check('AC15 rede: texto de rede e o digitado é mantido', (await p.inputValue('#nova')) === NEW + 'x');
    d.fake.state.mode = {};
    const n0 = d.fake.state.calls.update;
    d.fake.state.mode = { expired: true }; await salvar();
    check('AC15 401 na troca: estado "link vencido" (Link inválido) e a sessão morta sai do navegador', (await h1(p)) === 'Link inválido' && /Este link venceu ou já foi usado\. Peça um novo\./.test(await text(p, '#sign')) && !(await cru()) && d.fake.state.calls.update === n0);
    check('AC15 depois do 401 não sobra token em localStorage (sem sessão fantasma)', !(await p.evaluate(() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)))));
  });

  await t('AC16 duas abas com o mesmo link', open, { width: 390 }, async (d) => {
    const p = d.page; const link = d.origin + '/' + d.fake.recoveryHash('pronto@teste.example');
    await p.goto(link); await p.waitForSelector('#nova');
    const p2 = await d.ctx.newPage();
    await p2.goto(link); await p2.waitForSelector('#sign h1');
    check('AC16 a 2ª aba, com o mesmo link, mostra "Este link venceu ou já foi usado. Peça um novo."', (await text(p2, '#sign h1')) === 'Link inválido' && /Este link venceu ou já foi usado\. Peça um novo\./.test(await text(p2, '#sign')), await text(p2, '#sign'));
    check('AC16 a 1ª aba segue com o formulário e consegue trocar a senha (1 PUT)', await (async () => { await preencher(p, NEW); await p.click('form button[type=submit]'); await wait(p, () => location.hash === '#/documentos'); return d.fake.state.calls.update === 1; })());
    const p3 = await d.ctx.newPage(); await p3.goto(link); await p3.waitForSelector('#sign h1');
    check('AC16 depois que a 1ª aba trocou a senha, uma 3ª tentativa com o mesmo link também cai em "link vencido"', /Este link venceu ou já foi usado/.test(await text(p3, '#sign')));
  });

  await t('AC17 percurso completo Entrar > Esqueci > e-mail > link > senha > destino, sem beco', open, { width: 390 }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await p.fill('#email', 'pronto@teste.example'); await p.getByRole('link', { name: 'Esqueci a senha' }).click(); await wait(p, () => location.hash === '#/recuperar' && document.querySelector('h1').textContent === 'Recuperar senha');
    check('AC17 Recuperar tem "Voltar ao Entrar"', (await p.getByRole('link', { name: 'Voltar ao Entrar' }).count()) === 1);
    await p.click('form button[type=submit]'); await p.waitForSelector('text=Verifique seu e-mail');
    check('AC17 a tela neutra tem "Voltar ao Entrar" e "Usar outro e-mail"', (await p.getByRole('link', { name: 'Voltar ao Entrar' }).count()) === 1 && (await p.getByRole('button', { name: 'Usar outro e-mail' }).count()) === 1);
    await p.getByRole('link', { name: 'Voltar ao Entrar' }).click(); await wait(p, () => location.hash === '#/entrar' && document.querySelector('#senha'));
    check('AC17 "Voltar ao Entrar" volta ao formulário de entrada', (await p.locator('#senha').count()) === 1);
    await novaPagina(d); await p.waitForSelector('#nova');
    await p.getByRole('link', { name: 'Voltar ao Entrar' }).click(); await wait(p, () => location.hash === '#/entrar' && document.querySelector('#senha'));
    check('AC17 "Voltar ao Entrar" na nova senha abandona: sai da sessão do link e mostra o Entrar (não entra no app)', (await p.locator('#senha').count()) === 1 && !(await p.evaluate(() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)))) && (await p.evaluate(() => sessionStorage.getItem('lottus.sign.rec_ok'))) === null);
    await novaPagina(d, 'pronto@teste.example', { expired: true }); await p.waitForSelector('text=Link inválido');
    await p.getByRole('link', { name: 'Voltar ao Entrar' }).click(); await wait(p, () => location.hash === '#/entrar');
    await novaPagina(d); await p.waitForSelector('#nova'); await preencher(p, NEW); await p.click('form button[type=submit]'); await wait(p, () => location.hash === '#/documentos');
    check('AC17 o percurso termina no destino (Documentos) com sessão; nenhuma tela sem saída', (await p.locator('.shell').count()) === 1);
    check('AC17 sem erro de JS/CSP', d.errors.length === 0, d.errors);
  });

  await t('Verificando o link: estado de espera enquanto a sessão do link abre', open, { width: 390 }, async (d) => {
    const p = d.page; d.fake.state.mode.delay = 1200;
    await p.goto(d.origin + '/' + d.fake.recoveryHash('pronto@teste.example'));
    await p.waitForSelector('text=Verificando o link…');
    check('"Verificando o link…" aparece enquanto a rede responde, com spinner de status', (await h1(p)) === 'Verificando o link…' && (await p.locator('#sign [role=status]').count()) === 1);
    await p.waitForSelector('#nova', { timeout: 9000 });
    check('depois abre o formulário', (await h1(p)) === 'Criar nova senha');
  });

  // ================================================================================================ AC19: 4 larguras x 2 temas
  for (const theme of ['light', 'dark']) await t('AC19 larguras 320, 768, 1280, 2560 no tema ' + theme, open, { width: 390, theme }, async (d) => {
    const p = d.page; let nShots = 0;
    const LONGO = 'pessoa.com.um.endereco.de.email.muito.longo.para.testar.o.corte@dominio-de-teste-bem-longo.example';
    for (const w of [320, 768, 1280, 2560]) {
      await p.setViewportSize({ width: w, height: w >= 1280 ? 900 : 800 });
      const tag = `${theme}-${w}`;
      const olha = async (rot, nome) => {
        const o = await overflow(p); const tm = await tocar(p); const sv = await svgs(p);
        const card = await p.evaluate(() => { const c = document.querySelector('.sg-card'); const b = c.getBoundingClientRect(); return { w: Math.round(b.width), l: Math.round(b.left), r: Math.round(b.right), vw: innerWidth }; });
        check(`AC19 ${tag} ${rot}: sem rolagem horizontal, nada fora da tela nem do cartão`, !o.hscroll && o.over.length === 0 && o.outCard.length === 0, o);
        check(`AC19 ${tag} ${rot}: cartão <= 420 px e inteiro dentro da janela; centralizado a partir de 768`, card.w <= 420 && card.l >= 0 && card.r <= card.vw && (w < 768 || Math.abs((card.l + card.r) / 2 - card.vw / 2) <= 2), card);
        check(`AC19 ${tag} ${rot}: alvos de toque >= 44 px e ícones <= 32 px`, tm.length === 0 && sv.every((x) => x <= 32), [tm, sv]);
        await p.screenshot({ path: `${SHOTS}/${nome}-${tag}.png`, animations: 'disabled', caret: 'hide' }); nShots++;
      };
      const tema = async () => { if (theme === 'dark') await d.setTheme('dark'); };
      d.fake.seed(); await p.goto(d.origin + '/?w=' + (++zn) + '#/recuperar'); await p.waitForSelector('#email'); await p.evaluate(() => sessionStorage.clear()); await tema();
      await p.fill('#email', LONGO.replace(/\.example$/, '')); await p.click('form button[type=submit]'); await p.waitForSelector('#email-err:not([hidden])');
      await olha('recuperar com erro de e-mail (nada enviado)', '1-recuperar');
      await p.fill('#email', 'pronto@teste.example'); await p.click('form button[type=submit]'); await p.waitForSelector('text=Verifique seu e-mail');
      await olha('verifique seu e-mail', '2-neutra');
      await novaPagina(d); await p.waitForSelector('#nova'); await tema();
      await p.fill('#nova', 'abc'); await p.fill('#confirma', 'abcd'); await p.getByRole('button', { name: 'Mostrar senha' }).first().click();
      await olha('nova senha com contador, medidor e erro', '3-nova-senha');
      await p.fill('#nova', 'Abcdefghij12345!'); await p.fill('#confirma', 'Abcdefghij12345!');
      await olha('nova senha forte', '4-nova-senha-forte');
      await novaPagina(d, 'pronto@teste.example', { expired: true }); await p.waitForSelector('text=Link inválido'); await tema();
      await olha('link inválido', '5-link-invalido');
      await p.goto(d.origin + '/?w=' + (++zn) + '#/recuperar'); await p.waitForSelector('#email'); await p.evaluate(() => sessionStorage.clear()); d.fake.state.mode = { rl429: { recover: true } }; await p.fill('#email', 'pronto@teste.example'); await p.click('form button[type=submit]'); await p.waitForSelector('.sg-alert'); await tema();
      await olha('recuperar com 429', '6-recuperar-429'); d.fake.state.mode = {};
    }
    check(`AC19 ${theme}: ${nShots} capturas (6 por largura x 4 larguras)`, nShots === 24, nShots);
  });

  // ================================================================================================ pacote C2-13 (tela)
  await t('AC-R2 (B-1) erro de carga nos passos 2 e 3: h1 do passo certo', open, { ...PG, width: 390, cfg: { timeoutMs: 2000 } }, async (d) => {
    const p = d.page;
    const u = await mk((s, a) => q(d, s, a), 401, { verif: 'email' }); await d.fake.loadUsers();
    await d.go('#/entrar'); await login(p, u.email, PW);
    await wait(p, () => /^#\/(documentos|onboarding)/.test(location.hash) && document.querySelector('.shell') && !document.querySelector('.ob[aria-busy="true"]'), null, 10000);
    for (const [n, tit] of [[1, 'Seus dados'], [2, 'Verificar contato'], [3, 'Certificado (opcional)']]) {
      d.fake.state.mode.rpcFail = { sign_me: { status: 500, body: { code: 'XX000', message: 'boom' } } };
      await p.goto(d.origin + '/?r=' + n + '#/onboarding/' + n); await p.waitForSelector('#view h1', { timeout: 8000 }); await p.waitForSelector('.ob .banner.danger', { timeout: 8000 });
      check(`AC-R2 erro de carga no passo ${n}: o h1 é "${tit}"`, (await text(p, '#view h1')) === tit && (await p.locator('.ob .banner.danger').count()) === 1, await text(p, '#view h1'));
      check(`AC-R2 passo ${n}: o erro oferece "Tentar de novo" e o texto está em português`, (await p.getByRole('button', { name: 'Tentar de novo' }).count()) >= 1 && /Não foi possível carregar seus dados\./.test(await text(p, '.ob')));
    }
    d.fake.state.mode.rpcFail = {};
  });

  await t('AC-R3 (B-2) e-mail longo no topo: sem quebra no meio da palavra, reticências e title', open, { width: 320 }, async (d) => {
    const p = d.page;
    const LONGO = 'pessoa.com.endereco.muito.longo.sem.espaco.para.o.topo@dominio-de-teste-bem-longo.example';
    d.fake.state.users.set(LONGO, { id: 'u-77', email: LONGO, password: PW, confirmed: true, onboarding_done: true });
    d.fake.state.mode.meNoName = true;
    for (const w of [320, 390, 768, 1280, 2560]) {
      await p.setViewportSize({ width: w, height: 800 });
      await d.go('#/entrar'); await login(p, LONGO, PW); await wait(p, () => location.hash === '#/documentos' && document.querySelector('.org-sub:not([hidden])'));
      const r = await p.evaluate(() => { const e = document.querySelector('.org-name'); const cs = getComputedStyle(e); return { ow: cs.overflowWrap, ws: cs.whiteSpace, to: cs.textOverflow, title: e.title, txt: e.textContent, cut: e.scrollWidth > e.clientWidth, h: e.getBoundingClientRect().height, hs: document.documentElement.scrollWidth > innerWidth + 1 }; });
      check(`AC-R3 ${w}: overflow-wrap normal, uma linha com reticências, title com o e-mail inteiro e sem rolagem horizontal`, r.ow === 'normal' && r.ws === 'nowrap' && r.to === 'ellipsis' && r.title === LONGO && r.txt === LONGO && !r.hs && r.h < 30, r);
      if (w <= 390) check(`AC-R3 ${w}: o e-mail realmente passa da largura e é cortado com reticências (não quebra no meio)`, r.cut, r);
      await p.screenshot({ path: `${SHOTS}/r3-topo-${w}.png` });
      await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    }
    await p.setViewportSize({ width: 320, height: 800 }); d.fake.state.mode.meNoName = false;
    await d.go('#/entrar'); await login(p, 'pronto@teste.example', PW); await wait(p, () => location.hash === '#/documentos' && document.querySelector('.org-sub:not([hidden])'));
    check('AC-R3 com nome (V-07) o topo continua com até 2 linhas e quebra normal', await p.evaluate(() => { const e = document.querySelector('.org-name'); return !e.classList.contains('is-email') && getComputedStyle(e).whiteSpace === 'normal'; }));
  });

  await t('AC-R4 (B-3) passo 3: "Gerar desafio" desligado sem certEndpoint; "Pular certificado" só sem certificado vinculado', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; const Q = (s, a) => q(d, s, a);
    const a = await mk(Q, 402, { verif: 'email' }); const b = await mk(Q, 403, { verif: 'email', cert: 'ok' }); await d.fake.loadUsers();
    for (const [u, temCert] of [[a, false], [b, true]]) {
      await zera(d); await login(p, u.email, PW);
      await wait(p, () => /^#\/onboarding\/3$/.test(location.hash) && document.querySelector('#ob-h') && !document.querySelector('.ob[aria-busy="true"]'), null, 10000);
      const bt = (await p.locator('.ob-actions .btn').allInnerTexts()).map((x) => x.trim()).join('|');
      check(`AC-R4 [${temCert ? 'com certificado' : 'sem certificado'}] botões do rodapé: ${temCert ? 'Voltar|Concluir' : 'Voltar|Pular certificado|Concluir'}`, bt === (temCert ? 'Voltar|Concluir' : 'Voltar|Pular certificado|Concluir'), bt);
      if (!temCert) {
        await p.waitForSelector('.vf-indic, .vf-card .banner, .vf-card [role=status]', { timeout: 4000 }).catch(() => {});
        const g = p.getByRole('button', { name: 'Gerar desafio' });
        check('AC-R4 sem certEndpoint "Gerar desafio" está desligado e o indicador de indisponível aparece', (await g.isDisabled()) && /indispon|não está disponível|disponível/i.test(await text(p, '.vf-card')), await text(p, '.vf-card'));
        await p.screenshot({ path: `${SHOTS}/r4-passo3-sem-cert.png`, fullPage: true });
      } else {
        check('AC-R4 com certificado vinculado: aparece "Certificado vinculado" e não há "Pular certificado"', /Certificado vinculado/.test(await text(p, '.vf-card')) && (await p.getByRole('button', { name: 'Pular certificado' }).count()) === 0);
        await p.screenshot({ path: `${SHOTS}/r4-passo3-com-cert.png`, fullPage: true });
        await p.getByRole('button', { name: 'Concluir' }).click(); await wait(p, () => location.hash === '#/documentos');
        check('AC-R4 "Concluir" com certificado leva a Documentos (onboarding_done)', (await q(d, `select onboarding_done from public.sign_identity where user_id = $1`, [b.id]))[0].onboarding_done === true);
      }
    }
    check('AC-R4 também na Verificação (mesmo cartão): "Gerar desafio" desligado sem certEndpoint', await (async () => { await zera(d); await login(p, a.email, PW); await wait(p, () => location.hash === '#/onboarding/3'); await p.evaluate(() => { location.hash = '#/conta/verificacao'; }); await p.waitForSelector('#vf-cert-h'); return p.getByRole('button', { name: 'Gerar desafio' }).isDisabled(); })());
  });

  await t('AC-R5 (B-4) resumo do passo 3: tags na mesma coluna nas 4 larguras', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; const a = await mk((s, x) => q(d, s, x), 404, { verif: 'email' }); await d.fake.loadUsers();
    await d.go('#/entrar'); await login(p, a.email, PW); await wait(p, () => /^#\/onboarding\/3$/.test(location.hash) && document.querySelector('.ob-sum') && !document.querySelector('.ob[aria-busy="true"]'), null, 10000);
    for (const w of [320, 768, 1280, 2560]) {
      await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(150);
      const r = await p.evaluate(() => [...document.querySelectorAll('.ob-sum li')].map((li) => { const t = li.lastElementChild.getBoundingClientRect(); const l = li.getBoundingClientRect(); return { left: Math.round(t.left), top: Math.round(t.top), liTop: Math.round(l.top), right: Math.round(t.right) }; }));
      check(`AC-R5 ${w}: as 3 tags têm o mesmo X à esquerda (mesma coluna)`, r.length === 3 && r.every((x) => x.left === r[0].left), r);
      check(`AC-R5 ${w}: cada tag fica na linha do seu rótulo (sem quebrar para baixo) e dentro da janela`, r.every((x) => x.top - x.liTop < 20 && x.right <= w), r);
      await p.screenshot({ path: `${SHOTS}/r5-resumo-${w}.png`, fullPage: true });
    }
  });

  await t('AC-R6 (B-5) Perfil: "E-mail confirmado" / "Celular verificado" e celular não verificado', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; const Q = (s, a) => q(d, s, a);
    const a = await mk(Q, 405, { verif: 'email', done: true }); const b = await mk(Q, 406, { verif: 'phone', done: true }); const c = await mk(Q, 407, { done: true }); await d.fake.loadUsers();
    await Q(`update public.profiles set phone = '5511912345678' where id = $1`, [a.id]);
    await Q(`update public.sign_identity set phone = null where user_id = $1`, [a.id]);
    for (const [u, rot] of [[a, 'e-mail'], [b, 'celular'], [c, 'nenhum']]) {
      await zera(d);
      await logged(d, u);
      await p.waitForSelector('#pf-cel-l', { timeout: 8000 });
      const tx = await text(p, '.pf'); const mail = await text(p, '#pf-mail-l + .pf-value'); const cel = await text(p, '#pf-cel-l + .pf-value');
      if (rot === 'e-mail') {
        check('AC-R6 contact_kind=email: o Perfil mostra "E-mail confirmado"', /E-mail confirmado/.test(mail), mail);
        check('AC-R6 celular guardado que não é o contato verificado: "Este celular ainda não foi verificado. O contato verificado é o e-mail." e selo "Não verificado"', /Este celular ainda não foi verificado\. O contato verificado é o e-mail\./.test(cel) && /Não verificado/.test(cel) && !/Celular verificado/.test(tx), cel);
      } else if (rot === 'celular') {
        check('AC-R6 contact_kind=phone: o Perfil mostra "Celular verificado" e o e-mail só "Confirmado"', /Celular verificado/.test(cel) && !/E-mail confirmado/.test(mail) && /Confirmado/.test(mail) && !/ainda não foi verificado/.test(cel), [cel, mail]);
      } else {
        check('AC-R6 sem contato verificado: nem "E-mail confirmado" nem "Celular verificado"', !/E-mail confirmado|Celular verificado/.test(tx), tx);
      }
      await p.screenshot({ path: `${SHOTS}/r6-perfil-${rot}.png`, fullPage: true });
    }
    check('sem erro de JS/CSP', d.errors.length === 0, d.errors);
  });

  // ================================================================================================ JS novo (gzip)
  {
    const lib = require('fs'); const base = path.join(ROOT, 'apps/sign/js');
    const arq = ['app.js', ...lib.readdirSync(path.join(base, 'lib')).map((f) => 'lib/' + f), ...lib.readdirSync(path.join(base, 'views')).map((f) => 'views/' + f)];
    let gz = 0; for (const f of arq) gz += zlib.gzipSync(lib.readFileSync(path.join(base, f))).length;
    const senha = zlib.gzipSync(lib.readFileSync(path.join(base, 'views/senha.js'))).length;
    process.stdout.write(`JS da seção (sem vendor), gzip por arquivo: total ${(gz / 1024).toFixed(2)} kB; senha.js ${(senha / 1024).toFixed(2)} kB\n`);
    require('fs').writeFileSync(path.join(SHOTS, 'js-gzip.txt'), `total ${gz} B; senha.js ${senha} B\n`);
  }

  console.info('limpando: reset.sh depois'); reset('depois');
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });

async function logged(d, u) {
  const p = d.page; await d.go('#/entrar'); await login(p, u.email, PW);
  await p.waitForFunction(() => /^#\/(documentos|onboarding)/.test(location.hash) && document.querySelector('.shell'), null, { timeout: 10000 });
  await p.evaluate(() => { location.hash = '#/conta/perfil'; });
  await p.waitForFunction(() => location.hash === '#/conta/perfil' && document.querySelector('#view h1') && !document.querySelector('.pf-card[aria-busy="true"]'), null, { timeout: 10000 });
}
