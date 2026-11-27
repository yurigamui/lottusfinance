/* Seções 1.4 e 1.3: formulário de nome e CPF de Conta > Perfil (modo 'perfil') e do passo 1 do onboarding (modo 'onboarding').
   Um só lugar para campos, validação, mensagens, trava de CPF e sign_profile_save. Só DOM e textContent; rascunho só em memória. */
import { h, icon, ICON, setKids, focusEl } from '../lib/ui.js?v=20261129a';
import { normName, INVISIVEL, LIMITS, onlyDigits, cpfOk, fmtCpf, maskCpf, isEmail } from '../lib/fmt.js?v=20261129a';
import { classify } from '../lib/api.js?v=20261129a';
import { updateMe } from './shell.js?v=20261129a';

export const T = {
  sub: 'Seus dados, verificação e segurança.',
  nomeAjuda: 'Use seu nome completo, como nos seus documentos.',
  nomeVazio: 'Informe seu nome completo.',
  nomeCurto: 'Informe nome e sobrenome.',
  nomeLongo: 'O nome pode ter até 140 caracteres.',
  nomeCortado: 'O nome pode ter até 140 caracteres. O texto colado foi cortado.',
  nomeInvalido: 'O nome tem caracteres que não podem ser usados. Digite só letras e espaços.',
  cpfVazio: 'Informe seu CPF.',
  cpfInvalido: 'CPF inválido. Confira os números.',
  cpfAjuda: 'Só números. Depois do primeiro envio de documento, o CPF não poderá ser alterado por aqui.',
  cpfTravado: 'Para alterar o CPF, fale com o suporte.',
  cpfUsado: 'Não foi possível usar este CPF. Confira o número ou fale com o suporte.',
  cpfLimite: (mm) => `Muitas tentativas. Tente de novo em ${mm} minutos.`,
  incompleto: 'Complete seu perfil para enviar documentos.',
  dica: 'Sugestão do seu cadastro. Confira e clique em Salvar alterações.',
  dicaOnb: 'Sugestão do seu cadastro. Confira e clique em Salvar e continuar.',
  salvarRede: 'Não foi possível salvar. Verifique sua conexão e tente de novo.',
  salvarGeral: 'Não foi possível salvar agora. Tente de novo em instantes.',
  carregar: 'Não foi possível carregar seus dados. Verifique sua conexão.',
  confirme: 'Confirme seu e-mail para continuar.',
  reenviado: 'Enviamos de novo. Verifique também a caixa de spam.',
};

/* mailto do suporte: o endereço é [preencher] (pendência E-01); sem ele o link abre o e-mail com o destinatário em branco */
export function suporte(cfg, assunto, texto) {
  const to = cfg && isEmail(cfg.supportEmail) ? cfg.supportEmail : '';
  return h('a', { class: 'pf-link', href: 'mailto:' + to + '?subject=' + encodeURIComponent(assunto) }, texto);
}

/* e-mail ainda não confirmado: reenvia o link de confirmação e avisa no lugar */
export async function reenviar(ctx, area) {
  const r = await ctx.api.resend(ctx.session && ctx.session.user ? ctx.session.user.email : '');
  setKids(area, h('div', { class: r.error ? 'banner danger' : 'banner info', role: 'status' }, h('div', { class: 'grow' }, r.error ? T.salvarGeral : T.reenviado)));
}

/* aviso de e-mail não confirmado com "Reenviar e-mail" (Perfil e onboarding): [banner, área do resultado do reenvio] */
export function naoConfirmado(ctx) {
  const area = h('div', { class: 'pf-msg' });
  const b = h('button', { class: 'btn secondary sm', type: 'button', onclick: () => reenviar(ctx, area) }, 'Reenviar e-mail');
  return [h('div', { class: 'banner info' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.confirme), b), area];
}

/* campo de texto com rótulo, ajuda e erro (aria-describedby) */
function field(id, label, input, help) {
  const err = h('div', { class: 'ferr', id: id + '-err', role: 'alert', hidden: true });
  const helpEl = h('div', { class: 'help', id: id + '-help' }, help);
  input.setAttribute('aria-describedby', id + '-help');
  return { id, input, err, helpEl, node: h('div', { class: 'field' }, h('label', { for: id }, label), input, helpEl, err) };
}
function setErr(f, msg) {
  f.err.hidden = !msg;
  f.err.textContent = msg || '';
  if (msg) { f.input.setAttribute('aria-invalid', 'true'); f.input.setAttribute('aria-describedby', f.id + '-help ' + f.err.id); } else {
    f.input.removeAttribute('aria-invalid'); f.input.setAttribute('aria-describedby', f.id + '-help');
  }
  return !!msg;
}

function nameMsg(raw) {
  const n = normName(raw);
  if (!n) return T.nomeVazio;
  if (n.length > LIMITS.name) return T.nomeLongo;
  if (INVISIVEL.test(n)) return T.nomeInvalido;
  return n.length < 3 || !n.includes(' ') ? T.nomeCurto : '';
}

/* perfilForm({ ctx, st, me, modo, onSaved, rows, labelId }): st = { dead, me, uid } da tela (st.me é atualizado aqui). onSaved(me, campo) roda depois
   de gravar (campo null: onboarding sem mudança, perfil já completo). rows: nós extras depois do CPF (só o Perfil). */
export function perfilForm({ ctx, st, me, modo = 'perfil', onSaved, rows = [], labelId }) {
  const onb = modo === 'onboarding';
  const savedName = normName(me.name);
  const savedCpf = onlyDigits(me.cpf);
  const dica = !savedName && me.name_hint ? normName(me.name_hint) : '';
  const draft = ctx.api.takeDraft(st.uid);
  let locked = !!me.cpf_locked;
  let saving = false;
  const base = { name: dica || savedName, cpf: savedCpf };

  const name = field('pf-nome', 'Nome completo', h('input', { class: 'input', id: 'pf-nome', name: 'name', type: 'text', autocomplete: 'name', maxlength: LIMITS.name, value: draft ? draft.name : base.name }), T.nomeAjuda);
  const cpfIn = h('input', { class: 'input', id: 'pf-cpf', name: 'cpf', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 14, value: locked ? maskCpf(me.cpf) : draft ? draft.cpf : fmtCpf(savedCpf), disabled: locked });
  const cpf = field('pf-cpf', 'CPF', cpfIn, locked ? '' : T.cpfAjuda);
  const lockHelp = () => { setKids(cpf.helpEl, 'Para alterar o CPF, ', h('span', { class: 'nw' }, suporte(ctx.cfg, 'Alteração de CPF no Lottus Sign', 'fale com o suporte'), '.')); };
  if (locked) lockHelp();
  if (dica && !draft) name.helpEl.textContent = T.nomeAjuda + ' ' + (onb ? T.dicaOnb : T.dica);

  const msg = h('div', { class: 'pf-msg', role: 'alert', tabindex: '-1' });
  const save = h('button', { class: 'btn pf-save', type: 'submit', disabled: onb ? null : true, 'aria-disabled': onb ? 'false' : 'true' }, onb ? 'Salvar e continuar' : 'Salvar alterações');
  const form = h('form', { class: 'pf-form', novalidate: true, 'aria-labelledby': labelId || 'pf-h' },
    h('div', { class: 'pf-fields' }, name.node, cpf.node, ...rows), msg, h('div', { class: 'pf-actions' }, save));

  const cur = () => ({ name: normName(name.input.value), cpf: onlyDigits(cpfIn.value) });
  const changed = () => { const c = cur(); return c.name !== savedName || (!locked && c.cpf !== savedCpf); };
  const edited = () => { const c = cur(); return c.name !== normName(base.name) || (!locked && c.cpf !== base.cpf); };
  const sync = () => {
    const off = saving || (!onb && !changed()); /* no onboarding o botão sempre vale: sem alteração e perfil completo, só continua */
    save.disabled = off; save.setAttribute('aria-disabled', off ? 'true' : 'false');
  };
  const banner = (text, ...extra) => { setKids(msg, h('div', { class: 'banner danger' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, text), ...extra)); };

  name.input.addEventListener('input', () => { setErr(name, ''); setKids(msg); sync(); });
  /* V-03: o maxlength corta o texto colado em silêncio; avisa depois do evento input (que limpa o erro) */
  name.input.addEventListener('paste', (ev) => {
    const el = name.input; const txt = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
    const sobra = el.value.length - (el.selectionEnd - el.selectionStart) + txt.length > LIMITS.name;
    if (sobra) setTimeout(() => { setErr(name, T.nomeCortado); }, 0);
  });
  cpfIn.addEventListener('input', () => { setErr(cpf, ''); setKids(msg); sync(); });
  cpfIn.addEventListener('blur', () => { if (!locked) cpfIn.value = fmtCpf(cpfIn.value); });
  ctx.setGuard({ dirty: edited, keep: () => ctx.api.setDraft(st.uid, { name: name.input.value, cpf: cpfIn.value }) });

  async function lockedNow() { /* o servidor disse que o CPF está travado: confere o estado real e desliga o campo */
    try { const m = await ctx.api.me({ fresh: true }); if (st.dead) return; st.me = m; updateMe(m); if (m.cpf_locked) { locked = true; cpfIn.disabled = true; cpfIn.value = maskCpf(m.cpf); lockHelp(); } } catch (e) { /* mantém o erro do campo */ }
  }

  async function run() {
    setKids(msg);
    const c = cur();
    const bad = [];
    const nm = nameMsg(name.input.value);
    if (setErr(name, nm)) bad.push(name);
    if (!locked) { const cm = !c.cpf ? T.cpfVazio : cpfOk(c.cpf) ? '' : T.cpfInvalido; if (setErr(cpf, cm)) bad.push(cpf); } else setErr(cpf, '');
    if (bad.length) { focusEl(bad[0].input); return; }
    if (onb && !changed() && me.profile_complete) { ctx.setGuard(null); onSaved(me, null); return; } /* nada mudou e o perfil já está completo: só segue */
    saving = true; sync(); save.setAttribute('aria-busy', 'true');
    const payload = locked ? { name: c.name } : { name: c.name, cpf: c.cpf }; /* travado: o CPF nem vai no envio */
    try {
      const m = await ctx.api.profileSave(payload);
      if (st.dead) return;
      st.me = m; updateMe(m);
      ctx.setGuard(null);
      onSaved(m, c.name !== savedName ? 'name' : 'cpf');
      return;
    } catch (e) {
      if (st.dead) return;
      const k = classify(e);
      if (k === 'sessao') { ctx.sessionEnded(); return; }
      if (k === 'nome') { setErr(name, nameMsg(name.input.value) || T.nomeInvalido); focusEl(name.input); } else if (k === 'cpf') { setErr(cpf, T.cpfUsado); focusEl(cpfIn); } else if (k === 'cpf_limite') { setErr(cpf, T.cpfLimite(Math.max(1, Math.ceil((Number(e.retryAfter) || 60) / 60)))); focusEl(cpfIn); } else if (k === 'cpf_travado') {
        setErr(cpf, T.cpfTravado); await lockedNow(); } else if (k === 'cpf_usado') { setErr(cpf, T.cpfUsado); focusEl(cpfIn); } else if (k === 'naoconfirmado') {
        banner(T.confirme, h('button', { class: 'btn secondary sm', type: 'button', onclick: () => reenviar(ctx, msg) }, 'Reenviar e-mail')); focusEl(msg);
      } else { banner(k === 'rede' ? T.salvarRede : T.salvarGeral); focusEl(msg); }
    } finally { if (!st.dead) { saving = false; save.removeAttribute('aria-busy'); sync(); } }
  }
  form.addEventListener('submit', (ev) => { ev.preventDefault(); if (!saving && (onb || changed())) run(); });
  sync();

  return { node: form };
}
