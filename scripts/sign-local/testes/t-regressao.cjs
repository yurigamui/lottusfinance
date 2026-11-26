// AC27 (seção 1.0): capturas da tela de Entrar (Entrar, Criar com erro, "Confirme seu e-mail", link vencido) e de assinar.html e verificar.html nas larguras 320, 360, 390, 768, 1280 e 1920.
// Uso: SHOTS=<pasta> [SIGN_APP=<cópia do app>] node t-regressao.cjs. Rode contra o commit anterior (SIGN_APP) e contra o atual e compare com cmp-capturas.py.
const { open } = require('./drv.cjs');
const { t, done, check } = require('./lib.cjs');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/tmp/sign-regressao';
fs.mkdirSync(SHOTS, { recursive: true });
const W = [320, 360, 390, 768, 1280, 1920];
const EMAIL = 'a'.repeat(240) + '@teste.example';
const NOME = 'N'.repeat(140);
const NOME2 = 'N'.repeat(69) + ' ' + 'M'.repeat(70);
let n = 0;
const shot = (p, f) => p.screenshot({ path: f, animations: 'disabled', caret: 'hide' });
(async () => {
  await t('AC27 capturas de Entrar', open, { width: 390, cfg: { resendCooldownMs: 1200 } }, async (d) => {
    const p = d.page;
    for (const w of W) {
      await p.setViewportSize({ width: w, height: w >= 1280 ? 900 : 800 });
      const go = async (h) => { await p.goto(d.origin + '/?r=' + (++n) + h); await p.waitForSelector('#sign h1'); await p.waitForTimeout(300); };
      await go('#/entrar'); await p.fill('#email', EMAIL); await p.fill('#senha', 'x'); await shot(p, `${SHOTS}/${w}-1-entrar.png`);
      await go('#/criar'); await p.fill('#email', EMAIL); await p.fill('#nome', NOME); await p.fill('#senha', '123');
      await p.click('form button[type=submit]'); await p.waitForSelector('#senha-err:not([hidden])'); await p.waitForTimeout(300); await shot(p, `${SHOTS}/${w}-2-criar-erro.png`);
      await p.fill('#nome', NOME2); await p.fill('#senha', 'uma-senha-longa'); await p.check('#aceite'); await p.click('form button[type=submit]');
      await p.waitForSelector('text=Confirme seu e-mail'); await p.waitForTimeout(300); await shot(p, `${SHOTS}/${w}-3-confirme.png`);
      await go('#error=access_denied&error_code=otp_expired'); await shot(p, `${SHOTS}/${w}-4-link-vencido.png`);
      for (const [i, pg] of [[5, 'assinar'], [6, 'verificar']]) { await p.goto(d.origin + '/' + pg + '.html?r=' + (++n)); await p.waitForTimeout(1500); await shot(p, `${SHOTS}/${w}-${i}-${pg}.png`); } // styles.css é compartilhado
    }
    check('36 capturas geradas', fs.readdirSync(SHOTS).length === 36);
  });
  done();
})();
