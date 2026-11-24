/* Menu "Soluções": abre ao passar o mouse (CSS), ao clicar ou ao usar o teclado; Esc e clique fora fecham */
(function () {
  var items = document.querySelectorAll('.has-sub');
  if (!items.length) return;
  function close(li) { li.classList.remove('open'); var b = li.querySelector('.sub-toggle'); if (b) b.setAttribute('aria-expanded', 'false'); }
  items.forEach(function (li) {
    var b = li.querySelector('.sub-toggle');
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !li.classList.contains('open');
      items.forEach(close);
      if (open) { li.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
    });
    li.addEventListener('mouseenter', function () { b.setAttribute('aria-expanded', 'true'); });
    li.addEventListener('mouseleave', function () { if (!li.classList.contains('open')) b.setAttribute('aria-expanded', 'false'); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(li); b.focus(); } });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) close(li); });
  });
  document.addEventListener('click', function (e) { items.forEach(function (li) { if (!li.contains(e.target)) close(li); }); });
})();
