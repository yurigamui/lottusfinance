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

/* Saída pedida pelo usuário: apaga também o rascunho em memória. O evento SIGNED_OUT chega com voluntary=true. */
let voluntary = false;
export async function signOut() {
  meCache = null; meFlight = null; draft = null; voluntary = true;
  try { await sb.auth.signOut(); } catch (e) { /* o armazenamento local é limpo mesmo assim */ }
  setTimeout(() => { voluntary = false; }, 1000);
}

/* Sessão que já terminou (token recusado, saída em outra aba): limpa o armazenamento local sem avisar o servidor e SEM apagar o rascunho. */
export async function dropSession() {
  meCache = null; meFlight = null; voluntary = true;
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* já estava limpa */ }
  setTimeout(() => { voluntary = false; }, 1000);
}

export function onSignedOut(cb) {
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { meCache = null; meFlight = null; cb(voluntary); } });
}

/* Erro de RPC (PostgREST) -> Error com code/status/name. A mensagem crua nunca vai para a tela; ela só serve ao classify. */
function rpcError(e, status) {
  const err = new Error(String(e.message || ''));
  err.code = /email_not_confirmed/.test(err.message) ? 'email_not_confirmed' : (e.code || '');
  err.status = e.status ?? status;
  err.name = e.name || 'Error';
  return err;
}

/* sign_me: sem argumentos (a identidade vem do token, nunca de um parâmetro). Cache de 5 s e chamadas simultâneas
   dividem a mesma requisição (o shell e a tela pedem juntos). fresh:true ignora o cache (Tentar de novo). */
let meFlight = null;
export async function me(opts) {
  const fresh = !!(opts && opts.fresh);
  if (!fresh && meCache && Date.now() - meCache.t < 5000) return meCache.v;
  if (!fresh && meFlight) return meFlight;
  const run = (async () => {
    let res;
    try { res = await sb.rpc('sign_me'); } catch (e) { res = { error: e }; }
    if (res.error) throw rpcError(res.error, res.status);
    meCache = { t: Date.now(), v: res.data || {} };
    return meCache.v;
  })();
  meFlight = run;
  const clear = () => { if (meFlight === run) meFlight = null; };
  run.then(clear, clear);
  return run;
}

/* 1.4: grava nome (e CPF, só se ainda vazio) em profiles. O payload leva só name e cpf; quem é o usuário vem do token.
   Devolve sign_me atualizado e já o põe no cache. */
export async function profileSave(payload) {
  let res;
  try { res = await sb.rpc('sign_profile_save', { p: payload }); } catch (e) { res = { error: e }; }
  if (res.error) throw rpcError(res.error, res.status);
  failIfNotOk(res.data); /* 1.5: erros de CPF voltam como {ok:false, error} para a tentativa ficar gravada */
  meCache = { t: Date.now(), v: res.data || {} };
  return meCache.v;
}

/* 1.5: o servidor devolve {ok:false, error, remaining?, retry_after?} em vez de exceção nos casos esperados. Vira Error com code e dados. */
function failIfNotOk(d) {
  if (!d || d.ok !== false) return;
  const err = new Error(String(d.error || 'error'));
  err.code = String(d.error || '');
  err.status = 200;
  err.remaining = d.remaining;
  err.retryAfter = d.retry_after;
  throw err;
}

/* Verificação de contato (1.5). Devolvem o objeto do servidor (ok:true) ou lançam Error com code, remaining e retryAfter. */
async function callRpc(fn, args) {
  let res;
  try { res = await sb.rpc(fn, args); } catch (e) { res = { error: e }; }
  if (res.error) throw rpcError(res.error, res.status);
  failIfNotOk(res.data);
  return res.data || {};
}
export const phoneSend = (phone, channel) => callRpc('sign_phone_send', { p_phone: phone || '', p_channel: channel });
export async function phoneVerify(code) {
  const d = await callRpc('sign_phone_verify', { p_code: code });
  meCache = { t: Date.now(), v: d };
  return d;
}
export const certChallenge = () => callRpc('sign_cert_challenge', {});

/* O sign_me em cache fica velho depois de uma verificação ou de um vínculo: a próxima leitura vai ao servidor. */
export function forgetMe() { meCache = null; meFlight = null; }

/* Token da sessão para chamar a função de borda do certificado (nunca é guardado fora do cliente do Supabase). */
export async function accessToken() { const s = await getSession(); return s && s.access_token ? s.access_token : ''; }

/* Rascunho do perfil guardado só em memória (nunca em storage) enquanto a sessão termina e o usuário entra de novo. */
let draft = null;
export const setDraft = (uid, data) => { draft = uid ? { uid, data } : null; };
export const takeDraft = (uid) => { const d = draft && draft.uid === uid ? draft.data : null; draft = null; return d; };

/* Classifica um erro em: naoconfirmado | sessao | limite | credenciais | senha | existe | nome | cpf | cpf_travado | cpf_usado | cpf_limite | entrada | rede | geral */
export function classify(e) {
  if (!e) return null;
  const code = String(e.code || e.error_code || '');
  const msg = String(e.message || '');
  const st = e.status;
  if (code === 'email_not_confirmed' || /email not confirmed|email_not_confirmed/i.test(msg)) return 'naoconfirmado';
  if (/invalid_name/.test(msg)) return 'nome';
  if (/invalid_cpf/.test(msg)) return 'cpf';
  if (/cpf_locked/.test(msg)) return 'cpf_travado';
  if (/cpf_in_use/.test(msg)) return 'cpf_usado';
  if (/too_many_attempts/.test(msg)) return 'cpf_limite';
  if (/invalid_input/.test(msg)) return 'entrada';
  if (st === 401 || /^PGRST30\d$/.test(code) || /\bJWT\b|jwt expired/i.test(msg)) return 'sessao';
  if (st === 429 || /over_\w*rate_limit|rate limit|too many/i.test(code + ' ' + msg)) return 'limite';
  if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'credenciais';
  if (code === 'weak_password' || /password should be|weak password/i.test(msg)) return 'senha';
  if (code === 'user_already_exists' || /already registered|already been registered/i.test(msg)) return 'existe';
  if (e.name === 'AuthRetryableFetchError' || st === 0 || (!st && /fetch|network|abort|load failed/i.test(msg))) return 'rede';
  return 'geral';
}
