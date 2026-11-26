/* Seção 1.1: Entrar e criar conta (e-mail e senha), confirmação de e-mail e reenvio. */
import { h, mount, setTitle, focusEl, safeUrl, brandLogo, safeStore } from '../lib/ui.js?v=20261126a';
import { normEmail, isEmail, normName, nameOk, passwordMissing, LIMITS } from '../lib/fmt.js?v=20261126a';
import { classify } from '../lib/api.js?v=20261126a';

const T = {
  login: 'E-mail ou senha incorretos.',
  limite: 'Muitas tentativas. Aguarde alguns minutos e tente de novo, ou use Esqueci a senha.',
  rede: 'Não foi possível concluir agora. Verifique sua conexão.',
  geral: 'Não foi possível concluir agora. Tente de novo.',
  email: 'Informe um e-mail válido.',
  senhaVazia: 'Informe a senha.',
  nome: 'Informe o nome completo.',
  aceite: 'Aceite os Termos e a Política para criar a conta.',
  sessao: 'Sua sessão terminou. Entre de novo para continuar.',
  sessaoDados: 'Sua sessão terminou. Entre de novo; seus dados continuam aqui.',
  vencido: 'Este link venceu ou já foi usado. Peça um novo.',
  invalido: 'Não foi possível usar este link. Entre com seu e-mail e senha ou, se o link venceu, peça um novo.',
  reenviado: 'Enviamos de novo. Verifique também a caixa de spam.',
  limiteReenvio: 'Você atingiu o limite de reenvios. Tente em 1 hora.',
};
const senhaCurta = (n) => `A senha precisa ter pelo menos ${LIMITS.passwordMin} caracteres. Faltam ${n}.`;

const KEY_RESEND = 'lottus.sign.resend';
const KEY_REC = 'lottus.sign.rec_email';
const local = safeStore('localStorage');
const sess = safeStore('sessionStorage');

/* Estado da view (um por aba do navegador). A senha NUNCA entra aqui. */
const st = { ctx: null, tab: 'entrar', screen: 'form', confirm: null, flash: null, email: '', timers: [] };

/* ---------- reenvio: 60 s entre envios, 3 por hora por navegador ---------- */
const cooldownMs = () => Number(st.ctx.cfg.resendCooldownMs) || 60000;
function recentSends() {
  let a = [];
  try { a = JSON.parse(local.get(KEY_RESEND) || '[]'); } catch (e) { a = []; }
  return a.filter((t) => typeof t === 'number' && Date.now() - t < 3600000);
}
function noteSend() { const a = recentSends(); a.push(Date.now()); local.set(KEY_RESEND, JSON.stringify(a)); }

function clearTimers() { st.timers.forEach((t) => clearInterval(t)); st.timers = []; }

function cool(btn) {
  const total = Math.ceil(cooldownMs() / 1000);
  let n = total;
  btn.disabled = true;
  btn.textContent = `Reenviar em ${n} s`;
  const t = setInterval(() => {
    n -= 1;
    if (n <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = 'Reenviar e-mail'; } else btn.textContent = `Reenviar em ${n} s`;
  }, 1000);
  st.timers.push(t);
}

/* ---------- peças de formulário ---------- */
function field({ id, label, type, autocomplete, help, value, maxlength, extra }) {
  const err = h('div', { class: 'ferr', id: id + '-err', hidden: true });
  const helpEl = help ? h('div', { class: 'help', id: id + '-help' }, help) : null;
  const input = h('input', {
    class: 'input', id, name: id, type: type || 'text', autocomplete, value: value || '', maxlength,
    autocapitalize: 'off', spellcheck: 'false', 'aria-describedby': help ? id + '-help' : null,
  });
  return { id, input, err, helpEl, base: help ? id + '-help' : '', label, extra };
}
function fieldNode(f, inner) {
  return h('div', { class: 'field' }, h('label', { for: f.id }, f.label), inner || f.input, f.helpEl, f.err, f.extra);
}
function setErr(f, msg) {
  f.err.hidden = !msg;
  f.err.textContent = msg || '';
  if (msg) { f.input.setAttribute('aria-invalid', 'true'); f.input.setAttribute('aria-describedby', (f.base ? f.base + ' ' : '') + f.err.id); } else {
    f.input.removeAttribute('aria-invalid');
    if (f.base) f.input.setAttribute('aria-describedby', f.base); else f.input.removeAttribute('aria-describedby');
  }
  return !!msg;
}
function pwField(id, label, autocomplete, help, extra) {
  const f = field({ id, label, type: 'password', autocomplete, help, extra });
  const btn = h('button', { class: 'sg-toggle', type: 'button', 'aria-controls': id, 'aria-pressed': 'false' }, 'Mostrar');
  btn.addEventListener('click', () => {
    const show = f.input.type === 'password';
    f.input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Ocultar' : 'Mostrar';
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
  });
  f.node = fieldNode(f, h('div', { class: 'sg-pw' }, f.input, btn));
  return f;
}
function textField(o) { const f = field(o); f.node = fieldNode(f); return f; }

/* região de mensagens: a única com anúncio automático para o leitor de tela */
function makeMsgs() {
  return { flash: h('div', { class: 'sg-msg', role: 'status' }), err: h('div', { class: 'sg-msg', role: 'alert' }) };
}
function alertBox(kind, ...kids) { return h('div', { class: 'sg-alert ' + kind }, ...kids); }
/* B-1: só um alerta por vez (o mais recente): mostrar um limpa o outro */
function showOk(m, text) { m.err.replaceChildren(); m.flash.replaceChildren(alertBox('ok', text)); }
function showErr(m, text, retry) {
  const kids = [h('span', null, text)];
  if (retry) kids.push(h('button', { class: 'btn secondary sg-retry', type: 'button', onclick: retry }, 'Tentar de novo'));
  m.flash.replaceChildren();
  m.err.replaceChildren(alertBox('err', ...kids));
}
function clearMsgs(m) { m.err.replaceChildren(); m.flash.replaceChildren(); }

function busy(btn, on, label) {
  btn.disabled = on;
  if (on) { btn.setAttribute('aria-busy', 'true'); btn.classList.add('loading'); } else { btn.removeAttribute('aria-busy'); btn.classList.remove('loading'); }
  if (label) btn.textContent = label;
}

function legalLink(url, text) {
  const u = safeUrl(url);
  return u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, text) : h('span', { class: 'sg-nolink' }, text);
}

/* ---------- reenvio (compartilhado: tela de confirmação e link vencido) ---------- */
async function doResend(email, m, btn, retry, onOk, onErr) {
  m.err.replaceChildren();
  const fail = (text, again) => { if (onErr) onErr(text); else showErr(m, text, again); return false; };
  if (recentSends().length >= 3) return fail(T.limiteReenvio);
  noteSend();
  busy(btn, true);
  const res = await st.ctx.api.resend(email);
  busy(btn, false);
  const kind = classify(res.error);
  if (kind === 'limite') return fail(T.limiteReenvio);
  if (res.error) return fail(kind === 'rede' ? T.rede : T.geral, kind === 'rede' ? retry : null);
  if (onOk) onOk(); else showOk(m, T.reenviado);
  return true;
}

/* ---------- tela "Confirme seu e-mail" ---------- */
function drawConfirm(card) {
  const { email, mode } = st.confirm;
  setTitle('Confirme seu e-mail');
  const m = makeMsgs();
  const lead = mode === 'cadastro'
    ? ['Se este e-mail puder ser usado, enviamos um link de confirmação para ', h('strong', { class: 'sg-any' }, email), '. Abra o e-mail e volte para entrar. Se você já tem conta, entre ou use Esqueci a senha.']
    : ['Confirme seu e-mail para continuar. Enviamos um link para ', h('strong', { class: 'sg-any' }, email), '.'];
  const btn = h('button', { class: 'btn secondary lg block', type: 'button' }, 'Reenviar e-mail');
  const click = async () => { if (await doResend(email, m, btn, click)) cool(btn); };
  btn.addEventListener('click', click);
  if (mode === 'cadastro') cool(btn);
  const other = h('button', { class: 'sg-link', type: 'button', onclick: () => { st.email = ''; backTo('criar'); } }, 'Usar outro e-mail');
  const toLogin = h('button', { class: 'sg-link', type: 'button', onclick: () => backTo('entrar') }, 'Entrar');
  card.replaceChildren(h('h1', { tabindex: '-1' }, 'Confirme seu e-mail'), h('p', { class: 'sg-lead' }, ...lead), m.flash, m.err, btn, h('div', { class: 'sg-links' }, other, toLogin));
  focusEl(card.querySelector('h1'));
}
function backTo(tab) {
  st.screen = 'form'; st.tab = tab; st.confirm = null; clearTimers();
  if (location.hash !== '#/' + tab) st.ctx.go('#/' + tab); else draw(true);
}
function showConfirm(email, mode) { st.screen = 'confirm'; st.confirm = { email, mode }; clearTimers(); draw(); }

/* ---------- formulários ---------- */
function drawForm(card, focusFirst) {
  const criar = st.tab === 'criar';
  setTitle(criar ? 'Criar conta' : 'Entrar');
  const m = makeMsgs();
  const email = textField({ id: 'email', label: 'E-mail', type: 'email', autocomplete: 'username', help: 'Para entrar e receber avisos.', value: st.email, maxlength: LIMITS.email });
  const nome = criar ? textField({ id: 'nome', label: 'Nome completo', autocomplete: 'name', help: 'Para identificar você como remetente.', maxlength: LIMITS.name }) : null;
  const falta = h('span', { class: 'sg-count' });
  const senha = pwField('senha', 'Senha', criar ? 'new-password' : 'current-password', criar ? 'Mínimo de 10 caracteres.' : null, criar ? falta : null);
  let aceite = null; let aceiteErr = null;
  if (criar) {
    const cb = h('input', { type: 'checkbox', id: 'aceite', name: 'aceite' });
    aceiteErr = h('div', { class: 'ferr', id: 'aceite-err', hidden: true });
    const cfg = st.ctx.cfg;
    aceite = { input: cb, node: h('div', { class: 'field' }, h('div', { class: 'sg-check' }, cb, h('label', { for: 'aceite' },
      'Li e aceito os ', legalLink(cfg.termsUrl, 'Termos de uso'), ' e a ', legalLink(cfg.privacyUrl, 'Política de Privacidade'),
      ` (versão ${cfg.termsVersion || '[preencher]'}).`)), aceiteErr) };
    senha.input.addEventListener('input', () => {
      const n = passwordMissing(senha.input.value);
      falta.textContent = senha.input.value && n > 0 ? `Faltam ${n}` : '';
    });
  }
  const submit = h('button', { class: 'btn lg block', type: 'submit' }, criar ? 'Criar conta' : 'Entrar');
  const form = h('form', { class: 'sg-form', novalidate: true, 'aria-label': criar ? 'Criar conta' : 'Entrar' }, m.flash, email.node, nome && nome.node, senha.node, aceite && aceite.node, m.err, submit);

  const firstBad = (list) => { const f = list.find((x) => x); if (f) focusEl(f.input); };

  const run = async () => {
    clearMsgs(m);
    const e = normEmail(email.input.value);
    const pw = senha.input.value;
    const bad = [];
    bad.push(setErr(email, isEmail(e) ? '' : T.email) ? email : null);
    if (criar) {
      bad.push(setErr(nome, nameOk(nome.input.value) ? '' : T.nome) ? nome : null);
      const n = passwordMissing(pw);
      bad.push(setErr(senha, n > 0 ? senhaCurta(n) : '') ? senha : null);
      const okAceite = aceite.input.checked;
      aceiteErr.hidden = okAceite; aceiteErr.textContent = okAceite ? '' : T.aceite;
      if (okAceite) { aceite.input.removeAttribute('aria-invalid'); aceite.input.removeAttribute('aria-describedby'); } else { aceite.input.setAttribute('aria-invalid', 'true'); aceite.input.setAttribute('aria-describedby', 'aceite-err'); }
      bad.push(okAceite ? null : aceite);
    } else {
      bad.push(setErr(senha, pw ? '' : T.senhaVazia) ? senha : null);
    }
    if (bad.some(Boolean)) { firstBad(bad); return; }
    st.email = e;
    busy(submit, true);
    const res = criar
      ? await st.ctx.api.signUp(e, pw, normName(nome.input.value), { terms: st.ctx.cfg.termsVersion || '[preencher]', privacy: st.ctx.cfg.privacyVersion || st.ctx.cfg.termsVersion || '[preencher]' })
      : await st.ctx.api.signIn(e, pw);
    busy(submit, false);
    const kind = classify(res.error);
    if (!res.error) {
      if (criar && !(res.data && res.data.session)) { showConfirm(e, 'cadastro'); return; }
      await finish(m, senha, submit);
      return;
    }
    if (criar && kind === 'existe') { showConfirm(e, 'cadastro'); return; } /* R-3: mesma tela do cadastro novo */
    if (!criar && kind === 'naoconfirmado') { showConfirm(e, 'login'); return; }
    if (kind === 'rede') { senha.input.value = ''; showErr(m, T.rede, run); focusEl(senha.input); return; }
    if (kind === 'senha' && criar) { setErr(senha, senhaCurta(passwordMissing(pw)) ); focusEl(senha.input); return; }
    showErr(m, kind === 'credenciais' ? T.login : kind === 'limite' ? T.limite : T.geral);
    if (kind === 'credenciais' || kind === 'limite') focusEl(senha.input);
  };
  form.addEventListener('submit', (ev) => { ev.preventDefault(); run(); });

  const forgot = criar ? null : h('a', { class: 'sg-link', href: '#/recuperar', onclick: () => { const v = normEmail(email.input.value); if (v) sess.set(KEY_REC, v); } }, 'Esqueci a senha');

  /* aviso vindo de fora (sessão terminou, link vencido ou inválido) */
  if (st.flash === 'sessao' || st.flash === 'sessaoDados') m.flash.append(alertBox('warn', st.flash === 'sessao' ? T.sessao : T.sessaoDados));
  if (st.flash === 'vencido' || st.flash === 'invalido') {
    const rb = h('button', { class: 'btn secondary', type: 'button' }, 'Reenviar e-mail');
    const rclick = async () => {
      const e = normEmail(email.input.value);
      if (!isEmail(e)) { setErr(email, T.email); focusEl(email.input); return; }
      setErr(email, '');
      /* M-3: o alerta e o botão permanecem; só o texto muda e o botão espera o intervalo */
      if (await doResend(e, m, rb, rclick, () => { vtext.textContent = T.reenviado; box.className = 'sg-alert ok'; }, (txt) => { vtext.textContent = baseTxt + ' ' + txt; box.className = 'sg-alert err'; })) { cool(rb); }
    };
    rb.addEventListener('click', rclick);
    const baseTxt = st.flash === 'invalido' ? T.invalido : T.vencido;
    const vtext = h('span', null, baseTxt);
    const box = alertBox('err', vtext, rb);
    m.flash.append(box);
  }
  st.flash = null;

  card.replaceChildren(...[tabs(), h('h1', { tabindex: '-1' }, criar ? 'Criar conta' : 'Entrar'), criar ? null : h('p', { class: 'sg-lead' }, 'Acesse seus documentos e envios.'), form,
    h('div', { class: 'sg-links' }, forgot, h('a', { class: 'sg-link', href: 'verificar.html' }, 'Verificar um documento'))].filter(Boolean));
  if (focusFirst) focusEl(email.input);
}

/* ---------- abas (role=tablist) ---------- */
function tabs() {
  const mk = (id, label) => h('button', { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': st.tab === id ? 'true' : 'false', tabindex: st.tab === id ? '0' : '-1', 'data-tab': id, onclick: () => st.ctx.go('#/' + id) }, label);
  const list = h('div', { class: 'sg-tabs', role: 'tablist', 'aria-label': 'Acesso' }, mk('entrar', 'Entrar'), mk('criar', 'Criar conta'));
  list.addEventListener('keydown', (ev) => {
    const order = ['entrar', 'criar'];
    const i = order.indexOf(st.tab);
    let n = -1;
    if (ev.key === 'ArrowRight') n = (i + 1) % 2; else if (ev.key === 'ArrowLeft') n = (i + 1) % 2; else if (ev.key === 'Home') n = 0; else if (ev.key === 'End') n = 1;
    if (n < 0) return;
    ev.preventDefault();
    st.ctx.go('#/' + order[n]);
  });
  return list;
}

/* ---------- desenho da página ---------- */
let cardEl = null;
function draw(focusFirst) {
  if (!cardEl) return;
  if (st.screen === 'confirm') drawConfirm(cardEl); else drawForm(cardEl, focusFirst);
}

function build(ctx) {
  cardEl = h('section', { class: 'card sg-card' });
  mount(ctx.root, h('div', { class: 'sg-page' }, h('aside', { class: 'sg-side' }, h('div', { class: 'sg-brand' }, brandLogo())), h('div', { class: 'sg-main' }, cardEl)));
}

export const entrar = {
  title: 'Entrar',
  ownFocus: true,
  render(ctx) {
    st.ctx = ctx; st.tab = ctx.tab || 'entrar'; st.screen = 'form'; st.confirm = null; st.flash = ctx.flash; st.email = '';
    clearTimers();
    build(ctx);
    draw(true);
    return () => { clearTimers(); cardEl = null; };
  },
  update(ctx) {
    st.ctx = ctx;
    const hadTab = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('role') === 'tab';
    st.tab = ctx.tab || 'entrar';
    if (ctx.flash) st.flash = ctx.flash;
    if (st.screen === 'confirm') { st.screen = 'form'; st.confirm = null; }
    const old = cardEl.querySelector('#email');
    if (old) st.email = old.value;
    clearTimers();
    draw(!hadTab);
    if (hadTab) focusEl(cardEl.querySelector('[role=tab][aria-selected=true]'));
  },
};

/* depois do login: sign_me decide o destino. Sem sessão ativa quando o e-mail não está confirmado. */
async function finish(m, senha, submit) {
  try {
    await st.ctx.afterLogin();
  } catch (e) {
    if (classify(e) === 'naoconfirmado') { await st.ctx.api.signOut(); showConfirm(st.email, 'login'); return; }
    senha.input.value = '';
    showErr(m, classify(e) === 'rede' ? T.rede : T.geral, () => finish(m, senha, submit));
    focusEl(senha.input);
  }
}
