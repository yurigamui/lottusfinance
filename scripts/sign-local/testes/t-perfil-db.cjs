// Seção 1.4 (Perfil e conta), BANCO: AC-B1 a AC-B14 contra o Postgres LOCAL real, chamando as RPCs como o PostgREST faz (pelo Supabase falso em modo repasse).
// Bancos: "sign" (DEPOIS: esquema + migração 20261126120000) e "sign_antes" (ANTES: só o esquema atual, para provar a regressão corrigida).
// Uso: [SIGN_SCHEMA=/root/sign-schema.sql] [EVID=<pasta>] node t-perfil-db.cjs   (recria os bancos com reset.sh no início e no fim)
// Medições: EXPLAIN (ANALYZE, BUFFERS) e p95 em 10 mil perfis semeados ficam em EVID (padrão docs/agente/sign/evidencias-1-4).
const { check, done, res } = require('./lib.cjs');
const { U, banco, restaurar, reset, psqlFile, DB, DB_ANTES, MIGRACAO, ROOT } = require('./perfil-lib.cjs');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EVID = process.env.EVID || path.join(ROOT, 'docs/agente/sign/evidencias-1-4');
const sec = (n) => res.lines.push('# ' + n);
const fim = (tmp) => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* sem limpeza */ } };
const hasSeq = (plan, tabela) => new RegExp('Seq Scan on ' + tabela + '\\b').test(plan);
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };

(async () => {
  console.info('recriando bancos locais (ANTES e DEPOIS)...');
  reset('ambos');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-1-4-'));
  const A = await banco(DB_ANTES);
  const D = await banco(DB);
  const { rpc, q } = D;
  const snap = async (id) => (await q(`select full_name, cpf, email, phone, updated_at::text as up from public.profiles where id = $1`, [id]))[0];

  sec('AC-B1 IDOR: o uid vem só do token');
  {
    await restaurar(q);
    const u2 = await snap(U.U2.id);
    const r = await rpc('sign_profile_save', { p: { id: U.U2.id, user_id: U.U2.id, uid: U.U2.id, name: 'Novo Nome Teste', cpf: U.U1.cpf } }, U.U1.email);
    check('AC-B1 U1 salva com id/user_id de U2 no corpo: 200', r.status === 200, r);
    check('AC-B1 só a linha de U1 mudou (nome novo)', (await snap(U.U1.id)).full_name === 'Novo Nome Teste');
    check('AC-B1 a linha de U2 ficou idêntica (nome, CPF, updated_at)', JSON.stringify(await snap(U.U2.id)) === JSON.stringify(u2), [await snap(U.U2.id), u2]);
    const me1 = JSON.stringify(r.body);
    check('AC-B1 sign_me de U1 não contém dado de U2 (nome, e-mail, CPF)', !me1.includes(U.U2.name) && !me1.includes(U.U2.email) && !me1.includes(U.U2.cpf));
    const r2 = await rpc('sign_profile_save', { p: { id: U.U2.id, name: 'Outro Nome Teste', cpf: U.U2.cpf } }, U.U1.email);
    check('AC-B1 U1 tentando gravar o CPF de U2: cpf_locked (CPF de U1 já preenchido)', r2.status === 400 && /cpf_locked/.test(r2.msg), r2);
    check('AC-B1 U2 intacto de novo', JSON.stringify(await snap(U.U2.id)) === JSON.stringify(u2));
    const fn = (await q(`select pronargs, proargnames from pg_proc where pronamespace = 'public'::regnamespace and proname = 'sign_profile_save'`))[0];
    check('AC-B1 sign_profile_save tem um único parâmetro (p jsonb): uid não é parâmetro', fn.pronargs === 1 && fn.proargnames[0] === 'p', fn);
    const r3 = await rpc('sign_me', { uid: U.U2.id }, U.U1.email);
    check('AC-B1 sign_me não aceita uid (função com esse argumento não existe)', r3.status === 404, r3);
    await restaurar(q);
  }

  sec('AC-B2 anon e funções internas');
  {
    const antes = await snap(U.U1.id);
    for (const fn of ['sign_me', 'sign_profile_save', 'sign_account_save', 'sign_plan_state']) {
      const body = fn === 'sign_me' || fn === 'sign_plan_state' ? {} : { p: { name: 'Invasor Teste', cpf: U.U3.cpfLivre, doc: U.U3.cpfLivre } };
      const r = await rpc(fn, body, null);
      check(`AC-B2 anon chama ${fn}: negado (401, permission denied)`, r.status === 401 && /permission denied/.test(r.msg), r);
    }
    check('AC-B2 nenhuma linha alterada pelo anon', JSON.stringify(await snap(U.U1.id)) === JSON.stringify(antes) && (await q(`select count(*)::int n from public.profiles where full_name = 'Invasor Teste'`))[0].n === 0);
    for (const [fn, body] of [['_sign_cpf_locked', { p_uid: U.U1.id }], ['_senv_owner_name', { p_uid: U.U1.id }], ['_sign_profile_apply', { p_uid: U.U1.id, p_email: 'x@teste.example', p_name: 'Fulano Teste', p_cpf: '' }], ['_sign_name_norm', { p: 'a  b' }]]) {
      const r = await rpc(fn, body, U.U1.email);
      check(`AC-B2 authenticated chama ${fn}: negado (403, permission denied)`, r.status === 403 && /permission denied/.test(r.msg), r);
      const r0 = await rpc(fn, body, null);
      check(`AC-B2 anon chama ${fn}: negado`, r0.status === 401 && /permission denied/.test(r0.msg), r0);
    }
    const nc = await q(`update auth.users set email_confirmed_at = null where id = $1 returning 1`, [U.U7.id]);
    await D.fake.loadUsers();
    const r = await rpc('sign_me', {}, U.U7.email);
    check('AC-B2 e-mail não confirmado: email_not_confirmed (400)', nc.length === 1 && r.status === 400 && /email_not_confirmed/.test(r.msg), r);
    await q(`update auth.users set email_confirmed_at = now() where id = $1`, [U.U7.id]);
  }

  sec('AC-B3 CPF duplicado');
  {
    await restaurar(q);
    const r = await rpc('sign_profile_save', { p: { name: 'Carla Teste Nome', cpf: U.U2.cpf } }, U.U3.email);
    check('AC-B3 U3 tenta o CPF de U2: cpf_in_use (400)', r.status === 400 && /cpf_in_use/.test(r.msg), r);
    check('AC-B3 a mensagem não traz o nome nem o e-mail de U2', !/Bruno|Outro|teste\.example/i.test(JSON.stringify(r.body)), r.body);
    const p3 = await snap(U.U3.id);
    check('AC-B3 profiles de U3 intacto (nome e CPF nulos)', p3.full_name === null && p3.cpf === null, p3);
  }

  sec('AC-B4 CPF inválido');
  {
    await restaurar(q);
    for (const cpf of ['11111111111', '123', 'abc', '', '12345678900']) {
      const r = await rpc('sign_profile_save', { p: { name: 'Carla Teste Nome', cpf } }, U.U3.email);
      check(`AC-B4 CPF ${JSON.stringify(cpf)}: invalid_cpf`, r.status === 400 && /invalid_cpf/.test(r.msg), r);
    }
    const r = await rpc('sign_profile_save', { p: { name: 'X', cpf: '123' } }, U.U3.email);
    check('AC-B4 nome inválido vem antes do CPF inválido: invalid_name', r.status === 400 && /invalid_name/.test(r.msg), r);
    const p3 = await snap(U.U3.id);
    check('AC-B4 nada gravado nas tentativas inválidas', p3.full_name === null && p3.cpf === null, p3);
    // o CPF 529.982.247-25 do exemplo da especificação já está no seed da conta ana.sign (unique): uso o CPF livre de U3 com máscara
    const mask = U.U3.cpfLivre.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    const ok = await rpc('sign_profile_save', { p: { name: 'Carla Teste Nome', cpf: mask } }, U.U3.email);
    check(`AC-B4 CPF com máscara ${mask} grava só dígitos`, ok.status === 200 && ok.body.cpf === U.U3.cpfLivre && (await snap(U.U3.id)).cpf === U.U3.cpfLivre, ok);
    const dup = await rpc('sign_profile_save', { p: { name: 'Carla Teste Nome', cpf: '529.982.247-25' } }, U.U3.email);
    check('AC-B4 o CPF do exemplo da especificação (de outra conta do seed) com U3 já preenchido: cpf_locked', dup.status === 400 && /cpf_locked/.test(dup.msg), dup);
  }

  sec('AC-B5 nome');
  {
    await restaurar(q);
    const n140 = 'N'.repeat(69) + ' ' + 'M'.repeat(70);
    const r = await rpc('sign_profile_save', { p: { name: n140, cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B5 140 caracteres: grava', r.status === 200 && (await snap(U.U3.id)).full_name === n140 && n140.length === 140, r.msg);
    for (const [rot, nome] of [['141 caracteres', n140 + 'X'], ['2 caracteres', 'Ab'], ['uma palavra só', 'Anamaria'], ['só espaços', '     '], ['vazio', '']]) {
      const x = await rpc('sign_profile_save', { p: { name: nome, cpf: U.U3.cpfLivre } }, U.U3.email);
      check(`AC-B5 ${rot}: invalid_name`, x.status === 400 && /invalid_name/.test(x.msg), x);
    }
    check('AC-B5 nome do banco continua o de 140 após as recusas', (await snap(U.U3.id)).full_name === n140);
    const sp = await rpc('sign_profile_save', { p: { name: '  Ana    Maria   Silva  ', cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B5 espaços duplicados e nas pontas: grava "Ana Maria Silva"', sp.status === 200 && sp.body.name === 'Ana Maria Silva' && (await snap(U.U3.id)).full_name === 'Ana Maria Silva', sp);
    const tab = await rpc('sign_profile_save', { p: { name: 'Ana\t\nSilva', cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B5 tab e quebra de linha entre palavras viram um espaço', tab.status === 200 && tab.body.name === 'Ana Silva', tab);
    const nul = await rpc('sign_profile_save', { p: { cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B5 sem a chave name: invalid_name', nul.status === 400 && /invalid_name/.test(nul.msg), nul);
  }

  sec('AC-B6 XSS no nome (a saída é sanitizada na tela; o servidor grava literal)');
  {
    await restaurar(q);
    const x = 'Ana <img src=x onerror=alert(1)> Silva';
    const r = await rpc('sign_profile_save', { p: { name: x, cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B6 grava literalmente', r.status === 200 && (await snap(U.U3.id)).full_name === x, r);
    const me = await rpc('sign_me', {}, U.U3.email);
    check('AC-B6 sign_me devolve o texto idêntico', me.body.name === x, me.body.name);
  }

  sec('AC-B7 R5: não sobrescreve dado do Partners/Wealth');
  {
    await restaurar(q);
    const a = await snap(U.U4.id);
    const r = await rpc('sign_profile_save', { p: { name: 'Dora Trocada Nome', cpf: U.U1.cpf, phone: '5500000000000', email: 'hack@teste.example' } }, U.U4.email);
    check('AC-B7 U4 com CPF diferente: cpf_locked', r.status === 400 && /cpf_locked/.test(r.msg), r);
    const b = await snap(U.U4.id);
    check('AC-B7 CPF, nome, e-mail e celular de U4 intactos (updated_at também)', JSON.stringify(a) === JSON.stringify(b), [a, b]);
    const ok = await rpc('sign_profile_save', { p: { name: 'Dora Nova Exemplo', cpf: U.U4.cpf, phone: '5500000000000', email: 'hack@teste.example' } }, U.U4.email);
    const c = await snap(U.U4.id);
    check('AC-B7 mesmo CPF e nome novo: grava só full_name', ok.status === 200 && c.full_name === 'Dora Nova Exemplo' && c.cpf === a.cpf && c.email === a.email && c.phone === a.phone, [a, c]);
    const so = await rpc('sign_profile_save', { p: { name: 'Dora Só Nome', cpf: '' } }, U.U4.email);
    check('AC-B7 salvar só o nome (CPF vazio no envio) com CPF já preenchido: mantém o CPF', so.status === 200 && (await snap(U.U4.id)).cpf === a.cpf && so.body.name === 'Dora Só Nome', so);
    const sm = await rpc('sign_me', {}, U.U4.email);
    check('AC-B7 sign_me de U4: cpf_locked, celular vem de profiles', sm.body.cpf_locked === true && sm.body.phone === U.U4.phone, sm.body);
    const ids = await q(`select count(*)::int n from public.company_members where user_id = $1`, [U.U4.id]);
    check('AC-B7 o vínculo de U4 (company_members) segue intacto', ids[0].n === 1);
  }

  sec('AC-B8 P1-05 e certificado');
  {
    await restaurar(q);
    const s5 = (await rpc('sign_me', {}, U.U5.email)).body, s6 = (await rpc('sign_me', {}, U.U6.email)).body, s3 = (await rpc('sign_me', {}, U.U3.email)).body;
    check('AC-B8 U5 (1 envelope): cpf_locked = true', s5.cpf_locked === true, s5.cpf_locked);
    check('AC-B8 U6 (certificado verificado): cpf_locked = true', s6.cpf_locked === true, s6.cpf_locked);
    check('AC-B8 U3 (sem envelope, CPF vazio): cpf_locked = false', s3.cpf_locked === false, s3.cpf_locked);
    check('AC-B8 U1 (CPF preenchido, sem envelope): cpf_locked = true (R5: CPF só se preenche)', (await rpc('sign_me', {}, U.U1.email)).body.cpf_locked === true);
    const env = (await q(`select count(*)::int n from public.sign_envelopes where owner = $1`, [U.U5.id]))[0].n;
    check('AC-B8 U5 de fato tem 1 envelope', env === 1, env);
    const r5 = await rpc('sign_profile_save', { p: { name: 'Edu Mudou Exemplo', cpf: U.U1.cpf } }, U.U5.email);
    check('AC-B8 U5 salva com CPF diferente: cpf_locked', r5.status === 400 && /cpf_locked/.test(r5.msg), r5);
    const r6 = await rpc('sign_profile_save', { p: { name: 'Fabi Mudou Exemplo', cpf: U.U1.cpf } }, U.U6.email);
    check('AC-B8 U6 salva com CPF diferente: cpf_locked', r6.status === 400 && /cpf_locked/.test(r6.msg), r6);
    await q(`update public.profiles set cpf = null where id = $1`, [U.U6.id]);
    const r6b = await rpc('sign_profile_save', { p: { name: 'Fabi Mudou Exemplo', cpf: U.U6.cpf } }, U.U6.email);
    check('AC-B8 U6 com CPF vazio no perfil: só aceita o CPF do próprio certificado', r6b.status === 200 && r6b.body.cpf === U.U6.cpf, r6b);
    const r3 = await rpc('sign_profile_save', { p: { name: 'Carla Preenche Exemplo', cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B8 U3 preenche nome e CPF', r3.status === 200 && r3.body.cpf === U.U3.cpfLivre && r3.body.cpf_locked === true && r3.body.profile_complete === true, r3);
    const r3b = await rpc('sign_profile_save', { p: { name: 'Carla Preenche Exemplo', cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B8 repetir o mesmo envio: sem erro e sem mudança de updated_at', r3b.status === 200, r3b);
    const up1 = (await snap(U.U3.id)).up;
    await rpc('sign_profile_save', { p: { name: 'Carla Preenche Exemplo', cpf: U.U3.cpfLivre } }, U.U3.email);
    check('AC-B8 no-op não regrava a linha (updated_at igual)', (await snap(U.U3.id)).up === up1);
    await restaurar(q);
    const n7 = await rpc('sign_profile_save', { p: { name: 'Gil Sem Linha', cpf: '45965879652' } }, U.U7.email);
    check('AC-B8 U7 sem linha em profiles: cria a linha com e-mail do Auth', n7.status === 200 && (await snap(U.U7.id)).email === U.U7.email, n7);
    await restaurar(q);
  }

  sec('AC-B9 M2: sem fallback de raw_user_meta_data (DEPOIS) e prova da regressão (ANTES)');
  {
    await restaurar(q); await A.q(`update public.profiles set full_name = null, cpf = null where id = $1`, [U.U3.id]);
    const d = (await rpc('sign_me', {}, U.U3.email)).body;
    check('AC-B9 DEPOIS: cpf nulo', d.cpf === null, d.cpf);
    check('AC-B9 DEPOIS: phone nulo', d.phone === null, d.phone);
    check('AC-B9 DEPOIS: name nulo', d.name === null, d.name);
    check('AC-B9 DEPOIS: name_hint traz o metadado', d.name_hint === 'Banco Falso S.A.', d.name_hint);
    check('AC-B9 DEPOIS: profile_complete = false e cpf_locked = false', d.profile_complete === false && d.cpf_locked === false, d);
    const a = (await A.rpc('sign_me', {}, U.U3.email)).body;
    check('AC-B9 ANTES (esquema atual): o fallback existe (a regressão que a migração corrige)', a.cpf === U.U3.meta.cpf && a.phone === U.U3.meta.phone && a.name === U.U3.meta.name, a);
    check('AC-B9 ANTES: não há name_hint, cpf_locked nem profile_complete', !('name_hint' in a) && !('cpf_locked' in a) && !('profile_complete' in a));
    const outras = Object.keys(a).filter((k) => !(k in d));
    check('AC-B9 todas as chaves antigas de sign_me continuam no DEPOIS (1.0 e 1.1 não quebram)', Object.keys(a).every((k) => k in d) && outras.length === 0, outras);
  }

  sec('AC-B10 R3: nome do remetente nas evidências vem de profiles');
  {
    const pdf = (await q(`select pdf_b64 from public.sign_envelopes limit 1`))[0].pdf_b64;
    const env = (nome) => ({ p: { name: nome, filename: 'a.pdf', pdf_b64: pdf, signers: [{ name: 'Bruno Signatário Exemplo', email: 'bruno.sign@exemplo.com.br', cpf: '11144477735' }] } });
    for (const [rotulo, B, esperaDepois] of [['DEPOIS', D, true], ['ANTES', A, false]]) {
      await restaurar(B.q);
      await B.q(`update public.sign_identity set phone = '5511900000009', phone_verified_at = now() where user_id = $1`, [U.U3.id]);
      await B.q(`update public.profiles set full_name = 'Ana Silva' where id = $1`, [U.U3.id]);
      const r = await B.rpc('sign_env_create', env('Contrato R3 com nome'), U.U3.email);
      const on = r.status === 200 ? (await B.q(`select owner_name from public.sign_envelopes where id = $1`, [r.body.id]))[0].owner_name : r.msg;
      if (esperaDepois) check('AC-B10 DEPOIS: owner_name = "Ana Silva" (profiles) apesar do metadado "Banco Falso S.A."', on === 'Ana Silva', on);
      else check('AC-B10 ANTES: owner_name = metadado (a falha que a migração corrige)', on === 'Banco Falso S.A.', on);
      await B.q(`update public.profiles set full_name = null where id = $1`, [U.U3.id]);
      const r2 = await B.rpc('sign_env_create', env('Contrato R3 sem nome'), U.U3.email);
      const on2 = r2.status === 200 ? (await B.q(`select owner_name from public.sign_envelopes where id = $1`, [r2.body.id]))[0].owner_name : r2.msg;
      if (esperaDepois) check('AC-B10 DEPOIS: sem full_name usa a parte local do e-mail (vazio), nunca o metadado', on2 === 'vazio', on2);
      else check('AC-B10 ANTES: sem full_name também usa o metadado', on2 === 'Banco Falso S.A.', on2);
      if (esperaDepois) {
        const antigo = await q(`select owner_name from public.sign_envelopes where owner = $1 and name = 'Contrato do U5'`, [U.U5.id]);
        check('AC-B10 envelope antigo mantém o owner_name já gravado (evidência não é reescrita)', antigo.length === 1 && antigo[0].owner_name !== null, antigo);
      }
    }
    await restaurar(q);
  }

  sec('AC-B11 T-02 etapa A: sign_account_save grava em profiles e não em sign_accounts');
  {
    await restaurar(q);
    const base = (await rpc('sign_plan_state', {}, U.U1.email));
    const acc0 = (await q(`select name, doc from public.sign_accounts where user_id = $1`, [U.U1.id]))[0];
    check('AC-B11 conta Sign criada por sign_plan_state; account.name/doc agora vêm de profiles', base.status === 200 && base.body.account.name === U.U1.name && base.body.account.doc === U.U1.cpf, base);
    await q(`insert into public.crm_leads (name, product, sign_account_id) select $2, 'sign', id from public.sign_accounts where user_id = $1`, [U.U1.id, 'Nome Antigo no CRM']);
    const r = await rpc('sign_account_save', { p: { name: 'Ana Nova Silva', doc: U.U1.cpf } }, U.U1.email);
    check('AC-B11 sign_account_save: 200 e plan_state reflete profiles', r.status === 200 && r.body.account.name === 'Ana Nova Silva' && r.body.account.doc === U.U1.cpf, r);
    check('AC-B11 profiles.full_name mudou', (await snap(U.U1.id)).full_name === 'Ana Nova Silva');
    const acc1 = (await q(`select name, doc from public.sign_accounts where user_id = $1`, [U.U1.id]))[0];
    check('AC-B11 sign_accounts.name/doc NÃO mudaram', JSON.stringify(acc0) === JSON.stringify(acc1), [acc0, acc1]);
    check('AC-B11 crm_leads.name sincronizado a partir de profiles', (await q(`select l.name from public.crm_leads l join public.sign_accounts a on a.id = l.sign_account_id where a.user_id = $1`, [U.U1.id]))[0].name === 'Ana Nova Silva');
    const cnpj = await rpc('sign_account_save', { p: { name: 'Ana Outra Silva', doc: '11222333000181' } }, U.U1.email);
    check('AC-B11 doc com 14 dígitos (CNPJ) é ignorado, sem erro; o nome vale', cnpj.status === 200 && cnpj.body.account.doc === U.U1.cpf && (await snap(U.U1.id)).full_name === 'Ana Outra Silva', cnpj);
    const cl = await rpc('sign_account_save', { p: { name: 'Ana Outra Silva', doc: U.U2.cpf } }, U.U1.email);
    check('AC-B11 doc com CPF diferente: cpf_locked (mesma regra R5)', cl.status === 400 && /cpf_locked/.test(cl.msg), cl);
    const bad = await rpc('sign_account_save', { p: { name: 'Ana Outra Silva', doc: '123' } }, U.U1.email);
    check('AC-B11 doc inválido: doc_invalid', bad.status === 400 && /doc_invalid/.test(bad.msg), bad);
    const nome = await rpc('sign_account_save', { p: { name: 'Um' } }, U.U1.email);
    check('AC-B11 nome inválido: invalid_name', nome.status === 400 && /invalid_name/.test(nome.msg), nome);
    const vazio = await rpc('sign_account_save', { p: { name: '', doc: '' } }, U.U1.email);
    check('AC-B11 nome e doc vazios: não muda nada', vazio.status === 200 && (await snap(U.U1.id)).full_name === 'Ana Outra Silva', vazio);
    await q(`delete from public.crm_leads where name = 'Ana Outra Silva' or name = 'Ana Nova Silva' or name = 'Nome Antigo no CRM'`);
    await restaurar(q);
  }


  sec('Ciclo 2: A14-M1 duplicidade normalizada, A14-B1 vínculo só com CPF preenchido, A14-B3 caracteres invisíveis');
  {
    await restaurar(q);
    await q(`update public.profiles set cpf = $2 where id = $1`, [U.U2.id, '982.636.303-04']); // Partners/Wealth gravando com máscara
    const r = await rpc('sign_profile_save', { p: { name: 'Carla Teste Nome', cpf: U.U2.cpf } }, U.U3.email);
    check('A14-M1 CPF de outro perfil gravado COM máscara: cpf_in_use (comparação por dígitos)', r.status === 400 && /cpf_in_use/.test(r.msg), r);
    check('A14-M1 profiles de U3 intacto', (await snap(U.U3.id)).cpf === null);
    const r2 = await rpc('sign_profile_save', { p: { name: 'Carla Teste Nome', cpf: '982.636.303-04' } }, U.U3.email);
    check('A14-M1 também com máscara no envio: cpf_in_use', r2.status === 400 && /cpf_in_use/.test(r2.msg), r2);
    check('A14-M1 CPF livre continua gravando', (await rpc('sign_profile_save', { p: { name: 'Carla Teste Nome', cpf: U.U3.cpfLivre } }, U.U3.email)).status === 200);
    check('A14-M1 a consulta de Verificação 0 (cpf ~ \'\\D\') acha o perfil com máscara', (await q(`select count(*)::int n from public.profiles where cpf ~ '\\D'`))[0].n === 1);
    await restaurar(q);
    await q(`insert into public.company_members (company_id, user_id, access, role) values ('c0000000-0000-4000-8000-000000000001', $1, 'viewer', 'm')`, [U.U3.id]);
    const s3 = (await rpc('sign_me', {}, U.U3.email)).body;
    check('A14-B1 membro de Partners com CPF VAZIO no perfil: cpf_locked = false', s3.cpf_locked === false, s3);
    const f3 = await rpc('sign_profile_save', { p: { name: 'Carla Membro Teste', cpf: U.U3.cpfLivre } }, U.U3.email);
    check('A14-B1 e consegue preencher o CPF; depois fica travado', f3.status === 200 && f3.body.cpf_locked === true, f3);
    await q(`delete from public.company_members where user_id = $1`, [U.U3.id]);
    check('A14-B1 U4 (vínculo + CPF preenchido) segue travado', (await rpc('sign_me', {}, U.U4.email)).body.cpf_locked === true);
    await restaurar(q);
    for (const [rot, ch] of [['U+202E (inversão de texto)', '\u202E'], ['U+200B (largura zero)', '\u200B'], ['U+200F', '\u200F'], ['U+202A', '\u202A'], ['U+2066', '\u2066'], ['U+2069', '\u2069'], ['U+200D (zero-width joiner)', '\u200D'], ['U+2060 (word joiner)', '\u2060'], ['U+FEFF (BOM)', '\uFEFF'], ['U+00AD (hífen suave)', '\u00AD'], ['U+180E (separador mongol)', '\u180E']]) {
      const x = await rpc('sign_profile_save', { p: { name: 'Ana ' + ch + 'Silva', cpf: U.U3.cpfLivre } }, U.U3.email);
      check(`A14-B3/B-01 nome com ${rot}: invalid_name`, x.status === 400 && /invalid_name/.test(x.msg), x);
    }
    check('A14-B3 nada gravado nas recusas', (await snap(U.U3.id)).full_name === null);
    const ok = await rpc('sign_profile_save', { p: { name: 'José Ação Müller-Silva', cpf: U.U3.cpfLivre } }, U.U3.email);
    check('A14-B3 acentos e hífen continuam aceitos', ok.status === 200 && ok.body.name === 'José Ação Müller-Silva', ok);
    const ac = await rpc('sign_account_save', { p: { name: 'Ana \u202Esilva' } }, U.U3.email);
    check('A14-B3 sign_account_save recusa igual', ac.status === 400 && /invalid_name/.test(ac.msg), ac);
    await restaurar(q);
  }

  sec('AC-B14 grants (catálogo)');
  {
    const pub = ['sign_me()', 'sign_profile_save(jsonb)', 'sign_account_save(jsonb)', 'sign_plan_state()'];
    const interna = ['_sign_cpf_locked(uuid)', '_sign_profile_apply(uuid,text,text,text)', '_sign_name_norm(text)', '_senv_owner_name(uuid)'];
    const priv = async (db, sig, role) => (await db.q(`select has_function_privilege($1, ('public.' || $2)::regprocedure, 'execute') as ok`, [role, sig]))[0].ok;
    const pubGrant = async (db, sig) => (await db.q(`select exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = ('public.' || $1)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') as ok`, [sig]))[0].ok;
    for (const sig of pub) {
      check(`AC-B14 ${sig}: execute só para authenticated (anon não, PUBLIC não)`, (await priv(D, sig, 'authenticated')) && !(await priv(D, sig, 'anon')) && !(await pubGrant(D, sig)));
      check(`AC-B14 ${sig}: SECURITY DEFINER e search_path vazio`, (await D.q(`select p.prosecdef and p.proconfig @> array['search_path=""'] as ok from pg_proc p where p.oid = ('public.' || $1)::regprocedure`, [sig]))[0].ok);
    }
    for (const sig of interna) {
      check(`AC-B14 ${sig}: sem execute para anon, authenticated e PUBLIC`, !(await priv(D, sig, 'anon')) && !(await priv(D, sig, 'authenticated')) && !(await pubGrant(D, sig)));
      check(`AC-B14 ${sig}: search_path vazio`, (await D.q(`select p.proconfig @> array['search_path=""'] as ok from pg_proc p where p.oid = ('public.' || $1)::regprocedure`, [sig]))[0].ok);
    }
    const sr = (await D.q(`select has_function_privilege('service_role', 'public.sign_me()'::regprocedure, 'execute') as ok`))[0].ok;
    console.info('  info (não conta): service_role mantém execute em sign_me() = ' + sr + ' (a migração não mexe nele; é um papel de servidor)');
  }

  sec('AC-B12 idempotência e reversão (no banco ANTES)');
  {
    await A.fake.stop && 0;
    const defs = async () => (await A.q(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, md5(pg_get_functiondef(p.oid)) as def, p.proacl::text as acl
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('sign_me','sign_profile_save','sign_account_save','sign_plan_state','_senv_owner_name','_sign_cpf_locked','_sign_profile_apply','_sign_name_norm') order by 1`));
    const dados = async () => (await A.q(`select md5(coalesce((select string_agg(p::text, '|' order by id) from public.profiles p), '') || coalesce((select string_agg(a::text, '|' order by id) from public.sign_accounts a), '') || coalesce((select string_agg(i::text, '|' order by user_id) from public.sign_identity i), '') || (select count(*)::text from public.sign_envelopes))  as h`))[0].h;
    const rev = path.join(tmp, 'reversao.sql');
    cp.execFileSync(path.join(ROOT, 'scripts/sign-local/gerar-reversao.sh'), [DB_ANTES, rev], { encoding: 'utf8' });
    check('AC-B12 arquivo de reversão gerado fora do repositório com as 5 funções', (fs.readFileSync(rev, 'utf8').match(/CREATE OR REPLACE FUNCTION/g) || []).length === 5 && !rev.startsWith(ROOT));
    const d0 = await defs(), h0 = await dados();
    check('AC-B12 antes da migração só existem as funções antigas (as 3 internas novas não existem)', d0.length === 5 && !d0.some((x) => /_sign_cpf_locked|_sign_profile_apply|_sign_name_norm/.test(x.sig)), d0.map((x) => x.sig));
    psqlFile(DB_ANTES, MIGRACAO);
    const d1 = await defs(), h1 = await dados();
    check('AC-B12 1ª aplicação: 8 funções, nenhuma linha de dados alterada', d1.length === 8 && h0 === h1, [d1.length, h0, h1]);
    let erro = null; try { psqlFile(DB_ANTES, MIGRACAO); } catch (e) { erro = e.message; }
    const d2 = await defs(), h2 = await dados();
    check('AC-B12 2ª aplicação: sem erro e sem mudança (definições, permissões e dados idênticos)', erro === null && JSON.stringify(d1) === JSON.stringify(d2) && h1 === h2, erro);
    psqlFile(DB_ANTES, rev);
    const d3 = await defs(), h3 = await dados();
    const orig = Object.fromEntries(d0.map((x) => [x.sig, x]));
    check('AC-B12 reversão: as 5 funções voltam à definição anterior (hash idêntico) e as 3 novas somem', d3.length === 5 && d3.every((x) => orig[x.sig] && orig[x.sig].def === x.def), d3.map((x) => x.sig));
    check('AC-B12 reversão: permissões das 5 funções como antes', d3.every((x) => orig[x.sig].acl === x.acl), d3.map((x) => [x.sig, x.acl]));
    check('AC-B12 reversão: dados permanecem', h3 === h0);
    const back = (await A.rpc('sign_me', {}, U.U1.email)).body;
    check('AC-B12 depois da reversão sign_me volta ao contrato antigo (sem cpf_locked)', back && !('cpf_locked' in back) && back.email === U.U1.email, back);
    psqlFile(DB_ANTES, MIGRACAO);
  }

  sec('AC-B13 desempenho: 10 mil perfis, p95 e EXPLAIN (ANALYZE, BUFFERS)');
  {
    fs.mkdirSync(EVID, { recursive: true });
    await restaurar(q);
    const t0 = Date.now();
    await q(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
      select gen_random_uuid(), 'carga' || g || '@carga.example', 'x', jsonb_build_object('name', 'Meta ' || g) from generate_series(1, 10000) g`);
    await q(`insert into public.profiles (id, full_name, cpf, email) select u.id, 'Pessoa Carga ' || row_number() over (), lpad((row_number() over () + 70000000000)::text, 11, '0'), u.email from auth.users u where u.email like '%@carga.example'`);
    await q(`insert into public.sign_identity (user_id, phone, phone_verified_at, onboarding_done) select u.id, '55119' || lpad((row_number() over ())::text, 8, '0'), now(), true from auth.users u where u.email like '%@carga.example'`);
    await q(`insert into public.sign_envelopes (owner, owner_name, owner_email, name, filename, pdf_b64, pdf_bytes, sha256) select u.id, 'x', u.email, 'Doc ' || g, 'a.pdf', 'JVBERi0x', 6, md5(g::text) from (select id, email, row_number() over () g from auth.users where email like '%@carga.example') u where g % 2 = 0`);
    await q(`insert into public.company_members (company_id, user_id, access, role) select 'c0000000-0000-4000-8000-000000000001', u.id, 'viewer', 'm' from auth.users u where u.email like 'carga1%@carga.example'`);
    await q(`insert into public.funder_members (funder_id, user_id, name, cpf, email) select 'd0000000-0000-4000-8000-000000000001', u.id, 'M', '0', u.email from auth.users u where u.email like 'carga2%@carga.example'`);
    await q(`analyze`);
    const tot = (await q(`select (select count(*)::int from public.profiles) as perfis, (select count(*)::int from public.sign_envelopes) as envelopes, (select count(*)::int from public.company_members) as cm, (select count(*)::int from public.funder_members) as fm`))[0];
    check(`AC-B13 carga semeada em ${((Date.now() - t0) / 1000).toFixed(1)} s: ${tot.perfis} perfis, ${tot.envelopes} envelopes, ${tot.cm}+${tot.fm} vínculos`, tot.perfis >= 10000, tot);
    await D.fake.loadUsers();
    const alvo = (await q(`select email, id from auth.users where email = 'carga77@carga.example'`))[0];
    const tempos = async (fn, body, n) => { const out = []; for (let i = 0; i < n; i++) { const t1 = process.hrtime.bigint(); const r = await rpc(fn, body(i), alvo.email); if (r.status !== 200) throw new Error(fn + ' ' + JSON.stringify(r)); out.push(Number(process.hrtime.bigint() - t1) / 1e6); } return out; };
    D.fake.state.rpcMs.length = 0;
    const seqMe = await tempos('sign_me', () => ({}), 100);
    const dbMe = D.fake.state.rpcMs.filter((x) => x.fn === 'sign_me').map((x) => x.ms);
    D.fake.state.rpcMs.length = 0;
    const seqSave = await tempos('sign_profile_save', (i) => ({ p: { name: 'Pessoa Carga ' + (i % 2 ? 'Alfa' : 'Beta'), cpf: '' } }), 100);
    const dbSave = D.fake.state.rpcMs.filter((x) => x.fn === 'sign_profile_save').map((x) => x.ms);
    const par = async (fn, body) => { const all = []; for (let rodada = 0; rodada < 10; rodada++) all.push(...await Promise.all(Array.from({ length: 10 }, async (_, i) => { const t1 = process.hrtime.bigint(); const r = await rpc(fn, body(i), 'carga' + (100 + i) + '@carga.example'); if (r.status !== 200) throw new Error(JSON.stringify(r)); return Number(process.hrtime.bigint() - t1) / 1e6; }))); return all; };
    const parMe = await par('sign_me', () => ({}));
    const parSave = await par('sign_profile_save', (i) => ({ p: { name: 'Pessoa Carga Par' + i, cpf: '' } }));
    const lim = (a) => `p95 ${p95(a).toFixed(1)} ms, mediana ${[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(1)} ms`;
    const linhas = [`sign_me, 100 chamadas sequenciais, ponta a ponta (HTTP + banco): ${lim(seqMe)}`, `sign_me, 100 chamadas sequenciais, só a transação no banco: ${lim(dbMe)}`,
      `sign_profile_save, 100 chamadas sequenciais, ponta a ponta: ${lim(seqSave)}`, `sign_profile_save, 100 chamadas sequenciais, só a transação no banco: ${lim(dbSave)}`,
      `sign_me, 10 rodadas x 10 paralelas, ponta a ponta: ${lim(parMe)}`, `sign_profile_save, 10 rodadas x 10 paralelas, ponta a ponta: ${lim(parSave)}`];
    for (const l of linhas) console.info('  medido: ' + l);
    check('AC-B13 sign_me p95 <= 300 ms (sequencial e paralelo, ponta a ponta)', p95(seqMe) <= 300 && p95(parMe) <= 300, [p95(seqMe), p95(parMe)]);
    check('AC-B13 sign_profile_save p95 <= 300 ms (sequencial e paralelo, ponta a ponta)', p95(seqSave) <= 300 && p95(parSave) <= 300, [p95(seqSave), p95(parSave)]);
    // EXPLAIN das consultas que as funções executam (as funções PL/pgSQL são opacas ao EXPLAIN; cada consulta é explicada com o uid de um usuário da carga)
    const uid = alvo.id;
    const consultas = {
      'profiles por id (sign_me, _sign_profile_apply)': `select * from public.profiles where id = '${uid}'`,
      'sign_identity por user_id (sign_me)': `select * from public.sign_identity where user_id = '${uid}'`,
      'auth.users por id (sign_me, _senv_owner_name)': `select * from auth.users where id = '${uid}'`,
      '_sign_cpf_locked, parte envelopes: sign_envelopes por owner': `select 1 from public.sign_envelopes e where e.owner = '${uid}'`,
      '_sign_cpf_locked, parte certificado: sign_identity por user_id': `select 1 from public.sign_identity i where i.user_id = '${uid}' and i.cert_verified_at is not null and i.cert_chain_ok`,
      '_sign_cpf_locked, parte vínculos: company_members por user_id': `select 1 from public.company_members m where m.user_id = '${uid}'`,
      '_sign_cpf_locked, parte vínculos: funder_members por user_id': `select 1 from public.funder_members f where f.user_id = '${uid}'`,
      'gravação de profiles (upsert por id)': `insert into public.profiles (id, full_name, cpf, email) values ('${uid}', 'Pessoa Carga Alfa', null, 'x') on conflict (id) do update set full_name = excluded.full_name, updated_at = now() where public.profiles.full_name is distinct from excluded.full_name`,
    };
    let txt = `EXPLAIN (ANALYZE, BUFFERS) no Postgres local (banco "${DB}", ${tot.perfis} perfis, ${tot.envelopes} envelopes, ${tot.cm} vínculos de empresa e ${tot.fm} de fundo).\nGerado por t-perfil-db.cjs. As tabelas company_members/funder_members aqui são stubs do prelude.sql SEM o índice por user_id que a produção possa ter (T-08: conferir).\n\n`;
    const seq = {};
    for (const [rot, sql] of Object.entries(consultas)) {
      const c = await D.fake.query('select 1'); void c;
      const cli = await require('pg').Pool && null; void cli;
      const plan = (await q(`explain (analyze, buffers) ${sql}`.replace(/^explain \(analyze, buffers\) insert/, 'explain (analyze, buffers) insert'))).map((r) => r['QUERY PLAN']).join('\n');
      txt += `-- ${rot}\n${sql}\n${plan}\n\n`; seq[rot] = plan;
    }
    // o upsert foi explicado dentro de uma transação que se desfaz? (explain analyze executa) -> restaura abaixo
    fs.writeFileSync(path.join(EVID, 'explain-1-4.txt'), txt);
    for (const tab of ['profiles', 'sign_identity', 'sign_envelopes', 'users']) check(`AC-B13 plano sem Seq Scan em ${tab}`, !Object.values(seq).some((p) => hasSeq(p, tab)));
    const sm = (b) => Object.entries(seq).filter(([k]) => /vínculos/.test(k)).some(([, p]) => hasSeq(p, b));
    console.info('  info (não conta): Seq Scan em company_members = ' + sm('company_members') + ', funder_members = ' + sm('funder_members') + ' (stubs sem índice; ver explain-1-4.txt)');
    // tempo de execução das consultas de leitura
    const exec = Object.entries(seq).map(([k, p]) => [k, +(p.match(/Execution Time: ([\d.]+) ms/) || [0, 0])[1]]);
    check('AC-B13 cada consulta executa em menos de 10 ms com 10 mil perfis', exec.every(([, ms]) => ms < 10), exec);
    // limpa a carga
    await q(`delete from public.company_members where user_id in (select id from auth.users where email like '%@carga.example')`);
    await q(`delete from public.funder_members where user_id in (select id from auth.users where email like '%@carga.example')`);
    await q(`delete from public.sign_envelopes where owner in (select id from auth.users where email like '%@carga.example')`);
    await q(`delete from public.sign_identity where user_id in (select id from auth.users where email like '%@carga.example')`);
    await q(`delete from public.profiles where email like '%@carga.example'`);
    await q(`delete from auth.users where email like '%@carga.example'`);
    fs.writeFileSync(path.join(EVID, 'p95-1-4.txt'), `Medido por t-perfil-db.cjs em ${new Date().toISOString().slice(0, 10)} (Postgres 16 local, ${tot.perfis} perfis):\n` + linhas.join('\n') + '\n');
  }

  D.close(); A.close(); fim(tmp);
  console.info('limpando: reset.sh ambos');
  reset('ambos');
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
