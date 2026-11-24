/* Lottus Sign: roteador por hash. Guarda de rota, retorno à origem (lista branca) e foco/título a cada rota. */
import { mount, spinner, focusH1, setTitle, safeStore } from './ui.js?v=20261124a';

export const WHITELIST = ['#/documentos', '#/envio/novo', '#/plano', '#/conta/perfil', '#/conta/verificacao', '#/conta/seguranca'];
export const DE_KEY = 'lottus.sign.de';
export const DEFAULT_AFTER = '#/documentos';
export const ONBOARDING = '#/onboarding/1';

/* view: nome da view; pub: rota pública; gate: false = não redireciona ao onboarding pendente */
const ROUTES = {
  '#/entrar': { view: 'entrar', pub: true, tab: 'entrar' },
  '#/criar': { view: 'entrar', pub: true, tab: 'criar' },
  '#/recuperar': { view: 'construcao', pub: true },
  '#/nova-senha': { view: 'construcao', pub: true },
  '#/onboarding/1': { view: 'construcao', gate: false },
  '#/documentos': { view: 'construcao' },
  '#/envio/novo': { view: 'construcao' },
  '#/plano': { view: 'construcao' },
  '#/conta/perfil': { view: 'construcao', gate: false },
  '#/conta/verificacao': { view: 'construcao', gate: false },
  '#/conta/seguranca': { view: 'construcao', gate: false },
};

/* R-7: só rota da lista branca; qualquer outro valor leva a #/documentos */
export function safeDe(v) { return WHITELIST.includes(v) ? v : DEFAULT_AFTER; }

export function createRouter({ root, api, views, cfg }) {
  const session = safeStore('sessionStorage');
  let seq = 0;
  let cleanup = null;
  let current = null; // { view, key }
  let flash = null;

  function currentHash() {
    const raw = (location.hash || '').split('?')[0];
    return raw === '' || raw === '#' || raw === '#/' ? '#/entrar' : raw;
  }

  function go(hash, replace) {
    if (currentHash() === hash && (location.hash || '') === hash) { handle(); return; }
    if (replace) location.replace(location.pathname + location.search + hash);
    else location.hash = hash;
  }

  async function afterLogin() {
    const me = await api.me();
    if (!me.onboarding_done) { go(ONBOARDING); return; }
    const de = session.get(DE_KEY);
    session.del(DE_KEY);
    go(safeDe(de));
  }

  async function handle() {
    const my = ++seq;
    const hash = currentHash();
    const r = ROUTES[hash];
    const stale = () => my !== seq;
    const sess = await api.getSession();
    if (stale()) return;

    if (r && r.pub && sess && (hash === '#/entrar' || hash === '#/criar')) {
      try { await afterLogin(); return; } catch (e) { if (stale()) return; /* sem sign_me: mostra o formulário */ }
    }
    if (r && !r.pub && !sess) {
      if (WHITELIST.includes(hash)) session.set(DE_KEY, hash);
      flash = 'sessao';
      go('#/entrar', true);
      return;
    }
    if (r && !r.pub && sess && r.gate !== false) {
      try {
        const me = await api.me();
        if (stale()) return;
        if (!me.onboarding_done) { go(ONBOARDING, true); return; }
      } catch (e) {
        if (stale()) return;
        if (e.code === 'email_not_confirmed') { await api.signOut(); flash = 'sessao'; go('#/entrar', true); return; }
      }
    }

    const name = r ? r.view : 'naoencontrada';
    const view = views[name];
    const ctx = { root, route: hash, tab: r && r.tab, hasSession: !!sess, flash: null, api, cfg, go, afterLogin, safeDe };
    if (name === 'entrar') { ctx.flash = flash; flash = null; }
    if (current && current.view === view && view.update) {
      current.key = hash;
      view.update(ctx);
      return;
    }
    if (cleanup) { try { cleanup(); } catch (e) { /* limpeza best effort */ } cleanup = null; }
    mount(root, spinner());
    setTitle(typeof view.title === 'function' ? view.title(ctx) : view.title);
    cleanup = view.render(ctx) || null;
    current = { view, key: hash };
    if (!view.ownFocus) focusH1(root);
  }

  function setFlash(kind) { flash = kind; }

  function start() {
    window.addEventListener('hashchange', handle);
    /* AC15: saída vinda de outra aba (o Supabase guarda a sessão em localStorage) */
    window.addEventListener('storage', (e) => {
      if (e.key && /^sb-.*-auth-token$/.test(e.key) && e.newValue === null) go('#/entrar', true);
    });
    api.onSignedOut(() => { const r = ROUTES[currentHash()]; if (!r || !r.pub) go('#/entrar', true); });
    handle();
  }

  return { start, go, setFlash, afterLogin };
}
