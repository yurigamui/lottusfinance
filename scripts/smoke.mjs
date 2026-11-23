#!/usr/bin/env node
// Teste de fumaça no navegador (Playwright já instalado no ambiente; não é dependência do repositório).
// Serve cada app com os cabeçalhos do seu _headers (como o Cloudflare Pages), abre as páginas
// nas larguras da matriz do manual e registra: erros de JS, violações de CSP, rolagem horizontal,
// elementos que passam da borda, imagens quebradas e campos sem rótulo.
// Requisições externas são bloqueadas (nada toca a produção): as telas mostram o estado de erro/offline.
// Uso: node scripts/smoke.mjs [app ...] [--shots <pasta>]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('Playwright não encontrado; teste de fumaça pulado.'); process.exit(0); }

const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const SHOTS = shotsIdx >= 0 ? resolve(args[shotsIdx + 1]) : null;
const apps = args.filter((a, i) => !a.startsWith('--') && i !== shotsIdx + 1);
const WIDTHS = [320, 360, 390, 768, 1024, 1440, 1920];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.csv': 'text/csv' };

function parseHeaders(dir) {
  const f = join(dir, '_headers');
  const rules = [];
  if (!existsSync(f)) return rules;
  let cur = null;
  for (const raw of readFileSync(f, 'utf8').split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { cur = { path: raw.trim(), set: {}, unset: [] }; rules.push(cur); continue; }
    const line = raw.trim();
    if (line.startsWith('!')) cur.unset.push(line.slice(1).trim().toLowerCase());
    else { const i = line.indexOf(':'); cur.set[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
  }
  return rules;
}
function headersFor(rules, url) {
  const out = {};
  for (const r of rules) {
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (!re.test(url)) continue;
    for (const u of r.unset) delete out[u];
    Object.assign(out, r.set);
  }
  delete out['strict-transport-security'];
  if (out['content-security-policy']) out['content-security-policy'] = out['content-security-policy'].replace(/;?\s*upgrade-insecure-requests/, '');
  return out;
}
function serve(dir) {
  const rules = parseHeaders(dir);
  return new Promise((ok) => {
    const srv = createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let p = join(dir, url);
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p) && existsSync(p + '.html')) p += '.html';
      if (!existsSync(p)) p = join(dir, 'index.html'); // fallback de SPA (_redirects)
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', ...headersFor(rules, url) });
      res.end(readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

const appDirs = (apps.length ? apps : readdirSync(join(ROOT, 'apps'))).map((a) => join(ROOT, 'apps', a)).filter((d) => existsSync(d));
const browser = await chromium.launch();
let problems = 0;
for (const dir of appDirs) {
  const pages = [];
  const walk = (d, base = '') => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (!['vendor', 'img', 'js', 'assets'].includes(n)) walk(p, base + n + '/'); } else if (n.endsWith('.html')) pages.push('/' + base + n); } };
  walk(dir);
  const srv = await serve(dir);
  const origin = `http://127.0.0.1:${srv.address().port}`;
  for (const page of pages) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
      const pg = await ctx.newPage();
      const errs = [];
      await pg.route('**/*', (r) => (r.request().url().startsWith(origin) ? r.continue() : r.abort()));
      pg.on('pageerror', (e) => errs.push('JS: ' + e.message.split('\n')[0]));
      pg.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) errs.push('CSP: ' + m.text().slice(0, 160)); });
      try { await pg.goto(origin + page, { waitUntil: 'load', timeout: 15000 }); } catch (e) { errs.push('carregar: ' + e.message.split('\n')[0]); }
      await pg.waitForTimeout(600);
      const r = await pg.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0 || b.right <= 0) continue; // right<=0: link "pular para o conteúdo" escondido de propósito
          let p = el.parentElement, clipped = false;
          while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') { clipped = true; break; } p = p.parentElement; }
          if (!clipped && (b.right > vw + 1 || b.left < -1)) over.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) + ` (${Math.round(b.left)}..${Math.round(b.right)})`);
        }
        const brokenImg = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src.startsWith(location.origin)).map((i) => i.getAttribute('src'));
        const unlabeled = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter((i) => {
          if (i.offsetParent === null) return false;
          return !(i.labels && i.labels.length) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.title;
        }).map((i) => i.id || i.name || i.type);
        return { hscroll: document.documentElement.scrollWidth > vw + 1, sw: document.documentElement.scrollWidth, vw, over: over.slice(0, 5), brokenImg, unlabeled: unlabeled.slice(0, 5) };
      });
      const issues = [...new Set(errs)];
      if (r.hscroll) issues.push(`rolagem horizontal (${r.sw} > ${r.vw})`);
      if (r.over.length) issues.push('passa da borda: ' + r.over.join(', '));
      if (r.brokenImg.length) issues.push('imagem quebrada: ' + r.brokenImg.join(', '));
      if (r.unlabeled.length && w === 390) issues.push('campo sem rótulo: ' + r.unlabeled.join(', '));
      if (SHOTS) { const d = join(SHOTS, dir.split('/').pop()); mkdirSync(d, { recursive: true }); await pg.screenshot({ path: join(d, page.replace(/\//g, '_').replace(/^_/, '') + `-${w}.png`), fullPage: true }); }
      if (issues.length) { problems += issues.length; console.info(`✗ ${dir.split('/').pop()}${page} @${w}px\n   - ` + issues.join('\n   - ')); }
      await ctx.close();
    }
  }
  srv.close();
  console.info(`· ${dir.split('/').pop()}: ${pages.length} página(s) × ${WIDTHS.length} larguras`);
}
await browser.close();
console.info(problems ? `\n${problems} problema(s)` : '\nnenhum problema');
process.exit(problems ? 1 : 0);
