// AC13 (anti-corte), AC14 (zoom 200%), AC20 (capturas) nas larguras 320..2560 e nos temas claro/escuro. Capturas em /tmp/sign-shots.
const { open, overflow } = require('./drv.cjs');
const { check, t, done, hash } = require('./lib.cjs');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/tmp/sign-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const W = [320, 360, 390, 768, 1280, 1920, 2560];
const EMAIL = 'a'.repeat(240) + '@teste.example'; // 254
const NOME = 'N'.repeat(140); // sem espaços: dá erro de nome (2+ palavras)
const NOME2 = 'N'.repeat(69) + ' ' + 'M'.repeat(70); // 140, duas palavras longas
let n = 0;
const fresh = async (d, h) => { await d.page.goto(d.origin + '/?r=' + (++n) + h); await d.page.waitForSelector('#sign h1'); };

(async () => {
  for (const theme of ['light', 'dark']) {
    await t('AC13 + AC20 tema ' + theme, open, { width: 390, theme, cfg: { resendCooldownMs: 1200 } }, async (d) => {
      const p = d.page;
      for (const w of W) {
        await p.setViewportSize({ width: w, height: w >= 1280 ? 900 : 800 });
        const tag = `${theme}-${w}`;
        const chk = async (what) => { const o = await overflow(p); check(`AC13 ${tag} ${what}: sem rolagem horizontal e nada fora do cartão/tela`, !o.hscroll && o.over.length === 0 && o.outCard.length === 0, o); };
        await fresh(d, '#/entrar'); if (theme === 'dark') await d.setTheme('dark');
        await p.fill('#email', EMAIL); await p.fill('#senha', 'x');
        await p.screenshot({ path: `${SHOTS}/${tag}-1-entrar.png` }); await chk('entrar');
        await p.click('form button[type=submit]'); await p.waitForSelector('[role=alert] .sg-alert');
        await chk('entrar com erro');
        await fresh(d, '#/criar'); if (theme === 'dark') await d.setTheme('dark');
        await p.fill('#email', EMAIL); await p.fill('#nome', NOME); await p.fill('#senha', '123');
        await p.click('form button[type=submit]'); await p.waitForSelector('#senha-err:not([hidden])');
        await p.screenshot({ path: `${SHOTS}/${tag}-2-criar-erro.png` }); await chk('criar com erro');
        await p.fill('#nome', NOME2); await p.fill('#senha', 'uma-senha-longa'); await p.check('#aceite'); await p.click('form button[type=submit]');
        await p.waitForSelector('text=Confirme seu e-mail');
        await p.screenshot({ path: `${SHOTS}/${tag}-3-confirme.png` }); await chk('confirme seu e-mail');
        check(`AC13 ${tag} e-mail inteiro presente na tela`, (await p.locator('.sg-lead strong').innerText()) === EMAIL);
        await p.goto(d.origin + `/?r=${++n}#error=access_denied&error_code=otp_expired`); await p.waitForSelector('#sign h1');
        if (theme === 'dark') await d.setTheme('dark');
        await p.screenshot({ path: `${SHOTS}/${tag}-4-link-vencido.png` }); await chk('link vencido');
      }
      check(`AC20 ${theme}: ${fs.readdirSync(SHOTS).filter((f) => f.startsWith(theme + '-')).length} capturas`, fs.readdirSync(SHOTS).filter((f) => f.startsWith(theme + '-')).length === 28);
    });
  }

  // AC14: zoom de 200% = metade da largura em CSS px (320 -> 160, 1280 -> 640), escala 2
  for (const w of [320, 1280]) {
    await t('AC14 zoom 200% em ' + w, open, { width: w / 2, height: 500, scale: 2 }, async (d) => {
      const p = d.page;
      const reach = async (state) => {
        const o = await overflow(p);
        check(`AC14 ${w} ${state}: sem rolagem horizontal`, !o.hscroll && o.over.length === 0, o);
        const seen = new Set();
        await p.evaluate(() => document.activeElement && document.activeElement.blur());
        for (let i = 0; i < 14; i++) {
          await p.keyboard.press('Tab');
          const r = await p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const b = a.getBoundingClientRect(); return { id: a.id || a.textContent.trim().slice(0, 20), inView: b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1, h: b.height, w: b.width, tag: a.tagName, type: a.type }; });
          if (r) { seen.add(r.id); if (!r.inView) check(`AC14 ${w} ${state}: foco visível em ${r.id}`, false, r); if (r.tag !== 'INPUT' || r.type !== 'checkbox') if (r.h < 43.5 || r.w < 43.5) check(`AC14 ${w} ${state}: alvo >= 44 em ${r.id}`, false, r); }
        }
        return seen;
      };
      await d.go('#/entrar');
      let s = await reach('Entrar'); check(`AC14 ${w} Entrar: campos e botão alcançáveis`, s.has('email') && s.has('senha') && s.has('Entrar'), [...s]);
      await d.go('#/criar');
      s = await reach('Criar'); check(`AC14 ${w} Criar: campos, aceite e botão alcançáveis`, s.has('email') && s.has('nome') && s.has('senha') && s.has('aceite') && s.has('Criar conta'), [...s]);
      await p.fill('#email', 'novo@teste.example'); await p.fill('#nome', 'Ana Teste'); await p.fill('#nome', NOME2); await p.fill('#senha', 'uma-senha-longa'); await p.check('#aceite'); await p.click('form button[type=submit]');
      await p.waitForSelector('text=Confirme seu e-mail');
      s = await reach('Confirme'); check(`AC14 ${w} Confirme: botões alcançáveis`, s.has('Usar outro e-mail') || [...s].some((x) => /Reenviar|Usar outro/.test(x)), [...s]);
    });
  }
  // alvos de 44 px em largura comum
  await t('Alvos 44 px (390)', open, { width: 390 }, async (d) => {
    const p = d.page; await d.go('#/criar');
    const small = await p.evaluate(() => [...document.querySelectorAll('#sign button, #sign a, #sign input:not([type=checkbox])')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.height < 43.5 || b.width < 43.5); }).map((e) => e.id || e.textContent));
    check('todos os botões, links e campos com 44 px ou mais', small.length === 0, small);
  });
  done();
})();
