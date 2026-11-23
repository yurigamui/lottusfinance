// Driver do Wealth: serve apps/wealth com os cabeçalhos do _headers e desvia o Supabase de produção para o falso local.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const APP = process.env.WEALTH_APP || require('path').resolve(__dirname, '../../apps/wealth');
const PROD = 'https://rowhslnnlzfbhmzbylbz.supabase.co';
const FAKE = 'http://127.0.0.1:54399';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
function headers() {
  const h = {}; let on = false;
  for (const l of fs.readFileSync(path.join(APP, '_headers'), 'utf8').split('\n')) {
    if (/^\/\*/.test(l)) { on = true; continue; } if (!/^\s/.test(l)) { on = false; continue; }
    if (on && l.includes(':')) { const i = l.indexOf(':'); h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
  }
  delete h['strict-transport-security'];
  return h;
}
function serve() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      let p = path.join(APP, decodeURIComponent(q.url.split('?')[0]));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { r.writeHead(404); return r.end('404'); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', ...headers() }); r.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}
async function open(opts = {}) {
  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: opts.width || 1280, height: opts.height || 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const errors = [];
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith(origin)) return route.continue();
    if (u.startsWith(PROD)) {
      const r = route.request();
      const resp = await fetch(FAKE + u.slice(PROD.length), { method: r.method(), headers: r.headers(), body: ['GET', 'HEAD'].includes(r.method()) ? undefined : r.postDataBuffer() });
      const body = Buffer.from(await resp.arrayBuffer());
      return route.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers), body });
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort();
    errors.push('rede externa bloqueada: ' + u.slice(0, 100));
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('JS: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', (d) => d.accept());
  const go = async (hash) => { await page.goto(origin + '/' + (hash || '')); await page.waitForTimeout(700); };
  const text = async () => (await page.innerText('body')).replace(/\s+/g, ' ');
  const close = async () => { await browser.close(); srv.close(); };
  return { page, ctx, origin, go, text, errors, close };
}
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth; const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height || b.right <= 0) continue;
      let p = el.parentElement, clip = false; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (['auto', 'scroll', 'hidden', 'clip'].includes(o)) { clip = true; break; } p = p.parentElement; }
      if (!clip && (b.right > vw + 1)) out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' ' + Math.round(b.right));
    }
    return { hscroll: document.documentElement.scrollWidth > vw + 1, over: out.slice(0, 6) };
  });
}
module.exports = { open, overflow };
