// Utilitários dos "prints do painel": serve o app real com a CSP do _headers e responde TODA a rede com dados fictícios.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const REF = 'rowhslnnlzfbhmzbylbz';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function headers(app) {
  const h = {}; let on = false;
  for (const l of fs.readFileSync(path.join(app, '_headers'), 'utf8').split('\n')) {
    if (/^\/\*/.test(l)) { on = true; continue; } if (!/^\s/.test(l)) { on = false; continue; }
    if (on && l.includes(':')) { const i = l.indexOf(':'); h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
  }
  delete h['strict-transport-security'];
  if (h['content-security-policy']) h['content-security-policy'] = h['content-security-policy'].replace(/;?\s*upgrade-insecure-requests/, '');
  return h;
}
function serve(app) {
  const hd = headers(app);
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      let p = path.join(app, decodeURIComponent(q.url.split('?')[0]));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { r.writeHead(404); return r.end('404'); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', ...hd }); r.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}
// JWT fictício (assinatura inválida; o supabase-js no navegador não a verifica), válido por 10 anos
function fakeSession(user) {
  const now = Math.floor(Date.now() / 1000), exp = now + 315360000;
  const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', aal: 'aal1', exp, iat: now })}.fake`;
  return { access_token: tok, token_type: 'bearer', expires_in: 315360000, expires_at: exp, refresh_token: 'fake-refresh', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, email_confirmed_at: '2026-01-10T12:00:00Z', app_metadata: { provider: 'email' }, user_metadata: user.meta || {}, created_at: '2026-01-10T12:00:00Z' } };
}
/**
 * opts: { app, user, rpc: {nome: dados|fn(args)}, storage: 'local'|'session', hash, wait, out, ready }
 */
async function shoot(opts) {
  const app = path.join(ROOT, 'apps', opts.app);
  const srv = await serve(app); const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const blocked = [], unknown = [];
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith(origin)) return route.continue();
    if (u.includes(`${REF}.supabase.co`)) {
      const m = u.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i);
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (m) {
        const h = opts.rpc[m[1]]; let args = {}; try { args = JSON.parse(route.request().postData() || '{}'); } catch { /* sem corpo */ }
        if (h === undefined) { unknown.push(m[1]); return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: JSON.stringify({ message: 'not_found' }) }); }
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(typeof h === 'function' ? h(args) : h) });
      }
      if (/\/auth\/v1\/user/.test(u)) return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(fakeSession(opts.user).user) });
      unknown.push(u.replace(/^https:\/\/[^/]+/, '').slice(0, 60)); return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
    }
    blocked.push(u.slice(0, 80)); return route.abort();   // fontes do Google etc.: bloqueadas, vale a Inter instalada no sistema
  });
  const sess = JSON.stringify(fakeSession(opts.user));
  await ctx.addInitScript(([k, v, st]) => { try { (st === 'session' ? sessionStorage : localStorage).setItem(k, v); } catch (e) { /* ignora */ } }, [`sb-${REF}-auth-token`, sess, opts.storage || 'local']);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('JS: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(origin + '/' + (opts.hash || ''));
  if (opts.ready) await page.waitForSelector(opts.ready, { timeout: 15000 });
  await page.waitForTimeout(opts.wait || 1500);
  if (opts.before) await opts.before(page);
  const png = opts.out.replace(/\.webp$/, '.tmp.png');
  await page.screenshot({ path: png });
  await browser.close(); srv.close();
  console.log(opts.out, '| rpc sem dado:', [...new Set(unknown)].join(',') || '-', '| erros:', errs.join(' ; ') || '-', '| externos bloqueados:', blocked.length);
  return png;
}
module.exports = { shoot, ROOT };
