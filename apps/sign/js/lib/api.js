/* Lottus Sign: acesso ao Supabase (Auth e sign_me) e tradução de erros. A senha nunca é registrada nem guardada aqui. */
let sb = null;
let cfg = {};
let meCache = null;

function timedFetch(url, opts) {
  const ms = Number(cfg.timeoutMs) || 15000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const parent = opts && opts.signal;
  if (parent) parent.addEventListener('abort', () => ctl.abort());
  return fetch(url, Object.assign({}, opts, { signal: ctl.signal })).finally(() => clearTimeout(t));
}

export function initApi(config) {
  cfg = config || {};
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  });
}

export const redirectTo = () => location.origin + location.pathname;

export async function getSession() {
  try { const { data } = await sb.auth.getSession(); return data && data.session ? data.session : null; } catch (e) { return null; }
}

export async function signIn(email, password) {
  meCache = null;
  try { return await sb.auth.signInWithPassword({ email, password }); } catch (e) { return { error: e }; }
}

export async function signUp(email, password, name, versions) {
  const data = { name, terms_version: versions.terms, privacy_version: versions.privacy };
  try { return await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo(), data } }); } catch (e) { return { error: e }; }
}

export async function resend(email) {
  try { return await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } }); } catch (e) { return { error: e }; }
}

export async function setSessionFrom(access_token, refresh_token) {
  meCache = null;
  try { return await sb.auth.setSession({ access_token, refresh_token }); } catch (e) { return { error: e }; }
}

export async function signOut() {
  meCache = null;
  try { await sb.auth.signOut(); } catch (e) { /* o armazenamento local é limpo mesmo assim */ }
}

export function onSignedOut(cb) {
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { meCache = null; cb(); } });
}

/* sign_me: sem argumentos (a identidade vem do token, nunca de um parâmetro). Cache curto para não chamar duas vezes no login. */
export async function me() {
  if (meCache && Date.now() - meCache.t < 5000) return meCache.v;
  let res;
  try { res = await sb.rpc('sign_me'); } catch (e) { res = { error: e }; }
  if (res.error) {
    const err = new Error(String(res.error.message || ''));
    err.code = /email_not_confirmed/.test(err.message) ? 'email_not_confirmed' : (res.error.code || '');
    err.status = res.error.status;
    err.name = res.error.name || 'Error';
    throw err;
  }
  meCache = { t: Date.now(), v: res.data || {} };
  return meCache.v;
}

/* Classifica um erro em: naoconfirmado | limite | credenciais | senha | existe | rede | geral */
export function classify(e) {
  if (!e) return null;
  const code = String(e.code || e.error_code || '');
  const msg = String(e.message || '');
  const st = e.status;
  if (code === 'email_not_confirmed' || /email not confirmed|email_not_confirmed/i.test(msg)) return 'naoconfirmado';
  if (st === 429 || /over_\w*rate_limit|rate limit|too many/i.test(code + ' ' + msg)) return 'limite';
  if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'credenciais';
  if (code === 'weak_password' || /password should be|weak password/i.test(msg)) return 'senha';
  if (code === 'user_already_exists' || /already registered|already been registered/i.test(msg)) return 'existe';
  if (e.name === 'AuthRetryableFetchError' || st === 0 || (!st && /fetch|network|abort|load failed/i.test(msg))) return 'rede';
  return 'geral';
}
