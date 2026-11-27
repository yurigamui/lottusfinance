/* Seção 1.3: Onboarding (#/onboarding/1 a 3): 1 Seus dados, 2 Verificar contato, 3 Certificado (opcional) e concluir.
   Reaproveita perfil-form.js, verificacao-contato.js e o certCard de verificacao.js. Quem decide concluir é o servidor (sign_onboarding_done).
   Só DOM e textContent. Nada em storage além do hash. */
import { h, icon, ICON, setKids, pageHead, toast, focusH1, focusEl } from '../lib/ui.js?v=20261128a';
import { classify } from '../lib/api.js?v=20261128a';
import { levelOf, updateMe } from './shell.js?v=20261128a';
import { perfilForm, naoConfirmado } from './perfil-form.js?v=20261128a';
import { contatoCard, NIVEIS, tag } from './verificacao-contato.js?v=20261128a';
import { certCard } from './verificacao.js?v=20261128a';

const T = {
  rotulos: ['Seus dados', 'Verificar contato', 'Certificado (opcional)'], /* rótulos das etapas e h1 de cada passo */
  sub: [
    'Precisamos do seu nome e CPF para identificar você nas assinaturas.',
    'Confirme que você recebe mensagens neste contato. Isso protege suas assinaturas.',
    'Com certificado digital seus documentos podem ter nível mais alto de assinatura. Você pode fazer isso depois.',
  ],
  antes: 'Falta concluir esta etapa antes.',
  completar: 'Complete seus dados e verifique seu contato para concluir.',
  carregar: 'Não foi possível carregar seus dados.',
  concluirErro: 'Não foi possível concluir agora. Tente de novo.',
  tudoPronto: 'Tudo pronto. Sua conta está configurada.',
  retry: 'Tentar de novo',
  voltar: 'Voltar',
  continuar: 'Continuar',
  dica2: 'Confirme o código para liberar o botão Continuar.',
  resumo: 'O que falta para enviar',
  pronto: 'Pronto',
  falta: 'Falta fazer',
  opcional: 'Opcional',
  nota: 'Sem certificado, seus envios saem no nível de assinatura que você tem hoje. Você pode adicionar um certificado depois, em Conta > Verificação.',
};

/* aviso role=status pedido por quem corrigiu o hash: 'antes' (RN-OB2) ou 'completar' (onboarding_incomplete); vale para a próxima tela */
let avisoPendente = null;

/* RN-OB1: primeiro passo pendente */
export const primeiroPendente = (me) => (!me.profile_complete ? 1 : !me.verified ? 2 : 3);
const hashDe = (n) => '#/onboarding/' + n;

function skeleton() {
  return [h('span', { class: 'sr-only', role: 'status' }, 'Carregando seus dados'),
    h('div', { class: 'skel ob-skel', 'aria-hidden': 'true' }), h('div', { class: 'skel ob-skel tall', 'aria-hidden': 'true' })];
}

/* etapas: atual com aria-current e on; concluídas com ✓ visível e done */
function etapas(step) {
  return h('ol', { class: 'ob-steps', 'aria-label': 'Etapas' }, T.rotulos.map((rot, i) => {
    const n = i + 1;
    const feito = n < step;
    return h('li', { class: n === step ? 'on' : feito ? 'done' : '', 'aria-current': n === step ? 'step' : null },
      h('span', { 'aria-hidden': 'true' }, feito ? '✓' : String(n)), rot, feito ? h('span', { class: 'sr-only' }, ' (concluído)') : null);
  }));
}

const aviso = (txt) => h('div', { class: 'banner info ob-aviso', role: 'status' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, txt));

/* ---------------------------------------------------------------- passo 1 */
function passo1(st) {
  const { ctx } = st;
  const f = perfilForm({ ctx, st, me: st.me, modo: 'onboarding', labelId: 'ob-h',
    onSaved(m) { st.me = m; ctx.go(hashDe(2)); } });
  return h('section', { class: 'card ob-card pf-card' }, f.node);
}

/* ---------------------------------------------------------------- passo 2 */
function passo2(st) {
  const { ctx, me } = st;
  const contato = contatoCard(st, { modo: 'onboarding', onVerified(m) { st.me = m; const ok = ctx.view.querySelector('.vf-ok'); if (ok) focusEl(ok); } });
  const seguir = h('button', { class: 'btn', type: 'button', disabled: me.verified ? null : true, 'aria-describedby': me.verified ? null : 'ob-dica', onclick: () => ctx.go(hashDe(3)) }, T.continuar);
  return [contato,
    me.verified ? null : h('p', { class: 'help ob-hint', id: 'ob-dica' }, T.dica2),
    h('div', { class: 'ob-actions' }, h('a', { class: 'btn secondary ob-back', href: hashDe(1) }, T.voltar), seguir)];
}

/* ---------------------------------------------------------------- passo 3 */
function resumo(st) {
  const { me } = st;
  const nivel = levelOf(me);
  const linha = (rot, href, ok, textoSe, textoNao, cls) => h('li', null,
    href && ok ? h('a', { href }, rot) : h('span', { class: 'ob-lbl' }, rot),
    ok ? tag('tag success', 'check', textoSe) : tag(cls || 'tag warning', cls ? 'conta' : 'alerta', textoNao));
  return h('section', { class: 'card ob-card ob-resumo', 'aria-labelledby': 'ob-res-h' },
    h('h2', { id: 'ob-res-h' }, T.resumo),
    h('ul', { class: 'ob-sum' },
      linha('Seus dados', hashDe(1), !!me.profile_complete, T.pronto, T.falta),
      linha('Contato verificado', hashDe(2), me.verified === true, T.pronto, T.falta),
      linha('Certificado', null, !!me.cert, T.pronto, T.opcional, 'tag muted')),
    h('p', { class: 'ob-level' }, 'Nível de assinatura hoje: ', h('strong', null, nivel), '.'),
    h('p', { class: 'ob-note' }, NIVEIS[nivel][2] + ' ' + T.nota));
}

function passo3(st, draw) {
  const { ctx } = st;
  const msg = h('div', { class: 'ob-msg', role: 'alert', tabindex: '-1' });
  let busy = false;
  async function concluir() {
    if (busy) return;
    busy = true; setKids(msg);
    for (const b of [pular, fim]) { b.disabled = true; }
    fim.setAttribute('aria-busy', 'true');
    try {
      const m = await ctx.api.onboardingDone();
      if (st.dead) return;
      st.me = m; updateMe(m);
      toast(T.tudoPronto, null, 'ok');
      await ctx.afterLogin(); /* destino salvo (lista branca) ou Documentos, por replace */
    } catch (e) {
      if (st.dead) return;
      busy = false;
      for (const b of [pular, fim]) { b.disabled = false; } fim.removeAttribute('aria-busy');
      const k = classify(e);
      if (k === 'sessao') { ctx.sessionEnded(); return; }
      if (k === 'incompleto') { /* o servidor discorda: primeiro passo pendente, com aviso */
        let alvo = 1;
        try { alvo = primeiroPendente(await ctx.api.me({ fresh: true })); } catch (e2) { alvo = 1; }
        if (st.dead) return;
        avisoPendente = 'completar'; ctx.go(hashDe(alvo), true); return;
      }
      if (k === 'naoconfirmado') { st.off = true; draw(); return; }
      const retry = h('button', { class: 'btn secondary sm', type: 'button', onclick: () => concluir() }, T.retry);
      setKids(msg, h('div', { class: 'banner danger' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.concluirErro), retry));
      focusEl(msg);
    }
  }
  const pular = h('button', { class: 'btn secondary', type: 'button', onclick: () => concluir() }, 'Pular certificado');
  const fim = h('button', { class: 'btn', type: 'button', onclick: () => concluir() }, 'Concluir');
  return [h('div', { class: 'ob-grid' }, certCard(st), resumo(st)), msg,
    h('div', { class: 'ob-actions' }, h('a', { class: 'btn secondary ob-back', href: hashDe(2) }, T.voltar), pular, fim)];
}

/* ---------------------------------------------------------------- página */
function desenhar(st, box, step, foco) {
  const { ctx } = st;
  st.ticks.length = 0;
  const cab = pageHead(T.rotulos[step - 1], T.sub[step - 1]);
  cab.querySelector('h1').id = 'ob-h';
  let corpo;
  if (st.off) corpo = [h('div', { class: 'ob-off' }, ...naoConfirmado(st.ctx))];
  else corpo = step === 1 ? [passo1(st)] : step === 2 ? passo2(st) : passo3(st, () => desenhar(st, box, step, false));
  box.removeAttribute('aria-busy');
  box.classList.toggle('wide', step === 3);
  setKids(box, cab, etapas(step), st.aviso ? aviso(st.aviso === 'antes' ? T.antes : T.completar) : null, ...corpo);
  if (foco && !ctx.first) focusH1(ctx.view); /* troca de passo: foco no h1 (1º carregamento da página: Tab começa em "Ir para o conteúdo") */
}

async function carregar(st, box, fresh) {
  const { ctx } = st;
  box.setAttribute('aria-busy', 'true');
  setKids(box, ...skeleton());
  let me;
  try { me = await ctx.api.me({ fresh }); } catch (e) {
    if (st.dead) return;
    const k = classify(e);
    if (k === 'sessao') { ctx.sessionEnded(); return; }
    box.removeAttribute('aria-busy');
    if (k === 'naoconfirmado') { st.off = true; st.me = { channels: { email: true } }; setKids(box, pageHead(T.rotulos[0], T.sub[0]), h('div', { class: 'ob-off' }, ...naoConfirmado(st.ctx))); return; }
    const retry = h('button', { class: 'btn secondary sm', type: 'button', onclick: () => { retry.setAttribute('aria-busy', 'true'); retry.disabled = true; carregar(st, box, true); } }, T.retry);
    setKids(box, pageHead(T.rotulos[0], T.sub[0]), h('div', { class: 'banner danger', role: 'alert' }, icon(ICON.alerta, 'ico'), h('div', { class: 'grow' }, T.carregar), retry));
    focusEl(retry);
    return;
  }
  if (st.dead) return;
  st.me = me; st.off = false;
  if (me.onboarding_done) { ctx.afterLogin(); return; } /* quem já terminou vai ao destino, por replace */
  const pend = primeiroPendente(me);
  const m = /^#\/onboarding\/([123])$/.exec(ctx.route);
  const pedido = m ? Number(m[1]) : 0;
  const alvo = ctx.entrada || !pedido || pedido > pend ? pend : pedido; /* RN-OB1 e RN-OB2 */
  if (alvo !== pedido) {
    if (!ctx.entrada && pedido > pend && !avisoPendente) avisoPendente = 'antes';
    ctx.go(hashDe(alvo), true);
    return;
  }
  st.aviso = avisoPendente; avisoPendente = null;
  st.step = alvo;
  st.redraw = () => { if (!st.dead) desenhar(st, box, st.step, false); };
  desenhar(st, box, alvo, true);
}

export const onboarding = {
  shell: true,
  minimal: true,
  ownMeError: true, /* o erro de sign_me é mostrado aqui; o shell não repete o aviso (uma só origem) */
  title: 'Primeiros passos',
  render(ctx) {
    const st = { ctx, dead: false, me: null, off: false, ticks: [], sucesso: '', aviso: null, step: 0, redraw() {}, uid: ctx.session && ctx.session.user ? ctx.session.user.id : '' };
    const box = h('div', { class: 'ob', 'aria-busy': 'true' }, ...skeleton());
    setKids(ctx.view, box);
    carregar(st, box, false);
    const timer = setInterval(() => { if (!st.dead) for (const f of st.ticks.slice()) f(); }, 1000);
    return () => { st.dead = true; clearInterval(timer); ctx.setGuard(null); };
  },
};
