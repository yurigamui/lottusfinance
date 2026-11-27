/* Seção 1.2: Recuperar senha (#/recuperar) e Nova senha (#/nova-senha). Só o Supabase Auth. A senha nunca vai ao DOM como texto, a storage, URL nem console. */
import { h, mount, setKids, setTitle, focusEl, brandLogo, safeStore, toast } from '../lib/ui.js?v=20261129a';
import { normEmail, isEmail, passwordMissing, LIMITS } from '../lib/fmt.js?v=20261129a';
import { classify } from '../lib/api.js?v=20261129a';
import { KEY_REC, setErr, textField, pwField, alertBox, busy } from './entrar.js?v=20261129a';

const T = {
  rede: 'Sem conexão. Verifique a internet e tente de novo.',
  vencido: 'Este link venceu ou já foi usado. Peça um novo.',
  difere: 'As senhas não são iguais.',
  forca: ['Fraca', 'Média', 'Forte'],
};

/* marcadores (sessionStorage, sem segredo) e carimbos de pedido (memN cobre navegador sem sessionStorage) */
const ss = safeStore('sessionStorage');
const K = (n) => 'lottus.sign.rec_' + n;
let memN = [];
export const marcarRec = (n) => ss.set(K(n), '1');
const temRec = (n) => ss.get(K(n)) === '1';
const limpar = (n) => ss.del(K(n));
const pedidos = () => { let a; try { a = JSON.parse(ss.get(K('n'))); } catch (e) { a = null; } return (Array.isArray(a) ? a : memN).filter((t) => Date.now() - t < 36e5); };
/* até 3 pedidos por hora neste navegador (o limite real de e-mails é do Auth) */
const limite = () => { const a = pedidos(); return `Você já pediu 3 links. Tente de novo em ${a.length ? Math.max(1, Math.ceil((a[0] + 36e5 - Date.now()) / 6e4)) : 60} min.`; };
let avisoSessao = false;

function pagina(root) {
  const card = h('section', { class: 'card sg-card' });
  mount(root, h('div', { class: 'sg-page sg-single sg-narrow' }, h('div', { class: 'sg-brand' }, brandLogo()), h('div', { class: 'sg-main' }, card)));
  return card;
}
/* link de rota pública: href real, clique com replace; antes() roda antes de navegar */
const link = (ctx, href, cls, txt, antes) => h('a', { class: cls, href, onclick: async (e) => {
  if (e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  if (antes) await antes();
  ctx.go(href, true);
} }, txt);
const voltar = (ctx, antes) => link(ctx, '#/entrar', 'sg-link', 'Voltar ao Entrar', antes);
const live = () => h('div', { class: 'sg-msg', 'aria-live': 'polite' });
const dizer = (el, kind, txt) => setKids(el, txt && alertBox(kind, txt));
const tela = (card, title, ...kids) => { setTitle(title); setKids(card, h('h1', { tabindex: '-1' }, title), ...kids); focusEl(card.firstChild); };

/* "Verificando o link…": mostrado pelo app.js enquanto a sessão do link abre */
export function verificando(root) {
  tela(pagina(root), 'Verificando o link…', h('div', { class: 'spinner', role: 'status', 'aria-label': 'Verificando o link' }));
}

export const recuperar = {
  title: 'Recuperar senha',
  ownFocus: true,
  render(ctx) {
    const st = { stage: 0, email: ss.get(KEY_REC) || '', busy: false, dead: false, t: null, aviso: avisoSessao };
    ss.del(KEY_REC); avisoSessao = false; /* o e-mail vem só de sessionStorage (lido e apagado), nunca da URL */
    const card = pagina(ctx.root);

    /* true = o Auth respondeu sem erro que revele a conta; 4xx (inclusive user_not_found) cai na mesma tela neutra */
    async function enviar(btn, msg, rotulo) {
      if (st.busy) return false;
      if (pedidos().length >= 3) { dizer(msg, 'err', limite()); return false; }
      st.busy = true; memN = [...pedidos(), Date.now()]; ss.set(K('n'), JSON.stringify(memN)); busy(btn, true, 'Enviando…'); dizer(msg, 'err');
      const { error } = await ctx.api.recover(st.email);
      st.busy = false;
      if (st.dead) return false;
      busy(btn, false, rotulo);
      const k = classify(error);
      if (!error || (error.status >= 400 && error.status < 500 && k !== 'limite')) return true;
      dizer(msg, 'err', k === 'limite' ? limite() : k === 'rede' ? T.rede : 'Não foi possível enviar agora. Tente de novo.');
      return false;
    }

    function desenhar() {
      clearInterval(st.t);
      const msg = live();
      if (st.stage) {
        const re = h('button', { class: 'btn secondary lg block', type: 'button' }, 'Reenviar');
        const espera = () => { /* 60 s: de 0:59 a 0:01 */
          clearInterval(st.t);
          const ate = Date.now() + 6e4;
          const tick = () => {
            const s = Math.ceil((ate - Date.now()) / 1000);
            re.disabled = s > 0; re.textContent = s > 0 ? 'Reenviar em 0:' + String(Math.min(59, s)).padStart(2, '0') : 'Reenviar';
            if (s <= 0) clearInterval(st.t);
          };
          st.t = setInterval(tick, 1000); tick();
        };
        re.addEventListener('click', async () => { if (await enviar(re, msg, 'Reenviar')) { dizer(msg, 'ok', 'Enviamos de novo. Verifique também a caixa de spam.'); espera(); } });
        tela(card, 'Verifique seu e-mail', h('p', { class: 'sg-lead' }, 'Se este e-mail puder ser usado, enviamos o link. Ele vale por tempo limitado. Veja também a caixa de spam.'), msg, re,
          h('div', { class: 'sg-links' }, h('button', { class: 'sg-link', type: 'button', onclick: () => { st.email = ''; st.stage = 0; desenhar(); } }, 'Usar outro e-mail'), voltar(ctx)));
        espera();
        return;
      }
      if (st.aviso) { dizer(msg, 'warn', 'Para trocar a senha, peça um link ao seu e-mail.'); st.aviso = false; }
      const email = textField({ id: 'email', label: 'E-mail', type: 'email', autocomplete: 'username', value: st.email, maxlength: LIMITS.email });
      const btn = h('button', { class: 'btn lg block', type: 'submit' }, 'Enviar link');
      const form = h('form', { class: 'sg-form', novalidate: true, 'aria-label': 'Recuperar senha' }, email.node, msg, btn);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const e = normEmail(email.input.value);
        if (setErr(email, !e ? 'Informe seu e-mail.' : isEmail(e) ? '' : 'Confira o e-mail digitado.')) { focusEl(email.input); return; }
        st.email = e;
        if (await enviar(btn, msg, 'Enviar link')) { st.stage = 1; desenhar(); }
      });
      tela(card, 'Recuperar senha', h('p', { class: 'sg-lead' }, 'Informe o e-mail da sua conta. Se ele puder ser usado, enviamos um link para criar uma nova senha.'), form, h('div', { class: 'sg-links' }, voltar(ctx)));
    }
    desenhar();
    return () => { st.dead = true; clearInterval(st.t); };
  },
};

/* 0 Fraca, 1 Média, 2 Forte (o mínimo de 10 caracteres é validado à parte) */
const nivel = (v) => {
  const c = [/[a-z]/, /[A-Z]/, /\d/, /\W|_/].filter((r) => r.test(v)).length;
  return v.length < LIMITS.passwordMin ? 0 : v.length >= 14 && c > 2 ? 2 : v.length >= 12 || c > 2 ? 1 : 0;
};

export const novasenha = {
  title: 'Criar nova senha',
  ownFocus: true,
  render(ctx) {
    const falhou = temRec('fail');
    limpar('fail');
    if (!falhou && !(temRec('ok') && ctx.hasSession)) { limpar('ok'); avisoSessao = true; ctx.go('#/recuperar', true); return null; }
    const card = pagina(ctx.root);
    const sair = () => { if (location.hash !== '#/nova-senha') limpar('ok'); }; /* ir a outra rota abandona (apaga o marcador); F5 e re-render não */
    const invalido = () => {
      limpar('ok');
      tela(card, 'Link inválido', h('p', { class: 'sg-lead' }, T.vencido), link(ctx, '#/recuperar', 'btn lg block', 'Pedir novo link'), h('div', { class: 'sg-links' }, voltar(ctx)));
    };
    if (falhou) { invalido(); return sair; }

    let tentou = false;
    let ocupado = false;
    const faltam = h('div', { class: 'sg-count', 'aria-live': 'polite' });
    const forca = h('div', { class: 'sg-meter', hidden: true }, h('span', { class: 'bars', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span'));
    const pw = pwField('nova', 'Nova senha', 'new-password', 'Mínimo de 10 caracteres.', h('div', null, faltam, forca), ['Mostrar senha', 'Ocultar senha']);
    const cf = pwField('confirma', 'Confirmar nova senha', 'new-password', null, null, ['Mostrar senha', 'Ocultar senha']);
    const msg = live();
    const btn = h('button', { class: 'btn lg block', type: 'submit' }, 'Salvar nova senha');
    const atualizar = () => {
      const v = pw.input.value; const c = cf.input.value; const n = passwordMissing(v); const f = nivel(v);
      faltam.textContent = (v || tentou) && n ? (n === 1 ? 'Falta 1 caractere' : `Faltam ${n} caracteres`) : '';
      forca.hidden = !v; forca.dataset.n = f + 1; forca.lastChild.textContent = 'Força da senha: ' + T.forca[f];
      return setErr(cf, (c || tentou) && v !== c && (tentou || c.length >= v.length) ? T.difere : '');
    };
    pw.input.addEventListener('input', () => { setErr(pw, ''); atualizar(); });
    cf.input.addEventListener('input', atualizar);

    const form = h('form', { class: 'sg-form', novalidate: true, 'aria-label': 'Criar nova senha' }, pw.node, cf.node, msg, btn);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (ocupado) return;
      tentou = true;
      const difere = atualizar();
      if (passwordMissing(pw.input.value) || difere) { focusEl(passwordMissing(pw.input.value) ? pw.input : cf.input); return; }
      ocupado = true; busy(btn, true, 'Salvando…'); dizer(msg, 'err');
      const { error } = await ctx.api.updatePassword(pw.input.value);
      if (error) {
        ocupado = false; busy(btn, false, 'Salvar nova senha');
        const k = classify(error);
        if (k === 'sessao' || error.status === 403) { await ctx.api.dropSession(); invalido(); return; }
        if (k === 'senha' || k === 'mesma') { setErr(pw, k === 'senha' ? 'Essa senha é fraca ou já apareceu em vazamentos. Escolha outra.' : 'A nova senha precisa ser diferente da atual.'); focusEl(pw.input); return; }
        dizer(msg, 'err', k === 'limite' ? 'Muitas tentativas. Aguarde um pouco e tente de novo.' : k === 'rede' ? T.rede : 'Não foi possível alterar a senha. Tente de novo.');
        return;
      }
      /* trocou: encerra as OUTRAS sessões (esta continua); se falhar, a troca vale. Depois, o destino normal pós-login. */
      pw.input.value = ''; cf.input.value = ''; limpar('ok');
      const o = await ctx.api.signOutOthers();
      toast('Senha alterada.', o.error && 'Não conseguimos encerrar as outras sessões; entre em Perfil para sair dos outros aparelhos.', 'ok');
      try { await ctx.afterLogin(); } catch (e) { ctx.go('#/documentos', true); }
    });
    tela(card, 'Criar nova senha', form, h('div', { class: 'sg-links' }, voltar(ctx, async () => { limpar('ok'); await ctx.api.signOut(); }))); /* abandonar encerra a sessão aberta pelo link */
    return sair;
  },
};
