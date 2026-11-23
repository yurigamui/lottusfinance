(function () {
  // Função pública da Lottus (não precisa de login; o link é a credencial)
  var FN = 'https://rowhslnnlzfbhmzbylbz.supabase.co/functions/v1/pix-charge';
  var box = document.getElementById('box');
  var qs = new URLSearchParams(location.search);
  var token = qs.get('t') || qs.get('e') || qs.get('q') || '';
  var mode = qs.get('e') ? 'e' : qs.get('q') ? 'q' : 't';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var brl = function (v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var date = function (v) { if (!v) return '—'; var p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  var doc = function (v) { var s = String(v || '').replace(/\D/g, ''); return s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : s; };
  var pctTxt = function (v) { return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'; };
  function fail(msg) { box.innerHTML = '<div class="err">' + esc(msg) + '</div>'; }
  function qrSvg(text) {
    if (!window.qrcode) return '';
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" role="img" aria-label="QR Code do Pix"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#231c1a"/></svg>';
  }
  function pixBlock(pix) {
    return '<div class="qr">' + qrSvg(pix) + '</div>' +
      '<div class="code" id="code">' + esc(pix) + '</div>' +
      '<button id="copy" type="button">Copiar Pix copia e cola</button>' +
      '<p class="muted" style="margin:10px 0 0">No app do banco: Pix → Pagar com QR Code ou Pix copia e cola.</p>';
  }
  function wireCopy(pix) {
    var b = document.getElementById('copy'); if (!b) return;
    b.onclick = function () {
      var ok = function () { b.textContent = 'Copiado'; setTimeout(function () { b.textContent = 'Copiar Pix copia e cola'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(pix).then(ok, function () { prompt('Copie o código:', pix); });
      else prompt('Copie o código:', pix);
    };
  }
  if (!/^[0-9a-f]{64}$/.test(token)) return fail('Este link não é válido. Use o link ou o QR Code da cobrança mais recente.');
  fetch(FN + '?format=json&' + mode + '=' + token, { cache: 'no-store' })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'erro'); return j; }); })
    .then(function (c) {
      var benef = '<dl><dt>Beneficiário</dt><dd>' + esc(c.beneficiary_name) + '<br><span class="muted">CNPJ ' + esc(doc(c.beneficiary_cnpj)) + '</span></dd>' +
        '<dt>Duplicata</dt><dd>NF-e ' + esc(c.nfe || '—') + ' · parcela ' + esc(c.installment || '') + '</dd>' +
        '<dt>Vencimento</dt><dd>' + date(c.due_date) + '</dd>';
      if (c.kind === 'quitacao') {
        document.getElementById('kind').textContent = 'Quitação antecipada';
        var who = '<dl><dt>Beneficiário</dt><dd>' + esc(c.beneficiary_name) + '<br><span class="muted">CNPJ ' + esc(doc(c.beneficiary_cnpj)) + '</span></dd>';
        if (c.status === 'paid') {
          box.innerHTML = '<div class="done"><span aria-hidden="true">✓</span><div><b>Operação quitada</b><br>Pagamento registrado em ' + date(c.paid_at) + '. Não pague de novo.</div></div>' + who + '</dl>';
          return;
        }
        if (c.status !== 'open') { fail('Não há valor em aberto para quitar nesta operação.'); return; }
        var qt = c.quote || {}, its = qt.items || [];
        var rows = its.map(function (i) {
          return '<span>NF-e ' + esc(i.invoice_number || '—') + ' · ' + esc(i.number || '') + (i.overdue_days > 0 ? ' <span class="warn">· vencida há ' + i.overdue_days + ' dias</span>' : ' · vence ' + date(i.due_date)) + '</span><span>' + brl(i.present_value) + '</span>';
        }).join('');
        box.innerHTML = '<div class="eyebrow">Quitação antecipada · ' + esc(c.assignor_name) + '</div>' +
          '<h1>' + brl(c.amount) + '</h1>' +
          '<p class="sub">Valor de hoje, ' + date(qt.as_of) + '. Este Pix vale até 23h59; amanhã o link mostra o valor novo.</p>' +
          (c.pix ? pixBlock(c.pix) : '<div class="note">O Pix ainda não está disponível. Fale com o fundo.</div>') +
          (rows ? '<div class="split">' + rows + '</div>' : '') +
          who + (Number(qt.savings) > 0 ? '<dt>Desconto pela antecipação</dt><dd>' + brl(qt.savings) + '</dd>' : '') +
          (Number(qt.late_fees) > 0 ? '<dt>Multa e juros incluídos</dt><dd>' + brl(qt.late_fees) + '</dd>' : '') + '</dl>' +
          '<div class="note">As duplicatas a vencer entram pelo valor presente, com desconto pela taxa da operação. As vencidas entram pelo valor cheio com a multa e os juros de mora de hoje. Confira o nome e o CNPJ do beneficiário no app do banco antes de confirmar.</div>';
        if (c.pix) wireCopy(c.pix);
        return;
      }
      if (c.kind === 'cedente') {
        document.getElementById('kind').textContent = 'Encargos do atraso';
        if (c.status === 'paid') {
          box.innerHTML = '<div class="done"><span aria-hidden="true">✓</span><div><b>Encargos pagos</b><br>Recebidos pelo fundo em ' + date(c.paid_at) + '. Obrigado!</div></div>' + benef + '</dl>';
          return;
        }
        box.innerHTML = '<div class="eyebrow">Encargos do atraso · ' + esc(c.assignor_name) + '</div>' +
          '<h1>' + brl(c.total) + '</h1>' +
          '<p class="sub">Valor de hoje. ' + (c.running ? 'O cliente ainda não pagou: os juros correm até o pagamento.' : 'O cliente pagou com ' + c.days + ' dias de atraso.') + '</p>' +
          '<div class="split"><span>Multa (' + pctTxt(c.fine_percent) + ')</span><span>' + brl(c.fine) + '</span>' +
          '<span>Juros de mora (' + pctTxt(c.interest_monthly_percent) + ' ao mês · ' + c.days + ' dias)</span><span>' + brl(c.interest) + '</span></div>' +
          (c.pix ? pixBlock(c.pix) : '<div class="note">O Pix ainda não está disponível. Fale com o fundo.</div>') +
          benef + '<dt>Valor da duplicata</dt><dd>' + brl(c.face) + '</dd></dl>' +
          '<div class="note">Depois do vencimento, a multa e os juros de mora da duplicata são do cedente. Confira o nome e o CNPJ do beneficiário no app do banco antes de confirmar.</div>';
        if (c.pix) wireCopy(c.pix);
        return;
      }
      document.getElementById('kind').textContent = 'Cobrança da duplicata';
      if (c.status === 'paid') {
        box.innerHTML = '<div class="done"><span aria-hidden="true">✓</span><div><b>Esta duplicata já foi paga</b><br>Pagamento registrado em ' + date(c.paid_at) + '. Não pague de novo.</div></div>' + benef + '<dt>Valor</dt><dd>' + brl(c.amount) + '</dd></dl>';
        return;
      }
      if (c.status === 'cancelled') { fail('Esta cobrança foi cancelada. Fale com o beneficiário antes de pagar.'); return; }
      var late = c.status === 'overdue';
      box.innerHTML = '<div class="eyebrow">Cobrança Pix · vendida por ' + esc(c.assignor_name) + '</div>' +
        '<h1>' + brl(c.amount) + '</h1>' +
        '<p class="sub">' + (late ? '<span class="warn">Venceu em ' + date(c.due_date) + '.</span> Pague hoje o valor da duplicata.' : 'Vence em ' + date(c.due_date) + '.') + '</p>' +
        (c.pix ? pixBlock(c.pix) : '') +
        benef + '<dt>Pagador</dt><dd>' + esc(c.payer_name || '') + '</dd></dl>' +
        '<div class="note"><b>Pague somente a este beneficiário.</b> Esta duplicata foi cedida a ' + esc(c.beneficiary_name) + '; pagamento a outra pessoa, inclusive ao vendedor, não quita o título. Confira o nome no app do banco antes de confirmar.</div>' +
        (c.pdf_url ? '<a class="btn ghost" href="' + esc(c.pdf_url) + '" target="_blank" rel="noopener">Baixar a cobrança em PDF</a>' : '');
      if (c.pix) wireCopy(c.pix);
    })
    .catch(function (e) { fail(e.message === 'not_found' ? 'Não encontramos esta cobrança. Use o link ou o QR Code mais recente.' : 'Não conseguimos abrir a cobrança agora. Tente de novo em instantes.'); });
})();
