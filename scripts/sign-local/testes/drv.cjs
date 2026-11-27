// Driver do Sign: serve apps/sign com os cabeçalhos do _headers (CSP real) e desvia o Supabase de produção para o falso local.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { create } = require('./fake-sign.cjs');
const APP = process.env.SIGN_APP ? path.resolve(process.env.SIGN_APP) : path.resolve(__dirname, '../../../apps/sign'); // SIGN_APP: servir outra cópia (ex.: o commit anterior, para comparar capturas)
const PROD = 'https://rowhslnnlzfbhmzbylbz.supabase.co';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function headers() {
  const h = {}; let on = false;
  for (const l of fs.readFileSync(path.join(APP, '_headers'), 'utf8').split('\n')) {
    if (/^\/\*/.test(l)) { on = true; continue; } if (!/^\s/.test(l)) { on = false; continue; }
    if (on && l.includes(':')) { const i = l.indexOf(':'); h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
  }
  delete h['strict-transport-security'];
  h['content-security-policy'] = h['content-security-policy'].replace(/;?\s*upgrade-insecure-requests/, '');
  return h;
}
function serve(configExtra) {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      let p = path.join(APP, decodeURIComponent(q.url.split('?')[0]));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { r.writeHead(404); return r.end('404'); }
      let buf = fs.readFileSync(p);
      if (configExtra && p.endsWith(path.join('js', 'config.js'))) buf = Buffer.concat([buf, Buffer.from('\n' + configExtra + '\n')]);
      const hd = { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', ...headers() };
      // SIGN_GZIP=1: comprime texto como o Cloudflare Pages faz em produção (medição de desempenho mais fiel)
      if (process.env.SIGN_GZIP && /\.(html|js|css|svg)$/.test(p)) { buf = require('zlib').gzipSync(buf); hd['content-encoding'] = 'gzip'; }
      r.writeHead(200, hd); r.end(buf);
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}

// opts: width, height, theme ('light'|'dark'), cfg (objeto mesclado em LOTTUS_CONFIG, ex.: { timeoutMs: 1500, resendCooldownMs: 1500 })
async function open(opts = {}) {
  const fake = create();
  const fport = await fake.start();
  const extra = opts.cfg ? `Object.assign(window.LOTTUS_CONFIG, ${JSON.stringify(opts.cfg)});` : '';
  const srv = await serve(extra);
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: opts.height || 800 }, deviceScaleFactor: opts.scale || 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const errors = [];
  const external = [];
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith(origin)) return route.continue();
    if (u.startsWith(PROD)) {
      const r = route.request();
      try {
        const resp = await fetch(`http://127.0.0.1:${fport}` + u.slice(PROD.length), { method: r.method(), headers: r.headers(), body: ['GET', 'HEAD'].includes(r.method()) ? undefined : r.postDataBuffer() });
        const body = Buffer.from(await resp.arrayBuffer());
        const h = Object.fromEntries(resp.headers); delete h['content-encoding']; delete h['content-length'];
        return await route.fulfill({ status: resp.status, headers: h, body });
      } catch (e) { return route.abort('failed').catch(() => {}); }
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort();
    external.push(u.slice(0, 100));
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('JS: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  const consoleAll = [];
  page.on('console', (m) => consoleAll.push(m.text()));
  const setTheme = (t) => page.evaluate((x) => { document.documentElement.dataset.theme = x; }, t);
  const go = async (hash, o = {}) => {
    await page.goto(origin + '/' + (hash || ''));
    await page.waitForSelector('#sign h1', { timeout: 8000 }).catch(() => {});
    if (opts.theme === 'dark' || o.theme === 'dark') await setTheme('dark');
  };
  const close = async () => { await browser.close(); srv.close(); fake.stop(); };
  return { page, ctx, origin, go, errors, external, consoleAll, fake, close, setTheme };
}

// Mede rolagem horizontal e elementos fora da borda (e fora do cartão)
async function overflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth; const out = [];
    for (const el of document.querySelectorAll('#sign *')) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.right > vw + 0.5 || b.left < -0.5) out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' ' + Math.round(b.left) + '..' + Math.round(b.right));
    }
    const card = document.querySelector('.sg-card');
    const cb = card && card.getBoundingClientRect();
    const outCard = [];
    if (cb) for (const el of card.querySelectorAll('*')) {
      const cs = getComputedStyle(el); if (cs.display === 'none') continue;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.right > cb.right + 1 || b.left < cb.left - 1) outCard.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + String(el.className).split(' ')[0]));
    }
    return { hscroll: document.documentElement.scrollWidth > vw + 1, scrollWidth: document.documentElement.scrollWidth, vw, over: out.slice(0, 6), outCard: outCard.slice(0, 6) };
  });
}
module.exports = { open, overflow, APP };
