// Guarda sistêmica (ciclo 3 da 1.4, achado N-01): em TODAS as telas e estados que os testes do Sign alcançam, nenhum texto visível
// (nós de texto, valores de campo, title, aria-label, alt, placeholder) pode conter "null", "undefined", "[object Object]" ou "NaN".
// Larguras: 320, 768 e 1280. Telas da entrada rodam no Auth em memória; as da área logada, no Supabase falso em repasse ao Postgres local.
// Uso: SIGN_DB=sign_dev SIGN_DB_ANTES=sign_dev_antes node t-texto.cjs     (SIGN_APP=<cópia do app> testa outra versão do código, ex.: a antiga)
const { open } = require('./drv.cjs');
const { check, t, done, logged, VER } = require('./lib.cjs');
const { U, restaurar, reset, DB } = require('./perfil-lib.cjs');
const { mk, cpfValido } = require('./onb-lib.cjs');
const { login, PW } = require('./lib.cjs');
const W = [320, 768, 1280];
// 1.5: também reprova marcador sem substituir ({n}, {mm}, {s}), código de erro vazando e palavras de interface em inglês
const RUIM = /\b(null|undefined|NaN)\b|\[object Object\]|\{(n|mm|s)\}|\b(otp_[a-z_]+|onboarding_[a-z_]+|cert_[a-z_]+|too_many\w*|too_soon|channel_unavailable|email_not_confirmed|challenge_expired|cpf_in_use|cpf_locked|invalid_[a-z_]+|identity_required|roots_not_loaded|Error|Loading|Submit|Cancel|Retry|Failed)\b/;
const q = async (d, sql, a) => (await d.fake.query(sql, a)).rows;

// 1.2: Recuperar senha e Nova senha, todos os estados alcançáveis (Auth em memória). A senha digitada nunca pode aparecer no texto da página.
const SENHA = 'minha-senha-nova-123';
async function senhaTelas(d, w) {
  const p = d.page; let n = 0;
  const abre = async (hash) => { await p.goto(d.origin + '/?t=' + (++n) + hash); await p.waitForSelector('#sign h1'); };
  const link = async (o) => { await p.goto(d.origin + '/?t=' + (++n) + d.fake.recoveryHash('pronto@teste.example', o)); await p.waitForSelector('#sign h1'); await p.waitForTimeout(150); };
  const semSenha = async (rot) => { const v = await p.evaluate((x) => document.body.innerText.includes(x) || document.documentElement.outerHTML.includes(x), SENHA); check(`senha digitada não aparece no texto nem no HTML (${rot} ${w})`, !v); };
  d.fake.state.mode = {};
  await abre('#/recuperar'); await varre(p, `Recuperar senha (formulário) ${w}`);
  await p.click('form button[type=submit]'); await varre(p, `Recuperar: campo vazio ${w}`);
  await p.fill('#email', 'isso-nao-e'); await p.click('form button[type=submit]'); await varre(p, `Recuperar: e-mail inválido ${w}`);
  await p.fill('#email', 'pronto@teste.example'); await p.click('form button[type=submit]'); await p.waitForSelector('text=Verifique seu e-mail'); await varre(p, `Recuperar: tela neutra com contagem ${w}`);
  await abre('#/recuperar'); d.fake.state.mode = { rl429: { recover: true } }; await p.evaluate(() => sessionStorage.clear()); await p.fill('#email', 'pronto@teste.example'); await p.click('form button[type=submit]'); await p.waitForSelector('.sg-alert'); await varre(p, `Recuperar: limite do Auth (429) ${w}`);
  d.fake.state.mode = { down: true }; await p.click('form button[type=submit]'); await p.waitForSelector('text=Sem conexão', { timeout: 9000 }); await varre(p, `Recuperar: rede caída ${w}`);
  d.fake.state.mode = {};
  await abre('#/nova-senha'); await p.waitForSelector('text=Para trocar a senha'); await varre(p, `Recuperar: aviso sem sessão (vindo de #/nova-senha) ${w}`);
  d.fake.state.mode = { delay: 1500 }; await p.goto(d.origin + '/?t=' + (++n) + d.fake.recoveryHash('pronto@teste.example')); await p.waitForSelector('text=Verificando o link…'); await varre(p, `Nova senha: Verificando o link… ${w}`);
  await p.waitForSelector('#nova', { timeout: 9000 }); d.fake.state.mode = {};
  await varre(p, `Nova senha: formulário ${w}`);
  await p.fill('#nova', 'abc'); await p.fill('#confirma', 'abcd'); await varre(p, `Nova senha: senha curta, medidor e confirmação diferente ${w}`);
  await p.fill('#nova', 'abcdefghi'); await varre(p, `Nova senha: falta 1 caractere ${w}`);
  for (const pw of ['abcdefghijkl', 'Abcdefghij12345!']) { await p.fill('#nova', pw); await p.fill('#confirma', pw); await varre(p, `Nova senha: medidor (${pw.length} caracteres) ${w}`); }
  await p.fill('#nova', SENHA); await p.fill('#confirma', SENHA); await p.getByRole('button', { name: 'Mostrar senha' }).first().click(); await semSenha('com a senha visível no campo'); await varre(p, `Nova senha: senha visível ${w}`);
  for (const [modo, rot] of [[{ weak: true }, 'senha fraca'], [{ same: true }, 'mesma senha'], [{ rl429: { update: true } }, '429']]) {
    d.fake.state.mode = modo; await p.click('form button[type=submit]'); await p.waitForTimeout(400); await varre(p, `Nova senha: ${rot} ${w}`); await semSenha(rot);
  }
  d.fake.state.mode = { down: true }; await p.click('form button[type=submit]'); await p.waitForSelector('text=Sem conexão', { timeout: 9000 }); await varre(p, `Nova senha: rede caída ${w}`);
  d.fake.state.mode = { expired: true }; await p.click('form button[type=submit]'); await p.waitForSelector('text=Link inválido'); await varre(p, `Nova senha: 401 na troca (Link inválido) ${w}`);
  d.fake.state.mode = {}; await link({ expired: true }); await varre(p, `Nova senha: link vencido (otp_expired) ${w}`);
  await link({ used: true }); await varre(p, `Nova senha: link já usado (setSession falha) ${w}`);
  d.fake.state.mode = { others500: true }; await link({}); await p.fill('#nova', SENHA); await p.fill('#confirma', SENHA); await p.click('form button[type=submit]'); await p.waitForSelector('.toast'); await varre(p, `Nova senha: sucesso com aviso de sessões não encerradas ${w}`); await semSenha('sucesso');
  d.fake.state.mode = {}; d.fake.seed();
}

async function varre(p, rotulo) {
  const achados = await p.evaluate((src) => {
    const re = new RegExp(src);
    const out = [];
    const visivel = (e) => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || x.hidden) return false; } return true; };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const pe = n.parentElement; if (!pe || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(pe.tagName)) continue;
      if (re.test(n.nodeValue) && (visivel(pe) || pe.closest('.sr-only'))) out.push('texto: ' + n.nodeValue.trim().slice(0, 60) + ' em ' + pe.tagName + '.' + pe.className);
    }
    for (const e of document.querySelectorAll('input, textarea, select')) if (visivel(e) && re.test(e.value || '')) out.push('valor: ' + e.value.slice(0, 40) + ' em #' + e.id);
    for (const e of document.querySelectorAll('[title], [aria-label], [alt], [placeholder]')) for (const a of ['title', 'aria-label', 'alt', 'placeholder']) { const v = e.getAttribute(a); if (v && re.test(v)) out.push(a + ': ' + v.slice(0, 40)); }
    if (re.test(document.title)) out.push('title do documento: ' + document.title);
    return out;
  }, RUIM.source);
  check(`texto ${rotulo}: nenhum "null", "undefined", "[object Object]" ou "NaN" visível`, achados.length === 0, achados);
}

(async () => {
  console.info('recriando banco local...'); reset('depois');

  // ---------- entrada (Auth em memória) ----------
  for (const w of W) await t(`textos da entrada em ${w}`, open, { width: w, cfg: { resendCooldownMs: 800 } }, async (d) => {
    const p = d.page;
    await d.go('#/entrar'); await varre(p, `Entrar ${w}`);
    await p.fill('#email', 'x'); await p.fill('#senha', 'a'); await p.click('form button[type=submit]'); await varre(p, `Entrar com erro de validação ${w}`);
    await p.fill('#email', 'ok@teste.example'); await p.fill('#senha', 'errada-errada-1'); await p.click('form button[type=submit]'); await p.waitForTimeout(500); await varre(p, `Entrar com senha errada ${w}`);
    await d.go('#/criar'); await varre(p, `Criar conta ${w}`);
    await p.click('form button[type=submit]'); await varre(p, `Criar conta com erros ${w}`);
    await p.fill('#email', 'novo3@teste.example'); await p.fill('#nome', 'Nova Pessoa Teste'); await p.fill('#senha', 'uma-senha-longa'); await p.check('#aceite'); await p.click('form button[type=submit]');
    await p.waitForSelector('text=Confirme seu e-mail'); await varre(p, `Confirme seu e-mail ${w}`);
    await p.waitForTimeout(1000); await p.getByRole('button', { name: 'Reenviar e-mail' }).click(); await p.waitForTimeout(400); await varre(p, `Confirme seu e-mail após reenvio ${w}`);
    await p.goto(d.origin + '/#error_code=otp_expired'); await p.waitForSelector('#sign h1'); await varre(p, `link vencido (1.2: Link inválido) ${w}`);
    await senhaTelas(d, w);
    await p.goto(d.origin + '/#/nada-aqui'); await p.waitForSelector('#sign h1'); await varre(p, `404 público ${w}`);
  });

  // ---------- área logada (repasse ao Postgres) ----------
  for (const w of W) await t(`textos da área logada em ${w}`, open, { pg: DB, width: w, cfg: { timeoutMs: 2000 } }, async (d) => {
    const p = d.page; const R = () => restaurar((s, a) => q(d, s, a));
    await R();
    const ir = async (hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForFunction((h) => location.hash === h && document.querySelector('#view h1'), hash, { timeout: 8000 }); await p.waitForTimeout(500); };
    // U1: perfil completo e travado (o caso do N-01)
    await logged(d, { email: U.U1.email, hash: '#/conta/perfil' }); await p.waitForSelector('#pf-nome'); await varre(p, `Perfil completo/travado (U1) ${w}`);
    await p.click('#avatar'); await varre(p, `menu do avatar ${w}`); await p.keyboard.press('Escape');
    for (const h of ['#/documentos', '#/envio/novo', '#/plano', '#/conta/verificacao', '#/conta/seguranca', '#/inexistente']) { await ir(h); await varre(p, `${h} ${w}`); }
    await ir('#/conta/perfil'); await p.waitForSelector('#pf-nome');
    await p.fill('#pf-nome', 'Ana Texto Teste'); await p.click('nav.tabs >> text=Verificação'); await p.waitForSelector('.modal'); await varre(p, `modal Descartar alterações? ${w}`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('.pf-save'); await p.waitForSelector('.toast'); await varre(p, `perfil salvo + toast ${w}`);
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); u.toast('Erro', 'Falha de teste', 'error'); u.toast('Só título', '', 'ok'); }, VER); await varre(p, `toasts ${w}`);
    await R();
    // U3: perfil incompleto com sugestão
    await d.page.evaluate(() => Object.keys(localStorage).forEach((k) => localStorage.removeItem(k)));
    await logged(d, { email: U.U3.email, hash: '#/conta/perfil' }); await p.waitForSelector('#pf-nome'); await varre(p, `Perfil incompleto com sugestão (U3) ${w}`);
    await p.fill('#pf-nome', 'Ana'); await p.fill('#pf-cpf', '123'); await p.evaluate(() => document.querySelector('.pf-save').removeAttribute('disabled')); await p.click('.pf-save'); await varre(p, `Perfil com erros de campo ${w}`);
    await p.fill('#pf-nome', 'Ana Erro Rede'); await p.fill('#pf-cpf', U.U3.cpfLivre); d.fake.state.mode.rpcDrop = { sign_profile_save: true }; await p.click('.pf-save'); await p.waitForSelector('.pf-msg .banner', { timeout: 9000 }); await varre(p, `Perfil erro ao salvar ${w}`);
    d.fake.state.mode.rpcDrop = { sign_me: true }; await p.reload(); await p.waitForSelector('.pf-card .banner.danger', { timeout: 9000 }); await varre(p, `Perfil erro ao carregar ${w}`);
    await p.evaluate(() => { location.hash = '#/plano'; }); await p.waitForSelector('.shell-notice .banner', { timeout: 9000 }); await varre(p, `aviso do shell (sign_me falhou) ${w}`);
    d.fake.state.mode.rpcDrop = {}; await R();
    // U5: CPF travado por envelope; U6: certificado; U4: parceiro; U7 sem linha em profiles
    for (const [rot, u] of [['U5 envelope', U.U5], ['U6 certificado', U.U6], ['U4 parceiro', U.U4], ['U7 sem linha em profiles', U.U7]]) {
      await d.page.evaluate(() => Object.keys(localStorage).forEach((k) => localStorage.removeItem(k)));
      await logged(d, { email: u.email, hash: '#/conta/perfil' }); await p.waitForSelector('#pf-nome'); await varre(p, `Perfil ${rot} ${w}`);
    }
    await R();
  });

  // ---------- 1.5: Verificação de identidade, todos os estados, em 320, 768 e 1280 ----------
  const EDGE = 'https://rowhslnnlzfbhmzbylbz.supabase.co/functions/v1/sign-cert-validate';
  for (const w of W) await t(`textos da Verificação em ${w}`, open, { pg: DB, width: w, cfg: { certEndpoint: EDGE, certTimeoutMs: 1500 } }, async (d) => {
    const p = d.page; const R = () => restaurar((s, a) => q(d, s, a));
    const limpa = async (id) => { for (const tb of ['sign_otps', 'sign_outbox', 'sign_cert_challenges', 'sign_cpf_attempts']) await q(d, `delete from public.${tb} where user_id = $1`, [id]); await q(d, `update public.sign_identity set otp_locked_until = null where user_id = $1`, [id]); };
    const pronto = () => p.waitForFunction(() => document.querySelector('.vf') && !document.querySelector('.vf[aria-busy="true"]') || document.querySelector('.vf .banner.danger'), null, { timeout: 15000 });
    await R(); await limpa(U.U2.id); await q(d, `delete from public.sign_trusted_roots`); await q(d, `insert into public.sign_trusted_roots (name, pem, sha256, active) values ('Raiz de teste', 'PEM-FICTICIO', 'aa11', true)`);
    await logged(d, { email: U.U2.email, hash: '#/conta/verificacao' }); await pronto(); await p.waitForTimeout(400); await varre(p, `Verificação vazio ${w}`);
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await varre(p, `Verificação código pedido ${w}`);
    const errado = (await d.fake.codeOf(U.U2.email)) === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) { await p.fill('#vf-codigo', errado); await p.waitForFunction((n) => document.querySelector('#vf-msg').textContent.length > 0 && !document.querySelector('.vf-col:last-child .vf-card:first-child .vf-actions .btn[aria-busy]') && (n === 4 || true), i); await varre(p, `Verificação código errado ${i + 1} ${w}`); await p.waitForTimeout(150); }
    await p.reload(); await pronto(); await varre(p, `Verificação bloqueado após recarregar ${w}`);
    await limpa(U.U2.id); await p.reload(); await pronto(); await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await p.fill('#vf-codigo', '12'); await p.click('.vf-col:last-child .vf-card:first-child .vf-actions .btn:not(.secondary)'); await varre(p, `Verificação código incompleto ${w}`);
    await p.click('text=Gerar desafio'); await p.waitForSelector('.vf-challenge'); await varre(p, `Verificação desafio ${w}`);
    await p.setInputFiles('#vf-arquivo', { name: 'c.json', mimeType: 'application/json', buffer: Buffer.from('{"cpf":"1"}') }); await p.click('text=Enviar arquivo assinado'); await p.waitForFunction(() => document.querySelector('.vf-msg') && document.querySelector('.vf-msg').textContent !== ''); await varre(p, `Verificação erro de certificado ${w}`);
    d.fake.state.mode.certEdge = 'down'; await p.reload(); await pronto(); await p.waitForSelector('.vf .banner.warn'); await varre(p, `Verificação borda fora do ar ${w}`);
    d.fake.state.mode.certEdge = undefined;
    d.fake.state.mode.rpcDrop = { sign_me: true }; await p.reload(); await p.waitForSelector('.vf .banner.danger', { timeout: 15000 }); await varre(p, `Verificação erro de carga ${w}`); d.fake.state.mode.rpcDrop = {};
    await q(d, `update auth.users set email_confirmed_at = null where id = $1`, [U.U2.id]); await p.reload(); await pronto(); await varre(p, `Verificação e-mail não confirmado ${w}`); await q(d, `update auth.users set email_confirmed_at = now() where id = $1`, [U.U2.id]);
    await p.evaluate(() => { location.hash = '#/conta/verificacao?motivo=identity_required'; }); await p.reload(); await pronto(); await varre(p, `Verificação vindo de identity_required ${w}`);
    for (const [rot, u] of [['verificado (U1)', U.U1], ['certificado válido (U6)', U.U6]]) { await p.evaluate(async (v) => { const a = await import('/js/lib/api.js?v=' + v); await a.signOut(); }, VER); await p.waitForFunction(() => location.hash === '#/entrar'); await logged(d, { email: u.email, hash: '#/conta/verificacao' }); await pronto(); await varre(p, `Verificação ${rot} ${w}`); }
    await q(d, `update public.sign_identity set cert_not_after = now() - interval '2 days' where user_id = $1`, [U.U6.id]); await p.reload(); await pronto(); await varre(p, `Verificação certificado vencido ${w}`);
    await q(d, `update public.sign_identity set cert_not_after = null where user_id = $1`, [U.U6.id]); await p.reload(); await pronto(); await varre(p, `Verificação certificado vencido sem data ${w}`);
    await q(d, `delete from public.sign_trusted_roots`); await R();
  });


  // ---------- 1.3: Onboarding, os 3 passos e todos os estados, em 320, 768 e 1280 (claro e escuro) ----------
  for (const w of W) await t(`textos do Onboarding em ${w}`, open, { pg: DB, width: w, cfg: { timeoutMs: 2000, certTimeoutMs: 1500, certEndpoint: EDGE } }, async (d) => {
    const p = d.page; const Q = (s, a) => q(d, s, a);
    const novo = async (n, o) => { const u = await mk(Q, n, o); await d.fake.loadUsers(); return u; };
    const entra = async (u) => { await d.go('#/entrar'); await login(p, u.email, PW); await p.waitForFunction(() => /^#\/(documentos|onboarding)/.test(location.hash) && document.querySelector('.shell') && !document.querySelector('.ob[aria-busy="true"]') && document.querySelector('#view h1'), null, { timeout: 12000 }); await p.waitForTimeout(300); };
    const sai = async () => { await p.click('#avatar'); await p.click('.menu-item.danger'); await p.waitForFunction(() => location.hash === '#/entrar'); };
    const ir = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(500); };
    const pronta = () => p.waitForFunction(() => document.querySelector('.ob') && !document.querySelector('.ob[aria-busy="true"]') && document.querySelector('#ob-h'), null, { timeout: 12000 });
    const pronto = { verif: 'email' };
    for (const tema of ['claro', 'escuro']) {
      if (tema === 'escuro') await p.addInitScript(() => { document.documentElement.dataset.theme = 'dark'; });
      const T = (x) => `${x} (${tema}) ${w}`;
      // passo 1: sugestão do cadastro, erros de campo, erro ao salvar, erro ao carregar
      let u = await novo(401, { nome: null, cpf: null, meta: { name: 'Banco Falso S.A.' } });
      await entra(u); await pronta(); if (tema === 'escuro') await d.setTheme('dark'); await varre(p, T('Onboarding passo 1 com sugestão'));
      await p.fill('#pf-nome', 'Ana'); await p.fill('#pf-cpf', '123'); await p.click('.pf-save'); await varre(p, T('Onboarding passo 1 com erros de campo'));
      d.fake.state.mode.rpcDrop = { sign_profile_save: true }; await p.fill('#pf-nome', 'Ana Erro Rede'); await p.fill('#pf-cpf', cpfValido(401)); await p.click('.pf-save'); await p.waitForSelector('.pf-msg .banner', { timeout: 9000 }); await varre(p, T('Onboarding passo 1 erro ao salvar'));
      d.fake.state.mode.rpcDrop = { sign_me: true }; await p.reload(); await p.waitForSelector('.ob .banner.danger', { timeout: 12000 }); await varre(p, T('Onboarding erro ao carregar'));
      d.fake.state.mode.rpcDrop = {}; await p.click('text=Tentar de novo'); await pronta();
      // hash adiante: aviso "Falta concluir esta etapa antes."
      await ir('#/onboarding/3'); await p.waitForSelector('.ob-aviso'); await varre(p, T('Onboarding aviso de etapa'));
      await ir('#/onboarding/9'); await pronta(); await varre(p, T('Onboarding hash inválido'));
      await p.fill('#pf-nome', 'Nova Pessoa Teste'); await p.fill('#pf-cpf', cpfValido(401)); await p.click('.pf-save'); await p.waitForFunction(() => location.hash === '#/onboarding/2'); await pronta(); await p.waitForTimeout(300);
      // passo 2: vazio, código pedido, código errado, bloqueado, e-mail confirmado
      await varre(p, T('Onboarding passo 2 vazio'));
      await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await varre(p, T('Onboarding passo 2 código pedido'));
      const errado = (await d.fake.codeOf(u.email)) === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) { await p.fill('#vf-codigo', errado); await p.waitForFunction(() => document.querySelector('#vf-msg') && document.querySelector('#vf-msg').textContent.length > 0); await varre(p, T(`Onboarding passo 2 código errado ${i + 1}`)); await p.waitForTimeout(150); }
      await p.reload(); await pronta(); await varre(p, T('Onboarding passo 2 bloqueado após recarregar'));
      await Q(`delete from public.sign_otps where user_id = $1`, [u.id]); await Q(`update public.sign_identity set otp_locked_until = null where user_id = $1`, [u.id]); await p.reload(); await pronta();
      await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await p.keyboard.type(await d.fake.codeOf(u.email)); await p.waitForSelector('.vf-ok'); await varre(p, T('Onboarding passo 2 e-mail confirmado'));
      // passo 3 com e sem erro ao concluir
      await p.click('text=Continuar'); await p.waitForFunction(() => location.hash === '#/onboarding/3'); await pronta(); await p.waitForTimeout(500); await varre(p, T('Onboarding passo 3'));
      await p.click('text=Gerar desafio'); await p.waitForSelector('.vf-challenge'); await varre(p, T('Onboarding passo 3 com desafio'));
      d.fake.state.mode.rpcDrop = { sign_onboarding_done: true }; await p.click('text=Concluir'); await p.waitForSelector('.ob-msg .banner', { timeout: 15000 }); await varre(p, T('Onboarding passo 3 erro ao concluir'));
      d.fake.state.mode.rpcDrop = {};
      await Q(`update public.sign_identity set phone_verified_at = null, phone_channel = null where user_id = $1`, [u.id]); await p.click('.ob-msg >> text=Tentar de novo'); await p.waitForSelector('.ob-aviso'); await varre(p, T('Onboarding onboarding_incomplete (aviso)'));
      await Q(`update public.sign_identity set phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [u.id]); await p.reload(); await pronta(); await ir('#/onboarding/3'); await pronta(); await p.click('text=Pular certificado'); await p.waitForSelector('.toast'); await varre(p, T('Onboarding concluído + toast')); await sai();
      // celular verificado, só certificado (vencido, válido), e-mail não confirmado
      u = await novo(402, { verif: 'phone' }); await entra(u); await pronta(); await ir('#/onboarding/2'); await pronta(); await varre(p, T('Onboarding passo 2 celular verificado')); await ir('#/onboarding/3'); await pronta(); await varre(p, T('Onboarding passo 3 celular verificado')); await sai();
      u = await novo(403, { cert: 'ok' }); await entra(u); await pronta(); await varre(p, T('Onboarding passo 3 só certificado')); await ir('#/onboarding/2'); await pronta(); await varre(p, T('Onboarding passo 2 só certificado')); await sai();
      u = await novo(404, { cert: 'vencido' }); await entra(u); await pronta(); await varre(p, T('Onboarding com certificado vencido')); await sai();
      u = await novo(405, { nome: null, cpf: null, verif: 'email' }); await entra(u); await pronta(); await ir('#/onboarding/3'); await p.waitForSelector('.ob-aviso'); await varre(p, T('Onboarding /3 com perfil incompleto'));
      await Q(`update auth.users set email_confirmed_at = null where id = $1`, [u.id]); await p.reload(); await p.waitForSelector('.ob .banner', { timeout: 12000 }); await varre(p, T('Onboarding e-mail não confirmado'));
      await p.click('text=Reenviar e-mail'); await p.waitForSelector('.pf-msg .banner'); await varre(p, T('Onboarding e-mail não confirmado após reenvio'));
      await ir('#/conta/verificacao'); await p.waitForTimeout(800); await varre(p, T('Verificação e-mail não confirmado (um só aviso)'));
      await Q(`update auth.users set email_confirmed_at = now() where id = $1`, [u.id]);
      // Perfil e Verificação com as mudanças do ciclo 2 (V6-01 e V6-05)
      await sai(); u = await novo(406, { cert: 'ok', verif: 'email', done: true }); await Q(`update public.profiles set phone = '5511987651234' where id = $1`, [u.id]); await Q(`update public.sign_identity set phone = '5511987651234' where user_id = $1`, [u.id]);
      await entra(u); await ir('#/conta/perfil'); await p.waitForSelector('#pf-cel-l'); await varre(p, T('Perfil celular não verificado (e-mail verificado)')); await ir('#/conta/verificacao'); await p.waitForSelector('.vf-cert'); await varre(p, T('Verificação com titular mascarado'));
      await sai();
    }
  });

  // ---------- confirm() genérico ----------
  await t('textos do confirm() em 320', open, { width: 320 }, async (d) => {
    const p = d.page; await logged(d);
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); u.confirm('Título de teste', 'Texto de teste', 'Confirmar', true, 'Voltar'); }, VER);
    await p.waitForSelector('.modal'); await varre(p, 'confirm()');
  });

  // ---------- estático: nenhum replaceChildren nativo fora do helper seguro ----------
  const fs = require('fs'), path = require('path');
  const raiz = path.resolve(__dirname, '../../../apps/sign/js');
  const arqs = []; (function ler(dir) { for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n); if (fs.statSync(f).isDirectory()) { if (n !== 'vendor') ler(f); } else if (/\.js$/.test(n)) arqs.push(f); } })(raiz);
  const uso = arqs.filter((f) => !/lib[\\/]ui\.js$/.test(f) && /\.replaceChildren\(/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(raiz, f));
  check('estático: nenhum .replaceChildren( nativo fora de lib/ui.js (use setKids, que ignora null/undefined/false)', uso.length === 0, uso);

  console.info('limpando: reset.sh depois'); reset('depois');
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
