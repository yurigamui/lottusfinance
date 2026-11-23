(function () {
  // Projeto Supabase da Lottus (chave publicável: pode ficar no site)
  var FN = 'https://rowhslnnlzfbhmzbylbz.supabase.co/functions/v1/cession-ack';
  var KEY = 'sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ';
  var box = document.getElementById('box');
  var token = new URLSearchParams(location.search).get('t') || '';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var brl = function (v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var date = function (v) { if (!v) return '—'; var p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  var dt = function (v) { return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
  var doc = function (v) { var s = String(v || ''); return s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : s; };
  function call(body) {
    return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'erro'); return j; }); });
  }
  function fail(msg) { box.innerHTML = '<div class="err">' + esc(msg) + '</div><p class="muted" style="margin-top:12px">Se precisar, escreva para contato@lottusfinance.com.br.</p>'; }
  if (!/^[0-9a-f]{64}$/.test(token)) return fail('Este link não é válido. Abra o botão do e-mail mais recente que você recebeu.');
  call({ action: 'view', token: token }).then(function (n) {
    var text = String(n.text || '').split(/\n{2,}/).filter(function (b) { return b && b.indexOf('# ') !== 0; })
      .map(function (b) { return '<p>' + esc(b).replace(/\n/g, '<br>') + '</p>'; }).join('');
    var rows = (n.items || []).map(function (x) {
      return '<tr><td>NF-e ' + esc(x.nfe || '—') + ' · parc. ' + esc(x.installment || '') + '</td><td>' + date(x.due_date) + '</td><td class="num"><b>' + brl(x.amount) + '</b></td></tr>';
    }).join('');
    box.innerHTML =
      '<div class="eyebrow">Notificação de cessão de crédito</div>' +
      '<h1>' + esc(n.assignor && n.assignor.name) + ' cedeu duplicatas emitidas contra a sua empresa</h1>' + text +
      '<table><thead><tr><th>Duplicata</th><th>Vencimento</th><th class="num">Valor</th></tr></thead><tbody>' + rows +
      '<tr><td colspan="2"><b>Total</b></td><td class="num"><b>' + brl(n.total) + '</b></td></tr></tbody></table>' +
      '<div class="pay"><b>Confira sempre o beneficiário do Pix:</b> ' + esc(n.beneficiary && n.beneficiary.name) + ', CNPJ ' + esc(doc(n.beneficiary && n.beneficiary.document)) +
      '. Não pague Pix ou boletos com outro beneficiário nem faça depósitos para o Cedente referentes a estas duplicatas.</div>' +
      '<div id="ack"></div><p class="muted" style="margin-top:16px">Código da notificação: ' + esc(n.code) + '</p>';
    var ack = document.getElementById('ack');
    var paintDone = function (at, name) {
      ack.innerHTML = '<div class="done"><span aria-hidden="true">✓</span><div><b>Recebimento confirmado</b><br>' + (name ? esc(name) + ', em ' : 'Em ') + dt(at) + '. Obrigado!</div></div>';
    };
    if (n.acknowledged_at) return paintDone(n.acknowledged_at, n.ack_name);
    ack.innerHTML = '<form class="ack" id="f"><label for="nm">Seu nome (opcional)</label><input id="nm" autocomplete="name" placeholder="Quem está confirmando">' +
      '<button type="submit">Confirmar recebimento</button><span class="muted">Ao confirmar, você declara que recebeu esta notificação. Isso não altera valores nem vencimentos.</span></form>';
    document.getElementById('f').onsubmit = function (e) {
      e.preventDefault();
      var b = this.querySelector('button'); b.disabled = true; b.textContent = 'Confirmando…';
      call({ action: 'confirm', token: token, name: document.getElementById('nm').value }).then(function (r) { paintDone(r.acknowledged_at, r.ack_name); })
        .catch(function () { b.disabled = false; b.textContent = 'Confirmar recebimento'; alert('Não deu certo agora. Tente de novo em instantes.'); });
    };
  }).catch(function (e) { fail(e.message === 'not_found' ? 'Este link não vale mais. Use o botão do e-mail mais recente que você recebeu.' : 'Não conseguimos abrir a notificação agora. Tente de novo em instantes.'); });
})();
