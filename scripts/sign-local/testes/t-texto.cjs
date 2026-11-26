// Guarda sistêmica (ciclo 3 da 1.4, achado N-01): em TODAS as telas e estados que os testes do Sign alcançam, nenhum texto visível
// (nós de texto, valores de campo, title, aria-label, alt, placeholder) pode conter "null", "undefined", "[object Object]" ou "NaN".
// Larguras: 320, 768 e 1280. Telas da entrada rodam no Auth em memória; as da área logada, no Supabase falso em repasse ao Postgres local.
// Uso: SIGN_DB=sign_dev SIGN_DB_ANTES=sign_dev_antes node t-texto.cjs     (SIGN_APP=<cópia do app> testa outra versão do código, ex.: a antiga)
const { open } = require('./drv.cjs');
const { check, t, done, logged, VER } = require('./lib.cjs');
const { U, restaurar, reset, DB } = require('./perfil-lib.cjs');
const W = [320, 768, 1280];
const RUIM = /\b(null|undefined|NaN)\b|\[object Object\]/;
const q = async (d, sql, a) => (await d.fake.query(sql, a)).rows;

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
    await p.goto(d.origin + '/#error_code=otp_expired'); await p.waitForSelector('#sign h1'); await varre(p, `link vencido ${w}`);
    await p.goto(d.origin + '/#/recuperar'); await p.waitForSelector('#sign h1'); await varre(p, `provisória pública (recuperar) ${w}`);
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
    for (const h of ['#/documentos', '#/envio/novo', '#/plano', '#/conta/verificacao', '#/conta/seguranca', '#/onboarding/1', '#/inexistente']) { await ir(h); await varre(p, `${h} ${w}`); }
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
