/* Telas provisórias: destinos que ainda não existem (1.2, 1.3, Partes 2 a 5) e rota desconhecida. Sempre com saída.
   Públicas (recuperar, nova-senha, rota desconhecida sem sessão): .sg-single. Privadas: dentro do shell (1.0). */
import { h, mount, brandLogo, pageHead, emptyState } from '../lib/ui.js?v=20261125a';

function pagina(ctx, title, text, actions) {
  mount(ctx.root, h('div', { class: 'sg-page sg-single' },
    h('div', { class: 'sg-brand' }, brandLogo()),
    h('div', { class: 'sg-main' }, h('section', { class: 'card sg-card' },
      h('h1', null, title), h('p', { class: 'sg-lead' }, text), h('div', { class: 'sg-actions' }, actions)))));
}

export const construcao = {
  title: 'Em construção',
  render(ctx) {
    const actions = [];
    if (ctx.hasSession) {
      actions.push(h('button', { class: 'btn lg block', type: 'button', onclick: async () => { await ctx.api.signOut(); ctx.go('#/entrar'); } }, 'Sair'));
    } else {
      actions.push(h('a', { class: 'btn lg block', href: '#/entrar' }, 'Voltar ao início'));
    }
    pagina(ctx, 'Em construção', 'Esta área está em construção.', actions);
  },
};

export const naoencontrada = {
  title: 'Página não encontrada',
  render(ctx) {
    pagina(ctx, 'Página não encontrada', 'Não encontramos esta página.', [h('a', { class: 'btn lg block', href: '#/entrar' }, 'Ir para o início')]);
  },
};

/* ---------- telas privadas (dentro do shell) ---------- */
const ABAS = [['Perfil', '#/conta/perfil'], ['Verificação', '#/conta/verificacao'], ['Segurança', '#/conta/seguranca']];

function abasConta(route) {
  return h('nav', { class: 'tabs', 'aria-label': 'Conta' }, ABAS.map(([rotulo, href]) =>
    h('a', { class: 'tab-link' + (route === href ? ' active' : ''), href, 'aria-current': route === href ? 'page' : null }, rotulo)));
}

/* def: { title, h1, sub, vazio, saida: [rótulo, href] | null, abas, minimal } */
function privada(def) {
  return {
    shell: true,
    minimal: !!def.minimal,
    title: def.title || def.h1,
    render(ctx) {
      const acao = def.saida ? h('a', { class: 'btn', href: def.saida[1] }, def.saida[0]) : null;
      ctx.view.replaceChildren(...[
        pageHead(def.h1, def.sub),
        def.abas ? abasConta(ctx.route) : null,
        emptyState(def.vazio || 'Esta área está em construção.', null, acao),
      ].filter(Boolean));
    },
  };
}

const PARA_DOC = ['Ir para Documentos', '#/documentos'];

export const privadas = {
  documentos: privada({ h1: 'Documentos', sub: 'Aqui ficam os documentos que você enviou e os que precisam da sua assinatura.', saida: ['Ir para Conta', '#/conta/perfil'] }),
  envio: privada({ h1: 'Novo envio', sub: 'Envie um documento para assinatura.', saida: PARA_DOC }),
  plano: privada({ h1: 'Plano e uso', sub: 'Acompanhe o uso do seu plano.', saida: PARA_DOC }),
  conta: privada({ h1: 'Conta', sub: 'Seus dados, verificação e segurança.', saida: PARA_DOC, abas: true }),
  onboarding: privada({ h1: 'Primeiros passos', sub: 'Vamos preparar sua conta.', saida: null, minimal: true }),
  naoencontradaApp: privada({ h1: 'Página não encontrada', sub: 'Não encontramos esta página.', vazio: 'Esta página não existe.', saida: PARA_DOC }),
};
