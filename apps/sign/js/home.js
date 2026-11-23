/* Lottus Sign — página inicial: entrar/criar conta, meus documentos e verificação de documentos */
(function () {
  'use strict';
  const cfg = window.LOTTUS_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const root = document.getElementById('sign');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
  const cpfMask = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, (m, a, b, c, d) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : ''));
  const phoneMask = (v) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3') : d.replace(/^(\d{2})(\d{0,4})(\d{0,4}).*/, (m, a, b, c) => (b ? `(${a}) ${b}${c ? '-' + c : ''}` : a)); };
  const isMail = (v) => /^\S+@\S+\.\S+$/.test(v);

  const verifyCard = `<form class="card sign-card" id="vf" novalidate>
    <div><h2 style="margin:0">Verificar documento</h2><p class="small muted" style="margin:4px 0 0">Digite o código impresso no rodapé do documento para conferir se ele é autêntico e quem já assinou. Não precisa de conta.</p></div>
    <div class="field"><label for="code">Código do documento</label><input class="input" id="code" autocomplete="off" spellcheck="false" placeholder="Ex.: 3f9a1c0d7b2e4a58…"><div class="ferr" id="verr" hidden></div></div>
    <button class="btn secondary block" type="submit">Verificar</button></form>`;
  const shell = (inner, top) => {
    root.innerHTML = `<header class="sign-head" style="display:flex;align-items:center;justify-content:space-between"><img src="img/logo-rosa.png" alt="Lottus" height="28">${top || ''}</header>${inner}${verifyCard}`;
    const f = document.getElementById('vf');
    f.onsubmit = (e) => {
      e.preventDefault();
      const clean = document.getElementById('code').value.replace(/[^0-9a-fA-F]/g, '');
      if (clean.length < 16) { const er = document.getElementById('verr'); er.hidden = false; er.textContent = 'Informe pelo menos 16 caracteres do código.'; return; }
      location.href = `verificar.html?c=${encodeURIComponent(clean)}`;
    };
  };
  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) { e.hidden = !msg; e.textContent = msg || ''; } };
  const authMsg = (e) => {
    const m = String((e && e.message) || '');
    if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/not confirmed/i.test(m)) return 'Confirme o seu e-mail primeiro: enviamos um link para a sua caixa de entrada.';
    if (/already registered|already been registered/i.test(m)) return 'Já existe uma conta com este e-mail. Entre ou use “Esqueci a senha”.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos.';
    if (/password/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
    return 'Não foi possível concluir agora. Tente de novo.';
  };

  /* ---------- visitante: entrar / criar conta ---------- */
  function guest(tab, note) {
    const login = tab !== 'signup';
    shell(`<div class="sign-intro"><h1>Lottus Sign</h1><p class="muted">Assine documentos com segurança e acompanhe tudo em um só lugar.</p></div>
      <form class="card sign-card" id="af" novalidate>
        <div class="row" style="gap:6px"><button type="button" class="btn ${login ? '' : 'secondary'} sm" data-tab="login">Entrar</button><button type="button" class="btn ${login ? 'secondary' : ''} sm" data-tab="signup">Criar conta</button></div>
        ${note ? `<div class="note-box small">${esc(note)}</div>` : ''}
        ${login ? '' : '<div class="field"><label for="nm">Nome completo</label><input class="input" id="nm" autocomplete="name"></div><div class="field"><label for="cp">CPF</label><input class="input" id="cp" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"></div><div class="field"><label for="ph">Celular</label><input class="input" id="ph" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000"></div>'}
        <div class="field"><label for="em">E-mail</label><input class="input" id="em" type="email" autocomplete="email"></div>
        <div class="field"><label for="pw">Senha</label><input class="input" id="pw" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" ${login ? '' : 'placeholder="Mínimo de 8 caracteres"'}></div>
        <div class="ferr" id="aerr" hidden></div>
        <button class="btn lg block" id="ago" type="submit">${login ? 'Entrar' : 'Criar conta'}</button>
        ${login ? '<button type="button" class="linkbtn" id="forgot" style="justify-self:center">Esqueci a senha</button>' : '<p class="small muted" style="margin:0">Use o mesmo e-mail em que você recebe os documentos para assinar.</p>'}
      </form>`);
    document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => guest(b.dataset.tab)));
    const cp = document.getElementById('cp'), ph = document.getElementById('ph');
    if (cp) cp.addEventListener('input', () => { cp.value = cpfMask(cp.value); });
    if (ph) ph.addEventListener('input', () => { ph.value = phoneMask(ph.value); });
    const em = document.getElementById('em'), pw = document.getElementById('pw'), go = document.getElementById('ago');
    document.getElementById('af').onsubmit = async (e) => {
      e.preventDefault(); setErr('aerr');
      const email = em.value.trim().toLowerCase();
      if (!isMail(email)) return setErr('aerr', 'Informe um e-mail válido.');
      if (!pw.value) return setErr('aerr', 'Informe a senha.');
      go.disabled = true;
      if (login) {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw.value });
        go.disabled = false;
        if (error) return setErr('aerr', authMsg(error));
        return home();
      }
      const nm = document.getElementById('nm').value.trim();
      if (nm.split(/\s+/).length < 2) { go.disabled = false; return setErr('aerr', 'Informe o nome completo.'); }
      if (cp.value.replace(/\D/g, '').length !== 11) { go.disabled = false; return setErr('aerr', 'Informe o CPF completo.'); }
      if (ph.value.replace(/\D/g, '').length < 10) { go.disabled = false; return setErr('aerr', 'Informe o celular com DDD.'); }
      if (pw.value.length < 8) { go.disabled = false; return setErr('aerr', 'A senha precisa ter pelo menos 8 caracteres.'); }
      const { data, error } = await sb.auth.signUp({ email, password: pw.value, options: { emailRedirectTo: location.origin + location.pathname, data: { name: nm, cpf: cp.value.replace(/\D/g, ''), phone: ph.value.replace(/\D/g, ''), origin: 'lottus_sign' } } });
      go.disabled = false;
      if (error) return setErr('aerr', authMsg(error));
      if (data.session) return home();
      guest('login', 'Conta criada. Enviamos um link de confirmação para o seu e-mail; depois de confirmar, é só entrar.');
    };
    const fg = document.getElementById('forgot');
    if (fg) fg.onclick = async () => {
      const email = em.value.trim().toLowerCase();
      if (!isMail(email)) return setErr('aerr', 'Digite o seu e-mail acima e toque em “Esqueci a senha”.');
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      setErr('aerr'); guest('login', 'Se houver uma conta com este e-mail, enviamos o link para criar uma nova senha.');
    };
  }

  /* ---------- nova senha (link de recuperação) ---------- */
  function recovery() {
    shell(`<form class="card sign-card" id="rf" novalidate><h1>Nova senha</h1><div class="field"><label for="np">Nova senha</label><input class="input" id="np" type="password" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"></div>
      <div class="ferr" id="rerr" hidden></div><button class="btn lg block" type="submit">Salvar senha</button></form>`);
    document.getElementById('rf').onsubmit = async (e) => {
      e.preventDefault();
      const v = document.getElementById('np').value;
      if (v.length < 8) return setErr('rerr', 'A senha precisa ter pelo menos 8 caracteres.');
      const { error } = await sb.auth.updateUser({ password: v });
      if (error) return setErr('rerr', authMsg(error));
      home();
    };
  }

  /* ---------- conta: meus documentos ---------- */
  async function home(tab) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return guest();
    const user = session.user, name = (user.user_metadata && user.user_metadata.name) || user.email;
    const top = `<div class="row" style="gap:10px;align-items:center"><span class="small muted">${esc(name)}</span><button class="btn ghost sm" id="out">Sair</button></div>`;
    if (!user.email_confirmed_at) {
      shell('<div class="card sign-card"><h1>Confirme o seu e-mail</h1><p class="muted">Enviamos um link para ' + esc(user.email) + '. Depois de confirmar, volte aqui para ver os seus documentos.</p></div>', top);
      document.getElementById('out').onclick = async () => { await sb.auth.signOut(); guest(); };
      return;
    }
    const { data, error } = await sb.rpc('sign_my_documents');
    const list = error ? [] : data || [];
    const cur = tab === 'assinados' ? 'assinados' : 'pendentes';
    const rows = list.filter((d) => (cur === 'assinados' ? d.status === 'signed' : d.status !== 'signed'));
    const pend = list.filter((d) => d.status !== 'signed').length;
    shell(`<div class="sign-intro"><h1>Meus documentos</h1><p class="muted">Documentos enviados para ${esc(user.email)}.</p></div>
      <div class="card sign-card">
        <div class="row" style="gap:6px"><button class="btn ${cur === 'pendentes' ? '' : 'secondary'} sm" data-t="pendentes">Para assinar${pend ? ` (${pend})` : ''}</button><button class="btn ${cur === 'assinados' ? '' : 'secondary'} sm" data-t="assinados">Assinados</button></div>
        ${error ? '<p class="muted" style="margin:0">Não foi possível carregar os documentos agora.</p>' : rows.length ? rows.map((d) => `<div class="row between" style="padding:12px 0;border-top:1px solid var(--line,#ece8e1);gap:10px;align-items:center">
          <div><b>${esc(d.name)}</b><div class="small muted">${esc(d.fund || '')} · ${cur === 'assinados' ? `assinado em ${esc(fmt(d.signed_at))}` : `enviado em ${esc(fmt(d.sent_at))}`}</div></div>
          ${cur === 'assinados' ? `<a class="btn secondary sm" href="verificar.html?c=${encodeURIComponent(d.code)}">Verificar</a>` : `<button class="btn sm" data-sign="${esc(d.id)}">Assinar</button>`}</div>`).join('')
          : `<p class="muted" style="margin:0">${cur === 'assinados' ? 'Nenhum documento assinado ainda.' : 'Nenhum documento esperando a sua assinatura.'}</p>`}
        <div class="ferr" id="merr" hidden></div>
      </div>`, top);
    document.getElementById('out').onclick = async () => { await sb.auth.signOut(); guest(); };
    document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => home(b.dataset.t)));
    document.querySelectorAll('[data-sign]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      const { data: r, error: e } = await sb.rpc('sign_my_link', { p_signer: b.dataset.sign });
      if (e || !r) { b.disabled = false; return setErr('merr', 'Não foi possível abrir este documento agora.'); }
      location.href = `assinar.html?t=${encodeURIComponent(r.token)}`;
    }));
  }

  sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') recovery(); });
  if (!/type=recovery/.test(location.hash)) home().catch(() => guest());
})();
