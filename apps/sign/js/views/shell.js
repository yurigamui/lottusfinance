/* Seção 1.0: esqueleto da área logada (menu, barra superior, aviso e #view). Montado por DOM; texto do usuário só por textContent. */
import { h, mount, icon, ICON, focusH1 } from '../lib/ui.js?v=20261125a';

/* Itens do menu. Só entra quem tem built:true; as seções futuras ligam o seu item sem mudar a estrutura. */
export const NAV = [
  { id: 'documentos', label: 'Documentos', href: '#/documentos', icon: 'documentos', built: true, on: (r) => r === '#/documentos' },
  { id: 'envio', label: 'Novo envio', href: '#/envio/novo', icon: 'enviar', built: false, on: (r) => r === '#/envio/novo' },
  { id: 'verificar', label: 'Verificar', href: 'verificar.html', icon: 'check', built: false, on: () => false },
  { id: 'plano', label: 'Plano e uso', href: '#/plano', icon: 'plano', built: false, on: (r) => r === '#/plano' },
  { id: 'conta', label: 'Conta', href: '#/conta/perfil', icon: 'conta', built: true, on: (r) => r.startsWith('#/conta/') },
];

const TXT_ERRO = 'Não foi possível carregar seus dados. Verifique sua conexão.';

/* Nível exibido: derivado de sign_me (decisão de 25/11). Certificado válido = Qualificada; verificado = Avançada; senão Simples. */
export function levelOf(me) {
  const cert = me && me.cert;
  const ate = cert && cert.not_after ? Date.parse(cert.not_after) : NaN;
  if (cert && Number.isFinite(ate) && ate > Date.now()) return 'Qualificada';
  if (me && me.verified) return 'Avançada';
  return 'Simples';
}

/* 1ª letra da 1ª e da última palavra; sem nome, 1ª letra do e-mail. */
export function initialsOf(name, email) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const first = (w) => Array.from(w)[0].toLocaleUpperCase('pt-BR');
  if (words.length >= 2) return first(words[0]) + first(words[words.length - 1]);
  if (words.length === 1) return first(words[0]);
  const e = String(email || '').trim();
  return e ? first(e) : '?';
}

let S = null;

export function releaseShell() {
  if (!S) return;
  S.dead = true;
  document.removeEventListener('click', S.onDocClick);
  document.removeEventListener('keydown', S.onKey);
  S = null;
}

function navItem(n) {
  const a = h('a', { class: 'nav-btn', href: n.href, 'aria-label': n.label }, icon(ICON[n.icon], 'ico'));
  const sec = h('div', { class: 'nav-sec single' }, a, h('div', { class: 'flyout', 'aria-hidden': 'true' }, h('div', { class: 'flyout-title' }, n.label)));
  return { n, a, sec };
}

function paintNav(st, route, minimal) {
  if (st.minimal !== minimal) {
    st.minimal = minimal;
    st.items = minimal ? [] : NAV.filter((n) => n.built).map(navItem);
    st.nav.replaceChildren(...st.items.map((i) => i.sec));
    st.side.classList.toggle('minimal', minimal);
  }
  for (const i of st.items) {
    const on = i.n.on(route);
    i.a.classList.toggle('active', on);
    i.sec.classList.toggle('on', on);
    if (on) i.a.setAttribute('aria-current', 'page'); else i.a.removeAttribute('aria-current');
  }
}

function setMenu(st, open) {
  st.menuOpen = open;
  st.menu.hidden = !open;
  st.avatar.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function paintMe(st, me) {
  const name = String(me.name || '').trim();
  const email = String(me.email || st.email || '');
  st.orgName.textContent = name || email;
  st.orgSub.textContent = levelOf(me);
  st.orgSub.hidden = false;
  st.avatar.textContent = initialsOf(name, email);
  st.menuName.textContent = name || email;
  st.menuSub.textContent = name ? email : '';
  st.menuSub.hidden = !name;
}

function showNotice(st, retry) {
  const btn = h('button', { class: 'btn secondary sm', type: 'button', onclick: retry }, 'Tentar de novo');
  st.notice.replaceChildren(h('div', { class: 'banner danger' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, TXT_ERRO), btn));
  return btn;
}

async function loadMe(st) {
  try {
    const me = await st.ctx.api.me();
    if (st.dead) return;
    paintMe(st, me);
    st.notice.replaceChildren();
  } catch (e) {
    if (st.dead) return;
    const btn = showNotice(st, async () => {
      btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      await loadMe(st);
    });
  }
}

/* Monta o shell uma vez e devolve #view. Nas rotas seguintes só atualiza o item ativo; o nó .shell permanece. */
export function ensureShell(ctx, { minimal = false } = {}) {
  if (S && S.root === ctx.root && S.shell.isConnected) {
    S.ctx = ctx;
    paintNav(S, ctx.route, !!minimal);
    return S.view;
  }
  releaseShell();
  const st = { ctx, root: ctx.root, dead: false, menuOpen: false, minimal: null, items: [], email: ctx.session && ctx.session.user ? ctx.session.user.email || '' : '' };

  const skip = h('button', { class: 'sr-only skip-link', type: 'button', onclick: () => focusH1(st.view) }, 'Ir para o conteúdo');
  st.nav = h('nav', { class: 'sidenav-items', 'aria-label': 'Menu principal' });
  st.side = h('aside', { class: 'sidenav' }, h('a', { class: 'sidenav-mark', href: '#/documentos', 'aria-label': 'Lottus, início' }), st.nav);

  st.orgName = h('div', { class: 'org-name' }, st.email);
  st.orgSub = h('div', { class: 'org-sub', hidden: true });
  const org = h('div', { class: 'org' },
    h('a', { class: 'org-link', href: '#/documentos', tabindex: '-1' }, h('span', { class: 'org-mark logo', role: 'img', 'aria-label': 'Lottus' })),
    h('div', null, st.orgName, st.orgSub));

  st.avatar = h('button', { class: 'avatar', id: 'avatar', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'pmenu', 'aria-label': 'Perfil' }, initialsOf('', st.email));
  st.menuName = h('div', { class: 'menu-name' }, st.email);
  st.menuSub = h('div', { class: 'menu-sub' });
  st.menuSub.hidden = true;
  const sair = h('button', { class: 'menu-item danger', type: 'button' }, icon(ICON.sair), 'Sair');
  st.menu = h('div', { class: 'menu', id: 'pmenu', hidden: true },
    h('div', { class: 'menu-head' }, st.menuName, st.menuSub),
    h('a', { class: 'menu-item', href: '#/conta/perfil', onclick: () => setMenu(st, false) }, icon(ICON.conta), 'Conta'),
    sair);
  const profile = h('div', { class: 'profile' }, st.avatar, st.menu);

  st.notice = h('div', { class: 'shell-notice' });
  st.view = h('div', { class: 'content', id: 'view' });
  st.shell = h('div', { class: 'shell' }, skip,
    st.side,
    h('div', { class: 'frame' }, h('div', { class: 'surface' }, h('header', { class: 'topbar' }, org, h('div', { class: 'topbar-right' }, profile)), st.notice, st.view)));

  st.avatar.addEventListener('click', () => setMenu(st, !st.menuOpen));
  profile.addEventListener('focusout', (e) => { if (st.menuOpen && e.relatedTarget && !profile.contains(e.relatedTarget)) setMenu(st, false); });
  sair.addEventListener('click', async () => {
    setMenu(st, false);
    await st.ctx.api.signOut();
    st.ctx.go('#/entrar', true);
  });
  st.onDocClick = (e) => { if (st.menuOpen && !profile.contains(e.target)) setMenu(st, false); };
  st.onKey = (e) => { if (e.key === 'Escape' && st.menuOpen) { setMenu(st, false); st.avatar.focus(); } };
  document.addEventListener('click', st.onDocClick);
  document.addEventListener('keydown', st.onKey);

  S = st;
  paintNav(st, ctx.route, !!minimal);
  mount(ctx.root, st.shell);
  loadMe(st);
  return st.view;
}
