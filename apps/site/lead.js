/* Formulário "Fale com a Lottus": vira lead no Admin (Comercial › Funil) com a origem da campanha (utm) */
(function () {
  var f = document.getElementById('lead-form');
  if (!f) return;
  var KEY = 'lottus.utm';
  var q = new URLSearchParams(location.search), utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k).slice(0, 80); });
  try { if (Object.keys(utm).length) sessionStorage.setItem(KEY, JSON.stringify(utm)); else utm = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { /* ok */ }
  var msg = document.getElementById('lead-msg');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = Object.fromEntries(new FormData(f).entries());
    if (!d.name || d.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email || '')) { msg.textContent = 'Preencha nome e e-mail.'; msg.className = 'lf-msg err'; return; }
    if (!f.consent.checked) { msg.textContent = 'Marque a autorização de contato para enviar.'; msg.className = 'lf-msg err'; return; }
    var b = f.querySelector('button'); b.disabled = true; msg.textContent = 'Enviando…'; msg.className = 'lf-msg';
    var p = Object.assign({ name: d.name, company: d.company, email: d.email, phone: d.phone, product: d.product, message: d.message, consent: true }, utm);
    fetch('https://rowhslnnlzfbhmzbylbz.supabase.co/rest/v1/rpc/site_lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ' }, body: JSON.stringify({ p: p })
    }).then(function (r) { if (!r.ok) throw new Error(); f.reset(); msg.textContent = 'Recebemos sua mensagem. Respondemos em até um dia útil.'; msg.className = 'lf-msg ok'; })
      .catch(function () { msg.textContent = 'Não deu certo agora. Tente de novo ou escreva para contato@lottusfinance.com.br.'; msg.className = 'lf-msg err'; })
      .finally(function () { b.disabled = false; });
  });
})();
