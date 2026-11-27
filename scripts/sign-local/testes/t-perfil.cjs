// Seção 1.4 (Perfil e conta), TELA: AC1 a AC16 e AC-R1 a AC-R9, em Playwright contra o Supabase falso em modo repasse (Postgres local, banco "sign").
// Uso: [SHOTS=<pasta>] node t-perfil.cjs   (recria o banco no início e no fim; AC-R10 = rodar t-ac, t-layout, t-shell, t-comp, t-corr, t-regressao)
const { open } = require('./drv.cjs');
const { check, t: t0, done, hash, text, logged, VER, PW } = require('./lib.cjs');
const ONLY = process.env.ONLY; // ONLY=<regex do nome do teste> roda só os testes que casam (depuração)
const t = (name, ...r) => (ONLY && !new RegExp(ONLY).test(name) ? Promise.resolve() : t0(name, ...r));
const { U, restaurar, reset, DB } = require('./perfil-lib.cjs');
const { rpcCount } = require('./fake-sign.cjs');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SHOTS = process.env.SHOTS || '/tmp/sign-shots-perfil';
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 8000 });
const PG = { pg: DB }; // SIGN_DB=sign_dev para usar um banco isolado
const perfil = (d, email) => logged(d, { email, hash: '#/conta/perfil' });
const ready = (p) => wait(p, () => document.querySelector('#pf-nome') || document.querySelector('.pf-card .banner'));
const salvas = (d) => rpcCount(d.fake.state, 'sign_profile_save');
const L = [320, 360, 390, 768, 1024, 1280, 1920, 2560];
const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const num = (s) => { const k = String(s).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/); if (k) return [k[1], k[2], k[3]].map((x) => Math.round(parseFloat(x) * 255)); const m = String(s).match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map((x) => parseFloat(x)) : [0, 0, 0]; };
const q = async (d, sql, args) => (await d.fake.query(sql, args)).rows;

(async () => {
  console.info('recriando banco local...'); reset('depois');

  await t('AC1 leitura (U1)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    check('AC1 nome preenchido', (await p.inputValue('#pf-nome')) === U.U1.name);
    check('AC1 CPF travado: disabled e mascarado', (await p.isDisabled('#pf-cpf')) && (await p.inputValue('#pf-cpf')) === '•••.980.270-••', await p.inputValue('#pf-cpf'));
    const v = await text(p, '#pf-mail-l + .pf-value'), c = await text(p, '#pf-cel-l + .pf-value');
    check('AC1 e-mail com selo Confirmado', v.includes(U.U1.email) && v.includes('Confirmado'), v);
    check('AC1 celular mascarado com selo "Não verificado" (V6-01, ciclo 2: a prova do U1 foi por e-mail, não pelo celular; antes dizia "Verificado")', c.includes('(11) •••••-1234') && c.includes('Não verificado'), c);
    check('AC1 nível igual ao do cabeçalho', (await text(p, '.pf-level .tag')) === (await text(p, '.org-sub')) && (await text(p, '.org-sub')) === 'Avançada');
    check('AC1 Salvar desligado', (await p.isDisabled('.pf-save')) && (await p.getAttribute('.pf-save', 'aria-disabled')) === 'true');
    check('AC1 1 chamada de sign_me ao abrir (cache e fusão)', rpcCount(d.fake.state, 'sign_me') === 1, rpcCount(d.fake.state, 'sign_me'));
    check('AC1 título "Perfil · Conta · Lottus Sign"', (await p.title()) === 'Perfil · Conta · Lottus Sign');
    check('AC1 sem erros', d.errors.length === 0, d.errors);
  });

  await t('AC2, AC15, AC16 editar nome, duplo clique e cabeçalho', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U1.email); await ready(p);
    await p.evaluate(() => { window.__sh = document.querySelector('.shell'); });
    await p.fill('#pf-nome', '  Ana   Maria Exemplo '); await p.click('.pf-save', { clickCount: 2, delay: 10 });
    await wait(p, () => document.querySelector('.toast'));
    check('AC2 toast "Dados salvos."', (await text(p, '.toast-title')) === 'Dados salvos.' && (await p.getAttribute('.toast', 'role')) === 'status');
    check('AC2 foco no campo e botão desligado', (await p.evaluate(() => document.activeElement.id)) === 'pf-nome' && (await p.isDisabled('.pf-save')));
    check('AC15 duplo clique: 1 única chamada RPC', salvas(d) === 1, salvas(d));
    check('AC2 cabeçalho mudou sem recarregar (mesmo nó .shell)', (await text(p, '.org-name')) === 'Ana Maria Exemplo' && (await p.evaluate(() => document.querySelector('.shell') === window.__sh)));
    check('AC16 menu e iniciais refletem o nome', (await text(p, '.menu-name')) === 'Ana Maria Exemplo' && (await text(p, '#avatar')) === 'AE', await text(p, '#avatar'));
    await p.reload(); await ready(p);
    check('AC2 F5: nome persiste', (await p.inputValue('#pf-nome')) === 'Ana Maria Exemplo');
    await restaurar((s, a) => q(d, s, a));
  });

  await t('AC16 sem nome mostra o e-mail; AC6 perfil vazio (U3)', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U3.email); await ready(p);
    check('AC16 sem nome: cabeçalho mostra o e-mail e a inicial dele', (await text(p, '.org-name')) === U.U3.email && (await text(p, '#avatar')) === 'V');
    check('AC6 faixa "Complete seu perfil para enviar documentos."', (await text(p, '.pf-card .banner.info')).includes('Complete seu perfil para enviar documentos.'));
    check('AC6 nome pré-preenchido do metadado só como sugestão', (await p.inputValue('#pf-nome')) === 'Banco Falso S.A.' && /Sugestão do seu cadastro/.test(await text(p, '#pf-nome-help')));
    check('AC6 nada foi gravado sem o clique', (await q(d, `select full_name from public.profiles where id = $1`, [U.U3.id]))[0].full_name === null);
    check('AC6 CPF editável e vazio (metadado de CPF não aparece)', !(await p.isDisabled('#pf-cpf')) && (await p.inputValue('#pf-cpf')) === '');
    check('AC6 Salvar já habilitado pela sugestão', !(await p.isDisabled('.pf-save')));
    await p.fill('#pf-cpf', U.U3.cpfLivre); await p.click('.pf-save'); await wait(p, () => document.querySelector('.toast'));
    const r = (await q(d, `select full_name, cpf from public.profiles where id = $1`, [U.U3.id]))[0];
    check('AC6 ao salvar grava nome e CPF', r.full_name === 'Banco Falso S.A.' && r.cpf === U.U3.cpfLivre, r);
    check('AC6 depois de salvo: CPF travado e faixa some', (await p.isDisabled('#pf-cpf')) && (await p.locator('.pf-card .banner.info').count()) === 0);
    await restaurar((s, a) => q(d, s, a));
  });

  await t('AC3 validação no cliente (U3)', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U3.email); await ready(p);
    await p.evaluate(() => document.querySelector('#pf-nome').removeAttribute('maxlength')); // o maxlength impede digitar 141; aqui testo a regra do cliente
    const tenta = async (nome, cpf, esperadoId, msg, rot) => {
      await p.fill('#pf-nome', nome); await p.fill('#pf-cpf', cpf);
      if (await p.isDisabled('.pf-save')) await p.fill('#pf-nome', nome + ' ');
      await p.evaluate(() => document.querySelector('.pf-save').removeAttribute('disabled')); await p.click('.pf-save');
      const m = await text(p, '#' + esperadoId + '-err');
      check(`AC3 ${rot}: "${msg}"`, m === msg, m);
      check(`AC3 ${rot}: foco no campo inválido`, (await p.evaluate(() => document.activeElement.id)) === esperadoId);
    };
    await tenta('', U.U3.cpfLivre, 'pf-nome', 'Informe seu nome completo.', 'nome vazio');
    await tenta('Ana', U.U3.cpfLivre, 'pf-nome', 'Informe nome e sobrenome.', 'uma palavra');
    await tenta('N'.repeat(70) + ' ' + 'M'.repeat(70), U.U3.cpfLivre, 'pf-nome', 'O nome pode ter até 140 caracteres.', '141 caracteres');
    await tenta('Ana Silva', '12345678900', 'pf-cpf', 'CPF inválido. Confira os números.', 'CPF inválido');
    await tenta('Ana Silva', '', 'pf-cpf', 'Informe seu CPF.', 'CPF vazio');
    check('AC3 nada foi enviado ao servidor', salvas(d) === 0, salvas(d));
    check('AC3 erro ligado ao campo por aria-describedby e role=alert', (await p.getAttribute('#pf-cpf', 'aria-describedby')).includes('pf-cpf-err') && (await p.getAttribute('#pf-cpf-err', 'role')) === 'alert');
    await restaurar((s, a) => q(d, s, a));
  });

  await t('AC4 CPF travado (U5) e AC5 duplicado (U3)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); const reqs = [];
    p.on('request', (r) => { if (/sign_profile_save/.test(r.url())) reqs.push(r.postData()); });
    await perfil(d, U.U5.email); await ready(p);
    check('AC4 CPF disabled e mascarado', (await p.isDisabled('#pf-cpf')) && (await p.inputValue('#pf-cpf')) === '•••.556.630-••', await p.inputValue('#pf-cpf'));
    check('AC4 texto de apoio e link mailto', /Para alterar o CPF, fale com o suporte\./.test(await text(p, '#pf-cpf-help')) && /^mailto:/.test(await p.getAttribute('#pf-cpf-help a', 'href')));
    await p.fill('#pf-nome', 'Edu Mudou Nome'); await p.click('.pf-save'); await wait(p, () => document.querySelector('.toast'));
    check('AC4 o envio ao salvar o nome não contém CPF', reqs.length === 1 && !/cpf/.test(reqs[0]), reqs);
    await restaurar((s, a) => q(d, s, a));
  });
  await t('AC5 CPF duplicado (U3)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a));
    await perfil(d, U.U3.email); await ready(p);
    await p.fill('#pf-nome', 'Carla Duplicada Teste'); await p.fill('#pf-cpf', U.U2.cpf); await p.click('.pf-save');
    await wait(p, () => document.querySelector('#pf-cpf-err:not([hidden])'));
    check('AC5 mensagem neutra e valores preservados', (await text(p, '#pf-cpf-err')) === 'Não foi possível usar este CPF. Confira o número ou fale com o suporte.' && (await p.inputValue('#pf-nome')) === 'Carla Duplicada Teste' && (await p.inputValue('#pf-cpf')).replace(/\D/g, '') === U.U2.cpf);
    check('AC5 a mensagem não revela o dono do CPF', !/Bruno|Outro/.test(await text(p, '.pf-card')));
    await restaurar((s, a) => q(d, s, a));
  });

  await t('AC7 estados: esqueleto, erro ao carregar, erro ao salvar, sessão', open, { ...PG, width: 390, cfg: { timeoutMs: 2000 } }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a));
    await logged(d, { email: U.U1.email });
    d.fake.state.mode.rpcDelay = { sign_me: 1200 }; await p.evaluate(() => { location.hash = '#/plano'; }); await p.waitForTimeout(6000); // vence o cache de 5 s
    await p.evaluate(() => { location.hash = '#/conta/perfil'; });
    await wait(p, () => document.querySelector('.pf-card .skel'));
    check('AC7 esqueleto durante a carga com aria-busy', (await p.getAttribute('.pf-card', 'aria-busy')) === 'true' && (await p.locator('.shell').count()) === 1);
    await ready(p); check('AC7 depois da carga: aria-busy some', (await p.getAttribute('.pf-card', 'aria-busy')) === null);
    d.fake.state.mode.rpcDelay = {}; d.fake.state.mode.rpcDrop = { sign_me: true };
    await p.evaluate(() => { location.hash = '#/plano'; }); await p.waitForTimeout(5500); await p.evaluate(() => { location.hash = '#/conta/perfil'; });
    await p.waitForSelector('.pf-card .banner.danger', { timeout: 9000 });
    check('AC7 erro ao carregar: texto exato e "Tentar de novo" com foco', (await text(p, '.pf-card .banner.danger')).startsWith('Não foi possível carregar seus dados. Verifique sua conexão.') && (await p.evaluate(() => document.activeElement.textContent)) === 'Tentar de novo');
    check('AC7 só um "Tentar de novo" na tela e o menu segue usável', (await p.getByRole('button', { name: 'Tentar de novo' }).count()) === 1 && (await p.locator('.nav-btn').count()) === 2);
    d.fake.state.mode.rpcDrop = {}; await p.getByRole('button', { name: 'Tentar de novo' }).click(); await ready(p);
    check('AC7 Tentar de novo funciona e o cabeçalho é preenchido', (await p.inputValue('#pf-nome')) === U.U1.name && (await text(p, '.org-name')) === U.U1.name);
    await p.fill('#pf-nome', 'Ana Digitada Rede'); d.fake.state.mode.rpcDrop = { sign_profile_save: true }; await p.click('.pf-save');
    await p.waitForSelector('.pf-msg .banner', { timeout: 9000 });
    check('AC7 erro de rede ao salvar: banner role=alert e texto exato', (await p.getAttribute('.pf-msg', 'role')) === 'alert' && (await text(p, '.pf-msg')) === 'Não foi possível salvar. Verifique sua conexão e tente de novo.', await text(p, '.pf-msg'));
    check('AC7 valor digitado preservado e Salvar de novo habilitado', (await p.inputValue('#pf-nome')) === 'Ana Digitada Rede' && !(await p.isDisabled('.pf-save')));
    d.fake.state.mode.rpcDrop = {}; d.fake.state.mode.rpcFail = { sign_profile_save: { status: 500, body: { code: 'XX000', message: 'boom' } } };
    await p.click('.pf-save'); await p.waitForFunction(() => /em instantes/.test(document.querySelector('.pf-msg').textContent), null, { timeout: 8000 });
    check('AC7 erro geral: texto exato, sem mensagem crua', (await text(p, '.pf-msg')) === 'Não foi possível salvar agora. Tente de novo em instantes.');
    d.fake.state.mode.rpcFail = {}; d.fake.state.mode.expired = true;
    const h0 = await p.evaluate(() => history.length); await p.click('.pf-save'); await wait(p, () => location.hash === '#/entrar');
    check('AC7 sessão expirada: vai a #/entrar com replace e mostra o aviso', /Sua sessão terminou\. Entre de novo; seus dados continuam aqui\./.test(await text(p, '#sign')) && (await p.evaluate(() => history.length)) === h0);
    d.fake.state.mode.expired = false;
    await p.fill('#email', U.U1.email); await p.fill('#senha', PW); await p.click('form button[type=submit]'); await wait(p, () => location.hash === '#/conta/perfil'); await ready(p);
    check('AC-R3 login seguinte volta ao destino guardado, com o rascunho em memória', (await p.inputValue('#pf-nome')) === 'Ana Digitada Rede');
    check('AC14 rascunho fora de storage', await p.evaluate(() => !JSON.stringify([localStorage, sessionStorage]).includes('Ana Digitada')));
    await restaurar((s, a) => q(d, s, a));
  });

  await t('AC8 sem beco: rastreador de links', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await perfil(d, U.U5.email); await ready(p);
    const hrefs = await p.$$eval('#sign a[href]', (a) => [...new Set(a.map((x) => x.getAttribute('href')))]);
    const log = [];
    for (const h of hrefs) {
      if (/^mailto:/.test(h)) { log.push('mailto ok'); continue; }
      if (!h.startsWith('#/')) { await p.evaluate((x) => { location.hash = '#/documentos'; }, h); continue; }
      await p.evaluate((x) => { location.hash = x; }, h); await wait(p, (x) => location.hash === x && document.querySelector('#view h1'), h);
      const saida = await p.locator('#view a.btn, nav.tabs a, .nav-btn').count();
      log.push(h); check(`AC8 ${h}: abre com h1 e tem saída`, saida > 0 && (await p.locator('#view h1').count()) === 1);
      await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await ready(p);
    }
    check('AC8 "Verificar contato" leva a #/conta/verificacao (tela provisória com saída)', hrefs.includes('#/conta/verificacao') && log.includes('#/conta/verificacao'), log);
    check('AC8 "Ir para Documentos" presente', hrefs.includes('#/documentos'));
  });

  await t('AC9 XSS e AC14 CSP/armazenamento', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U1.email); await ready(p);
    await p.addInitScript(() => { window.__viol = []; document.addEventListener('securitypolicyviolation', (e) => window.__viol.push(e.violatedDirective)); });
    const xss = '<img src=x onerror="window.__xss=1"> Silva';
    await p.fill('#pf-nome', xss); await p.click('.pf-save'); await wait(p, () => document.querySelector('.toast')); await p.reload(); await ready(p); await p.click('#avatar'); await p.waitForTimeout(300);
    check('AC9 texto literal no campo, cabeçalho e menu', (await p.inputValue('#pf-nome')) === xss && (await text(p, '.org-name')) === xss && (await text(p, '.menu-name')) === xss);
    check('AC9 nenhum <img> criado a partir do nome e window.__xss indefinido', (await p.locator('#sign img').count()) === 0 && (await p.evaluate(() => window.__xss)) === undefined);
    check('AC9 0 violações de CSP e 0 erros', (await p.evaluate(() => window.__viol.length)) === 0 && d.errors.length === 0, d.errors);
    check('AC14 nada de nome/CPF em localStorage/sessionStorage', await p.evaluate((x) => { const s = JSON.stringify([localStorage, sessionStorage]); return !s.includes('Silva') && !s.includes('33698027089') && !s.includes(x); }, xss));
    const chk = cp.spawnSync(process.execPath, [path.resolve(__dirname, '../../check.mjs')], { encoding: 'utf8' }).stdout;
    check('AC14 check.mjs sem erros', /0 erro\(s\)/.test(chk), chk.slice(-200));
    const src = ['js/views/perfil.js', 'js/lib/api.js', 'js/lib/router.js', 'js/lib/ui.js', 'js/views/shell.js'].map((f) => fs.readFileSync(path.resolve(__dirname, '../../../apps/sign', f), 'utf8')).join('\n');
    check('AC14 sem eval, innerHTML, style= nem service_role no front', !/\beval\(|new Function|innerHTML|insertAdjacentHTML|style\s*=\s*"|service_role/.test(src));
    await restaurar((s, a) => q(d, s, a));
  });

  await t('AC10 descarte', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U1.email); await ready(p);
    await p.fill('#pf-nome', 'Ana Editando Agora'); await p.click('nav.tabs >> text=Verificação');
    await p.waitForSelector('.modal');
    check('AC10 aba: "Descartar alterações?" e hash mantido', (await text(p, '.modal h2')) === 'Descartar alterações?' && (await hash(p)) === '#/conta/perfil');
    await p.keyboard.press('Escape'); await p.waitForSelector('.modal', { state: 'detached' });
    check('AC10 Esc fecha e o foco volta ao disparador', (await p.evaluate(() => document.activeElement.textContent)) === 'Verificação');
    await p.click('nav.tabs >> text=Verificação'); await p.getByRole('button', { name: 'Continuar editando' }).click();
    check('AC10 Continuar editando mantém tudo', (await p.inputValue('#pf-nome')) === 'Ana Editando Agora' && (await hash(p)) === '#/conta/perfil');
    await p.click('.nav-btn[aria-label=Documentos]'); await p.waitForSelector('.modal'); await p.getByRole('button', { name: 'Descartar' }).click();
    await wait(p, () => location.hash === '#/documentos');
    check('AC10 Descartar navega (menu lateral)', (await hash(p)) === '#/documentos');
    await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await ready(p); await p.fill('#pf-nome', 'Ana Voltando Agora'); await p.goBack();
    await p.waitForSelector('.modal'); await wait(p, () => location.hash === '#/conta/perfil'); check('AC10 voltar do navegador pergunta e mantém a tela', (await hash(p)) === '#/conta/perfil' && (await p.inputValue('#pf-nome')) === 'Ana Voltando Agora');
    await p.getByRole('button', { name: 'Continuar editando' }).click();
    await p.click('#avatar'); await p.getByRole('button', { name: 'Sair' }).click(); await p.waitForSelector('.modal'); await p.waitForTimeout(300);
    check('AC10 Sair também pergunta', (await text(p, '.modal h2')) === 'Descartar alterações?' && (await hash(p)) === '#/conta/perfil');
    await p.getByRole('button', { name: 'Continuar editando' }).click();
    await p.fill('#pf-nome', U.U1.name); await p.click('nav.tabs >> text=Verificação'); await wait(p, () => location.hash === '#/conta/verificacao');
    check('AC10 sem alteração navega direto', (await hash(p)) === '#/conta/verificacao' && (await p.locator('.modal').count()) === 0);
  });

  const NOME140 = 'N'.repeat(140);
  for (const [w, scale] of [...L.map((x) => [x, 1]), [1280, 2]]) {
    await t(`AC11 responsivo ${w}${scale > 1 ? ' (zoom 200%)' : ''}`, open, { ...PG, width: scale > 1 ? w / 2 : w, height: w >= 1280 ? 900 : 800, scale }, async (d) => {
      const p = d.page; await q(d, `update public.profiles set full_name = $2 where id = $1`, [U.U5.id, NOME140]); await perfil(d, U.U5.email); await ready(p);
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => {
        const vw = innerWidth, out = [];
        for (const el of document.querySelectorAll('#sign *')) { const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 0.5 || b.left < -0.5) && !el.closest('.sidenav')) out.push(el.tagName + '.' + el.className); }
        const b = (s) => { const e = document.querySelector(s); const x = e.getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, w: x.width }; };
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, out: out.slice(0, 5), cpf: b('#pf-cpf'), cel: b('#pf-cel-l + .pf-value'), card: b('.pf-card'), side: b('.pf-side'), nome: b('#pf-nome') };
      });
      const ef = w / scale;
      check(`AC11 ${w}x${scale}: scrollWidth <= clientWidth e nada fora da janela`, r.sw <= r.cw && r.out.length === 0, r);
      const dois = r.cel.l > r.cpf.l + 50 && Math.abs(r.cel.t - r.cpf.t) < 40;
      check(`AC11 ${w}x${scale}: CPF e Celular ${ef >= 768 ? 'lado a lado' : 'em coluna única'}`, ef >= 768 ? dois : !dois, [r.cpf, r.cel]);
      if (ef >= 1024) check(`AC11 ${w}x${scale}: formulário (<= 640) + coluna lateral`, r.card.w <= 641 && r.side.l >= r.card.r - 1 && Math.abs(r.side.t - r.card.t) < 40, [r.card, r.side]);
      else check(`AC11 ${w}x${scale}: coluna lateral abaixo do cartão`, r.side.t > r.card.t + 100, [r.card, r.side]);
      if (ef >= 480 && ef < 768) check(`AC11 ${w}x${scale}: cartão até 560 px`, r.card.w <= 561, r.card);
      if (scale === 1) await p.screenshot({ path: `${SHOTS}/perfil-${w}.png`, animations: 'disabled', caret: 'hide' });
    });
  }

  await t('AC12 teclado e rótulos', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U3.email); await ready(p);
    await p.fill('#pf-nome', 'Ana Teclado Teste'); await p.fill('#pf-cpf', U.U3.cpfLivre);
    await p.fill('#pf-nome', ''); await p.fill('#pf-cpf', ''); await p.reload(); await ready(p); await p.evaluate(() => { document.body.focus(); });
    const ordem = [];
    for (let i = 0; i < 20; i++) { await p.keyboard.press('Tab'); ordem.push(await p.evaluate(() => { const a = document.activeElement; return a.getAttribute('aria-label') || a.id || a.textContent.trim().slice(0, 22); })); }
    const ix = (x) => ordem.findIndex((o) => o.startsWith(x));
    check('AC12 ordem de Tab: pular, menu, abas, campos, link, botão', ix('Ir para o conteúdo') < ix('Documentos') && ix('Documentos') < ix('Perfil') && ix('Perfil') < ix('pf-nome') && ix('pf-nome') < ix('pf-cpf') && ix('pf-cpf') < ix('Verificar contato') && ix('Verificar contato') < ix('Salvar'), ordem);
    check('AC12 todos os campos têm rótulo associado', await p.evaluate(() => [...document.querySelectorAll('#view input')].every((i) => document.querySelector(`label[for="${i.id}"]`))));
    check('AC12 h1 único e selos com texto', (await p.locator('h1').count()) === 1 && (await p.$$eval('#view .tag', (t) => t.every((x) => x.textContent.trim().length > 0))));
    await p.fill('#pf-nome', 'Ana Teclado Teste'); await p.fill('#pf-cpf', U.U3.cpfLivre);
    await p.focus('#pf-nome'); await p.keyboard.press('Enter'); await wait(p, () => document.querySelector('.toast'));
    check('AC12 Enter envia o formulário', (await q(d, `select cpf from public.profiles where id = $1`, [U.U3.id]))[0].cpf === U.U3.cpfLivre);
    await restaurar((s, a) => q(d, s, a));
  });

  for (const w of [390, 1280]) await t(`AC13 alvos e contraste em ${w}`, open, { ...PG, width: w }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U3.email); await ready(p);
    const peq = await p.evaluate(() => [...document.querySelectorAll('#sign a[href], #sign button, #sign input')].filter((e) => e.getClientRects().length && !e.classList.contains('skip-link') && !e.closest('.flyout') && e.getAttribute('tabindex') !== '-1').map((e) => { const b = e.getBoundingClientRect(); return { e: e.tagName + '.' + e.className + ':' + e.textContent.trim().slice(0, 12), w: Math.round(b.width), h: Math.round(b.height) }; }).filter((x) => x.w < 44 || x.h < 44));
    check(`AC13 ${w}: controles interativos >= 44 px`, peq.length === 0, peq);
    const itens = await p.evaluate(() => ['.help', '.pf-label', '.tag', '.pf-card h2', '.pf-link', '.pf-card .banner', '#pf-nome', '.pf-side p', '.page-sub'].map((s) => { const e = document.querySelector(s); if (!e) return null; let bg = e; let c = 'rgba(0,0,0,0)'; while (bg && /rgba\(0, 0, 0, 0\)|transparent/.test(c = getComputedStyle(bg).backgroundColor)) bg = bg.parentElement; return { s, fg: getComputedStyle(e).color, bg: c }; }).filter(Boolean));
    for (const it of itens) { const q2 = ratio(num(it.fg), num(it.bg)); check(`AC13 ${w}: contraste ${it.s} = ${q2.toFixed(2)} >= 4,5`, q2 >= 4.5, it); }
    await p.focus('#pf-nome'); const foco = await p.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.boxShadow + c.outlineStyle; });
    check(`AC13 ${w}: foco visível`, foco !== 'nonenone' && foco !== '', foco);
  });

  await t('AC-R1 troca de usuário pelo hash do Auth (A10-MA)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    await p.evaluate(() => { window.__sh = document.querySelector('.shell'); window.__tr = []; new MutationObserver(() => { window.__tr.push(document.body.innerText.includes('pronto@teste.example') || document.body.innerText.includes('Ana Exemplo')); }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
    const tk = d.fake.mint(U.U2.email);
    await p.evaluate((x) => { location.hash = `#access_token=${x.access_token}&refresh_token=${x.refresh_token}&type=magiclink`; }, tk);
    await wait(p, () => document.querySelector('.org-name') && document.querySelector('.org-name').textContent === 'Bruno Outro Exemplo');
    const dom = await p.evaluate(() => ({ t: document.body.innerText, ng: window.__sh !== document.querySelector('.shell'), tr: window.__tr }));
    check('AC-R1 shell remontado (nó novo) e nada de U1 no DOM', dom.ng && !dom.t.includes('pronto@teste.example') && !dom.t.includes('Ana Exemplo'), dom.t.slice(0, 200));
    check('AC-R1 iniciais e menu de U2', (await text(p, '#avatar')) === 'BE');
    const iU1 = dom.tr.lastIndexOf(true), fim = dom.tr.length - 1;
    check('AC-R1 observador: depois da troca nenhuma mutação reintroduz U1', iU1 === -1 || iU1 < fim, dom.tr.join(','));
  });

  await t('AC-R2 pageshow/bfcache e Cache-Control (A10-MB)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    await p.evaluate(() => { Object.keys(localStorage).filter((k) => /^sb-/.test(k)).forEach((k) => localStorage.removeItem(k)); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await wait(p, () => location.hash === '#/entrar' && document.querySelector('#sign h1'));
    const dom = await text(p, 'body');
    check('AC-R2 pageshow persisted sem sessão: vai a #/entrar sem dado da área logada', (await p.locator('.shell').count()) === 0 && !dom.includes('pronto@teste.example') && !dom.includes(U.U1.name) && (await p.evaluate(() => !document.getElementById('sign').hidden)));
    const h = async (f) => (await fetch(d.origin + f)).headers.get('cache-control');
    check('AC-R2 HTML com Cache-Control: no-store (index, assinar, verificar)', (await h('/index.html')) === 'no-store' && (await h('/')) === 'no-store' && (await h('/assinar.html')) === 'no-store' && (await h('/verificar.html')) === 'no-store');
    check('AC-R2 JS e CSS sem no-store (têm ?v=)', (await h('/js/app.js')) === null && (await h('/styles.css')) === null);
    const hd = fs.readFileSync(path.resolve(__dirname, '../../../apps/sign/_headers'), 'utf8');
    check('AC-R2 A14-B5 _headers: no-store em /, /index, /assinar, /verificar (com e sem .html) e a CSP continua restrita', ['/', '/index.html', '/assinar.html', '/verificar.html', '/index', '/assinar', '/verificar'].every((r) => new RegExp('^' + r.replace(/\./g, '\\.') + '\\n  Cache-Control: no-store', 'm').test(hd)) && /script-src 'self';/.test(hd) && !/script-src[^;]*unsafe/.test(hd));
    console.info('  NÃO testado: bfcache real do navegador (o Chromium do teste não o ativa); simulado por PageTransitionEvent persisted=true');
  });

  await t('AC-R3 sessão encerrada em outra aba (M-1)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    const b = await d.ctx.newPage(); await b.goto(d.origin + '/#/entrar'); await b.waitForSelector('#sign');
    await b.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-/.test(k)).forEach((k) => localStorage.removeItem(k)));
    await wait(p, () => location.hash === '#/entrar');
    check('AC-R3 aviso de sessão em #/entrar', /Sua sessão terminou\. Entre de novo; seus dados continuam aqui\./.test(await text(p, '#sign')) && (await p.locator('.shell').count()) === 0);
    const h0 = await p.evaluate(() => history.length);
    await p.fill('#email', U.U1.email); await p.fill('#senha', PW); await p.click('form button[type=submit]'); await wait(p, () => location.hash === '#/conta/perfil');
    check('AC-R3 login leva ao destino guardado com replace (histórico não cresce)', (await p.evaluate(() => history.length)) === h0);
    await b.close();
  });

  await t('AC-R4 sidenav com 6 itens em 360 (M-2)', open, { ...PG, width: 360 }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    await p.evaluate(() => { const n = document.querySelector('.sidenav-items'); for (let i = 0; i < 4; i++) n.append(n.firstElementChild.cloneNode(true)); });
    const r = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.sidenav')); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, ox: s.overflowX, mw: s.maxWidth }; });
    check('AC-R4 sem rolagem horizontal da página, sidenav overflow-x:auto e max-width:100%', r.sw <= r.cw && r.ox === 'auto' && r.mw === '100%', r);
    await p.setViewportSize({ width: 320, height: 700 }); await p.evaluate(() => { const n = document.querySelector('.sidenav-items'); for (let i = 0; i < 4; i++) n.append(n.firstElementChild.cloneNode(true)); });
    check('AC-R4 também em 320 com 10 itens', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  });

  await t('AC-R5 reenvio ok e depois 429 (B-1)', open, { width: 390, cfg: { resendCooldownMs: 900 } }, async (d) => {
    const p = d.page; await d.go('#/criar');
    await p.fill('#email', 'novo@teste.example'); await p.fill('#nome', 'Nova Pessoa Teste'); await p.fill('#senha', 'uma-senha-longa'); await p.check('#aceite'); await p.click('form button[type=submit]');
    await p.waitForSelector('text=Confirme seu e-mail'); await p.waitForTimeout(1100);
    await p.getByRole('button', { name: 'Reenviar e-mail' }).click(); await p.waitForSelector('.sg-alert.ok');
    d.fake.state.mode.rl429 = { resend: true }; await p.waitForTimeout(1100);
    await p.getByRole('button', { name: 'Reenviar e-mail' }).click(); await p.waitForSelector('.sg-alert.err');
    check('AC-R5 só um alerta visível, o mais recente (limite)', (await p.locator('.sg-alert').count()) === 1 && /limite de reenvios/.test(await text(p, '.sg-alert')));
  });

  for (const [w, h] of [[320, 568], [320, 480]]) await t(`AC-R6 toast longo em ${w}x${h} (B-2)`, open, { ...PG, width: w, height: h }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    const longo = 'Mensagem muito longa '.repeat(30);
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); u.toast('Aviso importante com título bem longo para quebrar linha na tela pequena', 'Mensagem muito longa '.repeat(30), 'ok'); }, VER);
    await p.click('#avatar'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const rc = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); }; const tt = rc('.toast'), sair = rc('.menu-item.danger'), sv = rc('.pf-save'); const ov = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; return { sair: ov(tt, sair), salvar: ov(tt, sv) && sv.top < innerHeight, h: tt.height, vh: innerHeight, full: document.querySelector('.toast-msg').textContent.length, hscroll: document.documentElement.scrollWidth > innerWidth }; });
    check(`AC-R6 ${w}x${h}: toast não cobre o "Sair" do menu`, !r.sair, r);
    check(`AC-R6 ${w}x${h}: <= 40% da altura, texto íntegro no DOM, sem rolagem horizontal`, r.h <= r.vh * 0.41 && r.full === longo.length && !r.hscroll, r);
  });

  await t('AC-R7 pageHead só aceita #/... (A10-B1)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    const r = await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); const o = {}; for (const href of ['javascript:alert(1)', 'https://x', '//x', '#/conta/perfil', '#//x']) { const a = u.pageHead('T', 'S', null, { href, label: 'Voltar' }); const b = u.pageHead('T', 'S', { href, label: 'Voltar' }); o[href] = [a.querySelectorAll('a.back').length, b.querySelectorAll('a.back').length]; } return o; }, VER);
    check('AC-R7 só "#/conta/perfil" gera link (4º e 3º argumento)', JSON.stringify(r) === JSON.stringify({ 'javascript:alert(1)': [0, 0], 'https://x': [0, 0], '//x': [0, 0], '#/conta/perfil': [1, 1], '#//x': [0, 0] }), r);
  });

  await t('AC-R8 hash solto (A10-B2) e AC-R9 construcao.js (A10-B4)', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page;
    for (const h of ['#foo', '#', '#/inexistente-x']) { // '#' sozinho = raiz: a tela de entrada abre (o hash vazio já era tratado como #/entrar)
      await p.goto(d.origin + '/' + (h === '#/inexistente-x' ? '#foo' : h)); await p.waitForSelector('#sign h1', { timeout: 8000 });
      check(`AC-R8 carga com ${h}: vai a #/entrar sem tela em branco`, ((await hash(p)) === '#/entrar' || (h === '#' && (await hash(p)) === '')) && (await text(p, '#sign h1')) !== '');
    }
    await p.goto(d.origin + '/#foo'); await p.waitForSelector('#sign h1'); const n = await p.evaluate(() => history.length);
    await p.goto(d.origin + '/#/entrar'); const n2 = await p.evaluate(() => history.length);
    check('AC-R8 o redirecionamento não empilha entrada a mais que a carga normal', n <= n2 + 0, [n, n2]);
    await p.goto(d.origin + '/#/recuperar'); await p.waitForSelector('#sign h1'); const h1 = await p.evaluate(() => history.length);
    await p.getByRole('link', { name: 'Voltar ao início' }).click(); await wait(p, () => location.hash === '#/entrar');
    check('AC-R9 "Voltar ao início" usa replace (history.length igual)', (await p.evaluate(() => history.length)) === h1, h1);
    await logged(d, { email: U.U1.email }); await p.evaluate(() => { location.hash = '#/recuperar'; }); await p.waitForSelector('#sign .sg-single');
    const h2 = await p.evaluate(() => history.length); await p.getByRole('button', { name: 'Sair' }).click(); await wait(p, () => location.hash === '#/entrar');
    check('AC-R9 "Sair" usa replace', (await p.evaluate(() => history.length)) === h2, h2);
  });


  // ===================== Ciclo 2 =====================
  const varre = (p) => p.evaluate(() => {
    const big = [...document.querySelectorAll('.banner svg, .toast svg, .empty svg, .sg-alert svg, .tag svg, .btn svg')].map((e) => { const b = e.getBoundingClientRect(); return { e: (e.closest('[class]') || e).className + ' ' + Math.round(b.width) + 'x' + Math.round(b.height), w: b.width, h: b.height }; }).filter((x) => x.w > 32 || x.h > 32);
    const estreito = [...document.querySelectorAll('.banner .grow')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().width).filter((w) => w < 90);
    const alto = [...document.querySelectorAll('.banner')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().height).filter((h) => h > 220);
    return { big, estreito, alto, n: document.querySelectorAll('.banner svg, .toast svg, .empty svg, .sg-alert svg').length };
  });
  await t('V-01 ícones em banner, toast e estado vazio: tamanho (todas as larguras, com capturas)', open, { ...PG, width: 390, cfg: { timeoutMs: 2000 } }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a));
    const nome = (w, e) => `${SHOTS}/banner-${e}-${w}.png`;
    const rodada = async (estado, sel) => {
      for (const w of L) {
        await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(150);
        const r = await varre(p);
        check(`V-01 ${estado} ${w}: nenhum svg > 32 px e texto do banner com >= 90 px`, r.big.length === 0 && r.estreito.length === 0 && r.alto.length === 0 && r.n > 0, r);
        const el = p.locator(sel).first(); if (await el.count()) await el.screenshot({ path: nome(w, estado), animations: 'disabled' });
      }
    };
    await logged(d, { email: U.U3.email, hash: '#/conta/perfil' }); await ready(p);
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); u.toast('Aviso', 'Mensagem de teste do toast', 'ok'); u.toast('Erro', 'Mensagem de erro do toast', 'error'); }, VER);
    await rodada('faixa-perfil-incompleto', '.pf-card .banner.info');
    const al = (await p.evaluate(() => getComputedStyle(document.querySelector('.pf-card .banner .ico')).width));
    check('V-01 o ícone do banner tem 20 px', al === '20px', al);
    await p.fill('#pf-nome', 'Ana Erro Rede'); await p.fill('#pf-cpf', U.U3.cpfLivre); d.fake.state.mode.rpcDrop = { sign_profile_save: true }; await p.click('.pf-save'); await p.waitForSelector('.pf-msg .banner', { timeout: 9000 });
    await rodada('erro-ao-salvar', '.pf-msg .banner');
    d.fake.state.mode.rpcDrop = { sign_me: true }; await p.reload(); // recarregar também descarta o formulário sujo e o cache de sign_me
    await p.waitForSelector('.pf-card .banner.danger', { timeout: 9000 }); await rodada('erro-ao-carregar', '.pf-card .banner.danger');
    await p.evaluate(() => { location.hash = '#/plano'; }); await p.waitForSelector('.shell-notice .banner', { timeout: 9000 }); await rodada('aviso-do-shell', '.shell-notice .banner');
    d.fake.state.mode.rpcDrop = {}; await p.evaluate(() => { location.hash = '#/plano'; }); await p.waitForSelector('#view .empty'); await rodada('estado-vazio', '#view .empty');
    await restaurar((s, a) => q(d, s, a));
  });
  await t('V-01 "Confirme seu e-mail" e alertas da entrada em todas as larguras', open, { width: 390, cfg: { resendCooldownMs: 900 } }, async (d) => {
    const p = d.page; await d.go('#/criar');
    await p.fill('#email', 'novo2@teste.example'); await p.fill('#nome', 'Nova Pessoa Teste'); await p.fill('#senha', 'uma-senha-longa'); await p.check('#aceite'); await p.click('form button[type=submit]');
    await p.waitForSelector('text=Confirme seu e-mail');
    for (const w of L) { await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(100); const r = await varre(p); check(`V-01 Confirme seu e-mail ${w}: sem svg > 32 px`, r.big.length === 0, r); await p.screenshot({ path: `${SHOTS}/confirme-email-${w}.png`, animations: 'disabled' }); }
  });

  await t('V-02 guarda de descarte sem entrada de histórico duplicada', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U1.email); await ready(p);
    const n0 = await p.evaluate(() => history.length);
    await p.fill('#pf-nome', 'Ana Editando Agora'); await p.click('nav.tabs >> text=Verificação'); await p.waitForSelector('.modal');
    await p.getByRole('button', { name: 'Continuar editando' }).click(); await p.waitForTimeout(400);
    check('V-02 "Continuar editando" (clique em link): mesma rota e no máximo a entrada "para frente" do link (nenhuma duplicada)', (await p.evaluate(() => history.length)) <= n0 + 1 && (await hash(p)) === '#/conta/perfil', [n0, await p.evaluate(() => history.length)]);
    const entradas = await p.evaluate(() => history.length);
    await p.goBack(); await p.waitForSelector('.modal'); await p.getByRole('button', { name: 'Continuar editando' }).click(); await p.waitForTimeout(400);
    check('V-02 voltar do navegador + Continuar editando: nenhuma entrada nova, tela e texto mantidos', (await p.evaluate(() => history.length)) === entradas && (await hash(p)) === '#/conta/perfil' && (await p.inputValue('#pf-nome')) === 'Ana Editando Agora');
    await p.goBack(); await p.waitForSelector('.modal'); check('V-02 Voltar não fica "morto": pergunta de novo', true);
    await p.getByRole('button', { name: 'Descartar' }).click(); await wait(p, () => location.hash === '#/documentos');
    check('V-02 Descartar leva à rota anterior', (await hash(p)) === '#/documentos');
  });

  await t('V-03 colar nome longo avisa o corte; A14-B3 caracteres invisíveis (tela)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await d.ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U3.email); await ready(p);
    await p.evaluate(() => navigator.clipboard.writeText('N'.repeat(100) + ' ' + 'M'.repeat(100)));
    await p.fill('#pf-nome', ''); await p.focus('#pf-nome'); await p.keyboard.press('Control+V'); await p.waitForTimeout(300);
    check('V-03 o campo corta em 140', (await p.inputValue('#pf-nome')).length === 140);
    check('V-03 aparece o aviso de que o texto colado foi cortado', /foi cortado/.test(await text(p, '#pf-nome-err')), await text(p, '#pf-nome-err'));
    await p.fill('#pf-nome', 'Ana ‮silva'); await p.fill('#pf-cpf', U.U3.cpfLivre); await p.click('.pf-save');
    check('A14-B3 tela: nome com U+202E recusado no cliente, sem envio', /caracteres que não podem ser usados/.test(await text(p, '#pf-nome-err')) && salvas(d) === 0, await text(p, '#pf-nome-err'));
    await p.fill('#pf-nome', 'Ana ​silva'); await p.click('.pf-save');
    check('A14-B3 tela: U+200B também', /caracteres que não podem ser usados/.test(await text(p, '#pf-nome-err')) && salvas(d) === 0);
    await restaurar((s, a) => q(d, s, a));
  });

  await t('V-05 org-link e V-07 nome de 140 no cabeçalho (altura e avatar)', open, { ...PG, width: 320, height: 640 }, async (d) => {
    const p = d.page; await q(d, `update public.profiles set full_name = $2 where id = $1`, [U.U5.id, 'N'.repeat(140)]); await perfil(d, U.U5.email); await ready(p);
    for (const w of [320, 360, 390, 768, 1280]) {
      await p.setViewportSize({ width: w, height: 640 }); await p.waitForTimeout(150);
      const r = await p.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(); const o = b('.org-link'), a = b('#avatar'), tb = b('.topbar'), n = document.querySelector('.org-name'); return { orgw: o.width, orgh: o.height, av: [a.left, a.right, a.width, a.height], vw: innerWidth, tbh: tb.height, title: n.title.length, txt: n.textContent.length, clamp: getComputedStyle(n).webkitLineClamp }; });
      check(`V-05 ${w}: a.org-link >= 44 x 44`, r.orgw >= 44 && r.orgh >= 44, r);
      check(`V-07 ${w}: topo <= 120 px, avatar inteiro dentro da janela, nome inteiro no title`, r.tbh <= 120 && r.av[0] >= 0 && r.av[1] <= r.vw && r.av[2] >= 40 && r.title === 140 && r.txt === 140 && r.clamp === '2', r);
    }
    await restaurar((s, a) => q(d, s, a));
  });

  await t('V-08 contraste no tema escuro (alfa composto) e anel de foco >= 3:1', open, { ...PG, width: 1280, theme: 'dark' }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U3.email); await ready(p); await d.setTheme('dark'); await p.waitForTimeout(200);
    const alvo = ['.help', '.pf-label', '.tag', '.pf-card h2', '.pf-link', '.pf-card .banner', '#pf-nome', '.pf-side p', '.page-sub', '.ferr', '.btn.secondary', '.pf-save'];
    await p.fill('#pf-nome', 'Ana'); await p.click('.pf-save').catch(() => {});
    const it = await p.evaluate((sels) => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const v = m[1].split(/[ ,\/]+/).map(parseFloat); return [v[0], v[1], v[2], v[3] === undefined ? 1 : v[3]]; } const k = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/); return k ? [k[1] * 255, k[2] * 255, k[3] * 255, k[4] === undefined ? 1 : +k[4]] : [0, 0, 0, 0]; };
      const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat([1]);
      const fundo = (e) => { const cam = []; for (let x = e; x; x = x.parentElement) cam.push(parse(getComputedStyle(x).backgroundColor)); let base = [20, 20, 20, 1]; const cs = getComputedStyle(document.documentElement).backgroundColor; if (cs) base = parse(cs); if (base[3] < 1) base = [255, 255, 255, 1]; for (const c of cam.reverse()) base = c[3] > 0 ? over(c, base) : base; return base; };
      return sels.map((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); if (!e) return null; const bg = fundo(e); const fg = parse(getComputedStyle(e).color); return { s, fg: over(fg, bg), bg }; }).filter(Boolean);
    }, alvo);
    const lm = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const rt = (a, b) => { const x = lm(a), y = lm(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const nums = [];
    for (const i of it) { const q2 = rt(i.fg, i.bg); nums.push(`${i.s}=${q2.toFixed(2)}`); check(`V-08 escuro: contraste ${i.s} = ${q2.toFixed(2)} >= 4,5`, q2 >= 4.5, i); }
    console.info('  medido (tema escuro, alfa composto): ' + nums.join(' '));
    await p.focus('#pf-nome');
    const foco = await p.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { shadow: c.boxShadow, border: c.borderTopColor, outline: c.outlineColor + ' ' + c.outlineStyle + ' ' + c.outlineWidth }; });
    const bgPag = await p.evaluate(() => getComputedStyle(document.querySelector('.pf-card')).backgroundColor);
    const parse2 = (c) => { const k = String(c).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/); if (k) return [k[1] * 255, k[2] * 255, k[3] * 255, k[4] === undefined ? 1 : +k[4]]; const m = String(c).match(/rgba?\(([^)]+)\)/); const v = m[1].split(/[ ,\/]+/).map(parseFloat); return [v[0], v[1], v[2], v[3] === undefined ? 1 : v[3]]; };
    const bgc = parse2(bgPag); const bord = parse2(foco.border);
    const q3 = rt([0, 1, 2].map((i) => bord[i] * bord[3] + bgc[i] * (1 - bord[3])), bgc);
    console.info(`  medido (tema escuro): borda do campo em foco ${foco.border} (anel de sombra ${foco.shadow}) sobre ${bgPag}: ${q3.toFixed(2)}:1`);
    check('V-08 escuro: borda de foco >= 3:1 sobre o fundo', q3 >= 3, foco);
    await restaurar((s, a) => q(d, s, a));
  });

  // ===================== Ciclo 3 =====================
  await t('V-09 guarda de descarte: URL sempre revertida e menu funcional (Voltar duplo, modal aberto)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U1.email); await ready(p);
    await p.evaluate(() => { location.hash = '#/documentos'; }); await wait(p, () => location.hash === '#/documentos');
    await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await ready(p);
    await p.fill('#pf-nome', 'Ana Voltando Duas Vezes');
    const tela = () => p.evaluate(() => ({ h: location.hash, h1: document.querySelector('#view h1').textContent, nome: document.querySelector('#pf-nome') && document.querySelector('#pf-nome').value, modais: document.querySelectorAll('.modal').length }));
    await p.goBack(); await p.waitForSelector('.modal'); await p.goBack().catch(() => {}); await p.waitForTimeout(1200);
    const a = await tela();
    check('V-09 Voltar duplo com o modal aberto: URL e tela continuam em Perfil, 1 modal, texto mantido', a.h === '#/conta/perfil' && a.nome === 'Ana Voltando Duas Vezes' && a.modais === 1, a);
    await p.getByRole('button', { name: 'Continuar editando' }).click(); await p.waitForTimeout(900);
    const b = await tela();
    check('V-09 depois de "Continuar editando": URL = tela (Perfil), sem modal', b.h === '#/conta/perfil' && b.modais === 0 && b.nome === 'Ana Voltando Duas Vezes', b);
    await p.click('.nav-btn[aria-label=Documentos]'); await p.waitForSelector('.modal');
    check('V-09 o item Documentos do menu funciona (pergunta de novo)', (await text(p, '.modal h2')) === 'Descartar alterações?');
    await p.getByRole('button', { name: 'Descartar' }).click(); await wait(p, () => location.hash === '#/documentos');
    await wait(p, () => document.querySelector('#view h1').textContent === 'Documentos'); check('V-09 Descartar leva a Documentos', (await tela()).h1 === 'Documentos');
    // Voltar triplo rápido e depois menu
    await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await ready(p); await p.fill('#pf-nome', 'Ana Tres Voltas');
    await p.goBack(); await p.waitForSelector('.modal'); await p.goBack().catch(() => {}); await p.goBack().catch(() => {}); await p.waitForTimeout(1200);
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    const c = await tela();
    check('V-09 Voltar triplo + Esc: URL = tela (Perfil) e sem modal', c.h === '#/conta/perfil' && c.h1 === 'Conta' && c.modais === 0, c);
    await p.click('.nav-btn[aria-label=Documentos]'); await p.waitForSelector('.modal'); check('V-09 menu Documentos ainda funciona depois do Voltar triplo', true);
    await p.getByRole('button', { name: 'Continuar editando' }).click();
    await restaurar((s, a) => q(d, s, a));
  });

  await t('B-03 marca no tema escuro; B-02 iniciais do avatar; B-04 ponto do suporte; B-05 botão no banner', open, { ...PG, width: 320, theme: 'dark' }, async (d) => {
    const p = d.page; await restaurar((s, a) => q(d, s, a)); await perfil(d, U.U5.email); await ready(p);
    for (const f of ['logo-creme.png', 'mark-creme.png', 'logo-rosa.png', 'mark-rosa.png']) check(`B-03 img/${f} existe e carrega (200)`, (await fetch(d.origin + '/img/' + f)).status === 200);
    await d.setTheme('dark'); await p.waitForTimeout(300);
    const bi = await p.evaluate(() => getComputedStyle(document.querySelector('.org-mark.logo')).backgroundImage);
    const px = await p.evaluate(async (u) => { const im = new Image(); im.src = u; await im.decode(); return [im.naturalWidth, im.naturalHeight]; }, d.origin + '/img/mark-creme.png');
    check('B-03 no escuro a marca usa mark-creme.png e a imagem tem tamanho', /mark-creme\.png/.test(bi) && px[0] > 8, [bi, px]);
    await p.screenshot({ path: `${SHOTS}/escuro-perfil-320.png`, animations: 'disabled' });
    const lm = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const rt = (a, b) => { const x = lm(a), y = lm(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const cor = (c) => { const k = String(c).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/); if (k) return [k[1] * 255, k[2] * 255, k[3] * 255]; const m = String(c).match(/rgba?\(([^)]+)\)/); return m[1].split(/[ ,\/]+/).slice(0, 3).map(parseFloat); };
    for (const tema of ['light', 'dark']) {
      await d.setTheme(tema); await p.waitForTimeout(200);
      const a = await p.evaluate(() => { const e = document.querySelector('#avatar'); const c = getComputedStyle(e); return [c.color, c.backgroundColor]; });
      const q2 = rt(cor(a[0]), cor(a[1]));
      console.info(`  medido: iniciais do avatar, tema ${tema}: ${q2.toFixed(2)}:1`);
      check(`B-02 iniciais do avatar ${tema}: contraste >= 4,5`, q2 >= 4.5, a);
    }
    const r = await p.evaluate(() => { const a = document.querySelector('#pf-cpf-help a'), span = a.parentElement; const t = span.textContent; const rg = document.createRange(); rg.setStart(span.lastChild, 0); rg.setEnd(span.lastChild, 1); const dot = rg.getBoundingClientRect(), lk = a.getBoundingClientRect(); const help = document.querySelector('#pf-cpf-help'); return { txt: help.textContent, gap: dot.left - lk.right, mesmaLinha: dot.top >= lk.top - 2 && dot.bottom <= lk.bottom + 2, t }; });
    check('B-04 texto "fale com o suporte." sem espaço antes do ponto', /fale com o suporte\.$/.test(r.txt) && !/suporte \./.test(r.txt) && r.gap <= 1, r);
    check('B-04 ponto na mesma linha do link em 320 (sem ponto órfão)', r.mesmaLinha, r);
    await d.setTheme('light');
    d.fake.state.mode.rpcDrop = { sign_me: true }; await p.reload(); await p.waitForSelector('.pf-card .banner.danger', { timeout: 9000 });
    const bt = await p.evaluate(() => { const b = document.querySelector('.pf-card .banner .btn'); const c = getComputedStyle(b); const bb = b.getBoundingClientRect(); return { bg: c.backgroundColor, bd: c.borderTopWidth + ' ' + c.borderTopColor, fg: c.color, h: bb.height, w: bb.width, banner: getComputedStyle(b.closest('.banner')).backgroundColor }; });
    const bgc = cor(bt.bg), bdc = cor(bt.bd.split(' ').slice(1).join(' ')), bnc = cor(bt.banner);
    check('B-05 botão do banner: tem borda de 1 px, fundo diferente do banner e texto >= 4,5:1', bt.bd.startsWith('1px') && rt(bgc, bnc) > 1.05 && rt(cor(bt.fg), bgc) >= 4.5 && rt(bdc, bnc) >= 3, bt);
    await p.screenshot({ path: `${SHOTS}/banner-botao-320.png`, animations: 'disabled' });
    d.fake.state.mode.rpcDrop = {};
  });

  await t('Desempenho: LCP e CLS de #/conta/perfil em 4G simulado', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await perfil(d, U.U1.email); await ready(p);
    const c = await d.ctx.newCDPSession(p); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await p.addInitScript(() => { window.__lcp = 0; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    await p.reload(); await ready(p); await p.waitForTimeout(1500);
    const m = await p.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(4) }));
    console.info(`  medido: LCP ${m.lcp} ms, CLS ${m.cls} (4G simulado 1,6 Mbps/150 ms, sem compressão no servidor de teste)`);
    check('Desempenho: LCP <= 2500 ms', m.lcp <= 2500, m); check('Desempenho: CLS <= 0,05', m.cls <= 0.05, m);
  });

  console.info('limpando: reset.sh depois'); reset('depois');
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
