// Ciclo 2 da 1.3 (pacote C2-13), BANCO: AC-R1 (M-01, nome só de invisíveis) e AC-R7 (B-6/A13-B3, purga do outbox), mais idempotência 2x, reversão,
// grants e contrato de sign_me. Postgres LOCAL real, RPCs chamadas como o PostgREST faz. Nada em produção.
// Bancos ISOLADOS (SIGN_DB e SIGN_DB_ANTES SEMPRE exportados; nunca o "sign" compartilhado):
//   ANTES  = SIGN_DB_ANTES: esquema + 1.4 + 1.5 + 1.3 (20261128120000), SEM a migração nova  -> prova os defeitos
//   DEPOIS = SIGN_DB:       tudo, inclusive 20261129120000                                      -> prova as correções
//   MEIO   = SIGN_DB_meio:  como ANTES (a migração é aplicada 2x e revertida no teste)
// Uso: SIGN_DB=sign_c2 SIGN_DB_ANTES=sign_c2_antes node t-ciclo2-13-db.cjs
const { check, done, res } = require('./lib.cjs');
const { banco, reset, psqlFile, DB, DB_ANTES, ROOT, PORT } = require('./perfil-lib.cjs');
if (!process.env.SIGN_DB || !process.env.SIGN_DB_ANTES) { console.error('defina SIGN_DB e SIGN_DB_ANTES (bancos isolados do teste; nunca use o "sign" compartilhado)'); process.exit(2); }
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mk } = require('./onb-lib.cjs');
const MIG = path.join(ROOT, 'supabase/migrations/20261129120000_sign_ciclo2_1_3.sql');
const DB_MEIO = DB + '_meio';
const sec = (n) => res.lines.push('# ' + n);
const snap = async (db) => (await db.q(`select p.oid::regprocedure::text as sig, md5(pg_get_functiondef(p.oid)) as d, coalesce(p.proacl::text, '') as acl from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).reduce((m, x) => { m[x.sig] = x; return m; }, {});
const priv = async (db, sig, role) => (await db.q(`select has_function_privilege($1, ('public.' || $2)::regprocedure, 'execute') as ok`, [role, sig]))[0].ok;
const pubGrant = async (db, sig) => (await db.q(`select exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = ('public.' || $1)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') as ok`, [sig]))[0].ok;
const FN3 = ['sign_me()', 'sign_onboarding_done()', '_sign_outbox_purge()'];
const NOVAS = ['_sign_name_ok(text)', '_sign_name_visible(text)'];

(async () => {
  console.info('recriando bancos locais isolados (ANTES, DEPOIS, MEIO)...');
  reset('antes13');
  reset('depois');
  const env = (extra) => ({ ...process.env, SIGN_SCHEMA: process.env.SIGN_SCHEMA || '/root/sign-schema.sql', ...extra });
  cp.execFileSync(path.join(ROOT, 'scripts/sign-local/reset.sh'), ['depois'], { env: env({ SIGN_DB: DB_MEIO, SIGN_SO_ATE: '1.3' }), encoding: 'utf8' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-c2-13-'));
  const A = await banco(DB_ANTES);
  const D = await banco(DB);
  const M = await banco(DB_MEIO);

  // =========================================================================================================
  sec('AC-R1 (M-01): nome só com invisíveis e espaços');
  {
    const Z = '​';
    // [rótulo, nome, ANTES aceitava? (só quando há espaço comum no meio: \s do Postgres não casa os invisíveis), DEPOIS esperado]
    const casos = [
      ['só U+200B (com espaço entre eles)', `${Z} ${Z}`, true, false],
      ['só U+2060 (com espaço entre eles)', '⁠ ⁠', true, false],
      ['só U+FEFF (com espaço entre eles)', '﻿ ﻿', true, false],
      ['U+200C, U+200D e U+00AD misturados', '‌ ‍ ­', true, false],
      ['U+180E (com espaço)', '᠎ ᠎', true, false],
      ['"Ana" + espaço + U+200B (1 palavra visível)', `Ana ${Z}`, true, false],
      ['só U+200B, sem espaço', `${Z}${Z}${Z}`, false, false],
      ['só U+2060, sem espaço', '⁠⁠⁠', false, false],
      ['só U+FEFF, sem espaço', '﻿﻿﻿', false, false],
      ['só espaços', '     ', false, false],
      ['"Ana" + U+200B, 1 palavra', `Ana${Z}`, false, false],
      ['nome válido "Ana Souza"', 'Ana Souza', true, true],
      ['"Ana" U+200B "Souza": 2 palavras reais com invisível (continua valendo)', `Ana${Z} Souza`, true, true],
    ];
    let n = 300;
    for (const [rot, nome, antesAceita, depoisEsp] of casos) {
      n += 1;
      for (const X of [A, D]) { await mk(X.q, n, { nome, verif: 'email' }); await X.fake.loadUsers(); }
      const em = `onb${n}@teste.example`;
      const ma = (await A.rpc('sign_me', {}, em)).body;
      const md = (await D.rpc('sign_me', {}, em)).body;
      check(`ANTES [${rot}]: profile_complete=${antesAceita}`, ma && ma.profile_complete === antesAceita, ma && ma.profile_complete);
      check(`DEPOIS [${rot}]: profile_complete=${depoisEsp}`, md && md.profile_complete === depoisEsp, md && md.profile_complete);
      const da = await A.rpc('sign_onboarding_done', {}, em);
      const dd = await D.rpc('sign_onboarding_done', {}, em);
      check(`ANTES [${rot}]: sign_onboarding_done ${antesAceita ? 'ACEITA (prova da falha)' : 'recusa'}`, antesAceita ? da.status === 200 && da.body.onboarding_done === true : da.status === 400 && /onboarding_incomplete/.test(da.msg), [da.status, da.msg]);
      check(`DEPOIS [${rot}]: sign_onboarding_done ${depoisEsp ? 'aceita' : 'recusa com onboarding_incomplete'}`, depoisEsp ? dd.status === 200 && dd.body.onboarding_done === true : dd.status === 400 && /onboarding_incomplete/.test(dd.msg), [dd.status, dd.msg]);
      if (!depoisEsp) check(`DEPOIS [${rot}]: nada foi gravado (onboarding_done continua false)`, (await D.q(`select coalesce(onboarding_done, false) as d from public.sign_identity where user_id = (select id from auth.users where email = $1)`, [em]))[0].d === false);
    }
    // contrato: a migração não troca nenhuma chave de sign_me
    const ma = (await A.rpc('sign_me', {}, 'onb301@teste.example')).body; const md = (await D.rpc('sign_me', {}, 'onb301@teste.example')).body;
    check('contrato: sign_me tem exatamente as mesmas chaves antes e depois', JSON.stringify(Object.keys(ma).sort()) === JSON.stringify(Object.keys(md).sort()), [Object.keys(ma).sort(), Object.keys(md).sort()]);
    // a conta de verdade (nome real) segue igual nas duas versões, em todos os campos
    const ra = (await A.rpc('sign_me', {}, 'onb312@teste.example')).body; const rd = (await D.rpc('sign_me', {}, 'onb312@teste.example')).body;
    check('conta com nome válido: sign_me idêntico antes e depois (todos os campos, exceto marcas de tempo)', JSON.stringify({ ...ra, phone_verified_at: 0 }) === JSON.stringify({ ...rd, phone_verified_at: 0 }));
    // NÃO REVERTE: conta que já concluiu antes da migração continua com done=true (só o gate novo vale daqui em diante)
    await mk(D.q, 330, { nome: `${Z} ${Z}`, verif: 'email', done: true }); await D.fake.loadUsers();
    const velho = (await D.rpc('sign_me', {}, 'onb330@teste.example')).body;
    check('NÃO REVERTE: conta antiga com onboarding_done=true e nome só de invisíveis continua done=true; profile_complete=false', velho.onboarding_done === true && velho.profile_complete === false, [velho.onboarding_done, velho.profile_complete]);
    // a medição não altera o que é gravado
    check('_sign_name_norm não mudou: o nome gravado segue como o usuário digitou', (await D.q(`select public._sign_name_norm(E'Ana\\u200B  Souza') as v`))[0].v === 'Ana​ Souza');
    check('_sign_name_visible: tira invisíveis, colapsa e apara', (await D.q(`select public._sign_name_visible(E'  \\u200BAna\\u2060   Sou\\uFEFFza\\u00AD ') as v`))[0].v === 'Ana Souza');
    check('_sign_name_ok: nulo e vazio são falsos; 140 visíveis valem; 141 não', (await D.q(`select public._sign_name_ok(null) a, public._sign_name_ok('') b, public._sign_name_ok(repeat('a', 69) || ' ' || repeat('b', 70)) c, public._sign_name_ok(repeat('a', 70) || ' ' || repeat('b', 70)) d`)).every((r) => r.a === false && r.b === false && r.c === true && r.d === false));
  }

  // =========================================================================================================
  sec('AC-R7 (B-6 e A13-B3): purga do outbox limpa o código de qualquer linha com mais de 15 min, em todos os estados');
  {
    const ages = [['10 min', '10 minutes'], ['20 min', '20 minutes'], ['2 dias', '2 days'], ['40 dias', '40 days']];
    const sts = ['queued', 'sent', 'failed'];
    const semear = async (X) => {
      await X.q(`delete from public.sign_outbox where destination like 'purga-%'`);
      for (const st of sts) for (const [rot, iv] of ages) {
        await X.q(`insert into public.sign_outbox (channel, destination, template, params, status, created_at) values ('email', $1, 'otp', '{"code":"123456","otp_id":"x"}', $2, now() - $3::interval)`, [`purga-${st}-${rot.replace(' ', '')}@teste.example`, st, iv]);
      }
    };
    const estado = async (X) => (await X.q(`select destination, status, params ? 'code' as code from public.sign_outbox where destination like 'purga-%' order by destination`)).reduce((m, r) => { m[r.destination.replace('purga-', '').replace('@teste.example', '')] = r; return m; }, {});
    for (const X of [A, D]) await semear(X);
    const totA0 = (await A.q(`select count(*)::int n from public.sign_outbox`))[0].n;
    const totD0 = (await D.q(`select count(*)::int n from public.sign_outbox`))[0].n;
    const nA = (await A.q(`select public._sign_outbox_purge() as n`))[0].n;
    const nD = (await D.q(`select public._sign_outbox_purge() as n`))[0].n;
    const ea = await estado(A); const ed = await estado(D);
    const comCodigoAntes = Object.entries(ea).filter(([k, r]) => r.code && !/10min/.test(k)).map(([k]) => k);
    check('ANTES: a purga deixa o código em linhas com mais de 15 min (prova da falha A13-B3)', comCodigoAntes.length >= 1, comCodigoAntes);
    res.lines.push('  (medido) ANTES, com código depois da purga e idade > 15 min: ' + comCodigoAntes.join(', ') + `; retorno ${nA}`);
    const devia = Object.entries(ed).filter(([k, r]) => !/10min/.test(k));
    check('DEPOIS: toda linha com mais de 15 min perdeu o code (9 linhas, 3 estados x 20 min, 2 dias, 40 dias)', devia.length === 9 && devia.every(([, r]) => r.code === false), devia.filter(([, r]) => r.code));
    check('DEPOIS: as linhas de 10 min (3 estados) mantêm o code', ['queued', 'sent', 'failed'].every((s) => ed[`${s}-10min`].code === true));
    check('DEPOIS: queued com mais de 1 dia virou failed (2 dias e 40 dias); queued de 20 min continua queued; sent e failed mantêm o estado',
      ed['queued-2dias'].status === 'failed' && ed['queued-40dias'].status === 'failed' && ed['queued-20min'].status === 'queued' && ed['queued-10min'].status === 'queued' && ed['sent-40dias'].status === 'sent' && ed['failed-2dias'].status === 'failed', Object.fromEntries(Object.entries(ed).map(([k, r]) => [k, r.status])));
    check('DEPOIS: nenhuma linha foi apagada (contagem igual ao antes da purga)', (await D.q(`select count(*)::int n from public.sign_outbox`))[0].n === totD0 && totD0 >= 12);
    check('DEPOIS: a purga retornou 9 (linhas alteradas)', nD === 9, nD);
    const n2 = (await D.q(`select public._sign_outbox_purge() as n`))[0].n;
    check('DEPOIS: a 2ª execução retorna 0 e não muda nada', n2 === 0 && JSON.stringify(await estado(D)) === JSON.stringify(ed), n2);
    check('DEPOIS: queued velha que virou failed ganhou o motivo "expirado sem envio"', (await D.q(`select error from public.sign_outbox where destination = 'purga-queued-40dias@teste.example'`))[0].error === 'expirado sem envio');
    // linha com params sem 'code' e queued velha: vira failed, sem erro (params nunca nulo na tabela, mas a conta não depende disso)
    await D.q(`insert into public.sign_outbox (channel, destination, template, params, status, created_at) values ('email', 'purga-semcode@teste.example', 'x', '{}', 'queued', now() - interval '3 days')`);
    check('DEPOIS: queued velha sem code também encerra (retorna 1) e a seguinte retorna 0', (await D.q(`select public._sign_outbox_purge() as n`))[0].n === 1 && (await D.q(`select public._sign_outbox_purge() as n`))[0].n === 0);
    await D.q(`delete from public.sign_outbox where destination like 'purga-%'`); await A.q(`delete from public.sign_outbox where destination like 'purga-%'`);
    // desempenho e plano: 200 mil linhas antigas já limpas + 1 pendente; os índices parciais entram em ação
    await D.q(`insert into public.sign_outbox (channel, destination, template, params, status, created_at) select 'email', 'bulk@teste.example', 'x', '{}', 'sent', now() - interval '60 days' - (g || ' minutes')::interval from generate_series(1, 200000) g`);
    await D.q(`analyze public.sign_outbox`);
    await D.q(`insert into public.sign_outbox (channel, destination, template, params, status, created_at) values ('email', 'bulk-pend@teste.example', 'otp', '{"code":"999999"}', 'sent', now() - interval '90 days')`);
    const ex = async (sql) => (await D.q(`explain (costs off) ${sql}`)).map((x) => x['QUERY PLAN']).join('\n');
    const p1 = await ex(`update public.sign_outbox set params = params - 'code' where params ? 'code' and created_at < now() - interval '15 minutes'`);
    const p2 = await ex(`update public.sign_outbox set status = 'failed' where status = 'queued' and created_at < now() - interval '1 day'`);
    check('plano (200 mil linhas): a 1ª consulta usa o índice parcial do code, sem Seq Scan', /sign_outbox_code_idx/.test(p1) && !/Seq Scan/.test(p1), p1);
    check('plano (200 mil linhas): a 2ª consulta usa o índice parcial de queued, sem Seq Scan', /sign_outbox_queued_idx/.test(p2) && !/Seq Scan/.test(p2), p2);
    const t0 = Date.now(); const nb = (await D.q(`select public._sign_outbox_purge() as n`))[0].n; const ms = Date.now() - t0;
    check('a purga completa roda em < 200 ms com 200 mil linhas e limpa a linha de 90 dias (retorna 1)', ms < 200 && nb === 1, [ms, nb]);
    res.lines.push(`  (medido) purga com 200 mil linhas: ${ms} ms`);
    await D.q(`delete from public.sign_outbox where destination like 'bulk%'`);
  }

  // =========================================================================================================
  sec('Grants e segurança (DEPOIS)');
  {
    for (const f of [...NOVAS, '_sign_outbox_purge()']) check(`${f}: nem anon, nem authenticated, nem public executam`, !(await priv(D, f, 'anon')) && !(await priv(D, f, 'authenticated')) && !(await pubGrant(D, f)));
    check('sign_me e sign_onboarding_done: authenticated executa; anon e public não', (await Promise.all(['sign_me()', 'sign_onboarding_done()'].map(async (f) => (await priv(D, f, 'authenticated')) && !(await priv(D, f, 'anon')) && !(await pubGrant(D, f))))).every(Boolean));
    const ps = (await D.q(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) and p.prosecdef and not (p.proconfig @> array['search_path=""'])`, [['sign_me', 'sign_onboarding_done', '_sign_outbox_purge']])).map((x) => x.proname);
    check('SECURITY DEFINER com search_path vazio nas 3 funções públicas/internas alteradas', ps.length === 0, ps);
    check('as internas novas têm search_path vazio', (await D.q(`select count(*)::int n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('_sign_name_ok','_sign_name_visible') and p.proconfig @> array['search_path=""']`))[0].n === 2);
    const u = (await D.q(`select id from auth.users where email = 'onb301@teste.example'`))[0].id; void u;
    const anon = await D.rpc('_sign_outbox_purge', {}); const logado = await D.rpc('_sign_outbox_purge', {}, 'onb301@teste.example'); const anon2 = await D.rpc('sign_onboarding_done', {});
    check('RPC: anon e usuário logado não chamam a purga (401 e 403); anon não chama sign_onboarding_done', anon.status === 401 && logado.status === 403 && anon2.status === 401, [anon.status, logado.status, anon2.status]);
    const top = fs.readFileSync(MIG, 'utf8').slice(0, 6000);
    check('cabeçalho: lista o que NÃO reverte, traz o plano de reversão e diz "NÃO APLICADA"', /O que NÃO reverte/.test(top) && /Como reverter/.test(top) && /NÃO APLICADA/.test(top) && (top.match(/NÃO REVERTE:/g) || []).length >= 4);
    check('a migração não contém nada fora do escopo (sem drop table, sem delete, sem truncate)', !/\b(drop table|truncate|delete from)\b/i.test(fs.readFileSync(MIG, 'utf8').replace(/--.*$/gm, '')));
  }

  // =========================================================================================================
  sec('Idempotência (2x) e reversão (banco MEIO = esquema + 1.4 + 1.5 + 1.3, sem a migração nova)');
  {
    await mk(M.q, 70, { nome: 'Ana Souza', verif: 'email' });
    await M.q(`insert into public.sign_outbox (channel, destination, template, params, status, created_at) values ('email', 'velho@teste.example', 'otp', '{"code":"555555"}', 'queued', now() - interval '3 days')`);
    const rev = path.join(tmp, 'reversao-c2-13.sql');
    cp.execFileSync(path.join(ROOT, 'scripts/sign-local/gerar-reversao-c2-13.sh'), [DB_MEIO, rev], { encoding: 'utf8' });
    check('reversão gerada FORA do repositório com as 3 funções', (fs.readFileSync(rev, 'utf8').match(/CREATE OR REPLACE FUNCTION/g) || []).length === 3 && !rev.startsWith(ROOT));
    check('o gerador recusa gravar dentro do repositório', (() => { try { cp.execFileSync(path.join(ROOT, 'scripts/sign-local/gerar-reversao-c2-13.sh'), [DB_MEIO, path.join(ROOT, 'x-rev.sql')], { stdio: 'pipe' }); return false; } catch (e) { return e.status === 2; } })());
    const s0 = await snap(M);
    psqlFile(DB_MEIO, MIG);
    await M.q(`select public._sign_outbox_purge()`);
    const s1 = await snap(M);
    const dados1 = JSON.stringify(await M.q(`select count(*)::int n, count(*) filter (where status = 'failed')::int f from public.sign_outbox`));
    psqlFile(DB_MEIO, MIG);
    const s2 = await snap(M);
    const dados2 = JSON.stringify(await M.q(`select count(*)::int n, count(*) filter (where status = 'failed')::int f from public.sign_outbox`));
    const idx = async () => (await M.q(`select count(*)::int n from pg_indexes where indexname in ('sign_outbox_code_idx', 'sign_outbox_queued_idx')`))[0].n;
    check('idem: 2ª aplicação sem erro; definições e ACLs de todas as funções idênticas às da 1ª', JSON.stringify(s1) === JSON.stringify(s2));
    check('idem: dados idênticos; 2 índices parciais (1 de cada)', dados1 === dados2 && (await idx()) === 2, [dados1, dados2]);
    const mudou = Object.keys(s1).filter((k) => !s0[k] || s0[k].d !== s1[k].d).sort();
    check('a migração muda/cria só as 5 funções esperadas (3 alteradas, 2 novas)', JSON.stringify(mudou) === JSON.stringify([...FN3, ...NOVAS].sort()), mudou);
    const acl = FN3.filter((f) => s0[f].acl !== s1[f].acl);
    check('ACLs das funções já existentes não mudam', acl.length === 0, acl.map((f) => [f, s0[f].acl, s1[f].acl]));
    check('nenhuma função nova ou alterada ficou com grant para public', (await Promise.all([...FN3, ...NOVAS].map((f) => pubGrant(M, f)))).every((x) => x === false));
    await M.fake.loadUsers();
    check('com a migração: nome só de invisíveis é recusado em sign_onboarding_done', await (async () => { await mk(M.q, 71, { nome: '​ ​', verif: 'email' }); await M.fake.loadUsers(); const r = await M.rpc('sign_onboarding_done', {}, 'onb71@teste.example'); return r.status === 400 && /onboarding_incomplete/.test(r.msg); })());
    psqlFile(DB_MEIO, rev);
    const s3 = await snap(M);
    check('rev: reversão aplicada sem erro; as 3 funções voltam à definição anterior (hash idêntico)', FN3.every((f) => s3[f] && s3[f].d === s0[f].d), FN3.filter((f) => s3[f].d !== s0[f].d));
    check('rev: as 2 internas e os 2 índices criados pela migração foram removidos; mesmo número de funções', NOVAS.every((f) => !s3[f]) && Object.keys(s3).length === Object.keys(s0).length && (await idx()) === 0);
    check('rev: o que NÃO reverte, não reverteu: a linha queued velha continua failed (limpeza irreversível, como o cabeçalho diz)', (await M.q(`select status from public.sign_outbox where destination = 'velho@teste.example'`))[0].status === 'failed');
    check('rev: depois da reversão sign_onboarding_done volta a aceitar nome só de invisíveis (comportamento antigo)', await (async () => { await mk(M.q, 72, { nome: '​ ​', verif: 'email' }); await M.fake.loadUsers(); const r = await M.rpc('sign_onboarding_done', {}, 'onb72@teste.example'); return r.status === 200; })());
    psqlFile(DB_MEIO, MIG);
    const s4 = await snap(M);
    check('rev: reaplicar a migração depois da reversão volta ao mesmo estado', JSON.stringify(s4) === JSON.stringify(s1));
  }

  await Promise.all([A, D, M].map((x) => x.close()));
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
