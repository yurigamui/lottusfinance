/* Lottus Sign: auxiliares de interface. Tudo é montado por DOM (textContent), nunca por HTML em texto: texto do usuário não vira HTML. */
export const BRAND = 'Lottus Sign';

/* h('div', { class: 'x', onclick: fn, hidden: true }, 'texto', outroNo) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat()) {
    if (c == null || c === false || c === true) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

/* Troca os filhos de um elemento ignorando null, undefined e false. O replaceChildren nativo escreveria o texto "null" (achado N-01):
   por isso nenhum código do Sign o chama direto; use setKids. Strings e números viram nós de texto; arrays são achatados. */
export function setKids(el, ...children) {
  const out = [];
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    out.push(c.nodeType ? c : document.createTextNode(String(c)));
  }
  el.replaceChildren(...out);
  return el;
}

export function mount(root, ...nodes) { setKids(root, ...nodes); }

export function spinner() { return h('div', { class: 'spinner', role: 'status', 'aria-label': 'Carregando' }); }

export function setTitle(t) { document.title = t ? t + ' · ' + BRAND : BRAND; }

export function focusEl(el) {
  if (!el) return;
  if (!el.matches('input,button,a,select,textarea,[tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
}

export function focusH1(root) { focusEl((root || document).querySelector('h1')); }

/* Link externo: só http(s). Qualquer outra coisa (javascript:, data:) vira ''. */
export function safeUrl(u) {
  try {
    const x = new URL(String(u || ''), location.href);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch (e) { return ''; }
}

export function brandLogo() { return h('img', { src: 'img/logo-rosa.png', alt: 'Lottus', height: '28' }); }

export function safeStore(kind) {
  const s = (() => { try { return window[kind]; } catch (e) { return null; } })();
  return {
    get(k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } },
    set(k, v) { try { if (s) s.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
    del(k) { try { if (s) s.removeItem(k); } catch (e) { /* sem armazenamento */ } },
  };
}

/* ====================== Seção 1.0: ícones, avisos, janelas, cabeçalho de página, estados e selos ====================== */
const SVGNS = 'http://www.w3.org/2000/svg';

/* Traços de 24 px, stroke 2 (mesmo estilo do NI do Wealth). Montados por DOM, nunca por texto HTML. */
export const ICON = {
  documentos: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h6',
  conta: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  sair: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  enviar: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  plano: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  lapis: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  relogio: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  relogioRiscado: ['M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2', 'M4 4l16 16'],
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  circuloCortado: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M5.6 5.6l12.8 12.8'],
  interrogacao: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01'],
  alerta: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
};

export function icon(paths, cls) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  if (cls) s.setAttribute('class', cls);
  for (const d of [].concat(paths || [])) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}

/* ---------- toast: no máximo 3 visíveis; 4,5 s (ok) e 8 s (erro); pausa com mouse ou foco ---------- */
const liveToasts = [];
export function toast(titulo, msg, kind = 'ok') {
  const root = document.getElementById('toast-root');
  if (!root) return null;
  const err = kind === 'error';
  const ms = err ? 8000 : 4500;
  let timer = null;
  let gone = false;
  const drop = () => { const i = liveToasts.indexOf(rec); if (i >= 0) liveToasts.splice(i, 1); };
  const close = () => {
    if (gone) return;
    gone = true; clearTimeout(timer); drop();
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(close, ms); };
  const closeBtn = h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Fechar aviso', onclick: close }, icon(ICON.x));
  const el = h('div', { class: 'toast ' + (err ? 'error' : 'ok'), role: err ? 'alert' : 'status' },
    h('div', { class: 'toast-body' },
      h('div', { class: 'toast-icon' }, icon(err ? ICON.x : ICON.check)),
      h('div', { class: 'toast-text' }, h('div', { class: 'toast-title' }, titulo), msg ? h('div', { class: 'toast-msg' }, msg) : null),
      closeBtn));
  const rec = { el, kill() { gone = true; clearTimeout(timer); el.remove(); } };
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', arm);
  el.addEventListener('focusin', () => clearTimeout(timer));
  el.addEventListener('focusout', arm);
  liveToasts.push(rec);
  while (liveToasts.length > 3) liveToasts.shift().kill();
  root.append(el);
  arm();
  return { el, close };
}

/* ---------- modal: foco preso, Esc e clique no fundo fecham, foco volta a quem abriu ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((e) => e.getClientRects().length > 0);
let modalSeq = 0;
let modalsOpen = 0;

export function modal({ title, sub, body, foot, wide, drawer, onClose } = {}) {
  const root = document.getElementById('modal-root') || document.body;
  const opener = document.activeElement;
  const id = 'modal-' + (++modalSeq);
  const closeBtn = h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Fechar', onclick: () => close() }, icon(ICON.x, 'ico'));
  const head = h('div', { class: 'modal-head' }, h('div', null, h('h2', { id: id + '-t' }, title), sub ? h('div', { class: 'muted' }, sub) : null), closeBtn);
  const bodyEl = h('div', { class: 'modal-body' }, body);
  const footEl = foot ? h('div', { class: 'modal-foot' }, foot) : null;
  const el = h('div', { class: 'modal' + (wide ? ' wide' : '') + (drawer ? ' drawer' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t' }, head, bodyEl, footEl);
  const bd = h('div', { class: 'modal-backdrop' + (drawer ? ' drawer-bd' : '') }, el);
  const app = document.getElementById('sign');
  let closed = false;
  let downOnBd = false;

  function close() {
    if (closed) return;
    closed = true;
    bd.remove();
    modalsOpen -= 1;
    if (modalsOpen <= 0 && app) app.inert = false;
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    if (typeof onClose === 'function') onClose();
  }
  bd.addEventListener('mousedown', (e) => { downOnBd = e.target === bd; });
  bd.addEventListener('click', (e) => { if (e.target === bd && downOnBd) close(); });
  bd.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(el);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    const cur = document.activeElement;
    const inside = el.contains(cur);
    if (e.shiftKey && (cur === first || !inside)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && (cur === last || !inside)) { e.preventDefault(); first.focus(); }
  });
  root.append(bd);
  modalsOpen += 1;
  if (app) app.inert = true;
  if (bodyEl.scrollHeight > bodyEl.clientHeight) bodyEl.setAttribute('tabindex', '0');
  const first = focusables(bodyEl)[0] || (footEl && focusables(footEl)[0]) || closeBtn;
  first.focus();
  return { el, close };
}

export function confirm(titulo, texto, rotulo = 'Confirmar', danger = false, cancelar = 'Cancelar') {
  return new Promise((resolve) => {
    let result = false;
    const cancel = h('button', { class: 'btn secondary', type: 'button', onclick: () => m.close() }, cancelar);
    const ok = h('button', { class: danger ? 'btn danger' : 'btn', type: 'button', onclick: () => { result = true; m.close(); } }, rotulo);
    const m = modal({ title: titulo, body: h('p', null, texto), foot: [cancel, ok], onClose: () => resolve(result) });
    (danger ? cancel : ok).focus();
  });
}

/* ---------- cabeçalho de página, estado vazio e carregando ---------- */
/* A10-B1: o link "voltar" só vale para rota interna (#/...). javascript:, https://x e //x não viram link.
   pageHead(titulo, sub, acoes, voltar). Também aceita pageHead(titulo, sub, { href, label }) (voltar no 3º argumento). */
export const safeHashHref = (v) => (typeof v === 'string' && /^#\/[^\s\\]*$/.test(v) && !v.startsWith('#//') ? v : '');
const isBack = (v) => v && typeof v === 'object' && !Array.isArray(v) && !v.nodeType && 'href' in v;
export function pageHead(titulo, sub, acoes, voltar) {
  if (isBack(acoes) && !voltar) { voltar = acoes; acoes = null; }
  const href = voltar ? safeHashHref(voltar.href) : '';
  const back = href ? h('a', { class: 'back', href }, voltar.label) : null;
  const list = [].concat(acoes || []).filter(Boolean);
  return h('div', { class: 'page-head' },
    h('div', null, back, h('h1', { tabindex: '-1' }, titulo), sub ? h('p', { class: 'page-sub' }, sub) : null),
    list.length ? h('div', { class: 'row' }, list) : null);
}

/* abas da área Conta (links de rota): Perfil, Verificação e Segurança */
const ABAS_CONTA = [['Perfil', '#/conta/perfil'], ['Verificação', '#/conta/verificacao'], ['Segurança', '#/conta/seguranca']];
export function abasConta(route) {
  return h('nav', { class: 'tabs', 'aria-label': 'Conta' }, ABAS_CONTA.map(([rotulo, href]) =>
    h('a', { class: 'tab-link' + (route === href ? ' active' : ''), href, 'aria-current': route === href ? 'page' : null }, rotulo)));
}

export function emptyState(titulo, texto, acao) {
  return h('div', { class: 'empty' }, h('strong', null, titulo), texto ? h('p', null, texto) : null, acao || null);
}

export function loading(rotulo = 'Carregando') {
  return h('div', { class: 'empty' }, h('div', { class: 'spinner', role: 'status', 'aria-label': rotulo }));
}

/* ---------- selos de status: ícone mais texto, nunca só cor ---------- */
export const STATUS = {
  rascunho: { label: 'Rascunho', cls: 'tag', icon: 'lapis' },
  enviado: { label: 'Enviado', cls: 'tag brand', icon: 'enviar' },
  aguardando: { label: 'Aguardando', cls: 'tag warning', icon: 'relogio' },
  assinado: { label: 'Assinado', cls: 'tag success', icon: 'check' },
  recusado: { label: 'Recusado', cls: 'tag danger', icon: 'x' },
  expirado: { label: 'Expirado', cls: 'tag muted', icon: 'relogioRiscado' },
  cancelado: { label: 'Cancelado', cls: 'tag muted', icon: 'circuloCortado' },
};
const STATUS_DESCONHECIDO = { label: 'Status desconhecido', cls: 'tag muted', icon: 'interrogacao' };

export function statusTag(status) {
  const s = typeof status === 'string' && Object.prototype.hasOwnProperty.call(STATUS, status) ? STATUS[status] : STATUS_DESCONHECIDO;
  return h('span', { class: s.cls }, icon(ICON[s.icon], 'ico'), s.label);
}
