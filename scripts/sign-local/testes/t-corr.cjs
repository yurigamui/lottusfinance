// Seção 1.0, correções da 1.1 e desempenho: AC14 (M-1), AC15 (M-3), AC16 (B-1), AC17 (B-2), AC18 (B-3), AC19 (T-09, estático), AC20 (dvh), AC26 (estático), CLS e INP do shell.
const { open } = require('./drv.cjs');
const { check, t, done, hash, text, login, logged, VER, PW, authCalls } = require('./lib.cjs');
const fs = require('fs'), path = require('path');
const APP = path.resolve(__dirname, '../../../apps/sign');
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 6000 });
const rd = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

(async () => {
  for (const [email, destino] of [['pronto@teste.example', '#/documentos'], ['ok@teste.example', '#/onboarding/1']]) {
    await t('AC14 M-1 replace no login (' + email + ')', open, { width: 1280 }, async (d) => {
      const p = d.page; await d.go('#/entrar');
      const antes = await p.evaluate(() => history.length);
      await login(p, email, PW); await wait(p, (x) => location.hash === x && document.querySelector('.shell'), destino);
      check('AC14 history.length igual ao de antes do login', (await p.evaluate(() => history.length)) === antes, [antes, await p.evaluate(() => history.length)]);
      await p.goBack().catch(() => {}); await p.waitForTimeout(500);
      check('AC14 Voltar não mostra o formulário de Entrar', (await p.locator('#email').count()) === 0 && !/#\/entrar/.test(p.url()), p.url());
    });
  }
  await t('AC14 retorno à origem usa replace', open, { width: 1280 }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await p.evaluate(() => sessionStorage.setItem('lottus.sign.de', '#/plano'));
    const antes = await p.evaluate(() => history.length);
    await login(p, 'pronto@teste.example', PW); await wait(p, () => location.hash === '#/plano' && document.querySelector('.shell'));
    check('AC14 origem guardada: history.length igual', (await p.evaluate(() => history.length)) === antes);
  });

  await t('AC15 M-3 reenvio no link vencido', open, { width: 390, cfg: { resendCooldownMs: 1500 } }, async (d) => {
    const p = d.page;
    await p.goto(d.origin + '/#error_code=otp_expired'); await p.waitForSelector('#sign h1');
    await p.fill('#email', 'ok@teste.example');
    const btn = p.getByRole('button', { name: 'Reenviar e-mail' });
    await btn.click();
    await p.waitForSelector('text=Enviamos de novo. Verifique também a caixa de spam.');
    const b = p.locator('.sg-alert button');
    check('AC15 o botão continua visível e desligado com "Reenviar em N s"', (await b.count()) === 1 && (await b.isVisible()) && (await b.isDisabled()) && /^Reenviar em \d+ s$/.test(await b.innerText()), await b.allInnerTexts());
    check('AC15 a mensagem vira "Enviamos de novo..." no mesmo alerta', /Enviamos de novo\. Verifique também a caixa de spam\./.test(await text(p, '.sg-alert')) && !/venceu/.test(await text(p, '.sg-alert')));
    await p.waitForFunction(() => { const x = document.querySelector('.sg-alert button'); return x && !x.disabled && x.textContent === 'Reenviar e-mail'; }, null, { timeout: 5000 });
    check('AC15 passado o intervalo (1,5 s) volta a "Reenviar e-mail"', (await b.isEnabled()) && (await b.innerText()) === 'Reenviar e-mail');
    check('AC15 1 chamada de reenvio ao servidor', authCalls(d, /resend/).length === 1);
  });
  await t('AC15 M-3 429 e falha de rede', open, { width: 390, cfg: { resendCooldownMs: 1500, timeoutMs: 1500 } }, async (d) => {
    const p = d.page; d.fake.state.mode.rl429 = { resend: true };
    await p.goto(d.origin + '/#error_code=otp_expired'); await p.waitForSelector('#sign h1');
    await p.fill('#email', 'ok@teste.example'); await p.getByRole('button', { name: 'Reenviar e-mail' }).click();
    await p.waitForSelector('text=Você atingiu o limite de reenvios. Tente em 1 hora.');
    check('AC15 429: o botão continua e a mensagem aparece', (await p.getByRole('button', { name: 'Reenviar e-mail' }).count()) === 1 && (await p.getByRole('button', { name: 'Reenviar e-mail' }).isEnabled()));
    d.fake.state.mode.rl429 = {}; d.fake.state.mode.down = true;
    await p.getByRole('button', { name: 'Reenviar e-mail' }).click();
    await p.waitForSelector('text=Não foi possível concluir agora. Verifique sua conexão.', { timeout: 8000 });
    check('AC15 falha de rede: o botão continua', (await p.getByRole('button', { name: 'Reenviar e-mail' }).count()) === 1 && /venceu/.test(await text(p, '#sign')));
  });

  await t('AC16 B-1 hash do Auth em hashchange', open, { width: 1280 }, async (d) => {
    const p = d.page; const tk = d.fake.mint('ok@teste.example');
    await d.go('#/entrar');
    await p.evaluate(() => { window.__nf = false; new MutationObserver(() => { if (/Página não encontrada/.test(document.body.innerText)) window.__nf = true; }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
    await p.evaluate((h) => { location.hash = h; }, `#access_token=${tk.access_token}&refresh_token=${tk.refresh_token}&type=signup`);
    await wait(p, () => location.hash === '#/onboarding/1' && document.querySelector('.shell'));
    check('AC16 hash do Auth apagado da URL', !/access_token|refresh_token/.test(p.url()), p.url());
    check('AC16 resultado #/onboarding/1 dentro do shell', (await hash(p)) === '#/onboarding/1' && (await text(p, '#view h1')) === 'Seus dados');
    check('AC16 "Página não encontrada" nunca apareceu', (await p.evaluate(() => window.__nf)) === false);
  });
  await t('AC16 B-1 link vencido em hashchange', open, { width: 1280 }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    await p.evaluate(() => { window.__nf = false; new MutationObserver(() => { if (/Página não encontrada/.test(document.body.innerText)) window.__nf = true; }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
    await p.evaluate(() => { location.hash = '#error=access_denied&error_code=otp_expired'; });
    await p.waitForSelector('text=Este link venceu ou já foi usado. Peça um novo.');
    check('AC16 aparece o aviso de link vencido e o botão de reenvio', await p.getByRole('button', { name: 'Reenviar e-mail' }).isVisible());
    check('AC16 hash apagado e rota #/entrar', (await hash(p)) === '#/entrar' && !/error/.test(p.url()), p.url());
    check('AC16 sem "Página não encontrada"', (await p.evaluate(() => window.__nf)) === false);
    await p.evaluate(() => { location.hash = '#qualquer-ancora'; }); await p.waitForTimeout(300);
    check('AC16 âncora estranha não vira rota nem derruba a tela', (await p.locator('h1').count()) === 1 && !/não encontrada/i.test(await text(p, '#sign')));
  });

  await t('AC17 B-2 token inválido', open, { width: 390 }, async (d) => {
    const p = d.page;
    await p.goto(d.origin + '/#access_token=lixo&type=signup'); await p.waitForSelector('#sign h1');
    await p.waitForSelector('text=Não foi possível usar este link');
    const tx = await text(p, '#sign');
    check('AC17 não aparece "E-mail confirmado"', !/E-mail confirmado/.test(tx));
    check('AC17 texto neutro exato', tx.includes('Não foi possível usar este link. Entre com seu e-mail e senha ou, se o link venceu, peça um novo.'), tx);
    check('AC17 botão Reenviar e-mail presente', await p.getByRole('button', { name: 'Reenviar e-mail' }).isVisible());
    check('AC17 hash apagado', (await hash(p)) === '#/entrar' && !/access_token/.test(p.url()), p.url());
    await p.evaluate(() => { location.hash = '#access_token=outro-lixo&type=signup'; });
    await p.waitForTimeout(500);
    check('AC17 em hashchange também: sem "E-mail confirmado" e hash apagado', !/E-mail confirmado/.test(await text(p, '#sign')) && !/access_token/.test(p.url()) && /Não foi possível usar este link/.test(await text(p, '#sign')));
    await p.goto(d.origin + '/#access_token=lixo&type=recovery'); await p.waitForSelector('text=Este link venceu ou já foi usado');
    check('AC17 recuperação com token inválido cai no aviso de link vencido', await p.getByRole('button', { name: 'Reenviar e-mail' }).isVisible());
  });

  await t('AC18 B-3 aria-pressed do Mostrar', open, { width: 390 }, async (d) => {
    const p = d.page; await d.go('#/entrar');
    const b = p.locator('.sg-toggle');
    const st = async () => [await b.getAttribute('aria-pressed'), await b.innerText(), await p.getAttribute('#senha', 'type')];
    check('AC18 início: false, "Mostrar", password', JSON.stringify(await st()) === '["false","Mostrar","password"]', await st());
    await b.click();
    check('AC18 1º clique: true, "Ocultar", text', JSON.stringify(await st()) === '["true","Ocultar","text"]', await st());
    await b.click();
    check('AC18 2º clique: false, "Mostrar", password', JSON.stringify(await st()) === '["false","Mostrar","password"]', await st());
    await d.go('#/criar');
    check('AC18 também em Criar conta', (await p.locator('.sg-toggle').getAttribute('aria-pressed')) === 'false');
  });

  // AC19 estático: modulepreload com URLs idênticas às dos imports e nenhum módulo buscado duas vezes
  const idx = rd('index.html');
  const preload = [...idx.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);
  const graph = new Set(); const todo = ['js/app.js?v=' + VER];
  while (todo.length) {
    const u = todo.pop(); if (graph.has(u)) continue; graph.add(u);
    const file = u.split('?')[0]; const dir = path.posix.dirname(file);
    for (const m of rd(file).matchAll(/from '(\.[^']+)'/g)) todo.push(path.posix.normalize(path.posix.join(dir, m[1])).replace(/^\.\//, ''));
  }
  const modules = [...graph].sort();
  check(`AC19 modulepreload cobre os ${modules.length} módulos do grafo com a mesma URL e ?v=`, JSON.stringify([...preload].sort()) === JSON.stringify(modules), { preload: [...preload].sort(), grafo: modules });
  check('AC19 o ?v= é um só em todos os módulos e no script de entrada', new Set([...preload, idx.match(/type="module" src="([^"]+)"/)[1]].map((x) => x.split('?v=')[1])).size === 1);
  await t('AC19 nenhum módulo buscado duas vezes', open, { width: 390 }, async (d) => {
    const p = d.page; const urls = []; p.on('request', (r) => { if (/\/js\/(app|lib|views)\//.test(r.url()) || /\/js\/app\.js/.test(r.url())) urls.push(r.url()); });
    await d.go('#/entrar'); await login(p, 'pronto@teste.example', PW); await wait(p, () => location.hash === '#/documentos' && document.querySelector('.shell'));
    const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
    check(`AC19 ${urls.length} requisições de módulos, sem repetição`, dup.length === 0 && urls.length === modules.length, { dup, n: urls.length, esperado: modules.length });
  });

  // AC20 dvh
  const css = rd('styles.css');
  const rule = (sel) => { const m = css.match(new RegExp('(^|\\n)' + sel.replace(/[.]/g, '\\.') + ' \\{[^}]*\\}')); return m ? m[0] : ''; };
  check('AC20 .shell: 100vh como linha anterior e 100dvh depois', /height: 100vh; height: 100dvh;/.test(rule('.shell')), rule('.shell'));
  check('AC20 .modal: max-height com dvh e vh de fallback antes', /max-height: calc\(100vh - 48px\); max-height: calc\(100dvh - 48px\);/.test(rule('.modal')), rule('.modal'));
  check('AC20 .auth: min-height 100dvh', /min-height: 100vh; min-height: 100dvh;/.test(rule('.auth')), rule('.auth'));
  await t('AC20 teclado virtual simulado (390x500 e 1280x500)', open, { width: 390, height: 800 }, async (d) => {
    const p = d.page; await logged(d);
    for (const [w, h] of [[390, 500], [1280, 500]]) {
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(100);
      const r = await p.evaluate(async () => {
        const av = document.getElementById('avatar').getBoundingClientRect();
        const btn = document.querySelector('#view a.btn'); btn.scrollIntoView({ block: 'nearest' }); await new Promise((x) => setTimeout(x, 50));
        const b = btn.getBoundingClientRect();
        return { avatar: av.top >= 0 && av.bottom <= innerHeight && av.right <= innerWidth, botao: b.top >= 0 && b.bottom <= innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth, vv: window.visualViewport ? Math.round(window.visualViewport.height) : null };
      });
      check(`AC20 ${w}x${h}: avatar visível, botão alcançável por rolagem e sem rolagem horizontal`, r.avatar && r.botao && !r.hscroll, r);
    }
  });

  // AC26 estático
  const ARQ = ['index.html', 'js/views/shell.js', 'js/lib/ui.js', 'js/views/construcao.js'];
  check('AC26 nenhum <script> inline em index.html', ![...rd('index.html').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].some((m) => m[2].trim() !== ''));
  check('AC26 nenhum style=" em index.html, shell.js, ui.js e construcao.js', ARQ.every((f) => !/style\s*=\s*"/.test(rd(f)) && !/['"]style['"]\s*:/.test(rd(f))), ARQ.filter((f) => /style\s*=\s*"/.test(rd(f))));
  check('AC26 zero innerHTML em shell.js e ui.js', !/innerHTML|outerHTML|insertAdjacentHTML/.test(rd('js/views/shell.js') + rd('js/lib/ui.js')));
  check('AC26 construcao.js e entrar.js também sem innerHTML', !/innerHTML|insertAdjacentHTML/.test(rd('js/views/construcao.js') + rd('js/views/entrar.js')));
  check('AC26 a CSP do _headers não foi afrouxada (sem unsafe-eval; script-src só self)', /script-src 'self';/.test(rd('_headers')) && !/unsafe-eval/.test(rd('_headers')));

  // CLS ao montar o shell e INP do menu do avatar
  for (const w of [390, 1280]) {
    await t('CLS e INP em ' + w, open, { width: w, height: 800 }, async (d) => {
      const p = d.page; await logged(d);
      await p.addInitScript(() => { window.__cls = 0; window.__ev = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ev.push(e.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) { /* sem Event Timing */ } });
      await p.reload(); await p.waitForSelector('.shell #view h1'); await p.waitForFunction(() => { const s = document.querySelector('.org-sub'); return s && !s.hidden; }); await p.waitForTimeout(800);
      const cls = await p.evaluate(() => window.__cls);
      check(`CLS ao montar o shell em ${w}: ${cls.toFixed(4)} <= 0,1`, cls <= 0.1, cls);
      for (let i = 0; i < 5; i++) { await p.click('#avatar'); await p.waitForTimeout(60); await p.keyboard.press('Escape'); await p.waitForTimeout(60); }
      await p.waitForTimeout(300);
      const ev = await p.evaluate(() => window.__ev);
      const worst = ev.length ? Math.max(...ev) : 0;
      check(`INP ao abrir e fechar o menu em ${w}: pior evento ${Math.round(worst)} ms (${ev.length} eventos acima de 16 ms) <= 200`, worst <= 200, ev);
    });
  }
  done();
})();
