/* Seção 1.4: Conta > Perfil (#/conta/perfil). Nome sempre editável; CPF só se preenche (nunca se troca por aqui: R5).
   O formulário vive em perfil-form.js (o mesmo do passo 1 do onboarding). Tudo por DOM e textContent. */
import { h, icon, ICON, setKids, pageHead, abasConta, toast, focusEl } from '../lib/ui.js?v=20261129a';
import { maskPhone } from '../lib/fmt.js?v=20261129a';
import { classify } from '../lib/api.js?v=20261129a';
import { levelOf, updateMe } from './shell.js?v=20261129a';
import { T, suporte, naoConfirmado, perfilForm } from './perfil-form.js?v=20261129a';

const NIVEIS = { Simples: ['tag', 'conta'], 'Avançada': ['tag brand', 'check'], Qualificada: ['tag success', 'check'] };

const tag = (cls, ic, txt) => h('span', { class: cls }, icon(ICON[ic], 'ico'), txt);
const nivelTag = (n) => tag(NIVEIS[n][0], NIVEIS[n][1], n);

function skeleton() {
  return [h('span', { class: 'sr-only', role: 'status' }, 'Carregando seus dados'),
    ...[60, 100, 100, 100].map((w, i) => h('div', { class: 'skel pf-skel' + (i ? ' tall' : ''), 'aria-hidden': 'true' }))];
}

function readOnly(id, label, ...kids) {
  return h('div', { class: 'field pf-item' }, h('span', { class: 'pf-label', id: id + '-l' }, label), h('div', { class: 'pf-value', role: 'group', 'aria-labelledby': id + '-l' }, ...kids));
}

function side() {
  return h('aside', { class: 'pf-side' },
    h('section', { class: 'card', 'aria-labelledby': 'pf-niv' }, h('h2', { id: 'pf-niv' }, 'Níveis de assinatura'),
      h('p', null, 'Simples: e-mail confirmado. Avançada: contato verificado. Qualificada: certificado digital válido. Veja como em Verificação.'),
      h('a', { class: 'btn secondary', href: '#/conta/verificacao' }, 'Ir para Verificação')),
    h('section', { class: 'card', 'aria-labelledby': 'pf-lgpd' }, h('h2', { id: 'pf-lgpd' }, 'Seus dados e a LGPD'),
      h('p', null, 'Para pedir exclusão ou portabilidade dos seus dados: [preencher: canal do DPO, Jurídico]. Dados de documentos já assinados são mantidos pelo prazo legal: [preencher: Jurídico, J-02/P1-10].')),
    h('a', { class: 'btn secondary', href: '#/documentos' }, 'Ir para Documentos'));
}

/* ---------- formulário ---------- */
function drawForm(st, box) {
  const { ctx, me } = st;
  /* V6-01: só é "Celular verificado" quando a prova foi por celular; verificação por e-mail não rotula o número como verificado */
  const phone = me.phone ? maskPhone(me.phone) : '';
  const celOk = me.phone_verified && me.contact_kind === 'phone';
  const porEmail = !!me.phone_verified && me.contact_kind === 'email';
  const tel = readOnly('pf-cel', 'Celular', phone || 'Não informado',
    phone ? (celOk ? tag('tag success', 'check', 'Celular verificado') : tag('tag muted', 'alerta', 'Não verificado')) : null,
    phone && porEmail ? h('div', { class: 'help' }, 'Este celular ainda não foi verificado. O contato verificado é o e-mail.') : null, /* B-5: o celular guardado não é o contato verificado */
    h('a', { class: 'pf-link', href: '#/conta/verificacao' }, 'Verificar contato'));
  const mail = readOnly('pf-mail', 'E-mail', h('span', { class: 'pf-mail' }, me.email || ''), tag('tag success', 'check', porEmail ? 'E-mail confirmado' : 'Confirmado'),
    h('div', { class: 'help' }, 'Para trocar o e-mail, ', h('span', { class: 'nw' }, suporte(ctx.cfg, 'Troca de e-mail no Lottus Sign', 'fale com o suporte'), '.')));

  const f = perfilForm({
    ctx, st, me, modo: 'perfil', rows: [tel, mail],
    onSaved(m, campo) {
      st.me = m;
      drawForm(st, box);
      toast('Dados salvos.', null, 'ok');
      const novo = box.querySelector(campo === 'cpf' && !box.querySelector('#pf-cpf').disabled ? '#pf-cpf' : '#pf-nome');
      focusEl(novo);
    },
  });

  box.removeAttribute('aria-busy');
  setKids(box,
    h('div', { class: 'pf-top' }, h('h2', { id: 'pf-h' }, 'Seus dados'), h('div', { class: 'pf-level' }, h('span', { class: 'pf-label' }, 'Nível de assinatura'), nivelTag(levelOf(me)))),
    me.profile_complete ? null : h('div', { class: 'banner info' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.incompleto)),
    f.node);
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
      setKids(box, h('h2', { id: 'pf-h' }, 'Seus dados'), ...naoConfirmado(ctx));
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
    setKids(ctx.view, pageHead('Conta', T.sub), abasConta(ctx.route), h('div', { class: 'pf' }, box, side()));
    load(st, box, false);
    return () => { st.dead = true; ctx.setGuard(null); };
  },
};
