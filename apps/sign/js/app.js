/* Lottus Sign: entrada. Cria o cliente, trata o link do e-mail (hash) ANTES do roteador e inicia as rotas. */
import { createRouter, ONBOARDING } from './lib/router.js?v=20261124a';
import * as api from './lib/api.js?v=20261124a';
import { entrar } from './views/entrar.js?v=20261124a';
import { construcao, naoencontrada } from './views/construcao.js?v=20261124a';

/* R-6: o hash do link do e-mail (#access_token=... ou #error_code=...) nunca é rota. Lê uma vez e apaga. */
function takeAuthHash() {
  const raw = location.hash || '';
  if (raw.length < 2 || raw.startsWith('#/')) return null;
  const p = new URLSearchParams(raw.slice(1));
  if (!(p.get('access_token') || p.get('error_code') || p.get('error'))) return null;
  const out = { token: p.get('access_token'), refresh: p.get('refresh_token'), type: p.get('type'), error: p.get('error_code') || p.get('error') };
  history.replaceState(null, '', location.pathname + location.search);
  return out;
}

function setHash(h) { history.replaceState(null, '', location.pathname + location.search + h); }

async function main() {
  const cfg = window.LOTTUS_CONFIG || {};
  api.initApi(cfg);
  const root = document.getElementById('sign');
  const router = createRouter({ root, api, cfg, views: { entrar, construcao, naoencontrada } });

  const hashInfo = takeAuthHash();
  if (hashInfo) {
    if (hashInfo.error || !hashInfo.token) {
      router.setFlash('vencido'); setHash('#/entrar');
    } else {
      const res = await api.setSessionFrom(hashInfo.token, hashInfo.refresh || '');
      if (hashInfo.type === 'recovery') {
        if (res.error) { router.setFlash('vencido'); setHash('#/entrar'); } else setHash('#/nova-senha');
      } else if (res.error) {
        router.setFlash('confirmado'); setHash('#/entrar');
      } else {
        setHash(ONBOARDING);
      }
    }
  }
  router.start();
}
main();
