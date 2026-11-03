/* Lottus Partners — peças dos formulários de cadastro: gaveta lateral, controle segmentado, campos com sufixo, validação ao sair do campo */
(function () {
  'use strict';
  const B = window.BO;
  const esc = B.esc;

  B.drawer = function (opts) {
    const el = B.modal(opts);
    el.classList.add('drawer');
    el.parentElement.classList.add('drawer-bd');
    if (B.mask) B.mask.attach(el);
    B.formInit(el);
    el.querySelectorAll('.modal-foot .btn').forEach((b) => { if (b.textContent.trim() === 'Fechar') b.style.display = 'none'; });   // o X do topo já fecha
    return el;
  };

  /* <div class="seg"> com input escondido: B.seg('kind', [[valor, rótulo], …], atual) */
  B.seg = (name, options, value) => `<div class="seg" role="radiogroup" data-seg="${esc(name)}">${options.map(([v, l]) => `<button type="button" role="radio" data-v="${esc(v)}" class="${v === value ? 'on' : ''}" aria-checked="${v === value}">${esc(l)}</button>`).join('')}</div><input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
  B.affix = (inputHtml, { pre, suf } = {}) => `<div class="affix">${pre ? `<span class="pre">${esc(pre)}</span>` : ''}${inputHtml.replace('class="input', `class="input${suf ? ' has-suf' : ''}`)}${suf ? `<span class="suf">${esc(suf)}</span>` : ''}</div>`;

  B.fieldError = (input, msg) => {
    const host = input.closest('.affix') || input;
    let e = host.parentElement.querySelector(':scope > .ferr');
    input.classList.toggle('bad', !!msg);
    if (!msg) { if (e) e.remove(); return; }
    if (!e) { e = document.createElement('div'); e.className = 'ferr'; host.insertAdjacentElement('afterend', e); }
    e.textContent = msg;
  };

  B.formInit = (root) => {
    root.querySelectorAll('[data-seg]').forEach((g) => {
      const hidden = g.nextElementSibling;
      g.querySelectorAll('button').forEach((b) => (b.onclick = () => {
        g.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
        hidden.value = b.dataset.v;
        hidden.dispatchEvent(new Event('input', { bubbles: true })); hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }));
    });
    /* obrigatório: valida ao sair do campo e limpa ao corrigir */
    root.querySelectorAll('[data-req]').forEach((i) => {
      i.addEventListener('blur', () => B.fieldError(i, i.value.trim() ? '' : i.dataset.req || 'Campo obrigatório'));
      i.addEventListener('input', () => { if (i.value.trim()) B.fieldError(i, ''); });
    });
  };
  B.setSeg = (root, name, value) => { const g = root.querySelector(`[data-seg="${name}"]`); if (g) { const b = g.querySelector(`[data-v="${value}"]`); if (b) b.click(); } };
})();
