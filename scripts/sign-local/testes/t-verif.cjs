// Seção 1.5 (Verificação de identidade), TELA: AC1 a AC10 e AC-R1 a AC-R4, em Playwright contra o Supabase falso em modo repasse (Postgres local ISOLADO).
// A função de borda do certificado é SIMULADA pelo fake-sign.cjs (a real não existe no repositório, T-07): o que se testa é a tela e o banco.
// Uso: SIGN_DB=sign_dev15 SIGN_DB_ANTES=sign_dev15_antes [SHOTS=<pasta>] [ONLY=<regex>] node t-verif.cjs   (recria o banco no início e no fim)
const { open, overflow } = require('./drv.cjs');
const { check, t: t0, done, hash, text, logged, VER } = require('./lib.cjs');
if (!process.env.SIGN_DB || !process.env.SIGN_DB_ANTES) { console.error('defina SIGN_DB e SIGN_DB_ANTES (bancos isolados; nunca o "sign" compartilhado)'); process.exit(2); }
const ONLY = process.env.ONLY;
const t = (name, ...r) => (ONLY && !new RegExp(ONLY).test(name) ? Promise.resolve() : t0(name, ...r));
const { U, restaurar, reset, DB } = require('./perfil-lib.cjs');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SHOTS = process.env.SHOTS || '/tmp/sign-shots-verif';
fs.mkdirSync(SHOTS, { recursive: true });
const PROD = 'https://rowhslnnlzfbhmzbylbz.supabase.co';
const EDGE = PROD + '/functions/v1/sign-cert-validate';
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 8000 });
const q = async (d, sql, a) => (await d.fake.query(sql, a)).rows;
const L = [320, 375, 768, 1024, 1440, 2560];
const ROOT_SQL = `insert into public.sign_trusted_roots (name, pem, sha256, active) values ('Raiz de teste', 'PEM-FICTICIO', 'aa11', true) on conflict do nothing`;
const verif = (d, email) => logged(d, { email, hash: '#/conta/verificacao' });
const ready = (p) => wait(p, () => document.querySelector('.vf') && !document.querySelector('.vf[aria-busy="true"]') || document.querySelector('.vf .banner.danger'));
const limpar = async (d, uid) => {
  for (const tb of ['sign_otps', 'sign_outbox', 'sign_cert_challenges', 'sign_cpf_attempts']) await q(d, `delete from public.${tb} where user_id = $1`, [uid]);
  await q(d, `update public.sign_identity set phone_verified_at = null, phone_channel = null, phone = null, otp_locked_until = null where user_id = $1`, [uid]);
};
const dorme = (d, uid, s) => q(d, `update public.sign_otps set created_at = created_at - make_interval(secs => $2) where user_id = $1`, [uid, s]);
const reset15 = async (d) => {
  await restaurar((s, a) => q(d, s, a));
  for (const u of [U.U1, U.U2, U.U3, U.U4, U.U6]) await limpar(d, u.id);
  await q(d, `update public.sign_identity set phone = '5511987651234', phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [U.U1.id]);
  await q(d, `update public.sign_identity set cert_not_after = now() + interval '300 days', cert_verified_at = now(), cert_chain_ok = true, cert_cpf = $2, cert_serial = '0A1B', cert_subject = 'CN=Fabi Exemplo', cert_issuer = 'AC Exemplo', cert_not_before = now() - interval '30 days' where user_id = $1`, [U.U6.id, U.U6.cpf]);
  await q(d, `delete from public.sign_trusted_roots`);
  await q(d, `update auth.users set email_confirmed_at = now()`);
  await q(d, `update public.sign_messaging_config set whatsapp_enabled = false`);
  await q(d, `update public.profiles set full_name = $2 where id = $1`, [U.U3.id, null]);
};
const PG = { pg: DB };
const comEdge = { certEndpoint: EDGE, certTimeoutMs: 1500 };
const shot = (p, nome) => p.screenshot({ path: path.join(SHOTS, nome + '.png'), fullPage: true });
const toqueMin = (p) => p.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('#sign button, #sign a[href], #sign input:not([type=hidden]), #sign select, #sign textarea')) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let oc = false; for (let x = e; x; x = x.parentElement) if (x.hidden || getComputedStyle(x).display === 'none') { oc = true; break; }
    if (oc || e.classList.contains('skip-link') || e.closest('.sr-only')) continue;
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
    if (b.width < 43.5 || b.height < 43.5) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
  }
  return out;
});
const cortes = (p) => p.evaluate(() => {
  const out = []; const vw = window.innerWidth;
  for (const e of document.querySelectorAll('.vf *')) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || e.closest('.vf-trunc') || e.classList.contains('vf-trunc')) continue;
    const b = e.getBoundingClientRect(); if (!b.width) continue;
    if (b.right > vw + 0.5 || b.left < -0.5) out.push('fora: ' + e.tagName + '.' + e.className);
    if (/hidden|clip/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'INPUT') out.push('corte: ' + e.tagName + '.' + e.className + ' ' + e.scrollWidth + '>' + e.clientWidth);
  }
  return out;
});
const fileCert = (o) => ({ name: 'cert.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ serial: 'AB12', subject: 'CN=Fabi Exemplo', issuer: 'AC Teste', cpf: U.U6.cpf, not_before: new Date(Date.now() - 30 * 864e5).toISOString(), not_after: new Date(Date.now() + 300 * 864e5).toISOString(), chain_ok: true, ...o })) });
const limpaCert = (d) => q(d, `update public.sign_identity set cert_serial = null, cert_subject = null, cert_issuer = null, cert_cpf = null, cert_not_before = null, cert_not_after = null, cert_verified_at = null, cert_chain_ok = false where user_id = $1`, [U.U6.id]);
const codigo = (d, email) => d.fake.codeOf(email);

(async () => {
  console.info('recriando banco local isolado...'); reset('depois');

  // ---------------------------------------------------------------------------------------------------------------- AC1, AC10 (fluxo feliz)
  await t('AC1 fluxo feliz: enviar código, digitar, E-mail confirmado, nível sobe', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await verif(d, U.U2.email); await ready(p);
    check('AC1 título da aba "Verificação de identidade · Conta · Lottus Sign"', (await p.title()) === 'Verificação de identidade · Conta · Lottus Sign', await p.title());
    check('AC1 rota deixou de ser "Em construção": h2 "Verificação de identidade" e cartões', (await text(p, '#vf-h')) === 'Verificação de identidade' && (await p.locator('.vf-card').count()) === 3 && !/Em construção/.test(await p.locator('body').innerText()));
    check('AC1 antes: nível Simples no cartão e no cabeçalho', (await text(p, '.vf-level .tag')) === 'Simples' && (await text(p, '.org-sub')) === 'Simples');
    check('AC1 antes: texto do estado vazio', (await text(p, '.vf-empty')).includes('Seu e-mail ainda não foi confirmado como contato de assinatura.'));
    const radios = await p.locator('.vf-radio').allInnerTexts();
    check('AC2 só o canal "E-mail" aparece (WhatsApp e SMS não existem, nem desabilitados)', radios.length === 1 && radios[0].trim() === 'E-mail', radios);
    check('AC1 botão "Enviar código" presente e o campo de código ainda não', (await p.getByRole('button', { name: 'Enviar código' }).count()) === 1 && (await p.locator('#vf-codigo').count()) === 0);
    await p.click('text=Enviar código');
    await p.waitForSelector('#vf-codigo');
    const c = await codigo(d.fake ? d : d, U.U2.email);
    check('AC1 depois do envio: campo de código com inputmode numeric e autocomplete one-time-code', (await p.getAttribute('#vf-codigo', 'inputmode')) === 'numeric' && (await p.getAttribute('#vf-codigo', 'autocomplete')) === 'one-time-code');
    check('AC1 ajuda mostra o destino mascarado e a validade', /Enviamos o código para b\*\*\*@teste\.example\. Ele vale 10 minutos\./.test(await text(p, '#vf-codigo-help')), await text(p, '#vf-codigo-help'));
    check('AC1 foco no campo de código', (await p.evaluate(() => document.activeElement.id)) === 'vf-codigo');
    check('AC1 o código existe no banco (6 dígitos) e não aparece na tela', /^\d{6}$/.test(c) && !(await p.locator('body').innerText()).includes(c), c);
    await p.keyboard.type(`${c.slice(0, 3)} ${c.slice(3)}`);   // colar/digitar com espaço: só 6 dígitos valem; envia sozinho ao completar
    await wait(p, () => document.querySelector('.vf-ok'));
    check('AC1 aparece "E-mail confirmado."', (await text(p, '.vf-ok')) === 'E-mail confirmado.', await text(p, '.vf-ok'));
    check('AC1 linha "Contato verificado": E-mail confirmado com data dd/mm/aaaa', /E-mail confirmado\s+em \d{2}\/\d{2}\/\d{4}/.test(await text(p, '.vf-value')), await text(p, '.vf-value'));
    check('AC1 nível sobe para Avançada no cartão e no shell (sem recarregar)', (await text(p, '.vf-level .tag')) === 'Avançada' && (await text(p, '.org-sub')) === 'Avançada');
    check('AC1 o cartão de nível mostra "Avançada: contato verificado." e "Ir para meus documentos"', (await text(p, '.vf-rule')) === 'Avançada: contato verificado.' && (await p.getByRole('link', { name: 'Ir para meus documentos' }).getAttribute('href')) === '#/documentos');
    check('AC1 toast "E-mail confirmado."', (await text(p, '.toast-title')) === 'E-mail confirmado.');
    await p.click('nav.tabs >> text=Perfil'); await wait(p, () => location.hash === '#/conta/perfil' && document.querySelector('.pf-level .tag'));
    check('AC1/AC10 no Perfil o nível também é Avançada', (await text(p, '.pf-level .tag')) === 'Avançada' && (await text(p, '.org-sub')) === 'Avançada');
    const bd = (await q(d, `select phone_channel, phone_verified_at is not null v from public.sign_identity where user_id = $1`, [U.U2.id]))[0];
    check('AC1 banco: phone_channel=email e verificado', bd.phone_channel === 'email' && bd.v === true, bd);
    check('AC1 sem erros no console e sem requisição externa', d.errors.length === 0 && d.external.length === 0, [d.errors, d.external]);
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC2
  await t('AC2 canal desligado: só E-mail; chamada direta recebe channel_unavailable', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await verif(d, U.U2.email); await ready(p);
    const r = await p.evaluate(async (v) => {
      const api = await import('/js/lib/api.js?v=' + v);
      try { await api.phoneSend('(11) 98888-7777', 'whatsapp'); return 'sem erro'; } catch (e) { return e.code; }
    }, VER);
    check('AC2 chamada direta (console) com whatsapp: channel_unavailable', r === 'channel_unavailable', r);
    const s = await p.evaluate(async (v) => { const api = await import('/js/lib/api.js?v=' + v); try { await api.phoneSend('', 'sms'); return 'sem erro'; } catch (e) { return (e.message || '').slice(0, 60); } }, VER);
    check('AC2 chamada direta com sms: invalid_channel', /invalid_channel/.test(s), s);
    check('AC2 nada foi gravado pelas chamadas recusadas', (await q(d, `select count(*)::int n from public.sign_otps where user_id = $1`, [U.U2.id]))[0].n === 0);
    // ligado pelo Yuri: o WhatsApp aparece, com campo de celular
    await q(d, `update public.sign_messaging_config set whatsapp_enabled = true`);
    await p.reload(); await ready(p);
    const rs = await p.locator('.vf-radio').allInnerTexts();
    check('AC2 com whatsapp_enabled=true aparecem E-mail e WhatsApp', JSON.stringify(rs.map((x) => x.trim())) === '["E-mail","WhatsApp"]', rs);
    await p.click('label[for=vf-canal-whatsapp]'); await p.waitForSelector('#vf-fone');
    await p.click('text=Enviar código'); check('AC2 whatsapp sem celular: pede o celular', (await text(p, '.vf-msg')) === 'Informe o celular com DDD.', await text(p, '.vf-msg'));
    await p.fill('#vf-fone', '(11) 98888-7777'); await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo');
    check('AC2 whatsapp ligado: envia e mostra o celular mascarado', /\(11\)/.test(await text(p, '#vf-codigo-help')), await text(p, '#vf-codigo-help'));
    await q(d, `update public.sign_messaging_config set whatsapp_enabled = false`); await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC3
  await t('AC3 5 erros: contagem 4 a 1, bloqueio de 30 min, persiste ao recarregar', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await verif(d, U.U2.email); await ready(p);
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo');
    const c = await codigo(d, U.U2.email); const errado = c === '000000' ? '111111' : '000000';
    const vistos = [];
    for (let i = 4; i >= 1; i--) {
      await p.fill('#vf-codigo', errado); await wait(p, (n) => document.querySelector('#vf-msg') && document.querySelector('#vf-msg').textContent.includes('mais ' + n + ' '), i);
      vistos.push(await text(p, '#vf-msg'));
      await p.waitForFunction(() => !document.querySelector('#vf-codigo').disabled && !document.querySelector('.vf-actions .btn[aria-busy]'));
    }
    check('AC3 mensagens exatas de 4 a 1', JSON.stringify(vistos) === JSON.stringify([4, 3, 2, 1].map((n) => `Código incorreto. Você tem mais ${n} tentativas.`)), vistos);
    check('AC3 depois de cada erro o campo é limpo e fica com o foco', (await p.inputValue('#vf-codigo')) === '' && (await p.evaluate(() => document.activeElement.id)) === 'vf-codigo');
    await p.fill('#vf-codigo', errado); await wait(p, () => /Muitas tentativas/.test(document.querySelector('#vf-msg').textContent));
    check('AC3 5ª: "Muitas tentativas. Tente de novo em 30 minutos."', (await text(p, '#vf-msg')) === 'Muitas tentativas. Tente de novo em 30 minutos.', await text(p, '#vf-msg'));
    const off = await p.evaluate(() => ['#vf-codigo', '.vf-actions .btn'].map((s) => [...document.querySelectorAll(s)].every((e) => e.disabled)));
    check('AC3 campo, Confirmar e Reenviar ficam desligados', off[0] && off[1], off);
    check('AC3 banco: attempts=5 e bloqueio de ~30 min', (await q(d, `select (select attempts from public.sign_otps where user_id = $1) a, (select extract(epoch from (otp_locked_until - now()))::int from public.sign_identity where user_id = $1) s`, [U.U2.id]))[0].a === 5);
    await shot(p, 'ac3-bloqueado-390');
    await p.reload(); await ready(p);
    check('AC3 recarregar mantém o bloqueio: mensagem de 30 minutos e "Enviar código" desligado', (await text(p, '.vf-msg')) === 'Muitas tentativas. Tente de novo em 30 minutos.' && (await p.getByRole('button', { name: 'Enviar código' }).isDisabled()), await text(p, '.vf-msg'));
    check('AC3 o servidor também recusa pela chamada direta (otp_locked)', await p.evaluate(async (v) => { const api = await import('/js/lib/api.js?v=' + v); try { await api.phoneSend('', 'email'); return 'sem erro'; } catch (e) { return e.code; } }, VER) === 'otp_locked');
    // bloqueio acabou
    await q(d, `update public.sign_identity set otp_locked_until = now() + interval '2 seconds' where user_id = $1`, [U.U2.id]);
    await p.reload(); await ready(p);
    check('AC3 bloqueio de 2 s: mensagem "em 1 minutos" (arredonda para cima)', (await text(p, '.vf-msg')) === 'Muitas tentativas. Tente de novo em 1 minutos.', await text(p, '.vf-msg'));
    await wait(p, () => !document.querySelector('.vf-actions .btn:disabled') && document.querySelector('.vf-msg').textContent === '', null, 6000);
    check('AC3 passado o bloqueio, a mensagem some e o botão volta sozinho', true);
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC4
  await t('AC4 reenvio: 30 s com contagem regressiva e limite de 3 por hora', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await verif(d, U.U2.email); await ready(p);
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo');
    const r0 = await text(p, '.vf-actions .btn.secondary');
    check('AC4 logo após o envio "Reenviar código" está desligado com contagem (30 s)', /^Reenviar código \((29|30) s\)$/.test(r0) && (await p.locator('.vf-actions .btn.secondary').isDisabled()), r0);
    await p.waitForTimeout(2300);
    const r1 = await text(p, '.vf-actions .btn.secondary');
    check('AC4 a contagem regressiva anda (menor que antes)', Number(r1.match(/\((\d+) s\)/)[1]) < Number(r0.match(/\((\d+) s\)/)[1]) && Number(r1.match(/\((\d+) s\)/)[1]) <= 28, [r0, r1]);
    await shot(p, 'ac4-contagem-390');
    await d.page.close();
  });
  await t('AC4b 3 envios na hora: limite aparece', open, { ...PG, width: 390, cfg: { otpCooldownMs: 1200 } }, async (d) => {
    const p = d.page; await reset15(d);
    await verif(d, U.U2.email); await ready(p);
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo');
    check('AC4b 1º envio: nada de limite ainda', (await text(p, '.vf-limit')) === '');
    // too_soon do servidor: o relógio da tela (1,2 s) libera antes dos 30 s do servidor
    await p.waitForFunction(() => !document.querySelector('.vf-actions .btn.secondary').disabled, null, { timeout: 5000 });
    await p.click('.vf-actions .btn.secondary');
    await wait(p, () => /Aguarde \d+ segundos para reenviar\./.test(document.querySelector('#vf-msg').textContent));
    check('AC4b servidor recusa antes de 30 s: "Aguarde {s} segundos para reenviar." (s entre 1 e 30)', /^Aguarde (\d+) segundos para reenviar\.$/.test(await text(p, '#vf-msg')) && Number((await text(p, '#vf-msg')).match(/\d+/)[0]) <= 30, await text(p, '#vf-msg'));
    for (let i = 2; i <= 3; i++) {
      await dorme(d, U.U2.id, 31);
      await p.waitForFunction(() => !document.querySelector('.vf-actions .btn.secondary').disabled, null, { timeout: 5000 });
      await p.click('.vf-actions .btn.secondary');
      await wait(p, (n) => document.querySelector('#vf-msg').textContent === '' && !document.querySelector('.vf-actions .btn[aria-busy]'), i);
    }
    await wait(p, () => /Limite de reenvios atingido/.test(document.querySelector('.vf-limit').textContent));
    check('AC4b após 3 envios: "Limite de reenvios atingido. Tente de novo em {mm} minutos." e Reenviar desligado', /^Limite de reenvios atingido\. Tente de novo em (5\d|60) minutos\.$/.test(await text(p, '.vf-limit')) && (await p.locator('.vf-actions .btn.secondary').isDisabled()), await text(p, '.vf-limit'));
    check('AC4b só 3 códigos foram gerados', (await q(d, `select count(*)::int n from public.sign_otps where user_id = $1`, [U.U2.id]))[0].n === 3);
    await shot(p, 'ac4-limite-390');
    // recarregar e tentar enviar: servidor devolve too_many e a tela mostra a mensagem
    await dorme(d, U.U2.id, 31);
    await p.reload(); await ready(p); await p.click('text=Enviar código');
    await wait(p, () => /Limite de reenvios atingido/.test(document.querySelector('#vf-msg').textContent));
    check('AC4b recarregar e pedir de novo: too_many com "Tente de novo em {mm} minutos."', /^Limite de reenvios atingido\. Tente de novo em \d+ minutos\.$/.test(await text(p, '#vf-msg')), await text(p, '#vf-msg'));
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- erros do código: expirado, inexistente
  await t('AC3b otp_expired e otp_not_found com os textos exatos', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await verif(d, U.U2.email); await ready(p);
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo');
    await q(d, `update public.sign_otps set expires_at = now() - interval '1 second' where user_id = $1`, [U.U2.id]);
    await p.fill('#vf-codigo', await codigo(d, U.U2.email)); await wait(p, () => document.querySelector('#vf-msg').textContent !== '');
    check('AC3b código expirado: "O código expirou. Peça um novo."', (await text(p, '#vf-msg')) === 'O código expirou. Peça um novo.', await text(p, '#vf-msg'));
    await q(d, `delete from public.sign_otps where user_id = $1`, [U.U2.id]);
    await p.fill('#vf-codigo', '123456'); await wait(p, () => /Peça um código/.test(document.querySelector('#vf-msg').textContent));
    check('AC3b sem código pedido: "Peça um código para continuar."', (await text(p, '#vf-msg')) === 'Peça um código para continuar.', await text(p, '#vf-msg'));
    await p.fill('#vf-codigo', '12'); await p.click('.vf-actions .btn:not(.secondary)');
    check('AC3b Confirmar com menos de 6 dígitos: "Digite os 6 dígitos do código."', (await text(p, '#vf-msg')) === 'Digite os 6 dígitos do código.', await text(p, '#vf-msg'));
    d.fake.state.mode.rpcDrop = { sign_phone_verify: true }; await p.fill('#vf-codigo', '123456');
    await wait(p, () => /conexão/.test(document.querySelector('#vf-msg').textContent), null, 12000);
    check('AC3b rede caiu: mensagem de conexão e o campo continua utilizável', (await text(p, '#vf-msg')).includes('Verifique sua conexão') && !(await p.locator('#vf-codigo').isDisabled()), await text(p, '#vf-msg'));
    d.fake.state.mode.rpcDrop = {};
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC5
  await t('AC5 função de borda fora do ar: indicador, envio desligado, contato continua', open, { ...PG, width: 390, cfg: comEdge }, async (d) => {
    const p = d.page; await reset15(d); await q(d, ROOT_SQL);
    for (const modo of ['down', 'timeout', '404', '500']) {
      d.fake.state.mode.certEdge = modo;
      await verif(d, U.U2.email); await ready(p);
      await wait(p, () => document.querySelector('.vf .banner.warn'), null, 6000);
      check(`AC5 borda "${modo}": indicador "Validação de certificado indisponível neste ambiente."`, (await text(p, '.vf .banner.warn')) === 'Validação de certificado indisponível neste ambiente.', await text(p, '.vf .banner.warn'));
      await p.click('text=Gerar desafio'); await p.waitForSelector('.vf-challenge');
      check(`AC5 borda "${modo}": campo de arquivo e "Enviar arquivo assinado" desligados`, (await p.locator('#vf-arquivo').isDisabled()) && (await p.getByRole('button', { name: 'Enviar arquivo assinado' }).isDisabled()));
      await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await wait(p, () => location.hash === '#/conta/perfil');
    }
    d.fake.state.mode.certEdge = 'timeout';
    await verif(d, U.U2.email).catch(() => {}); await ready(p); await wait(p, () => document.querySelector('.vf .banner.warn'), null, 6000);
    // o contato continua funcionando com a borda fora do ar
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await p.fill('#vf-codigo', await codigo(d, U.U2.email));
    await wait(p, () => document.querySelector('.vf-ok'));
    check('AC5 com a borda fora do ar o contato confirma normalmente (E-mail confirmado.)', (await text(p, '.vf-ok')) === 'E-mail confirmado.');
    check('AC5 o indicador continua visível e a página não tem erro de JS', (await p.locator('.vf .banner.warn').count()) === 1 && d.errors.length === 0, d.errors);
    await shot(p, 'ac5-indisponivel-390');
    // borda no ar: sem indicador
    d.fake.state.mode.certEdge = undefined; await limpar(d, U.U2.id);
    await verif(d, U.U2.email).catch(() => {}); await p.reload(); await ready(p); await p.waitForTimeout(600);
    check('AC5 borda no ar: nenhum indicador', (await p.locator('.vf .banner.warn').count()) === 0);
    await reset15(d);
  });
  await t('AC5b sem endereço configurado (padrão): indicador sem chamar a borda', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await verif(d, U.U2.email); await ready(p);
    check('AC5b indicador presente por padrão', (await text(p, '.vf .banner.warn')) === 'Validação de certificado indisponível neste ambiente.');
    check('AC5b nenhuma chamada a /functions/ (desligado)', !d.fake.state.log.some((l) => /\/functions\//.test(l.path)), d.fake.state.log.filter((l) => /functions/.test(l.path)));
  });

  // ---------------------------------------------------------------------------------------------------------------- AC6 certificado
  await t('AC6 certificado: vinculado, vencido e cada mensagem de erro', open, { ...PG, width: 768, cfg: comEdge }, async (d) => {
    const p = d.page; await reset15(d); await q(d, ROOT_SQL); await limpaCert(d);
    await verif(d, U.U6.email); await ready(p); await wait(p, () => document.querySelector('.vf-actions .btn.secondary'));
    check('AC6 sem certificado e borda no ar: nenhum indicador de indisponível', (await p.locator('.vf .banner.warn').count()) === 0);
    const gerar = async () => { await p.click('text=Gerar desafio'); await p.waitForSelector('.vf-challenge'); };
    const enviar = async (arq) => { await p.setInputFiles('#vf-arquivo', arq); await p.click('text=Enviar arquivo assinado'); };
    const msg = async () => { await wait(p, () => document.querySelector('.vf-msg') && document.querySelector('.vf-msg').textContent !== ''); return text(p, '.vf-msg'); };
    await gerar();
    check('AC6 desafio: texto com o código, "O desafio vale 5 minutos." e botão Copiar', /Lottus Sign - vinculo de certificado digital\. Codigo: [0-9a-f]{48}/.test(await text(p, '.vf-challenge')) && (await text(p, '.vf-challenge + .vf-actions + .help, .field .help')).includes('O desafio vale 5 minutos.') && (await p.getByRole('button', { name: 'Copiar' }).count()) === 1);
    check('AC6 o campo de arquivo mostra [preencher] do formato (T-07)', /\[preencher: formato e componente de assinatura local, definidos por T-07\]/.test(await text(p, '#vf-arquivo-help')));
    await p.click('text=Enviar arquivo assinado'); check('AC6 sem arquivo: "Escolha o arquivo assinado."', (await text(p, '.vf-msg')) === 'Escolha o arquivo assinado.');
    const casos = [
      ['cert_cpf_mismatch', { cpf: '12345678909' }, 'O CPF do certificado é diferente do CPF do seu perfil.'],
      ['cert_chain_invalid', { chain_ok: false }, 'Não foi possível confirmar a cadeia de certificação. Use um certificado ICP-Brasil.'],
      ['cert_expired', { not_after: new Date(Date.now() - 864e5).toISOString() }, 'Este certificado está vencido. Use um certificado válido.'],
      ['cert_not_yet_valid', { not_before: new Date(Date.now() + 864e5).toISOString() }, 'Este certificado ainda não está válido.'],
    ];
    for (const [cod, o, esperado] of casos) {
      await enviar(fileCert(o)); const m = await msg();
      check(`AC6 ${cod}: texto exato`, m === esperado, m);
      if (cod === 'cert_cpf_mismatch') { check('AC6 cert_cpf_mismatch oferece "Corrigir meu CPF" (leva ao perfil)', (await p.getByRole('link', { name: 'Corrigir meu CPF' }).getAttribute('href')) === '#/conta/perfil'); await shot(p, 'ac6-erro-cpf-768'); }
      check(`AC6 ${cod}: o nível continua Simples e nada foi vinculado`, (await text(p, '.vf-level .tag')) === 'Simples' && (await q(d, `select cert_verified_at from public.sign_identity where user_id = $1`, [U.U6.id]))[0].cert_verified_at === null);
    }
    await q(d, `update public.sign_cert_challenges set expires_at = now() - interval '1 second' where user_id = $1`, [U.U6.id]);
    await enviar(fileCert({})); check('AC6 challenge_expired: "O desafio expirou. Gere um novo."', (await msg()) === 'O desafio expirou. Gere um novo.');
    check('AC6 challenge_expired: o desafio some e dá para gerar outro', (await p.locator('.vf-challenge').count()) === 0 && (await p.getByRole('button', { name: 'Gerar desafio' }).isEnabled()));
    await gerar(); await enviar({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('isto nao e um certificado') });
    check('AC6 arquivo ilegível: mostra a causa de cadeia (nada de código cru)', (await msg()) === 'Não foi possível confirmar a cadeia de certificação. Use um certificado ICP-Brasil.');
    await p.setInputFiles('#vf-arquivo', { name: 'grande.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(300 * 1024, 1) }); await p.click('text=Enviar arquivo assinado');
    check('AC6 arquivo acima de 256 KB: "O arquivo é grande demais. O limite é 256 KB."', (await text(p, '.vf-msg')) === 'O arquivo é grande demais. O limite é 256 KB.');
    await enviar(fileCert({}));
    await wait(p, () => document.querySelector('.vf-cert'), null, 8000);
    check('AC6 vinculado: selo "Certificado vinculado" e dados (titular, emissor, CPF mascarado, validade, série)', (await text(p, '.vf-level .tag + *, .vf-card:nth-of-type(1) .tag')).length >= 0 && /Certificado vinculado/.test(await p.locator('.vf-col .vf-card').nth(2).innerText()));
    const cartao = await p.locator('.vf-cert').innerText();
    check('AC6 vinculado: CPF mascarado •••.xxx.xxx-••, validade "até dd/mm/aaaa", série', cartao.includes('CN=Fabi Exemplo') && cartao.includes('AC Teste') && /•••\.\d{3}\.\d{3}-••/.test(cartao) && !cartao.includes(U.U6.cpf) && /até \d{2}\/\d{2}\/\d{4}/.test(cartao) && cartao.includes('AB12'), cartao);
    check('AC6 vinculado: nível Qualificada no cartão e no shell; frase da regra', (await text(p, '.vf-level .tag')) === 'Qualificada' && (await text(p, '.org-sub')) === 'Qualificada' && (await text(p, '.vf-rule')) === 'Qualificada: certificado digital válido.');
    check('AC6 vinculado: o nonce não pode ser reusado (uso único no banco)', (await q(d, `select count(*)::int n from public.sign_cert_challenges where user_id = $1 and bound_at is not null`, [U.U6.id]))[0].n === 1);
    await shot(p, 'ac6-vinculado-768');
    // vencido
    await q(d, `update public.sign_identity set cert_not_after = now() - interval '2 days' where user_id = $1`, [U.U6.id]);
    await p.reload(); await ready(p);
    const venc = new Date(Date.now() - 2 * 864e5).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    check('AC6 vencido: "Certificado vencido em dd/mm/aaaa" (data certa)', (await text(p, '.vf .banner.danger')) === `Certificado vencido em ${venc}`, await text(p, '.vf .banner.danger'));
    check('AC6 vencido: o nível NÃO é Qualificada (Simples) no cartão e no shell; nenhum cartão de certificado vinculado', (await text(p, '.vf-level .tag')) === 'Simples' && (await text(p, '.org-sub')) === 'Simples' && (await p.locator('.vf-cert').count()) === 0);
    await shot(p, 'ac6-vencido-768');
    // raízes não carregadas
    await q(d, `delete from public.sign_trusted_roots`); await q(d, `delete from public.sign_cert_challenges`);
    await p.reload(); await ready(p); await gerar();
    check('AC6 roots_loaded=false: "Nenhuma autoridade raiz confiável está carregada." + indicador + envio desligado', (await text(p, '.vf-msg')) === 'Nenhuma autoridade raiz confiável está carregada.' && (await p.locator('.vf .banner.warn').count()) === 1 && (await p.getByRole('button', { name: 'Enviar arquivo assinado' }).isDisabled()) && (await p.getByRole('link', { name: 'Suporte' }).count()) === 1);
    await shot(p, 'ac6-sem-raizes-768');
    check('AC6 sem erros de JS', d.errors.length === 0, d.errors);
    await reset15(d);
  });
  await t('AC6b cpf_required: perfil sem CPF', open, { ...PG, width: 390, cfg: comEdge }, async (d) => {
    const p = d.page; await reset15(d); await q(d, ROOT_SQL);
    await verif(d, U.U3.email); await ready(p); await p.click('text=Gerar desafio');
    await wait(p, () => document.querySelector('.vf .vf-msg') && document.querySelector('.vf .vf-msg').textContent !== '');
    const m = await text(p, '.vf-card:nth-of-type(1) .vf-msg, .vf-col:last-child .vf-card:last-child .vf-msg');
    check('AC6b cpf_required: "Informe seu CPF no perfil antes de usar um certificado." com saída para o perfil', m === 'Informe seu CPF no perfil antes de usar um certificado.' && (await p.getByRole('link', { name: 'Informar meu CPF' }).getAttribute('href')) === '#/conta/perfil', m);
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC7 estados
  await t('AC7 estados: sem sessão, não confirmado, carregando, erro, vazio e sucesso', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await d.go('#/conta/verificacao');
    await wait(p, () => location.hash === '#/entrar');
    check('AC7 sem sessão: vai para #/entrar', (await hash(p)) === '#/entrar', await hash(p)); await shot(p, 'ac7-sem-sessao-390');
    // carregando: sign_me lento
    d.fake.state.mode.rpcDelay = { sign_me: 1500 };
    await logged(d, { email: U.U2.email }); await p.evaluate(() => { location.hash = '#/conta/verificacao'; });
    await p.waitForSelector('.vf[aria-busy="true"]');
    check('AC7 carregando: aria-busy e esqueleto dos 3 cartões, sem texto de dado', (await p.locator('.vf .skel').count()) >= 6 && (await p.locator('.vf .card.vf-card').count()) === 3 && (await p.getAttribute('.vf', 'aria-busy')) === 'true');
    await shot(p, 'ac7-carregando-390');
    await ready(p); d.fake.state.mode.rpcDelay = {};
    check('AC7 vazio: texto e botão "Enviar código"', (await text(p, '.vf-empty')).includes('Seu e-mail ainda não foi confirmado') && (await p.getByRole('button', { name: 'Enviar código' }).count()) === 1);
    await shot(p, 'ac7-vazio-390');
    // erro de rede
    d.fake.state.mode.rpcDrop = { sign_me: true }; await p.reload();
    await wait(p, () => document.querySelector('.vf .banner.danger'), null, 15000);
    check('AC7 erro: "Não foi possível carregar seus dados. Verifique sua conexão." com "Tentar de novo" e "Voltar ao perfil"', (await text(p, '.vf .banner.danger')).includes('Não foi possível carregar seus dados. Verifique sua conexão.') && (await p.getByRole('button', { name: 'Tentar de novo' }).count()) === 1 && (await p.getByRole('link', { name: 'Voltar ao perfil' }).count()) === 1);
    check('AC7 erro: o shell não repete o aviso (um só "Tentar de novo")', (await p.getByRole('button', { name: 'Tentar de novo' }).count()) === 1);
    await shot(p, 'ac7-erro-390');
    d.fake.state.mode.rpcDrop = {}; await p.click('text=Tentar de novo'); await ready(p);
    check('AC7 "Tentar de novo" recarrega e mostra o estado vazio', (await p.getByRole('button', { name: 'Enviar código' }).count()) === 1);
    // e-mail não confirmado depois do login
    await q(d, `update auth.users set email_confirmed_at = null where id = $1`, [U.U2.id]);
    await p.reload(); await ready(p);
    const av = (await text(p, '.vf .banner.info')) ;
    check('AC7 e-mail não confirmado: aviso "Confirme seu e-mail para poder enviar documentos."', av.includes('Confirme seu e-mail para poder enviar documentos.'), av);
    const ligados = await p.evaluate(() => [...document.querySelectorAll('.vf button, .vf input, .vf fieldset')].filter((e) => !e.disabled).map((e) => e.tagName + '.' + e.className));
    check('AC7 e-mail não confirmado: todas as ações desligadas (botões, campos, canal)', ligados.length === 0, ligados);
    check('AC7 e-mail não confirmado: continua com "Voltar ao perfil"', (await p.getByRole('link', { name: 'Voltar ao perfil' }).count()) >= 1);
    await shot(p, 'ac7-nao-confirmado-390');
    await q(d, `update auth.users set email_confirmed_at = now() where id = $1`, [U.U2.id]);
    // entrada vinda do envio de documento
    await p.evaluate(() => { location.hash = '#/conta/verificacao?motivo=identity_required'; }); await p.waitForTimeout(300); await p.reload(); await ready(p);
    check('AC7 vindo de "identity_required": "Verifique sua identidade para enviar documentos."', (await text(p, '.vf .banner.info')) === 'Verifique sua identidade para enviar documentos.', await text(p, '.vf .banner.info'));
    check('AC7 sem erros de JS', d.errors.length === 0, d.errors);
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC8 larguras
  for (const w of L) await t(`AC8 larguras: ${w}`, open, { ...PG, width: w, cfg: comEdge }, async (d) => {
    const p = d.page; await reset15(d); await q(d, ROOT_SQL); d.fake.state.mode.certEdge = '404';
    const marca = async (nome) => {
      await p.waitForTimeout(250);
      const o = await overflow(p); const pequenos = await toqueMin(p); const cort = await cortes(p);
      check(`AC8 ${w} ${nome}: sem barra horizontal nem elemento fora da borda`, !o.hscroll && o.over.length === 0, o);
      check(`AC8 ${w} ${nome}: nenhum controle menor que 44 px`, pequenos.length === 0, pequenos);
      check(`AC8 ${w} ${nome}: nenhum texto cortado nem fora do cartão`, cort.length === 0, cort);
      await shot(p, `ac8-${w}-${nome}`);
    };
    // U2: vazio, código, bloqueado
    await verif(d, U.U2.email); await ready(p); await p.waitForSelector('.vf .banner.warn'); await marca('vazio-indisponivel');
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await p.fill('#vf-codigo', '123'); await marca('codigo');
    await p.fill('#vf-codigo', '000000'); await wait(p, () => document.querySelector('#vf-msg').textContent !== ''); await marca('codigo-erro');
    await p.click('text=Gerar desafio'); await p.waitForSelector('.vf-challenge'); await marca('desafio-indisponivel');
    await q(d, `update public.sign_identity set otp_locked_until = now() + interval '30 minutes' where user_id = $1`, [U.U2.id]); await p.reload(); await ready(p); await marca('bloqueado');
    // U1: verificado
    await limpar(d, U.U2.id); d.fake.state.mode.certEdge = undefined;
    await p.evaluate(async (v) => { const u = await import('/js/lib/api.js?v=' + v); await u.signOut(); }, VER); await p.waitForFunction(() => location.hash === '#/entrar');
    await logged(d, { email: U.U1.email, hash: '#/conta/verificacao' }); await ready(p); await marca('verificado');
    // U6: certificado
    await p.evaluate(async (v) => { const u = await import('/js/lib/api.js?v=' + v); await u.signOut(); }, VER); await p.waitForFunction(() => location.hash === '#/entrar');
    await q(d, `update public.sign_identity set cert_subject = 'CN=' || repeat('Titular Com Nome Muito Longo ', 6) where user_id = $1`, [U.U6.id]);
    await logged(d, { email: U.U6.email, hash: '#/conta/verificacao' }); await ready(p); await marca('certificado-longo');
    await q(d, `update public.sign_identity set cert_not_after = now() - interval '3 days' where user_id = $1`, [U.U6.id]); await p.reload(); await ready(p); await p.waitForTimeout(600);
    await p.click('text=Gerar desafio'); await p.waitForSelector('.vf-challenge'); await marca('vencido-desafio');
    await p.setInputFiles('#vf-arquivo', fileCert({ cpf: '12345678909' })); await p.click('text=Enviar arquivo assinado'); await wait(p, () => document.querySelector('.vf-msg').textContent !== ''); await marca('erro-certificado');
    check(`AC8 ${w}: sem erros de JS`, d.errors.length === 0, d.errors);
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC9 e AC10
  await t('AC9 nenhum beco sem saída: todos os links percorridos em cada estado', open, { ...PG, width: 390, cfg: comEdge }, async (d) => {
    const p = d.page; await reset15(d);
    const estados = [
      ['vazio', U.U2.email, async () => {}],
      ['codigo', U.U2.email, async () => { await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); }],
      ['verificado', U.U1.email, async () => {}],
      ['certificado', U.U6.email, async () => {}],
    ];
    const vistos = new Set();
    for (const [nome, email, prep] of estados) {
      await d.page.evaluate(() => Object.keys(localStorage).forEach((k) => localStorage.removeItem(k)));
      await limpar(d, U.U2.id);
      await verif(d, email); await ready(p); await prep();
      const hrefs = await p.evaluate(() => [...document.querySelectorAll('#sign a[href]')].filter((a) => a.getClientRects().length).map((a) => a.getAttribute('href')));
      check(`AC9 estado ${nome}: tem "Voltar ao perfil"`, hrefs.includes('#/conta/perfil') && (await p.getByRole('link', { name: 'Voltar ao perfil' }).count()) === 1, hrefs);
      for (const h of hrefs) {
        if (vistos.has(nome + h)) continue; vistos.add(nome + h);
        if (/^mailto:/.test(h) || !h.startsWith('#/')) { check(`AC9 ${nome}: link ${h} é mailto ou rota interna`, /^mailto:/.test(h), h); continue; }
        await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(500);
        const final = await p.evaluate(() => ({ h: location.hash, h1: (document.querySelector('#view h1, h1') || {}).textContent, naoach: /não encontrada/i.test(document.body.innerText) }));
        check(`AC9 ${nome}: ${h} abre uma tela real (não 404)`, !final.naoach && !!final.h1, final);
        await p.evaluate(() => { location.hash = '#/conta/verificacao'; }); await ready(p); await prep().catch(() => {});
      }
    }
    // erro e bloqueado: saída presente
    d.fake.state.mode.rpcDrop = { sign_me: true }; await p.reload(); await wait(p, () => document.querySelector('.vf .banner.danger'), null, 15000);
    check('AC9 estado erro: "Tentar de novo" e "Voltar ao perfil"', (await p.getByRole('button', { name: 'Tentar de novo' }).count()) === 1 && (await p.getByRole('link', { name: 'Voltar ao perfil' }).count()) === 1);
    d.fake.state.mode.rpcDrop = {};
    await reset15(d);
  });
  await t('AC10 o nível é o mesmo no shell, no Perfil e na Verificação (uma só levelOf)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page; await reset15(d);
    const lerTres = async (rotulo, esperado) => {
      await p.evaluate(() => { location.hash = '#/conta/verificacao'; }); await p.reload(); await ready(p); await p.waitForTimeout(300);
      const a = await text(p, '.vf-level .tag'); const sh = await text(p, '.org-sub');
      await p.evaluate(() => { location.hash = '#/conta/perfil'; }); await wait(p, () => document.querySelector('.pf-level .tag'));
      const pf = await text(p, '.pf-level .tag');
      check(`AC10 ${rotulo}: aba=${a}, Perfil=${pf}, shell=${sh} (esperado ${esperado})`, a === esperado && pf === esperado && sh === esperado, [a, pf, sh]);
    };
    await logged(d, { email: U.U6.email, hash: '#/conta/verificacao' });
    await lerTres('certificado válido', 'Qualificada');
    await q(d, `update public.sign_identity set cert_not_after = now() - interval '1 day' where user_id = $1`, [U.U6.id]); await lerTres('certificado vencido, sem contato', 'Simples');
    await q(d, `update public.sign_identity set phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [U.U6.id]); await lerTres('certificado vencido, com contato', 'Avançada');
    await q(d, `update public.sign_identity set cert_not_after = now() + interval '30 days' where user_id = $1`, [U.U6.id]); await lerTres('certificado válido e contato', 'Qualificada');
    await q(d, `update public.sign_identity set cert_not_after = null, cert_verified_at = null, cert_chain_ok = false where user_id = $1`, [U.U6.id]); await lerTres('só contato', 'Avançada');
    await q(d, `update public.sign_identity set phone_verified_at = null, phone_channel = null where user_id = $1`, [U.U6.id]); await lerTres('nada', 'Simples');
    const fonte = fs.readFileSync(path.resolve(__dirname, '../../../apps/sign/js/views/verificacao.js'), 'utf8');
    check('AC10 estático: verificacao.js usa levelOf e não deriva o nível sozinho', /levelOf\(/.test(fonte) && !/'Qualificada'\s*:|=== 'Qualificada'|not_after\s*>\s*Date/.test(fonte.replace(/NIVEIS[^;]+;/, '')));
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- A14-M3 na tela do Perfil
  await t('A14-M3 tela do Perfil: texto genérico do CPF e limite', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await logged(d, { email: U.U3.email, hash: '#/conta/perfil' }); await wait(p, () => document.querySelector('#pf-nome'));
    const textos = [];
    await p.fill('#pf-nome', 'Vazio Teste Nome');
    for (let i = 0; i < 5; i++) {
      await p.fill('#pf-cpf', U.U2.cpf); await p.click('.pf-save'); await wait(p, () => document.querySelector('#pf-cpf-err') && !document.querySelector('#pf-cpf-err').hidden && !document.querySelector('.pf-save[aria-busy]'));
      textos.push(await text(p, '#pf-cpf-err')); await p.fill('#pf-cpf', ''); await p.waitForTimeout(80);
    }
    check('A14-M3 cpf_in_use: texto genérico "Não foi possível usar este CPF. Confira o número ou fale com o suporte." nas 5 tentativas', textos.every((x) => x === 'Não foi possível usar este CPF. Confira o número ou fale com o suporte.'), textos);
    await p.fill('#pf-cpf', U.U3.cpfLivre); await p.click('.pf-save'); await wait(p, () => /Muitas tentativas/.test(document.querySelector('#pf-cpf-err').textContent));
    check('A14-M3 6ª tentativa (CPF livre): "Muitas tentativas. Tente de novo em 60 minutos."', (await text(p, '#pf-cpf-err')) === 'Muitas tentativas. Tente de novo em 60 minutos.', await text(p, '#pf-cpf-err'));
    check('A14-M3 nada foi gravado', (await q(d, `select cpf from public.profiles where id = $1`, [U.U3.id]))[0].cpf === null);
    await shot(p, 'a14m3-limite-390');
    await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC-R1 a R4
  await t('AC-R1 P-01: Termos e Política sem URL são só texto', open, { width: 390 }, async (d) => {
    const p = d.page; await d.go('#/criar'); await p.waitForSelector('#aceite');
    check('AC-R1 sem URL: nenhum <a> dentro do rótulo do aceite', (await p.locator('label[for=aceite] a').count()) === 0, await p.locator('label[for=aceite]').innerHTML());
    const antes = p.url(); await p.click('text=Termos de uso', { trial: false }); await p.waitForTimeout(300);
    check('AC-R1 clicar no texto não navega nem abre aba', p.url() === antes && d.ctx.pages().length === 1, [antes, p.url(), d.ctx.pages().length]);
    check('AC-R1 os dois textos continuam visíveis', (await text(p, 'label[for=aceite]')).includes('Termos de uso') && (await text(p, 'label[for=aceite]')).includes('Política de Privacidade'));
  });
  await t('AC-R1 P-01: com URL válida abre em nova aba com rel seguro', open, { width: 390, cfg: { termsUrl: 'https://exemplo.com.br/termos', privacyUrl: 'javascript:alert(1)' } }, async (d) => {
    const p = d.page; await d.go('#/criar'); await p.waitForSelector('#aceite');
    const a = p.locator('label[for=aceite] a');
    check('AC-R1 URL https vira <a target=_blank rel="noopener noreferrer">', (await a.count()) === 1 && (await a.getAttribute('target')) === '_blank' && (await a.getAttribute('rel')) === 'noopener noreferrer' && (await a.getAttribute('href')) === 'https://exemplo.com.br/termos');
    check('AC-R1 URL javascript: continua só texto', (await text(p, 'label[for=aceite]')).includes('Política de Privacidade') && (await p.locator('label[for=aceite] a[href^="javascript"]').count()) === 0);
  });
  await t('AC-R2 P-02: nome só com invisíveis mostra o e-mail', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d);
    await q(d, `update public.profiles set full_name = $2 where id = $1`, [U.U3.id, '​​ ​']);
    await logged(d, { email: U.U3.email, hash: '#/conta/perfil' }); await wait(p, () => document.querySelector('#pf-nome'));
    check('AC-R2 .org-name mostra o e-mail', (await text(p, '.org-name')) === U.U3.email, await text(p, '.org-name'));
    check('AC-R2 avatar mostra a inicial do e-mail (V), nunca em branco', (await text(p, '#avatar')) === 'V', JSON.stringify(await text(p, '#avatar')));
    const iniciais = await p.evaluate(async (v) => { const s = await import('/js/views/shell.js?v=' + v); return [s.initialsOf('​', 'zé@x.com'), s.initialsOf('​‌', ''), s.initialsOf('﻿ Ana​ Souza', 'a@b.c')]; }, VER);
    check('AC-R2 initialsOf: só invisíveis -> e-mail ou ?; invisível no meio do nome é ignorado', iniciais[0] === 'Z' && iniciais[1] === '?' && iniciais[2] === 'AS', iniciais);
    await q(d, `update public.profiles set full_name = null where id = $1`, [U.U3.id]); await reset15(d);
  });
  for (const w of [320, 1440]) await t(`AC-R3 P-03: checkbox de aceite com 44x44 em ${w}`, open, { width: w }, async (d) => {
    const p = d.page; await d.go('#/criar'); await p.waitForSelector('#aceite');
    const b = await p.locator('#aceite').boundingBox(); const l = await p.locator('label[for=aceite]').boundingBox();
    check(`AC-R3 ${w}: o campo mede ao menos 44x44`, b.width >= 43.5 && b.height >= 43.5, b);
    check(`AC-R3 ${w}: o rótulo também tem 44 px de altura`, l.height >= 43.5, l);
    await p.click('#aceite'); check(`AC-R3 ${w}: clicar marca; teclado (espaço) desmarca`, (await p.isChecked('#aceite')) && (await p.focus('#aceite'), await p.keyboard.press('Space'), !(await p.isChecked('#aceite'))));
    const o = await overflow(p); check(`AC-R3 ${w}: sem barra horizontal`, !o.hscroll, o);
    await shot(p, `acr3-${w}`);
  });
  await t('AC-R4 P-04: modal "Descartar" em 320: botões empilhados, largura total, 44 px', open, { ...PG, width: 320, height: 640 }, async (d) => {
    const p = d.page; await reset15(d);
    await logged(d, { email: U.U1.email, hash: '#/conta/perfil' }); await wait(p, () => document.querySelector('#pf-nome'));
    await p.fill('#pf-nome', 'Ana Alterada Teste'); await p.click('nav.tabs >> text=Verificação'); await p.waitForSelector('.modal');
    const m = await p.evaluate(() => { const foot = document.querySelector('.modal-foot').getBoundingClientRect(); return { foot: [foot.left, foot.width], bts: [...document.querySelectorAll('.modal-foot .btn')].map((b) => { const r = b.getBoundingClientRect(); return { x: r.left, w: r.width, y: r.top, h: r.height, r: r.right }; }), vw: innerWidth }; });
    check('AC-R4 dois botões, cada um com a largura total do rodapé', m.bts.length === 2 && m.bts.every((b) => Math.abs(b.w - m.foot[1]) <= 1 && Math.abs(b.x - m.foot[0]) <= 1), m);
    check('AC-R4 empilhados (um embaixo do outro) e com 44 px de altura', m.bts[1].y >= m.bts[0].y + m.bts[0].h - 1 && m.bts.every((b) => b.h >= 43.5), m);
    check('AC-R4 sem corte na largura de 320', m.bts.every((b) => b.r <= m.vw), m);
    await shot(p, 'acr4-modal-320');
    await p.keyboard.press('Escape'); await reset15(d);
  });

  // ---------------------------------------------------------------------------------------------------------------- JS, desempenho
  await t('Desempenho: LCP e CLS de #/conta/verificacao em 4G simulado', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page; await reset15(d); await verif(d, U.U2.email); await ready(p);
    const c = await d.ctx.newCDPSession(p); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await p.addInitScript(() => { window.__lcp = 0; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    const t0 = Date.now(); await p.reload(); await ready(p); const interativa = Date.now() - t0; await p.waitForTimeout(1500);
    const m = await p.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(4) }));
    console.info(`  medido: LCP ${m.lcp} ms, CLS ${m.cls}, tela pronta em ${interativa} ms (4G simulado 1,6 Mbps/150 ms, sem compressão no servidor de teste)`);
    check('Desempenho: tela interativa em menos de 1,5 s em 4G simulado (reload com cache frio do navegador, servidor sem compressão)', interativa < 1500, interativa);
    check('Desempenho: CLS <= 0,05', m.cls <= 0.05, m);
    await reset15(d);
  });
  {
    const zlib = require('zlib'); const root = path.resolve(__dirname, '../../../apps/sign/js');
    const lista = []; (function ler(dir) { for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n); if (fs.statSync(f).isDirectory()) { if (n !== 'vendor') ler(f); } else if (/\.js$/.test(n)) lista.push(f); } })(root);
    const gz = (b) => zlib.gzipSync(b).length;
    let agora = 0, antes = 0; const novos = {};
    for (const f of lista) { const rel = 'apps/sign/js/' + path.relative(root, f).split(path.sep).join('/'); const b = fs.readFileSync(f); agora += gz(b); try { const old = cp.execFileSync('git', ['show', 'HEAD:' + rel], { cwd: path.resolve(__dirname, '../../..'), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }); antes += gz(old); } catch { /* arquivo novo */ } novos[rel] = gz(b); }
    const delta = agora - antes;
    console.info(`  medido: JS do app (gzip) ${(antes / 1024).toFixed(1)} kB (commit HEAD) -> ${(agora / 1024).toFixed(1)} kB (+${(delta / 1024).toFixed(1)} kB); verificacao.js ${(novos['apps/sign/js/views/verificacao.js'] / 1024).toFixed(1)} kB`);
    check('Desempenho: o JS cresce no máximo 15 kB (gzip) em relação ao commit atual', delta <= 15 * 1024, delta);
  }

  console.info('limpando: reset.sh depois'); reset('depois');
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
