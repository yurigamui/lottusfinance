/* Lottus Partners — documentos para assinatura: montagem (boletim, termo de emissão, contratos), PDF com selos,
   visualização em popup e edição das partes depois do envio. */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, toast, run, closeModal } = B;
  const P = () => window.LottusPdf;
  const base = () => { const c = window.LOTTUS_CONFIG || {}; return c.signUrl || c.partnersUrl; };
  const { digits, fmtDoc } = B;
  const okMail = (v) => /^\S+@\S+\.\S+$/.test(v || '');

  /* ---------------- números e datas por extenso ---------------- */
  const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const T = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const H = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function ate999(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, out = [];
    if (c) out.push(H[c]);
    if (r) out.push(r < 20 ? U[r] : T[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : ''));
    return out.join(' e ');
  }
  function inteiro(n) {
    if (n === 0) return 'zero';
    const parts = [], mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), r = n % 1000;
    if (mi) parts.push(ate999(mi) + (mi === 1 ? ' milhão' : ' milhões'));
    if (mil) parts.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
    if (r) parts.push(ate999(r));
    if (parts.length === 1) return parts[0];
    const last = parts.pop();
    return parts.join(' ') + ((r && (r < 100 || r % 100 === 0)) || (!r && !mil) ? ' e ' : ' ') + last;
  }
  function reais(v) {
    const c = Math.round((+v || 0) * 100), r = Math.floor(c / 100), ct = c % 100, out = [];
    if (r) out.push(inteiro(r) + (r === 1 ? ' real' : r % 1e6 === 0 && r >= 1e6 ? ' de reais' : ' reais'));
    if (ct) out.push(inteiro(ct) + (ct === 1 ? ' centavo' : ' centavos'));
    return out.length ? out.join(' e ') : 'zero reais';
  }
  function percentual(v, sufixo) {
    const n = Math.round((+v || 0) * 100) / 100, i = Math.floor(n), d = Math.round((n - i) * 100);
    let t = inteiro(i); if (d) t += ' vírgula ' + (d % 10 === 0 ? inteiro(d / 10) : (d < 10 ? 'zero ' : '') + inteiro(d));
    return `${t} por cento ${sufixo || ''}`.trim();
  }
  const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const dExt = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} de ${MES[m - 1]} de ${y}`; };
  const dBr = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
  const today = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toISOString().slice(0, 10);
  const addr = (a) => { if (!a) return ''; if (typeof a === 'string') return a; return [a.street, a.number && 'nº ' + a.number, a.compl, a.district, a.city && a.uf ? `${a.city}/${a.uf}` : a.city, a.zip && 'CEP ' + a.zip].filter(Boolean).join(', '); };
  const cityUf = (a, fallback) => {
    if (a && typeof a === 'object' && a.city) return [a.city, a.uf];
    const m = /,\s*([^,\-]+?)\s*-\s*([A-Z]{2})\b/.exec(String(a || '')); return m ? [m[1].trim(), m[2]] : fallback;
  };

  /* ---------------- modelo → texto ---------------- */
  const render = (body, vars) => String(body || '').replace(/\{\{([a-z_0-9]+)\}\}/g, (_, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : '[a preencher]'));

  /* ---------------- PDF: popup, montagem com selos ---------------- */
  B.pdfPopup = function (title, bytes, filename, extraFoot, onClose) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const box = B.modal({ title, body: `<iframe class="pdf-frame" src="${url}" title="${esc(title)}"></iframe><div class="u-mt8 small muted"><a href="${url}" download="${esc(filename || 'documento.pdf')}">Baixar PDF</a></div>`, foot: extraFoot || '', wide: true });
    return box;
  };

  const sigRows = (signers, meId) => (signers || []).map((s) => ({ id: s.id, role: s.role || 'Signatário', name: s.name, doc: P().maskCpf(s.cpf), status: s.status === 'signed' ? 'signed' : 'pending', signed_at: s.signed_at, hash: s.hash, highlight: meId && s.id === meId }));
  B.docPdf = async function (v, meId) {
    if (!v.doc) return P().fromB64(v.pdf_b64);
    return P().build({ title: v.doc.title, shortTitle: v.doc.short || v.name, fund: v.fund, code: String(v.sha256 || '').slice(0, 24), text: v.doc.text, inlineSign: v.doc.inline !== false, signers: sigRows(v.signers, meId) });
  };
  /* Ver um documento em coleta: o PDF em cima, quem assina (com opção de adicionar mais gente) e o reenvio dos links */
  B.collectionView = async function (id, onChange) {
    const v = await rpc('partner_collection_view', { p_id: id });
    if (!v) return;
    const sg = v.signers || [], done = sg.filter((s) => s.status === 'signed').length, all = sg.length > 0 && done === sg.length;
    const live = v.status === 'open' && !all, draft = v.status === 'draft', editable = live || draft;
    const ST = { signed: ['Assinou', 'success'], sent: ['Aguardando', 'warning'], draft: ['Rascunho', ''] };
    let url = null;
    try { if (v.doc || v.pdf_b64) url = URL.createObjectURL(new Blob([await B.docPdf(v)], { type: 'application/pdf' })); } catch (_) { /* sem prévia */ }
    const row = (s) => { const st = ST[s.status] || ST.sent;
      return `<div class="row between" style="align-items:center;gap:10px"><div><b>${esc(s.auto ? 'Fundo' : s.name || '—')}</b> <span class="small muted">${esc(s.role || '')}${s.email ? ' · ' + esc(s.email) : ''}</span>${s.signed_at ? `<div class="small muted">Assinou em ${esc(B.dateTime(s.signed_at))}</div>` : ''}</div>
        <span class="u-g8c row"><span class="tag ${st[1]}">${st[0]}</span>${editable && !s.auto && s.status !== 'signed' && sg.filter((x) => !x.auto).length > 1 ? `<button class="linkbtn" type="button" data-rm="${esc(s.id)}" aria-label="Remover">Remover</button>` : ''}</span></div>`; };
    const box = B.drawer({ title: v.name, subtitle: v.status === 'cancelled' ? 'Cancelado' : all ? 'Todos assinaram' : `${done} de ${sg.length} assinaram`,
      body: `${url ? `<iframe class="pdf-frame" src="${url}" title="${esc(v.name)}" style="height:46vh;min-height:300px"></iframe><div class="small muted" style="margin:6px 0 4px"><a href="${url}" download="${esc(v.filename || 'documento.pdf')}">Baixar PDF</a></div>` : ''}
        <div class="fsec"><div class="u-ac row between"><h3 class="u-m0">Quem assina</h3>${editable ? '<button class="btn secondary sm" type="button" id="addsg">+ Adicionar assinante</button>' : ''}</div>
          <div id="sgform" hidden></div>
          <div class="u-grid10t">${sg.map(row).join('')}</div></div>
        ${live ? '<div class="note-box small">Quem ainda não assinou recebe um novo link por e-mail ao reenviar. Os links anteriores deixam de funcionar.</div>' : ''}`,
      foot: `${editable ? `<button class="u-mr-auto linkbtn" data-act="cx">${draft ? 'Excluir rascunho' : 'Cancelar coleta'}</button>` : ''}${live ? '<button class="btn" data-act="re">Reenviar para assinatura</button>' : draft ? '<button class="btn" data-act="re">Enviar para assinatura</button>' : ''}` });
    box.classList.add('xl');
    const q = (x) => box.querySelector(`[data-act=${x}]`);
    const reopen = () => { closeModal(); onChange && onChange(); return B.collectionView(id, onChange); };
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
      try { await run(b, () => rpc('partner_collection_signer_delete', { p_signer: b.dataset.rm }), 'Assinante removido'); reopen(); } catch (_) { /* já avisado */ }
    }));
    const add = box.querySelector('#addsg');
    if (add) add.onclick = () => {
      const h = box.querySelector('#sgform'); h.hidden = false; add.hidden = true;
      h.innerHTML = `<form class="u-grid10t card" novalidate><div class="fgrid"><div class="field"><label>Nome</label><input class="input" name="name" autocomplete="off"></div><div class="field"><label>Papel</label><input class="input" name="role" placeholder="Ex.: Avalista" autocomplete="off"></div></div>
        <div class="fgrid"><div class="field"><label>CPF</label><input class="input" name="cpf" data-mask="cpf" inputmode="numeric"></div><div class="field"><label>Celular <span class="small muted">(opcional)</span></label><input class="input" name="phone" data-mask="phone"></div></div>
        <div class="field"><label>E-mail</label><input class="input" type="email" name="email" autocomplete="off"></div><div class="error-box" id="sge" hidden></div>
        <div class="u-g8 row"><button type="button" class="btn secondary sm" data-x>Cancelar</button><button type="button" class="btn sm" data-ok>${live ? 'Adicionar e enviar o link' : 'Adicionar'}</button></div></form>`;
      B.mask.attach(h); h.scrollIntoView({ block: 'nearest' });
      h.querySelector('[data-x]').onclick = () => { h.hidden = true; h.innerHTML = ''; add.hidden = false; };
      h.querySelector('[data-ok]').onclick = async (ev) => {
        const f = h.querySelector('form'), e = h.querySelector('#sge');
        const p = { collection_id: id, name: f.name.value.trim(), role: f.role.value.trim(), cpf: digits(f.cpf.value), email: f.email.value.trim(), phone: f.phone.value.trim(), base: base() };
        if (!p.name || p.cpf.length !== 11 || !okMail(p.email)) { e.hidden = false; e.textContent = 'Informe nome, CPF e e-mail válidos.'; return; }
        try { await run(ev.currentTarget, () => rpc('partner_collection_signer_save', { p }), live ? 'Assinante adicionado e link enviado' : 'Assinante adicionado'); rpc('partner_signers_register', { p: [p] }).catch(() => null); reopen(); }
        catch (er) { e.hidden = false; e.textContent = B.message(er); }
      };
    };
    const re = q('re');
    if (re) re.onclick = async () => {
      try {
        if (draft) await run(re, () => rpc('partner_collection_send', { p_id: id, p_base: base() }), 'Enviado para assinatura');
        else {
          const pend = sg.filter((s) => s.status === 'sent' && !s.auto);
          for (const s of pend) await rpc('partner_collection_resend', { p_signer: s.id, p_base: base() });
          B.toast(pend.length ? `Reenviado para ${pend.length} ${pend.length === 1 ? 'pessoa' : 'pessoas'}` : 'Ninguém com assinatura pendente.');
        }
        closeModal(); onChange && onChange();
      } catch (e) { B.toast(B.message(e), true); }
    };
    const cx = q('cx');
    if (cx) cx.onclick = async () => {
      const ok = await B.confirmAction({ title: draft ? 'Excluir rascunho' : 'Cancelar coleta', text: draft ? 'O rascunho e o PDF anexado serão removidos.' : 'Os links enviados deixam de funcionar. Quem já assinou continua registrado.', confirmLabel: draft ? 'Excluir' : 'Cancelar coleta', danger: true });
      if (ok == null) return;
      try { await run(cx, () => (draft ? rpc('partner_collection_delete', { p_id: id }) : rpc('partner_collection_cancel', { p_id: id })), draft ? 'Rascunho excluído' : 'Coleta cancelada'); closeModal(); onChange && onChange(); } catch (_) { /* já avisado */ }
    };
  };
  B.collectionPopup = B.collectionView;

  /* ---------------- partes depois do envio ---------------- */
  B.editSigners = async function (id, onDone) {
    const box = B.drawer({ title: 'Partes do documento', subtitle: 'Quem já assinou não pode ser alterado. Ao trocar o e-mail ou o CPF, a pessoa recebe um novo link.', body: '<div id="es"></div>', foot: '<button class="btn secondary" data-act="cancel">Fechar</button>' });
    box.querySelector('[data-act=cancel]').onclick = () => { closeModal(); onDone && onDone(); };
    const host = box.querySelector('#es');
    const form = (s) => `<form class="u-grid10 card" id="sf" novalidate><div class="fgrid"><div class="field"><label>Nome</label><input class="input" name="name" value="${esc(s.name || '')}"></div>
      <div class="field"><label>Papel</label><input class="input" name="role" placeholder="Ex.: Avalista" value="${esc(s.role || '')}"></div></div>
      <div class="fgrid"><div class="field"><label>CPF</label><input class="input" name="cpf" data-mask="cpf" value="${esc(s.cpf || '')}"></div><div class="field"><label>Celular</label><input class="input" name="phone" data-mask="phone" value="${esc(s.phone || '')}"></div></div>
      <div class="field"><label>E-mail</label><input class="input" type="email" name="email" value="${esc(s.email || '')}"></div><div class="error-box" id="se" hidden></div>
      <div><button type="button" class="btn secondary sm" data-x>Cancelar</button> <button type="button" class="btn sm" data-ok>Salvar</button></div></form>`;
    const draw = async (edit) => {
      const v = await rpc('partner_collection_view', { p_id: id });
      const open = v.status === 'open' || v.status === 'draft';
      host.innerHTML = `<div class="u-grid10">${v.signers.map((s) => `<div class="card" style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><b>${esc(s.name)}</b> <span class="small muted">${esc(s.role || '')}</span><div class="small muted">${esc(s.email || '')}</div></div>
        <div>${s.status === 'signed' ? '<span class="tag success">Assinou</span>' : s.auto ? '<span class="tag">Fundo (assina ao enviar)</span>' : open ? `<button class="btn ghost sm" data-e="${esc(s.id)}">Editar</button> <button class="btn ghost sm" data-r="${esc(s.id)}">Remover</button>` : ''}</div></div>`).join('')}</div>
        ${open ? (edit === undefined ? '<button class="u-mt12 linkbtn" id="addp">+ Adicionar parte</button>' : form(edit)) : ''}`;
      B.mask.attach(host);
      const add = host.querySelector('#addp'); if (add) add.onclick = () => draw({});
      host.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => draw(v.signers.find((x) => x.id === b.dataset.e))));
      host.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => {
        try { await run(b, () => rpc('partner_collection_signer_delete', { p_signer: b.dataset.r }), 'Parte removida'); draw(); } catch (_) { /* já avisado */ }
      }));
      const f = host.querySelector('#sf');
      if (f) {
        host.querySelector('[data-x]').onclick = () => draw();
        host.querySelector('[data-ok]').onclick = async (ev) => {
          const e = host.querySelector('#se'); const p = { collection_id: id, id: edit.id || null, name: f.name.value.trim(), role: f.role.value.trim(), cpf: digits(f.cpf.value), email: f.email.value.trim(), phone: f.phone.value.trim(), base: base() };
          if (!p.name || p.cpf.length !== 11 || !okMail(p.email)) { e.hidden = false; e.textContent = 'Informe nome, CPF e e-mail válidos.'; return; }
          try { const r = await run(ev.currentTarget, () => rpc('partner_collection_signer_save', { p }), v.status === 'open' ? 'Parte salva e link enviado' : 'Parte salva'); void r; rpc('partner_signers_register', { p: [p] }).catch(() => null); draw(); } catch (er) { e.hidden = false; e.textContent = B.message(er); }
        };
      }
    };
    await draw();
  };

  /* ---------------- envio / rascunho ---------------- */
  /* doc: { title, short, text, inline } · signers: [{auto?, role, name, cpf, email, phone}] */
  B.saveCollection = async function ({ kind, ref_id, name, filename, doc, signers, draft, btn }) {
    const first = signers.map((s) => ({ id: s.id || s.name, role: s.role, name: s.auto ? 'Fundo' : s.name, cpf: s.cpf, status: 'pending' }));
    const bytes = await P().build({ title: doc.title, shortTitle: doc.short, fund: doc.fund, text: doc.text, inlineSign: doc.inline !== false, signers: sigRows(first) });
    return run(btn, () => rpc('partner_collection_create', { p: { name, filename: filename || 'documento.pdf', message: '', pdf_b64: P().toB64(bytes), kind, ref_id, doc: { title: doc.title, short: doc.short, text: doc.text, inline: doc.inline !== false },
      signers: signers.map((s) => (s.auto ? { auto: true, role: s.role } : { name: s.name, cpf: digits(s.cpf), email: s.email, phone: s.phone || '', role: s.role })), draft: !!draft, base: base() } }),
    draft ? 'Rascunho salvo' : 'Enviado para assinatura').then((r) => { rpc('partner_signers_register', { p: signers.filter((s) => !s.auto).map((s) => ({ name: s.name, cpf: digits(s.cpf), email: s.email, phone: s.phone || '' })) }).catch(() => null); return r; });
  };

  /* Escolhe quem assina pelo fundo quando quem envia não tem essa permissão */
  B.pickFundRep = async function () {
    const prof = await rpc('partner_fund_profile').catch(() => null);
    const list = ((prof && prof.signers) || []).filter((x) => x.name && digits(x.cpf || '').length === 11 && okMail(x.email || ''));
    return new Promise((resolve) => {
      const rows = list.map((x, i) => `<label class="row" style="gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--line,#ece8e1);border-radius:10px;cursor:pointer"><input type="checkbox" data-i="${i}"${list.length === 1 ? ' checked' : ''}><span><b>${esc(x.name)}</b><br><span class="small muted">${esc(x.role || '')}${x.role ? ' · ' : ''}${esc(x.email)}</span></span></label>`).join('');
      const box = B.modal({ title: 'Quem assina pelo fundo?', body: `<p class="small muted">Você não tem permissão para assinar pelo fundo. Escolha o representante que vai receber o link de assinatura.</p>${list.length ? `<div class="u-g8 stack">${rows}</div>` : '<div class="note-box small">Nenhum representante do fundo com CPF e e-mail cadastrados. Cadastre em Configurações › Equipe, ou peça a quem tem permissão para enviar.</div>'}`,
        foot: `<button class="btn secondary" data-x>Cancelar</button>${list.length ? '<button class="btn" data-ok>Enviar com este representante</button>' : ''}` });
      box.querySelector('[data-x]').onclick = () => { closeModal(); resolve(null); };
      const ok = box.querySelector('[data-ok]');
      if (ok) ok.onclick = () => { const pick = [...box.querySelectorAll('[data-i]:checked')].map((c) => list[+c.dataset.i]); if (!pick.length) return B.toast('Escolha ao menos um representante.', true); resolve(pick); };
    });
  };

  /* Envia; se quem envia não pode assinar pelo fundo, o representante do fundo entra como signatário */
  B.sendCollection = async function (args) {
    const { signers } = args;
    try { return await B.saveCollection(args); } catch (er) {
      if (!/cannot_sign/.test(String((er && (er.message || er.code)) || er))) return null; /* já avisado */
      const reps = await B.pickFundRep(); if (!reps || !reps.length) return null;
      const auto = signers.findIndex((x) => x.auto), next = signers.filter((x) => !x.auto);
      next.splice(Math.max(auto, 0), 0, ...reps.map((r) => ({ name: r.name, cpf: r.cpf, email: r.email, phone: r.phone || '', role: (auto >= 0 && signers[auto].role) || 'Emissora' })));
      try { return await B.saveCollection({ ...args, signers: next }); } catch (_) { return null; }
    }
  };

  /* Diálogo genérico de revisão: mostra quem assina, deixa ver o PDF, salvar rascunho ou enviar */
  B.reviewDoc = function ({ title, subtitle, kind, ref_id, name, filename, doc, signers, extra, onDone }) {
    const ok = signers.every((s) => s.auto || (s.name && digits(s.cpf).length === 11 && okMail(s.email)));
    const box = B.drawer({ title, subtitle, body: `${extra || ''}<div class="fsec"><h3>Quem assina</h3><div style="display:grid;gap:8px">${signers.map((s) => `<div><b>${esc(s.auto ? 'Fundo (assina ao enviar)' : s.name || '—')}</b> <span class="small muted">${esc(s.role || '')}${s.email ? ' · ' + esc(s.email) : ''}</span>${!s.auto && !(s.name && digits(s.cpf).length === 11 && okMail(s.email)) ? ' <span class="tag warning">Falta CPF ou e-mail</span>' : ''}</div>`).join('')}</div></div>
      <div class="note-box small">Nenhum e-mail é enviado até você clicar em <b>Enviar para assinatura</b>.</div>`,
      foot: `<button class="btn secondary" data-act="cancel">Fechar</button><button class="btn secondary" data-act="see">Ver PDF</button><button class="btn secondary" data-act="draft">Salvar rascunho</button><button class="btn" data-act="send" ${ok ? '' : 'disabled'}>Enviar para assinatura</button>` });
    const q = (a) => box.querySelector(`[data-act=${a}]`);
    q('cancel').onclick = () => closeModal();
    q('see').onclick = async () => {
      const bytes = await P().build({ title: doc.title, shortTitle: doc.short, fund: doc.fund, text: doc.text, inlineSign: doc.inline !== false, signers: sigRows(signers.map((s) => ({ id: s.name, role: s.role, name: s.auto ? 'Fundo' : s.name, cpf: s.cpf, status: 'pending' }))) });
      B.pdfPopup(title, bytes, filename);
    };
    const finish = (r, draft) => { closeModal(); onDone && onDone(r, draft); if (!onDone) location.hash = draft ? '#/contratos/rascunho' : '#/contratos/enviados'; };
    const go = (draft) => async (ev) => {
      const r = await B.sendCollection({ kind, ref_id, name, filename, doc, signers, draft, btn: ev.currentTarget });
      if (r) finish(r, draft);
    };
    q('draft').onclick = go(true); q('send').onclick = go(false);
  };

  /* ---------------- boletins ---------------- */
  async function boletimPrep(kind, id, item) {
    const [t, parties, prof] = await Promise.all([rpc('partner_boletim_text', { p_kind: kind, p_id: id }), rpc('partner_parties_list', { p_kind: 'investidor' }), rpc('partner_fund_profile')]);
    const inv = parties.find((p) => p.cnpj === item.document) || {};
    const rep = (inv.representatives || [])[0] || {};
    const pj = String(item.document).length > 11;
    const sg = pj ? { name: rep.name, cpf: rep.cpf, email: rep.email || inv.email, phone: rep.phone } : { name: inv.legal_name, cpf: item.document, email: inv.email, phone: inv.phone };
    const label = kind === 'resgate' ? 'Boletim de resgate' : 'Boletim de subscrição';
    return { label, name: `${label} · ${item.investor} · ${item.series}`, filename: `${kind === 'resgate' ? 'boletim-resgate' : 'boletim-subscricao'}.pdf`,
      doc: { title: t.title, short: label, fund: prof.trade_name || prof.legal_name, text: t.text, inline: true },
      signers: [{ auto: true, role: 'Emissora' }, { ...sg, role: kind === 'resgate' ? 'Debenturista' : 'Comprador' }] };
  }
  B.boletimDoc = async function (kind, id, item, onDone) {
    const x = await boletimPrep(kind, id, item);
    B.reviewDoc({ title: x.label, subtitle: `${item.investor} · série ${item.series}`, kind: 'boletim_' + kind, ref_id: id, name: x.name, filename: x.filename, doc: x.doc, signers: x.signers,
      onDone: onDone || ((r, draft) => { location.hash = draft ? '#/contratos/rascunho' : '#/contratos/enviados'; }) });
  };

  /* Popup do boletim: ver/baixar e enviar para assinatura (uma única vez; para reenviar, exclua o envio) */
  B.boletimPopup = async function (kind, id, item, onChange) {
    const cols = await rpc('partner_collections_list');
    const ex = cols.find((c) => c.kind === 'boletim_' + kind && c.ref_id === id && c.status !== 'cancelled');
    const after = () => { onChange && onChange(); };
    if (ex) {
      const v = await rpc('partner_collection_view', { p_id: ex.id });
      const bytes = await B.docPdf(v);
      const done = (v.signers || []).filter((s) => s.status === 'signed').length, tot = (v.signers || []).length;
      const stTxt = v.status === 'draft' ? 'Rascunho, ainda não enviado' : done === tot ? 'Totalmente assinado' : `Enviado: ${done} de ${tot} assinaturas`;
      const box = B.pdfPopup(`${item.investor} · ${stTxt}`, bytes, v.filename || 'boletim.pdf', '<button class="btn secondary" data-act="close">Fechar</button><button class="btn secondary" data-act="parts">Editar partes</button><button class="btn danger" data-act="rm">Excluir envio</button>');
      const q = (a) => box.parentElement.querySelector(`[data-act=${a}]`);
      q('close').onclick = () => { closeModal(); after(); };
      q('parts').onclick = () => { closeModal(); B.editSigners(ex.id, after); };
      q('rm').onclick = async () => {
        const ok = await B.confirmAction({ title: 'Excluir envio do boletim', text: done ? 'Já há assinaturas neste boletim. Ao excluir, elas são perdidas e será preciso enviar de novo.' : 'O link enviado deixa de funcionar e você poderá enviar de novo.', confirmLabel: 'Excluir envio', danger: true });
        if (ok == null) return B.boletimPopup(kind, id, item, onChange);
        try { await run(q('rm'), () => rpc('partner_collection_remove', { p_id: ex.id }), 'Envio excluído'); B.boletimPopup(kind, id, item, onChange); } catch (_) { /* já avisado */ }
      };
      return;
    }
    const x = await boletimPrep(kind, id, item);
    const okSig = x.signers.every((s) => s.auto || (s.name && digits(s.cpf).length === 11 && okMail(s.email)));
    const bytes = await P().build({ title: x.doc.title, shortTitle: x.doc.short, fund: x.doc.fund, text: x.doc.text, inlineSign: true, signers: sigRows(x.signers.map((s) => ({ id: s.name, role: s.role, name: s.auto ? 'Fundo' : s.name, cpf: s.cpf, status: 'pending' }))) });
    const box = B.pdfPopup(`${x.label} · ${item.investor}`, bytes, x.filename, `<button class="btn secondary" data-act="close">Fechar</button><button class="btn" data-act="send" ${okSig ? '' : 'disabled'}>Enviar para assinatura</button>`);
    const body = box.querySelector('.modal-body');
    if (!okSig) body.insertAdjacentHTML('afterbegin', '<div class="u-mb8 note-box small">Faltam CPF ou e-mail do investidor no cadastro. Complete para poder enviar.</div>');
    const q = (a) => box.parentElement.querySelector(`[data-act=${a}]`);
    q('close').onclick = () => closeModal();
    q('send').onclick = async (ev) => {
      const r = await B.sendCollection({ kind: 'boletim_' + kind, ref_id: id, name: x.name, filename: x.filename, doc: x.doc, signers: x.signers, draft: false, btn: ev.currentTarget });
      if (r) { toast('Boletim enviado para assinatura'); B.boletimPopup(kind, id, item, onChange); }
    };
  };

  /* ---------------- termos: nota comercial, CCB, cessão, contrato-mãe ---------------- */
  const KIND = { contrato_mae: 'Contrato-mãe', termo_cessao: 'Termo de cessão', nota_comercial: 'Termo de emissão da nota comercial', ccb: 'CCB', cessao: 'Termo de cessão' };
  const qualify = (p, papel, extra) => {
    const reps = (p.representatives || []).filter((r) => r.name);
    const repTxt = reps.length ? `neste ato representada por ${reps.map((r) => `${r.name}${r.cpf ? ', inscrito(a) no CPF sob o nº ' + fmtDoc(r.cpf) : ''}`).join(' e ')}` : 'neste ato representada por seus representantes legais';
    return `${p.legal_name}, pessoa jurídica de direito privado, ${addr(p.address) ? 'com sede em ' + addr(p.address) + ', ' : ''}inscrita no CNPJ/ME sob o nº ${fmtDoc(p.cnpj)}, ${repTxt}, na qualidade de ${papel}${extra ? ' ' + extra : ''};`;
  };

  function termVars(kind, data, prof, ex) {
    const items = data.items || [], ced = data.cedente, esc2 = data.escriturador, emissao = String((data.paid_at || data.created_at || today())).slice(0, 10);
    const last = items.length ? items[items.length - 1].due_date : emissao, first = items.length ? items[0].due_date : emissao;
    const [cidade, uf] = cityUf(prof.address, ['São Paulo', 'SP']);
    const net = +data.net, gross = +data.gross, mr = +data.monthly_rate * 100;
    const meses = Math.max(1, Math.round((new Date(last) - new Date(emissao)) / 86400000 / 30));
    const acct = (prof.accounts || [])[0];
    const liq = prof.pix_key ? `Pix da emissora: ${prof.pix_key}` : acct ? `${acct.bank_name || acct.bank_code} · ag. ${acct.branch} · c/c ${acct.account}` : 'conforme instruções da emissora';
    const rt = (rows) => rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
    const fundSig = (prof.signers || []).filter((s) => s.id === ex.fund_signer || !ex.fund_signer);
    const avals = (ced.representatives || []).filter((r) => (ex.avalistas || []).includes(r.cpf));
    const tranche = `|| Tranche *1 | Data de liberação *2 | Valor *2\n${rt([['1', dBr(emissao), B.brl(net)]])}`;
    return {
      /* variáveis do termo de emissão */
      numero_emissao: ex.numero || '1', emitente_razao: ced.legal_name, emitente_cnpj: fmtDoc(ced.cnpj), emitente_email: ced.email || (ced.representatives[0] || {}).email || '',
      emitente_qualificacao: qualify(ced, 'Emitente da Nota Comercial (“Emitente”) e Garantidora das Obrigações Principais e Acessórias (“Garantidora”)'),
      avalistas_qualificacao: avals.length ? avals.map((r) => `${r.name}, inscrito(a) no CPF sob o nº ${fmtDoc(r.cpf)}, na qualidade de Avalista${avals.length > 1 ? '' : ''} (“Avalista”);`).join('\n\n') : '',
      escriturador_qualificacao: esc2 ? qualify(esc2, 'escriturador da Nota Comercial (“Escriturador”)') : '[Escriturador a preencher];',
      escriturador_resumo: esc2 ? `${esc2.legal_name}, ${addr(esc2.address) ? 'com sede em ' + addr(esc2.address) + ', ' : ''}inscrita no CNPJ/ME sob o nº ${fmtDoc(esc2.cnpj)}` : '[escriturador]',
      escriturador_email: (esc2 && (esc2.email || ((esc2.representatives || [])[0] || {}).email)) || '',
      titular_razao: prof.legal_name, titular_cnpj: fmtDoc(prof.cnpj), titular_endereco: prof.address ? `com sede em ${prof.address}` : '',
      titular_qualificacao: `${prof.legal_name}, ${prof.address ? 'com sede em ' + prof.address + ', ' : ''}inscrita no CNPJ/ME sob o nº ${fmtDoc(prof.cnpj)}, neste ato representada por ${fundSig.map((s) => s.name).join(' e ') || 'seus representantes legais'}, na qualidade de titular da Nota Comercial (“Titular” e “Credora”);`,
      valor_total: B.brl(net), valor_total_extenso: reais(net), data_emissao_extenso: dExt(emissao), data_vencimento_extenso: dExt(last), prazo_meses: String(meses),
      juros_texto: `${String(mr.toFixed(2)).replace('.', ',')}% a.m. (${percentual(mr, 'ao mês')})`,
      pagamento_juros_texto: 'com pagamento das parcelas nas datas indicadas no Plano de Pagamento (Anexo II).',
      local_emissao: `o município de ${cidade}, estado de ${uf}`, local_pagamento: `${cidade}/${uf}, em conta do titular (“${prof.trade_name || prof.legal_name}”) da Nota Comercial: ${acct ? `conta nº ${acct.account}, na Agência ${acct.branch}, na instituição (${acct.bank_code}) ${acct.bank_name || ''}` : liq}`,
      destinacao: 'capital de giro da Emitente', foro: cidade + '/' + uf, liquidacao: liq,
      local_data_extenso: `${cidade}/${uf}, ${dExt(today())}`, local_data_curto: `${cidade}/${uf}, ${dExt(today())}.`,
      indexadores: ['( ) Pós-fixado 100% do CDI da taxa média dos Depósitos Interfinanceiros DI de um dia, “over extra grupo”, expressa na forma percentual ao ano calculada e divulgada pela B3 S.A. – Brasil, Bolsa, Balcão (“Taxa DI” e “B3”, respectivamente);', '( ) Pós-fixado 100% do IPCA', '( ) Pós-fixado 100% do TR', '( ) Pós-fixado 100% do IGPM', '(X) Sem correção monetária'].join('\n'),
      tabela_tranches: tranche, tabela_desembolso: tranche,
      tabela_pagamentos: `|| Parcela *1 | Vencimento *2 | Valor *2\n${rt(items.map((i) => [i.number, dBr(i.due_date), B.brl(i.amount)]))}`,
      /* variáveis dos modelos de contrato (cessão, CCB, contrato-mãe) */
      cessionaria_razao: prof.legal_name, cessionaria_cnpj: fmtDoc(prof.cnpj), cessionaria_endereco: prof.address || '',
      cedente_razao: ced.legal_name, cedente_cnpj: fmtDoc(ced.cnpj), representante_nome: ((ced.representatives || [])[0] || {}).name, representante_cpf: fmtDoc(((ced.representatives || [])[0] || {}).cpf),
      sacado_razao: (items[0] || {}).sacado || ced.legal_name, sacado_cnpj: fmtDoc((items[0] || {}).sacado_cnpj || ced.cnpj), operacao_numero: String(data.id).slice(0, 8).toUpperCase(),
      valor_face: B.brl(gross), valor_liquido: B.brl(net), taxa_mensal: String(mr.toFixed(2)).replace('.', ',') + '%', numero_parcelas: String(items.length),
      parcelas_tabela: items.map((i) => `${i.number}) ${dBr(i.due_date)} — ${B.brl(i.amount)}`).join('\n'), primeiro_vencimento: dBr(first), ultimo_vencimento: dBr(last),
      multa_mora: '2%', juros_mora: '1%', data_extenso: dExt(today()), serie: ex.serie || '',
    };
  }

  /* Monta o termo da operação (nota comercial, CCB, cessão): escolhe quem assina e revisa */
  B.composeTerm = async function ({ kind, opId, onDone }) {
    const [data, prof, tpls, escs, meta] = await Promise.all([rpc('partner_op_term_data', { p_op: opId }), rpc('partner_fund_profile'), rpc('partner_templates_list'), rpc('partner_parties_list', { p_kind: 'escriturador' }).catch(() => []), rpc('partner_op_meta', { p_op: opId }).catch(() => ({}))]);
    const tk = kind === 'cessao' ? 'termo_cessao' : kind;
    const tpl = tpls.find((t) => t.kind === tk);
    const reps = (data.cedente.representatives || []).filter((r) => r.name);
    const loan = kind === 'nota_comercial' || kind === 'ccb';
    const serie = (prof.series.find((s) => s.id === data.series_id) || {});
    const box = B.drawer({ title: KIND[kind] || 'Documento', subtitle: 'Escolha quem assina; o texto é montado com os dados da operação.',
      body: `<form id="tf" novalidate>
        ${loan ? `<div class="fsec"><h3>Escriturador</h3><select class="input" name="esc"><option value="">Selecione…</option>${escs.map((e) => `<option value="${esc(e.id)}" ${data.escriturador && data.escriturador.id === e.id ? 'selected' : ''}>${esc(e.legal_name)}</option>`).join('')}</select>
          <a class="linkbtn" href="#/cadastros/escriturador/novo" id="newesc">+ Cadastrar escriturador</a>
          <div class="u-mt10 field"><label>Custo de escrituração</label>${B.affix(`<input class="input" name="esc_cost" data-mask="money" value="${meta.escrituracao_amount ? esc(B.mask.fmtMoney(meta.escrituracao_amount)) : ''}" placeholder="0,00">`, { pre: 'R$' })}<div class="help">Valor que deve ser repassado ao escriturador. Vai para a Tesouraria.</div></div></div>${kind === 'nota_comercial' ? `<div class="fsec"><h3>Nº da emissão</h3><input class="input" name="numero" data-mask="int" value="1"></div>` : ''}` : ''}
        <div class="fsec"><h3>Assinam pelo cedente</h3>${reps.length ? reps.map((r, i) => `<label class="swrow"><span><b>${esc(r.name)}</b><span class="small">${esc(r.email || 'sem e-mail')}${loan ? ' · avalista' : ''}</span></span><input type="checkbox" name="rep" value="${i}" checked></label>`).join('') : '<div class="note-box small">Cadastre ao menos um representante do cedente (nome, CPF e e-mail) em <a href="#/cadastros/cedente">Cadastros</a>.</div>'}</div>
        ${kind === 'nota_comercial' ? `<div class="fsec"><h3>Testemunhas (opcional)</h3>${[1, 2].map((n) => `<div class="fgrid"><div class="field"><label>Testemunha ${n}</label><input class="input" name="tn${n}"></div><div class="field"><label>CPF</label><input class="input" name="tc${n}" data-mask="cpf"></div></div><div class="field"><input class="input" type="email" name="te${n}" placeholder="E-mail"></div>`).join('')}</div>` : ''}
        <div class="error-box" id="te" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="next">Continuar</button>' });
    B.mask.attach(box);
    const f = box.querySelector('#tf'), err = box.querySelector('#te');
    const nv = box.querySelector('#newesc'); if (nv) nv.onclick = () => closeModal();
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=next]').onclick = async () => {
      const chosen = [...f.querySelectorAll('[name=rep]:checked')].map((c) => reps[+c.value]);
      if (!chosen.length) { err.hidden = false; err.textContent = 'Escolha quem assina pelo cedente.'; return; }
      if (kind === 'nota_comercial' && !f.esc.value) { err.hidden = false; err.textContent = 'Selecione ou cadastre o escriturador.'; return; }
      const esc2 = loan && f.esc ? escs.find((e) => e.id === f.esc.value) : null;
      if (esc2) { const ec = f.esc_cost ? B.mask.parse(f.esc_cost.value) : 0; try { await rpc('partner_op_set_escrituracao', { p_op: opId, p_amount: ec > 0 ? ec : null }); } catch (_) { /* segue */ } }
      if (esc2) { try { const mt = await rpc('partner_op_meta', { p_op: opId }); await rpc('partner_op_set_meta', { p_op: opId, p: { escriturador_id: esc2.id, originator_id: mt.originator_id, commission_kind: mt.commission_kind, commission_value: mt.commission_value } }); } catch (_) { /* segue */ } data.escriturador = esc2; }
      const vars = termVars(kind, data, prof, { numero: f.numero ? f.numero.value : '1', avalistas: loan ? chosen.map((r) => r.cpf) : [], serie: serie.emission ? B.serie(serie.emission, serie.series) : '' });
      const text = render(tpl.body, vars);
      const signers = [{ auto: true, role: loan ? 'Titular / Credora' : 'Cessionária' }];
      chosen.forEach((r) => signers.push({ name: r.name, cpf: r.cpf, email: r.email, phone: r.phone, role: loan ? 'Emitente e Avalista' : 'Cedente' }));
      if (esc2) (esc2.representatives || []).filter((r) => r.name).forEach((r) => signers.push({ name: r.name, cpf: r.cpf, email: r.email, phone: r.phone, role: 'Escriturador' }));
      [1, 2].forEach((n) => { if (f['tn' + n] && f['tn' + n].value.trim()) signers.push({ name: f['tn' + n].value.trim(), cpf: f['tc' + n].value, email: f['te' + n].value.trim(), role: 'Testemunha ' + n }); });
      closeModal();
      B.reviewDoc({ title: KIND[kind], subtitle: data.cedente.legal_name, kind: 'op_' + kind, ref_id: opId, name: `${KIND[kind]} · ${data.cedente.legal_name}`, filename: `${tk}.pdf`,
        doc: { title: tpl.title, short: KIND[kind], fund: prof.trade_name || prof.legal_name, text, inline: !loan }, signers, onDone });
    };
  };

  B.composeMaster = async function ({ party, onDone }) {
    const [prof, tpls] = await Promise.all([rpc('partner_fund_profile'), rpc('partner_templates_list')]);
    const tpl = tpls.find((t) => t.kind === 'contrato_mae');
    const reps = (party.representatives || []).filter((r) => r.name);
    const r0 = reps[0] || {};
    const [cidade, uf] = cityUf(prof.address, ['São Paulo', 'SP']);
    const vars = { cessionaria_razao: prof.legal_name, cessionaria_cnpj: fmtDoc(prof.cnpj), cessionaria_endereco: prof.address || '', cedente_razao: party.legal_name, cedente_cnpj: fmtDoc(party.cnpj),
      representante_nome: r0.name, representante_cpf: fmtDoc(r0.cpf), foro: cidade + '/' + uf, data_extenso: dExt(today()), multa_mora: '2%', juros_mora: '1%' };
    B.reviewDoc({ title: 'Contrato-mãe', subtitle: party.legal_name, kind: 'contrato_mae', ref_id: party.id, name: `Contrato-mãe · ${party.legal_name}`, filename: 'contrato-mae.pdf',
      doc: { title: tpl.title, short: 'Contrato-mãe', fund: prof.trade_name || prof.legal_name, text: render(tpl.body, vars), inline: false },
      signers: [{ auto: true, role: 'Cessionária' }, ...reps.map((r) => ({ name: r.name, cpf: r.cpf, email: r.email, phone: r.phone, role: 'Cedente' }))], onDone });
  };

  /* ---------------- operação manual: tudo gerado sozinho ao "Aprovar e enviar para assinatura" ---------------- */
  const validRep = (r) => r && r.name && digits(r.cpf || '').length === 11 && okMail(r.email);
  const TERM_KIND = (inst) => (inst === 'nota_comercial' || inst === 'ccb' ? inst : 'cessao');

  /** Contrato-mãe pronto para enviar (cedente + fundo) */
  B.buildMasterDoc = async function (party) {
    const [prof, tpls] = await Promise.all([rpc('partner_fund_profile'), rpc('partner_templates_list')]);
    const tpl = tpls.find((t) => t.kind === 'contrato_mae');
    const reps = (party.representatives || []).filter(validRep), r0 = reps[0] || {};
    const [cidade, uf] = cityUf(prof.address, ['São Paulo', 'SP']);
    const vars = { cessionaria_razao: prof.legal_name, cessionaria_cnpj: fmtDoc(prof.cnpj), cessionaria_endereco: prof.address || '', cedente_razao: party.legal_name, cedente_cnpj: fmtDoc(party.cnpj),
      representante_nome: r0.name, representante_cpf: fmtDoc(r0.cpf), foro: cidade + '/' + uf, data_extenso: dExt(today()), multa_mora: '2%', juros_mora: '1%' };
    return { kind: 'contrato_mae', ref_id: party.id || party.party_id, name: `Contrato-mãe · ${party.legal_name}`, filename: 'contrato-mae.pdf',
      doc: { title: tpl.title, short: 'Contrato-mãe', fund: prof.trade_name || prof.legal_name, text: render(tpl.body, vars), inline: false },
      signers: [{ auto: true, role: 'Cessionária' }, ...reps.map((r) => ({ name: r.name, cpf: r.cpf, email: r.email, phone: r.phone, role: 'Cedente' }))] };
  };

  /** Termo da operação pronto para enviar: assinam o fundo, todos os representantes do cedente e o escriturador (NC/CCB) */
  B.buildTermDoc = async function (kind, opId) {
    const [data, prof, tpls] = await Promise.all([rpc('partner_op_term_data', { p_op: opId }), rpc('partner_fund_profile'), rpc('partner_templates_list')]);
    const tk = kind === 'cessao' ? 'termo_cessao' : kind, tpl = tpls.find((t) => t.kind === tk), loan = kind !== 'cessao';
    const reps = (data.cedente.representatives || []).filter(validRep);
    const serie = (prof.series || []).find((x) => x.id === data.series_id) || {};
    const vars = termVars(kind, data, prof, { numero: '1', avalistas: loan ? reps.map((r) => r.cpf) : [], serie: serie.emission ? B.serie(serie.emission, serie.series) : '' });
    const signers = [{ auto: true, role: loan ? 'Titular / Credora' : 'Cessionária' }];
    reps.forEach((r) => signers.push({ name: r.name, cpf: r.cpf, email: r.email, phone: r.phone, role: loan ? 'Emitente e Avalista' : 'Cedente' }));
    if (loan && data.escriturador) (data.escriturador.representatives || []).filter(validRep).forEach((r) => signers.push({ name: r.name, cpf: r.cpf, email: r.email, phone: r.phone, role: 'Escriturador' }));
    return { kind: 'op_' + kind, ref_id: opId, name: `${KIND[kind]} · ${data.cedente.legal_name}`, filename: `${tk}.pdf`,
      doc: { title: tpl.title, short: KIND[kind], fund: prof.trade_name || prof.legal_name, text: render(tpl.body, vars), inline: !loan }, signers };
  };

  /** O que falta para aprovar uma operação manual. Puxa os dados do app quando o cedente não tem cadastro no Partners. */
  B.opChecklist = async function (opId, instrument) {
    const prep = await rpc('partner_op_prepare', { p_op: opId });
    if (!prep.manual) return { manual: false };
    const [data, tpls, escs] = await Promise.all([rpc('partner_op_term_data', { p_op: opId }), rpc('partner_templates_list'), rpc('partner_parties_list', { p_kind: 'escriturador' }).catch(() => [])]);
    const kind = TERM_KIND(instrument || data.instrument);
    const ced = prep.cedente, reps = (ced.representatives || []).filter(validRep), d = prep.docs;
    const items = [{ key: 'cedente', ok: reps.length > 0, label: 'Quem assina pelo cedente',
      text: reps.length ? `${reps.map((r) => r.name).join(', ')}${ced.source === 'app' ? ' · dados do app' : ''}` : 'Falta um representante com nome, CPF e e-mail' }];
    items.push({ key: 'master', ok: true, label: 'Contrato-mãe', text: d.master.ok ? (d.master.via_app ? 'Já assinado no app' : 'Já assinado') : d.master.collection_id ? 'Já enviado' : 'Será enviado junto' });
    if (kind !== 'cessao') {
      const e = data.escriturador, eReps = e ? (e.representatives || []).filter(validRep) : [];
      items.push({ key: 'esc', ok: kind === 'ccb' ? (!e || eReps.length > 0) : !!(e && eReps.length), label: 'Escriturador',
        text: e ? (eReps.length ? `${e.legal_name} · assina ${eReps.map((r) => r.name).join(', ')}` : `${e.legal_name}: falta um representante com nome, CPF e e-mail`) : kind === 'ccb' ? 'Sem escriturador' : 'Escolha o escriturador', escs, current: e });
    }
    items.push({ key: 'tpl', ok: !!tpls.find((t) => t.kind === (kind === 'cessao' ? 'termo_cessao' : kind)) && !!tpls.find((t) => t.kind === 'contrato_mae'), label: 'Modelo do documento', text: 'Contratos › Modelos' });
    return { manual: true, kind, items, ready: items.every((i) => i.ok), docs: d, prep, data };
  };

  /** Gera os documentos que faltam, envia e registra a decisão do fundo (a operação vai sozinha para Pagamento quando todos assinarem) */
  B.approveAndSend = async function (opId, ck, btn) {
    const cols = await rpc('partner_collections_list');
    const open = (kind, ref) => cols.some((c) => c.kind === kind && c.ref_id === ref && c.status !== 'cancelled');
    if (!ck.docs.master.ok && !ck.docs.master.collection_id) {
      const party = { ...ck.prep.cedente, id: ck.prep.party_id };
      if (!open('contrato_mae', party.id)) { const r = await B.sendCollection({ ...(await B.buildMasterDoc(party)), draft: false, btn }); if (!r) return null; }
    }
    if (!ck.docs.term.ok && !open('op_' + ck.kind, opId)) { const r = await B.sendCollection({ ...(await B.buildTermDoc(ck.kind, opId)), draft: false, btn }); if (!r) return null; }
    return run(btn, () => rpc('partner_approve_send', { p_id: opId }));
  };

  /** Operação cujos documentos já foram assinados em outra plataforma: guarda os PDFs e segue sem enviar nada para assinatura */
  B.markSigned = function (opId, ck, before, done) {
    const needMaster = !ck.docs.master.ok;
    const kindName = { cessao: 'Termo de cessão', nota_comercial: 'Termo da nota comercial', ccb: 'CCB' }[ck.kind] || 'Termo da operação';
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const row = (key, label) => `<div class="fsec"><h3>${label}</h3><div class="fgrid">
        <div class="field full"><label class="filebox"><input type="file" name="${key}_file" accept="application/pdf,.pdf" hidden><span class="btn secondary sm">Escolher PDF assinado</span><span class="fname" data-name="${key}">Nenhum arquivo escolhido</span></label></div>
        <div class="field"><label>Data da assinatura</label><input class="input" name="${key}_date" data-mask="date" value="${B.mask.toBr(today)}"></div></div></div>`;
    const box = B.modal({ title: 'Operação já assinada',
      subtitle: 'Os documentos foram assinados em outra plataforma. Nada é enviado para assinatura nem por e-mail.',
      body: `<form id="ms" class="stack" novalidate>
        <div class="field"><label>Plataforma de assinatura <span class="small muted">(opcional)</span></label><input class="input" name="platform" maxlength="80" placeholder="Ex.: ClickSign, D4Sign, DocuSign"></div>
        ${row('term', kindName)}${needMaster ? row('master', 'Contrato-mãe') : ''}
        <div class="note-box small">Use o PDF final, com as assinaturas e, se tiver, o relatório de assinaturas. Até 5 MB por arquivo. A data informada é a da assinatura original e fica no registro.</div>
        <div class="error-box" id="ms-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Registrar e aprovar</button>' });
    B.mask.attach(box);
    const f = box.querySelector('#ms'), err = box.querySelector('#ms-err');
    const showErr = (m) => { err.hidden = !m; err.textContent = m || ''; };
    f.querySelectorAll('input[type=file]').forEach((i) => (i.onchange = () => { const nm = f.querySelector(`[data-name="${i.name.replace('_file', '')}"]`); if (nm) nm.textContent = i.files[0] ? i.files[0].name : 'Nenhum arquivo escolhido'; }));
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const parts = [['term', kindName]].concat(needMaster ? [['master', 'contrato-mãe']] : []);
      const data = {};
      for (const [k, label] of parts) {
        const file = f[k + '_file'].files[0], iso = B.mask.iso(f[k + '_date']);
        if (!file) return showErr(`Escolha o PDF do ${label}.`);
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return showErr(`O arquivo do ${label} precisa ser um PDF.`);
        if (file.size > 5 * 1024 * 1024) return showErr(`O PDF do ${label} passa de 5 MB.`);
        if (!iso) return showErr(`Informe a data da assinatura do ${label}.`);
        if (iso > today) return showErr(`A data da assinatura do ${label} não pode ser no futuro.`);
        data[k] = { file, signed_on: iso };
      }
      if (before && (await before()) === false) return;
      try {
        const r = await run(ev.currentTarget, async () => {
          const me = await rpc('partner_me');
          const base = `${me.funder.id}/assinados/${opId}`;
          const p = { platform: f.platform.value.trim() };
          for (const k of Object.keys(data)) {
            const path = `${base}/${k}-${Date.now()}.pdf`;
            const { error } = await B.sb.storage.from('boletos').upload(path, data[k].file, { contentType: 'application/pdf', upsert: false });
            if (error) throw new Error('Não conseguimos enviar o PDF: ' + error.message);
            p[k] = { path, name: data[k].file.name.slice(0, 120), signed_on: data[k].signed_on };
          }
          return rpc('partner_op_mark_signed', { p_op: opId, p });
        });
        closeModal(); done && done(r);
      } catch (e) { showErr(B.message(e)); }
    };
  };

  /** Quadro do que falta (Análise) com o botão de aprovar; mostra a assinatura em andamento depois do envio */
  B.opManualPanel = async function (host, { opId, instrument, before, onSent, onFix }) {
    const ck = await B.opChecklist(opId, instrument);
    if (!ck.manual) return ck;
    if (ck.docs.ready) {
      host.innerHTML = '<div class="stack-sm"><b>Assinaturas</b><div id="opdocs"></div><p class="u-m0 small muted">Quando todos assinarem, a operação vai sozinha para Pagamento.</p></div>';
      B.docsBox(host.querySelector('#opdocs'), opId, onSent);
      return ck;
    }
    // Só mostra o que falta; com tudo certo aparece apenas o botão
    const todo = ck.items.filter((i) => !i.ok);
    host.innerHTML = `<div class="stack-sm">${todo.map((i) => `<div class="ck-row no"><span class="ck-ico" aria-hidden="true">!</span>
        <span class="grow"><b>${esc(i.label)}</b><span class="small muted">${esc(i.text)}</span>${i.key === 'esc' ? `<select class="u-mt6 input" data-esc><option value="">${ck.kind === 'ccb' ? 'Sem escriturador' : 'Escolha…'}</option>${(i.escs || []).map((e) => `<option value="${esc(e.id)}" ${i.current && i.current.id === e.id ? 'selected' : ''}>${esc(e.legal_name)}</option>`).join('')}</select>` : ''}
        ${i.key === 'cedente' ? '<button class="linkbtn" data-fix="cedente">Completar cadastro</button>' : ''}${i.key === 'esc' && i.current ? '<button class="linkbtn" data-fix="esc">Completar escriturador</button>' : ''}${i.key === 'tpl' ? '<a class="linkbtn" href="#/config/modelos/contratos">Ver modelos</a>' : ''}</span></div>`).join('')}
      <button class="btn block" id="apsend" style="font-size:13.5px" ${ck.ready ? '' : 'disabled'}>Aprovar &amp; Assinar</button>
      <button class="btn secondary block" id="apdone" type="button" style="font-size:13.5px">Operação já assinada</button></div>`;
    const sel = host.querySelector('[data-esc]');
    if (sel) sel.onchange = async () => {
      try { const mt = await rpc('partner_op_meta', { p_op: opId }); await rpc('partner_op_set_meta', { p_op: opId, p: { escriturador_id: sel.value || null, originator_id: mt.originator_id, commission_kind: mt.commission_kind, commission_value: mt.commission_value } }); }
      catch (e) { toast(B.message(e), true); }
      B.opManualPanel(host, { opId, instrument, before, onSent, onFix });
    };
    host.querySelectorAll('[data-fix]').forEach((b) => (b.onclick = async () => {
      const kind = b.dataset.fix === 'cedente' ? 'cedente' : 'escriturador';
      const list = await rpc('partner_parties_list', { p_kind: kind });
      const id = kind === 'cedente' ? ck.prep.party_id : (ck.data.escriturador || {}).id;
      B.partyForm(kind, list.find((p) => p.id === id) || null, () => { if (onFix) onFix(); else B.opManualPanel(host, { opId, instrument, before, onSent, onFix }); });
    }));
    host.querySelector('#apdone').onclick = () => B.markSigned(opId, ck, async (r) => {
      if (before && !(await before())) return false;
      return true;
    }, (r) => { toast(r.approved ? 'Operação aprovada' : 'Documentos registrados'); onSent && onSent(r); });
    const go = host.querySelector('#apsend');
    go.onclick = async () => {
      const term = await B.buildTermDoc(ck.kind, opId);
      const bytes = await P().build({ title: term.doc.title, shortTitle: term.doc.short, fund: term.doc.fund, code: '', text: term.doc.text, inlineSign: term.doc.inline !== false,
        signers: term.signers.map((x) => ({ id: x.name, role: x.role || 'Signatário', name: x.name, doc: x.cpf ? P().maskCpf(x.cpf) : '', status: 'pending' })) });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const ok = await new Promise((res) => {
        const box = B.modal({ title: term.name, body: `<iframe class="pdf-frame" src="${url}" title="Prévia do contrato"></iframe>`,
          foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Aprovar &amp; Assinar</button>', wide: true });
        box.querySelector('[data-act=cancel]').onclick = () => { closeModal(); res(null); };
        box.querySelector('[data-act=ok]').onclick = () => { closeModal(); res(true); };
      });
      if (ok == null) return;
      if (before && !(await before())) return;
      const r = await B.approveAndSend(opId, ck, go);
      if (r) { toast(r.approved ? 'Operação aprovada' : 'Enviado para assinatura'); onSent && onSent(r); }
    };
    return ck;
  };

  /* ---------------- documentos antigos (um signatário): "Ver" também abre o PDF ---------------- */
  B.viewDocument = async function (id, onChange) {
    const ev = String(id).startsWith('ev:');
    const d = ev ? await rpc('partner_evidence_text', { p_id: Number(String(id).slice(3)) }) : await rpc('partner_doc_text', { p_id: id });
    if (!d) return;
    const signed = d.status === 'signed' || !!d.signed_at;
    const bytes = await P().build({ title: d.title, shortTitle: d.title, fund: d.fund || 'Partners', code: String(d.sha256 || '').slice(0, 24), text: d.text, inlineSign: true,
      signers: d.signer ? [{ role: 'Signatário', name: d.signer, doc: P().maskCpf(d.signer_cpf), status: signed ? 'signed' : 'pending', signed_at: d.signed_at, hash: d.sha256 }] : [] });
    const canResend = !ev && ['sent', 'pending'].includes(d.status);
    const box = B.pdfPopup(d.title, bytes, 'documento.pdf', canResend ? '<button class="btn" data-act="resend">Reenviar para assinatura</button>' : '');
    const rb = box.parentElement.querySelector('[data-act=resend]');
    if (rb) rb.onclick = () => { closeModal(); B.resendDocument(id, onChange); };
  };

  /* ---------------- painel "Documentos" no detalhe da operação ---------------- */
  /* mode: 'all' (padrão, etapa de assinatura) · 'cedente' (só contrato-mãe, e só se houver) · 'op' (termo, contratos vinculados e PDFs da operação) */
  B.docsBox = async function (host, opId, onComplete, mode) {
    if (!host) return;
    mode = mode || 'all';
    const KF = { nota: 'Original', aditivo: 'Aditivo', retificacao: 'Termo de retificação', contrato: 'Contrato', outro: 'Documento' };
    const draw = async () => {
      let d, cols, ext, fl = { files: [], can_edit: false };
      try {
        [d, cols, ext, fl] = await Promise.all([rpc('partner_operation_docs', { p_op: opId }), rpc('partner_collections_list'), rpc('partner_op_external_docs', { p_op: opId }).catch(() => []),
          (mode === 'op' || mode === 'cedente') ? rpc('partner_op_files', { p_op: opId }).catch(() => ({ files: [], can_edit: false })) : Promise.resolve({ files: [], can_edit: false })]);
      } catch (_) { return; }
      const files = ((fl && fl.files) || []).filter((f) => (mode === 'cedente' ? f.scope === 'cedente' : f.scope !== 'cedente'));
      host.dataset.na = d.applicable ? '' : '1';
      if (!d.applicable && !((mode === 'op' || mode === 'cedente') && (files.length || host.dataset.always || fl.can_edit))) { host.hidden = true; return; }
      const find = (kind, ref) => cols.filter((c) => c.kind === kind && c.ref_id === ref && c.status !== 'cancelled')[0];
      const linked = cols.filter((c) => c.operation_id === opId && !c.kind && c.status !== 'cancelled');
      const termK = d.term_kind === 'termo_cessao' ? 'op_cessao' : 'op_' + d.term_kind;
      const rowsAll = d.applicable ? [['contrato_mae', 'Contrato-mãe', d.master, find('contrato_mae', d.party_id)], [termK, KIND[d.term_kind] || 'Termo', d.term, find(termK, opId)]] : [];
      const extOf = (k) => (ext || []).filter((e) => e.kind === (k === 'contrato_mae' ? 'master' : 'term'))[0];
      const hasDoc = ([k, , legacy, c]) => !!(extOf(k) || c || legacy.signed || legacy.doc);
      const rows = mode === 'all' ? rowsAll : rowsAll.filter((r) => (mode === 'cedente' ? r[0] === 'contrato_mae' : r[0] !== 'contrato_mae') && hasDoc(r));
      const showLinked = mode !== 'cedente' ? linked : [];
      const canEdit = (mode === 'op' || mode === 'cedente') && fl.can_edit;
      const empty = !rows.length && !showLinked.length && !files.length;
      if (mode !== 'all' && empty && !canEdit) { host.hidden = true; return; }
      host.hidden = false;
      const bytes = (n) => (n == null ? '' : n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
      host.innerHTML = `<div class="docs${mode === 'op' ? ' docs-flat' : ''}">${mode === 'op' ? '' : empty && mode === 'cedente' ? '' : '<h3>Documentos</h3>'}${rows.map(([k, label, legacy, c], i) => {
        const done = c && c.signers.length && c.signers.every((s) => s.status === 'signed');
        let st = legacy.signed || done ? ['Assinado', 'success'] : c ? (c.status === 'draft' ? ['Rascunho', ''] : [`${c.signers.filter((s) => s.status === 'signed').length} de ${c.signers.length} assinaram`, 'warning']) : legacy.doc ? ['Documento antigo', 'warning'] : ['Gerado ao aprovar', ''];
        const xd = extOf(k);
        if (xd) st = [`Assinado externamente · ${B.mask.toBr(xd.signed_on)}`, 'success'];
        const act = xd ? `<button class="linkbtn" data-ext="${esc(xd.path)}">Ver PDF</button>` : c ? `<button class="linkbtn" data-see="${esc(c.id)}">Ver</button>`
          : legacy.doc ? `<button class="linkbtn" data-legacy="${esc(legacy.doc.id)}">Ver</button>` : '';
        return `<div class="docrow"><div><b>${label}</b></div><span class="tag ${st[1]}">${st[0]}</span><span>${act}</span></div>`;
      }).join('')}${files.map((f) => { const lc = f.collection_id ? cols.find((c) => c.id === f.collection_id) : null; const all = lc && lc.signers.length && lc.signers.every((x) => x.status === 'signed');
        const st = lc ? (all ? ['Assinado', 'success'] : lc.status === 'draft' ? ['Rascunho', ''] : [`${lc.signers.filter((x) => x.status === 'signed').length} de ${lc.signers.length} assinaram`, 'warning']) : null;
        return `<div class="docrow"><div><b>${esc(f.title)}</b><div class="small muted">${esc(KF[f.kind] || 'Documento')}${lc ? ' · Lottus Sign' : ''}${f.signed_on ? ' · ' + esc(B.mask.toBr(f.signed_on)) : ''}${f.size ? ' · ' + esc(bytes(f.size)) : ''}</div></div>${st ? `<span class="tag ${st[1]}">${st[0]}</span>` : '<span></span>'}<span>${lc ? `<button class="linkbtn" data-see="${esc(lc.id)}">Ver</button>` : `<button class="linkbtn" data-file="${esc(f.path)}">Ver PDF</button>`}${canEdit ? ` <button class="linkbtn" data-frm="${esc(f.id)}">Remover</button>` : ''}</span></div>`; }).join('')}${showLinked.map((c) => { const all = c.signers.length && c.signers.every((x) => x.status === 'signed'); const st = all ? ['Assinado', 'success'] : c.status === 'draft' ? ['Rascunho', ''] : [`${c.signers.filter((x) => x.status === 'signed').length} de ${c.signers.length} assinaram`, 'warning'];
        return `<div class="docrow"><div><b>${esc(c.name)}</b><div class="small muted">Contrato vinculado</div></div><span class="tag ${st[1]}">${st[0]}</span><span><button class="linkbtn" data-see="${esc(c.id)}">Ver</button> <button class="linkbtn" data-unlink="${esc(c.id)}">Desvincular</button></span></div>`; }).join('')}
        ${canEdit ? '<div class="u-mt8"><button class="linkbtn" id="add-file">+ Anexar contrato</button></div>' : ''}</div>`;
      if (mode === 'op') host.innerHTML = `<div class="card cedente-card"><div class="u-top-wrap row between"><div><h2>Operação</h2><div class="u-mt4 small muted">${esc(host.dataset.summary || '')}</div></div></div>${host.innerHTML}</div>`;
      host.querySelectorAll('[data-unlink]').forEach((b) => (b.onclick = async () => { try { await run(b, () => rpc('partner_collection_link', { p_id: b.dataset.unlink, p_op: null }), 'Contrato desvinculado'); draw(); } catch (_) { /* já avisado */ } }));
      const af = host.querySelector('#add-file');
      if (af) af.onclick = () => {
        const isOp = mode === 'op';
        const signList = cols.filter((c) => c.status !== 'cancelled').sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
        const stOf = (c) => { const all = c.signers.length && c.signers.every((x) => x.status === 'signed'); return all ? 'Assinado' : c.status === 'draft' ? 'Rascunho' : `${c.signers.filter((x) => x.status === 'signed').length} de ${c.signers.length} assinaram`; };
        const bx = B.modal({ title: 'Anexar contrato', subtitle: isOp ? 'Envie o PDF ou escolha um contrato da Lottus Sign.' : 'Contrato do cedente (contrato-mãe, aditivos, procurações…).',
          body: `<div class="stack">${isOp ? '<div class="field"><label for="of-k">Tipo</label><select class="input" id="of-k"><option value="contrato">Contrato</option><option value="nota">Original (nota, termo ou confissão)</option><option value="aditivo">Aditivo</option><option value="retificacao">Termo de retificação</option><option value="outro">Outro</option></select></div>' : ''}
            <div class="field"><label for="of-t">Nome</label><input class="input" id="of-t" maxlength="160" placeholder="Ex.: Contrato-mãe assinado"></div>
            <div class="field" id="of-pdf"><label for="of-f">Arquivo PDF (até 5 MB)</label><input class="input" id="of-f" type="file" accept="application/pdf,.pdf"></div>
            <div style="border-top:1px solid var(--line);padding-top:10px"><button type="button" class="linkbtn" id="of-ls">Selecionar da Lottus Sign</button><div id="of-list" hidden style="max-height:220px;overflow:auto;margin-top:8px">${signList.length ? signList.map((c) => `<label class="docrow" style="cursor:pointer"><span style="display:flex;gap:8px;align-items:center"><input type="radio" name="of-c" value="${esc(c.id)}"><span><b>${esc(c.name)}</b><span class="small muted"> · ${esc(B.date(c.created_at))}</span></span></span><span class="tag ${stOf(c) === 'Assinado' ? 'success' : ''}">${esc(stOf(c))}</span><span></span></label>`).join('') : '<div class="small muted">Nenhum contrato na Lottus Sign ainda.</div>'}</div></div>
            <div class="error-box" id="of-e" hidden></div></div>`,
          foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Anexar</button>' });
        const err = (m2) => { const e = bx.querySelector('#of-e'); e.hidden = false; e.textContent = m2; };
        bx.querySelector('[data-act=cancel]').onclick = () => closeModal();
        bx.querySelector('#of-ls').onclick = () => { const l = bx.querySelector('#of-list'); l.hidden = !l.hidden; };
        bx.querySelectorAll('[name=of-c]').forEach((r) => (r.onchange = () => { const c = cols.find((q) => q.id === r.value); const t = bx.querySelector('#of-t'); if (c && !t.value) t.value = c.name; bx.querySelector('#of-pdf').hidden = true; bx.querySelector('#of-f').value = ''; }));
        bx.querySelector('#of-f').onchange = (ev) => { const t = bx.querySelector('#of-t'); const f = ev.target.files[0]; if (f && !t.value) t.value = f.name.replace(/\.pdf$/i, ''); const ck = bx.querySelector('[name=of-c]:checked'); if (ck) ck.checked = false; };
        bx.querySelector('[data-act=ok]').onclick = async (ev) => {
          const file = bx.querySelector('#of-f').files[0], title = bx.querySelector('#of-t').value.trim(), ck = bx.querySelector('[name=of-c]:checked'), kind = isOp ? bx.querySelector('#of-k').value : 'contrato', scope = isOp ? 'op' : 'cedente';
          if (!ck && (!file || !/\.pdf$/i.test(file.name))) return err('Envie um PDF ou selecione um contrato da Lottus Sign.');
          if (file && file.size > 5 * 1024 * 1024) return err('O PDF passa de 5 MB.');
          if (!title) return err('Dê um nome ao documento.');
          try {
            await run(ev.currentTarget, async () => {
              if (ck) return rpc('partner_op_file_add', { p_op: opId, p: { kind, scope, title, collection_id: ck.value } });
              const me = await rpc('partner_me');
              const path = `${me.funder.id}/operacao/${opId}/${Date.now()}.pdf`;
              const { error } = await B.sb.storage.from('boletos').upload(path, file, { contentType: 'application/pdf', upsert: false });
              if (error) throw new Error('Não conseguimos enviar o PDF: ' + error.message);
              return rpc('partner_op_file_add', { p_op: opId, p: { kind, scope, title, path, name: file.name, size: file.size } });
            }, 'Contrato anexado');
            closeModal(); draw();
          } catch (e) { err(B.message(e)); }
        };
      };
      host.querySelectorAll('[data-frm]').forEach((b) => (b.onclick = async () => {
        const ok = await B.confirmAction({ title: 'Remover o PDF', text: 'O arquivo deixa de aparecer na operação.', confirmLabel: 'Remover' });
        if (ok == null || ok === false) return;
        try { await run(b, () => rpc('partner_op_file_remove', { p_id: b.dataset.frm }), 'PDF removido'); draw(); } catch (_) { /* já avisado */ }
      }));
      host.querySelectorAll('[data-file]').forEach((b) => (b.onclick = () => B.openFile('boletos', b.dataset.file)));
      host.querySelectorAll('[data-ext]').forEach((b) => (b.onclick = () => B.openFile('boletos', b.dataset.ext)));
      host.querySelectorAll('[data-see]').forEach((b) => (b.onclick = () => B.collectionPopup(b.dataset.see, draw)));
      host.querySelectorAll('[data-legacy]').forEach((b) => (b.onclick = () => B.viewDocument(b.dataset.legacy)));
      const allDone = rowsAll.every(([, , legacy, c]) => legacy.signed || (c && c.signers.length && c.signers.every((x) => x.status === 'signed')));
      if (mode === 'all' && allDone && onComplete) { window.removeEventListener('focus', draw); onComplete(); }
    };
    await draw();
    if (host.isConnected) window.addEventListener('focus', draw);
  };

  B.docUtil = { reais, percentual, dExt, dBr, render, fmtDoc, addr };
})();

/* Seleção de originador + comissão (usado em operações, integralizações e posições) */
(function () {
  'use strict';
  const B = window.BO; const { esc } = B;
  B.commission = {
    html(origs, cur) {
      cur = cur || {}; const ativos = origs.filter((o) => o.active !== false || o.id === cur.originator_id);
      return `<div class="fsec" data-cm><h3>Originador (opcional)</h3>
        <select class="input" name="orig"><option value="">Sem originador</option>${ativos.map((o) => `<option value="${esc(o.id)}" ${o.id === cur.originator_id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
        <div data-cm-body style="${cur.originator_id ? '' : 'display:none'};margin-top:10px">${B.seg('cm_kind', [['percent', '% do valor'], ['fixed', 'Valor fixo']], cur.commission_kind || 'percent')}
          <div class="u-mt8 field"><label data-cm-l>${cur.commission_kind === 'fixed' ? 'Comissão (R$)' : 'Comissão (% do valor)'}</label>
          <input class="input" name="cm_value" data-mask="${cur.commission_kind === 'fixed' ? 'money' : 'rate'}" value="${cur.commission_value != null ? esc(cur.commission_kind === 'fixed' ? B.mask.fmtMoney(cur.commission_value) : String(cur.commission_value).replace('.', ',')) : ''}" placeholder="0,00"></div></div>
        <a class="linkbtn" href="#/cadastros/originador/novo" data-cm-new>+ Cadastrar originador</a></div>`;
    },
    bind(root, origs) {
      const f = root.closest('form') || root, sec = root.querySelector('[data-cm]') || root, body = sec.querySelector('[data-cm-body]');
      const setKind = (k, v) => { const inp = f.cm_value; inp.dataset.mask = k === 'fixed' ? 'money' : 'rate'; sec.querySelector('[data-cm-l]').textContent = k === 'fixed' ? 'Comissão (R$)' : 'Comissão (% do valor)'; inp.value = v != null ? (k === 'fixed' ? B.mask.fmtMoney(v) : String(v).replace('.', ',')) : ''; B.mask.attach(sec); };
      f.cm_kind.addEventListener('change', () => setKind(f.cm_kind.value, null));
      f.orig.addEventListener('change', () => { const o = origs.find((x) => x.id === f.orig.value); body.style.display = o ? '' : 'none'; if (o) { B.setSeg(sec, 'cm_kind', o.default_kind); setKind(o.default_kind, o.default_value); } });
      const nw = sec.querySelector('[data-cm-new]'); if (nw) nw.addEventListener('click', () => B.closeModal());
      B.mask.attach(sec);
    },
    read(root) {
      const f = root.closest('form') || root; if (!f.orig || !f.orig.value) return { originator_id: null };
      const kind = f.cm_kind.value || 'percent';
      return { originator_id: f.orig.value, commission_kind: kind, commission_value: B.mask.parse(f.cm_value.value) || 0 };
    },
  };
})();
