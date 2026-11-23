// Rolagem suave com Lenis (vendor/lenis.min.js) e âncoras internas.
if (window.Lenis) { var l = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 }); document.documentElement.style.scrollBehavior = 'auto';
  (function f(t) { l.raf(t); requestAnimationFrame(f); })(0);
  document.addEventListener('click', function (e) { var a = e.target.closest('a[href^="#"]'); if (!a) return; var t = document.getElementById(a.getAttribute('href').slice(1));
    if (t) { e.preventDefault(); l.scrollTo(t, { offset: -16, duration: 1.1 }); history.pushState(null, '', a.getAttribute('href')); } }); }
