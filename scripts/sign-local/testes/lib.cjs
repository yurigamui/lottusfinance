// Pequeno arcabouço: check/fail com contagem "n de n passaram".
const res = { pass: 0, fail: 0, lines: [] };
function check(label, cond, extra) {
  if (cond) { res.pass++; res.lines.push('  ok   ' + label); } else { res.fail++; res.lines.push('  FALHA ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
async function t(name, open, opts, fn) {
  res.lines.push('# ' + name);
  const d = await open(opts || {});
  try { await fn(d); } catch (e) { res.fail++; res.lines.push('  FALHA ' + name + ' (exceção): ' + String(e.message).split('\n')[0]); } finally { await d.close(); }
}
function done() {
  console.info(res.lines.join('\n'));
  console.info(`\n${res.pass} de ${res.pass + res.fail} verificações passaram` + (res.fail ? `, ${res.fail} FALHARAM` : ''));
  process.exit(res.fail ? 1 : 0);
}
const hash = (p) => p.evaluate(() => location.hash);
const text = async (p, sel) => ((await p.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const active = (p) => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName.toLowerCase() + ':' + (a.textContent || '').trim().slice(0, 30)) : null; });
const authCalls = (d, re) => d.fake.state.log.filter((l) => re.test(l.path));
const PW = 'senha-correta-1';
async function login(p, email, pw) {
  await p.fill('#email', email); await p.fill('#senha', pw);
  await p.click('form button[type=submit]');
}
module.exports = { check, t, done, hash, text, active, authCalls, login, PW, res };
