/* Seção 1.4: Conta > Perfil (#/conta/perfil). Nome sempre editável; CPF só se preenche (nunca se troca por aqui: R5).
   Tudo por DOM e textContent: nome vindo do usuário nunca vira HTML. Nada de nome/CPF em storage (o rascunho fica só em memória). */
import { h, icon, ICON, setKids, pageHead, abasConta, toast, focusEl } from '../lib/ui.js?v=20261127a';
import { normName, INVISIVEL, LIMITS, onlyDigits, cpfOk, fmtCpf, maskCpf, maskPhone, isEmail } from '../lib/fmt.js?v=20261127a';
import { classify } from '../lib/api.js?v=20261127a';
import { levelOf, updateMe } from './shell.js?v=20261127a';

const T = {
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
  salvarRede: 'Não foi possível salvar. Verifique sua conexão e tente de novo.',
  salvarGeral: 'Não foi possível salvar agora. Tente de novo em instantes.',
  carregar: 'Não foi possível carregar seus dados. Verifique sua conexão.',
  confirme: 'Confirme seu e-mail para continuar.',
  reenviado: 'Enviamos de novo. Verifique também a caixa de spam.',
};
const NIVEIS = { Simples: ['tag', 'conta'], 'Avançada': ['tag brand', 'check'], Qualificada: ['tag success', 'check'] };

const tag = (cls, ic, txt) => h('span', { class: cls }, icon(ICON[ic], 'ico'), txt);
const nivelTag = (n) => tag(NIVEIS[n][0], NIVEIS[n][1], n);

/* mailto do suporte: o endereço é [preencher] (pendência E-01); sem ele o link abre o e-mail com o destinatário em branco */
export function suporte(cfg, assunto, texto) {
  const to = cfg && isEmail(cfg.supportEmail) ? cfg.supportEmail : '';
  return h('a', { class: 'pf-link', href: 'mailto:' + to + '?subject=' + encodeURIComponent(assunto) }, texto);
}

function skeleton() {
  return [h('span', { class: 'sr-only', role: 'status' }, 'Carregando seus dados'),
    ...[60, 100, 100, 100].map((w, i) => h('div', { class: 'skel pf-skel' + (i ? ' tall' : ''), 'aria-hidden': 'true' }))];
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

function readOnly(id, label, ...kids) {
  return h('div', { class: 'field pf-item' }, h('span', { class: 'pf-label', id: id + '-l' }, label), h('div', { class: 'pf-value', role: 'group', 'aria-labelledby': id + '-l' }, ...kids));
}

function side(ctx) {
  return h('aside', { class: 'pf-side' },
    h('section', { class: 'card', 'aria-labelledby': 'pf-niv' }, h('h2', { id: 'pf-niv' }, 'Níveis de assinatura'),
      h('p', null, 'Simples: e-mail confirmado. Avançada: contato verificado. Qualificada: certificado digital válido. Veja como em Verificação.'),
      h('a', { class: 'btn secondary', href: '#/conta/verificacao' }, 'Ir para Verificação')),
    h('section', { class: 'card', 'aria-labelledby': 'pf-lgpd' }, h('h2', { id: 'pf-lgpd' }, 'Seus dados e a LGPD'),
      h('p', null, 'Para pedir exclusão ou portabilidade dos seus dados: [preencher: canal do DPO, Jurídico]. Dados de documentos já assinados são mantidos pelo prazo legal: [preencher: Jurídico, J-02/P1-10].')),
    h('a', { class: 'btn secondary', href: '#/documentos' }, 'Ir para Documentos'));
}

/* e-mail ainda não confirmado: reenvia o link de confirmação e avisa no lugar */
async function reenviar(ctx, area) {
  const r = await ctx.api.resend(ctx.session && ctx.session.user ? ctx.session.user.email : '');
  setKids(area, h('div', { class: r.error ? 'banner danger' : 'banner info', role: 'status' }, h('div', { class: 'grow' }, r.error ? T.salvarGeral : T.reenviado)));
}

/* ---------- formulário ---------- */
function drawForm(st, box) {
  const { ctx, me } = st;
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
  if (dica && !draft) name.helpEl.textContent = T.nomeAjuda + ' ' + T.dica;

  const phone = me.phone ? maskPhone(me.phone) : '';
  const tel = readOnly('pf-cel', 'Celular', phone || 'Não informado',
    phone ? (me.phone_verified ? tag('tag success', 'check', 'Verificado') : tag('tag muted', 'alerta', 'Não verificado')) : null,
    h('a', { class: 'pf-link', href: '#/conta/verificacao' }, 'Verificar contato'));
  const mail = readOnly('pf-mail', 'E-mail', h('span', { class: 'pf-mail' }, me.email || ''), tag('tag success', 'check', 'Confirmado'),
    h('div', { class: 'help' }, 'Para trocar o e-mail, ', h('span', { class: 'nw' }, suporte(ctx.cfg, 'Troca de e-mail no Lottus Sign', 'fale com o suporte'), '.')));

  const msg = h('div', { class: 'pf-msg', role: 'alert', tabindex: '-1' });
  const save = h('button', { class: 'btn pf-save', type: 'submit', disabled: true, 'aria-disabled': 'true' }, 'Salvar alterações');
  const form = h('form', { class: 'pf-form', novalidate: true, 'aria-labelledby': 'pf-h' },
    h('div', { class: 'pf-fields' }, name.node, cpf.node, tel, mail), msg, h('div', { class: 'pf-actions' }, save));

  const cur = () => ({ name: normName(name.input.value), cpf: onlyDigits(cpfIn.value) });
  const changed = () => { const c = cur(); return c.name !== savedName || (!locked && c.cpf !== savedCpf); };
  const edited = () => { const c = cur(); return c.name !== normName(base.name) || (!locked && c.cpf !== base.cpf); };
  const sync = () => { const off = saving || !changed(); save.disabled = off; save.setAttribute('aria-disabled', off ? 'true' : 'false'); };
  const banner = (text, ...extra) => { setKids(msg, h('div', { class: 'banner danger' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, text), ...extra)); };

  name.input.addEventListener('input', () => { setErr(name, ''); setKids(msg, ); sync(); });
  /* V-03: o maxlength corta o texto colado em silêncio; avisa depois do evento input (que limpa o erro) */
  name.input.addEventListener('paste', (ev) => {
    const el = name.input; const txt = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
    const sobra = el.value.length - (el.selectionEnd - el.selectionStart) + txt.length > LIMITS.name;
    if (sobra) setTimeout(() => { setErr(name, T.nomeCortado); }, 0);
  });
  cpfIn.addEventListener('input', () => { setErr(cpf, ''); setKids(msg, ); sync(); });
  cpfIn.addEventListener('blur', () => { if (!locked) cpfIn.value = fmtCpf(cpfIn.value); });
  ctx.setGuard({ dirty: edited, keep: () => ctx.api.setDraft(st.uid, { name: name.input.value, cpf: cpfIn.value }) });

  async function lockedNow() { /* o servidor disse que o CPF está travado: confere o estado real e desliga o campo */
    try { const m = await ctx.api.me({ fresh: true }); if (st.dead) return; st.me = m; updateMe(m); if (m.cpf_locked) { locked = true; cpfIn.disabled = true; cpfIn.value = maskCpf(m.cpf); lockHelp(); } } catch (e) { /* mantém o erro do campo */ }
  }

  async function run() {
    setKids(msg, );
    const c = cur();
    const bad = [];
    const nm = nameMsg(name.input.value);
    if (setErr(name, nm)) bad.push(name);
    if (!locked) { const cm = !c.cpf ? T.cpfVazio : cpfOk(c.cpf) ? '' : T.cpfInvalido; if (setErr(cpf, cm)) bad.push(cpf); } else setErr(cpf, '');
    if (bad.length) { focusEl(bad[0].input); return; }
    saving = true; sync(); save.setAttribute('aria-busy', 'true');
    const payload = locked ? { name: c.name } : { name: c.name, cpf: c.cpf }; /* travado: o CPF nem vai no envio */
    try {
      const m = await ctx.api.profileSave(payload);
      if (st.dead) return;
      st.me = m; updateMe(m);
      ctx.setGuard(null);
      const campo = c.name !== savedName ? 'name' : 'cpf';
      drawForm(st, box);
      toast('Dados salvos.', null, 'ok');
      focusEl(box.querySelector(campo === 'cpf' && !box.querySelector('#pf-cpf').disabled ? '#pf-cpf' : '#pf-nome'));
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
  form.addEventListener('submit', (ev) => { ev.preventDefault(); if (!saving && changed()) run(); });

  box.removeAttribute('aria-busy');
  setKids(box, 
    h('div', { class: 'pf-top' }, h('h2', { id: 'pf-h' }, 'Seus dados'), h('div', { class: 'pf-level' }, h('span', { class: 'pf-label' }, 'Nível de assinatura'), nivelTag(levelOf(me)))),
    me.profile_complete ? null : h('div', { class: 'banner info' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.incompleto)),
    form);
  sync();
}

/* ---------- carga ---------- */
async function load(st, box, fresh) {
  const { ctx } = st;
  box.setAttribute('aria-busy', 'true');
  setKids(box, ...skeleton());
  try {
    const me = await ctx.api.me({ fresh });
    if (st.dead) return;
    st.me = me;
    if (fresh) updateMe(me);
    drawForm(st, box);
  } catch (e) {
    if (st.dead) return;
    const k = classify(e);
    if (k === 'sessao') { ctx.sessionEnded(); return; }
    box.removeAttribute('aria-busy');
    if (k === 'naoconfirmado') {
      const b = h('button', { class: 'btn secondary sm', type: 'button' }, 'Reenviar e-mail');
      const area = h('div', { class: 'pf-msg' });
      b.addEventListener('click', () => reenviar(ctx, area));
      setKids(box, h('h2', { id: 'pf-h' }, 'Seus dados'), h('div', { class: 'banner info' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.confirme), b), area);
      return;
    }
    const retry = h('button', { class: 'btn secondary sm', type: 'button' }, 'Tentar de novo');
    retry.addEventListener('click', () => { retry.setAttribute('aria-busy', 'true'); retry.disabled = true; load(st, box, true); });
    setKids(box, h('h2', { id: 'pf-h' }, 'Seus dados'), h('div', { class: 'banner danger', role: 'alert' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.carregar), retry));
    focusEl(retry);
  }
}

export const perfil = {
  shell: true,
  ownMeError: true, /* o erro de sign_me é mostrado aqui; o shell não repete o aviso */
  title: 'Perfil · Conta',
  render(ctx) {
    const st = { ctx, dead: false, me: null, uid: ctx.session && ctx.session.user ? ctx.session.user.id : '' };
    const box = h('section', { class: 'card pf-card', 'aria-busy': 'true', 'aria-labelledby': 'pf-h' }, ...skeleton());
    setKids(ctx.view, pageHead('Conta', T.sub), abasConta(ctx.route), h('div', { class: 'pf' }, box, side(ctx)));
    load(st, box, false);
    return () => { st.dead = true; ctx.setGuard(null); };
  },
};
