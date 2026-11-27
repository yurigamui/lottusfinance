/* Seções 1.5 e 1.3: cartão "Contato de assinatura" (código de 6 dígitos) de Conta > Verificação e do passo 2 do onboarding, mais os textos e
   mensagens de erro da verificação (uma só origem). Só DOM e textContent; nada de código ou e-mail em storage. */
import { h, icon, ICON, setKids, toast, focusEl } from '../lib/ui.js?v=20261129a';
import { maskPhone, onlyDigits } from '../lib/fmt.js?v=20261129a';
import { classify } from '../lib/api.js?v=20261129a';
import { updateMe } from './shell.js?v=20261129a';

export const T = {
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
export const mm = (s) => Math.max(1, Math.ceil((Number(s) || 0) / 60));
export const MSG = {
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
export function textoErro(e) {
  const code = String((e && e.code) || '');
  if (MSG[code]) return MSG[code](e);
  const k = classify(e);
  if (k === 'rede') return T.rede;
  if (k === 'naoconfirmado') return T.naoConfirmado;
  return T.geral;
}
export const fmtData = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''; };
export const NIVEIS = { Simples: ['tag', 'conta', T.simples], 'Avançada': ['tag brand', 'check', T.avancada], Qualificada: ['tag success', 'check', T.qualificada] };
export const CANAIS = [['email', 'E-mail'], ['whatsapp', 'WhatsApp']];
export const tag = (cls, ic, txt) => h('span', { class: cls }, icon(ICON[ic], 'ico'), txt);

/* ------------------------------------------------------------------ cartão: contato (código de 6 dígitos) */
export function contatoCard(st, opts = {}) {
  const { ctx } = st;
  const { onVerified, modo } = opts; /* onVerified(me) roda depois do código; modo 'onboarding' também aceita a prova por certificado */
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
      if (onVerified) onVerified(m);
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
    if (modo === 'onboarding' && m.verified === true) { /* identidade já provada por certificado */
      kids.push(h('div', { class: 'vf-row' }, h('span', { class: 'pf-label' }, 'Identidade verificada'), h('div', { class: 'vf-value' }, tag('tag success', 'check', 'Certificado vinculado'))));
      setKids(box, ...kids);
      return;
    }
    kids.push(h('p', { class: 'vf-empty' }, T.vazio));
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
