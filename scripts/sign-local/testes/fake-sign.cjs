// Supabase FALSO e local, só para testar o Lottus Sign 1.1 (Entrar e criar conta). Sem Postgres, tudo em memória.
// Simula apenas /auth/v1/* (token, signup, resend, user, logout) e /rest/v1/rpc/sign_me. Nada aqui fala com a produção.
// Modos forçáveis (state.mode): delay (ms), down (derruba a conexão), rl429 {token, signup, resend}, revealExisting, autoConfirm,
// meName, meNoName, meVerified, meCert, meCertVencido (conteúdo de sign_me) e meDown (só sign_me cai).
// Dados fictícios: contas @teste.example.
const http = require('http');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.local`;
const parse = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString()); } catch { return null; } };

function create() {
  const state = {
    users: new Map(),
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
          if (!u || u.password !== body.password) return authErr(res, 'Invalid login credentials', 400, 'invalid_credentials');
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
  const start = () => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));
  return { state, server, start, seed, mint, stop: () => server.close() };
}
module.exports = { create };
