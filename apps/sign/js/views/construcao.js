/* Telas provisórias: destinos que ainda não existem (1.2, 1.3, Partes 2 a 5) e rota desconhecida. Sempre com saída. */
import { h, mount, brandLogo } from '../lib/ui.js?v=20261124a';

function shell(ctx, title, text, actions) {
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
    shell(ctx, 'Em construção', 'Esta área está em construção.', actions);
  },
};

export const naoencontrada = {
  title: 'Página não encontrada',
  render(ctx) {
    shell(ctx, 'Página não encontrada', 'Não encontramos esta página.', [h('a', { class: 'btn lg block', href: '#/entrar' }, 'Ir para o início')]);
  },
};
