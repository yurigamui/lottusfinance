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
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function mount(root, ...nodes) { root.replaceChildren(...nodes.flat().filter(Boolean)); }

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
