/* Menu "Soluções": abre ao passar o mouse (CSS), ao clicar ou pelo teclado (Enter/Espaço); Esc, clique fora e sair do foco fecham */
(function () {
  var items = document.querySelectorAll('.has-sub');
  if (!items.length) return;
  var mobile = window.matchMedia('(max-width: 820px)');
  function sync(li) { var b = li.querySelector('.sub-toggle'); if (b) b.setAttribute('aria-expanded', String(mobile.matches || li.classList.contains('open') || li.matches(':hover'))); }
  function close(li) { li.classList.remove('open'); sync(li); }
  function layout() {
    items.forEach(function (li) {
      var b = li.querySelector('.sub-toggle'); if (!b) return;
      if (mobile.matches) { b.setAttribute('tabindex', '-1'); b.setAttribute('aria-disabled', 'true'); } else { b.removeAttribute('tabindex'); b.removeAttribute('aria-disabled'); }
      sync(li);
    });
  }
  items.forEach(function (li) {
    var b = li.querySelector('.sub-toggle');
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mobile.matches) return;
      var open = !li.classList.contains('open');
      items.forEach(close);
      if (open) li.classList.add('open');
      sync(li);
    });
    li.addEventListener('mouseenter', function () { sync(li); });
    li.addEventListener('mouseleave', function () { setTimeout(function () { sync(li); }, 0); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(li); b.focus(); } });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) close(li); });
  });
  document.addEventListener('click', function (e) { items.forEach(function (li) { if (!li.contains(e.target)) close(li); }); });
  if (mobile.addEventListener) mobile.addEventListener('change', layout); else if (mobile.addListener) mobile.addListener(layout);
  layout();
})();
