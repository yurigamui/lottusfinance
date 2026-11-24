#!/usr/bin/env node
// Verificação do repositório Lottus, sem dependências externas.
// Uso: node scripts/check.mjs            (falha com código 1 se houver erro)
//      node scripts/check.mjs --warn      (mostra também os avisos)
// Blocos: sintaxe JS, links locais em HTML, CSP (sem script inline nem on*=),
// cabeçalhos de segurança por app, segredos, console.log e marcadores de debug.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SHOW_WARN = process.argv.includes('--warn');
const IGNORE_DIRS = new Set(['.git', 'node_modules', '_revisar', '.claude']);
const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${relative(ROOT, f)}: ${m}`);
const warn = (f, m) => warns.push(`${relative(ROOT, f)}: ${m}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
// comentário de linha (não "://" de URL) que contém uma declaração: sinal de quebra de linha perdida numa edição
function codeInComment(line) {
  const m = line.match(/(^|[^:'"`\\])\/\/(.*)$/); if (!m) return false;
  return /;\s*$|\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*[^=]/.test(m[2]) && /\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*[^=]/.test(m[2]);
}
const isVendor = (f) => /[\\/]vendor[\\/]|\.min\.js$/.test(f);

// 1. Sintaxe JS
for (const f of files.filter((f) => extname(f) === '.js' || extname(f) === '.mjs')) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    err(f, 'erro de sintaxe JS: ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' '));
  }
  if (isVendor(f)) continue;
  const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (/\bconsole\.log\(/.test(line)) err(f, `linha ${i + 1}: console.log esquecido`);
    if (/\bdebugger\s*;/.test(line)) err(f, `linha ${i + 1}: debugger esquecido`);
    if (codeInComment(line)) err(f, `linha ${i + 1}: declaração dentro de comentário (quebra de linha perdida?)`);
  });
}
// 1b. TypeScript das funções de borda: Node só confere a sintaxe com --experimental-strip-types; mesma checagem de código preso em comentário
for (const f of files.filter((f) => extname(f) === '.ts')) {
  try { execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--check', f], { stdio: 'pipe' }); }
  catch (e) { err(f, 'erro de sintaxe TS: ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')); }
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (codeInComment(line)) err(f, `linha ${i + 1}: declaração dentro de comentário (quebra de linha perdida?)`); });
}

// 2. HTML: CSP e links locais
const rwCache = new Map();
function rewrites(appDir) {
  if (rwCache.has(appDir)) return rwCache.get(appDir);
  const file = join(appDir, '_redirects');
  const list = existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((x) => x && !x.startsWith('#'))
        .map((src) => new RegExp('^' + src.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:[a-z]+/gi, '[^/]+') + '$'))
    : [];
  rwCache.set(appDir, list);
  return list;
}
const ATTR = /\b(?:src|href)\s*=\s*"([^"]+)"/g;
for (const f of files.filter((f) => extname(f) === '.html')) {
  const html = readFileSync(f, 'utf8');
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const s of scripts) {
    const open = s.match(/<script\b[^>]*>/i)[0];
    const body = s.slice(open.length, -'</script>'.length).trim();
    const isData = /type\s*=\s*"(application\/(ld\+)?json|text\/template)"/i.test(open);
    if (body && !isData) err(f, 'script inline (a CSP script-src \'self\' bloqueia)');
    const m = open.match(/src\s*=\s*"([^"]+)"/i);
    if (m && /^(https?:)?\/\//.test(m[1])) err(f, `script de CDN: ${m[1]}`);
  }
  if (/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''))) {
    err(f, 'atributo de evento inline (onclick= etc.) bloqueado pela CSP');
  }
  let m;
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  while ((m = ATTR.exec(markup))) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|data:|blob:|#|javascript:|\{|\$)/i.test(url) || url.includes('${')) continue;
    const clean = url.split(/[?#]/)[0];
    if (!clean) continue;
    let target = clean.startsWith('/') ? null : resolve(dirname(f), clean);
    if (clean.startsWith('/')) {
      // caminho absoluto: relativo à raiz do app (apps/<nome>); respeita as reescritas de _redirects
      const app = relative(ROOT, f).split(/[\\/]/).slice(0, 2).join('/');
      if (rewrites(join(ROOT, app)).some((re) => re.test(clean))) continue;
      target = join(ROOT, app, clean);
    }
    if (target && !existsSync(target) && !existsSync(target + '.html') && !existsSync(join(target, 'index.html'))) {
      err(f, `link local quebrado: ${url}`);
    }
  }
}

// 3. Cada app tem _headers com CSP estrita
const appsDir = join(ROOT, 'apps');
if (existsSync(appsDir)) {
  for (const app of readdirSync(appsDir)) {
    const dir = join(appsDir, app);
    if (!statSync(dir).isDirectory()) continue;
    if (!readdirSync(dir).some((n) => n.endsWith('.html'))) continue;
    const hp = join(dir, '_headers');
    const vercel = join(dir, 'vercel.json');
    const txt = existsSync(hp) ? readFileSync(hp, 'utf8') : existsSync(vercel) ? readFileSync(vercel, 'utf8') : '';
    if (!/Content-Security-Policy/i.test(txt)) err(dir, 'sem Content-Security-Policy (_headers ou vercel.json)');
    else if (/script-src[^;]*'unsafe-(inline|eval)'/i.test(txt)) err(dir, "CSP com script 'unsafe-inline' ou 'unsafe-eval'");
    if (!/frame-ancestors|X-Frame-Options/i.test(txt)) warn(dir, 'sem proteção contra iframe');
  }
}

// 4. Segredos (nunca imprime o valor)
const SECRET = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'chave secreta do Supabase'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chave privada'],
  [/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/, 'connection string com senha'],
  [/AKIA[0-9A-Z]{16}/, 'chave AWS'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'token do GitHub'],
  [/sk_(?:live|test)_[A-Za-z0-9]{10,}/, 'chave de pagamento'],
  [/xox[abps]-[A-Za-z0-9-]{10,}/, 'token do Slack'],
];
for (const f of files) {
  if (/\.(png|jpe?g|webp|gif|ico|pdf|woff2?)$/i.test(f)) continue;
  const txt = readFileSync(f, 'utf8');
  for (const [re, kind] of SECRET) if (re.test(txt)) err(f, `possível segredo: ${kind}`);
  for (const jwt of txt.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
    try {
      const role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role;
      if (role && role !== 'anon') err(f, `JWT com papel "${role}" no código`);
    } catch { /* não é JWT */ }
  }
  if (/(^|[\\/])\.env(\.|$)/.test(f) && !f.endsWith('.env.example')) err(f, 'arquivo .env versionado');
}

// 5. Python (gerador do site)
for (const f of files.filter((f) => extname(f) === '.py')) {
  try {
    execFileSync('python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1],encoding="utf-8").read())', f], { stdio: 'pipe' });
  } catch (e) {
    if (e.code === 'ENOENT') { warn(f, 'python3 ausente; sintaxe não verificada'); break; }
    err(f, 'erro de sintaxe Python');
  }
}

if (SHOW_WARN) for (const w of warns) console.warn('aviso  ' + w);
for (const e of errors) console.error('ERRO   ' + e);
console.info(`\n${files.length} arquivos · ${errors.length} erro(s) · ${warns.length} aviso(s)`);
process.exit(errors.length ? 1 : 0);
