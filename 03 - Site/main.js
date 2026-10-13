/* Lottus Finance — site institucional: menu, tema, simulador, carrossel e contato */
(function () {
  'use strict';

  /* ------------------------------------------------------------ ajustes */
  const CONFIG = {
    // Taxa usada só no simulador, como exemplo. A taxa de cada empresa sai na análise de crédito.
    taxaExemplo: 0.0189,
    // Endereço que recebe o formulário (ex.: Formspree, uma Edge Function do Supabase). Vazio = mostra a mensagem pronta para copiar.
    formEndpoint: '',
    contatoEmail: 'contato@lottusfinance.com.br',
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /* ---------------------------------------------------------- cabeçalho */
  const header = $('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const toggle = $('.nav-toggle', header);
    if (toggle) toggle.addEventListener('click', () => {
      const open = header.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('.nav-links a', header).forEach((a) => a.addEventListener('click', () => header.classList.remove('open')));
  }

  // Site só no tema claro: limpa escolhas antigas de tema
  try { localStorage.removeItem('lottus.site.theme'); } catch (e) { /* ok */ }
  document.documentElement.removeAttribute('data-theme');

  /* ---------------------------------------------------------- simulador */
  const sim = $('#simulador');
  if (sim) {
    const range = $('#sim-valor', sim);
    let dias = 60;
    const render = () => {
      const v = Number(range.value);
      const min = Number(range.min), max = Number(range.max);
      range.style.setProperty('--p', ((v - min) / (max - min)) * 100 + '%');
      const custo = v * CONFIG.taxaExemplo * (dias / 30);
      const liquido = v - custo;
      $('#sim-valor-out', sim).textContent = brl(v);
      $('#sim-liquido', sim).textContent = brl(liquido);
      $('#sim-face', sim).textContent = brl(v);
      $('#sim-custo', sim).textContent = '− ' + brl(custo);
      $('#sim-dias', sim).textContent = dias + ' dias';
      $('#sim-taxa', sim).textContent = (CONFIG.taxaExemplo * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '% ao mês';
      $('#sim-bar-net', sim).style.width = (liquido / v) * 100 + '%';
      $('#sim-bar-cost', sim).style.width = (custo / v) * 100 + '%';
    };
    range.addEventListener('input', render);
    $$('[data-dias]', sim).forEach((b) => b.addEventListener('click', () => {
      dias = Number(b.dataset.dias);
      $$('[data-dias]', sim).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));
    render();
  }

  /* ---------------------------------------------- carrossel (um por vez) */
  $$('.carousel').forEach((car) => {
    const slides = $$('.slide', car), tabs = $$('[role="tab"]', car);
    let i = 0, timer = null;
    const go = (n, user) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => { s.classList.toggle('active', k === i); s.setAttribute('aria-hidden', String(k !== i)); s.inert = k !== i; });
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      if (user) stop();
    };
    const stop = () => { clearInterval(timer); timer = null; };
    tabs.forEach((t, k) => t.addEventListener('click', () => go(k, true)));
    const prev = $('[data-prev]', car), next = $('[data-next]', car);
    if (prev) prev.addEventListener('click', () => go(i - 1, true));
    if (next) next.addEventListener('click', () => go(i + 1, true));
    car.addEventListener('keydown', (e) => {
      if (e.target.getAttribute('role') !== 'tab') return;
      if (e.key === 'ArrowRight') { go(i + 1, true); tabs[i].focus(); }
      if (e.key === 'ArrowLeft') { go(i - 1, true); tabs[i].focus(); }
    });
    go(0);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      timer = setInterval(() => go(i + 1), 7000);
      car.addEventListener('pointerenter', stop);
      car.addEventListener('focusin', stop);
    }
  });

  /* ------------------------------------------------------ copiar texto */
  const copyText = async (text, btn) => {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent; btn.textContent = 'Copiado'; setTimeout(() => (btn.textContent = old), 1600);
    } catch (e) {
      const target = btn.previousElementSibling || btn.parentElement;
      const r = document.createRange(); r.selectNodeContents(target);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      btn.textContent = 'Selecionado';
    }
  };
  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, b)));

  /* ------------------------------------------------------------ contato */
  const form = $('#contato-form');
  if (form) {
    const fields = $$('[data-required]', form);
    const check = (f) => {
      const input = $('input, select, textarea', f);
      let ok = input.type === 'checkbox' ? input.checked : input.value.trim().length > 0;
      if (ok && input.type === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
      if (ok && input.name === 'cnpj') ok = input.value.replace(/\D/g, '').length === 14;
      f.classList.toggle('invalid', !ok);
      return ok;
    };
    fields.forEach((f) => $('input, select, textarea', f).addEventListener('blur', () => check(f)));
    const cnpj = $('[name="cnpj"]', form);
    if (cnpj) cnpj.addEventListener('input', () => {
      const d = cnpj.value.replace(/\D/g, '').slice(0, 14);
      cnpj.value = d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    });
    const tel = $('[name="telefone"]', form);
    if (tel) tel.addEventListener('input', () => {
      const d = tel.value.replace(/\D/g, '').slice(0, 11);
      tel.value = d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3')
        : d.replace(/^(\d{2})(\d{0,4})(\d{0,4}).*/, (m, a, b, c) => (a ? `(${a}` : '') + (b ? `) ${b}` : '') + (c ? `-${c}` : ''));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bad = fields.filter((f) => !check(f));
      if (bad.length) { $('input, select, textarea', bad[0]).focus(); return; }
      const data = Object.fromEntries(new FormData(form).entries());
      data.assunto = $$('[name="assunto"]:checked', form).map((x) => x.value).join(', ') || 'Contato';
      const btn = $('button[type="submit"]', form);
      const done = $('#form-done');
      const summary = `Assunto: ${data.assunto}\nNome: ${data.nome}\nEmpresa: ${data.empresa || '—'}\nCNPJ: ${data.cnpj || '—'}\nE-mail: ${data.email}\nTelefone: ${data.telefone || '—'}\nFaturamento mensal: ${data.faturamento || '—'}\n\n${data.mensagem || ''}`;
      if (CONFIG.formEndpoint) {
        btn.disabled = true; btn.textContent = 'Enviando…';
        try {
          const r = await fetch(CONFIG.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          if (!r.ok) throw new Error(String(r.status));
          form.hidden = true;
          $('#done-title').textContent = 'Recebemos sua mensagem';
          $('#done-text').textContent = 'Uma pessoa do nosso time responde em até 1 dia útil, no e-mail que você informou.';
          $('#done-copy').hidden = true;
          done.hidden = false;
        } catch (err) {
          btn.disabled = false; btn.textContent = 'Enviar mensagem';
          $('#form-error').hidden = false;
        }
        return;
      }
      // Sem endereço configurado: a mensagem fica pronta para copiar e mandar por e-mail.
      form.hidden = true;
      $('#done-summary').textContent = summary;
      $('[data-copy-summary]').dataset.copy = summary;
      $('[data-copy-summary]').onclick = (ev) => copyText(summary, ev.currentTarget);
      done.hidden = false;
      done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const again = $('#form-again');
    if (again) again.addEventListener('click', () => { form.reset(); form.hidden = false; $('#form-done').hidden = true; });
  }

  // Ano no rodapé
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
})();

/* Selos das lojas e ícones das redes: usa o arquivo oficial quando ele existe em img/ */
(function () {
  document.querySelectorAll('.badge-img, .social-img').forEach(function (img) {
    var show = function () {
      if (!img.naturalWidth) return;
      img.hidden = false;
      var a = img.closest('a'); if (a) a.classList.add('has-img');
    };
    if (img.complete) show(); else img.addEventListener('load', show);
  });

  // Menu: marca a seção visível
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
  var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
  if (!('IntersectionObserver' in window) || !targets.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id); });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  targets.forEach(function (t) { io.observe(t); });
})();

/* Celular do topo: ao rolar, ele desce junto com a página e "pousa" ao lado do texto da seção seguinte */
(function () {
  var wrap = document.querySelector('.hero-phone');
  var intro = document.querySelector('#sobre .stack-lg');
  var cards = document.querySelector('#sobre .mini-cards');
  if (!wrap || !intro || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var phone = wrap.querySelector('.phone');
  var desktop = window.matchMedia('(min-width: 1041px)');
  var target = 0, ticking = false;
  var measure = function () {
    phone.style.setProperty('--py', '0px');
    if (!desktop.matches) { target = 0; return; }
    var p = phone.getBoundingClientRect();
    // para com a base do celular logo acima dos cartões da seção "Sobre" (o texto fica à esquerda dele)
    var stop = cards ? cards.getBoundingClientRect().top - 64 : intro.getBoundingClientRect().bottom;
    target = Math.max(0, stop - p.bottom);
  };
  var update = function () {
    ticking = false;
    var y = Math.max(window.scrollY, 0);
    var py = desktop.matches ? Math.min(y, target) : Math.min(y * 0.15, 60);
    phone.style.setProperty('--py', py.toFixed(1) + 'px');
  };
  var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  var refresh = function () { var y = window.scrollY; measure(); update(); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', refresh);
  window.addEventListener('load', refresh);
  refresh();
})();