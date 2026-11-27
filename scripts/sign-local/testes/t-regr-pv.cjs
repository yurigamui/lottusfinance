// Regra 14 (1.3 toca perfil.js, verificacao.js, router.js, styles.css): capturas ANTES/DEPOIS das telas Perfil e Verificação, nas mesmas larguras e estados.
// Uso: SIGN_DB=... SIGN_DB_ANTES=... SHOTS=<pasta> [SIGN_APP=<cópia do app do commit anterior>] node t-regr-pv.cjs   (rode 2x, uma por versão, e compare com cmp-capturas.py)
// Mesmo banco (DEPOIS) nas duas rodadas: só o front muda. Estados: Perfil completo/travado (U1), Perfil incompleto com sugestão (U3), Verificação vazia (U2),
// Verificação com código pedido (U2), Verificação com certificado (U6), e-mail não confirmado (U2 sem confirmação).
const { open } = require('./drv.cjs');
const { t, done, check, logged } = require('./lib.cjs');
if (!process.env.SIGN_DB || !process.env.SIGN_DB_ANTES) { console.error('defina SIGN_DB e SIGN_DB_ANTES'); process.exit(2); }
const { U, restaurar, DB } = require('./perfil-lib.cjs');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/tmp/sign-regr-pv';
fs.mkdirSync(SHOTS, { recursive: true });
const W = [320, 390, 768, 1280, 1920];
const q = async (d, sql, a) => (await d.fake.query(sql, a)).rows;
const wait = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 12000 });
(async () => {
  for (const w of W) await t(`capturas Perfil e Verificação em ${w}`, open, { pg: DB, width: w, height: w >= 1280 ? 900 : 800, cfg: { certEndpoint: '', timeoutMs: 3000 } }, async (d) => {
    const p = d.page; const shot = (n) => p.screenshot({ path: `${SHOTS}/${w}-${n}.png`, animations: 'disabled', caret: 'hide', fullPage: true });
    const prepara = async () => { await restaurar((s, a) => q(d, s, a)); for (const u of [U.U1, U.U2, U.U6]) { for (const tb of ['sign_otps', 'sign_outbox', 'sign_cert_challenges', 'sign_cpf_attempts']) await q(d, `delete from public.${tb} where user_id = $1`, [u.id]); } await q(d, `update public.sign_identity set otp_locked_until = null where user_id = $1`, [U.U2.id]); await q(d, `update auth.users set email_confirmed_at = now()`); await q(d, `delete from public.sign_trusted_roots`); };
    const sai = async () => { await p.evaluate(async () => { Object.keys(localStorage).forEach((k) => localStorage.removeItem(k)); }); };
    await prepara();
    await logged(d, { email: U.U1.email, hash: '#/conta/perfil' }); await wait(p, () => document.querySelector('#pf-nome')); await p.waitForTimeout(300); await shot('1-perfil-completo');
    await sai(); await logged(d, { email: U.U3.email, hash: '#/conta/perfil' }); await wait(p, () => document.querySelector('#pf-nome')); await p.waitForTimeout(300); await shot('2-perfil-incompleto');
    await sai(); await logged(d, { email: U.U2.email, hash: '#/conta/verificacao' }); await wait(p, () => document.querySelector('.vf') && !document.querySelector('.vf[aria-busy="true"]')); await p.waitForTimeout(400); await shot('3-verificacao-vazia');
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await p.waitForTimeout(300); await shot('4-verificacao-codigo');
    await sai(); await logged(d, { email: U.U6.email, hash: '#/conta/verificacao' }); await wait(p, () => document.querySelector('.vf-cert')); await p.waitForTimeout(400); await shot('5-verificacao-certificado');
    await sai(); await logged(d, { email: U.U1.email, hash: '#/conta/verificacao' }); await wait(p, () => document.querySelector('.vf-value')); await p.waitForTimeout(400); await shot('6-verificacao-verificado');
    await q(d, `update auth.users set email_confirmed_at = null where id = $1`, [U.U1.id]); await p.reload(); await wait(p, () => document.querySelector('.vf .banner')); await p.waitForTimeout(400); await shot('7-verificacao-nao-confirmado');
    await prepara();
    check(`${w}: 7 capturas`, fs.readdirSync(SHOTS).filter((f) => f.startsWith(w + '-')).length === 7);
  });
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
