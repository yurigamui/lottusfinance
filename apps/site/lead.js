/* Formulário "Fale com a Lottus": vira lead no Admin (Comercial › Funil) com a origem da campanha (utm) */
(function () {
  var f = document.getElementById('lead-form');
  if (!f) return;
  var KEY = 'lottus.utm';
  var q = new URLSearchParams(location.search), utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k).slice(0, 80); });
  try { if (Object.keys(utm).length) sessionStorage.setItem(KEY, JSON.stringify(utm)); else utm = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { /* ok */ }
  var msg = document.getElementById('lead-msg');
  var want = q.get('produto'); if (want && f.product && /^(partners|sign|ambos|wealth|invest)$/.test(want)) f.product.value = want;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = Object.fromEntries(new FormData(f).entries());
    if (!d.name || d.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email || '')) { msg.textContent = 'Preencha nome e e-mail.'; msg.className = 'lf-msg err'; return; }
    if (!f.consent.checked) { msg.textContent = 'Marque a autorização de contato para enviar.'; msg.className = 'lf-msg err'; return; }
    var b = f.querySelector('button'); b.disabled = true; msg.textContent = 'Enviando…'; msg.className = 'lf-msg';
    var p = Object.assign({ name: d.name, company: d.company, email: d.email, phone: d.phone, product: d.product, message: d.message, consent: true }, utm);
    var url = 'https://rowhslnnlzfbhmzbylbz.supabase.co/rest/v1/rpc/site_lead', KEYP = 'sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ';
    function send(pl) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEYP }, body: JSON.stringify({ p: pl }) }).then(function (r) { if (!r.ok) { var er = new Error(); er.status = r.status; throw er; } }); }
    // Wealth e Invest: se a função do banco ainda não aceitar o valor, reenvia como "ambos" com o interesse na mensagem
    send(p).catch(function (err) {
      if ((p.product !== 'wealth' && p.product !== 'invest') || err.status !== 400) throw err;
      var q2 = Object.assign({}, p, { product: 'ambos', message: '[Interesse: Lottus ' + (p.product === 'wealth' ? 'Wealth' : 'Invest') + '] ' + (p.message || '') });
      return send(q2);
    }).then(function () { f.reset(); msg.textContent = 'Recebemos sua mensagem. Respondemos em até um dia útil.'; msg.className = 'lf-msg ok'; })
      .catch(function () { msg.textContent = 'Não deu certo agora. Tente de novo ou escreva para contato@lottusfinance.com.br.'; msg.className = 'lf-msg err'; })
      .finally(function () { b.disabled = false; });
  });
})();
