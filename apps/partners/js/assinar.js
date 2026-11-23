/* Lottus Partners — página pública de assinatura (link recebido por e-mail + confirmação de CPF) */
(function () {
  'use strict';
  const cfg = window.LOTTUS_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const root = document.getElementById('sign');
  const token = new URLSearchParams(location.search).get('t') || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtDate = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

  /* Markdown mínimo: títulos, negrito e parágrafos (o texto é sempre escapado antes) */
  function render(text) {
    return esc(text).split(/\n{2,}/).map((blk) => {
      const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
      if (/^# /.test(blk)) return `<h1>${inline(blk.slice(2))}</h1>`;
      const m = /^## (.+?)\n([\s\S]*)$/.exec(blk);
      if (m) return `<h2>${inline(m[1])}</h2><p>${inline(m[2])}</p>`;
      if (/^## /.test(blk)) return `<h2>${inline(blk.slice(3))}</h2>`;
      return `<p>${inline(blk)}</p>`;
    }).join('');
  }
  const shell = (inner) => { root.innerHTML = `<header class="sign-head"><img src="img/logo-rosa.png" alt="Lottus" height="28"></header>${inner}`; };
  const fail = (msg) => shell(`<div class="card sign-card"><h1>Link indisponível</h1><p class="muted">${esc(msg)}</p></div>`);
  const cpfMask = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, (m, a, b, c, d) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : ''));

  async function main() {
    if (!token) return fail('O endereço está incompleto. Abra o link novamente a partir do e-mail.');
    const isCol = token.startsWith('col_');
    const { data, error } = await sb.rpc(isCol ? 'sign_collection_get' : 'sign_public_get', { p_token: token });
    if (error || !data) return fail('Este link não é válido ou foi substituído por um mais recente. Peça um novo envio a quem enviou o documento.');
    if (data.status === 'signed') {
      return shell(`<div class="card sign-card"><div class="sign-ok">✓</div><h1>Documento assinado</h1><p class="muted">${esc(data.title || data.name)} foi assinado em ${esc(fmtDate(data.signed_at))}. Você não precisa fazer mais nada.</p></div>`);
    }
    let docHtml, pdfUrl = null;
    if (isCol) {
      const L = window.LottusPdf;
      const u8 = data.doc ? await L.build({ title: data.doc.title, shortTitle: data.doc.short || data.name, fund: data.fund, code: String(data.sha256 || '').slice(0, 24), text: data.doc.text, inlineSign: data.doc.inline !== false,
        signers: (data.signers || []).map((s) => ({ id: s.id, role: s.role || 'Signatário', name: s.name, doc: L.maskCpf(s.cpf), status: s.status === 'signed' ? 'signed' : 'pending', signed_at: s.signed_at, hash: s.hash, highlight: s.id === data.me })) })
        : L.fromB64(data.pdf_b64);
      pdfUrl = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
      data.title = data.name; data.company = data.message || '';
      docHtml = `<article class="card sign-doc"><iframe class="pdf-frame" src="${pdfUrl}" title="${esc(data.name)}"></iframe><p class="small muted">Não consegue ver o documento? <a href="${pdfUrl}" download="documento.pdf">Baixe o PDF</a>.</p></article>`;
    } else docHtml = `<article class="card sign-doc">${render(data.text)}</article>`;
    shell(`<div class="sign-intro"><div class="small muted">${esc(data.fund)} enviou para ${esc(data.signer)}</div><h1>${esc(data.title)}</h1><div class="small muted">${esc(data.company)}</div></div>
      ${docHtml}
      <form class="card sign-card" id="sf" novalidate>
        <h2 class="u-m0">Assinar eletronicamente</h2>
        <p class="u-m0 small muted">Você está assinando como <b>${esc(data.signer || '')}</b>${data.me_role ? ` (${esc(data.me_role)})` : ''}.</p>
        <div class="field"><label for="cpf">Confirme o seu CPF</label><input class="input" id="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"><div class="ferr" id="err" hidden></div></div>
        <label class="swrow"><span><b>Li e concordo com o documento</b><span class="small">Código do documento: ${esc(String(data.sha256).slice(0, 16))}…</span></span><input type="checkbox" id="ok"></label>
        <button class="btn lg block" id="go" type="button">Assinar documento</button>
        <p class="u-m0 small muted">Registramos data, hora, endereço de IP e aparelho para comprovar a assinatura.</p>
      </form>`);
    const cpf = document.getElementById('cpf'), err = document.getElementById('err'), ok = document.getElementById('ok'), go = document.getElementById('go');
    cpf.addEventListener('input', () => { cpf.value = cpfMask(cpf.value); err.hidden = true; cpf.classList.remove('bad'); });
    const show = (m) => { err.hidden = false; err.textContent = m; cpf.classList.add('bad'); };
    go.onclick = async () => {
      if (cpf.value.replace(/\D/g, '').length !== 11) return show('Informe o CPF completo.');
      if (!ok.checked) return show('Marque que leu e concorda com o documento.');
      go.disabled = true;
      const { data: r, error: e } = await sb.rpc(isCol ? 'sign_collection_submit' : 'sign_public_submit', { p_token: token, p_cpf: cpf.value, p_accept: true });
      go.disabled = false;
      if (e) return show(/too_many/.test(e.message) ? 'Muitas tentativas. Peça um novo link a quem enviou o documento.' : /already_signed/.test(e.message) ? 'Este documento já foi assinado.' : 'Não foi possível assinar agora. Tente de novo.');
      if (!r.ok) return show(r.remaining > 0 ? `Este CPF não confere com o do signatário. Restam ${r.remaining} tentativa(s).` : 'Este CPF não confere. Peça um novo link a quem enviou o documento.');
      const code = String(data.sha256 || '').slice(0, 16);
      shell(`<div class="card sign-card"><div class="sign-ok">✓</div><h1>Documento assinado</h1><p class="muted">Sua assinatura foi registrada em ${esc(fmtDate(r.signed_at))}. Guarde o PDF e o código abaixo para conferir depois.</p>
        <div class="u-g8w row" id="after"><a class="btn secondary" href="verificar.html?c=${encodeURIComponent(code)}">Verificar autenticidade</a></div></div>`);
      if (isCol && window.LottusPdf) {
        // PDF com a sua assinatura já registrada na página de assinaturas
        sb.rpc('sign_collection_get', { p_token: token }).then(({ data: d2 }) => {
          if (!d2 || !d2.doc) return null;
          const L = window.LottusPdf;
          return L.build({ title: d2.doc.title, shortTitle: d2.doc.short || d2.name, fund: d2.fund, code: String(d2.sha256 || '').slice(0, 24), text: d2.doc.text, inlineSign: d2.doc.inline !== false,
            signers: (d2.signers || []).map((x) => ({ id: x.id, role: x.role || 'Signatário', name: x.name, doc: L.maskCpf(x.cpf), status: x.status === 'signed' ? 'signed' : 'pending', signed_at: x.signed_at, hash: x.hash, highlight: x.id === d2.me })) });
        }).then((u8) => {
          if (!u8) return;
          const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
          document.getElementById('after').insertAdjacentHTML('afterbegin', `<a class="btn" href="${url}" download="documento-assinado.pdf">Baixar o PDF</a>`);
        }).catch(() => null);
      }
    };
  }
  main().catch(() => fail('Não foi possível carregar o documento. Tente de novo em instantes.'));
})();
