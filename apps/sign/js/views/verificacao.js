/* Seção 1.5: Conta > Verificação (#/conta/verificacao). Prova o contato com código de 6 dígitos e vincula um certificado ICP-Brasil (opcional).
   Tudo por DOM e textContent (setKids, sem HTML em texto). O nível vem de levelOf (shell.js), a única derivação. Nada de código, e-mail ou certificado em storage.
   A validação criptográfica do certificado é feita por uma função de borda que NÃO está no repositório (T-07): a tela chama o endereço
   configurável cfg.certEndpoint (desligado por padrão). Sem ele, ou se ele não responder, aparece o indicador de indisponível. */
import { h, icon, ICON, setKids, pageHead, abasConta, toast, focusEl, safeUrl } from '../lib/ui.js?v=20261128a';
import { maskCpf, maskSubject } from '../lib/fmt.js?v=20261128a';
import { classify } from '../lib/api.js?v=20261128a';
import { levelOf, updateMe } from './shell.js?v=20261128a';
import { suporte } from './perfil-form.js?v=20261128a';
import { T, MSG, textoErro, fmtData, NIVEIS, tag, contatoCard } from './verificacao-contato.js?v=20261128a';

const SAIDA_PERFIL = () => h('a', { class: 'btn secondary', href: '#/conta/perfil' }, 'Voltar ao perfil');

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


/* ------------------------------------------------------------------ cartão: certificado digital */
export function certCard(st) {
  const { ctx } = st;
  const me = st.me;
  const box = h('section', { class: 'card vf-card', 'aria-labelledby': 'vf-cert-h' });
  const c = { disp: typeof st.edge === 'boolean' ? st.edge : null, desafio: null, expira: 0, roots: true, busy: false, msg: '', exit: null, arquivo: null };
  let msgEl = null; let gerarBtn = null; let enviarBtn = null; let fileIn = null; let copiarBtn = null;
  const timeout = () => (Number(ctx.cfg.certTimeoutMs) > 0 ? Number(ctx.cfg.certTimeoutMs) : 8000);
  const url = safeUrl(ctx.cfg.certEndpoint);
  if (!url) c.disp = false;
  st.edge = c.disp === null ? undefined : c.disp; /* a disponibilidade sobrevive ao redesenho da página */

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
    if (!url || me.cert || st.off || typeof st.edge === 'boolean') return;
    try { await porEndpoint('', { method: 'GET' }); if (!st.dead) { c.disp = true; st.edge = true; paint(); } } catch (e) { if (!st.dead) { c.disp = false; st.edge = false; paint(); } }
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
    if (e.indisponivel) { c.disp = false; st.edge = false; c.msg = ''; paint(); return; }
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
      if (!c.roots) { c.msg = MSG.roots_not_loaded(); c.exit = saida('roots_not_loaded'); }
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
          linha('Titular', maskSubject(ce.subject) || 'Não informado'),
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
    h('div', { class: 'vf-col' }, contatoCard(st), certCard(st)));
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
