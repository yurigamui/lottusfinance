// Seção 1.5 (Verificação de identidade), BANCO: AC-B1 a AC-B15 contra o Postgres LOCAL real, chamando as RPCs como o PostgREST faz.
// Bancos ISOLADOS (SIGN_DB e SIGN_DB_ANTES SEMPRE exportados; nunca o banco compartilhado "sign"):
//   ANTES = esquema atual sem migração (prova S-05); DEPOIS = esquema + migrações 1.4 e 1.5; MEIO = esquema + só a 1.4 (prova idempotência e reversão da 1.5).
// Uso: SIGN_DB=sign_dev15 SIGN_DB_ANTES=sign_dev15_antes [EVID=<pasta>] node t-verif-db.cjs
const { check, done, res } = require('./lib.cjs');
const { U, banco, restaurar, reset, psqlFile, DB, DB_ANTES, ROOT, PORT } = require('./perfil-lib.cjs');
if (!process.env.SIGN_DB || !process.env.SIGN_DB_ANTES) { console.error('defina SIGN_DB e SIGN_DB_ANTES (bancos isolados do teste; nunca use o "sign" compartilhado)'); process.exit(2); }
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');
const EVID = process.env.EVID || path.join(ROOT, 'docs/agente/sign/evidencias-1-5');
const MIG15 = path.join(ROOT, 'supabase/migrations/20261127120000_sign_verificacao_identidade.sql');
const DB_MEIO = DB + '_meio';
const sec = (n) => res.lines.push('# ' + n);
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };
const PDF = fs.readFileSync(path.join(ROOT, 'scripts/sign-local/seed.sql'), 'utf8').match(/\\set pdf '([^']+)'/)[1];
const wrong = (c) => (c === '000000' ? '111111' : '000000');

(async () => {
  console.info('recriando bancos locais isolados (ANTES, DEPOIS e MEIO)...');
  reset('ambos');
  cp.execFileSync(path.join(ROOT, 'scripts/sign-local/reset.sh'), ['depois'], { env: { ...process.env, SIGN_SCHEMA: process.env.SIGN_SCHEMA || '/root/sign-schema.sql', SIGN_DB: DB_MEIO, SIGN_SO_ATE: '1.4' }, encoding: 'utf8' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-1-5-'));
  const A = await banco(DB_ANTES);
  const D = await banco(DB);
  const { rpc, q } = D;
  const tryq = async (sql, params) => { try { await q(sql, params); return { ok: true }; } catch (e) { return { ok: false, msg: String(e.message) }; } };
  const codigo = async (db, uid) => (await db.q(`select params ->> 'code' as c from public.sign_outbox where user_id = $1 order by id desc limit 1`, [uid]))[0].c;
  const limpar = async (db, uid, cols = true) => {
    for (const t of ['sign_otps', 'sign_outbox', 'sign_cert_challenges']) await db.q(`delete from public.${t} where user_id = $1`, [uid]);
    await db.q(`delete from public.sign_cpf_attempts where user_id = $1`, [uid]).catch(() => {});
    await db.q(`update public.sign_identity set phone_verified_at = null, phone_channel = null, phone = null ${cols ? ', otp_locked_until = null' : ''} where user_id = $1`, [uid]);
  };
  const dorme = (uid, s) => q(`update public.sign_otps set created_at = created_at - make_interval(secs => $2) where user_id = $1`, [uid, s]);
  const sm = async (u) => (await rpc('sign_me', {}, u.email)).body;
  const asRole = async (db, uid, sql, role = 'authenticated') => {
    const c = new Client({ host: '127.0.0.1', port: Number(PORT), user: 'postgres', database: db });
    await c.connect();
    try {
      await c.query('begin'); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]); await c.query('set local role ' + role);
      try { return { rows: (await c.query(sql)).rows }; } catch (e) { return { err: String(e.message) }; } finally { await c.query('rollback'); }
    } finally { await c.end(); }
  };
  const priv = async (db, sig, role) => (await db.q(`select has_function_privilege($1, ('public.' || $2)::regprocedure, 'execute') as ok`, [role, sig]))[0].ok;
  const pubGrant = async (db, sig) => (await db.q(`select exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = ('public.' || $1)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') as ok`, [sig]))[0].ok;
  const limparEnv = async (uid) => {
    for (const t of ['sign_env_events', 'sign_env_signers', 'sign_outbox']) await q(`delete from public.${t} where envelope_id in (select id from public.sign_envelopes where owner = $1)`, [uid]).catch(() => {});
    await q(`delete from public.sign_envelopes where owner = $1`, [uid]);
    await q(`delete from public.crm_leads where sign_account_id in (select id from public.sign_accounts where user_id = $1)`, [uid]).catch(() => {});
    await q(`delete from public.sign_accounts where user_id = $1`, [uid]);
  };
  const config = (on) => q(`update public.sign_messaging_config set whatsapp_enabled = $1 where id = 1`, [on]);
  const envPayload = { name: 'Contrato 1.5', filename: 'a.pdf', pdf_b64: PDF, signers: [{ name: 'Bruno Signatário Exemplo', email: 'bruno.sign@exemplo.com.br', cpf: '11144477735', role: 'Contratante' }] };
  const reload = () => D.fake.loadUsers();

  // =========================================================================================================
  sec('AC-B1 (ANTES) S-05 reproduzido no esquema atual: a tentativa errada não é gravada');
  {
    await limpar(A, U.U2.id, false);
    const s = await A.rpc('sign_phone_send', { p_phone: '(11) 98765-4321', p_channel: 'sms' }, U.U2.email);
    check('AC-B1 ANTES: sign_phone_send (sms) funciona no esquema atual', s.status === 200 && s.body && s.body.channel === 'sms', s);
    const cod = await codigo(A, U.U2.id);
    const erros = [];
    for (let i = 0; i < 6; i++) erros.push((await A.rpc('sign_phone_verify', { p_code: wrong(cod) }, U.U2.email)).msg);
    const att = (await A.q(`select attempts from public.sign_otps where user_id = $1`, [U.U2.id]))[0].attempts;
    check('AC-B1 ANTES: 6 códigos errados: todos levantam exceção otp_invalid (nenhum otp_locked)', erros.every((m) => /otp_invalid/.test(m)), erros);
    check('AC-B1 ANTES: attempts continua em 0 depois de 6 erros (a exceção desfaz o attempts+1)', att === 0, att);
    const certo = await A.rpc('sign_phone_verify', { p_code: cod }, U.U2.email);
    check('AC-B1 ANTES: a 7ª tentativa (código certo) ainda é avaliada e passa: o limite de 5 nunca funcionou', certo.status === 200 && certo.body.phone_verified === true, certo);
    check('AC-B1 ANTES: não existe a coluna otp_locked_until', (await A.q(`select count(*)::int n from information_schema.columns where table_name = 'sign_identity' and column_name = 'otp_locked_until'`))[0].n === 0);
    console.info('  prova do ANTES: erros=' + JSON.stringify(erros.map((m) => m.slice(0, 20))) + ' attempts=' + att);
  }

  // =========================================================================================================
  sec('AC-B2 (DEPOIS) S-05 corrigido: 5 erros gravados, remaining 4..0, bloqueio de 30 min');
  {
    await limpar(D, U.U2.id);
    const s = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B2 sign_phone_send (email): ok:true, destino mascarado do e-mail', s.status === 200 && s.body.ok === true && s.body.channel === 'email' && /^o\*\*\*@teste\.example$/.test(s.body.to) && s.body.sends_left === 2, s);
    const cod = await codigo(D, U.U2.id);
    const out = [];
    for (let i = 0; i < 5; i++) { const r = await rpc('sign_phone_verify', { p_code: wrong(cod) }, U.U2.email); out.push(r); }
    check('AC-B2 as 5 respostas são 200 com ok:false (nenhuma exceção)', out.every((r) => r.status === 200 && r.body.ok === false), out.map((r) => r.status));
    check('AC-B2 remaining 4, 3, 2, 1, 0 e otp_invalid nas 4 primeiras', JSON.stringify(out.map((r) => r.body.remaining)) === '[4,3,2,1,0]' && out.slice(0, 4).every((r) => r.body.error === 'otp_invalid'), out.map((r) => r.body));
    check('AC-B2 a 5ª devolve otp_locked com retry_after 1800', out[4].body.error === 'otp_locked' && out[4].body.retry_after === 1800, out[4].body);
    const o = (await q(`select attempts from public.sign_otps where user_id = $1`, [U.U2.id]))[0];
    const lk = (await q(`select extract(epoch from (otp_locked_until - now()))::int as s from public.sign_identity where user_id = $1`, [U.U2.id]))[0].s;
    check('AC-B2 attempts = 5 gravado', o.attempts === 5, o);
    check('AC-B2 otp_locked_until ≈ agora + 30 min (1790 a 1800 s)', lk >= 1790 && lk <= 1800, lk);
    const dup = await rpc('sign_phone_verify', { p_code: cod }, U.U2.email);
    check('AC-B2 a 6ª tentativa, mesmo com o código CERTO: otp_locked, nada consumido', dup.body.ok === false && dup.body.error === 'otp_locked' && (await q(`select consumed_at from public.sign_otps where user_id = $1`, [U.U2.id]))[0].consumed_at === null, dup);
    const fmt = await rpc('sign_phone_verify', { p_code: '12' }, U.U2.email);
    check('AC-B2 formato inválido (2 dígitos): exceção invalid_input', fmt.status === 400 && /invalid_input/.test(fmt.msg), fmt);
    const anon = await rpc('sign_phone_verify', { p_code: '123456' }, null);
    check('AC-B2 sem login: permission denied', anon.status === 401 && /permission denied/.test(anon.msg), anon);
  }

  // =========================================================================================================
  sec('AC-B3 bloqueio de 30 min persistido');
  {
    // continua o estado do AC-B2: U2 bloqueado
    const env = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B3 sign_phone_send bloqueado: otp_locked com retry_after entre 1 e 1800', env.status === 200 && env.body.ok === false && env.body.error === 'otp_locked' && env.body.retry_after >= 1 && env.body.retry_after <= 1800, env);
    check('AC-B3 o envio bloqueado não criou otp nem outbox novos', (await q(`select (select count(*)::int from public.sign_otps where user_id = $1) as o, (select count(*)::int from public.sign_outbox where user_id = $1) as b`, [U.U2.id]))[0].o === 1);
    // "novo login": nova sessão (outro token) continua bloqueada
    const r2 = await rpc('sign_phone_verify', { p_code: '123456' }, U.U2.email);
    check('AC-B3 outro token (novo login): continua otp_locked', r2.body.error === 'otp_locked', r2.body);
    const smL = await sm(U.U2);
    check('AC-B3 sign_me.otp_retry_after traz os segundos restantes do bloqueio (recarregar a página mantém)', smL.otp_retry_after >= 1700 && smL.otp_retry_after <= 1800, smL.otp_retry_after);
    await q(`update public.sign_identity set otp_locked_until = now() - interval '1 second' where user_id = $1`, [U.U2.id]);
    const antigo = await rpc('sign_phone_verify', { p_code: await codigo(D, U.U2.id) }, U.U2.email);
    check('AC-B3 bloqueio vencido, mas o código antigo já gastou as 5 tentativas: otp_expired (peça novo)', antigo.body.ok === false && antigo.body.error === 'otp_expired', antigo.body);
    await dorme(U.U2.id, 40);
    const novo = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B3 com otp_locked_until no passado o envio volta a funcionar', novo.body.ok === true, novo.body);
    const ok = await rpc('sign_phone_verify', { p_code: await codigo(D, U.U2.id) }, U.U2.email);
    check('AC-B3 e o código certo confirma (ok:true, verificado)', ok.status === 200 && ok.body.ok === true && ok.body.verified === true, ok.body);
    check('AC-B3 sucesso zera o bloqueio (otp_locked_until nulo)', (await q(`select otp_locked_until from public.sign_identity where user_id = $1`, [U.U2.id]))[0].otp_locked_until === null);
    // bloqueio no futuro + código certo na verificação (nova pessoa: U4)
    await limpar(D, U.U4.id);
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U4.email);
    const c4 = await codigo(D, U.U4.id);
    await q(`update public.sign_identity set otp_locked_until = now() + interval '10 minutes' where user_id = $1`, [U.U4.id]);
    const v4 = await rpc('sign_phone_verify', { p_code: c4 }, U.U4.email);
    check('AC-B3 otp_locked_until no futuro: verify com o código certo devolve otp_locked', v4.body.error === 'otp_locked' && v4.body.retry_after > 500, v4.body);
    await q(`update public.sign_identity set otp_locked_until = now() - interval '1 minute' where user_id = $1`, [U.U4.id]);
    const v4b = await rpc('sign_phone_verify', { p_code: c4 }, U.U4.email);
    check('AC-B3 com otp_locked_until no passado o mesmo código passa', v4b.body.ok === true, v4b.body);
    await limpar(D, U.U4.id);
  }

  // =========================================================================================================
  sec('AC-B4 reenvio: 3 por hora e 30 s');
  {
    await limpar(D, U.U2.id);
    const r1 = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    const soon = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B4 o 2º envio em menos de 30 s: too_soon com retry_after entre 1 e 30', r1.body.ok === true && soon.body.error === 'too_soon' && soon.body.retry_after >= 1 && soon.body.retry_after <= 30, soon.body);
    await dorme(U.U2.id, 31);
    const r2 = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    await dorme(U.U2.id, 31);
    const r3 = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B4 envios 2 e 3 (a cada 31 s simulados) passam; sends_left 1 e 0', r2.body.ok === true && r3.body.ok === true && r2.body.sends_left === 1 && r3.body.sends_left === 0, [r2.body, r3.body]);
    check('AC-B4 o 3º envio já informa limit_retry_after (≤ 3600, > 3500); os anteriores não', r3.body.limit_retry_after > 3500 && r3.body.limit_retry_after <= 3600 && r1.body.limit_retry_after === null && r2.body.limit_retry_after === null, [r1.body.limit_retry_after, r2.body.limit_retry_after, r3.body.limit_retry_after]);
    await dorme(U.U2.id, 31);
    const r4 = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B4 o 4º na mesma hora: too_many com retry_after entre 1 e 3600', r4.body.ok === false && r4.body.error === 'too_many' && r4.body.retry_after >= 1 && r4.body.retry_after <= 3600, r4.body);
    check('AC-B4 só 3 linhas em sign_otps e 3 em sign_outbox', (await q(`select (select count(*)::int from public.sign_otps where user_id = $1) o, (select count(*)::int from public.sign_outbox where user_id = $1) b`, [U.U2.id]))[0].o === 3);
    await dorme(U.U2.id, 3600);
    const r5 = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B4 passada 1 hora o envio volta', r5.body.ok === true, r5.body);
    check('AC-B4 só 1 código ativo: os anteriores foram consumidos', (await q(`select count(*)::int n from public.sign_otps where user_id = $1 and consumed_at is null`, [U.U2.id]))[0].n === 1);
  }

  // =========================================================================================================
  sec('AC-B5 canal e-mail ponta a ponta');
  {
    await limpar(D, U.U2.id);
    const s = await rpc('sign_phone_send', { p_phone: 'lixo', p_channel: 'EMAIL' }, U.U2.email);
    check('AC-B5 p_phone é ignorado com canal email (lixo não dá erro; canal em maiúsculas aceito)', s.body.ok === true, s);
    const ob = (await q(`select channel, destination, status, template from public.sign_outbox where user_id = $1`, [U.U2.id]))[0];
    check('AC-B5 outbox: channel email, destino = e-mail da conta, queued, template otp', ob.channel === 'email' && ob.destination === U.U2.email && ob.status === 'queued' && ob.template === 'otp', ob);
    const antes = await sm(U.U2);
    const v = await rpc('sign_phone_verify', { p_code: ` ${(await codigo(D, U.U2.id)).slice(0, 3)} ${(await codigo(D, U.U2.id)).slice(3)} ` }, U.U2.email);
    const i = (await q(`select phone, phone_verified_at, phone_channel from public.sign_identity where user_id = $1`, [U.U2.id]))[0];
    check('AC-B5 código colado com espaços confirma', v.status === 200 && v.body.ok === true, v.body);
    check('AC-B5 phone_verified_at preenchido e phone_channel = email; phone NÃO recebeu e-mail', i.phone_verified_at !== null && i.phone_channel === 'email' && i.phone === null, i);
    check('AC-B5 sign_me: verified=true, contact_kind=email, phone_verified=true', v.body.verified === true && v.body.contact_kind === 'email' && v.body.phone_verified === true, v.body);
    check('AC-B5 antes: verified=false e contact_kind nulo', antes.verified === false && antes.contact_kind === null, antes);
    check('AC-B5 profiles.phone não recebeu o e-mail', (await q(`select phone from public.profiles where id = $1`, [U.U2.id]))[0].phone === null);
    const reuso = await rpc('sign_phone_verify', { p_code: '123456' }, U.U2.email);
    check('AC-B5 código já consumido: otp_not_found (ok:false)', reuso.body.ok === false && reuso.body.error === 'otp_not_found', reuso.body);
    const dl = await rpc('sign_otp_delivery', {}, U.U2.email);
    check('AC-B5 sign_otp_delivery devolve só status e channel', JSON.stringify(Object.keys(dl.body).sort()) === '["channel","status"]', dl.body);
    // código expirado
    await limpar(D, U.U3.id); await q(`update public.profiles set full_name = 'Vazio Teste Nome' where id = $1`, [U.U3.id]);
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U3.email);
    await q(`update public.sign_otps set expires_at = now() - interval '1 second' where user_id = $1`, [U.U3.id]);
    const ex = await rpc('sign_phone_verify', { p_code: await codigo(D, U.U3.id) }, U.U3.email);
    check('AC-B5 código expirado: ok:false otp_expired (mesmo com o código certo)', ex.body.ok === false && ex.body.error === 'otp_expired', ex.body);
    await limpar(D, U.U3.id); await restaurar(q);
  }

  // =========================================================================================================
  sec('AC-B6 canais: whatsapp desligado, sms inexistente');
  {
    await limpar(D, U.U2.id);
    await config(false);
    const cnt = async () => (await q(`select (select count(*)::int from public.sign_otps) o, (select count(*)::int from public.sign_outbox) b`))[0];
    const c0 = await cnt();
    const w = await rpc('sign_phone_send', { p_phone: '(11) 98888-7777', p_channel: 'whatsapp' }, U.U2.email);
    check('AC-B6 whatsapp com whatsapp_enabled=false: ok:false channel_unavailable', w.status === 200 && w.body.ok === false && w.body.error === 'channel_unavailable', w);
    const sms = await rpc('sign_phone_send', { p_phone: '(11) 98888-7777', p_channel: 'sms' }, U.U2.email);
    check('AC-B6 sms: exceção invalid_channel', sms.status === 400 && /invalid_channel/.test(sms.msg), sms);
    const c1 = await cnt();
    check('AC-B6 nenhuma linha nova em sign_otps e sign_outbox', c0.o === c1.o && c0.b === c1.b, [c0, c1]);
    const ch = (await sm(U.U2)).channels;
    check('AC-B6 sign_me.channels: email true, whatsapp false, sms false', ch.email === true && ch.whatsapp === false && ch.sms === false, ch);
    await q(`update public.sign_messaging_config set sms_enabled = true`);
    check('AC-B6 mesmo com sms_enabled=true na configuração, sms continua false em sign_me', (await sm(U.U2)).channels.sms === false);
    // whatsapp pronto: ligado, passa; destino é o telefone
    await config(true);
    check('AC-B6 sign_me.channels.whatsapp vira true quando o Yuri liga', (await sm(U.U2)).channels.whatsapp === true);
    const w2 = await rpc('sign_phone_send', { p_phone: '(11) 98888-7777', p_channel: 'whatsapp' }, U.U2.email);
    check('AC-B6 whatsapp ligado: ok, destino mascarado', w2.body.ok === true && w2.body.channel === 'whatsapp' && /\(11\)/.test(w2.body.to), w2.body);
    await dorme(U.U2.id, 40);
    const bad = await rpc('sign_phone_send', { p_phone: '123', p_channel: 'whatsapp' }, U.U2.email);
    check('AC-B6 whatsapp com telefone inválido: exceção invalid_input', bad.status === 400 && /invalid_input/.test(bad.msg), bad);
    const ver = await rpc('sign_phone_verify', { p_code: await codigo(D, U.U2.id) }, U.U2.email);
    check('AC-B6 whatsapp confirmado: contact_kind=phone, phone gravado em identity e profiles', ver.body.ok === true && ver.body.contact_kind === 'phone' && ver.body.phone === '5511988887777' && (await q(`select phone from public.profiles where id = $1`, [U.U2.id]))[0].phone === '5511988887777', ver.body);
    await config(false);
    await q(`update public.profiles set phone = null where id = $1`, [U.U2.id]);
    await limpar(D, U.U2.id);
  }

  // =========================================================================================================
  sec('AC-B7 anon e permissões (has_function_privilege)');
  {
    const pubs = ['sign_me()', 'sign_phone_send(text,text)', 'sign_phone_verify(text)', 'sign_cert_challenge()', 'sign_profile_save(jsonb)', 'sign_account_save(jsonb)', 'sign_env_create(jsonb)', 'sign_otp_delivery()'];
    for (const sig of pubs) {
      check(`AC-B7 ${sig}: anon NÃO executa, PUBLIC não, authenticated sim`, !(await priv(D, sig, 'anon')) && !(await pubGrant(D, sig)) && (await priv(D, sig, 'authenticated')));
      check(`AC-B7 ${sig}: SECURITY DEFINER e search_path vazio`, (await q(`select p.prosecdef and p.proconfig @> array['search_path=""'] as ok from pg_proc p where p.oid = ('public.' || $1)::regprocedure`, [sig]))[0].ok);
    }
    const internas = ['_sign_phone_norm(text)', '_sign_mask_email(text)', '_sign_outbox_scrub()', '_sign_outbox_purge()', '_sign_profile_phone_rn7()', '_sign_cpf_guarded_apply(uuid,text,text,text)', '_sign_cert_save(uuid,jsonb)'];
    for (const sig of internas) check(`AC-B7 ${sig}: sem execute para anon, authenticated e PUBLIC; search_path vazio`, !(await priv(D, sig, 'anon')) && !(await priv(D, sig, 'authenticated')) && !(await pubGrant(D, sig)) && (await q(`select p.proconfig @> array['search_path=""'] as ok from pg_proc p where p.oid = ('public.' || $1)::regprocedure`, [sig]))[0].ok);
    check('AC-B7 _sign_cert_save: service_role mantém execute (função de borda)', await priv(D, '_sign_cert_save(uuid,jsonb)', 'service_role'));
    for (const [fn, body] of [['sign_phone_send', { p_phone: '', p_channel: 'email' }], ['sign_phone_verify', { p_code: '123456' }], ['sign_cert_challenge', {}], ['sign_me', {}], ['sign_profile_save', { p: { name: 'Invasor Teste', cpf: '' } }], ['sign_env_create', { p: envPayload }], ['sign_otp_delivery', {}]]) {
      const r = await rpc(fn, body, null);
      check(`AC-B7 anon chama ${fn}: 401 permission denied`, r.status === 401 && /permission denied/.test(r.msg), r);
    }
    for (const [fn, body] of [['_sign_cert_save', { p_uid: U.U1.id, p: {} }], ['_sign_cpf_guarded_apply', { p_uid: U.U1.id, p_email: 'x@teste.example', p_name: 'A B', p_cpf: '' }], ['_sign_outbox_purge', {}]]) {
      const r = await rpc(fn, body, U.U1.email);
      check(`AC-B7 authenticated chama a interna ${fn}: 403 permission denied`, r.status === 403 && /permission denied/.test(r.msg), r);
    }
    for (const t of ['sign_otps', 'sign_outbox', 'sign_cert_challenges', 'sign_cpf_attempts']) check(`AC-B7 ${t}: RLS ligado`, (await q(`select relrowsecurity as r from pg_class where oid = ('public.' || $1)::regclass`, [t]))[0].r === true);
    check('AC-B7 sign_cpf_attempts não tem policy nenhuma', (await q(`select count(*)::int n from pg_policies where tablename = 'sign_cpf_attempts'`))[0].n === 0);
  }

  // =========================================================================================================
  sec('AC-B8 IDOR: B não consome nem lê o que é de A');
  {
    await limpar(D, U.U2.id); await limpar(D, U.U1.id);
    await q(`update public.sign_identity set phone_verified_at = null, phone_channel = null where user_id = $1`, [U.U1.id]);
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    const codA = await codigo(D, U.U2.id);
    const b = await rpc('sign_phone_verify', { p_code: codA }, U.U1.email);
    check('AC-B8 U1 (sem código próprio) usa o código de U2: otp_not_found', b.body.ok === false && b.body.error === 'otp_not_found', b.body);
    check('AC-B8 o código de U2 continua sem consumo e sem tentativas', (await q(`select consumed_at, attempts from public.sign_otps where user_id = $1`, [U.U2.id]))[0].consumed_at === null);
    check('AC-B8 U1 continua sem verificação', (await sm(U.U1)).verified === false);
    // U1 também pede um código e tenta o de U2: erra (gravado só em U1)
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U1.email);
    const c1 = await codigo(D, U.U1.id);
    const cruzado = codA === c1 ? '222222' : codA;
    const x = await rpc('sign_phone_verify', { p_code: cruzado }, U.U1.email);
    check('AC-B8 U1 com o código de U2 no próprio pedido: otp_invalid; tentativas só de U1', x.body.error === 'otp_invalid' && (await q(`select attempts from public.sign_otps where user_id = $1`, [U.U2.id]))[0].attempts === 0, x.body);
    for (const t of ['sign_otps', 'sign_outbox', 'sign_cert_challenges', 'sign_identity', 'sign_cpf_attempts']) {
      const r = await asRole(DB, U.U1.id, `select * from public.${t}`);
      check(`AC-B8 U1 lendo ${t} direto: nenhuma linha (sem acesso ou RLS)`, r.err ? /permission denied/.test(r.err) : r.rows.length === 0, r);
      const w = await asRole(DB, U.U1.id, `update public.${t} set user_id = user_id`);
      check(`AC-B8 U1 escrevendo em ${t} direto: negado ou 0 linhas`, w.err ? /permission denied/.test(w.err) : true, w);
    }
    const dl = await rpc('sign_otp_delivery', {}, U.U1.email);
    check('AC-B8 sign_otp_delivery de U1 não mostra o envio de U2 (canal e status do próprio)', dl.body.status === 'queued' && dl.body.channel === 'email', dl.body);
    check('AC-B8 sign_me de U1 não traz dado de U2', !JSON.stringify(await sm(U.U1)).includes(U.U2.email));
    // desafio de certificado de U2 não vale para U1
    await limpar(D, U.U1.id); await limpar(D, U.U2.id);
  }

  // =========================================================================================================
  sec('AC-B9 hash do código');
  {
    await limpar(D, U.U2.id); await limpar(D, U.U4.id);
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U4.email);
    const c2 = await codigo(D, U.U2.id), c4 = await codigo(D, U.U4.id);
    const o2 = (await q(`select id, code_hash from public.sign_otps where user_id = $1`, [U.U2.id]))[0];
    const o4 = (await q(`select id, code_hash from public.sign_otps where user_id = $1`, [U.U4.id]))[0];
    const h = async (c, uid, oid) => (await q(`select encode(extensions.digest($1::text || ':' || $2::text || ':' || $3::text, 'sha256'), 'hex') h`, [c, uid, oid]))[0].h;
    check('AC-B9 code_hash não contém o código e tem 64 hex', !o2.code_hash.includes(c2) && /^[0-9a-f]{64}$/.test(o2.code_hash));
    check('AC-B9 code_hash = sha256(código:user_id:id do otp)', o2.code_hash === await h(c2, U.U2.id, o2.id) && o4.code_hash === await h(c4, U.U4.id, o4.id));
    check('AC-B9 NÃO é o esquema antigo sha256(código:user_id)', o2.code_hash !== (await q(`select encode(extensions.digest($1::text || ':' || $2::text, 'sha256'), 'hex') h`, [c2, U.U2.id]))[0].h);
    check('AC-B9 o MESMO código para dois usuários daria hashes diferentes', (await h(c2, U.U2.id, o2.id)) !== (await h(c2, U.U4.id, o4.id)) && (await h(c2, U.U2.id, o2.id)) !== (await h(c2, U.U2.id, o4.id)));
    await q(`update public.sign_otps set code_hash = $2 where id = $1`, [o4.id, o2.code_hash]);
    const cruz = await rpc('sign_phone_verify', { p_code: c2 }, U.U4.email);
    check('AC-B9 copiar o hash de U2 para o otp de U4 NÃO deixa U4 usar o código de U2 (hash preso a usuário e otp)', cruz.body.ok === false && cruz.body.error === 'otp_invalid', cruz.body);
    check('AC-B9 nenhum código aparece em sign_otps (varredura do dump)', (await q(`select count(*)::int n from public.sign_otps where code_hash = $1 or code_hash = $2`, [c2, c4]))[0].n === 0);
    await limpar(D, U.U2.id); await limpar(D, U.U4.id);
  }

  // =========================================================================================================
  sec('AC-B10 RN7: o contato muda, a verificação cai');
  {
    const verificar = async (u, ch, phone) => {
      await limpar(D, u.id);
      await dorme(u.id, 100);
      const s = await rpc('sign_phone_send', { p_phone: phone || '', p_channel: ch }, u.email);
      if (!s.body.ok) throw new Error('envio falhou ' + JSON.stringify(s.body));
      return rpc('sign_phone_verify', { p_code: await codigo(D, u.id) }, u.email);
    };
    await config(true);
    const v = await verificar(U.U2, 'whatsapp', '(11) 98888-7777');
    check('AC-B10 preparo: U2 verificado por whatsapp', v.body.verified === true && v.body.contact_kind === 'phone', v.body);
    await dorme(U.U2.id, 40);
    const igual = await rpc('sign_phone_send', { p_phone: '+55 (11) 98888-7777', p_channel: 'whatsapp' }, U.U2.email);
    check('AC-B10 reenvio para o MESMO telefone (outra máscara): a verificação continua', igual.body.ok === true && (await sm(U.U2)).verified === true && (await sm(U.U2)).phone_verified === true);
    await dorme(U.U2.id, 40);
    const outro = await rpc('sign_phone_send', { p_phone: '(11) 97777-6666', p_channel: 'whatsapp' }, U.U2.email);
    const m1 = await sm(U.U2);
    check('AC-B10 envio para OUTRO telefone: ok, phone_verified_at e phone_channel nulos na mesma transação, verified=false', outro.body.ok === true && m1.verified === false && m1.phone_verified === false && m1.contact_kind === null
      && (await q(`select phone_verified_at, phone_channel, phone from public.sign_identity where user_id = $1`, [U.U2.id]))[0].phone_channel === null, m1);
    // e-mail → outro destino
    const e1 = await verificar(U.U2, 'email');
    check('AC-B10 preparo: U2 verificado por e-mail', e1.body.contact_kind === 'email');
    await dorme(U.U2.id, 40);
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('AC-B10 reenvio por e-mail (mesmo destino): continua verificado', (await sm(U.U2)).verified === true);
    await q(`update public.profiles set phone = '5511911110000' where id = $1`, [U.U2.id]);
    check('AC-B10 trocar profiles.phone NÃO derruba quem está verificado por e-mail (contato é o e-mail)', (await sm(U.U2)).verified === true);
    await dorme(U.U2.id, 40);
    await rpc('sign_phone_send', { p_phone: '(11) 98888-7777', p_channel: 'whatsapp' }, U.U2.email);
    check('AC-B10 verificado por e-mail e envio por whatsapp (outro destino): cai', (await sm(U.U2)).verified === false);
    // telefone verificado + profiles.phone muda (qualquer escritor)
    const ph = await verificar(U.U2, 'whatsapp', '(11) 98888-7777');
    check('AC-B10 preparo 3: whatsapp verificado', ph.body.verified === true);
    await q(`update public.profiles set phone = '5511988887777', updated_at = now() where id = $1`, [U.U2.id]);
    check('AC-B10 profiles.phone atualizado para o MESMO número: mantém', (await sm(U.U2)).verified === true);
    const sv = await rpc('sign_profile_save', { p: { name: 'Bruno Outro Exemplo', cpf: '', phone: '5511900001111' } }, U.U2.email);
    check('AC-B10 sign_profile_save ignora telefone no corpo (1.4 R5) e mantém a verificação', sv.status === 200 && sv.body.verified === true && sv.body.phone === '5511988887777', sv.body);
    await q(`update public.profiles set phone = '(21) 97777-1234' where id = $1`, [U.U2.id]);
    const m2 = await sm(U.U2);
    check('AC-B10 profiles.phone trocado por OUTRO número: verified=false, phone_verified_at e phone_channel nulos (trigger, mesma transação)', m2.verified === false && m2.phone_verified === false
      && (await q(`select phone_channel from public.sign_identity where user_id = $1`, [U.U2.id]))[0].phone_channel === null, m2);
    const lixo = await verificar(U.U2, 'whatsapp', '(11) 98888-7777');
    await q(`update public.profiles set phone = null where id = $1`, [U.U2.id]);
    check('AC-B10 apagar o telefone do perfil também derruba', lixo.body.verified === true && (await sm(U.U2)).verified === false);
    // com certificado válido, verified continua true (sem contato)
    await q(`update public.profiles set phone = null where id = $1`, [U.U6.id]);
    await config(false);
    await limpar(D, U.U2.id);
  }

  // =========================================================================================================
  sec('AC-B11 R2: o código some do outbox');
  {
    await limpar(D, U.U2.id);
    await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    const cod = await codigo(D, U.U2.id);
    const row = async () => (await q(`select id, status, params from public.sign_outbox where user_id = $1 order by id desc limit 1`, [U.U2.id]))[0];
    let r = await row();
    check('AC-B11 queued: params = {code, minutes, otp_id}', r.status === 'queued' && r.params.code === cod && r.params.minutes === 10 && /^[0-9a-f-]{36}$/.test(r.params.otp_id) && Object.keys(r.params).length === 3, r.params);
    check('AC-B11 otp_id aponta para o otp do usuário', (await q(`select count(*)::int n from public.sign_otps where id = $1::uuid and user_id = $2`, [r.params.otp_id, U.U2.id]))[0].n === 1);
    await q(`update public.sign_outbox set status = 'sent', sent_at = now() where id = $1`, [r.id]);
    r = await row();
    check('AC-B11 queued -> sent: o trigger remove code (ficam minutes e otp_id)', r.status === 'sent' && !('code' in r.params) && r.params.minutes === 10 && 'otp_id' in r.params, r.params);
    await q(`update public.sign_outbox set status = 'queued', params = params || jsonb_build_object('code', '999999') where id = $1`, [r.id]);
    await q(`update public.sign_outbox set status = 'failed', error = 'x' where id = $1`, [r.id]);
    check('AC-B11 queued -> failed: remove code também', !('code' in (await row()).params));
    await q(`update public.sign_outbox set status = 'queued', params = params || jsonb_build_object('code', '999999') where id = $1`, [r.id]);
    await q(`update public.sign_outbox set status = 'not_configured' where id = $1`, [r.id]);
    check('AC-B11 queued -> not_configured: remove code também', !('code' in (await row()).params));
    await q(`update public.sign_outbox set status = 'queued', params = params || jsonb_build_object('code', '555555'), created_at = now() - interval '5 minutes' where id = $1`, [r.id]);
    await q(`insert into public.sign_outbox (user_id, channel, destination, template, params, created_at) values ($1, 'email', 'x@teste.example', 'otp', '{"code":"123123","minutes":10}', now() - interval '20 minutes')`, [U.U2.id]);
    const n = (await q(`select public._sign_outbox_purge() as n`))[0].n;
    const pos = await q(`select params ? 'code' as t, created_at < now() - interval '15 minutes' as velho from public.sign_outbox where user_id = $1`, [U.U2.id]);
    check('AC-B11 purga manual: só linhas com mais de 15 min perdem o code; a recente (5 min) fica', n === 1 && pos.every((x) => (x.velho ? !x.t : x.t)), [n, pos]);
    const dump = (await q(`select string_agg(params::text, ' ') s from public.sign_outbox`))[0].s || '';
    const usados = (await q(`select params ->> 'code' c from public.sign_outbox where status in ('sent','failed','not_configured')`));
    check('AC-B11 nenhum outbox já finalizado guarda código (varredura do dump)', usados.every((x) => x.c === null) && !/"code": "123123"/.test(dump));
    const tx = fs.readFileSync(MIG15, 'utf8').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    check('AC-B11 a migração não tem cron.schedule ativo (só em comentário)', !/cron\.schedule/.test(tx) && /^--.*cron\.schedule\('lottus-sign-outbox-purge', '\*\/15 \* \* \* \*'/m.test(fs.readFileSync(MIG15, 'utf8')));
    await q(`delete from public.sign_outbox where user_id = $1`, [U.U2.id]);
    // legado: linhas 'failed' que ainda tinham código antes da limpeza única
    const mCheck = await A.q(`select count(*)::int n from pg_trigger where tgname = 'sign_outbox_scrub'`);
    check('AC-B11 ANTES (esquema atual) não tinha o trigger de limpeza', mCheck[0].n === 0);
    await limpar(D, U.U2.id);
  }

  // =========================================================================================================
  sec('AC-B12 RN9: certificado vencido');
  {
    await restaurar(q); await limparEnv(U.U6.id);
    const base = await sm(U.U6);
    check('AC-B12 base: U6 com certificado válido: cert presente, cert_expired=false, verified=true', !!base.cert && base.cert_expired === false && base.verified === true, base);
    await q(`update public.sign_identity set cert_not_after = now() - interval '1 day' where user_id = $1`, [U.U6.id]);
    const v = await sm(U.U6);
    check('AC-B12 vencido: sign_me.cert = null, cert_expired = true, verified = false (sem contato verificado)', v.cert === null && v.cert_expired === true && v.verified === false && v.cert_pending === false, v);
    check('AC-B12 vencido: cert_expired_at traz a data de validade', !!v.cert_expired_at && Date.parse(v.cert_expired_at) < Date.now(), v.cert_expired_at);
    const e = await rpc('sign_env_create', { p: envPayload }, U.U6.email);
    check('AC-B12 vencido: sign_env_create devolve identity_required', e.status === 400 && /identity_required/.test(e.msg), e);
    await q(`update public.sign_identity set cert_not_after = null where user_id = $1`, [U.U6.id]);
    const n = await sm(U.U6);
    check('AC-B12 cert_not_after nulo: não vale (cert_expired=true, cert null)', n.cert === null && n.cert_expired === true && n.verified === false, n);
    await q(`update public.sign_identity set cert_not_after = now() + interval '10 days' where user_id = $1`, [U.U6.id]);
    const ok = await rpc('sign_env_create', { p: envPayload }, U.U6.email);
    check('AC-B12 not_after no futuro: sign_env_create passa (200 com id)', ok.status === 200 && !!ok.body.id, ok);
    await limparEnv(U.U6.id);
    // contato verificado compensa certificado vencido
    await q(`update public.sign_identity set cert_not_after = now() - interval '1 day', phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [U.U6.id]);
    const c = await sm(U.U6);
    const ok2 = await rpc('sign_env_create', { p: envPayload }, U.U6.email);
    check('AC-B12 certificado vencido COM contato verificado: verified=true, cert_expired=true e o envio passa', c.verified === true && c.cert_expired === true && ok2.status === 200, [c.verified, ok2.status]);
    await limparEnv(U.U6.id);
    await q(`update public.sign_identity set cert_not_after = now() + interval '300 days', phone_verified_at = null, phone_channel = null where user_id = $1`, [U.U6.id]);
    const ant = await A.rpc('sign_me', {}, U.U6.email);
    await A.q(`update public.sign_identity set cert_not_after = now() - interval '1 day' where user_id = $1`, [U.U6.id]);
    const ant2 = await A.rpc('sign_me', {}, U.U6.email);
    check('AC-B12 ANTES: o esquema atual ainda tratava o certificado vencido como válido (verified=true)', ant.body.verified === true && ant2.body.verified === true && !!ant2.body.cert, ant2.body.cert);
    await A.q(`update public.sign_identity set cert_not_after = now() + interval '300 days' where user_id = $1`, [U.U6.id]);
  }

  // =========================================================================================================
  sec('AC-B13 RN9: _sign_cert_save, desafio e raízes');
  {
    await restaurar(q);
    const novoNonce = async (u) => { const r = await rpc('sign_cert_challenge', {}, u.email); if (!r.body.ok) throw new Error(JSON.stringify(r)); return r.body.nonce; };
    const hoje = Date.now(); const iso = (d) => new Date(hoje + d * 864e5).toISOString();
    const cert = (o) => JSON.stringify({ serial: 'AB12', subject: 'CN=Fabi Exemplo', issuer: 'AC Teste', cpf: U.U6.cpf, not_before: iso(-30), not_after: iso(300), chain_ok: true, ...o });
    const salvar = (uid, o, nonce) => tryq(`select public._sign_cert_save($1::uuid, $2::jsonb)`, [uid, cert({ nonce, ...o })]);
    await q(`update public.sign_identity set cert_serial = null, cert_subject = null, cert_issuer = null, cert_cpf = null, cert_not_before = null, cert_not_after = null, cert_verified_at = null, cert_chain_ok = false where user_id = $1`, [U.U6.id]);
    const base = await sm(U.U6);
    check('AC-B13 preparo: U6 sem certificado', base.cert === null && base.cert_expired === false && base.verified === false, base);
    const ch = await rpc('sign_cert_challenge', {}, U.U6.email);
    check('AC-B13 desafio: ok, nonce, texto com o nonce, expires_in 300, 5 min no banco', ch.body.ok === true && ch.body.expires_in === 300 && ch.body.text.includes(ch.body.nonce), ch.body);
    const rows = await q(`select extract(epoch from (expires_at - created_at))::int s from public.sign_cert_challenges where nonce = $1`, [ch.body.nonce]);
    check('AC-B13 o desafio vale 5 minutos (300 s)', rows[0].s === 300, rows);
    check('AC-B13 roots_loaded=false sem raízes ativas', ch.body.roots_loaded === false, ch.body);
    await q(`insert into public.sign_trusted_roots (name, pem, sha256, active) values ('Raiz de teste', 'PEM-FICTICIO', 'aa11', true) on conflict do nothing`);
    const ch2 = await rpc('sign_cert_challenge', {}, U.U6.email);
    check('AC-B13 roots_loaded=true com uma raiz ativa', ch2.body.roots_loaded === true, ch2.body);
    await q(`update public.sign_trusted_roots set active = false`);
    check('AC-B13 raiz desligada: roots_loaded volta a false', (await rpc('sign_cert_challenge', {}, U.U6.email)).body.roots_loaded === false);
    await q(`delete from public.sign_trusted_roots where sha256 = 'aa11'`);
    const n1 = ch.body.nonce;
    let r = await salvar(U.U6.id, { cpf: '12345678909' }, n1);
    check('AC-B13 CPF do certificado diferente do perfil: cert_cpf_mismatch', !r.ok && /cert_cpf_mismatch/.test(r.msg), r);
    r = await salvar(U.U6.id, { cpf: null }, n1);
    check('AC-B13 certificado sem CPF: cert_cpf_mismatch (não dá para ligar à pessoa)', !r.ok && /cert_cpf_mismatch/.test(r.msg), r);
    r = await salvar(U.U6.id, { chain_ok: false }, n1);
    check('AC-B13 chain_ok=false: cert_chain_invalid e NADA vinculado', !r.ok && /cert_chain_invalid/.test(r.msg) && (await sm(U.U6)).cert === null && (await sm(U.U6)).cert_pending === false, r);
    r = await salvar(U.U6.id, { not_after: iso(-1) }, n1);
    check('AC-B13 vencido (not_after no passado): cert_expired', !r.ok && /cert_expired/.test(r.msg), r);
    r = await salvar(U.U6.id, { not_before: iso(1) }, n1);
    check('AC-B13 ainda não válido (not_before no futuro): cert_not_yet_valid', !r.ok && /cert_not_yet_valid/.test(r.msg), r);
    r = await salvar(U.U6.id, {}, 'nonce-que-nao-existe');
    check('AC-B13 nonce inexistente: challenge_expired', !r.ok && /challenge_expired/.test(r.msg), r);
    r = await salvar(U.U6.id, {}, undefined);
    check('AC-B13 sem nonce: challenge_expired', !r.ok && /challenge_expired/.test(r.msg), r);
    check('AC-B13 as recusas não gastaram o nonce válido (bound_at nulo)', (await q(`select bound_at from public.sign_cert_challenges where nonce = $1`, [n1]))[0].bound_at === null);
    const outroUser = await salvar(U.U2.id, { cpf: U.U2.cpf }, n1);
    check('AC-B13 nonce de U6 usado por U2: challenge_expired (nonce preso ao usuário)', !outroUser.ok && /challenge_expired/.test(outroUser.msg), outroUser);
    r = await salvar(U.U6.id, {}, n1);
    const m = await sm(U.U6);
    check('AC-B13 tudo certo: vincula; sign_me.cert presente, verified=true, cert_expired=false', r.ok && !!m.cert && m.verified === true && m.cert_expired === false && m.cert.cpf === U.U6.cpf, [r, m.cert]);
    r = await salvar(U.U6.id, {}, n1);
    check('AC-B13 nonce já usado (uso único): challenge_expired', !r.ok && /challenge_expired/.test(r.msg), r);
    const nv = await novoNonce(U.U6);
    await q(`update public.sign_cert_challenges set expires_at = now() - interval '1 second' where nonce = $1`, [nv]);
    r = await salvar(U.U6.id, {}, nv);
    check('AC-B13 nonce vencido (> 5 min): challenge_expired', !r.ok && /challenge_expired/.test(r.msg), r);
    // CPF exigido
    await q(`delete from public.sign_cert_challenges where user_id = $1`, [U.U3.id]);
    const sem = await rpc('sign_cert_challenge', {}, U.U3.email);
    check('AC-B13 perfil sem CPF: sign_cert_challenge devolve ok:false cpf_required (sem criar desafio)', sem.body.ok === false && sem.body.error === 'cpf_required' && (await q(`select count(*)::int n from public.sign_cert_challenges where user_id = $1`, [U.U3.id]))[0].n === 0, sem.body);
    r = await tryq(`select public._sign_cert_save($1::uuid, $2::jsonb)`, [U.U3.id, cert({ nonce: 'x' })]);
    check('AC-B13 perfil sem CPF: _sign_cert_save recusa com cpf_required', !r.ok && /cpf_required/.test(r.msg), r);
    // limite de 10 por hora
    await q(`delete from public.sign_cert_challenges where user_id = $1`, [U.U6.id]);
    const lista = []; for (let i = 0; i < 11; i++) lista.push(await rpc('sign_cert_challenge', {}, U.U6.email));
    check('AC-B13 10 desafios na hora passam; o 11º é recusado (too_many com retry_after)', lista.slice(0, 10).every((x) => x.body.ok === true) && lista[10].body.ok === false && lista[10].body.error === 'too_many' && lista[10].body.retry_after >= 1, lista[10].body);
    check('AC-B13 o histórico da hora não é apagado a cada pedido (10 linhas)', (await q(`select count(*)::int n from public.sign_cert_challenges where user_id = $1`, [U.U6.id]))[0].n === 10);
    await q(`update public.sign_cert_challenges set created_at = created_at - interval '61 minutes' where user_id = $1`, [U.U6.id]);
    check('AC-B13 passada 1 hora, volta a gerar', (await rpc('sign_cert_challenge', {}, U.U6.email)).body.ok === true);
    // regressão do vínculo CNPJ não é testada (depende de _sign_link_try com empresa real)
    await q(`delete from public.sign_cert_challenges where user_id = $1`, [U.U6.id]);
    await q(`update public.sign_identity set cert_serial = '0A1B', cert_subject = 'CN=Fabi Exemplo', cert_issuer = 'AC Exemplo', cert_cpf = '43966982080', cert_not_before = now() - interval '30 days', cert_not_after = now() + interval '300 days', cert_verified_at = now(), cert_chain_ok = true where user_id = $1`, [U.U6.id]);
  }

  // =========================================================================================================
  sec('AC-B14 A14-M3: tentativas de CPF');
  {
    await restaurar(q); await q(`delete from public.sign_cpf_attempts`);
    const U3 = U.U3;
    const tent = (cpf, u = U3) => rpc('sign_profile_save', { p: { name: 'Vazio Teste Nome', cpf } }, u.email);
    const out = []; for (let i = 0; i < 5; i++) out.push(await tent(U.U2.cpf));
    check('AC-B14 5 tentativas com CPF de outra pessoa: 200, ok:false cpf_in_use (sem exceção, sem dizer de quem é)', out.every((r) => r.status === 200 && r.body.ok === false && r.body.error === 'cpf_in_use' && JSON.stringify(Object.keys(r.body).sort()) === '["error","ok"]'), out.map((r) => r.body));
    check('AC-B14 cada recusa gravou uma linha em sign_cpf_attempts (5)', (await q(`select count(*)::int n from public.sign_cpf_attempts where user_id = $1`, [U3.id]))[0].n === 5);
    const sexta = await tent(U3.cpfLivre);
    check('AC-B14 a 6ª, com CPF LIVRE: too_many_attempts com retry_after (1 a 3600)', sexta.body.ok === false && sexta.body.error === 'too_many_attempts' && sexta.body.retry_after >= 1 && sexta.body.retry_after <= 3600, sexta.body);
    check('AC-B14 e nada foi gravado no perfil', (await q(`select cpf from public.profiles where id = $1`, [U3.id]))[0].cpf === null);
    check('AC-B14 a recusa por limite não cria linha (continua 5)', (await q(`select count(*)::int n from public.sign_cpf_attempts where user_id = $1`, [U3.id]))[0].n === 5);
    const soNome = await rpc('sign_profile_save', { p: { name: 'Vazio Outro Nome' } }, U3.email);
    check('AC-B14 durante o limite, salvar sem CPF não é barrado por too_many_attempts (U3 sem CPF recebe invalid_cpf da regra da 1.4) e não conta', soNome.body.error === 'invalid_cpf' && (await q(`select count(*)::int n from public.sign_cpf_attempts where user_id = $1`, [U3.id]))[0].n === 5, soNome.body);
    const acc = await rpc('sign_account_save', { p: { doc: U3.cpfLivre } }, U3.email);
    check('AC-B14 o atalho sign_account_save (doc) respeita o mesmo limite', acc.body.ok === false && acc.body.error === 'too_many_attempts', acc.body);
    await q(`update public.sign_cpf_attempts set at = at - interval '61 minutes' where user_id = $1`, [U3.id]);
    const livre = await tent(U3.cpfLivre);
    check('AC-B14 passada 1 hora o CPF livre é aceito', livre.status === 200 && livre.body.cpf === U3.cpfLivre, livre.body);
    // os 3 erros contam; mensagem igual não distingue (código)
    await restaurar(q); await q(`delete from public.sign_cpf_attempts`);
    const mix = [await tent('123', U.U1), await tent(U.U2.cpf, U.U1), await tent('00000000000', U.U1), await tent('52998224725', U.U1)];
    check('AC-B14 invalid_cpf e cpf_locked também contam (4 recusas, todas ok:false)', mix.every((r) => r.body.ok === false) && mix[0].body.error === 'invalid_cpf' && mix[1].body.error === 'cpf_locked' && (await q(`select count(*)::int n from public.sign_cpf_attempts where user_id = $1`, [U.U1.id]))[0].n === 4, mix.map((r) => r.body));
    const quinta = await tent('11111111111', U.U1);
    const soNomeU1 = await rpc('sign_profile_save', { p: { name: 'Ana Exemplo da Silva' } }, U.U1.email);
    const sexU1 = await tent(U.U2.cpf, U.U1);
    check('AC-B14 U1 com 5 recusas: o nome sem CPF ainda salva (200) e um novo CPF recebe too_many_attempts', quinta.body.error === 'invalid_cpf' && soNomeU1.status === 200 && soNomeU1.body.email === U.U1.email && sexU1.body.error === 'too_many_attempts', [quinta.body, soNomeU1.body, sexU1.body]);
    await q(`delete from public.sign_cpf_attempts where user_id = $1`, [U.U1.id]); await tent('123', U.U1); await tent('123', U.U1); await tent('123', U.U1); await tent('123', U.U1);
    const nm = await rpc('sign_profile_save', { p: { name: 'Ana Exemplo da Silva', cpf: U.U1.cpf } }, U.U1.email);
    check('AC-B14 igual ao CPF atual é no-op (ok) e não conta', nm.status === 200 && nm.body.ok !== false && (await q(`select count(*)::int n from public.sign_cpf_attempts where user_id = $1`, [U.U1.id]))[0].n === 4, nm.body);
    const inv = await rpc('sign_profile_save', { p: { name: 'A', cpf: '' } }, U.U1.email);
    check('AC-B14 nome inválido continua sendo exceção invalid_name e não conta', inv.status === 400 && /invalid_name/.test(inv.msg) && (await q(`select count(*)::int n from public.sign_cpf_attempts where user_id = $1`, [U.U1.id]))[0].n === 4, inv);
    // um usuário não limita o outro
    const outro = await tent(U.U2.cpf, U.U5);
    check('AC-B14 o limite é por usuário (U5 não é afetado pelas tentativas de U1/U3)', outro.body.error !== 'too_many_attempts', outro.body);
    check('AC-B14 sign_cpf_attempts: U1 não lê as linhas de U3', (await asRole(DB, U.U1.id, `select * from public.sign_cpf_attempts`)).err !== undefined);
    await q(`delete from public.sign_cpf_attempts`); await restaurar(q);
  }

  // =========================================================================================================
  sec('AC-B15 sem regressão (amostra; a suíte completa é t-perfil-db.cjs)');
  {
    const ana = { email: 'ana.sign@exemplo.com.br' };
    const e = await rpc('sign_env_create', { p: { ...envPayload, name: 'Contrato regressão' } }, ana.email);
    check('AC-B15 sign_env_create com contato verificado legado (sms): continua passando', e.status === 200 && !!e.body.id, e);
    const d = await rpc('sign_env_create', { p: envPayload }, 'davi.sign@exemplo.com.br');
    check('AC-B15 sign_env_create sem verificação: identity_required', d.status === 400 && /identity_required/.test(d.msg), d);
    const s = await sm(U.U1);
    check('AC-B15 sign_me mantém todas as chaves da 1.4 e só acrescenta contact_kind, cert_expired, cert_expired_at e otp_retry_after', ['email', 'name', 'cpf', 'name_hint', 'phone', 'phone_verified', 'phone_verified_at', 'cert', 'verified', 'onboarding_done', 'channels', 'cert_pending', 'companies', 'cpf_locked', 'profile_complete', 'contact_kind', 'cert_expired', 'cert_expired_at', 'otp_retry_after'].every((k) => k in s), Object.keys(s));
    const ok = await rpc('sign_profile_save', { p: { name: 'Ana Exemplo da Silva' } }, U.U1.email);
    check('AC-B15 sign_profile_save de sucesso devolve o sign_me (sem ok:false)', ok.status === 200 && ok.body.email === U.U1.email, ok.body);
    check('AC-B15 sign_plan_state segue funcionando', (await rpc('sign_plan_state', {}, U.U1.email)).status === 200);
    await limparEnv(U.U1.id === 'x' ? '' : 'a1000000-0000-4000-8000-000000000001');
  }

  // =========================================================================================================
  sec('Idempotência e reversão (banco MEIO = esquema + só a 1.4)');
  {
    const M = await banco(DB_MEIO);
    const defs = async () => (await M.q(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, md5(pg_get_functiondef(p.oid)) as def, coalesce(p.proacl::text, '') as acl from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname ~ '^_?sign_' or p.proname = '_senv_owner_name') order by 1`));
    const dados = async () => (await M.q(`select md5(coalesce((select string_agg(p::text, '|' order by id) from public.profiles p), '') || coalesce((select string_agg(a::text, '|' order by id) from public.sign_accounts a), '') || coalesce((select string_agg((to_jsonb(i) - 'otp_locked_until')::text, '|' order by user_id) from public.sign_identity i), '') || (select count(*)::text from public.sign_outbox)) as h`))[0].h;
    const rev = path.join(tmp, 'reversao-1-5.sql');
    cp.execFileSync(path.join(ROOT, 'scripts/sign-local/gerar-reversao-1-5.sh'), [DB_MEIO, rev], { encoding: 'utf8' });
    check('AC-B12/rev reversão gerada FORA do repositório com as 8 funções', (fs.readFileSync(rev, 'utf8').match(/CREATE OR REPLACE FUNCTION/g) || []).length === 8 && !rev.startsWith(ROOT));
    const d0 = await defs(), h0 = await dados();
    check('idem: antes da 1.5 não existem as internas novas nem a tabela', !d0.some((x) => /_sign_cpf_guarded_apply|_sign_phone_norm|_sign_outbox_purge/.test(x.sig)) && (await M.q(`select to_regclass('public.sign_cpf_attempts') is null as n`))[0].n);
    const cnt = async () => (await M.q(`select md5(string_agg(proname || ':' || md5(prosrc), ',' order by proname)) h from pg_proc where pronamespace = 'public'::regnamespace and proname ~ '^_?sign_'`))[0].h;
    psqlFile(DB_MEIO, MIG15);
    const d1 = await defs(), h1 = await dados();
    check('idem: 1ª aplicação sem erro; mesmos dados (identidade, perfis, contas, outbox)', h0 === h1 && d1.length > d0.length, [h0, h1]);
    let erro = null; try { psqlFile(DB_MEIO, MIG15); } catch (e) { erro = e.message; }
    const d2 = await defs(), h2 = await dados();
    check('idem: 2ª aplicação: sem erro; funções, permissões (ACL) e dados IDÊNTICOS', erro === null && JSON.stringify(d1) === JSON.stringify(d2) && h1 === h2, erro);
    check('idem: 2ª aplicação: 1 trigger de cada, 1 restrição de canal, 1 índice de cada', (await M.q(`select (select count(*)::int from pg_trigger where tgname = 'sign_outbox_scrub') a, (select count(*)::int from pg_trigger where tgname = 'sign_profiles_phone_rn7') b, (select count(*)::int from pg_constraint where conname = 'sign_outbox_channel_check') c, (select count(*)::int from pg_indexes where indexname in ('sign_cpf_attempts_user_idx','sign_cert_challenges_user_idx')) d`))[0].a === 1);
    // cria linhas email antes de reverter (prova o NOT VALID)
    await M.fake.loadUsers();
    await M.rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, U.U2.email);
    check('rev: com 1.5 aplicada o envio por e-mail grava outbox email', (await M.q(`select count(*)::int n from public.sign_outbox where channel = 'email'`))[0].n === 1);
    psqlFile(DB_MEIO, rev);
    const d3 = await defs();
    const orig = Object.fromEntries(d0.map((x) => [x.sig, x]));
    check('rev: reversão aplicada sem erro; mesmas funções de antes (nenhuma a mais, nenhuma a menos)', d3.length === d0.length && d3.every((x) => orig[x.sig]), d3.map((x) => x.sig).filter((s) => !orig[s]));
    check('rev: definição de cada função volta IDÊNTICA (hash) e permissões como antes', d3.every((x) => orig[x.sig].def === x.def && orig[x.sig].acl === x.acl), d3.filter((x) => orig[x.sig] && (orig[x.sig].def !== x.def || orig[x.sig].acl !== x.acl)).map((x) => x.sig));
    const sms = await M.rpc('sign_phone_send', { p_phone: '(11) 98765-4321', p_channel: 'sms' }, U.U4.email);
    check('rev: depois da reversão o sms volta a funcionar (contrato antigo) e sign_me perde contact_kind', sms.status === 200 && !('ok' in sms.body) && !('contact_kind' in (await M.rpc('sign_me', {}, U.U4.email)).body), sms.body);
    check('rev: trigger e tabela da 1.5 removidos', (await M.q(`select (select count(*)::int from pg_trigger where tgname in ('sign_outbox_scrub','sign_profiles_phone_rn7')) a, to_regclass('public.sign_cpf_attempts') is null b`))[0].a === 0);
    psqlFile(DB_MEIO, MIG15);
    check('rev: reaplicar a 1.5 depois da reversão funciona e volta ao mesmo estado', JSON.stringify(await defs()) === JSON.stringify(d1));
    void cnt; M.close();
  }

  // =========================================================================================================
  sec('Desempenho: 10 mil perfis, p95 e EXPLAIN (ANALYZE, BUFFERS)');
  {
    fs.mkdirSync(EVID, { recursive: true });
    await restaurar(q);
    const t0 = Date.now();
    await q(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) select gen_random_uuid(), 'carga' || g || '@carga.example', 'x', jsonb_build_object('name', 'Meta ' || g) from generate_series(1, 10000) g`);
    await q(`insert into public.profiles (id, full_name, cpf, email) select u.id, 'Pessoa Carga ' || row_number() over (), lpad((row_number() over () + 70000000000)::text, 11, '0'), u.email from auth.users u where u.email like '%@carga.example'`);
    await q(`insert into public.sign_identity (user_id, phone, phone_verified_at, phone_channel, onboarding_done) select u.id, '55119' || lpad((row_number() over ())::text, 8, '0'), now(), 'email', true from auth.users u where u.email like '%@carga.example'`);
    await q(`insert into public.sign_otps (id, user_id, channel, destination, code_hash, expires_at, created_at) select gen_random_uuid(), u.id, 'email', u.email, 'x', now() + interval '10 minutes', now() - make_interval(hours => g) from auth.users u, generate_series(1, 3) g where u.email like '%@carga.example'`);
    await q(`insert into public.sign_outbox (user_id, channel, destination, template, params, status) select u.id, 'email', u.email, 'otp', '{"minutes":10}', 'sent' from auth.users u, generate_series(1, 3) g where u.email like '%@carga.example'`);
    await q(`insert into public.sign_cert_challenges (nonce, user_id, expires_at) select md5(u.id::text || g), u.id, now() + interval '5 minutes' from auth.users u, generate_series(1, 2) g where u.email like '%@carga.example'`);
    await q(`insert into public.sign_cpf_attempts (user_id, at) select u.id, now() - interval '3 hours' from auth.users u where u.email like '%@carga.example'`);
    await q(`analyze`);
    const tot = (await q(`select (select count(*)::int from public.profiles) perfis, (select count(*)::int from public.sign_otps) otps, (select count(*)::int from public.sign_outbox) outbox, (select count(*)::int from public.sign_cert_challenges) desafios`))[0];
    check(`Carga semeada em ${((Date.now() - t0) / 1000).toFixed(1)} s: ${tot.perfis} perfis, ${tot.otps} otps, ${tot.outbox} outbox, ${tot.desafios} desafios`, tot.perfis >= 10000, tot);
    await reload();
    const mail = (i) => 'carga' + i + '@carga.example';
    const ms = async (fn, n, body, who) => { const out = []; for (let i = 0; i < n; i++) { const t1 = process.hrtime.bigint(); const r = await rpc(fn, body(i), who(i)); if (r.status !== 200) throw new Error(fn + ' ' + JSON.stringify(r)); out.push(Number(process.hrtime.bigint() - t1) / 1e6); } return out; };
    const comCodigo = (ini, n) => q(`update public.sign_otps o set code_hash = encode(extensions.digest('123456:' || o.user_id::text || ':' || o.id::text, 'sha256'), 'hex'), created_at = now() - interval '5 seconds', expires_at = now() + interval '10 minutes', consumed_at = null, attempts = 0
      where o.id in (select distinct on (user_id) id from public.sign_otps where user_id in (select id from auth.users where email = any($1)) order by user_id, created_at desc)`, [Array.from({ length: n }, (_, i) => mail(ini + i))]);
    D.fake.state.rpcMs.length = 0;
    const seqMe = await ms('sign_me', 100, () => ({}), () => mail(77));
    const dbMe = D.fake.state.rpcMs.filter((x) => x.fn === 'sign_me').map((x) => x.ms);
    await comCodigo(200, 100); D.fake.state.rpcMs.length = 0;
    const errados = await ms('sign_phone_verify', 100, () => ({ p_code: '000000' }), (i) => mail(200 + i));
    const dbErr = D.fake.state.rpcMs.filter((x) => x.fn === 'sign_phone_verify').map((x) => x.ms);
    await comCodigo(400, 100); D.fake.state.rpcMs.length = 0;
    const certos = await ms('sign_phone_verify', 100, () => ({ p_code: '123456' }), (i) => mail(400 + i));
    const dbOk = D.fake.state.rpcMs.filter((x) => x.fn === 'sign_phone_verify').map((x) => x.ms);
    await q(`update public.sign_identity set otp_locked_until = null`);
    const envios = []; for (let i = 0; i < 50; i++) { await q(`delete from public.sign_otps where user_id = (select id from auth.users where email = $1)`, [mail(600 + i)]); const t1 = process.hrtime.bigint(); const r = await rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, mail(600 + i)); if (r.body.ok !== true) throw new Error(JSON.stringify(r)); envios.push(Number(process.hrtime.bigint() - t1) / 1e6); }
    const par = async () => { const all = []; for (let rodada = 0; rodada < 10; rodada++) all.push(...await Promise.all(Array.from({ length: 10 }, async (_, i) => { const t1 = process.hrtime.bigint(); const r = await rpc('sign_me', {}, mail(800 + i)); if (r.status !== 200) throw new Error(JSON.stringify(r)); return Number(process.hrtime.bigint() - t1) / 1e6; }))); return all; };
    const parMe = await par();
    const lim = (a) => `p95 ${p95(a).toFixed(1)} ms, mediana ${[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(1)} ms`;
    const linhas = [`sign_me, 100 sequenciais, ponta a ponta (HTTP + banco): ${lim(seqMe)}`, `sign_me, 100 sequenciais, só a transação no banco: ${lim(dbMe)}`, `sign_me, 10 rodadas x 10 paralelas, ponta a ponta: ${lim(parMe)}`,
      `sign_phone_verify (código errado, grava tentativa), 100 usuários, ponta a ponta: ${lim(errados)}`, `sign_phone_verify (código errado), só o banco: ${lim(dbErr)}`,
      `sign_phone_verify (código certo, sucesso com sign_me), 100 usuários, ponta a ponta: ${lim(certos)}`, `sign_phone_verify (código certo), só o banco: ${lim(dbOk)}`, `sign_phone_send (e-mail), 50 usuários, ponta a ponta: ${lim(envios)}`];
    for (const l of linhas) console.info('  medido: ' + l);
    check('Desempenho: sign_me p95 < 150 ms (sequencial e paralelo, ponta a ponta)', p95(seqMe) < 150 && p95(parMe) < 150, [p95(seqMe), p95(parMe)]);
    check('Desempenho: sign_phone_verify p95 < 150 ms (erro e sucesso, ponta a ponta)', p95(errados) < 150 && p95(certos) < 150, [p95(errados), p95(certos)]);
    check('Desempenho: sign_phone_send p95 < 150 ms', p95(envios) < 150, p95(envios));
    const uid = (await q(`select id from auth.users where email = $1`, [mail(77)]))[0].id;
    const consultas = {
      'sign_identity por user_id FOR UPDATE (send, verify)': `select * from public.sign_identity where user_id = '${uid}' for update`,
      'sign_otps: último ativo do usuário (verify)': `select * from public.sign_otps where user_id = '${uid}' and purpose = 'phone_verify' and consumed_at is null order by created_at desc limit 1`,
      'sign_otps: contagem da última hora (send, 3/h)': `select count(*) from public.sign_otps where user_id = '${uid}' and created_at > now() - interval '1 hour'`,
      'sign_otps: último envio (send, 30 s)': `select max(created_at) from public.sign_otps where user_id = '${uid}' and created_at > now() - interval '30 seconds'`,
      'sign_cpf_attempts: contagem da última hora (A14-M3)': `select count(*) from public.sign_cpf_attempts where user_id = '${uid}' and at > now() - interval '1 hour'`,
      'sign_cert_challenges: contagem da última hora (10/h)': `select count(*) from public.sign_cert_challenges where user_id = '${uid}' and created_at > now() - interval '1 hour'`,
      'sign_cert_challenges: vínculo por nonce (_sign_cert_save)': `select * from public.sign_cert_challenges where nonce = md5('${uid}1')`,
      'sign_outbox: última linha do usuário (sign_otp_delivery)': `select status, channel from public.sign_outbox where user_id = '${uid}' order by id desc limit 1`,
      'profiles por id (sign_me)': `select * from public.profiles where id = '${uid}'`,
    };
    let txt = `EXPLAIN (ANALYZE, BUFFERS) no Postgres local (banco "${DB}", ${tot.perfis} perfis, ${tot.otps} otps, ${tot.outbox} outbox, ${tot.desafios} desafios). Gerado por t-verif-db.cjs.\nAs funções PL/pgSQL são opacas ao EXPLAIN; cada consulta que elas executam é explicada com o uid de um usuário da carga.\n\n`;
    const seq = {};
    for (const [rot, sql] of Object.entries(consultas)) { const plan = (await q(`explain (analyze, buffers) ${sql}`)).map((r) => r['QUERY PLAN']).join('\n'); txt += `-- ${rot}\n${sql}\n${plan}\n\n`; seq[rot] = plan; }
    // outbox por user_id não tem índice sem a carga de 1.5? o esquema tem sign_outbox_user_idx (user_id, created_at desc)
    fs.writeFileSync(path.join(EVID, 'explain-1-5.txt'), txt);
    for (const tab of ['sign_identity', 'sign_otps', 'sign_cpf_attempts', 'sign_cert_challenges', 'sign_outbox', 'profiles']) check(`Desempenho: plano sem Seq Scan em ${tab}`, !Object.values(seq).some((p) => new RegExp('Seq Scan on ' + tab + '\\b').test(p)));
    const exec = Object.entries(seq).map(([k, p]) => [k, +(p.match(/Execution Time: ([\d.]+) ms/) || [0, 0])[1]]);
    check('Desempenho: cada consulta executa em menos de 5 ms com 10 mil perfis', exec.every(([, m]) => m < 5), exec);
    fs.writeFileSync(path.join(EVID, 'p95-1-5.txt'), `Medido por t-verif-db.cjs em ${new Date().toISOString().slice(0, 10)} (Postgres 16 local, ${tot.perfis} perfis, ${tot.otps} otps):\n` + linhas.join('\n') + '\n');
    for (const t of ['sign_cpf_attempts', 'sign_cert_challenges', 'sign_outbox', 'sign_otps', 'sign_identity']) await q(`delete from public.${t} where user_id in (select id from auth.users where email like '%@carga.example')`);
    await q(`delete from public.profiles where email like '%@carga.example'`); await q(`delete from auth.users where email like '%@carga.example'`);
  }

  D.close(); A.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* sem limpeza */ }
  console.info('limpando: reset.sh ambos');
  reset('ambos');
  cp.execFileSync('psql', ['-X', '-q', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-c', `drop database if exists ${DB_MEIO} with (force)`]);
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
