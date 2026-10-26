/* Lottus Conectar — script para a plataforma parceira abrir a tela da Lottus dentro do produto.
 *
 *   <script src="https://lottusfinance.com.br/conectar/lottus.js"></script>
 *   LottusConectar.open(session.url, {
 *     onComplete: (e) => { ... },   // { session_id, operation_id? }
 *     onClose: () => { ... },
 *   });
 *
 * session.url vem de POST /v1/connect/sessions ou POST /v1/anticipations (no seu servidor).
 * Em celular a janela ocupa a tela toda. Sem JavaScript, abra session.url numa nova aba ou redirecione.
 */
(function () {
  'use strict';
  var current = null;

  function close(notify) {
    if (!current) return;
    var c = current; current = null;
    window.removeEventListener('message', c.onMessage);
    document.removeEventListener('keydown', c.onKey);
    document.documentElement.style.overflow = c.overflow;
    c.root.remove();
    if (notify && c.opts.onClose) c.opts.onClose();
  }

  function open(url, opts) {
    opts = opts || {};
    if (typeof url !== 'string' || !/^https:\/\/[^/]+\/conectar\/#cs_(live|test)_[0-9a-f]{64}$/.test(url)) throw new Error('LottusConectar: url inválida');
    close(false);
    var origin = new URL(url).origin;
    var root = document.createElement('div');
    root.setAttribute('data-lottus-conectar', '');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(31,26,23,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    var frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'Lottus · Antecipação de recebíveis';
    frame.allow = 'camera';
    var small = window.matchMedia('(max-width: 640px)').matches;
    frame.style.cssText = 'border:0;background:#f5f0e8;box-shadow:0 24px 60px rgba(0,0,0,.3);' +
      (small ? 'position:fixed;inset:0;width:100%;height:100%;border-radius:0' : 'width:100%;max-width:520px;height:min(760px,calc(100vh - 32px));border-radius:24px');
    root.appendChild(frame);
    root.addEventListener('click', function (e) { if (e.target === root) close(true); });
    var c = {
      root: root, opts: opts, overflow: document.documentElement.style.overflow,
      onMessage: function (e) {
        if (e.origin !== origin || !e.data || e.data.source !== 'lottus-conectar') return;
        if (opts.onEvent) opts.onEvent(e.data);
        if (e.data.type === 'completed' && opts.onComplete) opts.onComplete(e.data);
        if (e.data.type === 'closed') close(true);
      },
      onKey: function (e) { if (e.key === 'Escape') close(true); },
    };
    current = c;
    window.addEventListener('message', c.onMessage);
    document.addEventListener('keydown', c.onKey);
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(root);
    return { close: function () { close(false); } };
  }

  window.LottusConectar = { open: open, close: function () { close(false); } };
})();
