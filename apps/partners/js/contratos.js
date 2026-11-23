/* Lottus Partners — Contratos: modelos editáveis e documentos enviados para assinatura */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, run, closeModal, date, confirmAction } = B;
  const { head, tabs, onTabs, empty } = B.ui;
  const TABS = [['tudo', 'Tudo'], ['rascunho', 'Rascunho'], ['enviados', 'Enviados'], ['assinados', 'Assinados'], ['cancelados', 'Cancelados']];
  const GROUP = { pending: 'rascunho', sent: 'enviados', signed: 'assinados', cancelled: 'cancelados' };
  const EMPTY = { tudo: 'Nenhum documento ainda. Os contratos criados, enviados ou assinados aparecem aqui.', rascunho: 'Nenhum rascunho. Documentos criados e ainda não enviados ficam aqui.', enviados: 'Nenhum documento aguardando assinatura.', assinados: 'Nenhum documento assinado ainda. Aqui aparecem os contratos assinados no app e os enviados pelo fundo.', cancelados: 'Nenhum documento cancelado.' };
  const KIND = { contrato_mae: 'Contrato-mãe', termo_cessao: 'Termo de cessão', nota_comercial: 'Nota comercial', ccb: 'CCB', boletim_subscricao: 'Boletim de subscrição', boletim_resgate: 'Boletim de resgate' };
  const DKIND = { ...KIND, contrato: 'Contrato', aditivo: 'Aditivo', outro: 'Outro', master_agreement: 'Contrato-mãe', anticipation: 'Termo de cessão', funder_acceptance: 'Aceite do fundo' };
  const STATUS = { pending: ['Rascunho', ''], sent: ['Aguardando assinatura', 'warning'], signed: ['Assinado', 'success'], cancelled: ['Cancelado', 'danger'] };
  const VARS = ['cedente_razao', 'cedente_cnpj', 'representante_nome', 'representante_cpf', 'cessionaria_razao', 'cessionaria_cnpj', 'cessionaria_endereco', 'sacado_razao', 'sacado_cnpj',
    'operacao_numero', 'valor_face', 'valor_liquido', 'taxa_mensal', 'numero_parcelas', 'parcelas_tabela', 'serie', 'primeiro_vencimento', 'ultimo_vencimento', 'multa_mora', 'juros_mora', 'foro', 'data_extenso',
    'fundo_razao', 'fundo_cnpj', 'investidor_nome', 'investidor_documento', 'investidor_endereco', 'quantidade', 'pu', 'valor_total', 'valor_bruto', 'iof', 'ir', 'valor_liquido', 'data_resgate'];

  function editor(t, canEdit, reload) {
    const box = B.drawer({ title: KIND[t.kind], subtitle: `Versão ${t.version} · as variáveis entre {{ }} são preenchidas com os dados de cada operação`,
      body: `<form id="tf"><div class="fsec"><h3>Título</h3><input class="input" name="title" value="${esc(t.title)}" ${canEdit ? '' : 'readonly'}></div>
        <div class="fsec"><h3>Texto</h3>${canEdit ? `<div class="chips">${VARS.map((v) => `<button type="button" class="chip" data-var="${v}">${v}</button>`).join('')}</div>` : ''}
          <textarea class="input doc-edit" name="body" ${canEdit ? '' : 'readonly'}>${esc(t.body)}</textarea></div>
        <div class="fsec" id="prev" style="display:none"><h3>Prévia com dados de exemplo</h3><div class="doc-text" id="prev-t"></div></div>
        <div class="note-box small">Modelo-base. Peça para a assessoria jurídica do fundo revisar antes de usar com clientes.</div></form>`,
      foot: `<button class="btn secondary" data-act="preview" type="button">Prévia</button>${canEdit ? '<button class="btn secondary" data-act="reset" type="button">Restaurar padrão</button><button class="btn" data-act="ok">Salvar modelo</button>' : ''}` });
    const f = box.querySelector('#tf'), ta = f.body;
    box.querySelectorAll('[data-var]').forEach((c) => (c.onclick = () => { const s = ta.selectionStart, e = ta.selectionEnd, ins = `{{${c.dataset.var}}}`; ta.value = ta.value.slice(0, s) + ins + ta.value.slice(e); ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length; }));
    box.querySelector('[data-act=preview]').onclick = async (ev) => {
      const sec = box.querySelector('#prev');
      if (sec.style.display !== 'none') { sec.style.display = 'none'; return; }
      const txt = await run(ev.currentTarget, () => rpc('partner_template_preview', { p_body: ta.value }));
      box.querySelector('#prev-t').textContent = txt; sec.style.display = ''; sec.scrollIntoView({ behavior: 'smooth' });
    };
    if (!canEdit) return;
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      try { await run(ev.currentTarget, () => rpc('partner_template_save', { p_kind: t.kind, p_title: f.title.value, p_body: ta.value }), 'Modelo salvo'); closeModal(); reload(); } catch (_) { /* já avisado */ }
    };
    box.querySelector('[data-act=reset]').onclick = async (ev) => {
      const ok = await confirmAction({ title: 'Restaurar o modelo padrão', text: 'O texto atual será substituído pelo modelo-base. Documentos já gerados não mudam.', confirmLabel: 'Restaurar' });
      if (ok == null) return;
      try { await run(ev.currentTarget, () => rpc('partner_template_reset', { p_kind: t.kind }), 'Modelo restaurado'); closeModal(); reload(); } catch (_) { /* já avisado */ }
    };
  }


  /* ---------------- Coletas: contrato próprio em PDF ---------------- */
  const signerRow = (s = {}) => `<div class="rep rep-card"><button type="button" class="btn ghost sm rm" data-rm aria-label="Remover">✕</button>
    <div class="field"><label>Nome</label><input class="input" data-r="name" value="${esc(s.name || '')}"></div>
    <div class="fgrid"><div class="field"><label>CPF</label><input class="input" data-r="cpf" data-mask="cpf"></div><div class="field"><label>Celular (opcional)</label><input class="input" data-r="phone" data-mask="phone"></div></div>
    <div class="field"><label>E-mail</label><input class="input" type="email" data-r="email"></div></div>`;
  const readB64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = no; r.readAsDataURL(file); });

  function newCollection(done, preOp) {
    const box = B.drawer({ title: 'Nova coleta de assinaturas', subtitle: 'Envie um PDF seu para assinatura eletrônica.',
      body: `<form id="cf" novalidate>
        <div class="fsec"><h3>Nome da coleta</h3><div><input class="input" name="name" maxlength="120" data-req="Informe o nome da coleta" placeholder="Ex.: Aditivo ao contrato de mútuo – Acme"><div class="u-mt8 help">Aparece como título do e-mail enviado aos signatários.</div></div></div>
        <div class="fsec"><h3>Documento</h3><label class="filebox"><input type="file" name="file" accept="application/pdf,.pdf" hidden><span class="btn secondary sm">Escolher PDF</span><span class="fname" id="fname">Nenhum arquivo escolhido · até 5 MB</span></label></div>
        <div class="fsec"><h3>Operação (opcional)</h3><select class="input" name="op"><option value="">Sem vínculo</option></select><div class="u-mt8 help">Vinculado, o contrato aparece nos Documentos da operação, junto com o contrato-mãe e o termo.</div></div>
        <div class="fsec"><h3>Mensagem (opcional)</h3><textarea class="input" name="message" rows="3" maxlength="500" placeholder="Texto curto que vai junto no e-mail"></textarea></div>
        <div class="fsec"><h3>Quem vai assinar</h3><div id="sg" class="u-grid12">${signerRow()}</div><button type="button" class="linkbtn" id="addsg">+ Adicionar signatário</button></div>
        <div class="error-box" id="cf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn secondary" data-act="draft">Salvar rascunho</button><button class="btn" data-act="ok">Enviar para assinatura</button>' });
    const f = box.querySelector('#cf'), sg = box.querySelector('#sg'), err = box.querySelector('#cf-err');
    rpc('partner_operations', { p_tab: 'all' }).then((ops) => {
      const money = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      f.op.insertAdjacentHTML('beforeend', (ops || []).filter((o) => o.mine !== false).map((o) => `<option value="${esc(o.id)}">${esc(o.legal_name || 'Operação')} · ${money(o.gross)}${o.created_at ? ' · ' + esc(date(o.created_at)) : ''}</option>`).join(''));
      if (preOp) f.op.value = preOp;
    }).catch(() => { /* sem lista de operações */ });
    f.file.addEventListener('change', () => { const x = f.file.files[0]; box.querySelector('#fname').textContent = x ? `${x.name} · ${(x.size / 1048576).toFixed(1).replace('.', ',')} MB` : 'Nenhum arquivo escolhido · até 5 MB'; });
    const bind = () => sg.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (sg.children.length > 1) b.closest('.rep').remove(); }));
    bind();
    box.querySelector('#addsg').onclick = () => { sg.insertAdjacentHTML('beforeend', signerRow()); B.mask.attach(sg); bind(); };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const submit = (draft) => async (ev) => {
      const signers = [...sg.querySelectorAll('.rep')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-r]')].map((i) => [i.dataset.r, i.value.trim()])));
      const file = f.file.files[0];
      err.hidden = false;
      if (!f.name.value.trim()) { err.textContent = 'Informe o nome da coleta.'; return; }
      if (!file) { err.textContent = 'Escolha o PDF.'; return; }
      if (file.size > 5 * 1024 * 1024) { err.textContent = B.message('file_too_large'); return; }
      if (signers.some((s) => !s.name || s.cpf.replace(/\D/g, '').length !== 11 || !/^\S+@\S+\.\S+$/.test(s.email || ''))) { err.textContent = 'Cada signatário precisa de nome, CPF e e-mail válidos.'; return; }
      err.hidden = true;
      try {
        const pdf_b64 = await readB64(file);
        const r = await run(ev.currentTarget, () => rpc('partner_collection_create', { p: { name: f.name.value.trim(), filename: file.name, message: f.message.value.trim(), pdf_b64, signers, draft, base: ((window.LOTTUS_CONFIG || {}).signUrl || (window.LOTTUS_CONFIG || {}).partnersUrl) } }), draft ? 'Rascunho salvo' : 'Coleta enviada');
        rpc('partner_signers_register', { p: signers }).catch(() => null);
        if (f.op.value && r && r.id) { try { await rpc('partner_collection_link', { p_id: r.id, p_op: f.op.value }); } catch (_) { B.toast('Contrato criado, mas não consegui vincular à operação. Vincule pela tela da operação.', true); } }
        closeModal(); done(r);
      } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
    box.querySelector('[data-act=ok]').onclick = submit(false);
    box.querySelector('[data-act=draft]').onclick = submit(true);
  }

  /* Modelos de contrato: usados em Configurações › Modelos */
  B.newCollection = newCollection;
  B.contractTemplates = async (host, canEdit) => {
    const reload = () => B.contractTemplates(host, canEdit);
    const list = await rpc('partner_templates_list');
    host.innerHTML = `<div class="grid-cards">${list.map((t) => `<div class="card tpl"><div><b>${esc(t.title)}</b><div class="small muted">${KIND[t.kind]} · versão ${t.version}</div></div><button class="btn secondary sm" data-k="${t.kind}">${canEdit ? 'Editar' : 'Ver'}</button></div>`).join('')}</div>`;
    host.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => editor(list.find((t) => t.kind === b.dataset.k), canEdit, reload)));
  };


  /* Contrato já assinado fora da Lottus Sign: envia o PDF e cadastra na lista */
  async function importModal(me, done) {
    const lists = await Promise.all([['cedente', 'Cedente'], ['investidor', 'Investidor'], ['escriturador', 'Escriturador']].map(([k, l]) => rpc('partner_parties_list', { p_kind: k }).then((r) => (r || []).filter((p) => p.origin === 'fundo').map((p) => ({ id: p.id, name: `${p.legal_name} · ${l}` }))).catch(() => [])));
    const parties = lists.flat();
    const kinds = [['contrato', 'Contrato'], ['contrato_mae', 'Contrato-mãe'], ['termo_cessao', 'Termo de cessão'], ['nota_comercial', 'Nota comercial'], ['ccb', 'CCB'], ['boletim_subscricao', 'Boletim de subscrição'], ['boletim_resgate', 'Boletim de resgate'], ['aditivo', 'Aditivo'], ['outro', 'Outro']];
    const box = B.modal({ title: 'Importar contrato assinado', subtitle: 'Para contratos já assinados fora da Lottus Sign. Ficam cadastrados na lista, como assinados.',
      body: `<div class="stack">
        <div class="field"><label for="ic-f">Arquivo PDF (até 5 MB)</label><input class="input" id="ic-f" type="file" accept="application/pdf,.pdf"></div>
        <div class="field"><label for="ic-t">Nome</label><input class="input" id="ic-t" maxlength="160" placeholder="Ex.: Contrato-mãe · Empresa X"></div>
        <div class="grid-2"><div class="field"><label for="ic-k">Tipo</label><select class="input" id="ic-k">${kinds.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
          <div class="field"><label for="ic-d">Data da assinatura</label><input class="input" id="ic-d" data-mask="date" placeholder="dd/mm/aaaa" inputmode="numeric"></div></div>
        <div class="field"><label for="ic-p">Cadastro vinculado <span class="small muted">(opcional)</span></label><select class="input" id="ic-p"><option value="">Nenhum</option>${(parties || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ic-s">Assinantes <span class="small muted">(opcional)</span></label><input class="input" id="ic-s" maxlength="240" placeholder="Nomes separados por vírgula"></div>
        <div class="error-box" id="ic-e" hidden></div></div>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Importar</button>' });
    B.formInit && B.formInit(box); B.mask.attach(box);
    const err = (m) => { const e = box.querySelector('#ic-e'); e.hidden = false; e.textContent = m; };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('#ic-f').onchange = (ev) => { const t = box.querySelector('#ic-t'), f = ev.target.files[0]; if (f && !t.value) t.value = f.name.replace(/\.pdf$/i, ''); };
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const file = box.querySelector('#ic-f').files[0], title = box.querySelector('#ic-t').value.trim();
      if (!file || !/\.pdf$/i.test(file.name)) return err('Envie o PDF do contrato assinado.');
      if (file.size > 5 * 1024 * 1024) return err('O PDF passa de 5 MB.');
      if (!title) return err('Dê um nome ao contrato.');
      const dv = box.querySelector('#ic-d').value.trim(), iso = dv ? B.mask.iso(box.querySelector('#ic-d')) : null;
      if (dv && !iso) return err('Confira a data da assinatura.');
      try {
        await run(ev.currentTarget, async () => {
          const m = await rpc('partner_me');
          const path = `${m.funder.id}/contratos/${Date.now()}.pdf`;
          const { error } = await B.sb.storage.from('boletos').upload(path, file, { contentType: 'application/pdf', upsert: false });
          if (error) throw new Error('Não conseguimos enviar o PDF: ' + error.message);
          return rpc('partner_contract_import', { p: { title, kind: box.querySelector('#ic-k').value, signed_on: iso, party_id: box.querySelector('#ic-p').value || null, signers: box.querySelector('#ic-s').value, path, name: file.name, size: file.size } });
        }, 'Contrato importado');
        closeModal(); done();
      } catch (e) { err(B.message(e)); }
    };
  }
  function impPopup(c, me, reload) {
    const admin = !me || me.is_admin !== false;
    const box = B.modal({ title: c.title, subtitle: `${esc(DKIND[c.kind] || 'Contrato')} · importado${c.signed_on ? ' · assinado em ' + esc(date(c.signed_on)) : ''}`,
      body: `<div class="stack">${c.party ? `<div><span class="small muted">Cadastro</span><br><b>${esc(c.party)}</b></div>` : ''}${c.signers ? `<div><span class="small muted">Assinantes</span><br>${esc(c.signers)}</div>` : ''}<div class="small muted">${esc(c.file_name || 'contrato.pdf')}</div></div>`,
      foot: `${admin ? '<button class="u-mr-auto btn ghost" data-act="del">Excluir</button>' : ''}<button class="btn secondary" data-act="cancel">Fechar</button><button class="btn" data-act="open">Abrir PDF</button>` });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=open]').onclick = () => B.openFile('boletos', c.file_path);
    const del = box.querySelector('[data-act=del]');
    if (del) del.onclick = async () => {
      const ok = await confirmAction({ title: 'Excluir o contrato importado', text: 'Ele deixa de aparecer na lista. O PDF original não é recuperado depois.', confirmLabel: 'Excluir', danger: true });
      if (ok == null) return;
      try { await run(del, () => rpc('partner_contract_import_delete', { p_id: c.id }), 'Contrato excluído'); closeModal(); reload(); } catch (_) { /* já avisado */ }
    };
  }

  B.views.contratos = async (el, [rawTab], me) => {
    if (rawTab === 'modelos') { location.hash = '#/config/modelos/contratos'; return; }
    const tab = TABS.some(([k]) => k === rawTab) ? rawTab : 'tudo';
    const reload = () => B.views.contratos(el, [tab], me);
    {
      const [docs, cols, imps] = await Promise.all([rpc('partner_docs_list', {}), rpc('partner_collections_list').catch(() => []), rpc('partner_contracts_imported').catch(() => [])]);
      // Coletas de assinatura entram na mesma lista, com a situação própria
      const asRow = (c) => {
        const sg = c.signers || [], done = sg.filter((x) => x.status === 'signed'), all = sg.length > 0 && done.length === sg.length;
        const status = c.status === 'draft' ? 'pending' : c.status === 'cancelled' ? 'cancelled' : all ? 'signed' : 'sent';
        const who = sg.filter((x) => !x.auto).map((x) => x.name).filter(Boolean);
        return { id: c.id, _col: true, title: c.name.split(' · ')[0], kind: String(c.kind || '').replace(/^op_/, ''), company: c.name.includes(' · ') ? c.name.split(' · ').slice(1).join(' · ') : '', signer: who.join(', '),
          email: `${done.length} de ${sg.length} assinaram`, status, sent_at: c.status === 'draft' ? null : c.created_at, signed_at: all ? done.map((x) => x.signed_at).sort().pop() : null, created_at: c.created_at };
      };
      const impRow = (c) => ({ id: c.id, _imp: c, title: c.title, kind: c.kind, company: c.party || '', signer: c.signers || '', email: '', status: 'signed', sent_at: null, signed_at: c.signed_on, created_at: c.created_at, origin: 'import' });
      const list = [...docs, ...cols.map(asRow), ...imps.map(impRow)].filter((d) => tab === 'tudo' || GROUP[d.status] === tab)
        .sort((a, b) => String(b.sent_at || b.created_at || '').localeCompare(String(a.sent_at || a.created_at || '')));
      let paintList; const bindRows = () => {
        el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => B.viewDocument(b.dataset.view, reload)));
        el.querySelectorAll('[data-colview]').forEach((b) => (b.onclick = () => B.collectionPopup(b.dataset.colview, reload).catch((e) => B.toast(B.message(e), true))));
        el.querySelectorAll('[data-impview]').forEach((b) => (b.onclick = () => impPopup(imps.find((c) => c.id === b.dataset.impview), me, reload)));
      };
      el.innerHTML = head('Contratos', 'Documentos do fundo por situação', '<span class="u-g8 row"><button class="btn secondary" id="impcol">Importar assinado</button><button class="btn" id="newcol">Nova coleta</button></span>') + tabs(TABS, tab)
        + '<div id="dl"></div>';
      paintList = () => { const pg = B.ui.pager('docs:' + tab, list, { unit: list.length === 1 ? 'documento' : 'documentos', cols: [(d) => d.title, (d) => d.company, (d) => d.signer, (d) => (STATUS[d.status] || STATUS.pending)[0], (d) => d.sent_at, (d) => d.signed_at] }); el.querySelector('#dl').innerHTML = list.length ? `<div class="card"><table><thead><tr><th>Documento</th><th>Empresa</th><th>Signatário</th><th>Situação</th><th>Enviado</th><th>Assinado</th><th></th></tr></thead><tbody>
          ${pg.rows.map((d) => { const st = STATUS[d.status] || STATUS.pending; return `<tr><td><b>${esc(d.title)}</b><div class="small muted">${esc(DKIND[d.kind] || '')}${d.origin === 'app' ? ' · assinado no app Lottus' : d.origin === 'import' ? ' · importado' : ''}</div></td><td>${esc(d.company)}</td><td>${esc(d.signer || '—')}${d.email ? `<div class="small muted">${esc(d.email)}</div>` : ''}</td>
            <td><span class="tag ${st[1]}">${st[0]}</span></td><td>${d.sent_at ? esc(date(d.sent_at)) : '—'}</td><td>${d.signed_at ? esc(date(d.signed_at)) : '—'}</td>
            <td class="num"><button class="btn ghost sm" ${d._imp ? 'data-impview' : d._col ? 'data-colview' : 'data-view'}="${esc(d.id)}">Ver</button></td></tr>`; }).join('')}</tbody></table>${pg.bar}</div>` : `<div class="card">${empty(EMPTY[tab])}</div>`; B.ui.pagerBind(el, 'docs:' + tab, paintList); bindRows(); };      paintList();
      el.querySelector('#impcol').onclick = () => importModal(me, (r) => { if (tab === 'tudo' || tab === 'assinados') reload(); else location.hash = '#/contratos/assinados'; });
      el.querySelector('#newcol').onclick = () => newCollection((r) => { const t = r && r.links && r.links.length ? 'enviados' : 'rascunho'; if (t === tab) reload(); else location.hash = `#/contratos/${t}`; });
      el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => B.viewDocument(b.dataset.view, reload)));
      el.querySelectorAll('[data-resend]').forEach((b) => (b.onclick = () => B.resendDocument(b.dataset.resend, reload)));
      el.querySelectorAll('[data-dcx]').forEach((b) => (b.onclick = async () => {
        const ok = await confirmAction({ title: 'Cancelar documento', text: 'O link enviado deixa de funcionar e o documento vai para "Cancelados".', confirmLabel: 'Cancelar documento', danger: true });
        if (ok == null) return;
        try { await run(b, () => rpc('partner_doc_cancel', { p_id: b.dataset.dcx }), 'Documento cancelado'); reload(); } catch (_) { /* já avisado */ }
      }));
    }
    onTabs(el, (k) => { location.hash = `#/contratos/${k}`; });
  };
})();
