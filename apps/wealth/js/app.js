/* Lottus Wealth — roteador, estrutura da tela, entrada/cadastro, carteiras, conta e plano, white-label. */
(function () {
  'use strict';
  const { esc, ico } = W;
  const $app = () => document.getElementById('app');
  const RANK = { visualizador: 1, editor: 2, gestor: 3 };
  const ROLE = { visualizador: 'Visualizador', editor: 'Editor', gestor: 'Gestor' };
  const KINDS = { pessoal: 'Pessoal', familia: 'Família', empresa: 'Empresa', cliente: 'Cliente de escritório' };
  W.ROLE = ROLE; W.KINDS = KINDS;

  /* ---------- roteador ---------- */
  W.route = (pattern, fn, opt = {}) => W.routes.push({ re: new RegExp('^' + pattern.replace(/:[a-z]+/g, '([^/]+)') + '$'), keys: (pattern.match(/:[a-z]+/g) || []).map((k) => k.slice(1)), fn, wallet: pattern.startsWith('/w/:id'), ...opt });
  W.go = (path) => { if (location.hash === '#' + path) route(); else location.hash = path; };

  W.pageHead = (title, sub, actions, back) => `<div class="page-head"><div>${back ? `<a class="back" href="#${back[0]}">← ${esc(back[1])}</a><br>` : ''}<h1>${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ''}</div>${actions ? `<div class="row">${actions}</div>` : ''}</div>`;
  const tag = (t, c = '') => `<span class="tag ${c}">${esc(t)}</span>`;
  W.tag = tag;
  W.loading = () => '<div class="empty"><div class="spinner"></div></div>';

  async function loadMe() {
    try { W.state.me = await W.rpc('w_me'); } catch { W.state.me = null; }
    return W.state.me;
  }
  W.loadWallets = async () => { W.state.wallets = (await W.rpc('w_wallets_list')) || []; return W.state.wallets; };

  async function route() {
    const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    if (path === '/') return W.go(W.state.me ? '/carteiras' : '/entrar');
    const r = W.routes.find((x) => x.re.test(path));
    if (!r) return W.go(W.state.me ? '/carteiras' : '/entrar');
    const m = path.match(r.re); const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    W.closeModal();
    if (!r.public) {
      if (!W.state.me) { try { sessionStorage.setItem('w_next', path); } catch { /* navegação privada */ } return W.go('/entrar'); }
      if (!W.state.me.profile || !W.state.me.profile.completed) { if (path !== '/finalizar') return W.go('/finalizar'); }
    }
    const ctx = { path, params, q, after: null, can: () => false, w: null, canWrite: false };
    try {
      if (r.wallet) {
        if (!W.state.wallets.length || !W.state.wallets.find((w) => w.id === params.id)) await W.loadWallets();
        ctx.w = W.state.wallets.find((w) => w.id === params.id);
        if (!ctx.w) { W.toast('Carteira não encontrada', 'Você não tem acesso a essa carteira.', 'error'); return W.go('/carteiras'); }
        ctx.can = (min) => RANK[ctx.w.role] >= RANK[min];
        ctx.canWrite = ctx.can('editor') && !ctx.w.read_only;
      }
      if (r.bare) { $app().innerHTML = '<div class="empty"><div class="spinner"></div></div>'; const html = await r.fn(ctx); $app().innerHTML = html; if (ctx.after) ctx.after(); return; }
      renderShell(ctx, r, W.loading());
      const html = await r.fn(ctx);
      if (location.hash.replace(/^#/, '').split('?')[0] !== path) return;   // o usuário já foi para outra tela
      document.getElementById('view').innerHTML = banner(ctx) + html;
      document.getElementById('view').scrollTop = 0;
      if (ctx.after) await ctx.after();
    } catch (e) {
      const v = document.getElementById('view') || $app();
      v.innerHTML = `<div class="card center"><h2>Não foi possível abrir esta tela</h2><p class="muted">${esc(e.message)}</p><button class="btn" data-act="reload">Tentar de novo</button></div>`;
    }
  }
  W.refresh = () => route();


  /* ---------- acessibilidade: liga cada <label> de .field ao seu campo (leitor de tela anuncia o nome) ---------- */
  let lblSeq = 0;
  W.linkLabels = (root) => {
    (root || document).querySelectorAll('.field').forEach((fd) => {
      const lb = fd.querySelector(':scope > label'); const ctl = fd.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
      if (!lb || !ctl || lb.htmlFor || lb.contains(ctl)) return;
      if (!ctl.id) ctl.id = `f-${++lblSeq}`;
      lb.htmlFor = ctl.id;
    });
  };
  let lblQueued = false;
  new MutationObserver(() => { if (lblQueued) return; lblQueued = true; requestAnimationFrame(() => { lblQueued = false; W.linkLabels(document); }); }).observe(document.body, { childList: true, subtree: true });
  /* ---------- estrutura ---------- */
  // Ícones do menu: os mesmos traços do Partners/Backoffice
  const NI = {
    carteiras: 'M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm10 6h2',
    patrimonio: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    investimentos: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    gastos: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    carteira: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h4',
    conta: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  };
  const gico = (id) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${NI[id]}"/></svg>`;
  function navGroups(w) {
    const b = w ? `/w/${w.id}` : '';
    const g = [{ id: 'carteiras', label: 'Carteiras', items: [{ href: '/carteiras', label: 'Minhas carteiras', icon: 'wallet', exact: true }] }];
    if (w) {
      g.push({ id: 'patrimonio', label: 'Patrimônio', items: [{ href: `${b}/patrimonio`, label: 'Visão geral', icon: 'layout' }, { href: `${b}/bens`, label: 'Bens e dívidas', icon: 'home' }] });
      g.push({ id: 'investimentos', label: 'Investimentos', items: [{ href: `${b}/investimentos`, label: 'Visão geral', icon: 'layout' }, { href: `${b}/posicao`, label: 'Posição', icon: 'trend' }, { href: `${b}/transacoes`, label: 'Transações', icon: 'list' }, { href: `${b}/ativos`, label: 'Ativos personalizados', icon: 'tags' }] });
      g.push({ id: 'gastos', label: 'Gastos', items: [{ href: `${b}/gastos`, label: 'Visão geral', icon: 'receipt', exact: true }, { href: `${b}/gastos/transacoes`, label: 'Transações', icon: 'list' }, { href: `${b}/gastos/cadastros`, label: 'Cadastros e regras', icon: 'tags' }] });
      g.push({ id: 'carteira', label: 'Carteira', items: [{ href: `${b}/relatorios`, label: 'Relatórios', icon: 'file' }, { href: `${b}/acessos`, label: 'Acessos', icon: 'users' }].concat(w.role === 'gestor' ? [{ href: `${b}/config`, label: 'Configurações', icon: 'gear' }] : []) });
    }
    g.push({ id: 'conta', label: 'Conta', items: [{ href: '/conta', label: 'Conta e plano', icon: 'card' }, { href: '/white-label', label: 'White-label e integração', icon: 'globe' }] });
    return g;
  }
  const isOn = (it, p) => p === it.href || (!it.exact && p.startsWith(it.href + '/'));
  // Menu: um botão por seção; ao passar o mouse abre ao lado as opções da seção (igual ao Partners)
  function navHtml(w, p) {
    return navGroups(w).map((g) => {
      const on = g.items.some((it) => isOn(it, p)), single = g.items.length === 1;
      const fly = `<div class="flyout" role="menu" aria-label="${esc(g.label)}"><div class="flyout-title">${esc(g.label)}</div>${single ? '' : g.items.map((it) => `<a href="#${it.href}" role="menuitem" class="fly-item ${isOn(it, p) ? 'active' : ''}"${isOn(it, p) ? ' aria-current="page"' : ''}>${ico(it.icon)}<span>${esc(it.label)}</span></a>`).join('')}</div>`;
      return `<div class="nav-sec ${on ? 'on' : ''}${single ? ' single' : ''}" data-group="${g.id}"><a href="#${g.items[0].href}" class="nav-btn ${on ? 'active' : ''}" aria-label="${esc(g.label)}" aria-haspopup="${single ? 'false' : 'true'}"${single && on ? ' aria-current="page"' : ''}>${gico(g.id)}</a>${fly}</div>`;
    }).join('');
  }
  function renderShell(ctx, r, inner) {
    const me = W.state.me, w = ctx.w, p = ctx.path, wl = W.state.wallets || [];
    const mark = (t) => esc((t || 'W').trim()[0].toUpperCase());
    const orgInner = w
      ? `<div class="org-mark">${esc(W.initials(w.name))}</div><div><div class="org-name">${esc(w.name)}${wl.length > 1 ? ' <span class="org-caret" aria-hidden="true">▾</span>' : ''}</div><div class="org-sub">${esc(`${ROLE[w.role]}${w.is_owner ? ' · titular da cobrança' : ''}`)}</div></div>`
      : `<div class="org-mark logo"></div><div><div class="org-name">Lottus Wealth</div><div class="org-sub">Patrimônio, investimentos e gastos</div></div>`;
    const org = w && wl.length > 1
      ? `<div class="org-wrap"><button class="org org-btn" data-act="org-menu" aria-haspopup="true" aria-expanded="false" aria-label="Trocar de carteira">${orgInner}</button>
          <div class="menu org-menu" id="org-menu" hidden><div class="menu-head"><div class="menu-sub">Suas carteiras</div></div>
          ${wl.map((x) => `<a class="menu-item org-item ${x.id === w.id ? 'on' : ''}" href="#/w/${esc(x.id)}/patrimonio" style="text-decoration:none"><span class="org-dot">${esc(W.initials(x.name))}</span><span>${esc(x.name)}<small>${x.id === w.id ? 'Em uso' : esc(ROLE[x.role])}</small></span></a>`).join('')}
          <a class="menu-item" href="#/carteiras" style="text-decoration:none">${ico('wallet')} Todas as carteiras</a></div></div>`
      : `<div class="org">${orgInner}</div>`;
    $app().innerHTML = `<div class="shell"><aside class="sidenav"><a href="#/carteiras" class="sidenav-mark" aria-label="Lottus, início"></a><nav class="sidenav-items" id="nav" aria-label="Menu">${navHtml(w, p)}</nav></aside>
      <main class="frame"><div class="surface"><header class="topbar">${org}
        <div class="topbar-right"><div class="profile"><button class="avatar" id="avatar" data-act="profile-menu" aria-haspopup="true" aria-expanded="false" aria-label="Perfil">${esc(W.initials(me.profile.name))}</button>
          <div class="menu" id="pmenu" hidden><div class="menu-head"><div class="menu-name">${esc(me.profile.name)}</div><div class="menu-sub">${esc(me.email)}</div></div>
          <a class="menu-item" href="#/conta" style="text-decoration:none">${ico('card')} Conta e plano</a><button class="menu-item danger" data-act="logout">${ico('logout')} Sair</button></div></div></div></header>
        <div class="content" id="view">${banner(ctx)}${inner}</div></div></main></div>`;
  }
  function banner(ctx) {
    const w = ctx.w, pr = W.state.me.profile;
    if (w && w.read_only) return `<div class="banner danger">${ico('lock')}<div class="grow">${w.archived ? 'Esta carteira está arquivada.' : 'Esta carteira está somente para visualização, por pendência de pagamento do titular da cobrança.'}${w.is_owner ? ' <a href="#/conta">Regularizar na Conta e plano</a>' : ''}</div></div>`;
    if (!w && pr.billing_status === 'atrasado') return `<div class="banner danger">${ico('lock')}<div class="grow">Há uma cobrança em atraso: suas carteiras estão somente para visualização. <a href="#/conta">Ver faturas</a></div></div>`;
    return '';
  }
  // a faixa de aviso vem antes do conteúdo; como renderShell injeta o "inner" depois, guardamos o banner para reaplicar
  const _render = renderShell;

  /* ---------- delegação de eventos (sem scripts inline: CSP) ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    const menu = document.getElementById('pmenu');
    if (menu && !menu.hidden && !e.target.closest('.profile')) { menu.hidden = true; const a = document.getElementById('avatar'); if (a) a.setAttribute('aria-expanded', 'false'); }
    const om = document.getElementById('org-menu');
    if (om && !om.hidden && !e.target.closest('.org-wrap')) om.hidden = true;
    // celular/tablet: o primeiro toque abre as opções da seção, o segundo segue o link
    const nb = e.target.closest('.nav-sec:not(.single) > .nav-btn');
    if (nb && window.matchMedia && window.matchMedia('(hover: none)').matches && !nb.parentElement.classList.contains('open')) { e.preventDefault(); document.querySelectorAll('.nav-sec.open').forEach((x) => x.classList.remove('open')); nb.parentElement.classList.add('open'); }
    else if (!e.target.closest('.nav-sec')) document.querySelectorAll('.nav-sec.open').forEach((x) => x.classList.remove('open'));
    if (!t) return;
    const fn = W.acts[t.dataset.act];
    if (fn) { if (t.tagName === 'A') e.preventDefault(); try { await fn(t, e); } catch (err) { W.fail(err); } }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const fn = W.forms[f.dataset.form]; if (!fn) return;
    const btn = f.querySelector('button[type=submit]');
    await W.busy(btn, () => fn(f, e));
  });
  let lt; document.addEventListener('input', (e) => { const f = e.target.closest('form[data-live]'); if (f && e.target.matches('input[type=search],input[type=text]')) { clearTimeout(lt); lt = setTimeout(() => W.live[f.dataset.live](f), 350); } });
  document.addEventListener('change', (e) => { const f = e.target.closest('form[data-live]'); if (f && !e.target.matches('input[type=search],input[type=text]')) W.live[f.dataset.live](f); });
  document.addEventListener('input', (e) => { if (e.target.matches('input[data-mask=cpf]')) e.target.value = W.cpf(e.target.value); });

  Object.assign(W.acts, {
    'modal-close': () => W.closeModal(),
    reload: () => route(),
    'org-menu': (el, e) => { e.stopPropagation(); const m = document.getElementById('org-menu'); m.hidden = !m.hidden; el.setAttribute('aria-expanded', String(!m.hidden)); },
    'profile-menu': (el, e) => { e.stopPropagation(); const m = document.getElementById('pmenu'); m.hidden = !m.hidden; el.setAttribute('aria-expanded', String(!m.hidden)); },
    logout: async () => { await W.sb.auth.signOut(); W.state = { me: null, wallets: [], wallet: null }; W.go('/entrar'); },
    'pw-toggle': (el) => { const i = el.parentElement.querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.setAttribute('aria-pressed', String(show)); },
  });

  /* ---------- entrada, cadastro e recuperação ---------- */
  const authPage = (title, sub, body, foot) => `<div class="auth"><div class="auth-side"><div class="auth-logo"></div><div class="auth-blob"></div><div class="auth-side-copy"><h2>Seu patrimônio, num só lugar.</h2><p>Investimentos, gastos e bens organizados em carteiras que você compartilha com quem quiser.</p></div></div>
    <div class="auth-main"><div class="auth-logo-sm"></div><div class="auth-card"><div class="auth-head"><div class="auth-title">${esc(title)}</div>${sub ? `<div class="muted">${sub}</div>` : ''}</div>${body}</div>${foot ? `<div class="auth-foot">${foot}</div>` : ''}</div></div>`;
  const pwField = (name, label, ac) => `<div class="field"><label for="${name}">${label}</label><div class="input-ico">${ico('lock')}<input class="input" id="${name}" name="${name}" type="password" autocomplete="${ac}" required minlength="8"><button type="button" class="pw-toggle" data-act="pw-toggle" aria-label="Mostrar senha" aria-pressed="false">${ico('eye')}</button></div></div>`;
  const emailField = (v, ro) => `<div class="field"><label for="email">E-mail</label><div class="input-ico">${ico('mail')}<input class="input" id="email" name="email" type="email" autocomplete="email" required value="${esc(v || '')}"${ro ? ' readonly' : ''}></div></div>`;

  W.route('/entrar', async (ctx) => {
    if (W.state.me) { W.go('/carteiras'); return ''; }
    return authPage('Entrar', 'Acesse suas carteiras.', `<form class="stack" data-form="login">${emailField(ctx.q.get('email'))}${pwField('password', 'Senha', 'current-password')}<div id="login-err"></div>
      <button class="btn lg" type="submit">Entrar</button></form><div class="row between"><a href="#/recuperar">Esqueci a senha</a><a href="#/criar-conta">Criar conta grátis</a></div>`, 'Ao entrar você concorda em usar o Lottus Wealth apenas para organizar as suas finanças ou as de quem autorizou você.');
  }, { public: true, bare: true });

  W.forms.login = async (f) => {
    const v = W.form(f); const err = document.getElementById('login-err'); err.innerHTML = '';
    const { error } = await W.sb.auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) { err.innerHTML = `<div class="error-box">${esc(W.msgOf(error.message))}</div>`; return; }
    const { data: a } = await W.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (a && a.nextLevel === 'aal2' && a.currentLevel !== 'aal2') {
      const { data: fs } = await W.sb.auth.mfa.listFactors(); const fac = (fs.totp || []).find((x) => x.status === 'verified');
      if (fac) { $app().innerHTML = authPage('Código do autenticador', 'Digite o código de 6 dígitos do seu aplicativo.', `<form class="stack" data-form="mfa" data-factor="${esc(fac.id)}">${otpHtml()}<div id="mfa-err"></div><button class="btn lg" type="submit">Confirmar</button></form><a href="#/entrar" data-act="logout">Voltar</a>`); wireOtp(document.querySelector('[data-form=mfa]')); return; }
    }
    await afterLogin();
  };
  W.forms.mfa = async (f) => {
    const code = W.form(f).code || ''; if (code.length !== 6) { document.getElementById('mfa-err').innerHTML = '<div class="error-box">Digite os 6 dígitos.</div>'; return; }
    const { error } = await W.sb.auth.mfa.challengeAndVerify({ factorId: f.dataset.factor, code });
    if (error) { document.getElementById('mfa-err').innerHTML = '<div class="error-box">Código incorreto.</div>'; return; }
    await afterLogin();
  };

  function otpHtml() {
    return `<div class="otp" role="group" aria-label="Código de 6 dígitos">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="otp-box" inputmode="numeric" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" maxlength="1" aria-label="Dígito ${i + 1}" data-i="${i}">`).join('')}<input type="hidden" name="code"></div>`;
  }
  function wireOtp(form) {
    if (!form) return; const boxes = [...form.querySelectorAll('.otp-box')]; const hid = form.querySelector('input[name=code]');
    const sync = () => { hid.value = boxes.map((b) => b.value).join(''); boxes.forEach((b) => b.classList.toggle('filled', !!b.value)); };
    const fill = (start, text) => { const d = text.replace(/\D/g, '').slice(0, 6 - start).split(''); d.forEach((c, k) => { boxes[start + k].value = c; }); boxes[Math.min(start + d.length, 5)].focus(); sync(); };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { const v = b.value.replace(/\D/g, ''); if (v.length > 1) return fill(i, v); b.value = v; if (v && i < 5) boxes[i + 1].focus(); sync(); });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); sync(); e.preventDefault(); }
        if (e.key === 'ArrowLeft' && i > 0) { boxes[i - 1].focus(); e.preventDefault(); }
        if (e.key === 'ArrowRight' && i < 5) { boxes[i + 1].focus(); e.preventDefault(); }
      });
      b.addEventListener('focus', () => b.select());
      b.addEventListener('paste', (e) => { e.preventDefault(); fill(i, (e.clipboardData || window.clipboardData).getData('text')); });
    });
    boxes[0].focus();
  }
  // Depois de entrar, volta para a tela que a pessoa tentou abrir sem sessão (link de e-mail, favorito), se houver.
  function nextPath() { let n = null; try { n = sessionStorage.getItem('w_next'); sessionStorage.removeItem('w_next'); } catch { /* navegação privada */ } return n && /^\/[a-z0-9/_-]*$/i.test(n) && n !== '/entrar' ? n : null; }
  async function afterLogin() { await loadMe(); W.state.wallets = []; const done = W.state.me && W.state.me.profile && W.state.me.profile.completed; W.go(done ? (nextPath() || '/carteiras') : '/finalizar'); }

  W.route('/criar-conta', async (ctx) => {
    if (W.state.me) { W.go('/carteiras'); return ''; }
    return signupPage(null);
  }, { public: true, bare: true });
  function signupPage(inv) {
    return authPage('Criar conta', inv ? `${esc(inv.inviter || 'Alguém')} convidou você para a carteira <b>${esc(inv.wallet)}</b>. Crie sua conta com o e-mail do convite.` : 'Grátis para uma carteira. Importe extratos e investimentos sem custo.',
      `<form class="stack" data-form="signup">${emailField(inv && inv.email, !!inv)}${pwField('password', 'Senha (mínimo 8 caracteres)', 'new-password')}${pwField('password2', 'Repita a senha', 'new-password')}
      <label class="check"><input type="checkbox" name="terms" required> <span class="small">Li e aceito os termos de uso e a política de privacidade.</span></label><div id="su-err"></div><button class="btn lg" type="submit">Criar conta</button></form><div class="center">Já tem conta? <a href="#/entrar">Entrar</a></div>`,
      'Depois do e-mail confirmado você completa o cadastro com nome e CPF.');
  }
  document.addEventListener('input', (e) => { if (e.target.closest('form[data-form=signup]')) { const er = document.getElementById('su-err'); if (er) er.innerHTML = ''; } });
  W.forms.signup = async (f) => {
    const v = W.form(f); const err = document.getElementById('su-err'); err.innerHTML = '';
    if (v.password !== v.password2) { err.innerHTML = '<div class="error-box">As senhas não são iguais.</div>'; return; }
    const { data, error } = await W.sb.auth.signUp({ email: v.email, password: v.password, options: { emailRedirectTo: `${location.origin}/` } });
    if (error) { err.innerHTML = `<div class="error-box">${esc(W.msgOf(error.message))}</div>`; return; }
    if (data.session) { await afterLogin(); return; }
    // e-mail que já tem conta (a mesma senha vale em todas as plataformas Lottus): o Supabase não reenvia nada
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      err.innerHTML = '<div class="error-box">Este e-mail já tem conta Lottus, então nenhum e-mail novo é enviado. <a href="#/entrar">Entre com a sua senha</a> (ou <a href="#/recuperar">recupere a senha</a>) e complete o cadastro do Wealth.</div>'; return;
    }
    $app().innerHTML = authPage('Confirme seu e-mail', `Enviamos um link para <b>${esc(v.email)}</b>. Abra o e-mail e clique no link para continuar.`, '<a class="btn secondary lg" href="#/entrar">Voltar para entrar</a>');
  };

  W.route('/convite/:token', async (ctx) => {
    if (W.state.me) { W.go('/carteiras'); return ''; }
    let inv = null; try { inv = await W.rpc('w_invite_get', { p_token: ctx.params.token }); } catch { /* link inválido */ }
    if (!inv) return authPage('Convite indisponível', 'Este convite expirou, foi cancelado ou o link está incorreto. Peça um novo ao gestor da carteira.', '<a class="btn lg" href="#/entrar">Entrar</a>');
    return signupPage(inv);
  }, { public: true, bare: true });

  W.route('/recuperar', async () => authPage('Recuperar senha', 'Enviaremos um link para o seu e-mail.', `<form class="stack" data-form="forgot">${emailField('')}<div id="fg-msg"></div><button class="btn lg" type="submit">Enviar link</button></form><a href="#/entrar">Voltar</a>`), { public: true, bare: true });
  W.forms.forgot = async (f) => {
    const { error } = await W.sb.auth.resetPasswordForEmail(W.form(f).email, { redirectTo: `${location.origin}/` });
    document.getElementById('fg-msg').innerHTML = error ? `<div class="error-box">${esc(W.msgOf(error.message))}</div>` : '<div class="note-box">Se o e-mail tiver conta, o link já está a caminho.</div>';
  };
  W.route('/nova-senha', async () => {
    if (!W.state.me) { const { data } = await W.sb.auth.getSession(); if (!data.session) { W.go('/entrar'); return ''; } }
    return authPage('Nova senha', 'Escolha uma senha nova.', `<form class="stack" data-form="newpass">${pwField('password', 'Nova senha', 'new-password')}<div id="np-err"></div><button class="btn lg" type="submit">Salvar</button></form>`);
  }, { public: true, bare: true });
  W.forms.newpass = async (f) => {
    const { error } = await W.sb.auth.updateUser({ password: W.form(f).password });
    if (error) { document.getElementById('np-err').innerHTML = `<div class="error-box">${esc(W.msgOf(error.message))}</div>`; return; }
    W.toast('Senha alterada'); await afterLogin();
  };

  W.route('/finalizar', async () => {
    const me = W.state.me; if (!me) { W.go('/entrar'); return ''; } if (me.profile && me.profile.completed) { W.go('/carteiras'); return ''; }
    return authPage('Finalize seu cadastro', 'Precisamos de poucos dados para liberar suas carteiras.', `<form class="stack" data-form="finish">
      <div class="field"><label for="name">Nome completo</label><input class="input" id="name" name="name" required minlength="3" autocomplete="name" value="${esc((me && me.profile && me.profile.name) || '')}"></div>
      <div class="field"><label for="cpf">CPF</label><input class="input" id="cpf" name="cpf" data-mask="cpf" inputmode="numeric" required maxlength="14" autocomplete="off"></div>
      <div class="field"><label for="phone">Celular (opcional)</label><input class="input" id="phone" name="phone" type="tel" autocomplete="tel"></div><div id="fn-err"></div><button class="btn lg" type="submit">Continuar</button></form><a href="#/entrar" data-act="logout">Sair</a>`);
  }, { public: true, bare: true });
  W.forms.finish = async (f) => {
    const v = W.form(f);
    try { W.state.me = await W.rpc('w_finish_signup', { p_name: v.name, p_cpf: v.cpf, p_phone: v.phone || null }); W.go(nextPath() || '/carteiras'); }
    catch (e) { document.getElementById('fn-err').innerHTML = `<div class="error-box">${esc(e.message)}</div>`; }
  };

  /* ---------- minhas carteiras ---------- */
  const groupsHtml = (gr, ws) => `<div class="card" style="margin-bottom:20px"><div class="card-head"><div><h2>Grupos de carteiras</h2><div class="muted small">Reúna carteiras para ver o patrimônio consolidado.</div></div><button class="btn secondary sm" data-act="group-new"${ws.length ? '' : ' disabled'}>${ico('plus')} Novo grupo</button></div>
    ${gr.groups.length ? `<div class="list">${gr.groups.map((g) => `<a class="list-row" href="#/grupos/${esc(g.id)}"><div class="grow"><b>${esc(g.name)}</b><div class="muted small">${g.wallets.length} ${g.wallets.length === 1 ? 'carteira' : 'carteiras'}</div></div><b>${W.brl(g.networth)}</b></a>`).join('')}</div>` : '<div class="empty">Nenhum grupo ainda.</div>'}</div>`;
  const groupModal = (g) => {
    const ws = W.state.wallets || []; const sel = new Set(g ? g.wallets : []);
    W.modal({ title: g ? 'Editar grupo' : 'Novo grupo', body: `<form class="stack" data-form="group-save"><input type="hidden" name="id" value="${esc(g ? g.id : '')}"><div class="field"><label for="gn">Nome do grupo</label><input class="input" id="gn" name="name" required minlength="2" maxlength="80" value="${esc(g ? g.name : '')}" placeholder="Ex.: Família Silva"></div>
      <div class="field"><label>Carteiras do grupo</label><div class="list">${ws.map((w) => `<label class="list-row"><input type="checkbox" name="w" value="${esc(w.id)}"${sel.has(w.id) ? ' checked' : ''}><span class="grow">${esc(w.name)}</span></label>`).join('')}</div></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
  };
  Object.assign(W.acts, {
    'group-new': () => groupModal(null),
    'group-edit': (el) => groupModal((W.groupsCache.groups || []).find((x) => x.id === el.dataset.id)),
    'group-del': async (el) => { if (!(await W.confirm('Excluir grupo?', 'As carteiras continuam como estão; só o agrupamento é removido.', 'Excluir', true))) return; await W.rpc('w_group_delete', { p_id: el.dataset.id }); W.toast('Grupo excluído'); W.go('/carteiras'); },
  });
  W.forms['group-save'] = async (f) => {
    const ids = [...f.querySelectorAll('input[name=w]:checked')].map((x) => x.value); if (!ids.length) throw new Error('Escolha ao menos uma carteira.');
    const v = W.form(f); const r = await W.rpc('w_group_save', { p_id: v.id || null, p_name: v.name, p_wallets: ids }); W.closeModal(); W.toast('Grupo salvo'); W.go(`/grupos/${r.id}`); route();
  };
  W.route('/grupos/:id', async (ctx) => {
    const id = ctx.params ? (ctx.params.id || Object.values(ctx.params)[0]) : ctx.id;
    const [g, gr] = await Promise.all([W.rpc('w_group_get', { p_id: id }), W.rpc('w_groups_list'), W.loadWallets()]); W.groupsCache = gr;
    const tot = g.wallets.reduce((a, x) => ({ inv: a.inv + Number(x.investimentos), c: a.c + Number(x.contas), b: a.b + Number(x.bens), d: a.d + Number(x.dividas), t: a.t + Number(x.total) }), { inv: 0, c: 0, b: 0, d: 0, t: 0 });
    const kpi = (l, v) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="big">${v}</div></div>`;
    ctx.after = () => { const h = document.getElementById('ch-grp'); if (h && g.wallets.length) W.donut(h, g.wallets.filter((x) => Number(x.total) > 0).map((x) => ({ name: x.name, value: Number(x.total) })), { name: 'Patrimônio por carteira' }); };
    return `${W.pageHead(g.name, 'Patrimônio consolidado das carteiras do grupo.', `<button class="btn secondary" data-act="group-edit" data-id="${esc(g.id)}">Editar</button><button class="btn danger" data-act="group-del" data-id="${esc(g.id)}">Excluir</button>`, ['/carteiras', 'Minhas carteiras'])}
      <div class="kpis">${kpi('Patrimônio líquido', W.brl(tot.t))}${kpi('Investimentos', W.brl(tot.inv))}${kpi('Contas', W.brl(tot.c))}${kpi('Bens', W.brl(tot.b))}${kpi('Dívidas', W.brl(tot.d))}</div>
      <div class="grid-2"><div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Carteiras</h2></div><div class="table-wrap"><table class="tight"><thead><tr><th>Carteira</th><th class="num">Investimentos</th><th class="num">Contas</th><th class="num">Bens − dívidas</th><th class="num">Patrimônio</th></tr></thead><tbody>${g.wallets.map((x) => `<tr><td><a href="#/w/${esc(x.id)}/patrimonio">${esc(x.name)}</a></td><td class="num">${W.brl(x.investimentos)}</td><td class="num">${W.brl(x.contas)}</td><td class="num">${W.brl(Number(x.bens) - Number(x.dividas))}</td><td class="num"><b>${W.brl(x.total)}</b></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Participação de cada carteira</h2></div><div id="ch-grp"></div></div></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Pessoas do grupo</h2><div class="muted small">Quem entra no grupo passa a acessar todas as carteiras dele, com o acesso escolhido.</div></div></div>
        ${g.members.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Pessoa</th><th>Acesso</th><th>Desde</th><th></th></tr></thead><tbody>${g.members.map((m) => `<tr><td>${esc(m.name)}<div class="muted small">${esc(m.email)}</div></td><td>${tag(ROLE[m.role])}</td><td>${W.dt(m.since)}</td><td class="actions"><button class="btn danger sm" data-act="gmember-del" data-group="${esc(g.id)}" data-user="${esc(m.user_id)}">Remover</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Ninguém além de você.</div>'}
        <form class="filters" data-form="gmember-add" style="margin-top:14px"><input type="hidden" name="group" value="${esc(g.id)}"><div class="field"><label for="gcpf">CPF da pessoa</label><input class="input" id="gcpf" name="cpf" data-mask="cpf" inputmode="numeric" maxlength="14" required autocomplete="off"></div>
          <div class="field"><label for="grole">Acesso</label><select class="input" id="grole" name="role">${W.opts(Object.entries(ROLE), 'visualizador')}</select></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Adicionar</button></div></form>
        <p class="muted small">A pessoa precisa ter conta no Wealth. Quem é adicionado não paga nada: a cobrança continua com o titular de cada carteira.</p></div>
      ${brandHtml(g)}`;
  });
  const STYLES = [['classico', 'Clássico'], ['moderno', 'Moderno'], ['minimalista', 'Minimalista']], FONTS = [['inter', 'Inter (sem serifa)'], ['serif', 'Serifada'], ['mono', 'Monoespaçada']];
  const FONT_CSS = { inter: "'Inter', system-ui, sans-serif", serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, Menlo, Consolas, monospace" };
  const RADIUS = { classico: '10px', moderno: '20px', minimalista: '2px' };
  const brandPrev = (b) => { const c = b.color || '#c73053', c2 = b.color2 || '#1a1a1a'; return `<div id="gb-prev" style="border:1px solid var(--line,#e5e5e5);border-radius:${RADIUS[b.style] || '10px'};padding:20px;font-family:${FONT_CSS[b.font] || FONT_CSS.inter};background:#fff"><div class="row" style="gap:10px;align-items:center">${b.logo_url && /^https:\/\//i.test(b.logo_url) ? `<img alt="" src="${esc(b.logo_url)}" style="height:32px;max-width:120px;object-fit:contain">` : `<span style="display:inline-grid;place-items:center;width:32px;height:32px;border-radius:${RADIUS[b.style] || '10px'};background:${esc(c)};color:#fff;font-weight:600">${esc(W.initials(b.brand_name || 'W'))}</span>`}<b style="color:${esc(c2)}">${esc(b.brand_name || 'Sua marca')}</b></div><p style="color:${esc(c2)};opacity:.7;margin:14px 0">Patrimônio líquido</p><div style="font-size:26px;font-weight:600;color:${esc(c2)}">R$ 1.250.000,00</div><button type="button" style="margin-top:16px;border:0;color:#fff;background:${esc(c)};padding:10px 18px;border-radius:${RADIUS[b.style] || '10px'};font-family:inherit">Ver carteira</button></div>`; };
  const brandHtml = (g) => {
    if (!g.fund) return `<div class="card stack" style="margin-top:16px"><div class="row between"><div><h2>Marca do grupo</h2><div class="muted small">Estilo, logo e cores para gerar a plataforma white-label deste grupo.</div></div>${tag('Plano Fund', 'brand')}</div><div><a class="btn secondary" href="#/conta">Conhecer o plano Fund</a></div></div>`;
    const b = g.brand || {};
    return `<div class="split" style="margin-top:16px"><form class="card stack" data-form="brand-save"><input type="hidden" name="group" value="${esc(g.id)}"><div class="card-head"><div><h2>Marca do grupo</h2><div class="muted small">Define como a plataforma white-label deste grupo aparece para as pessoas dele.</div></div></div>
      <label class="check"><input type="checkbox" name="enabled"${b.enabled ? ' checked' : ''}> <span>Ativar plataforma com a marca deste grupo</span></label>
      <div class="field"><label>Nome exibido</label><input class="input" name="brand_name" maxlength="60" value="${esc(b.brand_name || '')}" placeholder="Ex.: Alfa Wealth"></div>
      <div class="field"><label>Endereço do logo (https)</label><input class="input" name="logo_url" type="url" value="${esc(b.logo_url || '')}" placeholder="https://…/logo.png"></div>
      <div class="form-grid"><div class="field"><label>Cor principal</label><input class="input" name="color" type="color" value="${esc(b.color || '#c73053')}"></div><div class="field"><label>Cor do texto e detalhes</label><input class="input" name="color2" type="color" value="${esc(b.color2 || '#1a1a1a')}"></div>
        <div class="field"><label>Estilo</label><select class="input" name="style">${W.opts(STYLES, b.style || 'classico')}</select></div><div class="field"><label>Tipografia</label><select class="input" name="font">${W.opts(FONTS, b.font || 'inter')}</select></div></div>
      <div class="field"><label>Domínio</label><input class="input" name="domain" value="${esc(b.domain || '')}" placeholder="carteira.seusite.com.br"></div>
      <div class="help">O domínio é apontado (CNAME) para <b>${esc(W.cfg.siteUrl.replace('https://', ''))}</b>; a Lottus conclui a ativação após o salvamento.</div><div><button class="btn" type="submit">Salvar marca</button></div></form>
      <div class="card"><div class="card-head"><h2>Pré-visualização</h2></div>${brandPrev(b)}</div></div>`;
  };
  W.forms['gmember-add'] = async (f) => { const v = W.form(f); await W.rpc('w_group_member_add', { p_group: v.group, p_cpf: v.cpf, p_role: v.role }); W.toast('Pessoa adicionada', 'Ela já enxerga as carteiras do grupo.'); route(); };
  W.acts['gmember-del'] = async (el) => { if (!(await W.confirm('Remover do grupo?', 'A pessoa perde o acesso às carteiras que só tinha por este grupo.', 'Remover', true))) return; await W.rpc('w_group_member_remove', { p_group: el.dataset.group, p_user: el.dataset.user }); W.toast('Pessoa removida'); route(); };
  W.forms['brand-save'] = async (f) => { const v = W.form(f); const lg = f.querySelector('[name=logo_url]'); W.fieldError(lg, ''); if (v.logo_url && !/^https:\/\/[^\s]+$/i.test(v.logo_url)) { W.fieldError(lg, 'Use um endereço que comece com https://'); const er = new Error('Use um endereço que comece com https://'); er.shownInField = true; throw er; } await W.rpc('w_group_brand_save', { p_group: v.group, p: { enabled: !!f.querySelector('[name=enabled]').checked, brand_name: v.brand_name, logo_url: v.logo_url, color: v.color, color2: v.color2, style: v.style, font: v.font, domain: v.domain } }); W.toast('Marca salva'); };
  document.addEventListener('input', (e) => { const f = e.target.closest('form[data-form=brand-save]'); if (!f) return; const v = W.form(f); const el = document.getElementById('gb-prev'); if (el) el.outerHTML = brandPrev(v); });
  document.addEventListener('change', (e) => { const f = e.target.closest('form[data-form=brand-save]'); if (!f) return; const v = W.form(f); const el = document.getElementById('gb-prev'); if (el) el.outerHTML = brandPrev(v); });
  W.route('/carteiras', async (ctx) => {
    const [ws, invites, gr] = await Promise.all([W.loadWallets(), W.rpc('w_invites_mine'), W.rpc('w_groups_list')]); W.groupsCache = gr;
    const inv = invites.map((i) => `<div class="card row between"><div><b>${esc(i.inviter)}</b> convidou você para a carteira <b>${esc(i.wallet)}</b><div class="muted small">Acesso de ${esc(ROLE[i.role])} · vale até ${W.dt(i.expires_at)}</div></div><div class="row"><button class="btn secondary sm" data-act="invite-no" data-id="${esc(i.id)}">Recusar</button><button class="btn sm" data-act="invite-yes" data-id="${esc(i.id)}">Aceitar</button></div></div>`).join('');
    const cards = ws.map((w) => `<a class="wallet-card" href="#/w/${esc(w.id)}/patrimonio"><div class="row between"><span class="org-mark">${esc(W.initials(w.name))}</span><div class="row">${w.is_owner ? tag('Titular da cobrança', 'brand') : ''}${w.read_only ? tag('Somente leitura', 'danger') : ''}</div></div>
      <div><h3>${esc(w.name)}</h3><div class="muted small">${esc(ROLE[w.role])}${w.is_owner ? '' : ` · de ${esc(w.owner_name || '')}`}</div></div>
      <div><div class="muted small">Patrimônio líquido</div><div class="big">${W.brl(w.networth)}</div></div><div class="muted small">${w.members} ${w.members === 1 ? 'pessoa' : 'pessoas'} com acesso</div></a>`).join('');
    return `${W.pageHead('Minhas carteiras', 'Carteiras criadas por você e as que outras pessoas compartilharam.', `<a class="btn" href="#/carteiras/nova">${ico('plus')} Nova carteira</a>`)}
      ${invites.length ? `<div class="stack" style="margin-bottom:20px">${inv}</div>` : ''}
      ${gr.allowed ? groupsHtml(gr, ws) : ''}
      ${ws.length ? `<div class="wallets">${cards}<a class="wallet-card new" href="#/carteiras/nova">${ico('plus')}<span>Criar uma nova carteira</span></a></div>` : `<div class="card center"><h2>Você ainda não tem carteiras</h2><p class="muted">Crie a primeira carteira ou aguarde um convite.</p><a class="btn" href="#/carteiras/nova">Criar carteira</a></div>`}`;
  });
  Object.assign(W.acts, {
    'invite-yes': async (el) => { await W.busy(el, async () => { const r = await W.rpc('w_invite_answer', { p_invite: el.dataset.id, p_accept: true }); W.state.wallets = []; W.toast('Convite aceito', 'A carteira já está na sua lista.'); W.go(`/w/${r.wallet_id}/patrimonio`); }); },
    'invite-no': async (el) => { if (!(await W.confirm('Recusar convite?', 'A pessoa que convidou será avisada de que você não quis o acesso.', 'Recusar', true))) return; await W.rpc('w_invite_answer', { p_invite: el.dataset.id, p_accept: false }); W.toast('Convite recusado'); route(); },
  });

  W.route('/carteiras/nova', async () => {
    const pr = W.state.me.profile; await W.loadWallets();
    const owned = W.state.wallets.filter((w) => w.is_owner).length;
    const second = owned >= 1 && pr.plan !== 'fund';
    const b = second ? await W.rpc('w_billing_me') : null;
    const needPay = second && !pr.payment_ok;
    const price = b ? b.prices.pro : 0;
    return `${W.pageHead('Nova carteira', 'Cada carteira é de uma pessoa ou de uma empresa.', '', ['/carteiras', 'Minhas carteiras'])}
      <div class="${second ? 'split' : 'stack'}"><form class="card stack" data-form="wallet-new"><div class="field"><label for="wn">Nome da pessoa ou empresa</label><input class="input" id="wn" name="name" required minlength="2" maxlength="80" placeholder="Ex.: Maria Silva ou Silva Ltda."></div>
        ${second ? `<div class="note-box">Com a segunda carteira você passa ao plano Pro: <b>${W.brl(price)} por carteira ao mês</b>, cobrado de todas as suas carteiras (${owned + 1} carteiras = ${W.brl(price * (owned + 1))} por mês).${needPay ? ' Antes, informe os dados de cobrança.' : ''} Para ver várias carteiras juntas, use os Grupos.</div>` : ''}
        <div class="row"><button class="btn" type="submit"${needPay ? ' disabled' : ''}>Criar carteira</button>${needPay ? '<button class="btn secondary" type="button" data-act="pay-request">Informar dados de cobrança</button>' : ''}</div></form>
        ${second ? `<div class="card stack"><h3>Plano Pro</h3><div class="big">${W.brl(price)}</div><div class="muted small">por carteira, por mês</div><ul class="muted small" style="padding-left:18px;margin:0;display:grid;gap:6px"><li>Carteiras ilimitadas</li><li>Grupos com patrimônio consolidado e pessoas com acesso</li><li>Quem você convida não paga</li><li>Cobrança fechada todo mês; vence 10 dias depois</li></ul></div>` : ''}</div>`;
  });
  W.forms['wallet-new'] = async (f) => { const v = W.form(f); const r = await W.rpc('w_wallet_create', { p_name: v.name }); W.state.wallets = []; await loadMe(); W.toast('Carteira criada'); W.go(`/w/${r.id}/patrimonio`); };
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const METHODS = [['cartao', 'Cartão de crédito', 'Cobrança automática todo mês. O cartão é cadastrado no ambiente seguro do provedor de pagamento; nós nunca vemos nem guardamos o número.'], ['pix', 'Pix', 'Enviamos o código Pix (QR e copia e cola) a cada fatura.'], ['boleto', 'Boleto bancário', 'Enviamos o boleto por e-mail a cada fatura, com os dados de cobrança abaixo.']];
  async function billingModal(purpose) {
    const bp = (await W.rpc('w_billing_profile_get')) || {}; const me = W.state.me;
    W.modal({ title: purpose === 'fund' ? 'Assinar o Fund' : 'Dados de cobrança', wide: true, body: `<form class="stack" data-form="billing-save"><input type="hidden" name="purpose" value="${esc(purpose || '')}">
      <div class="form-grid"><div class="field full"><label>Nome ou razão social</label><input class="input" name="holder_name" required minlength="3" value="${esc(bp.holder_name || me.profile.name || '')}"></div>
        <div class="field"><label>CPF ou CNPJ</label><input class="input" name="doc" data-mask="doc" required inputmode="numeric" value="${esc(bp.doc || '')}"></div><div class="field"><label>E-mail de cobrança</label><input class="input" name="email" type="email" required value="${esc(bp.email || me.email || '')}"></div>
        <div class="field"><label>CEP</label><input class="input" name="zip" required inputmode="numeric" maxlength="9" value="${esc(bp.zip || '')}" placeholder="00000-000"></div><div class="field"><label>Rua</label><input class="input" name="street" required value="${esc(bp.street || '')}"></div>
        <div class="field"><label>Número</label><input class="input" name="number" required value="${esc(bp.number || '')}"></div><div class="field"><label>Complemento</label><input class="input" name="complement" value="${esc(bp.complement || '')}"></div>
        <div class="field"><label>Bairro</label><input class="input" name="district" required value="${esc(bp.district || '')}"></div><div class="field"><label>Cidade</label><input class="input" name="city" required value="${esc(bp.city || '')}"></div>
        <div class="field"><label>UF</label><select class="input" name="state" required>${W.opts(UFS.map((u) => [u, u]), bp.state || '', 'Escolha')}</select></div></div>
      <div class="field"><label>Forma de pagamento</label><div class="stack-sm">${METHODS.map(([k, l, d]) => `<label class="check" style="align-items:flex-start"><input type="radio" name="method" value="${k}"${(bp.method || 'cartao') === k ? ' checked' : ''}><span><b>${l}</b><br><span class="muted small">${d}</span></span></label>`).join('')}</div></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">${purpose === 'fund' ? 'Salvar e pedir o Fund' : 'Salvar dados'}</button></div></form>` });
  }
  W.acts['pay-request'] = () => billingModal('');
  W.acts['billing-edit'] = () => billingModal('');
  W.forms['billing-save'] = async (f) => {
    const v = W.form(f); await W.rpc('w_billing_profile_save', { p: { holder_name: v.holder_name, doc: v.doc, email: v.email, zip: v.zip, street: v.street, number: v.number, complement: v.complement, district: v.district, city: v.city, state: v.state, method: v.method } });
    await W.rpc('w_payment_request'); W.closeModal(); await route();
    W.modal({ title: v.purpose === 'fund' ? 'Pedido do Fund recebido' : 'Dados de cobrança salvos', body: `<p>${v.purpose === 'fund' ? 'A equipe Lottus valida os dados e libera o white-label e a API; você será avisado por e-mail.' : 'A equipe Lottus valida a forma de pagamento e libera a segunda carteira; você será avisado por e-mail.'}</p><p class="muted small">Dúvidas: ${esc(W.cfg.supportEmail)}</p>`, foot: '<button class="btn" data-act="modal-close">Entendi</button>' });
  };

  /* ---------- conta e plano ---------- */
  const INV_TAG = { aberta: ['Em aberto', 'warning'], paga: ['Paga', 'success'], contrato: ['Sob contrato', ''], cancelada: ['Cancelada', ''] };
  W.route('/conta', async (ctx) => {
    const [b, fs, bp] = await Promise.all([W.rpc('w_billing_me'), W.sb.auth.mfa.listFactors(), W.rpc('w_billing_profile_get')]);
    const me = W.state.me, fac = ((fs.data && fs.data.totp) || []).find((x) => x.status === 'verified');
    const planName = { gratis: 'Grátis', pro: 'Pro', fund: 'Fund' }[b.plan];
    const li = (t) => `<li>${t}</li>`;
    const plan = (key, name, price, sub, feats, cta) => `<div class="card stack plan${b.plan === key ? ' current' : ''}" style="${b.plan === key ? 'border-color:var(--rosa);' : ''}"><div class="row between"><h2>${name}</h2>${b.plan === key ? tag('Seu plano', 'brand') : ''}</div>
      <div><div class="big">${price}</div><div class="muted small">${sub}</div></div><ul class="muted small" style="padding-left:18px;margin:0;display:grid;gap:6px">${feats.map(li).join('')}</ul><div style="margin-top:auto">${b.plan === key ? '<button class="btn secondary" disabled>Plano atual</button>' : cta}</div></div>`;
    const planos = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:16px;margin-bottom:24px">
      ${plan('gratis', 'Grátis', 'R$ 0', 'para sempre', ['1 carteira (de uma pessoa ou empresa)', 'Gastos, investimentos e patrimônio', 'Importação de arquivos', 'Quem você convida não paga'], '<a class="btn secondary" href="#/carteiras/nova">Continuar no Grátis</a>')}
      ${plan('pro', 'Pro', W.brl(b.prices.pro), 'por carteira, por mês', ['Carteiras ilimitadas', 'Grupos de carteiras: patrimônio consolidado e pessoas com acesso a todas elas', 'Valor fixo: não varia com o patrimônio', 'Ativa ao criar a 2ª carteira'], '<a class="btn" href="#/carteiras/nova">Criar a 2ª carteira e ativar</a>')}
      ${plan('fund', 'Fund', W.brl(b.prices.fund), 'por carteira, por mês', ['Tudo do Pro', 'White-label: estilo, logo e cores de cada grupo', 'API para integrar os seus sistemas', 'Suporte prioritário'], '<button class="btn" data-act="fund-request">Assinar o Fund</button>')}</div>`;
    const showBilling = b.billed || b.plan !== 'gratis' || b.owned_wallets >= 2 || bp;
    return `${W.pageHead('Conta e plano', 'Plano, cobrança, dados pessoais e segurança.')}
      ${planos}
      <div class="kpis"><div class="kpi"><div class="kpi-label">Plano atual</div><div class="big">${planName}</div>${b.billing_status === 'atrasado' ? tag('Pagamento em atraso', 'danger') : tag('Em dia', 'success')}</div>
        <div class="kpi"><div class="kpi-label">Carteiras sob sua cobrança</div><div class="big">${b.owned_wallets}</div></div>
        <div class="kpi"><div class="kpi-label">Valor mensal</div><div class="big">${b.billed ? W.brl(b.estimate) : 'R$ 0,00'}</div><div class="muted small">${b.billed ? `${b.owned_wallets} × ${W.brl(b.price)}` : ''}</div></div></div>
      ${showBilling ? `<div class="grid-2"><div class="card stack"><div class="card-head"><h2>Dados de cobrança</h2><button class="btn secondary sm" data-act="billing-edit">${bp ? 'Editar' : 'Informar'}</button></div>
        ${bp ? `<dl class="kv"><dt>Titular</dt><dd>${esc(bp.holder_name)}</dd><dt>CPF/CNPJ</dt><dd>${esc(bp.doc)}</dd><dt>E-mail</dt><dd>${esc(bp.email)}</dd><dt>Endereço</dt><dd>${esc(bp.street)}, ${esc(bp.number)}${bp.complement ? ' · ' + esc(bp.complement) : ''} · ${esc(bp.district)}<br>${esc(bp.city)}/${esc(bp.state)} · CEP ${esc(bp.zip)}</dd><dt>Pagamento</dt><dd>${esc({ cartao: 'Cartão de crédito', pix: 'Pix', boleto: 'Boleto' }[bp.method])} · ${b.payment_ok ? tag('Validado', 'success') : tag('Em validação', 'warning')}</dd></dl>` : '<div class="empty">Nenhum dado informado ainda.</div>'}
        <p class="muted small">Atraso superior a ${b.grace_days} dias após o vencimento deixa suas carteiras somente para visualização para todos.</p></div>
      <div class="card"><div class="card-head"><h2>Faturas</h2></div>${b.invoices.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Referência</th><th class="num">Carteiras</th><th class="num">Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>${b.invoices.map((i) => `<tr><td>${W.monthLabel(i.ref_month)}</td><td class="num">${(i.detail || []).length}</td><td class="num">${W.brl(i.amount)}</td><td>${W.dt(i.due_date)}</td><td>${tag(INV_TAG[i.status][0], INV_TAG[i.status][1])}${i.payment_error ? '<div class="small neg">Pagamento recusado</div>' : ''}</td><td class="actions">${i.status === 'aberta' ? `<button class="btn secondary sm" data-act="inv-pay" data-id="${esc(i.id)}">Pagar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma fatura ainda.</div>'}</div></div>` : ''}
      <div class="grid-2" style="margin-top:16px"><div class="card"><div class="card-head"><h2>Dados pessoais</h2></div><dl class="kv"><dt>Nome</dt><dd>${esc(me.profile.name)}</dd><dt>CPF</dt><dd>${esc(W.cpfMasked(me.profile.cpf))}</dd><dt>E-mail</dt><dd>${esc(me.email)}</dd></dl></div>
      <div class="card stack"><div class="card-head"><h2>Segurança</h2></div><div class="row between"><div><b>Autenticação em duas etapas</b><div class="muted small">Opcional. Usa um aplicativo autenticador no celular.</div></div>${fac ? `<div class="row">${tag('Ativada', 'success')}<button class="btn danger sm" data-act="mfa-off" data-id="${esc(fac.id)}">Desativar</button></div>` : '<button class="btn secondary sm" data-act="mfa-on">Ativar</button>'}</div>
        <form class="stack-sm" data-form="newpass-in"><div class="field"><label for="np">Trocar senha</label><input class="input" id="np" name="password" type="password" minlength="8" autocomplete="new-password" placeholder="Nova senha"></div><div><button class="btn secondary sm" type="submit">Salvar senha</button></div></form></div></div>`;
  });
  W.acts['fund-request'] = () => billingModal('fund');
  W.acts['inv-pay'] = async (el) => {
    const b = await W.rpc('w_billing_me'); const i = b.invoices.find((x) => x.id === el.dataset.id); if (!i) return;
    const has = i.pix_payload || i.boleto_url || i.boleto_line;
    W.modal({ title: `Fatura de ${W.monthLabel(i.ref_month)}`, body: `<p>Valor <b>${W.brl(i.amount)}</b> · vence em ${W.dt(i.due_date)}</p>${has ? `
      ${i.pix_payload ? `<div class="field" style="margin-top:14px"><label>Pix copia e cola</label><textarea class="input" id="pix-code" rows="3" readonly>${esc(i.pix_payload)}</textarea><div style="margin-top:8px"><button class="btn secondary sm" data-act="copy-pix">Copiar código</button></div></div>` : ''}
      ${i.boleto_line ? `<div class="field" style="margin-top:14px"><label>Linha digitável do boleto</label><input class="input" readonly value="${esc(i.boleto_line)}"></div>` : ''}
      ${i.boleto_url ? `<div style="margin-top:12px"><a class="btn secondary sm" href="${esc(i.boleto_url)}" target="_blank" rel="noopener">Abrir boleto</a></div>` : ''}` : '<div class="note-box" style="margin-top:14px">A cobrança desta fatura ainda está sendo preparada. Assim que for gerada, o Pix ou o boleto aparece aqui e é enviado ao seu e-mail de cobrança.</div>'}`, foot: '<button class="btn" data-act="modal-close">Fechar</button>' });
  };
  W.acts['copy-pix'] = async () => { const t = document.getElementById('pix-code'); try { await navigator.clipboard.writeText(t.value); W.toast('Código copiado'); } catch (e) { t.select(); } };
  W.forms['newpass-in'] = async (f) => { const v = W.form(f); if (!v.password) return; const { error } = await W.sb.auth.updateUser({ password: v.password }); if (error) throw new Error(W.msgOf(error.message)); f.reset(); W.toast('Senha alterada'); };
  W.acts['mfa-on'] = async () => {
    const { data, error } = await W.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Lottus Wealth ${Date.now()}` }); if (error) throw new Error(W.msgOf(error.message));
    W.modal({ title: 'Ativar autenticação em duas etapas', body: `<form class="stack" data-form="mfa-verify" data-factor="${esc(data.id)}"><ol class="enroll"><li><span>1</span><div>Abra um aplicativo autenticador (Google Authenticator, Authy, 1Password…) e leia o QR code.</div></li></ol>
      <div class="qr"><img alt="QR code do autenticador" src="${esc(data.totp.qr_code)}"></div><div class="secret"><span class="muted small">Ou digite a chave:</span><code>${esc(data.totp.secret)}</code></div>
      <ol class="enroll"><li><span>2</span><div>Digite o código de 6 dígitos que aparece no aplicativo.</div></li></ol>${otpHtml()}<div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Ativar</button></div></form>` });
    wireOtp(document.querySelector('[data-form="mfa-verify"]'));
  };
  W.forms['mfa-verify'] = async (f) => { const code = W.form(f).code || ''; if (code.length !== 6) throw new Error('Digite os 6 dígitos.'); const { error } = await W.sb.auth.mfa.challengeAndVerify({ factorId: f.dataset.factor, code }); if (error) throw new Error('Código incorreto.'); W.closeModal(); W.toast('Duas etapas ativadas'); route(); };
  W.acts['mfa-off'] = async (el) => { if (!(await W.confirm('Desativar duas etapas?', 'Sua conta voltará a pedir só e-mail e senha.', 'Desativar', true))) return; const { error } = await W.sb.auth.mfa.unenroll({ factorId: el.dataset.id }); if (error) throw new Error(W.msgOf(error.message)); W.toast('Duas etapas desativadas'); route(); };

  /* ---------- white-label e integração (plano Fund) ---------- */
  W.route('/white-label', async () => {
    const [d, gl] = await Promise.all([W.rpc('w_wl_get'), W.rpc('w_groups_list')]);
    if (!d.fund) return `${W.pageHead('White-label e integração', 'Para escritórios e gestoras que querem oferecer o Wealth aos próprios clientes.')}<div class="card stack"><span class="badge-soon">Plano Fund</span><h2>Sua marca, seus clientes, seu site</h2><p class="muted">No plano Fund você coloca uma página do Lottus Wealth no seu site, com o seu nome, logo e cor, e integra os dados dos seus clientes por API. O plano é contratado com a equipe Lottus.</p><div><a class="btn" href="mailto:${esc(W.cfg.supportEmail)}?subject=Plano%20Fund%20-%20Lottus%20Wealth">Falar com a Lottus</a></div></div>`;
    return `${W.pageHead('White-label e integração', 'Plano Fund: marca por grupo e acesso por API às carteiras sob a sua titularidade.')}
      <div class="card stack"><div class="card-head"><div><h2>Marca por grupo</h2><div class="muted small">Estilo, logo e cores são definidos em cada grupo de carteiras.</div></div></div>${(gl.groups || []).length ? `<div class="list">${gl.groups.map((g) => `<a class="list-row" href="#/grupos/${esc(g.id)}"><div class="grow"><b>${esc(g.name)}</b></div><span class="muted small">Configurar marca →</span></a>`).join('')}</div>` : '<div class="empty">Crie um grupo em Minhas carteiras para configurar a marca.</div>'}</div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>Chaves de API</h2><button class="btn sm" data-act="key-new">${ico('plus')} Nova chave</button></div>
        ${d.keys.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Nome</th><th>Chave</th><th>Criada</th><th>Último uso</th><th></th></tr></thead><tbody>${d.keys.map((k) => `<tr><td>${esc(k.label)}</td><td class="mono">${esc(k.prefix)}…</td><td>${W.dt(k.created_at)}</td><td>${k.last_used_at ? W.dtm(k.last_used_at) : '—'}</td><td class="actions">${k.revoked_at ? tag('Revogada') : `<button class="btn danger sm" data-act="key-revoke" data-id="${esc(k.id)}">Revogar</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma chave criada.</div>'}
        <h3 style="margin-top:16px">Como usar</h3><pre class="mono" style="white-space:pre-wrap;background:var(--soft);padding:14px;border-radius:14px">curl -H "x-api-key: wk_…" ${esc(W.cfg.apiUrl)}\ncurl -H "x-api-key: wk_…" ${esc(W.cfg.apiUrl)}/{id-da-carteira}</pre><p class="muted small">Devolve patrimônio (investimentos, contas, bens, dívidas) e posições. A chave só enxerga as carteiras em que você é o titular da cobrança. Guarde-a em servidor — nunca no navegador do cliente.</p></div>`;
  });
  W.acts['key-new'] = () => W.modal({ title: 'Nova chave de API', body: '<form class="stack" data-form="key-new"><div class="field"><label>Nome (para você identificar)</label><input class="input" name="label" required minlength="2" placeholder="Ex.: Site institucional"></div><div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Criar chave</button></div></form>' });
  W.forms['key-new'] = async (f) => { const r = await W.rpc('w_apikey_create', { p_label: W.form(f).label }); W.modal({ title: 'Guarde a sua chave', body: `<div class="note-box">Ela aparece só agora. Se perder, crie outra.</div><p class="mono" style="margin-top:12px">${esc(r.key)}</p>`, foot: `<button class="btn" data-act="key-done">Já guardei</button>` }); };
  W.acts['key-done'] = () => { W.closeModal(); route(); };
  W.acts['key-revoke'] = async (el) => { if (!(await W.confirm('Revogar chave?', 'Integrações que usam esta chave param de funcionar na hora.', 'Revogar', true))) return; await W.rpc('w_apikey_revoke', { p_id: el.dataset.id }); W.toast('Chave revogada'); route(); };

  /* ---------- início ---------- */
  let idle;
  function armIdle() {
    const reset = () => { clearTimeout(idle); if (W.state.me) idle = setTimeout(async () => { await W.sb.auth.signOut(); W.state.me = null; W.toast('Sessão encerrada', 'Você ficou um tempo sem usar o sistema.', 'error'); W.go('/entrar'); }, W.cfg.idleMinutes * 60000); };
    ['click', 'keydown', 'pointermove', 'scroll'].forEach((ev) => document.addEventListener(ev, reset, { passive: true })); reset();
  }
  async function boot() {
    // links do e-mail (confirmação / recuperação) chegam como #access_token=...; trocamos por sessão e voltamos ao roteador
    if (location.hash.includes('access_token=')) {
      const p = new URLSearchParams(location.hash.slice(1)); const type = p.get('type');
      const { error } = await W.sb.auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') });
      history.replaceState(null, '', `${location.pathname}#/${error ? 'entrar' : type === 'recovery' ? 'nova-senha' : 'finalizar'}`);
    }
    const { data } = await W.sb.auth.getSession();
    if (data.session) await loadMe();
    window.addEventListener('hashchange', route);
    armIdle();
    route();
  }
  W.renderShell = _render;
  // as telas (invest/gastos/gestao) registram suas rotas depois deste arquivo; só iniciamos quando tudo foi carregado
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
})();
