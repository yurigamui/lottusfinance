// Supabase falso, LOCAL, só para testar o Wealth: Auth (senha, cadastro, MFA TOTP simplificado) e /rest/v1/rpc.
// Cada RPC roda no Postgres local como o papel "authenticated" (ou "anon" sem login), com request.jwt.claims do token,
// exatamente como o PostgREST faz. Nada aqui fala com a produção.
const http = require('http');
const { Pool } = require('pg');
const pool = new Pool({ host: '127.0.0.1', port: 54340, user: 'postgres', database: process.env.WDB || 'wealth', max: 8 });
pool.on('error', () => {}); process.on('uncaughtException', (e) => console.error('erro', e.message));
const PORT = +process.env.PORT || 54399;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.local`;
const parse = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString()); } catch { return null; } };
const factors = new Map(); const pendingEmail = new Map(); // userId -> [{id, status, factor_type}]
const log = [];

function session(user, aal = 'aal1') {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', aal, amr: [{ method: aal === 'aal2' ? 'totp' : 'password', timestamp: now }], exp: now + 3600, iat: now, session_id: 'local' };
  return { access_token: jwt(claims), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: Buffer.from(JSON.stringify({ id: user.id, aal })).toString('base64url'), user: userObj(user) };
}
function userObj(u) {
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(), phone: '', app_metadata: { provider: 'email' }, user_metadata: u.raw_user_meta_data || {}, factors: (factors.get(u.id) || []), created_at: new Date().toISOString() };
}
async function q(text, params) { const c = await pool.connect(); try { return await c.query(text, params); } finally { c.release(); } }
const send = (res, status, body, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', ...extra }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const authErr = (res, msg, code = 400, error_code = 'invalid_credentials') => send(res, code, { code, error_code, msg, message: msg, error: error_code, error_description: msg });

const fnTypes = new Map();
async function fnInfo(name, keys) {
  const k = name + '|' + keys.sort().join(',');
  if (fnTypes.has(k)) return fnTypes.get(k);
  const r = await q(`select p.oid, p.prorettype::regtype::text rt, p.proretset, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) types, p.pronargs, p.pronargdefaults
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [name]);
  const cand = r.rows.find((f) => { const names = (f.proargnames || []).slice(0, f.pronargs); return keys.every((x) => names.includes(x)) && names.length - f.pronargdefaults <= keys.length; });
  fnTypes.set(k, cand || null);
  return cand || null;
}
function lit(v, type) {
  if (v === null || v === undefined) return null;
  if (type.endsWith('[]')) return '{' + (Array.isArray(v) ? v : [v]).map((x) => '"' + String(x).replace(/"/g, '\\"') + '"').join(',') + '}';
  if (type === 'jsonb' || type === 'json') return JSON.stringify(v);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

async function rpc(req, res, name, body) {
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
  const claims = parse(tok) || {};
  const role = claims.role === 'authenticated' ? 'authenticated' : 'anon';
  const keys = Object.keys(body || {});
  const f = await fnInfo(name, keys);
  if (!f) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}(${keys.join(', ')}) in the schema cache`, details: null, hint: null });
  const names = (f.proargnames || []).slice(0, f.pronargs);
  const args = keys.map((k, i) => `${k} => $${i + 1}::${f.types[names.indexOf(k)]}`);
  const vals = keys.map((k) => lit(body[k], f.types[names.indexOf(k)]));
  const call = `public.${name}(${args.join(', ')})`;
  const sql = f.rt === 'void' ? `select ${call}, null::jsonb as r` : f.proretset ? `select coalesce(jsonb_agg(to_jsonb(x)), '[]') as r from ${call} x` : `select to_jsonb(${call}) as r`;
  const c = await pool.connect();
  const t0 = Date.now();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)`, [JSON.stringify(role === 'anon' ? { role: 'anon' } : claims), role]);
    const r = await c.query(sql, vals);
    await c.query('commit');
    log.push({ name, ms: Date.now() - t0, ok: true });
    send(res, 200, r.rows[0].r);
  } catch (e) {
    await c.query('rollback').catch(() => {});
    log.push({ name, ms: Date.now() - t0, ok: false, err: e.message });
    const code = e.code === '42501' ? 403 : e.code === 'P0001' ? 400 : 400;
    send(res, code, { code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null });
  } finally { c.release(); }
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x');
  let raw = ''; for await (const ch of req) raw += ch;
  const body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
  try {
    const p = url.pathname;
    if (p === '/__log') return send(res, 200, log.splice(0));
    if (p.startsWith("/rest/v1/rpc/")) return await rpc(req, res, p.split("/").pop(), body);
    if (p === '/auth/v1/token') {
      const gt = url.searchParams.get('grant_type');
      if (gt === 'password') {
        const r = await q(`select * from auth.users where lower(email) = lower($1) and encrypted_password = crypt($2, encrypted_password)`, [body.email || '', body.password || '']);
        if (!r.rows[0]) return authErr(res, 'Invalid login credentials');
        return send(res, 200, session(r.rows[0]));
      }
      if (gt === 'refresh_token') {
        let rt; try { rt = JSON.parse(Buffer.from(body.refresh_token, 'base64url').toString()); } catch { return authErr(res, 'Invalid Refresh Token', 400, 'refresh_token_not_found'); }
        const r = await q('select * from auth.users where id = $1', [rt.id]);
        return r.rows[0] ? send(res, 200, session(r.rows[0], rt.aal)) : authErr(res, 'Invalid Refresh Token', 400, 'refresh_token_not_found');
      }
    }
    if (p === '/auth/v1/signup') {
      if (!body.password || body.password.length < 6) return authErr(res, 'Password should be at least 6 characters.', 422, 'weak_password');
      const ex = await q('select 1 from auth.users where lower(email) = lower($1)', [body.email || '']);
      if (ex.rows[0]) return authErr(res, 'User already registered', 422, 'user_already_exists');
      const r = await q(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values (lower($1), crypt($2, gen_salt('bf')), $3) returning *`, [body.email, body.password, body.data || {}]);
      return send(res, 200, session(r.rows[0]));
    }
    if (p === '/auth/v1/user') {
      const c = parse((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!c || !c.sub) return authErr(res, 'invalid JWT', 401, 'bad_jwt');
      if (req.method === 'PUT') {
        if (body.password) await q(`update auth.users set encrypted_password = crypt($2, gen_salt('bf')) where id = $1`, [c.sub, body.password]);
        if (body.data) await q(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2 where id = $1`, [c.sub, body.data]);
        if (body.email) { pendingEmail.set(c.sub, String(body.email).toLowerCase()); console.log('troca de e-mail pedida', c.sub, body.email); }
      }
      const r = await q('select * from auth.users where id = $1', [c.sub]);
      return r.rows[0] ? send(res, 200, userObj(r.rows[0])) : authErr(res, 'User not found', 404, 'user_not_found');
    }
    // função de borda de cobrança: sem provedor ligado no ambiente local (como em produção com BILLING_PROVIDER=manual)
    // FAKE_TRIO=1 simula a Trio devolvendo o Pix copia e cola da recorrência (código de exemplo, não pagável)
    if (p === '/functions/v1/wealth-billing') return send(res, 200, process.env.FAKE_TRIO === '1' ? { ok: true, provider: 'trio', url: null, pix_payload: '00020101021226850014br.gov.bcb.pix2563exemplo.invalido/rec/0000000000000000000000000000052040000530398654040.005802BR5913LOTTUS EXEMPLO6009SAO PAULO62070503***6304ABCD', authorized: false } : { ok: true, provider: 'manual', url: null });
    if (p === '/auth/v1/logout') return send(res, 204);
    if (p === '/auth/v1/recover') return send(res, 200, {});
    if (p.startsWith('/auth/v1/factors')) {
      const c = parse((req.headers.authorization || '').replace(/^Bearer /, '')) || {};
      const list = factors.get(c.sub) || []; factors.set(c.sub, list);
      const parts = p.split('/');
      if (p === '/auth/v1/factors' && req.method === 'POST') {
        const f = { id: 'f-' + Date.now(), factor_type: 'totp', status: 'unverified', friendly_name: body.friendly_name || 'app', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        list.push(f);
        return send(res, 200, { id: f.id, type: 'totp', friendly_name: f.friendly_name, totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Lottus:teste?secret=JBSWY3DPEHPK3PXP' } });
      }
      if (parts[5] === 'challenge') return send(res, 200, { id: 'ch-' + Date.now(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
      if (parts[5] === 'verify') {
        if (body.code !== '123456') return authErr(res, 'Invalid TOTP code entered', 422, 'mfa_verification_failed');
        const f = list.find((x) => x.id === parts[4]); if (f) f.status = 'verified';
        const r = await q('select * from auth.users where id = $1', [c.sub]);
        return send(res, 200, session(r.rows[0], 'aal2'));
      }
      if (req.method === 'DELETE') { factors.set(c.sub, list.filter((x) => x.id !== parts[4])); return send(res, 200, { id: parts[4] }); }
    }
    send(res, 404, { message: 'não simulado: ' + req.method + ' ' + p });
  } catch (e) { send(res, 500, { message: e.message }); }
}).listen(PORT, '127.0.0.1', () => console.info('fake supabase em http://127.0.0.1:' + PORT));
