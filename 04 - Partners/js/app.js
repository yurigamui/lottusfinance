/* Lottus · Backoffice — login com segundo fator, menu e rotas */
(function () {
  'use strict';
  const { sb, rpc, esc, message, LEVEL } = window.BO;
  const app = document.getElementById('app');
  let me = null;

  // Ícones (traço 2, 24×24)
  const ICONS = {
    painel: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    identidade: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2',
    documentos: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    empresas: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    credito: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    operacoes: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    quitacoes: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    sacados: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    agendamentos: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    indicacoes: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
    parceiros: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    assinar: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    auditoria: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    equipe: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
    representantes: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    contratos: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    collapse: 'M11 19l-7-7 7-7m8 14l-7-7 7-7',
    mail: 'M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
    motor: 'M4 19h16M7 16V9m5 7V5m5 11v-4',
    emails: 'M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
    lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
    arrow: 'M5 12h14m-6-6l6 6-6 6',
    analises: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h4',
    partes: 'M17 20h5v-2a3 3 0 00-5.4-1.8M9 20H2v-2a3 3 0 015.4-1.8M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zm9.6 6.2A5 5 0 007.4 16.2M9 20h8',
    crescimento: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    controle: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
    cobrancas: 'M8 7V3m8 4V3M4 11h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2zm4 10l2 2 4-4',
    juridico: 'M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 006 0zm12 0l-3 7a3 3 0 006 0z',
    sun: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
    moon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
    system: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  };
  const icon = (name, cls = 'ico') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  window.BO.icon = icon;

  // Menu em grupos. "empresas" e "parceiros" mantêm o id (links antigos continuam valendo).
  const NAV_GROUPS = [
    { id: 'painel', label: 'Painel', items: [{ id: 'painel', label: 'Painel' }] },
    { id: 'analises', label: 'Análises', items: [
      { id: 'identidade', label: 'Identidade', count: 'identity' },
      { id: 'documentos', label: 'Documentos', count: 'documents' },
      { id: 'credito', label: 'Crédito', count: 'credit' },
      { id: 'motor', label: 'Motor de crédito' },
    ] },
    { id: 'operacoes', label: 'Operações', items: [{ id: 'operacoes', label: 'Operações' }] },
    { id: 'cobrancas', label: 'Cobranças', items: [{ id: 'cobrancas', label: 'Cobranças', count: 'billing' }] },
    { id: 'juridico', label: 'Jurídico', items: [
      { id: 'juridico', label: 'Documentos assinados', count: 'legal' },
      { id: 'contratos', label: 'Modelos de contrato' },
    ] },
    { id: 'partes', label: 'Partes', items: [
      { id: 'empresas', label: 'Cedentes' },
      { id: 'sacados', label: 'Sacados' },
      { id: 'representantes', label: 'Representantes' },
      { id: 'parceiros', label: 'Fundos' },
    ] },
    { id: 'controle', label: 'Controle', items: [
      { id: 'auditoria', label: 'Auditoria' },
      { id: 'equipe', label: 'Equipe Lottus', admin: true },
      { id: 'emails', label: 'E-mails', admin: true },
    ] },
    { id: 'crescimento', label: 'Crescimento', items: [{ id: 'indicacoes', label: 'Indicações' }] },
  ];
  const NAV = NAV_GROUPS.flatMap((g) => g.items);
  // Representante de parceiro: só as cessões para aceite
  const PARTNER_GROUPS = [
    { id: 'painel', label: 'Painel', items: [{ id: 'painel', label: 'Painel' }] },
    { id: 'assinar', label: 'Operações', items: [{ id: 'assinar', label: 'Operações', count: 'sign' }] },
  ];
  const PARTNER_VIEWS = ['painel', 'assinar'];
  const SECTION_TITLE = Object.fromEntries(NAV.map((n) => [n.id, n.label]).concat([['assinar', 'Operações'], ['painel', 'Painel']]));
  const navGroups = () => (me && me.partner ? PARTNER_GROUPS : NAV_GROUPS);

  /** Equipe Lottus ou representante de parceiro */
  const PARTNERS = window.LOTTUS_CONFIG.surface === 'partners';
  document.title = PARTNERS ? 'Lottus Partners' : 'Lottus · Admin';

  /** admin.: só a equipe Lottus · partners.: só representantes dos fundos */
  async function whoami() {
    if (PARTNERS) {
      try { return { ...(await rpc('partner_me')), partner: true, level: 'partner' }; }
      catch (e) { if (/forbidden/.test(e.message || '')) throw new Error('wrong_surface_partners'); throw e; }
    }
    try { return await rpc('bo_me'); }
    catch (e) { if (/forbidden/.test(e.message || '')) throw new Error('wrong_surface_admin'); throw e; }
  }

  /* ---------------------------------------------------------------- tema */
  const THEME_KEY = 'lottus.bo.theme';
  const getTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; } };
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch { /* sem armazenamento: vale só nesta aba */ }
    document.querySelectorAll('[data-theme-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeOpt === t)));
  }

  /* ------------------------------------------------------------- login */
  // Moldura das telas de acesso: painel da marca à esquerda, formulário à direita
  function authShell(inner) {
    return `
      <div class="auth">
        <aside class="auth-side" aria-hidden="true">
          <span class="auth-logo"></span>
          <div class="auth-side-copy">
            <h2>${PARTNERS ? 'Lottus Partners' : 'Admin'}</h2>
            <p>${PARTNERS ? 'Aprove e pague as operações enviadas ao seu fundo.' : 'Acompanhamento das operações e da carteira da Lottus.'}</p>
          </div>
          <div class="auth-blob"></div>
        </aside>
        <main class="auth-main">
          <span class="auth-logo-sm" role="img" aria-label="Lottus"></span>
          ${inner}
          <p class="auth-foot">${PARTNERS ? 'Acesso restrito a representantes dos fundos parceiros.' : 'Acesso restrito à equipe Lottus.'}</p>
        </main>
      </div>`;
  }

  function renderLogin(error) {
    app.innerHTML = authShell(`
        <form class="auth-card" id="login" novalidate>
          <div class="auth-head"><h1 class="auth-title">Entrar</h1><p class="muted">Use o e-mail e a senha do seu acesso.</p></div>
          <div class="field"><label for="email">E-mail</label>
            <div class="input-ico">${icon('mail')}<input id="email" class="input" type="email" autocomplete="username" placeholder="voce@seufundo.com.br" required /></div></div>
          <div class="field"><label for="password">Senha</label>
            <div class="input-ico">${icon('lock')}<input id="password" class="input" type="password" autocomplete="current-password" placeholder="Sua senha" required />
              <button class="pw-toggle" type="button" id="pw-toggle" aria-label="Mostrar senha" aria-pressed="false">${icon('eye')}</button></div></div>
          ${error ? `<div class="error-box" role="alert">${esc(error)}</div>` : ''}
          <button class="btn block lg" type="submit">Entrar ${icon('arrow')}</button>
          <button class="link-btn" type="button" id="forgot">Esqueci minha senha</button>
        </form>`);
    const form = document.getElementById('login');
    document.getElementById('forgot').onclick = () => renderForgot(form.email.value.trim());
    form.email.focus();
    const tg = document.getElementById('pw-toggle');
    tg.onclick = () => {
      const show = form.password.type === 'password';
      form.password.type = show ? 'text' : 'password';
      tg.setAttribute('aria-pressed', String(show));
      tg.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      if (!form.email.value.trim() || !form.password.value) {
        renderLogin('Informe o e-mail e a senha.');
        return;
      }
      btn.disabled = true;
      btn.classList.add('loading');
      const { error: err } = await sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
      if (err) { renderLogin(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : message(err)); return; }
      afterPassword();
    });
  }

  const backofficeUrl = () => location.origin + location.pathname;

  /** "Esqueci minha senha": envia um link para criar outra senha (só para quem tem acesso). */
  function renderForgot(prefill, done) {
    app.innerHTML = authShell(done ? `
        <div class="auth-card">
          <div class="auth-head"><span class="auth-badge">${icon('mail')}</span><h1 class="auth-title">Confira seu e-mail</h1>
            <p class="muted">Se <b>${esc(done)}</b> tiver acesso, você vai receber um link para criar uma nova senha em instantes. Ele vale por 2 horas. Confira também a caixa de spam.</p></div>
          <button class="btn secondary block lg" id="back">Voltar para entrar</button>
        </div>` : `
        <form class="auth-card" id="forgot-f" novalidate>
          <div class="auth-head"><h1 class="auth-title">Nova senha</h1><p class="muted">Informe o e-mail do seu acesso. Vamos mandar um link para você criar uma nova senha.</p></div>
          <div class="field"><label for="email">E-mail</label>
            <div class="input-ico">${icon('mail')}<input id="email" class="input" type="email" autocomplete="username" value="${esc(prefill || '')}" required /></div></div>
          <button class="btn block lg" type="submit">Enviar link ${icon('arrow')}</button>
          <button class="link-btn" type="button" id="back">Voltar para entrar</button>
        </form>`);
    document.getElementById('back').onclick = () => renderLogin();
    const f = document.getElementById('forgot-f');
    if (!f) return;
    f.email.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const email = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { f.email.focus(); return; }
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
      await sb.functions.invoke('backoffice-access', { body: { action: 'reset', email, redirect_to: backofficeUrl() } }).catch(() => null);
      renderForgot(null, email);
    };
  }

  /** Primeiro acesso (convite) ou nova senha: a pessoa chega pelo link do e-mail. */
  function renderSetPassword(kind) {
    app.innerHTML = authShell(`
        <form class="auth-card" id="setpw" novalidate>
          <div class="auth-head"><span class="auth-badge">${icon('lock')}</span>
            <h1 class="auth-title">${kind === 'invite' ? 'Crie sua senha' : 'Crie uma nova senha'}</h1>
            <p class="muted">${kind === 'invite' ? 'Bem-vindo à Lottus. Crie a senha do seu acesso. No próximo passo, você ativa o autenticador.' : 'Escolha uma senha nova para o seu acesso.'}</p></div>
          <div class="field"><label for="pw1">Senha</label>
            <div class="input-ico">${icon('lock')}<input id="pw1" class="input" type="password" autocomplete="new-password" minlength="10" required /></div>
            <div class="help">Pelo menos 10 caracteres, com letras e números.</div></div>
          <div class="field"><label for="pw2">Repita a senha</label>
            <div class="input-ico">${icon('lock')}<input id="pw2" class="input" type="password" autocomplete="new-password" required /></div></div>
          <div class="error-slot"></div>
          <button class="btn block lg" type="submit">Salvar senha ${icon('arrow')}</button>
        </form>`);
    const f = document.getElementById('setpw');
    f.pw1.focus();
    const fail = (t) => { f.querySelector('.error-slot').innerHTML = `<div class="error-box" role="alert">${esc(t)}</div>`; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const a = f.pw1.value, b = f.pw2.value;
      if (a.length < 10 || !/[a-zA-Z]/.test(a) || !/\d/.test(a)) return fail('Use pelo menos 10 caracteres, com letras e números.');
      if (a !== b) return fail('As duas senhas não são iguais.');
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) { btn.disabled = false; btn.classList.remove('loading'); return fail(/same|different/i.test(error.message) ? 'Escolha uma senha diferente da anterior.' : message(error)); }
      window.BO.toast('Senha salva');
      afterPassword();
    };
  }

  /** Link do e-mail da Lottus (?acesso=…): troca por um link novo do Supabase e segue. */
  async function openAccessLink(token) {
    app.innerHTML = authShell(`<div class="auth-card"><div class="auth-head"><span class="auth-badge">${icon('lock')}</span>
      <h1 class="auth-title">Abrindo seu acesso…</h1><p class="muted">Só um instante.</p></div><div class="spinner"></div></div>`);
    const { data, error } = await sb.functions.invoke('backoffice-access', { body: { action: 'redeem', token, redirect_to: backofficeUrl() } }).catch((e) => ({ error: e }));
    history.replaceState(null, '', location.pathname);
    if (error || !data || !data.link) {
      renderLogin('Este link venceu ou não vale mais. Use “Esqueci minha senha” para receber outro, ou peça um novo convite.');
      return;
    }
    const purpose = data.purpose === 'invite' ? 'invite' : 'recovery';
    await sb.auth.signOut({ scope: 'local' }).catch(() => null);
    // Abre a sessão aqui mesmo: não depende do redirecionamento do Supabase
    if (data.token_hash) {
      const { error: vErr } = await sb.auth.verifyOtp({ token_hash: data.token_hash, type: data.otp_type || 'recovery' });
      if (!vErr) { renderSetPassword(purpose); return; }
    }
    try { sessionStorage.setItem('lottus.bo.purpose', purpose); } catch { /* ok */ }
    location.replace(data.link);
  }

  /** Lê o link do e-mail (#access_token=…&type=invite|recovery) e abre a sessão. */
  async function sessionFromLink() {
    const h = location.hash.replace(/^#/, '');
    if (!/access_token=/.test(h) && !/error_description=/.test(h)) return null;
    const q = new URLSearchParams(h);
    history.replaceState(null, '', location.pathname + location.search);
    if (q.get('error_description')) return { error: 'Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.' };
    const { error } = await sb.auth.setSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token') });
    if (error) return { error: 'Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.' };
    let purpose = null;
    try { purpose = sessionStorage.getItem('lottus.bo.purpose'); sessionStorage.removeItem('lottus.bo.purpose'); } catch { /* ok */ }
    return { type: purpose || q.get('type') || 'magiclink' };
  }

  /** Seis quadradinhos para o código; o valor fica em #code. */
  function otpHtml() {
    return `<div class="otp" role="group" aria-label="Código de 6 dígitos">
      ${[0, 1, 2, 3, 4, 5].map((i) => `<input class="otp-box" inputmode="numeric" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" maxlength="1" aria-label="Dígito ${i + 1}" data-i="${i}" />`).join('')}
      <input type="hidden" id="code" name="code" />
    </div>`;
  }
  function wireOtp(form, onFull) {
    const boxes = [...form.querySelectorAll('.otp-box')];
    const sync = () => {
      const v = boxes.map((b) => b.value).join('');
      form.code.value = v;
      boxes.forEach((b) => b.classList.toggle('filled', !!b.value));
      if (v.length === 6) onFull();
    };
    const fill = (start, text) => {
      const digits = text.replace(/\D/g, '').slice(0, 6 - start).split('');
      digits.forEach((d, k) => (boxes[start + k].value = d));
      const next = Math.min(start + digits.length, 5);
      boxes[next].focus();
      sync();
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const v = b.value.replace(/\D/g, '');
        if (v.length > 1) return fill(i, v);   // preenchimento automático do celular
        b.value = v;
        if (v && i < 5) boxes[i + 1].focus();
        sync();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); sync(); e.preventDefault(); }
        if (e.key === 'ArrowLeft' && i > 0) { boxes[i - 1].focus(); e.preventDefault(); }
        if (e.key === 'ArrowRight' && i < 5) { boxes[i + 1].focus(); e.preventDefault(); }
      });
      b.addEventListener('focus', () => b.select());
      b.addEventListener('paste', (e) => { e.preventDefault(); fill(i, (e.clipboardData || window.clipboardData).getData('text')); });
    });
    return {
      focus: () => boxes[0].focus(),
      clear: () => { boxes.forEach((b) => (b.value = '')); sync(); boxes[0].focus(); },
      shake: () => { const g = form.querySelector('.otp'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); },
    };
  }

  async function afterPassword() {
    try {
      me = await whoami();
    } catch (e) {
      await sb.auth.signOut();
      renderLogin(message(e));
      return;
    }
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (me.require_mfa && aal.currentLevel !== 'aal2') return renderMfa();
    me = await whoami();
    startShell();
  }

  /* ------------------------------------------------- segundo fator (TOTP) */
  async function renderMfa(error) {
    const { data, error: err } = await sb.auth.mfa.listFactors();
    if (err) { renderLogin(message(err)); return; }
    const verified = (data.totp || []).find((f) => f.status === 'verified');
    let factorId = verified && verified.id;
    let enrollHtml = '';

    if (!verified) {
      // Remove cadastros de autenticador que não foram concluídos
      for (const f of data.all || []) if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error: enErr } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: PARTNERS ? 'Lottus Partners' : 'Lottus Admin' });
      if (enErr) {
        renderLogin('Não foi possível ativar o segundo fator: ' + message(enErr) + ' (confira se o MFA TOTP está ligado no Supabase).');
        return;
      }
      factorId = en.id;
      enrollHtml = `
        <ol class="enroll">
          <li><span>1</span><div>Abra o app autenticador (Google Authenticator, Microsoft Authenticator ou outro) e leia o QR code.</div></li>
          <li><span>2</span><div>Digite abaixo o código de 6 dígitos que aparecer no app.</div></li>
        </ol>
        <div class="qr"><img src="${esc(en.totp.qr_code)}" alt="QR code do autenticador" /></div>
        <div class="secret"><span class="muted small">Sem câmera? Use a chave</span><code class="mono">${esc(en.totp.secret)}</code>
          <button class="btn ghost sm" type="button" data-copy-secret="${esc(en.totp.secret)}">Copiar</button></div>`;
    }

    app.innerHTML = authShell(`
        <form class="auth-card" id="mfa" novalidate>
          <div class="auth-head">
            <span class="auth-badge">${icon('auditoria')}</span>
            <h1 class="auth-title">${verified ? 'Confirme que é você' : 'Ative o autenticador'}</h1>
            <p class="muted">${verified ? 'Digite o código de 6 dígitos do seu app autenticador.' : 'O backoffice pede um segundo fator em todo acesso.'}</p>
          </div>
          ${enrollHtml}
          ${otpHtml()}
          <div class="error-slot">${error ? `<div class="error-box" role="alert">${esc(error)}</div>` : ''}</div>
          <button class="btn block lg" type="submit">Confirmar</button>
          <button class="btn ghost block" type="button" id="cancel">Entrar com outra conta</button>
        </form>`);
    const form = document.getElementById('mfa');
    const cs = form.querySelector('[data-copy-secret]');
    if (cs) cs.onclick = () => (window.BO.copy ? window.BO.copy(cs.dataset.copySecret) : navigator.clipboard.writeText(cs.dataset.copySecret));
    const otp = wireOtp(form, () => form.requestSubmit());
    otp.focus();
    document.getElementById('cancel').onclick = signOut;
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = form.code.value.replace(/\D/g, '');
      if (code.length !== 6 || busy) return;
      busy = true;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('loading');
      const { error: vErr } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
      if (vErr) {
        // Mantém o mesmo QR na tela se ainda for o primeiro cadastro
        form.querySelector('.error-slot').innerHTML = '<div class="error-box" role="alert">Código inválido. Confira no app e digite o código atual.</div>';
        btn.disabled = false; btn.classList.remove('loading'); busy = false;
        otp.shake(); otp.clear();
        return;
      }
      me = await whoami();
      startShell();
    });
  }

  async function signOut() {
    await sb.auth.signOut();
    me = null;
    location.hash = '';
    renderLogin();
  }

  /* ------------------------------------------------------------ estrutura */
  let counts = {};
  // Menu: um botão por seção; ao passar o mouse (ou focar), abre ao lado as opções da seção
  function navHtml(active) {
    const badge = (c) => (c ? `<span class="nav-count">${c > 99 ? '99+' : c}</span>` : '');
    return navGroups()
      .map((g) => ({ ...g, items: g.items.filter((n) => !n.admin || me.level === 'admin') }))
      .filter((g) => g.items.length)
      .map((g) => {
        const on = g.items.some((n) => n.id === active);
        const total = g.items.reduce((t, n) => t + (n.count ? counts[n.count] || 0 : 0), 0);
        const single = g.items.length === 1;
        const fly = `<div class="flyout" role="menu" aria-label="${esc(g.label)}">
            <div class="flyout-title">${esc(g.label)}</div>
            ${single ? '' : g.items.map((n) => {
              const c = n.count ? counts[n.count] : 0;
              return `<a href="#/${n.id}" role="menuitem" class="fly-item ${active === n.id ? 'active' : ''}"${active === n.id ? ' aria-current="page"' : ''}>
                ${icon(n.id)}<span>${esc(n.label)}</span>${badge(c)}</a>`;
            }).join('')}
          </div>`;
        return `<div class="nav-sec ${on ? 'on' : ''}${single ? ' single' : ''}" data-group="${g.id}">
          <a href="#/${g.items[0].id}" class="nav-btn ${on ? 'active' : ''}" aria-label="${esc(g.label)}${total ? ` (${total})` : ''}" aria-haspopup="${single ? 'false' : 'true'}"${single && on ? ' aria-current="page"' : ''}>
            ${icon(g.id === 'assinar' ? 'assinar' : g.id)}${badge(total)}</a>
          ${fly}
        </div>`;
      })
      .join('');
  }

  // Toque (celular/tablet): o primeiro toque abre as opções, o segundo segue o link
  function wireNav(nav) {
    nav.querySelectorAll('.nav-sec:not(.single) > .nav-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        const sec = b.parentElement;
        if (window.matchMedia('(hover: none)').matches && !sec.classList.contains('open')) {
          e.preventDefault();
          nav.querySelectorAll('.nav-sec.open').forEach((x) => x !== sec && x.classList.remove('open'));
          sec.classList.add('open');
        }
      });
    });
    nav.querySelectorAll('.fly-item').forEach((a) => a.addEventListener('click', () => a.closest('.nav-sec').classList.remove('open')));
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-sec')) document.querySelectorAll('.nav-sec.open').forEach((x) => x.classList.remove('open'));
  });
  function paintNav(view) {
    const nav = document.getElementById('nav');
    if (!nav) return;
    nav.innerHTML = navHtml(view);
    wireNav(nav);
  }

  function startShell() {
    const initials = me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
    const theme = getTheme();
    app.innerHTML = `
      <div class="shell">
        <aside class="sidenav">
          <a href="#/painel" class="sidenav-mark" aria-label="Lottus, início"></a>
          <nav class="sidenav-items" id="nav" aria-label="Menu"></nav>
        </aside>
        <main class="frame">
          <div class="surface">
            <header class="topbar">
              <div class="org">
                ${me.partner ? `<div class="org-mark">${esc((me.funder.trade_name || me.funder.legal_name || 'P').trim()[0].toUpperCase())}</div>` : '<div class="org-mark logo"></div>'}
                <div><div class="org-name">${me.partner ? esc(me.funder.legal_name) : 'Lottus Finance'}</div><div class="org-sub" id="crumb">${me.partner ? 'Lottus Partners' : 'Admin'}</div></div>
              </div>
              <div class="topbar-right">
                <div class="theme-toggle" role="group" aria-label="Aparência">
                  <button data-theme-opt="light" aria-pressed="${theme === 'light'}" title="Modo claro">${icon('sun')}</button>
                  <button data-theme-opt="dark" aria-pressed="${theme === 'dark'}" title="Modo escuro">${icon('moon')}</button>
                  <button data-theme-opt="system" aria-pressed="${theme === 'system'}" title="Sistema">${icon('system')}</button>
                </div>
                <div class="profile">
                  <button class="avatar" id="avatar" aria-haspopup="true" aria-expanded="false" aria-label="Perfil">${esc(initials)}</button>
                  <div class="menu" id="profile-menu" hidden>
                    <div class="menu-head"><div class="menu-name">${esc(me.name)}</div><div class="menu-sub">${esc(me.email || '')}</div>
                      <div class="menu-sub">${esc(me.partner ? (me.role || 'Representante') + ' · ' + me.funder.legal_name : LEVEL[me.level])}</div></div>
                    <button class="menu-item danger" id="logout">${icon('logout')} Sair</button>
                  </div>
                </div>
              </div>
            </header>
            <div class="content" id="view"></div>
          </div>
        </main>
      </div>`;
    document.getElementById('logout').onclick = signOut;
    document.querySelectorAll('[data-theme-opt]').forEach((b) => (b.onclick = () => setTheme(b.dataset.themeOpt)));
    const avatar = document.getElementById('avatar'), menu = document.getElementById('profile-menu');
    avatar.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; avatar.setAttribute('aria-expanded', String(!menu.hidden)); };
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; avatar.setAttribute('aria-expanded', 'false'); } });
    const home = '#/painel';
    if (!location.hash || location.hash === '#/' || (me.partner && !PARTNER_VIEWS.includes(currentView()))) location.hash = home;
    route();
    refreshCounts();
  }

  async function refreshCounts() {
    if (me && me.partner) {
      try {
        counts = { sign: (await rpc('partner_operations', { p_tab: 'pending' })).length };
        paintNav(currentView());
      } catch { /* a tela mostra o erro */ }
      return;
    }
    try {
      const d = await rpc('bo_dashboard');
      counts = {
        identity: d.identity, documents: d.documents, credit: d.credit,
        ops: d.operations_review + d.operations_to_pay, settlements: d.settlements,
        billing: Number(d.overdue || 0) + Number(d.settlements || 0), legal: Number(d.documents_missing || 0) + Number(d.notices_problem || 0),
      };
      window.BO.dashboard = d;
      paintNav(currentView());
    } catch { /* o painel mostra o erro */ }
  }
  window.BO.refreshCounts = refreshCounts;

  const currentView = () => (location.hash.replace(/^#\//, '').split('/')[0] || 'painel');

  async function route() {
    if (!me) return;
    const [view, ...params] = location.hash.replace(/^#\//, '').split('/');
    paintNav(view);
    const crumb = document.getElementById('crumb');
    if (crumb) crumb.textContent = (me.partner ? 'Lottus Partners · ' : 'Admin · ') + (SECTION_TITLE[view] || 'Painel');
    const el = document.getElementById('view');
    const fn = me.partner ? window.BO.views[PARTNER_VIEWS.includes(view) ? view : 'painel'] : window.BO.views[view] || window.BO.views.painel;
    el.innerHTML = '<div class="spinner" aria-label="Carregando"></div>';
    el.scrollTop = 0;
    try {
      await fn(el, params.map(decodeURIComponent), me);
    } catch (e) {
      const msg = message(e);
      if (/mfa_required|forbidden|JWT|session/i.test(e.message || '')) { signOut(); return; }
      el.innerHTML = `<div class="card"><div class="error-box">${esc(msg)}</div>
        <div style="margin-top:12px"><button class="btn secondary" onclick="location.reload()">Tentar de novo</button></div></div>`;
    }
  }
  window.addEventListener('hashchange', () => { route(); refreshCounts(); });
  window.BO.reload = () => { route(); refreshCounts(); };

  /* --------------------------------------------------- saída por inatividade */
  let idle;
  const bump = () => {
    clearTimeout(idle);
    idle = setTimeout(() => { if (me) { signOut(); window.BO.toast('Sessão encerrada por inatividade.'); } },
      (window.LOTTUS_CONFIG.idleMinutes || 30) * 60000);
  };
  ['click', 'keydown', 'mousemove', 'scroll'].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

  /* ---------------------------------------------------------------- início */
  (async function boot() {
    bump();
    const acesso = new URLSearchParams(location.search).get('acesso');
    if (acesso) { await openAccessLink(acesso); return; }
    const link = await sessionFromLink();
    if (link && link.error) { renderLogin(link.error); return; }
    if (link && (link.type === 'invite' || link.type === 'recovery')) { renderSetPassword(link.type); return; }
    const { data } = await sb.auth.getSession();
    if (data.session) afterPassword();
    else renderLogin();
  })();
})();
