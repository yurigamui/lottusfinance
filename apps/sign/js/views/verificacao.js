/* Seção 1.5: Conta > Verificação (#/conta/verificacao). Prova o contato com código de 6 dígitos e vincula um certificado ICP-Brasil (opcional).
   Tudo por DOM e textContent (setKids, nunca innerHTML). O nível vem de levelOf (shell.js), a única derivação. Nada de código, e-mail ou certificado em storage.
   A validação criptográfica do certificado é feita por uma função de borda que NÃO está no repositório (T-07): a tela chama o endereço
   configurável cfg.certEndpoint (desligado por padrão). Sem ele, ou se ele não responder, aparece o indicador de indisponível. */
import { h, icon, ICON, setKids, pageHead, abasConta, toast, focusEl, safeUrl } from '../lib/ui.js?v=20261127a';
import { maskCpf, maskPhone, onlyDigits } from '../lib/fmt.js?v=20261127a';
import { classify } from '../lib/api.js?v=20261127a';
import { levelOf, updateMe } from './shell.js?v=20261127a';
import { suporte } from './perfil.js?v=20261127a';

const T = {
  titulo: 'Verificação de identidade',
  sub: 'Seus dados, verificação e segurança.',
  nivel: 'Nível de assinatura',
  simples: 'Simples: e-mail confirmado.',
  avancada: 'Avançada: contato verificado.',
  qualificada: 'Qualificada: certificado digital válido.',
  contato: 'Contato de assinatura',
  vazio: 'Seu e-mail ainda não foi confirmado como contato de assinatura.',
  naoConfirmado: 'Confirme seu e-mail para poder enviar documentos.',
  carregar: 'Não foi possível carregar seus dados. Verifique sua conexão.',
  rede: 'Não foi possível concluir. Verifique sua conexão e tente de novo.',
  geral: 'Não foi possível concluir agora. Tente de novo em instantes.',
  digite6: 'Digite os 6 dígitos do código.',
  fone: 'Informe o celular com DDD.',
  escolhaArquivo: 'Escolha o arquivo assinado.',
  arquivoGrande: 'O arquivo é grande demais. O limite é 256 KB.',
  copiado: 'Desafio copiado.',
  copiarFalhou: 'Não foi possível copiar. Selecione o texto do desafio e copie.',
  indisponivel: 'Validação de certificado indisponível neste ambiente.',
  certOpcional: 'Certificado digital (opcional)',
  certAjuda: 'Com um certificado ICP-Brasil válido a sua assinatura chega ao nível Qualificada.',
  formatoArquivo: '[preencher: formato e componente de assinatura local, definidos por T-07]',
};
const mm = (s) => Math.max(1, Math.ceil((Number(s) || 0) / 60));
const MSG = {
  otp_invalid: (e) => (Number.isFinite(Number(e.remaining)) ? `Código incorreto. Você tem mais ${Number(e.remaining)} tentativas.` : 'Código incorreto.'),
  otp_locked: (e) => `Muitas tentativas. Tente de novo em ${mm(e.retryAfter)} minutos.`,
  otp_expired: () => 'O código expirou. Peça um novo.',
  otp_not_found: () => 'Peça um código para continuar.',
  too_soon: (e) => `Aguarde ${Math.max(1, Number(e.retryAfter) || 1)} segundos para reenviar.`,
  too_many: (e) => `Limite de reenvios atingido. Tente de novo em ${mm(e.retryAfter)} minutos.`,
  channel_unavailable: () => 'Este canal não está disponível.',
  email_not_confirmed: () => T.naoConfirmado,
  identity_required: () => 'Verifique sua identidade para enviar documentos.',
  cert_expired: () => 'Este certificado está vencido. Use um certificado válido.',
  cert_not_yet_valid: () => 'Este certificado ainda não está válido.',
  cert_cpf_mismatch: () => 'O CPF do certificado é diferente do CPF do seu perfil.',
  cert_chain_invalid: () => 'Não foi possível confirmar a cadeia de certificação. Use um certificado ICP-Brasil.',
  challenge_expired: () => 'O desafio expirou. Gere um novo.',
  cpf_required: () => 'Informe seu CPF no perfil antes de usar um certificado.',
  roots_not_loaded: () => 'Nenhuma autoridade raiz confiável está carregada.',
  too_many_attempts: (e) => `Muitas tentativas. Tente de novo em ${mm(e.retryAfter)} minutos.`,
  cpf_in_use: () => 'Não foi possível usar este CPF. Confira o número ou fale com o suporte.',
};
/* texto do erro: código do servidor com mensagem própria; senão rede ou genérico */
function textoErro(e) {
  const code = String((e && e.code) || '');
  if (MSG[code]) return MSG[code](e);
  const k = classify(e);
  if (k === 'rede') return T.rede;
  if (k === 'naoconfirmado') return T.naoConfirmado;
  return T.geral;
}
const fmtData = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''; };
const NIVEIS = { Simples: ['tag', 'conta', T.simples], 'Avançada': ['tag brand', 'check', T.avancada], Qualificada: ['tag success', 'check', T.qualificada] };
const CANAIS = [['email', 'E-mail'], ['whatsapp', 'WhatsApp']];
const SAIDA_PERFIL = () => h('a', { class: 'btn secondary', href: '#/conta/perfil' }, 'Voltar ao perfil');
const tag = (cls, ic, txt) => h('span', { class: cls }, icon(ICON[ic], 'ico'), txt);

/* esqueleto com a mesma grade da tela pronta (1 cartão à esquerda, 2 à direita): sem salto de layout */
function skeleton() {
  const card = () => h('div', { class: 'card vf-card', 'aria-hidden': 'true' }, h('div', { class: 'skel vf-skel' }), h('div', { class: 'skel vf-skel tall' }), h('div', { class: 'skel vf-skel' }));
  return [h('span', { class: 'sr-only', role: 'status' }, 'Carregando seus dados'), h('div', { class: 'vf-col' }, card()), h('div', { class: 'vf-col' }, card(), card())];
}

/* ------------------------------------------------------------------ cartão: nível */
function levelCard(st) {
  const me = st.me;
  const n = levelOf(me);
  const [cls, ic, txt] = NIVEIS[n];
  const acoes = [SAIDA_PERFIL()];
  if (me.verified && !st.off) acoes.push(h('a', { class: 'btn', href: '#/documentos' }, 'Ir para meus documentos'));
  return h('section', { class: 'card vf-card', 'aria-labelledby': 'vf-nivel-h' },
    h('h2', { id: 'vf-nivel-h' }, T.nivel),
    h('div', { class: 'vf-level' }, tag(cls, ic, n), h('p', { class: 'vf-rule' }, txt)),
    h('div', { class: 'vf-actions' }, acoes));
}

/* ------------------------------------------------------------------ cartão: contato (código de 6 dígitos) */
function contactCard(st) {
  const { ctx } = st;
  const me = st.me;
  const box = h('section', { class: 'card vf-card', 'aria-labelledby': 'vf-contato-h' });
  const ch = me.channels && typeof me.channels === 'object' ? me.channels : { email: true };
  const canais = CANAIS.filter(([k]) => ch[k] === true);
  if (!canais.length) canais.push(CANAIS[0]);
  const coolMs = () => (Number(ctx.cfg.otpCooldownMs) > 0 ? Number(ctx.cfg.otpCooldownMs) : 30000);
  const s = { lockMsg: false, fase: 'idle', canal: canais[0][0], to: '', cool: 0, limite: 0, bloqueio: Number(me.otp_retry_after) > 0 ? Date.now() + Number(me.otp_retry_after) * 1000 : 0, busy: false, msg: '', ok: '' };
  let codeIn = null; let phoneIn = null; let msgEl = null; let reenviarBtn = null; let enviarBtn = null; let confBtn = null; let limiteEl = null;
  const agora = () => Date.now();
  const travado = () => s.bloqueio > agora();

  function controles() { /* liga e desliga sem refazer a tela */
    const off = st.off || s.busy || travado();
    if (enviarBtn) { enviarBtn.disabled = off; }
    if (codeIn) codeIn.disabled = st.off || travado();
    if (confBtn) confBtn.disabled = off;
    if (reenviarBtn) {
      const falta = Math.ceil((s.cool - agora()) / 1000);
      reenviarBtn.disabled = off || falta > 0 || s.limite > agora();
      reenviarBtn.textContent = falta > 0 ? `Reenviar código (${falta} s)` : 'Reenviar código';
    }
    for (const b of [enviarBtn, confBtn, reenviarBtn]) if (b) { if (s.busy && b === s.btn) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); }
  }
  function mensagens() {
    if (travado()) { s.msg = MSG.otp_locked({ retryAfter: Math.ceil((s.bloqueio - agora()) / 1000) }); s.lockMsg = true; } else if (s.lockMsg) { s.msg = ''; s.lockMsg = false; s.bloqueio = 0; }
    if (msgEl && msgEl.textContent !== s.msg) msgEl.textContent = s.msg;
    if (limiteEl) {
      const falta = Math.ceil((s.limite - agora()) / 1000);
      limiteEl.textContent = falta > 0 ? MSG.too_many({ retryAfter: falta }) : '';
    }
  }
  st.ticks.push(() => { controles(); mensagens(); });

  function erro(e) {
    const k = classify(e);
    if (k === 'sessao') { ctx.sessionEnded(); return; }
    const code = String(e.code || '');
    if (code === 'otp_locked') s.bloqueio = agora() + (Number(e.retryAfter) || 1800) * 1000;
    if (code === 'too_soon') { s.cool = agora() + (Number(e.retryAfter) || 30) * 1000; s.fase = 'code'; }
    if (code === 'too_many') { s.limite = agora() + (Number(e.retryAfter) || 3600) * 1000; s.fase = 'code'; }
    if (k === 'naoconfirmado') { st.off = true; st.redraw(); return; }
    s.msg = textoErro(e);
    s.ok = '';
    desenhar();
    if (code === 'otp_invalid' && codeIn) { codeIn.value = ''; focusEl(codeIn); } else if (msgEl) focusEl(msgEl);
  }

  async function enviar(btn) {
    if (s.busy || st.off || travado()) return;
    let fone = '';
    if (s.canal === 'whatsapp') {
      fone = onlyDigits(phoneIn ? phoneIn.value : '');
      if (fone.length < 10 || fone.length > 13) { s.msg = T.fone; desenhar(); if (phoneIn) focusEl(phoneIn); return; }
    }
    s.busy = true; s.btn = btn; s.msg = ''; controles();
    try {
      const d = await ctx.api.phoneSend(fone, s.canal);
      if (st.dead) return;
      s.fase = 'code'; s.to = String(d.to || ''); s.cool = agora() + coolMs(); s.msg = ''; s.ok = '';
      s.limite = Number(d.limit_retry_after) > 0 ? agora() + Number(d.limit_retry_after) * 1000 : 0;
      s.busy = false;
      desenhar();
      if (codeIn) { codeIn.value = ''; focusEl(codeIn); }
    } catch (e) { if (st.dead) return; s.busy = false; erro(e); }
  }

  async function confirmar() {
    if (s.busy || st.off || travado() || !codeIn) return;
    const code = onlyDigits(codeIn.value);
    if (code.length !== 6) { s.msg = T.digite6; desenhar(); focusEl(codeIn); return; }
    s.busy = true; s.btn = confBtn; s.msg = ''; controles();
    try {
      const m = await ctx.api.phoneVerify(code);
      if (st.dead) return;
      st.me = m; updateMe(m);
      st.sucesso = m.contact_kind === 'phone' ? 'Celular verificado.' : 'E-mail confirmado.';
      s.busy = false; s.fase = 'idle';
      st.redraw();
      toast(st.sucesso, null, 'ok');
      const ok = box.querySelector('.vf-ok'); if (ok) focusEl(ok);
    } catch (e) { if (st.dead) return; s.busy = false; erro(e); }
  }

  function desenhar() {
    const m = st.me;
    const verificado = m.phone_verified === true;
    const kids = [h('h2', { id: 'vf-contato-h' }, T.contato)];
    codeIn = null; phoneIn = null; msgEl = null; reenviarBtn = null; enviarBtn = null; confBtn = null; limiteEl = null;
    if (verificado) {
      const data = fmtData(m.phone_verified_at);
      const email = m.contact_kind !== 'phone';
      kids.push(h('div', { class: 'vf-row' }, h('span', { class: 'pf-label' }, 'Contato verificado'),
        h('div', { class: 'vf-value' }, tag('tag success', 'check', email ? 'E-mail confirmado' : 'Celular verificado'), data ? h('span', null, 'em ' + data) : null,
          !email && m.phone ? h('span', { class: 'muted' }, maskPhone(m.phone)) : null)));
      if (st.sucesso) kids.push(h('p', { class: 'vf-ok', role: 'status', tabindex: '-1' }, st.sucesso));
      desenharContato(kids);
      return;
    }
    kids.push(h('p', { class: 'vf-empty' }, T.vazio));
    if (st.off) kids.push(h('div', { class: 'banner info', role: 'status' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.naoConfirmado)));
    const radios = h('fieldset', { class: 'vf-canais', disabled: st.off || travado() || s.fase === 'code' || null },
      h('legend', null, 'Canal de envio'),
      canais.map(([k, nome]) => h('label', { class: 'vf-radio', for: 'vf-canal-' + k },
        h('input', { type: 'radio', name: 'vf-canal', id: 'vf-canal-' + k, value: k, checked: s.canal === k || null, onchange: () => { s.canal = k; desenhar(); } }), nome)));
    kids.push(radios);
    if (s.canal === 'whatsapp') {
      phoneIn = h('input', { class: 'input', id: 'vf-fone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 20, disabled: st.off || null });
      kids.push(h('div', { class: 'field' }, h('label', { for: 'vf-fone' }, 'Celular com DDD'), phoneIn));
    }
    if (s.fase === 'idle') {
      enviarBtn = h('button', { class: 'btn', type: 'button', onclick: () => enviar(enviarBtn) }, 'Enviar código');
      kids.push(h('div', { class: 'vf-actions' }, enviarBtn));
    } else {
      codeIn = h('input', { class: 'input vf-code', id: 'vf-codigo', name: 'codigo', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 12, 'aria-describedby': 'vf-codigo-help vf-msg' });
      codeIn.addEventListener('input', () => {
        const d = onlyDigits(codeIn.value).slice(0, 6);
        if (codeIn.value !== d) codeIn.value = d;
        if (s.msg && !travado()) { s.msg = ''; if (msgEl) msgEl.textContent = ''; }
        if (d.length === 6) confirmar();
      });
      confBtn = h('button', { class: 'btn', type: 'button', onclick: () => confirmar() }, 'Confirmar');
      reenviarBtn = h('button', { class: 'btn secondary', type: 'button', onclick: () => enviar(reenviarBtn) }, 'Reenviar código');
      limiteEl = h('p', { class: 'help vf-limit', role: 'status' });
      kids.push(h('div', { class: 'field' }, h('label', { for: 'vf-codigo' }, 'Código de 6 dígitos'), codeIn,
        h('div', { class: 'help', id: 'vf-codigo-help' }, s.to ? `Enviamos o código para ${s.to}. Ele vale 10 minutos.` : 'O código vale 10 minutos.')),
      h('div', { class: 'vf-actions' }, confBtn, reenviarBtn), limiteEl);
    }
    kids.push(h('div', { class: 'vf-msg', id: 'vf-msg', role: 'alert', tabindex: '-1' }));
    setKids(box, ...kids);
    msgEl = box.querySelector('#vf-msg');
    if (st.sucesso) st.sucesso = '';
    controles(); mensagens();
  }
  function desenharContato(kids) { setKids(box, ...kids); }

  desenhar();
  return box;
}

/* ------------------------------------------------------------------ cartão: certificado digital */
function certCard(st) {
  const { ctx } = st;
  const me = st.me;
  const box = h('section', { class: 'card vf-card', 'aria-labelledby': 'vf-cert-h' });
  const c = { disp: null, desafio: null, expira: 0, roots: true, busy: false, msg: '', exit: null, arquivo: null };
  let msgEl = null; let gerarBtn = null; let enviarBtn = null; let fileIn = null; let copiarBtn = null;
  const timeout = () => (Number(ctx.cfg.certTimeoutMs) > 0 ? Number(ctx.cfg.certTimeoutMs) : 8000);
  const url = safeUrl(ctx.cfg.certEndpoint);
  if (!url) c.disp = false;

  async function porEndpoint(path, opts) { /* fetch com limite de tempo; 404 e 5xx contam como indisponível */
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout());
    try {
      const r = await fetch(url + path, Object.assign({}, opts, { signal: ctl.signal }));
      if (r.status === 404 || r.status >= 500) { const err = new Error('indisponivel'); err.indisponivel = true; throw err; }
      return r;
    } catch (e) { if (e.indisponivel) throw e; const err = new Error('indisponivel'); err.indisponivel = true; throw err; } finally { clearTimeout(t); }
  }
  async function conferir() {
    if (!url || me.cert || st.off) return;
    try { await porEndpoint('', { method: 'GET' }); if (!st.dead) { c.disp = true; paint(); } } catch (e) { if (!st.dead) { c.disp = false; paint(); } }
  }
  st.ticks.push(() => { if (c.desafio && c.expira && Date.now() > c.expira) { c.desafio = null; c.expira = 0; c.msg = MSG.challenge_expired(); c.exit = null; paint(); } });

  function indicador() { return h('div', { class: 'banner warn', role: 'status' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.indisponivel)); }
  function saida(code) {
    if (code === 'cert_cpf_mismatch') return h('a', { class: 'btn secondary', href: '#/conta/perfil' }, 'Corrigir meu CPF');
    if (code === 'cpf_required') return h('a', { class: 'btn secondary', href: '#/conta/perfil' }, 'Informar meu CPF');
    if (code === 'roots_not_loaded' || !MSG[code]) return suporte(ctx.cfg, 'Certificado digital no Lottus Sign', 'Suporte');
    return null;
  }
  function falhou(e) {
    const k = classify(e);
    if (k === 'sessao') { ctx.sessionEnded(); return; }
    if (k === 'naoconfirmado') { st.off = true; st.redraw(); return; }
    if (e.indisponivel) { c.disp = false; c.msg = ''; paint(); return; }
    const code = String(e.code || '');
    c.msg = textoErro(e);
    if (code === 'challenge_expired') { c.desafio = null; c.expira = 0; }
    if (code === 'roots_not_loaded') c.roots = false;
    c.exit = saida(MSG[code] ? code : '');
    paint();
    if (msgEl) focusEl(msgEl);
  }

  async function gerar() {
    if (c.busy || st.off) return;
    c.busy = true; c.msg = ''; c.exit = null; paint();
    try {
      const d = await ctx.api.certChallenge();
      if (st.dead) return;
      c.desafio = String(d.text || ''); c.expira = Date.now() + (Number(d.expires_in) || 300) * 1000; c.nonce = String(d.nonce || ''); c.roots = d.roots_loaded !== false; c.arquivo = null;
      if (!c.roots) c.msg = MSG.roots_not_loaded();
      c.busy = false; paint();
      const el = box.querySelector('.vf-challenge'); if (el) focusEl(el);
    } catch (e) { if (st.dead) return; c.busy = false; falhou(e); }
  }
  async function copiar() {
    let ok = false;
    try { await navigator.clipboard.writeText(c.desafio || ''); ok = true; } catch (e) { ok = false; }
    if (ok) toast(T.copiado, null, 'ok');
    else { c.msg = T.copiarFalhou; c.exit = null; paint(); const el = box.querySelector('.vf-challenge'); if (el) { const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } }
  }
  async function enviarArquivo() {
    if (c.busy || st.off || !c.desafio) return;
    const f = fileIn && fileIn.files && fileIn.files[0];
    if (!f) { c.msg = T.escolhaArquivo; c.exit = null; paint(); return; }
    if (f.size > 256 * 1024) { c.msg = T.arquivoGrande; c.exit = null; paint(); return; }
    c.busy = true; c.msg = ''; c.exit = null; paint();
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
      const token = await ctx.api.accessToken();
      const r = await porEndpoint('', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, apikey: String(ctx.cfg.supabaseKey || '') }, body: JSON.stringify({ nonce: c.nonce, signed_b64: btoa(bin) }) });
      let d = null; try { d = await r.json(); } catch (e) { d = null; }
      if (st.dead) return;
      if (d && d.ok === true) {
        c.busy = false;
        ctx.api.forgetMe();
        const m = await ctx.api.me({ fresh: true });
        if (st.dead) return;
        st.me = m; updateMe(m); st.redraw(); toast('Certificado vinculado.', null, 'ok');
        return;
      }
      const err = new Error(String((d && d.error) || 'error')); err.code = String((d && d.error) || ''); c.busy = false; falhou(err);
    } catch (e) { if (st.dead) return; c.busy = false; falhou(e); }
  }

  function linha(rotulo, valor, completo) {
    return h('div', { class: 'vf-kv' }, h('dt', null, rotulo), h('dd', { class: 'vf-trunc', title: completo || valor }, valor));
  }
  function paint() {
    const m = st.me;
    const kids = [h('h2', { id: 'vf-cert-h' }, T.certOpcional)];
    msgEl = null; gerarBtn = null; enviarBtn = null; fileIn = null; copiarBtn = null;
    if (m.cert) {
      const ce = m.cert;
      const venc = fmtData(ce.not_after);
      kids.push(h('div', { class: 'vf-level' }, tag('tag success', 'check', 'Certificado vinculado')),
        h('dl', { class: 'vf-cert' },
          linha('Titular', String(ce.subject || 'Não informado')),
          linha('Emissor', String(ce.issuer || 'Não informado')),
          linha('CPF', maskCpf(ce.cpf) || 'Não informado'),
          linha('Validade', venc ? 'até ' + venc : 'Não informada'),
          linha('Série', String(ce.serial || 'Não informada'))));
      setKids(box, ...kids);
      return;
    }
    if (m.cert_expired) {
      const d = fmtData(m.cert_expired_at);
      kids.push(h('div', { class: 'banner danger', role: 'status' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, d ? `Certificado vencido em ${d}` : 'Certificado vencido')));
    }
    kids.push(h('p', { class: 'vf-empty' }, T.certAjuda));
    if (c.disp === false || !c.roots) kids.push(indicador());
    const off = st.off || c.busy;
    gerarBtn = h('button', { class: 'btn secondary', type: 'button', disabled: off || null, 'aria-busy': c.busy && !c.desafio ? 'true' : null, onclick: () => gerar() }, 'Gerar desafio');
    kids.push(h('div', { class: 'vf-actions' }, gerarBtn));
    if (c.desafio) {
      const livre = c.disp === false || !c.roots || st.off;
      copiarBtn = h('button', { class: 'btn secondary', type: 'button', onclick: () => copiar() }, 'Copiar');
      fileIn = h('input', { class: 'input vf-file', id: 'vf-arquivo', type: 'file', disabled: livre || null, 'aria-describedby': 'vf-arquivo-help' });
      enviarBtn = h('button', { class: 'btn', type: 'button', disabled: livre || c.busy || null, 'aria-busy': c.busy ? 'true' : null, onclick: () => enviarArquivo() }, 'Enviar arquivo assinado');
      kids.push(h('div', { class: 'field' }, h('span', { class: 'pf-label', id: 'vf-desafio-l' }, 'Desafio'),
        h('div', { class: 'vf-challenge', tabindex: '0', role: 'group', 'aria-labelledby': 'vf-desafio-l' }, c.desafio),
        h('div', { class: 'vf-actions' }, copiarBtn), h('div', { class: 'help' }, 'O desafio vale 5 minutos.')),
      h('div', { class: 'field' }, h('label', { for: 'vf-arquivo' }, 'Arquivo assinado'), fileIn, h('div', { class: 'help', id: 'vf-arquivo-help' }, T.formatoArquivo)),
      h('div', { class: 'vf-actions' }, enviarBtn));
    }
    kids.push(h('div', { class: 'vf-msg', role: 'alert', tabindex: '-1' }, c.msg), c.exit ? h('div', { class: 'vf-actions' }, c.exit) : null);
    setKids(box, ...kids);
    msgEl = box.querySelector('.vf-msg');
  }
  paint();
  conferir();
  return box;
}

/* ------------------------------------------------------------------ página */
function pintar(st, box) {
  box.removeAttribute('aria-busy');
  st.ticks.length = 0;
  setKids(box,
    st.motivo ? h('div', { class: 'banner info vf-wide', role: 'status' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, MSG.identity_required())) : null,
    st.off ? h('div', { class: 'banner info vf-wide', role: 'status' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.naoConfirmado)) : null,
    h('div', { class: 'vf-col' }, levelCard(st)),
    h('div', { class: 'vf-col' }, contactCard(st), certCard(st)));
}

async function carregar(st, box, fresh) {
  const { ctx } = st;
  box.setAttribute('aria-busy', 'true');
  setKids(box, ...skeleton());
  st.redraw = () => { if (!st.dead) pintar(st, box); };
  try {
    const me = await ctx.api.me({ fresh });
    if (st.dead) return;
    st.me = me; st.off = false;
    if (fresh) updateMe(me);
    pintar(st, box);
  } catch (e) {
    if (st.dead) return;
    const k = classify(e);
    if (k === 'sessao') { ctx.sessionEnded(); return; }
    box.removeAttribute('aria-busy');
    if (k === 'naoconfirmado') { st.me = { channels: { email: true } }; st.off = true; pintar(st, box); return; }
    const retry = h('button', { class: 'btn secondary sm', type: 'button' }, 'Tentar de novo');
    retry.addEventListener('click', () => { retry.setAttribute('aria-busy', 'true'); retry.disabled = true; carregar(st, box, true); });
    setKids(box, h('div', { class: 'vf-wide' }, h('div', { class: 'banner danger', role: 'alert' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.carregar), retry), h('div', { class: 'vf-actions' }, SAIDA_PERFIL())));
    focusEl(retry);
  }
}

export const verificacao = {
  shell: true,
  ownMeError: true, /* o erro de sign_me é mostrado aqui; o shell não repete o aviso */
  title: 'Verificação de identidade · Conta',
  render(ctx) {
    /* entrada vinda do envio de documento (identity_required): #/conta/verificacao?motivo=identity_required */
    const st = { ctx, dead: false, me: null, off: false, sucesso: '', ticks: [], redraw() {}, motivo: /[?&]motivo=identity_required(&|$)/.test(location.hash) };
    const box = h('div', { class: 'vf', role: 'group', 'aria-busy': 'true', 'aria-labelledby': 'vf-h' }, ...skeleton());
    setKids(ctx.view, pageHead('Conta', T.sub), abasConta(ctx.route), h('h2', { class: 'vf-title', id: 'vf-h' }, T.titulo), box);
    carregar(st, box, false);
    const timer = setInterval(() => { if (!st.dead) for (const f of st.ticks.slice()) f(); }, 1000);
    return () => { st.dead = true; clearInterval(timer); };
  },
};
