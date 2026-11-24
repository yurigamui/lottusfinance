(function () {
  var token = new URLSearchParams(location.search).get('t');
  var t = document.getElementById('t'), p = document.getElementById('p'), b = document.getElementById('b');
  if (!/^[0-9a-f-]{36}$/i.test(token || '')) { t.textContent = 'Link inválido'; p.textContent = 'Use o link que veio no final do e-mail.'; b.hidden = true; return; }
  b.onclick = function () {
    b.disabled = true;
    fetch('https://rowhslnnlzfbhmzbylbz.supabase.co/rest/v1/rpc/mkt_unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ' },
      body: JSON.stringify({ p_token: token })
    }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (ok) {
      if (!ok) throw new Error();
      t.textContent = 'Pronto, você saiu da lista'; p.textContent = 'Não enviaremos mais e-mails de campanha para este endereço.'; b.hidden = true;
    }).catch(function () { t.textContent = 'Não deu certo'; p.textContent = 'Tente de novo em instantes ou responda o e-mail pedindo para sair.'; b.disabled = false; });
  };
})();
