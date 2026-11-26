// Apoio dos testes da seção 1.4 (Perfil e conta): usuários U1..U7 do seed.sql, chamada de RPC pelo Supabase falso em modo repasse e
// restauração do estado semeado. Tudo FICTÍCIO (CPFs válidos gerados por script, e-mails @teste.example). Nada fala com a produção.
const { create } = require('./fake-sign.cjs');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../../..');
const DB = process.env.SIGN_DB || 'sign';            // DEPOIS: esquema atual + migração da 1.4
const DB_ANTES = process.env.SIGN_DB_ANTES || 'sign_antes'; // ANTES: só o esquema atual
const PORT = process.env.PGPORT || '54350';
const MIGRACAO = path.join(ROOT, 'supabase/migrations/20261126120000_sign_perfil_fonte_unica.sql');

const U = {
  U1: { email: 'pronto@teste.example', id: 'f1000000-0000-4000-8000-000000000001', name: 'Ana Exemplo da Silva', cpf: '33698027089' },
  U2: { email: 'outro@teste.example', id: 'f1000000-0000-4000-8000-000000000002', name: 'Bruno Outro Exemplo', cpf: '98263630304' },
  U3: { email: 'vazio@teste.example', id: 'f1000000-0000-4000-8000-000000000003', name: null, cpf: null, cpfLivre: '22397653990', meta: { name: 'Banco Falso S.A.', cpf: '11288006322', phone: '5511999990000' } },
  U4: { email: 'parceiro@teste.example', id: 'f1000000-0000-4000-8000-000000000004', name: 'Dora Parceira Exemplo', cpf: '00488180031', phone: '5511911112222' },
  U5: { email: 'envelope@teste.example', id: 'f1000000-0000-4000-8000-000000000005', name: 'Edu Envelope Exemplo', cpf: '79855663098' },
  U6: { email: 'cert@teste.example', id: 'f1000000-0000-4000-8000-000000000006', name: 'Fabi Certificada Exemplo', cpf: '43966982080' },
  U7: { email: 'semlinha@teste.example', id: 'f1000000-0000-4000-8000-000000000007', name: null, cpf: null },
};

/* um Supabase falso em modo repasse + servidor HTTP próprio (sem navegador) para os testes de banco */
async function banco(db) {
  const fake = create({ pg: db });
  const port = await fake.start();
  const base = `http://127.0.0.1:${port}`;
  async function rpc(fn, body, who) {
    const headers = { 'content-type': 'application/json' };
    if (who) headers.authorization = 'Bearer ' + fake.mint(typeof who === 'string' ? who : who.email).access_token;
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const txt = await r.text();
    let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = txt; }
    return { status: r.status, body: json, msg: json && json.message ? String(json.message) : '' };
  }
  const q = async (sql, params) => (await fake.query(sql, params)).rows;
  return { fake, rpc, q, db, close: () => fake.stop() };
}

/* volta os perfis semeados ao estado do seed.sql (os testes mudam nome/CPF) */
async function restaurar(q) {
  await q(`update public.profiles set full_name = null, cpf = null where id = $1`, [U.U3.id]);
  await q(`update auth.users set raw_user_meta_data = $2, email_confirmed_at = now() where id = $1`, [U.U3.id, JSON.stringify(U.U3.meta)]);
  for (const k of ['U1', 'U2', 'U4', 'U5', 'U6']) await q(`update public.profiles set full_name = $2, cpf = $3, updated_at = now() where id = $1`, [U[k].id, U[k].name, U[k].cpf]);
  await q(`update auth.users set email_confirmed_at = now() where id = $1`, [U.U7.id]);
  await q(`delete from public.profiles where id = $1`, [U.U7.id]);
  await q(`update public.sign_identity set phone = null, phone_verified_at = null where user_id = $1`, [U.U3.id]);
  await q(`delete from public.sign_accounts where user_id = any($1)`, [[U.U1.id, U.U3.id]]);
}

/* recria os bancos locais (precisa do esquema fora do repositório em SIGN_SCHEMA; padrão /root/sign-schema.sql) */
function reset(modo) {
  const schema = process.env.SIGN_SCHEMA || '/root/sign-schema.sql';
  if (!fs.existsSync(schema)) throw new Error('defina SIGN_SCHEMA com o esquema exportado (fora do repositório)');
  return cp.execFileSync(path.join(ROOT, 'scripts/sign-local/reset.sh'), [modo || 'ambos'], { env: { ...process.env, SIGN_SCHEMA: schema }, encoding: 'utf8' });
}

/* psql como arquivo (migração, reversão): lança erro se algo falhar */
function psqlFile(db, file) {
  return cp.execFileSync('psql', ['-X', '-q', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } });
}

module.exports = { U, banco, restaurar, reset, psqlFile, DB, DB_ANTES, MIGRACAO, ROOT, PORT };
