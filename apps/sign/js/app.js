/* Lottus Sign: entrada. Cria o cliente, trata o link do e-mail (hash) ANTES do roteador e inicia as rotas. */
import { createRouter, ONBOARDING, DEFAULT_AFTER, isAuthHash } from './lib/router.js?v=20261126a';
import * as api from './lib/api.js?v=20261126a';
import { entrar } from './views/entrar.js?v=20261126a';
import { construcao, naoencontrada, privadas } from './views/construcao.js?v=20261126a';
import { perfil } from './views/perfil.js?v=20261126a';

/* R-6: o hash do link do e-mail (#access_token=... ou #error_code=...) nunca é rota. Lê uma vez e apaga. */
function takeAuthHash() {
  const raw = location.hash || '';
  if (!isAuthHash(raw)) return null;
  const p = new URLSearchParams(raw.slice(1));
  const out = { token: p.get('access_token'), refresh: p.get('refresh_token'), type: p.get('type'), error: p.get('error_code') || p.get('error') };
  history.replaceState(null, '', location.pathname + location.search);
  return out;
}

function setHash(h) { history.replaceState(null, '', location.pathname + location.search + h); }

/* B-1: roda no carregamento e em hashchange. Segura o roteador (síncrono) até decidir o destino. */
async function processAuthHash(router) {
  const info = takeAuthHash();
  if (!info) return;
  router.hold();
  try {
    if (info.error || !info.token) {
      router.setFlash('vencido'); setHash('#/entrar');
    } else {
      const before = await api.getSession();
      const res = await api.setSessionFrom(info.token, info.refresh || '');
      /* A10-MA: o link trouxe outro usuário: nada do anterior (nome, e-mail, iniciais, tela) fica no DOM */
      if (!res.error && before && before.user && res.data && res.data.user && res.data.user.id !== before.user.id) router.reset();
      if (res.error) {
        /* B-2: a sessão não abriu; nunca dizer "E-mail confirmado". Recuperação cai no mesmo aviso de link vencido. */
        router.setFlash(info.type === 'recovery' ? 'vencido' : 'invalido'); setHash('#/entrar');
      } else if (info.type === 'recovery') {
        setHash('#/nova-senha');
      } else {
        let feito = false;
        try { feito = !!(await api.me()).onboarding_done; } catch (e) { feito = false; }
        setHash(feito ? DEFAULT_AFTER : ONBOARDING);
      }
    }
  } finally {
    router.release();
  }
}

async function main() {
  const cfg = window.LOTTUS_CONFIG || {};
  api.initApi(cfg);
  const root = document.getElementById('sign');
  const router = createRouter({ root, api, cfg, views: { entrar, construcao, naoencontrada, ...privadas, perfil } });
  /* o listener do hash do Auth vem antes do roteador (B-1) */
  window.addEventListener('hashchange', () => { processAuthHash(router); });
  const pending = processAuthHash(router);
  router.start();
  await pending;
}
main();
