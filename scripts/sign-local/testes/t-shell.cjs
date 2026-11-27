// Seção 1.0, shell e navegação: AC1 a AC8, AC21 a AC25 e AC28 (Sign), contra o Supabase falso. Capturas em SHOTS (padrão /tmp/sign-shots-shell).
const { open, overflow } = require('./drv.cjs');
const { check, t, done, hash, text, active, logged } = require('./lib.cjs');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/tmp/sign-shots-shell';
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 6000 });
const L = [320, 360, 390, 768, 1024, 1280, 1920, 2560];
const ROTAS = ['#/documentos', '#/envio/novo', '#/plano', '#/conta/perfil', '#/conta/verificacao', '#/conta/seguranca', '#/onboarding/1', '#/inexistente'];
// 1.3: o onboarding é real; quem já terminou (conta usada nestes testes) é levado a Documentos. Ele é testado à parte com a conta pendente (AC4b, AC21b, AC5).
const ROTAS_FEITO = ROTAS.filter((x) => x !== '#/onboarding/1');
const mainCount = (p) => p.evaluate(() => document.querySelectorAll('main').length);
const tokenKeys = (p) => p.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)));
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; }, sel);

(async () => {
  await t('AC1 shell, 1 main, logo PNG', open, { width: 1280 }, async (d) => {
    const p = d.page;
    await d.go('#/entrar');
    check('AC1 #/entrar: 1 main', (await mainCount(p)) === 1);
    check('AC1 #/entrar: sem .shell', (await p.locator('.shell').count()) === 0);
    await logged(d);
    check('AC1 1 aside.sidenav', (await p.locator('aside.sidenav').count()) === 1);
    check('AC1 1 header.topbar', (await p.locator('header.topbar').count()) === 1);
    check('AC1 #view com 1 h1 "Documentos"', (await p.locator('#view h1').count()) === 1 && (await text(p, '#view h1')) === 'Documentos');
    check('AC1 1 main no documento', (await mainCount(p)) === 1);
    check('AC1 .frame e .content são div', (await p.evaluate(() => document.querySelector('.frame').tagName + document.querySelector('.content').tagName)) === 'DIVDIV');
    check('AC1 logo é o PNG mark-rosa', /img\/mark-rosa\.png/.test(await p.evaluate(() => getComputedStyle(document.querySelector('.org-mark.logo')).backgroundImage)));
    check('AC1 logo com role=img e nome', (await p.getAttribute('.org-mark.logo', 'role')) === 'img' && (await p.getAttribute('.org-mark.logo', 'aria-label')) === 'Lottus');
    check('AC1 sem "Lottus Sign" como marca no corpo', !/Lottus Sign/.test(await p.evaluate(() => document.getElementById('sign').innerText)));
    check('AC1 nome e nível na barra (Ana Exemplo da Silva, Simples)', (await text(p, '.org-name')) === 'Ana Exemplo da Silva' && (await text(p, '.org-sub')) === 'Simples', [await text(p, '.org-name'), await text(p, '.org-sub')]);
    check('AC1 iniciais AS', (await text(p, '#avatar')) === 'AS', await text(p, '#avatar'));
    check('AC1 sem erros de JS/CSP', d.errors.length === 0, d.errors);
    check('AC1 sem requisição externa', d.external.length === 0, d.external);
  });

  await t('Nível derivado de sign_me (cert/verified)', open, { width: 1280 }, async (d) => {
    const p = d.page;
    for (const [modo, esperado] of [['meVerified', 'Avançada'], ['meCert', 'Qualificada'], ['meCertVencido', 'Avançada']]) {
      d.fake.state.mode = { [modo]: true };
      await logged(d);
      check(`nível ${modo} = ${esperado}`, (await text(p, '.org-sub')) === esperado, await text(p, '.org-sub'));
      await p.evaluate(() => { Object.keys(localStorage).filter((k) => /^sb-/.test(k)).forEach((k) => localStorage.removeItem(k)); });
    }
    d.fake.state.mode = { meNoName: true };
    await logged(d);
    check('sem nome: .org-name mostra o e-mail e as iniciais vêm dele', (await text(p, '.org-name')) === 'pronto@teste.example' && (await text(p, '#avatar')) === 'P', [await text(p, '.org-name'), await text(p, '#avatar')]);
  });

  await t('AC2 menu', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d);
    check('AC2 2 itens', (await p.locator('nav.sidenav-items .nav-sec').count()) === 2);
    const nav = await p.evaluate(() => document.querySelector('nav.sidenav-items').textContent);
    check('AC2 sem "Em breve", "Novo envio", "Verificar", "Plano"', !/Em breve|Novo envio|Verificar|Plano/.test(nav), nav);
    check('AC2 rótulos Documentos e Conta', JSON.stringify(await p.$$eval('.nav-btn', (a) => a.map((x) => x.getAttribute('aria-label')))) === '["Documentos","Conta"]');
    check('AC2 Documentos tem aria-current=page', (await p.getAttribute('.nav-btn[aria-label=Documentos]', 'aria-current')) === 'page' && (await p.getAttribute('.nav-btn[aria-label=Conta]', 'aria-current')) === null);
    await p.evaluate(() => { location.hash = '#/conta/seguranca'; });
    await wait(p, () => document.querySelector('#view h1').textContent === 'Conta');
    check('AC2 em Conta, o item Conta fica ativo', (await p.getAttribute('.nav-btn[aria-label=Conta]', 'aria-current')) === 'page' && (await p.getAttribute('.nav-btn[aria-label=Documentos]', 'aria-current')) === null);
    for (const h of ['#/envio/novo', '#/plano']) {
      await p.evaluate((x) => { location.hash = x; }, h); await wait(p, (x) => location.hash === x && document.querySelector('#view h1'), h);
      check(`AC2 ${h}: nenhum item ativo`, (await p.locator('.nav-btn[aria-current]').count()) === 0);
    }
  });

  await t('AC3 navegação sem recriar o shell', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d);
    await p.evaluate(() => { window.__sh = document.querySelector('.shell'); window.__view = document.getElementById('view'); });
    await p.click('.nav-btn[aria-label=Conta]');
    await wait(p, () => location.hash === '#/conta/perfil' && document.querySelector('#view h1').textContent === 'Conta' && document.activeElement.tagName === 'H1');
    check('AC3 o nó .shell é o mesmo', await p.evaluate(() => document.querySelector('.shell') === window.__sh));
    check('AC3 #view segue o mesmo nó com conteúdo novo', await p.evaluate(() => document.getElementById('view') === window.__view && window.__view.querySelector('h1').textContent === 'Conta'));
    check('AC3 foco no h1 Conta', (await p.evaluate(() => document.activeElement.tagName + ':' + document.activeElement.textContent)) === 'H1:Conta');
    check('AC3 aba Perfil .active e aria-current', (await p.getAttribute('nav.tabs a.tab-link.active', 'aria-current')) === 'page' && (await text(p, 'nav.tabs a.active')) === 'Perfil');
    await p.click('nav.tabs >> text=Verificação');
    await wait(p, () => location.hash === '#/conta/verificacao' && document.querySelector('nav.tabs a.active').textContent === 'Verificação');
    check('AC3 clicar Verificação muda a rota e a aba ativa', (await text(p, 'nav.tabs a.active')) === 'Verificação' && (await p.locator('nav.tabs a[aria-current=page]').count()) === 1);
    await p.click('nav.tabs >> text=Segurança'); await wait(p, () => location.hash === '#/conta/seguranca' && document.querySelector('nav.tabs a.active').textContent === 'Segurança');
    check('AC3 aba Segurança', (await text(p, 'nav.tabs a.active')) === 'Segurança');
    check('AC3 o .shell continua o mesmo', await p.evaluate(() => document.querySelector('.shell') === window.__sh));
    check('AC3 nav de abas com nome "Conta"', (await p.getAttribute('nav.tabs', 'aria-label')) === 'Conta');
  });

  await t('AC4 rotas privadas dentro do shell e saídas', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d);
    const SAIDA = { '#/documentos': ['Ir para Conta', '#/conta/perfil'], '#/envio/novo': ['Ir para Documentos', '#/documentos'], '#/plano': ['Ir para Documentos', '#/documentos'], '#/conta/perfil': ['Ir para Documentos', '#/documentos'], '#/conta/verificacao': ['Voltar ao perfil', '#/conta/perfil'], '#/conta/seguranca': ['Ir para Documentos', '#/documentos'], '#/inexistente': ['Ir para Documentos', '#/documentos'] };
    const H1 = { '#/documentos': 'Documentos', '#/envio/novo': 'Novo envio', '#/plano': 'Plano e uso', '#/conta/perfil': 'Conta', '#/conta/verificacao': 'Conta', '#/conta/seguranca': 'Conta', '#/inexistente': 'Página não encontrada' };
    for (const r of Object.keys(SAIDA)) {
      await p.evaluate((x) => { location.hash = x; }, r); await wait(p, (x) => location.hash === x && document.querySelector('#view h1'), r);
      const ok = (await p.locator('.shell').count()) === 1 && (await p.locator('#view h1').count()) === 1 && (await text(p, '#view h1')) === H1[r] && (await p.locator('#view .page-head').count()) === 1;
      check(`AC4 ${r}: dentro do shell com h1 "${H1[r]}" e .page-head`, ok, await text(p, '#view h1'));
      check(`AC4 ${r}: nenhum texto "null" ou "undefined" perdido na tela`, !/\b(null|undefined)\b/.test(await text(p, '#sign')), await text(p, '#view'));
      if (r === '#/inexistente') check('AC4 rota desconhecida mostra "Não encontramos esta página."', /Não encontramos esta página\./.test(await text(p, '#view')));
      const s = SAIDA[r];
      if (!s) { check(`AC4 ${r}: sem botão de menu (saída pelo avatar)`, (await p.locator('#view a.btn, #view button').count()) === 0 && (await p.locator('.sidenav-items .nav-sec').count()) === 0); continue; }
      const btn = r === '#/conta/perfil' ? p.locator('#view a.btn', { hasText: 'Ir para Documentos' }) : r === '#/conta/verificacao' ? p.locator('#view a.btn', { hasText: 'Voltar ao perfil' }) : p.locator('#view a.btn'); // 1.5: a Verificação é uma tela real (vários botões) // 1.4: o Perfil tem também "Ir para Verificação"
      check(`AC4 ${r}: botão "${s[0]}"`, (await btn.count()) === 1 && (await btn.innerText()) === s[0] && (await btn.getAttribute('href')) === s[1], await btn.allInnerTexts());
      await btn.click(); await wait(p, (x) => location.hash === x, s[1]);
      check(`AC4 ${r}: o botão leva a ${s[1]}`, (await hash(p)) === s[1] && (await p.locator('.shell').count()) === 1);
    }
    check('AC4 sem erros de JS/CSP', d.errors.length === 0, d.errors);
    await p.evaluate(() => { location.hash = '#/onboarding/1'; }); await wait(p, () => location.hash === '#/documentos' && document.querySelector('#view h1'));
    check('AC4 (1.3) quem já terminou o onboarding e abre #/onboarding/1 vai a Documentos', (await hash(p)) === '#/documentos');
  });

  await t('AC4b onboarding dentro do shell reduzido com a conta pendente', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d, { email: 'ok@teste.example' });
    check('AC4b #/onboarding/1: dentro do shell, h1 "Seus dados" e .page-head', (await p.locator('.shell').count()) === 1 && (await text(p, '#view h1')) === 'Seus dados' && (await p.locator('#view .page-head').count()) === 1);
    check('AC4b #/onboarding/1: sem botão de menu e sem item de navegação (saída pelo avatar)', (await p.locator('.sidenav-items .nav-sec').count()) === 0 && (await p.locator('#avatar').count()) === 1);
    check('AC4b nenhum "null" ou "undefined" perdido na tela', !/\b(null|undefined)\b/.test(await text(p, '#sign')));
  });

  await t('AC5 onboarding com shell reduzido', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d, { email: 'ok@teste.example' });
    check('AC5 login com onboarding pendente cai em #/onboarding/1', (await hash(p)) === '#/onboarding/1');
    check('AC5 menu sem itens', (await p.locator('nav.sidenav-items .nav-sec').count()) === 0);
    check('AC5 h1 do passo 1 do onboarding (1.3): Seus dados', (await text(p, '#view h1')) === 'Seus dados');
    await p.click('#avatar');
    check('AC5 avatar tem Conta e Sair', (await p.getByRole('link', { name: 'Conta' }).count()) >= 1 && await p.getByRole('button', { name: 'Sair' }).isVisible());
    await p.getByRole('button', { name: 'Sair' }).click();
    await wait(p, () => location.hash === '#/entrar'); await p.waitForSelector('#email');
    check('AC5 Sair funciona: Entrar e sem token', (await hash(p)) === '#/entrar' && (await tokenKeys(p)).length === 0);
  });

  await t('AC6 menu do avatar', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d);
    check('AC6 menu começa oculto', (await p.getAttribute('#avatar', 'aria-expanded')) === 'false' && !(await p.locator('#pmenu').isVisible()));
    await p.click('#avatar');
    check('AC6 clique abre: aria-expanded=true', (await p.getAttribute('#avatar', 'aria-expanded')) === 'true');
    check('AC6 menu mostra nome e e-mail', (await text(p, '.menu-name')) === 'Ana Exemplo da Silva' && (await text(p, '.menu-sub')) === 'pronto@teste.example');
    check('AC6 itens Conta e Sair', (await text(p, '#pmenu a.menu-item')) === 'Conta' && (await text(p, '#pmenu button.menu-item.danger')) === 'Sair');
    await p.keyboard.press('Escape');
    check('AC6 Esc fecha e devolve o foco ao avatar', (await p.getAttribute('#avatar', 'aria-expanded')) === 'false' && (await active(p)) === 'avatar', await active(p));
    await p.keyboard.press('Enter');
    check('AC6 Enter abre', (await p.getAttribute('#avatar', 'aria-expanded')) === 'true');
    await p.keyboard.press('Escape'); await p.keyboard.press('Space');
    check('AC6 Espaço abre', (await p.getAttribute('#avatar', 'aria-expanded')) === 'true');
    await p.click('#view h1');
    check('AC6 clique fora fecha', (await p.getAttribute('#avatar', 'aria-expanded')) === 'false');
    await p.focus('#avatar'); await p.keyboard.press('Enter');
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
    check('AC6 Tab para fora do menu fecha', (await p.getAttribute('#avatar', 'aria-expanded')) === 'false', await active(p));
    // histórico: documentos -> conta (push) -> Sair (replace)
    await p.click('.nav-btn[aria-label=Conta]'); await wait(p, () => location.hash === '#/conta/perfil');
    await p.click('#avatar'); await p.getByRole('button', { name: 'Sair' }).click();
    await wait(p, () => location.hash === '#/entrar'); await p.waitForSelector('#email');
    check('AC6 Sair: #/entrar e localStorage do Auth sem token', (await hash(p)) === '#/entrar' && (await tokenKeys(p)).length === 0, await tokenKeys(p));
    check('AC6 Sair: nenhum .shell no DOM', (await p.locator('.shell').count()) === 0);
    await p.goBack(); await p.waitForSelector('#email'); await p.waitForTimeout(300);
    check('AC6 Voltar não reabre dados privados: Entrar com aviso de sessão', (await hash(p)) === '#/entrar' && /Sua sessão terminou/.test(await text(p, '#sign')) && (await p.locator('.shell').count()) === 0, [await hash(p), await text(p, '#sign')]);
  });

  await t('AC7 visitante', open, { width: 1280 }, async (d) => {
    const p = d.page;
    await p.goto(d.origin + '/#/documentos'); await p.waitForSelector('#email');
    check('AC7 vai a #/entrar com aviso de sessão', (await hash(p)) === '#/entrar' && /Sua sessão terminou/.test(await text(p, '#sign')));
    check('AC7 nenhum .shell no DOM', (await p.locator('.shell').count()) === 0);
    await p.goto(d.origin + '/#/inexistente'); await p.waitForSelector('h1');
    check('AC7 rota desconhecida sem sessão: tela pública com "Ir para o início", sem shell', (await text(p, 'h1')) === 'Página não encontrada' && (await p.getByRole('link', { name: 'Ir para o início' }).count()) === 1 && (await p.locator('.shell').count()) === 0);
  });

  await t('AC8 skip link e ordem de Tab', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d);
    await p.reload(); await p.waitForSelector('#view h1'); await p.waitForTimeout(300);
    check('AC8 no carregamento o foco não é roubado do início da página', (await p.evaluate(() => document.activeElement === document.body)), await active(p));
    const seq = []; const shadows = [];
    for (let i = 0; i < 6; i++) {
      await p.keyboard.press('Tab');
      seq.push(await p.evaluate(() => { const a = document.activeElement; return a.getAttribute('aria-label') || a.textContent.trim(); }));
      shadows.push(await p.evaluate(() => getComputedStyle(document.activeElement).boxShadow));
    }
    check('AC8 ordem: skip link, marca, menu, avatar, conteúdo', JSON.stringify(seq) === JSON.stringify(['Ir para o conteúdo', 'Lottus, início', 'Documentos', 'Conta', 'Perfil', 'Ir para Conta']), seq);
    check('AC8 foco sempre visível (box-shadow do :focus-visible)', shadows.every((s) => s && s !== 'none'), shadows);
    check('AC8 o skip link fica visível ao receber foco', await (async () => { await p.focus('.skip-link'); const b = await box(p, '.skip-link'); return b.w > 40 && b.h >= 44 && b.l >= 0 && b.t >= 0; })());
    await p.keyboard.press('Enter');
    check('AC8 ativar o skip link leva o foco ao h1', (await p.evaluate(() => document.activeElement.tagName)) === 'H1' && (await hash(p)) === '#/documentos');
    check('AC8 skip link é button.sr-only com o texto exato', (await p.evaluate(() => { const e = document.querySelector('.skip-link'); return e.tagName + e.className + e.textContent; })) === 'BUTTONsr-only skip-linkIr para o conteúdo');
  });

  // AC21: anti-corte em todas as larguras, com nome de 60 letras, e-mail de 254, .page-sub longo e toasts longos
  const LONG = 'a'.repeat(240) + '@teste.example';
  await t('AC21 anti-corte', open, { width: 390 }, async (d) => {
    const p = d.page;
    d.fake.state.users.set(LONG, { id: 'u-9', email: LONG, password: 'senha-correta-1', confirmed: true, onboarding_done: true });
    d.fake.state.mode.meName = true;
    await logged(d, { email: LONG });
    await p.evaluate(() => { const s = document.querySelector('.page-sub'); if (s) s.textContent = 'palavra'.repeat(40) + ' ' + 'x'.repeat(120); });
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); u.toast('T'.repeat(90), 'm'.repeat(200), 'error'); u.toast('Dados salvos <b>não</b>', 'longa '.repeat(60), 'ok'); }, require('./lib.cjs').VER);
    check('AC21 texto do usuário com <b> aparece como texto', await p.evaluate(() => document.querySelector('#toast-root .toast.ok .toast-title').textContent === 'Dados salvos <b>não</b>' && !document.querySelector('#toast-root b')));
    await p.click('#avatar');
    for (const w of L) {
      await p.setViewportSize({ width: w, height: w >= 1280 ? 900 : 800 });
      await p.waitForTimeout(80);
      const o = await overflow(p);
      check(`AC21 ${w}: sem rolagem horizontal e nada além da borda`, !o.hscroll && o.over.length === 0, o);
      const f = await p.evaluate(() => {
        const bad = [];
        for (const e of document.querySelectorAll('#toast-root *, .menu, .menu *, .topbar *')) { const b = e.getBoundingClientRect(); if (b.width && (b.right > innerWidth + 0.5 || b.left < -0.5)) bad.push(e.className || e.tagName); }
        const av = document.getElementById('avatar').getBoundingClientRect();
        const wraps = ['.org-name', '.menu-name', '.menu-sub'].map((s) => { const e = document.querySelector(s); return e ? [s, e.scrollWidth <= e.clientWidth + 1] : [s, true]; });
        return { bad, avatar: { l: av.left, r: av.right, t: av.top, b: av.bottom, w: av.width, h: av.height }, wraps, vw: innerWidth };
      });
      check(`AC21 ${w}: topbar, menu e toasts dentro da tela`, f.bad.length === 0, f.bad.slice(0, 4));
      check(`AC21 ${w}: avatar inteiro e visível`, f.avatar.l >= 0 && f.avatar.r <= f.vw && f.avatar.t >= 0 && f.avatar.w >= 43.5 && f.avatar.h >= 43.5, f.avatar);
      check(`AC21 ${w}: nome e e-mail quebram linha (sem estouro interno)`, f.wraps.every((x) => x[1]), f.wraps);
      await p.screenshot({ path: `${SHOTS}/doc-menu-${w}.png`, animations: 'disabled', caret: 'hide' });
    }
    check('AC21 sem erros de JS/CSP', d.errors.length === 0, d.errors);
  });

  await t('AC21 capturas por rota e largura', open, { width: 390 }, async (d) => {
    const p = d.page; await logged(d);
    for (const w of L) {
      await p.setViewportSize({ width: w, height: w >= 1280 ? 900 : 800 });
      for (const r of ROTAS_FEITO) {
        await p.evaluate((x) => { location.hash = x; }, r); await wait(p, (x) => location.hash === x && document.querySelector('#view h1'), r);
        await p.waitForTimeout(60);
        const o = await overflow(p);
        if (o.hscroll || o.over.length) check(`AC21 ${w} ${r}: sem corte`, false, o);
        await p.screenshot({ path: `${SHOTS}/rota-${w}-${r.replace(/[#/]+/g, '_')}.png`, animations: 'disabled', caret: 'hide' });
      }
    }
    check(`AC21 ${L.length * ROTAS_FEITO.length} capturas (1 por largura e rota), sem corte em nenhuma`, fs.readdirSync(SHOTS).filter((f) => f.startsWith('rota-')).length === L.length * ROTAS_FEITO.length);
  });

  await t('AC21b onboarding (1.3) por largura com a conta pendente: sem corte', open, { width: 390 }, async (d) => {
    const p = d.page; await logged(d, { email: 'ok@teste.example' });
    for (const w of L) {
      await p.setViewportSize({ width: w, height: w >= 1280 ? 900 : 800 });
      await p.evaluate((x) => { location.hash = x; }, '#/onboarding/1'); await wait(p, () => location.hash === '#/onboarding/1' && document.querySelector('#ob-h'));
      await p.waitForTimeout(100);
      const o = await overflow(p);
      check(`AC21b ${w} #/onboarding/1: sem corte`, !o.hscroll && !o.over.length, o);
      await p.screenshot({ path: `${SHOTS}/onb-rota-${w}-_onboarding_1.png`, animations: 'disabled', caret: 'hide' });
    }
  });

  await t('AC22 cinco itens em 320', open, { width: 320, height: 568 }, async (d) => {
    const p = d.page; await logged(d);
    await p.evaluate(() => { const nav = document.querySelector('.sidenav-items'); const base = nav.firstElementChild; while (nav.children.length < 5) nav.append(base.cloneNode(true)); });
    const r = await p.evaluate(() => {
      const items = [...document.querySelectorAll('.sidenav-items .nav-btn')];
      const side = document.querySelector('.sidenav');
      return { n: items.length, boxes: items.map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, h: b.height }; }), sideScroll: side.scrollWidth <= side.clientWidth, page: document.documentElement.scrollWidth <= innerWidth };
    });
    check('AC22 5 itens', r.n === 5);
    check('AC22 todos dentro da largura e com 44x44 ou mais', r.boxes.every((b) => b.l >= 0 && b.r <= 320 && b.w >= 43.5 && b.h >= 43.5), r.boxes);
    check('AC22 sem rolagem horizontal da faixa nem da página', r.sideScroll && r.page);
    check('AC22 a marca da faixa some em 320 (fica na topbar)', await p.evaluate(() => getComputedStyle(document.querySelector('.sidenav-mark')).display === 'none' && document.querySelector('.org-mark.logo').getBoundingClientRect().width > 0));
  });

  for (const w of [320, 1280]) {
    await t('AC23 zoom 200% em ' + w, open, { width: w / 2, height: 500, scale: 2 }, async (d) => {
      const p = d.page; await logged(d);
      const visited = new Set(); const order = [];
      const rodada = async (nome, n = 10) => {
        const o = await overflow(p);
        check(`AC23 ${w} ${nome}: sem rolagem horizontal`, !o.hscroll && o.over.length === 0, o);
        await p.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
        for (let i = 0; i < n; i++) {
          await p.keyboard.press('Tab');
          const r = await p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const b = a.getBoundingClientRect(); return { id: a.getAttribute('aria-label') || a.textContent.trim().slice(0, 24), vis: b.right > 0 && b.left < innerWidth }; });
          if (r) { visited.add(r.id); order.push(r.id); if (!r.vis) check(`AC23 ${w} ${nome}: foco dentro da largura em ${r.id}`, false, r); }
        }
      };
      await rodada('Documentos');
      check(`AC23 ${w} Documentos: Tab alcança menu, avatar e botão`, ['Documentos', 'Conta', 'Perfil', 'Ir para Conta'].every((x) => visited.has(x)), [...visited]);
      await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await wait(p, () => location.hash === '#/conta/perfil' && document.querySelector('#view h1'));
      visited.clear(); await rodada('Conta', 18); // 1.4: o Perfil tem mais itens de Tab (campos, links)
      check(`AC23 ${w} Conta: Tab alcança menu, avatar, abas e botão`, ['Documentos', 'Perfil', 'Verificação', 'Segurança', 'Ir para Documentos'].every((x) => visited.has(x)), [...visited]);
      await p.click('#avatar');
      const o = await overflow(p);
      check(`AC23 ${w} menu do avatar aberto: sem rolagem horizontal`, !o.hscroll && o.over.length === 0, o);
      const ordem = await p.evaluate(() => { const els = [...document.querySelectorAll('.skip-link, .sidenav a, .avatar, .menu-item, .tab-link, #view .btn')]; const pos = els.map((e) => e.compareDocumentPosition(document.querySelector('.shell'))); return els.length; });
      check(`AC23 ${w} ordem de leitura do DOM: skip, menu, avatar, conteúdo`, order.indexOf('Ir para o conteúdo') < order.indexOf('Documentos') && order.indexOf('Documentos') < order.indexOf('Perfil') && ordem > 5, order.slice(0, 12));
    });
  }

  await t('AC24 alvos de 44 px', open, { width: 390 }, async (d) => {
    const p = d.page; await logged(d);
    for (const w of L) {
      await p.setViewportSize({ width: w, height: 800 });
      await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await wait(p, () => location.hash === '#/conta/perfil' && document.querySelector('nav.tabs'));
      await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); u.toast('Aviso', 'Mensagem', 'ok'); }, require('./lib.cjs').VER);
      await p.waitForTimeout(400); await p.click('#avatar');
      const small = await p.evaluate(() => [...document.querySelectorAll('.avatar, .menu-item, .nav-btn, .tab-link, #view .btn, #view a.btn, .toast-close, .skip-link')].filter((e) => e.getClientRects().length && !e.classList.contains('skip-link')).map((e) => { const b = e.getBoundingClientRect(); return { n: e.className || e.tagName, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; }).filter((x) => x.w < 43.5 || x.h < 43.5));
      check(`AC24 ${w}: avatar, menu, itens, abas, botão e fechar do toast com 44 px ou mais`, small.length === 0, small);
      await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('#toast-root .toast').forEach((e) => e.remove()));
    }
  });

  await t('AC25 teclado, leitor e título', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d);
    const alive = async () => (await p.evaluate(() => document.activeElement !== document.body && document.activeElement !== null));
    await p.focus('#avatar'); await p.keyboard.press('Enter');
    check('AC25 Enter abre o menu', (await p.getAttribute('#avatar', 'aria-expanded')) === 'true' && (await alive()));
    await p.keyboard.press('Escape');
    check('AC25 Esc fecha e o foco não some', (await p.getAttribute('#avatar', 'aria-expanded')) === 'false' && (await active(p)) === 'avatar');
    check('AC25 aria-live só em #toast-root (e nas mensagens da 1.1)', await p.evaluate(() => [...document.querySelectorAll('[aria-live]')].every((e) => e.id === 'toast-root' || e.closest('.sg-msg'))));
    check('AC25 aria-live fora de main, #view e .shell', (await p.locator('main[aria-live], #view[aria-live], .shell[aria-live], #view [aria-live], .shell [aria-live]').count()) === 0);
    const antes = await p.title();
    await p.click('.nav-btn[aria-label=Conta]'); await wait(p, () => location.hash === '#/conta/perfil' && document.title === 'Perfil · Conta · Lottus Sign');
    check('AC25 rota nova: <title> atualiza', antes === 'Documentos · Lottus Sign' && (await p.title()) === 'Perfil · Conta · Lottus Sign', [antes, await p.title()]);
    check('AC25 rota nova: foco no h1', (await p.evaluate(() => document.activeElement.tagName)) === 'H1');
    await p.evaluate(() => { location.hash = '#/plano'; }); await wait(p, () => location.hash === '#/plano');
    check('AC25 título de Plano e uso', (await p.title()) === 'Plano e uso · Lottus Sign');
    check('AC25 flyouts ocultos do leitor (nome vem do aria-label)', (await p.locator('.flyout[aria-hidden=true]').count()) === 2);
  });

  await t('AC28 links percorridos e F5', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d); const log = [];
    const via = async (nome, sel, esperado) => { await p.click(sel); await wait(p, (x) => location.hash === x, esperado).catch(() => {}); const h = await hash(p); log.push(`${nome} -> ${h}`); check(`AC28 ${nome} leva a ${esperado}`, h === esperado, h); };
    await via('item de menu Conta', '.nav-btn[aria-label=Conta]', '#/conta/perfil');
    await via('item de menu Documentos', '.nav-btn[aria-label=Documentos]', '#/documentos');
    await via('marca da faixa (sidenav-mark)', '.nav-btn[aria-label=Conta]', '#/conta/perfil');
    await via('marca da faixa -> Documentos', '.sidenav-mark', '#/documentos');
    await via('botão "Ir para Conta"', '#view a.btn', '#/conta/perfil');
    await via('botão "Ir para Documentos"', '#view a.btn:has-text("Ir para Documentos")', '#/documentos');
    await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await wait(p, () => location.hash === '#/conta/perfil');
    await p.click('.org-link', { force: true }); await wait(p, () => location.hash === '#/documentos');
    check('AC28 logo da topbar leva a #/documentos', (await hash(p)) === '#/documentos');
    await p.click('#avatar'); await p.getByRole('link', { name: 'Conta' }).last().click(); await wait(p, () => location.hash === '#/conta/perfil');
    check('AC28 avatar > Conta leva a #/conta/perfil e fecha o menu', (await hash(p)) === '#/conta/perfil' && (await p.getAttribute('#avatar', 'aria-expanded')) === 'false');
    await via('aba Verificação', 'nav.tabs >> text=Verificação', '#/conta/verificacao');
    await via('aba Segurança', 'nav.tabs >> text=Segurança', '#/conta/seguranca');
    await via('aba Perfil', 'nav.tabs >> text=Perfil', '#/conta/perfil');
    for (const r of ROTAS_FEITO) {
      await p.evaluate((x) => { location.hash = x; }, r); await wait(p, (x) => location.hash === x && document.querySelector('#view h1'), r);
      const h1 = await text(p, '#view h1');
      await p.reload(); await p.waitForSelector('.shell #view h1'); await p.waitForTimeout(200);
      check(`AC28 F5 em ${r}: mesma rota, dentro do shell, mesmo h1`, (await hash(p)) === r && (await p.locator('.shell').count()) === 1 && (await text(p, '#view h1')) === h1, [await hash(p), await text(p, '#view h1')]);
    }
    check('AC28 sem erros de JS/CSP', d.errors.length === 0, d.errors);
    console.info(log.join('\n'));
  });

  await t('Erro de sign_me: aviso e shell usável', open, { width: 390, cfg: { timeoutMs: 1500 } }, async (d) => {
    const p = d.page;
    await d.go('#/entrar');
    await p.evaluate(() => 0);
    await require('./lib.cjs').login(p, 'pronto@teste.example', 'senha-correta-1');
    await wait(p, () => location.hash === '#/documentos' && document.querySelector('.shell'));
    await p.waitForTimeout(300);
    d.fake.state.mode.meDown = true;
    await p.evaluate(() => { location.hash = '#/plano'; }); // 1.4: #/conta/perfil mostra o erro na própria tela (t-perfil.cjs)
    await p.reload(); await p.waitForSelector('.shell .banner.danger', { timeout: 8000 });
    check('estado erro: .banner.danger com o texto exato', (await text(p, '.shell-notice .banner.danger')).startsWith('Não foi possível carregar seus dados. Verifique sua conexão.'));
    check('estado erro: botão Tentar de novo', await p.getByRole('button', { name: 'Tentar de novo' }).isVisible());
    check('estado erro: menu e Sair seguem usáveis', (await p.locator('.nav-btn').count()) === 2 && (await p.locator('#avatar').isVisible()));
    d.fake.state.mode.meDown = false;
    await p.getByRole('button', { name: 'Tentar de novo' }).click();
    await p.waitForFunction(() => !document.querySelector('.shell .banner') && document.querySelector('.org-sub') && !document.querySelector('.org-sub').hidden, null, { timeout: 8000 });
    check('tentar de novo carrega nome e nível e remove o aviso', (await text(p, '.org-name')) === 'Ana Exemplo da Silva');
  });
  done();
})();
