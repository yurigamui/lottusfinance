// Seção 1.3 (Onboarding) + pacote ciclo 2 da 1.5 (C2-15), BANCO: AC-B1 a AC-B7 e AC-R1 a AC-R4, AC-R6, AC-R8 (parte do banco), AC-R9 e AC-R10
// contra o Postgres LOCAL real, chamando as RPCs como o PostgREST faz. Nada em produção.
// Bancos ISOLADOS (SIGN_DB e SIGN_DB_ANTES SEMPRE exportados; nunca o banco compartilhado "sign"):
//   ANTES  = SIGN_DB_ANTES: esquema atual + migrações 1.4 e 1.5 (SEM a migração nova)   -> prova os defeitos
//   DEPOIS = SIGN_DB:       esquema atual + 1.4 + 1.5 + 20261128120000                  -> prova as correções
//   MEIO   = SIGN_DB_meio:  esquema + 1.4 + 1.5 (a migração nova é aplicada 2x e revertida no teste)
//   CRON   = SIGN_DB_cron:  como MEIO, com um pg_cron SIMULADO (extensão de teste; o pg_cron real não existe neste ambiente)
// Uso: SIGN_DB=sign_onb SIGN_DB_ANTES=sign_onb_antes [EVID=<pasta>] node t-onb-db.cjs
const { check, done, res } = require('./lib.cjs');
const { banco, reset, psqlFile, DB, DB_ANTES, ROOT, PORT } = require('./perfil-lib.cjs');
if (!process.env.SIGN_DB || !process.env.SIGN_DB_ANTES) { console.error('defina SIGN_DB e SIGN_DB_ANTES (bancos isolados do teste; nunca use o "sign" compartilhado)'); process.exit(2); }
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');
const { mk, uid, email, cpfValido } = require('./onb-lib.cjs');
const EVID = process.env.EVID || path.join(ROOT, 'docs/agente/sign/evidencias-1-3');
const MIG = path.join(ROOT, 'supabase/migrations/20261128120000_sign_onboarding_e_ciclo2_1_5.sql');
const DB_MEIO = DB + '_meio';
const DB_CRON = DB + '_cron';
const EXT_DIR = '/usr/share/postgresql/16/extension';
const sec = (n) => res.lines.push('# ' + n);
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(EVID, { recursive: true });
const evid = {};

const conn = async (db) => { const c = new Client({ host: '127.0.0.1', port: Number(PORT), user: 'postgres', database: db }); await c.connect(); return c; };
/* chama uma função como o PostgREST: transação, claims do token, set local role. Devolve {r} ou {err, code} */
async function callAs(c, userId, sql, params, role = 'authenticated') {
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role } : { role })]);
    await c.query('set local role ' + role);
    const r = await c.query(sql, params);
    await c.query('commit');
    return { r: r.rows[0] ? r.rows[0].r : null };
  } catch (e) { await c.query('rollback').catch(() => {}); return { err: String(e.message), code: e.code }; }
}
const priv = async (db, sig, role) => (await db.q(`select has_function_privilege($1, ('public.' || $2)::regprocedure, 'execute') as ok`, [role, sig]))[0].ok;
const pubGrant = async (db, sig) => (await db.q(`select exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = ('public.' || $1)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') as ok`, [sig]))[0].ok;
const snap = async (db) => (await db.q(`select p.oid::regprocedure::text as sig, md5(pg_get_functiondef(p.oid)) as d, coalesce(p.proacl::text, '') as acl from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).reduce((m, x) => { m[x.sig] = x; return m; }, {});
const FN8 = ['sign_me()', 'sign_onboarding_done()', 'sign_phone_send(text,text)', 'sign_phone_verify(text)', 'sign_cert_challenge()', '_sign_cert_take(uuid,text)', '_sign_outbox_purge()', '_sign_cpf_guarded_apply(uuid,text,text,text)'];

(async () => {
  console.info('recriando bancos locais isolados (ANTES, DEPOIS, MEIO, CRON)...');
  reset('antes15');
  process.env.SIGN_SO_ATE = '1.3'; reset('depois'); delete process.env.SIGN_SO_ATE; // C2-13: o DEPOIS da 1.3 não inclui a migração 20261129120000
  const env = (extra) => ({ ...process.env, SIGN_SCHEMA: process.env.SIGN_SCHEMA || '/root/sign-schema.sql', ...extra });
  cp.execFileSync(path.join(ROOT, 'scripts/sign-local/reset.sh'), ['depois'], { env: env({ SIGN_DB: DB_MEIO, SIGN_SO_ATE: '1.5' }), encoding: 'utf8' });
  cp.execFileSync(path.join(ROOT, 'scripts/sign-local/reset.sh'), ['depois'], { env: env({ SIGN_DB: DB_CRON, SIGN_SO_ATE: '1.5' }), encoding: 'utf8' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-1-3-'));
  const A = await banco(DB_ANTES);
  const D = await banco(DB);
  const M = await banco(DB_MEIO);
  const C = await banco(DB_CRON);
  const cleanups = [];

  // ---- contas fictícias, as mesmas nos dois bancos (ids iguais) ----
  const U = {};
  async function popular(db) {
    const q = db.q;
    U.incompleto = await mk(q, 1, { nome: null, cpf: null, verif: 'email' });                 // sem nome e sem CPF, contato verificado
    U.umaPalavra = await mk(q, 2, { nome: 'Fulano', verif: 'email' });                        // nome de 1 palavra
    U.cpfRuim = await mk(q, 3, { cpf: '11111111111', verif: 'email' });                       // CPF inválido
    U.semPerfil = await mk(q, 4, { semPerfil: true, verif: 'email' });                        // sem linha em profiles
    U.semVerif = await mk(q, 5, {});                                                          // perfil completo, sem verificação
    U.email = await mk(q, 6, { verif: 'email' });                                             // completo + e-mail verificado
    U.cert = await mk(q, 7, { cert: 'ok' });                                                  // completo + certificado válido, sem celular
    U.certVenc = await mk(q, 8, { cert: 'vencido' });                                         // certificado vencido
    U.certSem = await mk(q, 9, { cert: 'semCadeia' });                                        // certificado sem cadeia
    U.fone = await mk(q, 10, { verif: 'phone' });                                             // completo + celular verificado
    U.atk1 = await mk(q, 11, { verif: 'email' }); U.atk2 = await mk(q, 12, { verif: 'email' }); U.atk3 = await mk(q, 13, { verif: 'phone' });
    U.vitima = await mk(q, 14, { nome: null, cpf: null, verif: 'email' });                    // incompleta: o ataque tentaria "completá-la"
    U.naoConf = await mk(q, 15, { verif: 'email', confirmado: false });                       // e-mail não confirmado
    U.nomeLongo = await mk(q, 16, { nome: 'A'.repeat(141) + ' B', verif: 'email' });           // nome acima de 140 (não é perfil completo)
    await db.fake.loadUsers();
  }
  await popular(A); await popular(D);
  const done_ = async (db, u) => (await db.q(`select onboarding_done from public.sign_identity where user_id = $1`, [u.id]))[0].onboarding_done;
  const msg = (r) => (r.body && r.body.message) || '';

  // =========================================================================================================
  sec('AC-B1/B2 sign_onboarding_done exige perfil completo e identidade verificada (ANTES grava true; DEPOIS recusa)');
  for (const [k, rot] of [['incompleto', 'sem nome e sem CPF'], ['umaPalavra', 'nome de 1 palavra'], ['cpfRuim', 'CPF inválido'], ['semPerfil', 'sem linha em profiles'], ['nomeLongo', 'nome acima de 140'],
    ['semVerif', 'perfil completo sem verificação'], ['certVenc', 'certificado vencido'], ['certSem', 'certificado sem cadeia']]) {
    const ra = await A.rpc('sign_onboarding_done', {}, U[k].email);
    check(`AC-B1/B2 ANTES (${rot}): grava onboarding_done=true (prova do defeito)`, ra.status === 200 && (await done_(A, U[k])) === true, ra);
    const rd = await D.rpc('sign_onboarding_done', {}, U[k].email);
    check(`AC-B1/B2 DEPOIS (${rot}): onboarding_incomplete e onboarding_done continua false`, rd.status === 400 && msg(rd) === 'onboarding_incomplete' && (await done_(D, U[k])) === false, rd);
  }

  sec('AC-B3 perfil completo e contato verificado: conclui e a repetição é idempotente');
  {
    const r1 = await D.rpc('sign_onboarding_done', {}, U.email.email);
    const r2 = await D.rpc('sign_onboarding_done', {}, U.email.email);
    check('AC-B3 e-mail verificado: onboarding_done=true, devolve sign_me (verified, contact_kind email)', r1.status === 200 && r1.body.onboarding_done === true && r1.body.verified === true && r1.body.contact_kind === 'email', r1.body);
    check('AC-B3 2ª chamada: 200, mesmo resultado, 1 só linha de identidade', r2.status === 200 && r2.body.onboarding_done === true && (await D.q(`select count(*)::int n from public.sign_identity where user_id = $1`, [U.email.id]))[0].n === 1);
    const r3 = await D.rpc('sign_onboarding_done', {}, U.fone.email);
    check('AC-B3 celular verificado: conclui (contact_kind phone)', r3.status === 200 && r3.body.onboarding_done === true && r3.body.contact_kind === 'phone', r3.body);
  }

  sec('AC-B4 certificado válido sem celular: conclui (verified = true)');
  {
    const r = await D.rpc('sign_onboarding_done', {}, U.cert.email);
    check('AC-B4 certificado válido: onboarding_done=true e verified=true sem phone_verified', r.status === 200 && r.body.onboarding_done === true && r.body.verified === true && r.body.phone_verified === false && !!r.body.cert, r.body);
    // 3 chamadas simultâneas do mesmo usuário (dois navegadores): todas ok, uma linha
    await D.q(`update public.sign_identity set onboarding_done = false where user_id = $1`, [U.cert.id]);
    const rs = await Promise.all([1, 2, 3].map(() => D.rpc('sign_onboarding_done', {}, U.cert.email)));
    check('concorrência (3 chamadas simultâneas): todas 200, onboarding_done=true, 1 linha', rs.every((x) => x.status === 200 && x.body.onboarding_done === true) && (await D.q(`select count(*)::int n from public.sign_identity where user_id = $1`, [U.cert.id]))[0].n === 1);
  }

  sec('AC-B5 IDOR: o usuário só altera o próprio estado (a função não recebe id)');
  {
    // vítima incompleta; 3 atacantes completos tentam completar/alterar a vítima por qualquer parâmetro
    const antes = JSON.stringify((await D.q(`select onboarding_done, phone_verified_at, updated_at from public.sign_identity where user_id = $1`, [U.vitima.id]))[0]);
    const tent = [];
    for (const atk of [U.atk1, U.atk2, U.atk3]) for (const body of [{ user_id: U.vitima.id }, { p_uid: U.vitima.id }, { id: U.vitima.id }]) tent.push(await D.rpc('sign_onboarding_done', body, atk.email));
    check('AC-B5 chamadas com id alheio no corpo: nenhuma função aceita (404, PGRST202)', tent.every((x) => x.status === 404), tent.map((x) => x.status));
    const ok = await Promise.all([U.atk1, U.atk2, U.atk3].map((a) => D.rpc('sign_onboarding_done', {}, a.email)));
    check('AC-B5 os 3 atacantes (chamada legítima) concluem só o próprio onboarding', ok.every((x) => x.status === 200 && x.body.email === email(parseInt(x.body.email.match(/onb(\d+)/)[1], 10))));
    check('AC-B5 a vítima não mudou (nem onboarding_done, nem updated_at)', JSON.stringify((await D.q(`select onboarding_done, phone_verified_at, updated_at from public.sign_identity where user_id = $1`, [U.vitima.id]))[0]) === antes);
    const rv = await D.rpc('sign_onboarding_done', {}, U.vitima.email);
    check('AC-B5 a própria vítima continua recusada (incompleta)', rv.status === 400 && msg(rv) === 'onboarding_incomplete');
  }

  sec('AC-B6 anon negado; e-mail não confirmado; grants explícitos');
  {
    const ra = await D.rpc('sign_onboarding_done', {});
    check('AC-B6 anon: permission denied (401)', ra.status === 401 && /permission denied/.test(msg(ra)), ra);
    const rc = await D.rpc('sign_onboarding_done', {}, U.naoConf.email);
    check('AC-B6 e-mail não confirmado: email_not_confirmed', rc.status === 400 && msg(rc) === 'email_not_confirmed', rc);
    for (const sig of ['sign_me()', 'sign_onboarding_done()', 'sign_phone_send(text,text)', 'sign_phone_verify(text)', 'sign_cert_challenge()']) {
      check(`AC-B6 grants ${sig}: anon não, public não, authenticated sim`, !(await priv(D, sig, 'anon')) && !(await pubGrant(D, sig)) && (await priv(D, sig, 'authenticated')), sig);
    }
    for (const sig of ['_sign_mask_cpf_text(text)', '_sign_outbox_purge()', '_sign_cpf_guarded_apply(uuid,text,text,text)']) {
      check(`AC-B6 interna ${sig}: sem execute para anon, authenticated e public`, !(await priv(D, sig, 'anon')) && !(await priv(D, sig, 'authenticated')) && !(await pubGrant(D, sig)), sig);
    }
    check('AC-B6 _sign_cert_take: só service_role (anon e authenticated não)', (await priv(D, '_sign_cert_take(uuid,text)', 'service_role')) && !(await priv(D, '_sign_cert_take(uuid,text)', 'anon')) && !(await priv(D, '_sign_cert_take(uuid,text)', 'authenticated')) && !(await pubGrant(D, '_sign_cert_take(uuid,text)')));
    const nds = (await D.q(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) and p.prosecdef and not (p.proconfig @> array['search_path=""'])`, [['sign_me', 'sign_onboarding_done', 'sign_phone_send', 'sign_phone_verify', 'sign_cert_challenge', '_sign_cert_take', '_sign_outbox_purge', '_sign_cpf_guarded_apply', '_sign_mask_cpf_text']])).map((x) => x.proname);
    check('SECURITY DEFINER com search_path vazio em todas as funções tocadas', nds.length === 0, nds);
  }

  sec('AC-B7 sign_me mantém o contrato anterior');
  {
    const antigas = ['email', 'name', 'cpf', 'name_hint', 'phone', 'phone_verified', 'phone_verified_at', 'cert', 'verified', 'onboarding_done', 'channels', 'cert_pending', 'companies', 'cpf_locked', 'profile_complete', 'contact_kind', 'cert_expired', 'cert_expired_at', 'otp_retry_after'];
    const sa = (await A.rpc('sign_me', {}, U.email.email)).body; const sd = (await D.rpc('sign_me', {}, U.email.email)).body;
    check('AC-B7 DEPOIS tem todas as chaves do ANTES (sem remover nenhuma) e contact_kind existe nos dois (veio da 1.5)', antigas.every((k) => k in sd) && Object.keys(sa).every((k) => k in sd) && 'contact_kind' in sa, [Object.keys(sa).filter((k) => !(k in sd)), Object.keys(sd).filter((k) => !(k in sa))]);
    check('AC-B7 sem chaves novas além das antigas', Object.keys(sd).length === Object.keys(sa).length, Object.keys(sd));
    check('AC-B7 contact_kind coerente: e-mail=email, celular=phone, nenhum=null', sd.contact_kind === 'email' && (await D.rpc('sign_me', {}, U.fone.email)).body.contact_kind === 'phone' && (await D.rpc('sign_me', {}, U.semVerif.email)).body.contact_kind === null);
  }

  // =========================================================================================================
  sec('AC-R5 (V6-01) sign_me.contact_kind coerente com o canal verificado');
  {
    const kinds = {}; for (const k of ['email', 'fone', 'semVerif', 'cert']) kinds[k] = (await D.rpc('sign_me', {}, U[k].email)).body.contact_kind;
    check('AC-R5 e-mail=email; celular=phone; sem verificação=null; só certificado=null', kinds.email === 'email' && kinds.fone === 'phone' && kinds.semVerif === null && kinds.cert === null, kinds);
  }

  // =========================================================================================================
  sec('AC-R1 (A15-M1) 40 sessões simultâneas alterando CPF: no máximo 5 cpf_in_use');
  {
    const dono = U.email; // dono do CPF disputado
    async function rodada(db, n) {
      const a = await mk(db.q, 100 + n, { nome: null, cpf: null, verif: 'email' });
      const clients = await Promise.all(Array.from({ length: 40 }, () => conn(db.db)));
      try {
        const t0 = Date.now();
        const rs = await Promise.all(clients.map((c) => callAs(c, a.id, `select public.sign_profile_save($1::jsonb) as r`, [JSON.stringify({ name: 'Pessoa Concorrente Teste', cpf: dono.cpf })])));
        const conta = {}; for (const x of rs) { const k = x.err ? 'erro:' + x.err.slice(0, 40) : x.r && x.r.error ? x.r.error : x.r && x.r.ok === false ? 'false' : 'ok'; conta[k] = (conta[k] || 0) + 1; }
        return { conta, ms: Date.now() - t0, inUse: conta.cpf_in_use || 0 };
      } finally { await Promise.all(clients.map((c) => c.end())); }
    }
    const aA = []; for (let i = 0; i < 3; i++) aA.push(await rodada(A, i));
    const dD = []; for (let i = 0; i < 3; i++) dD.push(await rodada(D, i));
    evid.cpf40 = { antes: aA, depois: dD };
    check('AC-R1 ANTES: o limite de 5 é furado (cpf_in_use > 5 em ao menos 1 de 3 rodadas)', Math.max(...aA.map((x) => x.inUse)) > 5, aA.map((x) => x.conta));
    check('AC-R1 DEPOIS: cpf_in_use <= 5 em todas as 3 rodadas, o resto too_many_attempts, nenhum erro', dD.every((x) => x.inUse <= 5 && x.inUse === 5 && (x.conta.too_many_attempts || 0) === 35), dD.map((x) => x.conta));
    res.lines.push(`  (medido) cpf_in_use em 40 sessões: ANTES ${aA.map((x) => x.inUse).join(', ')}; DEPOIS ${dD.map((x) => x.inUse).join(', ')}`);
  }

  // =========================================================================================================
  sec('AC-R2 (A15-M2) purga do outbox: queued antigos e sem code; sem pg_cron a migração roda sem erro');
  {
    check('AC-R2 sem pg_cron (banco DEPOIS): a migração rodou sem erro e não criou o schema cron', (await D.q(`select to_regclass('cron.job') is null as ok`))[0].ok);
    const uidx = U.email.id;
    const ins = (status, ageSql, code = true) => D.q(`insert into public.sign_outbox (user_id, channel, destination, template, params, status, created_at) values ($1, 'email', 'x@teste.example', 'otp', $2, $3, now() - ${ageSql}) returning id`, [uidx, JSON.stringify(code ? { code: '123456', minutes: 10 } : { minutes: 10 }), status]);
    await D.q(`delete from public.sign_outbox where user_id = $1`, [uidx]);
    const ids = {
      novo: (await ins('queued', `interval '2 minutes'`))[0].id,          // fica (ainda dentro da janela de entrega)
      meia: (await ins('queued', `interval '1 hour'`))[0].id,             // perde o code, continua queued
      velho: (await ins('queued', `interval '2 days'`))[0].id,            // vira failed, sem code
      muitoVelho: (await ins('queued', `interval '40 days'`))[0].id,      // fora da faixa de 30 dias: já tratado pela limpeza única (aqui simulado inserindo depois)
      enviado: (await ins('sent', `interval '3 hours'`))[0].id,           // inserido direto com code (não passou pelo gatilho)
    };
    const n = (await D.q(`select public._sign_outbox_purge() as n`))[0].n;
    const st = async (id) => (await D.q(`select status, params ? 'code' as code, error from public.sign_outbox where id = $1`, [id]))[0];
    const [sNovo, sMeia, sVelho, sEnviado] = [await st(ids.novo), await st(ids.meia), await st(ids.velho), await st(ids.enviado)];
    check('AC-R2 queued de 2 min fica como está (com code, para ainda poder ser entregue)', sNovo.status === 'queued' && sNovo.code === true);
    check('AC-R2 queued de 1 h perde o code e continua queued', sMeia.status === 'queued' && sMeia.code === false);
    check('AC-R2 queued de 2 dias vira failed, com motivo e sem code', sVelho.status === 'failed' && sVelho.code === false && !!sVelho.error, sVelho);
    check('AC-R2 sent com code antigo (fora do gatilho) perde o code', sEnviado.status === 'sent' && sEnviado.code === false);
    check('AC-R2 a purga devolve a contagem e não apaga nenhuma linha', n >= 3 && (await D.q(`select count(*)::int n from public.sign_outbox where user_id = $1`, [uidx]))[0].n === 5, n);
    { const cx = await conn(DB); const x1 = await callAs(cx, null, `select public._sign_outbox_purge() as r`, [], 'anon'); const x2 = await callAs(cx, uidx, `select public._sign_outbox_purge() as r`, []); await cx.end();
      check('AC-R2 a purga não é executável por anon nem authenticated', x1.err !== undefined && x2.err !== undefined, [x1, x2]); }
    // limpeza única da migração: queued > 30 dias é encerrada ao aplicar (aplicado a um banco com essa linha)
    await M.q(`insert into public.sign_outbox (user_id, channel, destination, template, params, status, created_at) values (null, 'email', 'x@teste.example', 'otp', '{"code":"999999"}', 'queued', now() - interval '40 days')`);
    psqlFile(DB_MEIO, MIG);
    const mv = (await M.q(`select status, params ? 'code' as code from public.sign_outbox where destination = 'x@teste.example' and created_at < now() - interval '30 days'`))[0];
    check('AC-R2 limpeza única da migração: queued de 40 dias vira failed e perde o code', mv.status === 'failed' && mv.code === false, mv);
  }
  {
    // pg_cron SIMULADO (extensão de teste com a mesma interface: cron.job, cron.schedule(nome, agenda, comando), cron.unschedule(nome) que ERRA se o job não existe)
    let ext = false;
    try {
      fs.writeFileSync(path.join(EXT_DIR, 'pg_cron.control'), `comment = 'pg_cron SIMULADO (so para teste do Lottus Sign)'\ndefault_version = '1.0'\nrelocatable = false\nschema = cron\n`);
      fs.writeFileSync(path.join(EXT_DIR, 'pg_cron--1.0.sql'), `create table cron.job (jobid bigserial primary key, schedule text not null, command text not null, jobname text unique);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as $$ begin delete from cron.job where jobname = job_name; if not found then raise exception 'could not find valid entry for job %', job_name; end if; return true; end $$;\n`);
      cleanups.push(() => { for (const f of ['pg_cron.control', 'pg_cron--1.0.sql']) { try { fs.unlinkSync(path.join(EXT_DIR, f)); } catch { /* já removido */ } } });
      ext = true;
    } catch (e) { res.lines.push('  (pg_cron simulado indisponível: ' + e.message + ')'); }
    if (ext) {
      await C.q(`create extension pg_cron`);
      psqlFile(DB_CRON, MIG);
      const j1 = await C.q(`select jobid, jobname, schedule, command from cron.job where jobname = 'lottus-sign-outbox-purge'`);
      psqlFile(DB_CRON, MIG);
      const j2 = await C.q(`select jobid, jobname, schedule, command from cron.job where jobname = 'lottus-sign-outbox-purge'`);
      check('AC-R2 com pg_cron (simulado): a 1ª aplicação deixa 1 job, a cada 15 min, chamando a purga', j1.length === 1 && j1[0].schedule === '*/15 * * * *' && /_sign_outbox_purge/.test(j1[0].command), j1);
      check('AC-R2 a 2ª aplicação continua com 1 job (desagenda e agenda de novo)', j2.length === 1 && (await C.q(`select count(*)::int n from cron.job`))[0].n === 1, j2);
      await C.q(j2[0].command);
      check('AC-R2 o comando do job roda sem erro', true);
      await C.q(`select cron.unschedule('lottus-sign-outbox-purge')`);
      check('AC-R2 o cron.unschedule da reversão remove o job (0 jobs)', (await C.q(`select count(*)::int n from cron.job`))[0].n === 0);
      // pg_cron presente mas sem o job: a 1ª aplicação não pode errar no unschedule (o simulado erra se não existe)
      check('AC-R2 pg_cron presente e job ausente: aplicar não erra (unschedule só se existir)', (() => { try { psqlFile(DB_CRON, MIG); return true; } catch (e) { return false; } })() && (await C.q(`select count(*)::int n from cron.job`))[0].n === 1);
    } else check('AC-R2 pg_cron simulado criado', false);
  }

  // =========================================================================================================
  sec('AC-R3 (A15-B2) deadlock verify(celular) x update de profiles.phone: ANTES reproduz, DEPOIS zero');
  {
    const P1 = '5511987651234', P2 = '5511987659999', P3 = '5511912340000';
    async function preparar(db, n) { return mk(db.q, 200 + n, { verif: 'phone' }); }
    async function reabrir(adm, u) {
      await adm.query(`update public.profiles set phone = $2 where id = $1`, [u.id, P1]);
      await adm.query(`update public.sign_identity set phone = $2, phone_verified_at = now(), phone_channel = 'whatsapp' where user_id = $1`, [u.id, P1]);
      await adm.query(`delete from public.sign_otps where user_id = $1`, [u.id]);
      const oid = (await adm.query(`select gen_random_uuid() as id`)).rows[0].id;
      await adm.query(`insert into public.sign_otps (id, user_id, purpose, channel, destination, code_hash, expires_at) values ($1::uuid, $2::uuid, 'phone_verify', 'whatsapp', $3, encode(extensions.digest('123456:' || $2::uuid::text || ':' || $1::uuid::text, 'sha256'), 'hex'), now() + interval '10 minutes')`, [oid, u.id, P2]);
      return oid;
    }
    const verify = (c, u) => callAs(c, u.id, `select public.sign_phone_verify('123456') as r`, []);
    const upd = async (c, u) => { try { await c.query('begin'); await c.query(`update public.profiles set phone = $2 where id = $1`, [u.id, P3]); await c.query('commit'); return {}; } catch (e) { await c.query('rollback').catch(() => {}); return { err: String(e.message), code: e.code }; } };
    async function prova(db, rotulo) {
      const u = await preparar(db, rotulo === 'antes' ? 1 : 2);
      const adm = await conn(db.db), ca = await conn(db.db), cb = await conn(db.db), cc = await conn(db.db);
      for (const c of [adm, ca, cb, cc]) await c.query(`set deadlock_timeout = '50ms'`);
      const pidA = (await ca.query('select pg_backend_pid() as p')).rows[0].p, pidB = (await cb.query('select pg_backend_pid() as p')).rows[0].p;
      const esperaLock = async (pid) => { for (let i = 0; i < 100; i++) { const r = await adm.query(`select wait_event_type from pg_stat_activity where pid = $1`, [pid]); if (r.rows[0] && r.rows[0].wait_event_type === 'Lock') return true; await sleep(20); } return false; };
      const out = { det: { dead: 0, reps: 0, verifyOk: 0, travou: 0 }, rnd: { dead: 0, reps: 200, verifyOk: 0, outros: 0 } };
      try {
        // (1) determinístico: um 3º cliente segura a linha do OTP; A (verify) trava no OTP já com seus locks; B (update de profiles) entra no meio; solta
        for (let i = 0; i < 5; i++) {
          const oid = await reabrir(adm, u);
          await cc.query('begin'); await cc.query(`select 1 from public.sign_otps where id = $1 for update`, [oid]);
          const pa = verify(ca, u); const aTravou = await esperaLock(pidA);
          const pb = upd(cb, u); const bTravou = await esperaLock(pidB);
          await cc.query('commit');
          const [ra, rb] = await Promise.all([pa, pb]);
          out.det.reps++; if (aTravou && bTravou) out.det.travou++;
          if ((ra.code === '40P01') || (rb.code === '40P01')) out.det.dead++;
          if (ra.r && ra.r.ok === true) out.det.verifyOk++;
        }
        // (2) corrida livre, 200 repetições, com pequeno atraso aleatório (0 a 3 ms) do update
        for (let i = 0; i < 200; i++) {
          await reabrir(adm, u);
          const [ra, rb] = await Promise.all([verify(ca, u), sleep(Math.random() * 3).then(() => upd(cb, u))]);
          if (ra.code === '40P01' || rb.code === '40P01') out.rnd.dead++;
          else if ((ra.err && ra.code !== '40P01') || (rb.err && rb.code !== '40P01')) out.rnd.outros++;
          if (ra.r && ra.r.ok === true) out.rnd.verifyOk++;
        }
      } finally { for (const c of [adm, ca, cb, cc]) await c.end(); }
      return out;
    }
    const pa = await prova(A, 'antes');
    const pd = await prova(D, 'depois');
    evid.deadlock = { antes: pa, depois: pd };
    check('AC-R3 ANTES (determinístico, 5 repetições): A e B esperaram o lock e o deadlock 40P01 ocorreu em todas', pa.det.travou === 5 && pa.det.dead === 5, pa.det);
    check('AC-R3 ANTES (corrida livre, 200 repetições): ao menos 1 deadlock 40P01', pa.rnd.dead >= 1, pa.rnd);
    check('AC-R3 DEPOIS (determinístico, 5 repetições): zero deadlocks e o verify conclui nas 5', pd.det.dead === 0 && pd.det.verifyOk === 5 && pd.det.travou === 5, pd.det);
    check('AC-R3 DEPOIS (corrida livre, 200 repetições): zero deadlocks, nenhum outro erro e o verify conclui nas 200', pd.rnd.dead === 0 && pd.rnd.outros === 0 && pd.rnd.verifyOk === 200, pd.rnd);
    res.lines.push(`  (medido) deadlocks: ANTES determinístico ${pa.det.dead}/5, livre ${pa.rnd.dead}/200; DEPOIS determinístico ${pd.det.dead}/5, livre ${pd.rnd.dead}/200`);
  }

  // =========================================================================================================
  sec('AC-R4 (A15-N) o topo da migração lista o que NÃO reverte');
  {
    const topo = fs.readFileSync(MIG, 'utf8').split('\n').slice(0, 20).join('\n');
    const linhas = topo.split('\n').filter((l) => /^--\s+NÃO REVERTE:/.test(l));
    check('AC-R4 pelo menos 5 linhas "NÃO REVERTE:" no cabeçalho (grep)', linhas.length >= 5, linhas.length);
    for (const [rot, re] of [['constraint de canal NOT VALID', /sign_outbox_channel_check.*NOT VALID/], ['colunas otp_locked_until e bound_at', /otp_locked_until.*bound_at/], ['índice', /sign_outbox_created_at_idx/], ['revokes de tabela', /revokes de tabela/],
      ['remoção do code do outbox (irreversível)', /'code'.*IRREVERSÍVEL/], ['OTPs em voo deixam de valer', /OTPs em voo.*deixam de valer/], ['cron.unschedule da purga', /cron\.unschedule/], ['perda do conteúdo do outbox já limpo', /não voltam a queued|já limpo/]]) {
      check(`AC-R4 cabeçalho cita: ${rot}`, linhas.some((l) => re.test(l)), rot);
    }
    check('AC-R4 cabeçalho tem plano de reversão e "NÃO aplicada"', /Como reverter/.test(topo + fs.readFileSync(MIG, 'utf8').slice(0, 6000)) && /NÃO APLICADA/.test(topo));
    check('AC-R4 nenhum cron.schedule fora do bloco condicional de pg_cron', (() => { const s = fs.readFileSync(MIG, 'utf8').replace(/^--.*$/gm, ''); const i = s.indexOf('cron.schedule'); return i > s.indexOf("extname = 'pg_cron'") && i > 0; })());
  }

  // =========================================================================================================
  sec('AC-R6 (V6-03) enviar código por e-mail não derruba a verificação existente; só o novo contato confirmado a substitui');
  {
    const codigo = async (db, u) => (await db.q(`select params ->> 'code' as c from public.sign_outbox where user_id = $1 order by id desc limit 1`, [u.id]))[0].c;
    const estado = async (db, u) => (await db.q(`select phone, phone_verified_at is not null as v, phone_channel from public.sign_identity where user_id = $1`, [u.id]))[0];
    for (const [db, nome] of [[A, 'ANTES'], [D, 'DEPOIS']]) {
      const u = await mk(db.q, 60, { verif: 'phone' });
      await db.fake.loadUsers();
      const e0 = await estado(db, u);
      const s = await db.rpc('sign_phone_send', { p_phone: '', p_channel: 'email' }, u.email);
      const e1 = await estado(db, u);
      if (nome === 'ANTES') check('AC-R6 ANTES: enviar por e-mail derruba phone_verified_at e phone_channel (prova do defeito)', s.status === 200 && e0.v === true && e1.v === false && e1.phone_channel === null, [e0, e1]);
      else {
        check('AC-R6 DEPOIS: enviar por e-mail NÃO muda phone, phone_verified_at nem phone_channel', s.status === 200 && s.body.ok === true && e1.v === true && e1.phone === e0.phone && e1.phone_channel === e0.phone_channel && (await db.rpc('sign_me', {}, u.email)).body.verified === true, [e0, e1]);
        const v = await db.rpc('sign_phone_verify', { p_code: await codigo(db, u) }, u.email);
        const e2 = await estado(db, u);
        check('AC-R6 DEPOIS: confirmar o código passa a verificação ao novo contato (e-mail): channel email, contact_kind email', v.status === 200 && v.body.ok === true && e2.v === true && e2.phone_channel === 'email' && v.body.contact_kind === 'email', [e2, v.body.contact_kind]);
      }
    }
    // celular novo (WhatsApp ligado só no banco de teste): enviar não altera o e-mail verificado; confirmar grava phone, channel e o perfil
    await D.q(`update public.sign_messaging_config set whatsapp_enabled = true where id = 1`);
    const w = await mk(D.q, 61, { verif: 'email' }); await D.fake.loadUsers();
    const s = await D.rpc('sign_phone_send', { p_phone: '(11) 98765-4321', p_channel: 'whatsapp' }, w.email);
    const ew = await estado(D, w);
    check('AC-R6 DEPOIS: enviar por WhatsApp não grava o número nem derruba o e-mail verificado', s.status === 200 && s.body.ok === true && ew.v === true && ew.phone_channel === 'email' && ew.phone === null, [s.body, ew]);
    const vw = await D.rpc('sign_phone_verify', { p_code: await codigo(D, w) }, w.email);
    const ew2 = await estado(D, w);
    check('AC-R6 DEPOIS: confirmar o código do celular grava phone, phone_verified_at e canal do novo contato; contact_kind phone', vw.status === 200 && vw.body.ok === true && ew2.v === true && ew2.phone === '5511987654321' && ew2.phone_channel === 'whatsapp' && vw.body.contact_kind === 'phone', [ew2, vw.body]);
    await D.q(`update public.sign_messaging_config set whatsapp_enabled = false where id = 1`);
    // RN7 continua: telefone alterado FORA do Sign derruba a verificação por celular (e não a por e-mail)
    for (const [db, nome] of [[A, 'ANTES'], [D, 'DEPOIS']]) {
      const f = await mk(db.q, 62, { verif: 'phone' }); const g = await mk(db.q, 63, { verif: 'email' });
      await db.q(`update public.profiles set phone = '5511987651234' where id = $1`, [f.id]); await db.q(`update public.profiles set phone = '5511987651234' where id = $1`, [g.id]);
      await db.q(`update public.profiles set phone = '5511900001111' where id = any($1)`, [[f.id, g.id]]);
      const ef = await estado(db, f), eg = await estado(db, g);
      check(`AC-R6 RN7 (${nome}): mudar profiles.phone fora do Sign derruba a verificação por celular e mantém a por e-mail`, ef.v === false && eg.v === true, [ef, eg]);
    }
  }

  // =========================================================================================================
  sec('AC-R8 (V6-05) CPF no titular do certificado: mascarado no servidor');
  {
    const m = async (t) => (await D.q(`select public._sign_mask_cpf_text($1) as r`, [t]))[0].r;
    check('V6-05 CPF colado: CN=NOME:12345678909 -> •••.456.789-••', (await m('CN=FULANO DE TAL:52998224725')) === 'CN=FULANO DE TAL:•••.982.247-••', await m('CN=FULANO DE TAL:52998224725'));
    check('V6-05 CPF formatado também é mascarado', (await m('CN=X 529.982.247-25')) === 'CN=X •••.982.247-••', await m('CN=X 529.982.247-25'));
    check('V6-05 CNPJ de 14 dígitos e números curtos não são alterados', (await m('O=EMPRESA:11222333000181 e 1234567')) === 'O=EMPRESA:11222333000181 e 1234567', await m('O=EMPRESA:11222333000181 e 1234567'));
    check('V6-05 texto sem CPF e null passam sem erro', (await m('CN=Sem Numero')) === 'CN=Sem Numero' && (await m(null)) === null);
    const sa = (await A.rpc('sign_me', {}, U.cert.email)).body, sd = (await D.rpc('sign_me', {}, U.cert.email)).body;
    check('V6-05 ANTES: sign_me.cert.subject traz o CPF inteiro (prova do defeito)', sa.cert && sa.cert.subject.includes(U.cert.cpf), sa.cert);
    check('V6-05 DEPOIS: sign_me.cert.subject sem os 11 dígitos; demais campos do certificado intactos', sd.cert && !/\d{11}/.test(sd.cert.subject) && sd.cert.issuer === 'AC Exemplo' && sd.cert.serial === '0A1B' && sd.cert.cpf === U.cert.cpf, sd.cert);
  }

  // =========================================================================================================
  sec('AC-R9 (V6-08) texto do desafio do servidor com acentos, igual em sign_cert_challenge e _sign_cert_take');
  {
    const ra = await A.rpc('sign_cert_challenge', {}, U.email.email);
    const rd = await D.rpc('sign_cert_challenge', {}, U.email.email);
    const SEM = /\b(vinculo|codigo|verificacao|certificacao|validacao|autenticacao|autorizacao|assinatura digital)\b/i; // palavras que exigem acento (assinatura não exige)
    check('AC-R9 ANTES: o texto sai sem acento (prova do defeito)', ra.status === 200 && /vinculo/.test(ra.body.text) && /Codigo/.test(ra.body.text), ra.body.text);
    check('AC-R9 DEPOIS: "vínculo" e "Código" com acento; nenhuma palavra da lista sem acento', rd.status === 200 && /vínculo/.test(rd.body.text) && /Código/.test(rd.body.text) && !SEM.test(rd.body.text), rd.body.text);
    const todas = JSON.stringify(rd.body).replace(/"nonce":"[0-9a-f]+"/, '');
    check('AC-R9 DEPOIS: nenhum outro texto do retorno sem acento', !SEM.test(todas), todas);
    const take = (await D.q(`select public._sign_cert_take($1, $2) as r`, [U.email.id, rd.body.nonce]))[0].r;
    check('AC-R9 DEPOIS: _sign_cert_take devolve exatamente o mesmo texto (a borda confere o que o usuário assinou)', take && take.text === rd.body.text, [take && take.text, rd.body.text]);
    check('AC-R9 DEPOIS: o texto cabe em UTF-8 sem perda (ida e volta)', Buffer.from(rd.body.text, 'utf8').toString('utf8') === rd.body.text);
  }

  // =========================================================================================================
  sec('AC-R10 (V6-09) a purga usa o índice sign_outbox_created_at_idx (200 mil linhas)');
  {
    async function carga(db) {
      await db.q(`delete from public.sign_outbox where destination = 'bulk@teste.example'`);
      await db.q(`insert into public.sign_outbox (user_id, channel, destination, template, params, status, created_at) select null, 'email', 'bulk@teste.example', 'otp', '{"minutes":10}', 'sent', now() - (g * 2.6 || ' minutes')::interval from generate_series(1, 200000) g`);
      await db.q(`insert into public.sign_outbox (user_id, channel, destination, template, params, status, created_at) select null, 'email', 'bulk@teste.example', 'otp', '{"code":"123456"}', 'queued', now() - (g * 3 || ' hours')::interval from generate_series(1, 12) g`);
      await db.q(`analyze public.sign_outbox`);
    }
    const plano = async (db, sql) => (await db.q(`explain (costs off) ${sql}`)).map((x) => x['QUERY PLAN']).join('\n');
    const S1 = `update public.sign_outbox set status = 'failed', params = params - 'code' where status = 'queued' and created_at < now() - interval '1 day' and created_at >= now() - interval '30 days'`;
    const S2 = `update public.sign_outbox set params = params - 'code' where params ? 'code' and created_at < now() - interval '15 minutes' and created_at >= now() - interval '1 day'`;
    await carga(C); await carga(A);
    const pC1 = await plano(C, S1), pC2 = await plano(C, S2), pA1 = await plano(A, S1);
    evid.explain = { depois_s1: pC1, depois_s2: pC2, antes_s1: pA1 };
    check('AC-R10 DEPOIS: a 1ª consulta da purga (queued > 1 dia) usa sign_outbox_created_at_idx', /sign_outbox_created_at_idx/.test(pC1), pC1);
    check('AC-R10 DEPOIS: a 2ª consulta (code de 15 min a 1 dia) usa sign_outbox_created_at_idx', /sign_outbox_created_at_idx/.test(pC2), pC2);
    check('AC-R10 ANTES (sem o índice): varredura sequencial na tabela inteira (prova da diferença)', /Seq Scan on sign_outbox/.test(pA1) && !/created_at_idx/.test(pA1), pA1);
    const t0 = Date.now(); await C.q(`select public._sign_outbox_purge()`); const ms = Date.now() - t0;
    check('AC-R10 a purga completa roda em < 200 ms com 200 mil linhas', ms < 200, ms);
    evid.purgaMs = ms;
    await C.q(`delete from public.sign_outbox where destination = 'bulk@teste.example'`); await A.q(`delete from public.sign_outbox where destination = 'bulk@teste.example'`);
  }

  // =========================================================================================================
  sec('Idempotência (2x) e reversão (banco MEIO = esquema + 1.4 + 1.5; a migração já foi aplicada 1x acima na limpeza única)');
  {
    // volta o MEIO ao estado "sem a migração" para provar o ciclo completo
    cp.execFileSync(path.join(ROOT, 'scripts/sign-local/reset.sh'), ['depois'], { env: env({ SIGN_DB: DB_MEIO, SIGN_SO_ATE: '1.5' }), encoding: 'utf8' });
    const M2 = await banco(DB_MEIO);
    await M2.q(`insert into public.sign_outbox (user_id, channel, destination, template, params, status, created_at) values (null, 'email', 'velho@teste.example', 'otp', '{"code":"555555"}', 'queued', now() - interval '3 days')`);
    const rev = path.join(tmp, 'reversao-1-3.sql');
    cp.execFileSync(path.join(ROOT, 'scripts/sign-local/gerar-reversao-1-3.sh'), [DB_MEIO, rev], { encoding: 'utf8' });
    check('reversão gerada FORA do repositório com as 8 funções', (fs.readFileSync(rev, 'utf8').match(/CREATE OR REPLACE FUNCTION/g) || []).length === 8 && !rev.startsWith(ROOT));
    check('o gerador recusa gravar dentro do repositório', (() => { try { cp.execFileSync(path.join(ROOT, 'scripts/sign-local/gerar-reversao-1-3.sh'), [DB_MEIO, path.join(ROOT, 'x-rev.sql')], { stdio: 'pipe' }); return false; } catch (e) { return e.status === 2; } })());
    const s0 = await snap(M2);
    psqlFile(DB_MEIO, MIG);
    await M2.q(`select public._sign_outbox_purge()`);   // a purga (agendada em produção) encerra a linha queued de 3 dias
    const s1 = await snap(M2);
    const dados1 = JSON.stringify(await M2.q(`select count(*)::int n, count(*) filter (where status = 'failed')::int f from public.sign_outbox`));
    psqlFile(DB_MEIO, MIG);
    const s2 = await snap(M2);
    const dados2 = JSON.stringify(await M2.q(`select count(*)::int n, count(*) filter (where status = 'failed')::int f from public.sign_outbox`));
    check('idem: 2ª aplicação sem erro; definições e ACLs de todas as funções idênticas às da 1ª', JSON.stringify(s1) === JSON.stringify(s2));
    check('idem: dados idênticos na 2ª aplicação; 1 índice sign_outbox_created_at_idx', dados1 === dados2 && (await M2.q(`select count(*)::int n from pg_indexes where indexname = 'sign_outbox_created_at_idx'`))[0].n === 1, [dados1, dados2]);
    const mudou = Object.keys(s1).filter((k) => !s0[k] || s0[k].d !== s1[k].d).sort();
    check('a migração muda/cria só as 9 funções esperadas', JSON.stringify(mudou) === JSON.stringify([...FN8, '_sign_mask_cpf_text(text)'].sort()), mudou);
    const acl = FN8.filter((f) => s0[f] && s0[f].acl !== s1[f].acl);
    check('ACLs das funções já existentes não mudam (só o que a migração decide: grants iguais aos de antes)', acl.length === 0, acl.map((f) => [f, s0[f].acl, s1[f].acl]));
    check('a migração não deixou grant para public/anon em nenhuma função nova ou alterada', (await Promise.all([...FN8, '_sign_mask_cpf_text(text)'].map((f) => pubGrant(M2, f)))).every((x) => x === false));
    // reversão
    psqlFile(DB_MEIO, rev);
    const s3 = await snap(M2);
    check('rev: reversão aplicada sem erro; as 8 funções voltam à definição anterior (hash idêntico)', FN8.every((f) => s3[f] && s0[f] && s3[f].d === s0[f].d), FN8.filter((f) => !(s3[f] && s0[f] && s3[f].d === s0[f].d)));
    check('rev: função interna e índice criados pela migração removidos; nenhuma função a mais nem a menos', !s3['_sign_mask_cpf_text(text)'] && Object.keys(s3).length === Object.keys(s0).length && (await M2.q(`select count(*)::int n from pg_indexes where indexname = 'sign_outbox_created_at_idx'`))[0].n === 0);
    check('rev: o que NÃO reverte, não reverteu: a linha queued velha continua failed e sem code (limpeza irreversível, como o cabeçalho diz)', (await M2.q(`select status, params ? 'code' as c from public.sign_outbox where destination = 'velho@teste.example'`))[0].status === 'failed');
    check('rev: depois da reversão sign_onboarding_done volta a aceitar perfil incompleto (comportamento antigo)', await (async () => { const x = await mk(M2.q, 70, { nome: null, cpf: null }); await M2.fake.loadUsers(); const r = await M2.rpc('sign_onboarding_done', {}, x.email); return r.status === 200; })());
    psqlFile(DB_MEIO, MIG);
    const s4 = await snap(M2);
    check('rev: reaplicar a migração depois da reversão volta ao mesmo estado', JSON.stringify(s4) === JSON.stringify(s1));
    await M2.close();
  }

  // =========================================================================================================
  sec('Desempenho (tempo ponta a ponta pelo Supabase falso, sequencial; 100 chamadas)');
  {
    // base de carga: 10 mil perfis completos e verificados (só neste teste; removidos no fim)
    await D.q(`insert into auth.users (id, email, encrypted_password) select ('ee000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'carga' || g || '@carga.example', 'x' from generate_series(1, 10000) g`);
    await D.q(`insert into public.profiles (id, full_name, cpf) select ('ee000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'Pessoa Carga ' || g, lpad((50000000000 + g)::text, 11, '0') from generate_series(1, 10000) g`);
    await D.q(`insert into public.sign_identity (user_id, phone_verified_at, phone_channel, onboarding_done) select ('ee000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, now(), 'email', false from generate_series(1, 10000) g`);
    const alvo = await mk(D.q, 80, { verif: 'email', done: false }); await D.fake.loadUsers();
    const tmeV = [], tdone = [];
    for (let i = 0; i < 100; i++) { let t0 = process.hrtime.bigint(); await D.rpc('sign_me', {}, alvo.email); tmeV.push(Number(process.hrtime.bigint() - t0) / 1e6); t0 = process.hrtime.bigint(); await D.rpc('sign_onboarding_done', {}, alvo.email); tdone.push(Number(process.hrtime.bigint() - t0) / 1e6); }
    evid.p95 = { sign_me_ms: p95(tmeV), sign_onboarding_done_ms: p95(tdone) };
    check('sign_me p95 <= 150 ms (meta da spec; ponta a ponta, 10 mil perfis)', p95(tmeV) <= 150, p95(tmeV));
    check('sign_onboarding_done p95 <= 150 ms (ponta a ponta, 10 mil perfis)', p95(tdone) <= 150, p95(tdone));
    res.lines.push(`  (medido) p95 sign_me ${p95(tmeV).toFixed(1)} ms; sign_onboarding_done ${p95(tdone).toFixed(1)} ms`);
    const ex = async (sql, p) => (await D.q(`explain (analyze, buffers, costs off) ${sql}`, p)).map((x) => x['QUERY PLAN']).join('\n');
    evid.explainOnb = {
      profiles_pk: await ex(`select * from public.profiles where id = 'ee000000-0000-4000-8000-000000000500'`),
      identity_pk: await ex(`select * from public.sign_identity where user_id = 'ee000000-0000-4000-8000-000000000500'`),
    };
    check('EXPLAIN das consultas de sign_onboarding_done: leitura por chave (sem Seq Scan) em profiles e sign_identity', !/Seq Scan/.test(evid.explainOnb.profiles_pk + evid.explainOnb.identity_pk), evid.explainOnb);
    await D.q(`delete from auth.users where email like '%@carga.example'`);
  }

  // ---- evidências em arquivos ----
  fs.writeFileSync(path.join(EVID, 'p95-1-3.txt'), `sign_me p95 (ponta a ponta, sequencial, 10 mil perfis): ${evid.p95.sign_me_ms.toFixed(1)} ms\nsign_onboarding_done p95: ${evid.p95.sign_onboarding_done_ms.toFixed(1)} ms\nPurga do outbox com 200 mil linhas: ${evid.purgaMs} ms\n`);
  fs.writeFileSync(path.join(EVID, 'explain-1-3.txt'), `# Purga (consulta 1, banco DEPOIS)\n${evid.explain.depois_s1}\n\n# Purga (consulta 2, banco DEPOIS)\n${evid.explain.depois_s2}\n\n# Purga (consulta 1, banco ANTES, sem o índice)\n${evid.explain.antes_s1}\n\n# sign_onboarding_done: leitura por chave\n${evid.explainOnb.profiles_pk}\n${evid.explainOnb.identity_pk}\n`);
  fs.writeFileSync(path.join(EVID, 'concorrencia-1-3.txt'), `CPF, 40 sessões simultâneas (3 rodadas):\n ANTES  ${JSON.stringify(evid.cpf40.antes.map((x) => x.conta))}\n DEPOIS ${JSON.stringify(evid.cpf40.depois.map((x) => x.conta))}\n\nDeadlock verify x update de profiles.phone:\n ANTES  ${JSON.stringify(evid.deadlock.antes)}\n DEPOIS ${JSON.stringify(evid.deadlock.depois)}\n`);

  for (const c of cleanups) c();
  await Promise.all([A, D, M, C].map((x) => x.close()));
  for (const db of [DB_CRON]) { try { cp.execFileSync('psql', ['-X', '-q', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-c', `drop database if exists ${db} with (force)`]); } catch { /* ok */ } }
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
