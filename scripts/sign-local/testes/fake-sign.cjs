// Supabase FALSO e local, só para testar o Lottus Sign (1.1 em diante). Nada aqui fala com a produção.
// Dois modos:
//  - memória (padrão): Auth em memória e /rest/v1/rpc/sign_me simulado (os testes t-ac, t-shell, t-layout, t-comp, t-corr usam este).
//  - repasse (create({ pg: '<banco>' }) ou open({ pg })): Auth lê auth.users do Postgres LOCAL (127.0.0.1:54350, ver reset.sh) e TODA
//    chamada POST /rest/v1/rpc/<fn> roda no banco real como o PostgREST faz: uma transação com request.jwt.claims vindo do token
//    emitido por este Auth (nunca do corpo), set local role authenticated (ou anon sem token válido), select public.<fn>(...), commit.
//    Erros do Postgres viram {code, message, details, hint} (P0001 = 400; 42501 = 401 sem login, 403 com login). Precisa do pacote `pg`
//    (npm i em scripts/sign-local/testes; node_modules não é commitado). Modelo: scripts/wealth-local/fake-supabase.cjs.
// Simula /auth/v1/* (token, signup, resend, user, logout). No repasse o signup continua só em memória (não grava no banco).
// Modos forçáveis (state.mode): delay (ms), down (derruba a conexão), rl429 {token, signup, resend}, revealExisting, autoConfirm,
// meName, meNoName, meVerified, meCert, meCertVencido (conteúdo de sign_me, só no modo memória) e meDown (só sign_me cai).
// Só no repasse: expired (401 JWT expired em toda RPC), rpcFail { fn: { status, body } }, rpcDrop { fn: true } (derruba a conexão), rpcDelay { fn: ms }.
// 1.5: (a) fake.codeOf(email): lê do banco isolado o código de 6 dígitos que sign_phone_send gravou em sign_outbox (o e-mail real não existe aqui);
//      (b) "função de borda" do certificado SIMULADA em /functions/v1/sign-cert-validate (a real, T-07, não existe no repositório): GET = ping;
//          POST {nonce, signed_b64} lê o arquivo como JSON de campos do certificado e chama _sign_cert_save no banco isolado (o resultado
//          do vínculo é do banco; a validação criptográfica NÃO é simulada). state.mode.certEdge: 'down' (derruba a conexão), 'timeout' (não responde),
//          '404', '500' ou ausente (funciona). Só no repasse.
// Dados fictícios: contas @teste.example.
const http = require('http');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.local`;
const parse = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString()); } catch { return null; } };

let Pool = null;
try { ({ Pool } = require('pg')); } catch { /* sem o pacote pg: só o modo memória funciona */ }
const rpcCount = (state, fn) => state.log.filter((l) => l.path === '/rest/v1/rpc/' + fn).length;

function create(opts = {}) {
  const pgdb = opts.pg || null;
  let pool = null;
  if (pgdb) {
    if (!Pool) throw new Error('modo repasse precisa do pacote pg: rode "npm i" em scripts/sign-local/testes');
    pool = new Pool({ host: '127.0.0.1', port: Number(process.env.PGPORT) || 54350, user: 'postgres', database: pgdb, max: 12 });
    pool.on('error', () => {});
  }
  const state = {
    users: new Map(),
    rpcMs: [],
    mode: {},
    log: [],
  };
  const seed = () => {
    state.users.clear();
    state.users.set('ok@teste.example', { id: 'u-1', email: 'ok@teste.example', password: 'senha-correta-1', confirmed: true, onboarding_done: false });
    state.users.set('pronto@teste.example', { id: 'u-2', email: 'pronto@teste.example', password: 'senha-correta-1', confirmed: true, onboarding_done: true });
    state.users.set('pendente@teste.example', { id: 'u-3', email: 'pendente@teste.example', password: 'senha-correta-1', confirmed: false, onboarding_done: false });
    state.mode = {}; state.log.length = 0;
  };
  seed();

  const userObj = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null, phone: '', app_metadata: { provider: 'email' }, user_metadata: u.meta || {}, identities: [{}], created_at: new Date().toISOString() });
  const session = (u) => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', aal: 'aal1', exp: now + 3600, iat: now, session_id: 'local' };
    return { access_token: jwt(claims), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: Buffer.from(JSON.stringify({ id: u.id })).toString('base64url'), user: userObj(u) };
  };
  const send = (res, status, body, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', ...extra }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const authErr = (res, msg, code, error_code) => send(res, code, { code, error_code, msg, message: msg, error: error_code, error_description: msg });
  const byId = (id) => [...state.users.values()].find((u) => u.id === id);
  const rl = (res) => authErr(res, 'Rate limit exceeded', 429, 'over_request_rate_limit');

  /* ---- repasse ao Postgres local (só com pool) ---- */
  const fnTypes = new Map();
  async function fnInfo(name, keys) {
    const k = name + '|' + [...keys].sort().join(',');
    if (fnTypes.has(k)) return fnTypes.get(k);
    const r = await pool.query(`select p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) as types, p.pronargs, p.pronargdefaults, p.proretset
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [name]);
    const cand = r.rows.find((f) => { const names = (f.proargnames || []).slice(0, f.pronargs); return keys.every((x) => names.includes(x)) && f.pronargs - f.pronargdefaults <= keys.length; });
    fnTypes.set(k, cand || null);
    return cand || null;
  }
  const lit = (v, type) => (v === null || v === undefined ? null : type === 'jsonb' || type === 'json' || typeof v === 'object' ? JSON.stringify(v) : String(v));
  async function rpcPg(req, res, name, body, tok) {
    const claims = parse(tok);
    const user = claims && claims.sub && byId(claims.sub);
    const m = state.mode;
    if (m.rpcDrop && m.rpcDrop[name]) return req.socket.destroy();
    if (m.rpcDelay && m.rpcDelay[name]) await new Promise((r) => setTimeout(r, m.rpcDelay[name]));
    if (m.rpcFail && m.rpcFail[name]) return send(res, m.rpcFail[name].status, m.rpcFail[name].body);
    if (m.expired && claims) return send(res, 401, { code: 'PGRST303', message: 'JWT expired', details: null, hint: null });
    const role = user ? 'authenticated' : 'anon';
    const keys = Object.keys(body || {});
    const f = await fnInfo(name, keys);
    if (!f) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}(${keys.join(', ')}) in the schema cache`, details: null, hint: null });
    const names = (f.proargnames || []).slice(0, f.pronargs);
    const args = keys.map((k, i) => `${k} => $${i + 1}::${f.types[names.indexOf(k)]}`);
    const vals = keys.map((k) => lit(body[k], f.types[names.indexOf(k)]));
    const call = `public.${name}(${args.join(', ')})`;
    const sql = f.proretset ? `select coalesce(jsonb_agg(to_jsonb(x)), '[]') as r from ${call} x` : `select to_jsonb(${call}) as r`;
    const jwtClaims = role === 'anon' ? { role: 'anon' } : { sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated' };
    const c = await pool.connect();
    const t0 = process.hrtime.bigint();
    try {
      await c.query('begin');
      await c.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify(jwtClaims)]);
      await c.query('set local role ' + role);
      const r = await c.query(sql, vals);
      await c.query('commit');
      state.rpcMs.push({ fn: name, ms: Number(process.hrtime.bigint() - t0) / 1e6 });
      send(res, 200, r.rows[0].r);
    } catch (e) {
      await c.query('rollback').catch(() => {});
      const status = e.code === '42501' ? (role === 'anon' ? 401 : 403) : 400;
      send(res, status, { code: e.code || 'P0001', message: e.message, details: e.detail || null, hint: e.hint || null });
    } finally { c.release(); }
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url, 'http://x');
    let raw = ''; for await (const ch of req) raw += ch;
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
    const p = url.pathname;
    if (p.startsWith('/__')) {
      if (p === '/__log') return send(res, 200, state.log.splice(0));
      return send(res, 404, {});
    }
    state.log.push({ method: req.method, path: p, query: url.search, body, auth: !!req.headers.authorization });
    if (state.mode.down) return req.socket.destroy();
    if (state.mode.delay) await new Promise((r) => setTimeout(r, state.mode.delay));
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
    try {
      if (p === '/auth/v1/token') {
        const gt = url.searchParams.get('grant_type');
        if (gt === 'password') {
          if (state.mode.rl429 && state.mode.rl429.token) return rl(res);
          const u = state.users.get(String(body.email || '').toLowerCase());
          let okPw = !!u && u.password === body.password;
          if (u && pool) okPw = (await pool.query('select encrypted_password = extensions.crypt($2, encrypted_password) as ok from auth.users where id = $1', [u.id, String(body.password || '')])).rows[0].ok;
          if (!u || !okPw) return authErr(res, 'Invalid login credentials', 400, 'invalid_credentials');
          if (!u.confirmed) return authErr(res, 'Email not confirmed', 400, 'email_not_confirmed');
          return send(res, 200, session(u));
        }
        if (gt === 'refresh_token') {
          let rt; try { rt = JSON.parse(Buffer.from(body.refresh_token, 'base64url').toString()); } catch { return authErr(res, 'Invalid Refresh Token', 400, 'refresh_token_not_found'); }
          const u = byId(rt.id);
          return u ? send(res, 200, session(u)) : authErr(res, 'Invalid Refresh Token', 400, 'refresh_token_not_found');
        }
      }
      if (p === '/auth/v1/signup') {
        if (state.mode.rl429 && state.mode.rl429.signup) return rl(res);
        if (!body.password || body.password.length < 6) return authErr(res, 'Password should be at least 6 characters.', 422, 'weak_password');
        const email = String(body.email || '').toLowerCase();
        const ex = state.users.get(email);
        if (ex) {
          if (state.mode.revealExisting) return authErr(res, 'User already registered', 422, 'user_already_exists');
          return send(res, 200, userObj({ ...ex, id: 'u-fake', confirmed: false }));
        }
        const u = { id: 'u-' + (state.users.size + 1), email, password: body.password, confirmed: !!state.mode.autoConfirm, onboarding_done: false, meta: body.data || {} };
        state.users.set(email, u);
        return send(res, 200, state.mode.autoConfirm ? session(u) : userObj(u));
      }
      if (p === '/auth/v1/resend') {
        if (state.mode.rl429 && state.mode.rl429.resend) return rl(res);
        return send(res, 200, { message_id: 'x' });
      }
      if (p === '/auth/v1/user') {
        const c = parse(tok);
        const u = c && byId(c.sub);
        return u ? send(res, 200, userObj(u)) : authErr(res, 'invalid JWT', 401, 'bad_jwt');
      }
      if (p === '/auth/v1/logout') return send(res, 204);
      if (p === '/functions/v1/sign-cert-validate') {
        const m = state.mode.certEdge;
        if (m === 'down') return req.socket.destroy();
        if (m === 'timeout') return; /* nunca responde: o cliente desiste pelo próprio limite de tempo */
        if (m === '404') return send(res, 404, { message: 'Function not found' });
        if (m === '500') return send(res, 500, { message: 'boom' });
        if (req.method === 'GET') return send(res, 200, { ok: true });
        const claims = parse(tok); const u = claims && byId(claims.sub);
        if (!u || !pool) return send(res, 401, { ok: false, error: 'unauthorized' });
        let cert; try { cert = JSON.parse(Buffer.from(String(body.signed_b64 || ''), 'base64').toString('utf8')); } catch { return send(res, 200, { ok: false, error: 'cert_chain_invalid' }); }
        try { await pool.query('select public._sign_cert_save($1::uuid, $2::jsonb)', [u.id, JSON.stringify({ ...cert, nonce: body.nonce })]); return send(res, 200, { ok: true }); } catch (e) { return send(res, 200, { ok: false, error: String(e.message) }); }
      }
      if (pool && p.startsWith('/rest/v1/rpc/')) return await rpcPg(req, res, p.slice('/rest/v1/rpc/'.length), body, tok);
      if (p === '/rest/v1/rpc/sign_me') {
        const c = parse(tok);
        const u = c && byId(c.sub);
        if (!u) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid' });
        if (!u.confirmed) return send(res, 400, { code: 'P0001', message: 'email_not_confirmed', details: null, hint: null });
        if (state.mode.meDown) return req.socket.destroy();
        /* Campos reais de sign_me usados pelo shell 1.0: name, cert{not_after...}|null e verified. Modos: meName (nome de 60 letras sem espaço), meNoName, meVerified, meCert, meCertVencido */
        const name = state.mode.meNoName ? '' : state.mode.meName ? 'N'.repeat(60) : 'Ana Exemplo da Silva';
        const future = new Date(Date.now() + 365 * 864e5).toISOString(), past = new Date(Date.now() - 864e5).toISOString();
        const cert = state.mode.meCert ? { subject: 'CN=Ana', issuer: 'AC Teste', not_after: future } : state.mode.meCertVencido ? { subject: 'CN=Ana', issuer: 'AC Teste', not_after: past } : null;
        const verified = !!(state.mode.meVerified || state.mode.meCert || state.mode.meCertVencido);
        return send(res, 200, { email: u.email, name, cert, verified, onboarding_done: !!u.onboarding_done, channels: { email: true } });
      }
      send(res, 404, { message: 'não simulado: ' + req.method + ' ' + p });
    } catch (e) { send(res, 500, { message: e.message }); }
  });

  /* token de sessão para simular o link do e-mail (#access_token=...&refresh_token=...) */
  const mint = (email) => { const s = session(state.users.get(email)); return { access_token: s.access_token, refresh_token: s.refresh_token }; };
  /* repasse: usuários vêm de auth.users do banco local (senha conferida com crypt no login) */
  async function loadUsers() {
    state.users.clear();
    const r = await pool.query(`select u.id, lower(u.email) as email, u.email_confirmed_at is not null as confirmed, u.raw_user_meta_data as meta,
      coalesce((select i.onboarding_done from public.sign_identity i where i.user_id = u.id), false) as onboarding_done from auth.users u`);
    for (const u of r.rows) state.users.set(u.email, { id: u.id, email: u.email, password: null, confirmed: u.confirmed, onboarding_done: u.onboarding_done, meta: u.meta || {} });
  }
  const start = async () => { if (pool) await loadUsers(); return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port))); };
  const query = (sql, params) => pool.query(sql, params);
  /* o código mais recente que o banco gravou para o usuário (só enquanto o envio está 'queued', R2) */
  const codeOf = async (email) => ((await pool.query(`select o.params ->> 'code' as c from public.sign_outbox o join auth.users u on u.id = o.user_id where lower(u.email) = lower($1) order by o.id desc limit 1`, [email])).rows[0] || {}).c;
  return { state, server, start, seed, mint, query, codeOf, loadUsers, stop: () => { server.close(); if (pool) pool.end().catch(() => {}); } };
}
module.exports = { create, rpcCount };
