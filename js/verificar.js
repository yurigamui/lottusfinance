/* Lottus Sign — verificação pública de documentos pelo código (hash) impresso no rodapé de cada página */
(function () {
  'use strict';
  const cfg = window.LOTTUS_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const root = document.getElementById('sign');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) : '');
  const cpfMask = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, (m, a, b, c, d) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : ''));
  const shell = (inner) => { root.innerHTML = `<header class="sign-head"><img src="img/logo-rosa.png" alt="Lottus" height="28"></header>${inner}`; };
  const code0 = new URLSearchParams(location.search).get('c') || '';

  function form(msg) {
    shell(`<div class="sign-intro"><h1>Verificar documento</h1><p class="muted">Digite o código impresso no rodapé do documento (“Código do documento”) para conferir se ele é autêntico e quem já assinou.</p></div>
      <form class="card sign-card" id="vf" novalidate><div class="field"><label for="code">Código do documento</label><input class="input" id="code" autocomplete="off" spellcheck="false" placeholder="Ex.: 3f9a1c0d7b2e4a58…" value="${esc(code0)}"><div class="ferr" id="err" ${msg ? '' : 'hidden'}>${esc(msg || '')}</div></div>
      <button class="btn lg block" id="go" type="submit">Verificar</button></form>`);
    const f = document.getElementById('vf');
    f.onsubmit = (e) => { e.preventDefault(); check(document.getElementById('code').value); };
  }

  async function check(code) {
    const clean = String(code || '').replace(/[^0-9a-fA-F]/g, '');
    if (clean.length < 16) return form('Informe pelo menos 16 caracteres do código.');
    const { data, error } = await sb.rpc('verify_collection', { p_code: clean });
    if (error || !data) return form('Não encontramos um documento com este código. Confira o código no rodapé do PDF.');
    const rows = (data.signers || []).map((s) => `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line,#ece8e1);gap:10px"><div><b>${esc(s.name)}</b><div class="small muted">${esc(s.role || 'Signatário')} · CPF ${esc(s.cpf)}</div></div>
      <div class="u-right">${s.status === 'signed' ? `<span class="tag success">Assinou</span><div class="small muted">${esc(fmt(s.signed_at))}</div>${s.hash ? `<div class="small muted">Autenticação ${esc(String(s.hash).slice(0, 16))}</div>` : ''}` : '<span class="tag warning">Aguardando</span>'}</div></div>`).join('');
    const st = data.status === 'cancelled' ? ['Documento cancelado', '#c73053'] : data.complete ? ['Documento autêntico e totalmente assinado', '#2e7a57'] : ['Documento autêntico, assinaturas em andamento', '#b7791f'];
    shell(`<div class="card sign-card"><div style="display:flex;align-items:center;gap:12px"><div class="sign-ok" style="background:${st[1]}">${data.status === 'cancelled' ? '!' : '✓'}</div><div><h1 style="margin:0;font-size:20px">${esc(st[0])}</h1><div class="small muted">${esc(data.name)} · ${esc(data.fund)}</div></div></div>
      <div class="u-mt12 small muted">Criado em ${esc(fmt(data.created_at))}<br>Código completo: <span class="u-break">${esc(data.sha256)}</span></div>
      <h2 style="margin:18px 0 4px;font-size:15px">Assinaturas</h2>${rows}</div>
      <form class="card sign-card" id="pf" novalidate><h2 class="u-m0">Ver o documento</h2><p class="u-m0 small muted">Por segurança, o conteúdo só abre para quem assina. Informe o CPF de um dos signatários.</p>
        <div class="field"><label for="cpf">CPF do signatário</label><input class="input" id="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"><div class="ferr" id="err" hidden></div></div>
        <button class="btn lg block" id="pg" type="submit">Abrir documento</button></form><div id="view"></div>
      <p class="small muted" style="text-align:center"><a href="verificar.html">Verificar outro documento</a></p>`);
    const cpf = document.getElementById('cpf'), err = document.getElementById('err');
    cpf.addEventListener('input', () => { cpf.value = cpfMask(cpf.value); err.hidden = true; });
    document.getElementById('pf').onsubmit = async (e) => {
      e.preventDefault();
      if (cpf.value.replace(/\D/g, '').length !== 11) { err.hidden = false; err.textContent = 'Informe o CPF completo.'; return; }
      const btn = document.getElementById('pg'); btn.disabled = true;
      const { data: d, error: er } = await sb.rpc('verify_collection_pdf', { p_code: clean, p_cpf: cpf.value });
      btn.disabled = false;
      if (er || !d) { err.hidden = false; err.textContent = /cpf_mismatch/.test((er && er.message) || '') ? 'Este CPF não consta entre os signatários.' : 'Não foi possível abrir o documento agora.'; return; }
      const L = window.LottusPdf;
      const u8 = d.doc ? await L.build({ title: d.doc.title, shortTitle: d.doc.short || d.name, fund: d.fund, code: String(d.sha256 || '').slice(0, 24), text: d.doc.text, inlineSign: d.doc.inline !== false,
        signers: (d.signers || []).map((s) => ({ id: s.id, role: s.role || 'Signatário', name: s.name, doc: L.maskCpf(s.cpf), status: s.status === 'signed' ? 'signed' : 'pending', signed_at: s.signed_at, hash: s.hash })) }) : L.fromB64(d.pdf_b64);
      const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
      document.getElementById('view').innerHTML = `<article class="card sign-doc"><iframe class="pdf-frame" src="${url}" title="${esc(d.name)}"></iframe><p class="small muted"><a href="${url}" download="documento.pdf">Baixar o PDF</a></p></article>`;
    };
  }

  if (code0) check(code0); else form();
})();
