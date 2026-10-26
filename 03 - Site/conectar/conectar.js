/* Lottus · Conectar
 * A tela que a plataforma parceira abre para o cliente dela (janela, popup ou link).
 * O token da sessão chega depois do # (não vai para logs de servidor).
 * Fala direto com a função "api" do Supabase: assim o IP registrado na prova é o do cliente.
 */
(function () {
  'use strict';

  // Endereço da função "api" em cada ambiente. Sandbox: preencha com a URL do projeto de sandbox.
  var API = window.LOTTUS_CONECTAR_API || {
    live: 'https://rowhslnnlzfbhmzbylbz.supabase.co/functions/v1/api',
    test: '',
  };

  var REVENUE = [['ate_50k', 'Até R$ 50 mil'], ['50k_200k', 'R$ 50 mil a R$ 200 mil'], ['200k_1m', 'R$ 200 mil a R$ 1 milhão'],
    ['1m_5m', 'R$ 1 milhão a R$ 5 milhões'], ['acima_5m', 'Acima de R$ 5 milhões']];
  var BANKS = [['001', 'Banco do Brasil'], ['033', 'Santander'], ['104', 'Caixa'], ['237', 'Bradesco'], ['341', 'Itaú'],
    ['077', 'Inter'], ['260', 'Nubank'], ['336', 'C6 Bank'], ['208', 'BTG Pactual'], ['756', 'Sicoob'], ['748', 'Sicredi'],
    ['290', 'PagBank'], ['323', 'Mercado Pago'], ['212', 'Banco Original'], ['422', 'Safra'], ['403', 'Cora'], ['197', 'Stone']];
  var SCR_TEXT = 'Autorizo a Lottus e a instituição financeira parceira a consultar e registrar informações da empresa e dos seus sócios no Sistema de Informações de Crédito (SCR) do Banco Central, para a análise de crédito.';

  var app = document.getElementById('app');
  var bar = document.getElementById('progress');
  var token = null, base = null, state = null, busy = false, extra = {};
  var embedded = window.parent !== window || !!window.opener;

  /* ----------------------------------------------------------------- apoio */
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function pct(v) { return (Number(v || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% a.m.'; }
  function date(v) { if (!v) return ''; var p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function cnpj(v) { v = String(v || ''); return v.length === 14 ? v.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5') : v; }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function maskCpf(v) { var d = digits(v).slice(0, 11); return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'); }
  function validCpf(v) {
    var d = digits(v); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i); if (((s * 10) % 11) % 10 !== Number(d[t])) return false; }
    return true;
  }
  // Texto dos contratos (markdown simples: títulos e negrito)
  function docHtml(text) {
    return esc(text).split('\n').map(function (l) {
      var m = l.match(/^#{1,4}\s+(.*)$/);
      if (m) return '<b class="h">' + m[1] + '</b>';
      return l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    }).join('\n').replace(/<\/b>\n/g, '</b>');
  }
  function bankName(b) {
    var known = (BANKS.filter(function (x) { return x[0] === b.bank_code; })[0] || [])[1];
    return known || (b.bank_name && b.bank_name !== 'Banco ' + b.bank_code ? b.bank_name : '');
  }
  function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function read(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function client() {
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* */ }
    return { timezone: tz, locale: navigator.language || '' };
  }
  function post(type, data) {
    var msg = { source: 'lottus-conectar', type: type, session_id: state && state.session ? state.session.id : null };
    if (data) for (var k in data) msg[k] = data[k];
    try { if (window.parent !== window) window.parent.postMessage(msg, '*'); } catch (e) { /* */ }
    try { if (window.opener) window.opener.postMessage(msg, '*'); } catch (e) { /* */ }
  }

  function call(method, path, body) {
    return fetch(base + path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-Lottus-Session': token },
      body: body ? JSON.stringify(Object.assign({ client: client() }, body)) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j.error && j.error.message) || 'Não foi possível concluir agora. Tente de novo.'); e.code = j.error && j.error.code; throw e; }
        return j;
      });
    }, function () { var e = new Error('Sem conexão. Confira sua internet e tente de novo.'); e.code = 'network'; throw e; });
  }

  function progress(i, n) {
    bar.hidden = !n; if (n) bar.firstElementChild.style.width = Math.round((i / n) * 100) + '%';
  }
  function render(html) { app.innerHTML = html; window.scrollTo(0, 0); var f = app.querySelector('[autofocus]'); if (f) f.focus(); }
  function showError(msg) {
    var box = app.querySelector('.error');
    if (!box) { box = document.createElement('div'); box.className = 'error'; box.setAttribute('role', 'alert'); var c = app.querySelector('.card'); (c || app).insertBefore(box, (c || app).firstChild); }
    box.textContent = msg; box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function clearError() { var b = app.querySelector('.error'); if (b) b.remove(); }
  function submitting(btn, on, label) {
    busy = on; if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>' + esc(label || 'Enviando…'); btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
  }
  function act(btn, fn, label) {
    if (busy) return; clearError(); submitting(btn, true, label);
    return Promise.resolve().then(fn).then(function () { submitting(btn, false); }, function (e) {
      submitting(btn, false);
      if (e.code === 'session_expired' || e.code === 'session_invalid' || e.code === 'session_completed') return fatal(e);
      showError(e.message);
    });
  }
  function fatal(e) {
    progress(0, 0);
    if (e.code === 'session_completed') return done(true);
    render('<div class="card"><h1>' + (e.code === 'session_expired' ? 'Este link expirou' : 'Não foi possível abrir') + '</h1>' +
      '<p class="muted">' + esc(e.code === 'session_expired' || e.code === 'session_invalid' ? 'Volte para a plataforma e comece de novo: ela gera um link novo na hora.' : e.message) + '</p>' +
      (embedded ? '<button class="btn ghost" data-close>Fechar</button>' : '') + '</div>');
    post('error', { code: e.code || 'error' });
  }

  /* -------------------------------------------------------------- arquivos */
  function readAsBase64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(file);
    });
  }
  // Foto em JPEG de até 1600 px (o servidor aceita até 5 MB por foto)
  function photoJpeg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file); var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var data = c.toDataURL('image/jpeg', 0.86); res({ b64: data.split(',')[1], preview: data });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Não conseguimos ler esta foto. Tente tirar de novo.')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------ cadastro */
  var ICON = {
    doc: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14.5 10h4M14.5 13.5h3"/></svg>',
    back: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M6 10h12M6 13.5h8"/></svg>',
    face: '<svg viewBox="0 0 24 24"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0114 0"/></svg>',
    file: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  function onboardingStep() {
    var s = state, cs = s.company_state;
    if (!s.consent) return 'intro';
    if (!s.signer) return 'signer';
    var idv = s.signer.identity;
    var expired = idv && idv.valid_until && new Date(idv.valid_until) < new Date();
    if (!idv || idv.status === 'rejected' || expired) return 'identity';
    if (!s.signer.qsa_verified && !cs.power_of_attorney) return 'attorney';
    if (!cs.profile || !cs.contract || !cs.bank || !cs.scr) return 'company';
    if (!cs.agreement) return 'agreement';
    return 'finish';
  }
  var ORDER = ['intro', 'signer', 'identity', 'attorney', 'company', 'agreement'];

  function companyBox() {
    var c = state.company;
    return '<div class="company"><div class="ico">' + esc((c.trade_name || c.legal_name || '?').trim().charAt(0)) + '</div><div><b>' + esc(c.legal_name) +
      '</b><span class="small muted">CNPJ ' + esc(cnpj(c.cnpj)) + (c.city ? ' · ' + esc(c.city) + (c.uf ? '/' + esc(c.uf) : '') : '') + '</span></div></div>';
  }

  function screenIntro() {
    var p = esc(state.partner.name);
    render('<div class="card"><p class="step">Antecipação de recebíveis</p><h1>Receba suas vendas a prazo hoje</h1>' +
      '<p class="muted">O ' + p + ' usa a Lottus para antecipar as notas fiscais da sua empresa. O cadastro leva uns 3 minutos e é feito uma vez só.</p>' +
      companyBox() +
      '<ul class="list"><li><span>1</span>Seus dados e uma foto do seu documento</li><li><span>2</span>Dados da empresa e a conta para receber</li><li><span>3</span>Aceite do contrato com um código no seu e-mail</li></ul>' +
      '<label class="check"><input type="checkbox" id="ok"><span>Autorizo o ' + p + ' a compartilhar com a Lottus os dados da empresa necessários para a análise de antecipação.</span></label>' +
      '<button class="btn rosa" id="go" disabled>Começar</button>' +
      '<p class="small muted" style="margin:12px 0 0">A Lottus não é banco: quem compra os recebíveis e paga a sua empresa é um fundo parceiro, indicado em cada operação.</p></div>');
    var ok = app.querySelector('#ok'), go = app.querySelector('#go');
    ok.onchange = function () { go.disabled = !ok.checked; };
    go.onclick = function () {
      act(go, function () { return call('POST', '/connect/consent', { accepted: true, text: app.querySelector('.check span').textContent }).then(load); });
    };
  }

  function screenSigner() {
    var f = (state.prefill && state.prefill.signer) || {};
    render('<div class="card"><p class="step">Passo 1 de 3</p><h1>Quem vai assinar pela empresa?</h1>' +
      '<p class="muted">Precisa ser sócio(a) ou ter procuração da empresa.</p>' + companyBox() +
      '<form id="f" novalidate>' +
      '<div class="field"><label for="name">Nome completo</label><input class="input" id="name" autocomplete="name" value="' + esc(f.name) + '" required></div>' +
      '<div class="field"><label for="cpf">CPF</label><input class="input" id="cpf" inputmode="numeric" autocomplete="off" value="' + esc(maskCpf(f.cpf)) + '" required></div>' +
      '<div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" autocomplete="email" value="' + esc(f.email) + '" required></div>' +
      '<p class="hint">Os códigos de confirmação chegam neste e-mail.</p>' +
      '<div class="field"><label for="phone">Celular</label><input class="input" id="phone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(f.phone) + '"></div>' +
      '<label class="check"><input type="checkbox" id="terms"><span>Li e aceito os <a href="../termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="../privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a> da Lottus.</span></label>' +
      '<button class="btn rosa" id="go">Continuar</button></form></div>');
    var cpf = app.querySelector('#cpf');
    cpf.oninput = function () { cpf.value = maskCpf(cpf.value); };
    app.querySelector('#f').onsubmit = function (ev) {
      ev.preventDefault();
      var v = { name: app.querySelector('#name').value.trim(), cpf: digits(cpf.value), email: app.querySelector('#email').value.trim(), phone: app.querySelector('#phone').value.trim() };
      if (v.name.split(/\s+/).length < 2) return showError('Informe o nome completo.');
      if (!validCpf(v.cpf)) return showError('Confira o CPF.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return showError('Confira o e-mail.');
      if (!app.querySelector('#terms').checked) return showError('Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
      v.terms_accepted = true;
      act(app.querySelector('#go'), function () { return call('POST', '/connect/signer', v).then(load); });
    };
  }

  function screenIdentity() {
    var idv = state.signer.identity;
    var photos = {};
    render('<div class="card"><p class="step">Passo 1 de 3</p><h1>Foto do documento e selfie</h1>' +
      '<p class="muted">Use a CNH ou o RG de ' + esc(state.signer.name.split(' ')[0]) + '. Fotografe em um lugar claro, sem reflexo.</p>' +
      (idv && idv.status === 'rejected' ? '<div class="note">A foto anterior não pôde ser aceita' + (idv.notes ? ': ' + esc(idv.notes) : '.') + ' Envie de novo.</div>' : '') +
      '<div class="field"><label for="dt">Documento</label><select class="input" id="dt"><option value="cnh">CNH</option><option value="rg">RG</option></select></div>' +
      '<div class="photos">' +
      '<label class="photo" data-k="document_front">' + ICON.doc + 'Frente<input type="file" accept="image/*" capture="environment"></label>' +
      '<label class="photo" data-k="document_back">' + ICON.back + 'Verso<input type="file" accept="image/*" capture="environment"></label>' +
      '<label class="photo" data-k="selfie">' + ICON.face + 'Selfie<input type="file" accept="image/*" capture="user"></label></div>' +
      '<p class="hint">Na selfie, rosto inteiro, sem óculos escuros ou boné.</p>' +
      '<button class="btn rosa" id="go" disabled>Enviar fotos</button></div>');
    var go = app.querySelector('#go');
    app.querySelectorAll('.photo').forEach(function (box) {
      box.querySelector('input').onchange = function (ev) {
        var file = ev.target.files && ev.target.files[0]; if (!file) return;
        photoJpeg(file).then(function (r) {
          photos[box.dataset.k] = r.b64;
          var im = box.querySelector('img') || box.insertBefore(document.createElement('img'), box.firstChild);
          im.src = r.preview; im.alt = ''; box.classList.add('done');
          go.disabled = !(photos.document_front && photos.document_back && photos.selfie);
        }, function (e) { showError(e.message); });
      };
    });
    go.onclick = function () {
      act(go, function () {
        return call('POST', '/connect/identity', { document_type: app.querySelector('#dt').value, document_front: photos.document_front,
          document_back: photos.document_back, selfie: photos.selfie }).then(load);
      }, 'Enviando fotos…');
    };
  }

  function fileField(id, label) {
    return '<label class="file" id="' + id + '">' + ICON.file + '<span><b>' + esc(label) + '</b><br><span class="small muted">PDF ou foto, até 15 MB</span></span><input type="file" accept="application/pdf,image/*"></label>';
  }
  function bindFile(id, holder) {
    var box = app.querySelector('#' + id);
    box.querySelector('input').onchange = function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      if (file.size > 15 * 1024 * 1024) return showError('O arquivo passa de 15 MB.');
      var isImg = /^image\//.test(file.type);
      (isImg ? photoJpeg(file).then(function (r) { return r.b64; }) : readAsBase64(file)).then(function (b64) {
        holder.file = { file_name: isImg ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name, content_base64: b64 };
        box.classList.add('done'); box.querySelector('b').textContent = file.name;
      });
    };
  }

  function screenAttorney() {
    var h = {};
    render('<div class="card"><p class="step">Passo 1 de 3</p><h1>Envie a procuração</h1>' +
      '<p class="muted">Não encontramos ' + esc(state.signer.name.split(' ')[0]) + ' no quadro de sócios da empresa na Receita. Para assinar, envie a procuração que dá esses poderes.</p>' +
      fileField('poa', 'Procuração') + '<div style="height:14px"></div><button class="btn rosa" id="go">Enviar</button></div>');
    bindFile('poa', h);
    app.querySelector('#go').onclick = function (ev) {
      if (!h.file) return showError('Escolha o arquivo da procuração.');
      act(ev.currentTarget, function () { return call('POST', '/connect/company', { document: Object.assign({ kind: 'power_of_attorney' }, h.file) }).then(load); });
    };
  }

  function screenCompany() {
    var cs = state.company_state, pf = state.prefill || {}, pr = pf.profile || {}, bk = pf.bank || {}, h = {};
    var known = BANKS.some(function (b) { return b[0] === bk.bank_code; });
    render('<div class="card"><p class="step">Passo 2 de 3</p><h1>Empresa e conta para receber</h1><p class="muted">Confira os dados. O dinheiro das antecipações cai nesta conta.</p>' +
      '<form id="f" novalidate>' +
      (!cs.profile ? '<div class="field"><label for="rev">Faturamento por mês</label><select class="input" id="rev"><option value="">Escolha</option>' +
        REVENUE.map(function (r) { return '<option value="' + r[0] + '"' + (pr.monthly_revenue === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="days">Prazo médio que seus clientes levam para pagar (dias)</label><input class="input" id="days" inputmode="numeric" value="' + esc(pr.avg_receivable_days || '') + '"></div>' : '') +
      (!cs.contract ? '<div class="field"><label>Contrato social</label>' + fileField('contract', 'Contrato social ou última alteração') + '</div>' : '') +
      (!cs.bank ? '<h2 style="margin-top:6px">Conta no CNPJ da empresa</h2>' +
        '<div class="field"><label for="bank">Banco</label><select class="input" id="bank"><option value="">Escolha</option>' +
        BANKS.map(function (b) { return '<option value="' + b[0] + '"' + (bk.bank_code === b[0] ? ' selected' : '') + '>' + b[0] + ' · ' + b[1] + '</option>'; }).join('') +
        '<option value="outro"' + (bk.bank_code && !known ? ' selected' : '') + '>Outro banco</option></select></div>' +
        '<div class="field" id="otherbox"' + (bk.bank_code && !known ? '' : ' hidden') + '><label for="code">Código do banco (3 números)</label><input class="input" id="code" inputmode="numeric" maxlength="3" value="' + esc(known ? '' : bk.bank_code || '') + '"></div>' +
        '<div class="row-3"><div class="field"><label for="branch">Agência</label><input class="input" id="branch" inputmode="numeric" value="' + esc(bk.branch || '') + '"></div>' +
        '<div class="field"><label for="acc">Conta</label><input class="input" id="acc" inputmode="numeric" value="' + esc(bk.account_number || '') + '"></div>' +
        '<div class="field"><label for="dig">Dígito</label><input class="input" id="dig" maxlength="2" value="' + esc(bk.account_digit || '') + '"></div></div>' : '') +
      (!cs.scr ? '<label class="check"><input type="checkbox" id="scr"><span>' + esc(SCR_TEXT) + '</span></label>' : '') +
      '<button class="btn rosa" id="go">Continuar</button></form></div>');
    if (!cs.contract) bindFile('contract', h);
    var bank = app.querySelector('#bank');
    if (bank) bank.onchange = function () { app.querySelector('#otherbox').hidden = bank.value !== 'outro'; };
    app.querySelector('#f').onsubmit = function (ev) {
      ev.preventDefault();
      var body = {};
      if (!cs.profile) {
        var rev = app.querySelector('#rev').value, days = parseInt(digits(app.querySelector('#days').value), 10);
        if (!rev) return showError('Escolha a faixa de faturamento.');
        if (!(days >= 0 && days <= 365)) return showError('Informe o prazo médio em dias.');
        body.profile = { monthly_revenue: rev, avg_receivable_days: days };
      }
      if (!cs.contract) { if (!h.file) return showError('Envie o contrato social.'); body.document = Object.assign({ kind: 'contract' }, h.file); }
      if (!cs.bank) {
        var code = bank.value === 'outro' ? digits(app.querySelector('#code').value) : bank.value;
        var name = (BANKS.filter(function (b) { return b[0] === code; })[0] || [])[1];
        var b = { bank_code: code, bank_name: name, branch: digits(app.querySelector('#branch').value), account_number: digits(app.querySelector('#acc').value),
                  account_digit: app.querySelector('#dig').value.trim().toUpperCase(), account_type: 'checking' };
        if (!/^\d{3}$/.test(b.bank_code)) return showError('Escolha o banco.');
        if (!b.branch || !b.account_number || !b.account_digit) return showError('Preencha agência, conta e dígito.');
        body.bank = b;
      }
      if (!cs.scr) { if (!app.querySelector('#scr').checked) return showError('A autorização de consulta ao SCR é necessária para a análise de crédito.'); body.scr_consent = true; }
      act(app.querySelector('#go'), function () { return call('POST', '/connect/company', body).then(function (s) { state = s; route(); }); });
    };
  }

  function codeBlock(purpose, sendLabel, confirmLabel) {
    return '<div id="codebox"><button class="btn" id="send">' + esc(sendLabel) + '</button></div>';
  }
  function bindCode(purpose, confirmLabel, onConfirm) {
    var box = app.querySelector('#codebox');
    function ask(to) {
      box.innerHTML = '<p class="small" style="margin:6px 0 0;text-align:center">Enviamos um código de 6 números para <b>' + esc(to) + '</b>.</p>' +
        '<div class="code"><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Código de 6 números" style="width:100%;max-width:240px;letter-spacing:.45em;padding-left:.45em"></div>' +
        '<button class="btn rosa" id="ok" disabled>' + esc(confirmLabel) + '</button>' +
        '<p class="small muted" style="text-align:center;margin:12px 0 0">Não chegou? Veja o lixo eletrônico ou <button class="link" id="again" type="button">enviar de novo</button>.</p>';
      var inp = box.querySelector('#code'), ok = box.querySelector('#ok');
      inp.focus();
      inp.oninput = function () { inp.value = digits(inp.value).slice(0, 6); ok.disabled = inp.value.length !== 6; };
      inp.onkeydown = function (e) { if (e.key === 'Enter' && !ok.disabled) ok.click(); };
      ok.onclick = function () { act(ok, function () { return onConfirm(inp.value); }, 'Confirmando…'); };
      box.querySelector('#again').onclick = function (e) { act(null, function () { return call('POST', '/connect/code', { purpose: purpose }).then(function () { e.target.textContent = 'enviado'; }); }); };
    }
    var send = box.querySelector('#send');
    if (state.code && state.code.sent && state.code.purpose === purpose) return ask(state.code.to);
    send.onclick = function () {
      var gate = app.querySelector('#accept');
      if (gate && !gate.checked) return showError('Marque que leu e aceita o documento.');
      act(send, function () { return call('POST', '/connect/code', { purpose: purpose }).then(function (r) { if (gate) gate.disabled = true; ask(r.to); }); }, 'Enviando código…');
    };
  }

  function screenAgreement() {
    var doc = state.master_agreement;
    if (!doc) return fatal({ code: 'error', message: 'Não foi possível carregar o contrato. Feche e abra de novo.' });
    render('<div class="card"><p class="step">Passo 3 de 3</p><h1>Contrato de cessão</h1>' +
      '<p class="muted">É o contrato que vale para todas as antecipações da ' + esc(state.company.trade_name || state.company.legal_name) + '. Cada antecipação ainda é confirmada por você, com o valor na tela.</p>' +
      '<div class="doc" tabindex="0">' + docHtml(doc.text) + '</div>' +
      '<p class="small muted" style="margin:8px 0 0">' + esc(doc.title || 'Contrato') + ' · versão ' + esc(doc.version) + '</p>' +
      '<label class="check"><input type="checkbox" id="accept"><span>Li e aceito o contrato em nome da empresa.</span></label>' +
      codeBlock('agreement', 'Enviar código para assinar') + '</div>');
    bindCode('agreement', 'Assinar contrato', function (code) {
      return call('POST', '/connect/agreement', { code: code, document_sha256: doc.sha256 }).then(function (r) {
        if (r.completed) return done(false); return load();
      }, function (e) { if (e.code === 'terms_changed') { e.message = 'O contrato foi atualizado agora há pouco. Leia a nova versão.'; load(); } throw e; });
    });
  }

  /* --------------------------------------------------------- antecipação */
  function screenAnticipation() {
    var q = state.quote, t = state.assignment_terms, b = state.bank_account;
    render('<div class="card"><p class="step">Antecipação · ' + esc(state.partner.name) + '</p><h1>Confirme a antecipação</h1>' + companyBox() +
      '<p class="small muted" style="margin:0">Você recebe</p><div class="big">' + brl(q.net) + '</div>' +
      (b ? '<p class="small muted">na conta ' + esc(b.bank_code) + (bankName(b) ? ' · ' + esc(bankName(b)) : '') + ', agência ' + esc(b.branch) + ', final ' + esc(b.account_end) + '</p>' : '') +
      '<ul class="items">' + (q.items || []).map(function (i) {
        return '<li><span><b>NF ' + esc(i.invoice && i.invoice.number) + ' · ' + esc(i.invoice && i.invoice.debtor) + '</b><span class="muted">vence em ' + date(i.due_date) + ' · ' + esc(i.days) + ' dias</span></span><span class="v">' + brl(i.amount) + '</span></li>';
      }).join('') + '</ul>' +
      '<dl class="kv"><dt>Valor das parcelas</dt><dd>' + brl(q.gross) + '</dd><dt>Desconto (' + pct(q.monthly_rate) + ')</dt><dd>− ' + brl(q.discount) + '</dd>' +
      (Number(q.fee) ? '<dt>Tarifa</dt><dd>− ' + brl(q.fee) + '</dd>' : '') + (Number(q.bonus) ? '<dt>Bônus</dt><dd>+ ' + brl(q.bonus) + '</dd>' : '') +
      '<dt class="total">Você recebe</dt><dd class="total">' + brl(q.net) + '</dd></dl>' +
      '<p class="small muted">Custo efetivo de ' + pct(q.effective_monthly_rate) + ' · seus clientes pagam os boletos no vencimento, como sempre.</p>' +
      '<details class="terms"><summary>Ler o Termo de Cessão</summary><div class="doc" tabindex="0">' + docHtml(t.text) + '</div></details>' +
      '<label class="check"><input type="checkbox" id="accept"><span>Li e aceito o Termo de Cessão destes recebíveis.</span></label>' +
      codeBlock('anticipation', 'Enviar código para confirmar') + '</div>');
    bindCode('anticipation', 'Confirmar ' + brl(q.net), function (code) {
      return call('POST', '/connect/confirm', { code: code, document_sha256: t.sha256, expected_net: q.net }).then(function (r) {
        extra = r; return doneAnticipation(r);
      }, function (e) {
        if (e.code === 'terms_changed' || e.code === 'quote_changed') { e.message = 'Os valores mudaram agora há pouco. Confira de novo.'; load(); }
        throw e;
      });
    });
  }

  /* -------------------------------------------------------------- final */
  function backButton() {
    var url = state && state.session && state.session.return_url;
    if (url) return '<button class="btn" id="back">Voltar para ' + esc(state.partner.name) + '</button>';
    if (embedded) return '<button class="btn" data-close>Fechar</button>';
    return '<p class="small muted" style="text-align:center">Pode fechar esta janela.</p>';
  }
  function bindBack(status) {
    var b = app.querySelector('#back');
    if (b) b.onclick = function () {
      var url = state.session.return_url;
      location.href = url + (url.indexOf('?') < 0 ? '?' : '&') + 'lottus_session=' + encodeURIComponent(state.session.id) + '&status=' + status;
    };
  }
  function done(already) {
    progress(1, 1); store('lottus_cs', null);
    render('<div class="card"><div class="done-ico">' + ICON.ok + '</div><h1>' + (already ? 'Tudo certo por aqui' : 'Cadastro enviado') + '</h1>' +
      '<p class="muted">' + (already ? 'Esta etapa já foi concluída.' : 'Agora a Lottus analisa os documentos e o limite de crédito da empresa. Você recebe a resposta por e-mail e no ' + esc(state.partner.name) + ', normalmente em até 1 dia útil.') + '</p>' +
      backButton() + '</div>');
    bindBack('completed');
    post('completed', { type_detail: state && state.session ? state.session.type : null });
  }
  function doneAnticipation(r) {
    progress(1, 1); store('lottus_cs', null);
    render('<div class="card"><div class="done-ico">' + ICON.ok + '</div><h1>Antecipação pedida</h1>' +
      '<p class="muted">Recebemos seu pedido de ' + brl(r.net) + '. Assim que o fundo aprovar, o dinheiro cai na conta da empresa. Você acompanha tudo no ' + esc(state.partner.name) + '.</p>' +
      backButton() + '</div>');
    bindBack('completed');
    post('completed', { operation_id: r.operation_id, net: r.net });
  }

  /* -------------------------------------------------------------- fluxo */
  function route() {
    if (state.session.type === 'anticipation') { progress(0, 0); return screenAnticipation(); }
    var step = onboardingStep();
    if (step === 'finish') return call('POST', '/connect/finish').then(function () { done(false); }, fatal);
    progress(ORDER.indexOf(step) + 0.5, ORDER.length);
    ({ intro: screenIntro, signer: screenSigner, identity: screenIdentity, attorney: screenAttorney, company: screenCompany, agreement: screenAgreement })[step]();
  }
  function load() {
    return call('GET', '/connect/session').then(function (s) { state = s; route(); post('ready'); });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]') || e.target.closest('#close')) { post('closed'); if (window.opener && window.parent === window) window.close(); }
  });
  if (embedded) document.getElementById('close').hidden = false;

  var h = (location.hash || '').replace(/^#/, '');
  if (/^cs_(live|test)_[0-9a-f]{64}$/.test(h)) { token = h; store('lottus_cs', h); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ } }
  else token = read('lottus_cs');
  if (!token) return fatal({ code: 'session_invalid' });
  base = token.indexOf('cs_test_') === 0 ? API.test : API.live;
  if (!base) return fatal({ code: 'error', message: 'O ambiente de testes ainda não está configurado.' });
  load().catch(fatal);
})();
