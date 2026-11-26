/* Lottus Sign: roteador por hash. Guarda de rota, retorno à origem (lista branca) e foco/título a cada rota. */
import { mount, spinner, loading, focusH1, setTitle, safeStore, confirm } from './ui.js?v=20261126b';
import { ensureShell, releaseShell, dropShell } from '../views/shell.js?v=20261126b';

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
  '#/onboarding/1': { view: 'onboarding', gate: false },
  '#/documentos': { view: 'documentos' },
  '#/envio/novo': { view: 'envio' },
  '#/plano': { view: 'plano' },
  '#/conta/perfil': { view: 'perfil', gate: false },
  '#/conta/verificacao': { view: 'conta', gate: false },
  '#/conta/seguranca': { view: 'conta', gate: false },
};

/* hash do Auth (link do e-mail): #access_token=..., #error_code=..., #error=...; nunca é rota (R-6) */
export function isAuthHash(raw) {
  if (!raw || raw.length < 2 || raw.startsWith('#/')) return false;
  const p = new URLSearchParams(raw.slice(1));
  return !!(p.get('access_token') || p.get('error_code') || p.get('error'));
}

/* R-7: só rota da lista branca; qualquer outro valor leva a #/documentos */
export function safeDe(v) { return WHITELIST.includes(v) ? v : DEFAULT_AFTER; }

export function createRouter({ root, api, views, cfg }) {
  const session = safeStore('sessionStorage');
  let seq = 0;
  let cleanup = null;
  let current = null; // { view, key }
  let flash = null;
  let held = false; // B-1: enquanto o hash do Auth é processado, o roteador espera
  let guard = null; // { dirty(): boolean, keep(): void } da tela com alterações não salvas (1.4)
  let confirming = false;
  let reverting = false; // V-02: o hashchange causado por desfazer a navegação é ignorado
  let sgN = 0; // número da visita, gravado em history.state para saber se o usuário foi para trás ou para frente
  const navIdx = () => (window.navigation && window.navigation.currentEntry ? window.navigation.currentEntry.index : -1); // Navigation API quando existe
  const stamp = () => { if (!current) return; current.sg = ++sgN; current.idx = navIdx(); try { history.replaceState({ sg: current.sg }, '', location.href); } catch (e) { /* sem history.state */ } };

  /* B-1: hash que não começa com #/ (ex.: o do Auth) nunca é rota; devolve null */
  function currentHash() {
    const raw = (location.hash || '').split('?')[0];
    if (raw === '' || raw === '#' || raw === '#/') return '#/entrar';
    return raw.startsWith('#/') ? raw : null;
  }

  function go(hash, replace) {
    if (currentHash() === hash && (location.hash || '') === hash) { handle(); return; }
    if (replace) location.replace(location.pathname + location.search + hash);
    else location.hash = hash;
  }

  const dirty = () => !!(guard && guard.dirty());
  const setGuard = (g) => { guard = g || null; };

  /* "Descartar alterações?": true se não há alteração ou se o usuário escolheu descartar */
  async function canLeave() {
    if (!dirty()) return true;
    if (confirming) return false;
    confirming = true;
    const ok = await confirm('Descartar alterações?', 'As alterações não salvas serão perdidas.', 'Descartar', true, 'Continuar editando');
    confirming = false;
    if (ok) guard = null;
    return ok;
  }

  /* tira da tela tudo que é da área logada (A10-MA/MB): view, shell e dados do usuário anterior */
  function reset() {
    if (cleanup) { try { cleanup(); } catch (e) { /* limpeza best effort */ } cleanup = null; }
    guard = null;
    dropShell();
    current = null;
    mount(root, spinner());
  }

  /* M-1: a sessão terminou durante o uso (outra aba, token vencido, 401). Guarda o destino e o rascunho (só em memória) e volta à entrada. */
  async function sessionEnded() {
    const h = currentHash();
    if (h && WHITELIST.includes(h)) session.set(DE_KEY, h);
    if (dirty() && guard.keep) { try { guard.keep(); } catch (e) { /* sem rascunho */ } }
    flash = 'sessaoDados';
    reset();
    await api.dropSession();
    go('#/entrar', true);
  }

  async function afterLogin() {
    const me = await api.me();
    if (!me.onboarding_done) { go(ONBOARDING, true); return; }
    const de = session.get(DE_KEY);
    session.del(DE_KEY);
    go(safeDe(de), true);
  }

  async function handle() {
    if (reverting) { reverting = false; return; }
    const hash = currentHash();
    if (held) return;
    if (hash === null) { if (!isAuthHash(location.hash)) go('#/entrar', true); return; } /* A10-B2: hash solto nunca deixa tela em branco */
    /* 1.4: tela com alterações não salvas. Desfaz a navegação (replaceState não dispara hashchange) e pergunta. */
    if (guard && current && hash !== current.key && dirty()) {
      if (confirming) return;
      const target = hash;
      /* V-02: desfaz a navegação andando o histórico de volta (sem empilhar entrada nova): foi para trás -> forward; empurrou ou foi para frente -> back */
      const stt = history.state;
      reverting = true;
      const idx = navIdx();
      const voltou = idx >= 0 && current.idx >= 0 ? idx < current.idx : !!(stt && typeof stt.sg === 'number' && stt.sg < current.sg);
      setTimeout(() => { if (voltou) history.forward(); else history.back(); }, 0); /* fora do evento de hashchange, para o navegador aceitar */
      if (await canLeave()) go(target, true);
      return;
    }
    const my = ++seq;
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

    const name = r ? r.view : (sess ? 'naoencontradaApp' : 'naoencontrada');
    const view = views[name];
    const uid = sess && sess.user ? sess.user.id : '';
    if (current && current.uid && current.uid !== uid) guard = null; /* outro usuário: a tela anterior não segura a navegação */
    const ctx = { root, route: hash, tab: r && r.tab, hasSession: !!sess, session: sess, flash: null, api, cfg, go, afterLogin, safeDe, setGuard, canLeave, sessionEnded };
    if (name === 'entrar') { ctx.flash = flash; flash = null; }
    if (view.shell) {
      /* rota privada: o shell permanece; só #view troca */
      if (cleanup) { try { cleanup(); } catch (e) { /* limpeza best effort */ } cleanup = null; }
      const first = current === null;
      ctx.view = ensureShell(ctx, { minimal: view.minimal, ownMe: view.ownMeError });
      mount(ctx.view, loading());
      setTitle(typeof view.title === 'function' ? view.title(ctx) : view.title);
      guard = null;
      cleanup = view.render(ctx) || null;
      current = { view, key: hash, uid };
      stamp();
      if (!first) focusH1(ctx.view); /* no 1º carregamento o foco fica livre: o Tab começa em "Ir para o conteúdo" */
      return;
    }
    releaseShell();
    if (current && current.view === view && view.update) {
      current.key = hash;
      view.update(ctx);
      return;
    }
    if (cleanup) { try { cleanup(); } catch (e) { /* limpeza best effort */ } cleanup = null; }
    mount(root, spinner());
    setTitle(typeof view.title === 'function' ? view.title(ctx) : view.title);
    guard = null;
    cleanup = view.render(ctx) || null;
    current = { view, key: hash, uid };
    stamp();
    if (!view.ownFocus) focusH1(root);
  }

  function setFlash(kind) { flash = kind; }

  /* B-1: o app segura o roteador enquanto trata o hash do Auth e libera depois */
  function hold() { held = true; }
  function release() { held = false; handle(); }

  function start() {
    window.addEventListener('hashchange', handle);
    /* AC15 e M-1: saída vinda de outra aba (o Supabase guarda a sessão em localStorage) */
    window.addEventListener('storage', (e) => {
      if (!(e.key && /^sb-.*-auth-token$/.test(e.key) && e.newValue === null)) return;
      const r = ROUTES[currentHash()];
      if (r && !r.pub) sessionEnded(); else go('#/entrar', true);
    });
    api.onSignedOut((voluntary) => {
      const r = ROUTES[currentHash()];
      if (r && r.pub) return;
      if (voluntary) go('#/entrar', true); else sessionEnded();
    });
    /* 1.4: formulário sujo + fechar ou recarregar a aba: pergunta do navegador */
    window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
    /* A10-MB: página restaurada do cache de ida e volta (bfcache). Não mostra dado da área logada sem conferir a sessão. */
    window.addEventListener('pageshow', async (e) => {
      if (!e.persisted) return;
      const r = ROUTES[currentHash()];
      if (!r || r.pub) return;
      root.hidden = true;
      try {
        const sess = await api.getSession();
        const uid = sess && sess.user ? sess.user.id : '';
        if (!sess) { flash = 'sessao'; reset(); go('#/entrar', true); } else if (current && current.uid !== uid) { reset(); handle(); } else handle();
      } finally { root.hidden = false; }
    });
    handle();
  }

  return { start, go, setFlash, afterLogin, hold, release, reset };
}
