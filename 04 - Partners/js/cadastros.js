/* Lottus Partners — Cadastros: cedentes e sacados do fundo */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, run, closeModal, confirmAction, date } = B;
  const { head, tabs, onTabs, empty } = B.ui;
  const TABS = [['cedente', 'Cedentes'], ['sacado', 'Sacados'], ['investidor', 'Investidores'], ['parceiros', 'Parceiros'], ['outro', 'Outros']];
  const SUBTITLE = 'Cedentes, sacados, investidores, parceiros e outros';
  const pfpj = (k) => k === 'investidor' || k === 'outro'; // aceitam pessoa física ou jurídica
  const LABEL = { cedente: 'Cedente', sacado: 'Sacado', investidor: 'Investidor', escriturador: 'Escriturador', outro: 'Cadastro' };
  const BANKS = [['001', 'Banco do Brasil'], ['033', 'Santander'], ['104', 'Caixa'], ['237', 'Bradesco'], ['341', 'Itaú'], ['260', 'Nubank'], ['077', 'Inter'], ['336', 'C6 Bank'], ['290', 'PagBank'], ['380', 'PicPay'], ['756', 'Sicoob'], ['748', 'Sicredi'], ['422', 'Safra'], ['655', 'Votorantim'], ['197', 'Stone']];
  const fmtCnpj = (c) => String(c || '').length === 11 ? String(c).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(c || '').replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  const digits = (v) => String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

  const repRow = (r = {}) => `<div class="rep rep-card">
    <button type="button" class="btn ghost sm rm" data-rm aria-label="Remover representante">✕</button>
    <div class="field"><label>Nome</label><input class="input" data-r="name" value="${esc(r.name || '')}"></div>
    <div class="fgrid"><div class="field"><label>CPF</label><input class="input" data-r="cpf" data-mask="cpf" value="${esc(r.cpf || '')}"></div>
      <div class="field"><label>Celular</label><input class="input" data-r="phone" data-mask="phone" value="${esc(r.phone || '')}"></div></div>
    <div class="field"><label>E-mail</label><input class="input" type="email" data-r="email" value="${esc(r.email || '')}"></div></div>`;

  const bankSection = (b = {}, kind = 'cedente') => {
    const known = BANKS.some(([c]) => c === b.bank_code);
    const ttl = kind === 'investidor' ? 'Conta para resgates e pagamentos' : kind === 'originador' ? 'Dados bancários' : kind === 'escriturador' || kind === 'outro' ? 'Dados bancários para pagamento' : 'Conta para receber';
    return `<div class="fsec" id="bank-sec"><h3>${ttl}</h3>
      <div class="field"><label>Banco</label><select class="input" name="bank_sel"><option value="">Selecione…</option>${BANKS.map(([c, n]) => `<option value="${c}" ${c === b.bank_code ? 'selected' : ''}>${c} · ${n}</option>`).join('')}<option value="other" ${b.bank_code && !known ? 'selected' : ''}>Outro banco…</option></select></div>
      <div class="fgrid" id="bank-other" style="${b.bank_code && !known ? '' : 'display:none'}"><div class="field"><label>Código do banco</label><input class="input" name="bank_code" data-mask="int" maxlength="3" value="${esc(b.bank_code && !known ? b.bank_code : '')}"></div>
        <div class="field"><label>Nome do banco</label><input class="input" name="bank_name" value="${esc(b.bank_code && !known ? b.bank_name || '' : '')}"></div></div>
      <div class="fgrid"><div class="field"><label>Agência</label><input class="input" name="branch" data-mask="int" maxlength="5" value="${esc(b.branch || '')}"></div>
        <div class="field"><label>Conta (com dígito)</label><div class="u-g8 row"><input class="input" name="account_number" data-mask="int" maxlength="13" style="flex:3" value="${esc(b.account_number || '')}"><input class="u-flex1 input" name="account_digit" maxlength="1" placeholder="D" value="${esc(b.account_digit || '')}"></div></div></div>
      ${B.seg('account_type', [['checking', 'Conta corrente'], ['payment', 'Conta de pagamento']], b.account_type || 'checking')}
      ${kind === 'originador' ? '' : `<div class="field"><label>Chave Pix <span class="small muted">(opcional)</span></label><input class="input" name="bank_pix" maxlength="80" autocomplete="off" value="${esc(b.pix_key || '')}"></div>`}
      <div class="help">${kind === 'investidor' ? 'A conta precisa ser do próprio investidor.' : kind === 'originador' ? 'Conta onde o originador recebe as comissões.' : kind === 'escriturador' ? 'Conta onde o escriturador recebe o custo de escrituração.' : kind === 'outro' ? 'Conta onde o cadastro recebe os pagamentos do fundo.' : 'A conta precisa ser do próprio cedente (mesmo CNPJ).'}</div></div>`;
  };

  const readBank = (f) => {
    if (!f.bank_sel || !f.bank_sel.value || !f.account_number.value) return null;
    const other = f.bank_sel.value === 'other';
    return { bank_code: other ? f.bank_code.value : f.bank_sel.value, bank_name: other ? f.bank_name.value.trim() : (BANKS.find(([c]) => c === f.bank_sel.value) || [])[1] || '', branch: f.branch.value, account_number: f.account_number.value, account_digit: f.account_digit.value.toUpperCase(), account_type: f.account_type.value };
  };

  const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const idFields = (kind, pj, p, ro) => pfpj(kind)
    ? `<div class="field"><label>${pj ? 'CNPJ' : 'CPF'}</label><input class="input mono" name="cnpj" data-mask="${pj ? 'cnpj' : 'cpf'}" data-req="Informe o ${pj ? 'CNPJ' : 'CPF'}" placeholder="${pj ? '00.000.000/0000-00' : '000.000.000-00'}" value="${esc(fmtCnpj(p.cnpj || ''))}" ${ro ? 'readonly' : ''}></div>
       <div class="field"><label>${pj ? 'Razão social' : 'Nome completo'}</label><input class="input" name="legal_name" data-req="Informe o nome" value="${esc(p.legal_name || '')}"></div>`
    : `<div class="field"><label>CNPJ</label><input class="input mono" name="cnpj" data-mask="cnpj" data-req="Informe o CNPJ" placeholder="00.000.000/0000-00" value="${esc(fmtCnpj(p.cnpj || ''))}" ${ro ? 'readonly' : ''}></div>
       <div class="field"><label>Razão social</label><input class="input" name="legal_name" data-req="Informe a razão social" value="${esc(p.legal_name || '')}"></div>`;
  const addrFields = (a) => { a = a && typeof a === 'object' ? a : {}; const v = (k) => esc(a[k] || '');
    return `<div class="fsec"><h3>Endereço</h3>
      <div class="fgrid"><div class="field"><label>CEP</label><input class="input" name="a_zip" inputmode="numeric" maxlength="9" placeholder="00000-000" value="${v('zip')}"></div><div class="field"><label>Número</label><input class="input" name="a_number" maxlength="12" value="${v('number')}"></div></div>
      <div class="field"><label>Rua</label><input class="input" name="a_street" maxlength="120" value="${v('street')}"></div>
      <div class="fgrid"><div class="field"><label>Complemento</label><input class="input" name="a_compl" maxlength="60" value="${v('compl')}"></div><div class="field"><label>Bairro</label><input class="input" name="a_district" maxlength="80" value="${v('district')}"></div></div>
      <div class="fgrid"><div class="field"><label>Cidade</label><input class="input" name="a_city" maxlength="80" value="${v('city')}"></div><div class="field"><label>UF</label><select class="input" name="a_uf"><option value="">—</option>${UFS.map((u) => `<option ${u === a.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div></div>`; };

  /* ---------------- Documentos do cadastro (contrato social, RG, comprovantes…) ---------------- */
  const DOCKINDS = { cedente: [['contrato_social', 'Contrato social'], ['balanco', 'Balanço / DRE'], ['identidade', 'Documento dos sócios'], ['comprovante', 'Comprovante de endereço'], ['outro', 'Outro']],
    sacado: [['contrato_social', 'Contrato social'], ['identidade', 'Documento dos sócios'], ['comprovante', 'Comprovante de endereço'], ['outro', 'Outro']],
    investidor: [['identidade', 'Documento de identidade'], ['comprovante', 'Comprovante de endereço'], ['contrato_social', 'Contrato social'], ['qualificacao', 'Declaração de investidor'], ['outro', 'Outro']] };
  const readB64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = no; r.readAsDataURL(file); });
  async function partyDocs(host, partyId, kind) {
    const kinds = DOCKINDS[kind] || DOCKINDS.cedente, kl = Object.fromEntries(kinds);
    const draw = async () => {
      const list = await rpc('partner_party_docs', { p_party: partyId });
      host.innerHTML = (list.length ? `<div class="pdoc-list">${list.map((d) => `<div class="pdoc"><div><b>${esc(d.filename)}</b><div class="small muted">${esc(kl[d.kind] || 'Outro')} · ${(d.size / 1048576 < 0.1 ? Math.max(1, Math.round(d.size / 1024)) + ' KB' : (d.size / 1048576).toFixed(1).replace('.', ',') + ' MB')} · ${esc(date(d.created_at))}</div></div>
          <div><button type="button" class="btn ghost sm" data-dv="${esc(d.id)}">Ver</button> <button type="button" class="btn ghost sm" data-dd="${esc(d.id)}">Excluir</button></div></div>`).join('')}</div>` : '<div class="small muted" style="margin-bottom:10px">Nenhum documento anexado.</div>')
        + `<div class="pdoc-add"><select class="input" id="pd-kind">${kinds.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <label class="filebox"><input type="file" id="pd-file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" hidden><span class="btn secondary sm">Anexar arquivo</span><span class="fname">PDF, PNG ou JPG · até 5 MB</span></label></div>`;
      host.querySelector('#pd-file').onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (file.size > 5 * 1024 * 1024) { B.toast(B.message('file_too_large'), 'error'); return; }
        const mime = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
        try { const content_b64 = await readB64(file); await run(e.target, () => rpc('partner_party_doc_add', { p: { party_id: partyId, kind: host.querySelector('#pd-kind').value, filename: file.name, mime, content_b64 } }), 'Documento anexado'); draw(); } catch (_) { /* já avisado */ }
      };
      host.querySelectorAll('[data-dv]').forEach((b) => (b.onclick = async () => {
        const d = await run(b, () => rpc('partner_party_doc_get', { p_id: b.dataset.dv })); if (!d) return;
        const u8 = Uint8Array.from(atob(d.content_b64), (c) => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([u8], { type: d.mime }));
        const w = window.open(url, '_blank', 'noopener'); if (!w) { const a = document.createElement('a'); a.href = url; a.download = d.filename; a.click(); }
      }));
      host.querySelectorAll('[data-dd]').forEach((b) => (b.onclick = async () => {
        const ok = await confirmAction({ title: 'Excluir documento', text: 'O arquivo será removido deste cadastro.', confirmLabel: 'Excluir', danger: true }); if (ok == null) return;
        try { await run(b, () => rpc('partner_party_doc_delete', { p_id: b.dataset.dd }), 'Documento excluído'); draw(); } catch (_) { /* já avisado */ }
      }));
    };
    draw();
  }

  /* Convite ao Lottus Invest + acompanhamento real do envio do e-mail */
  B.inviteInvestor = async (id, name, email, btn) => {
    if (!email) { B.toast('Cadastre o e-mail do investidor (Editar) para enviar o convite.', true); return; }
    const ok = await confirmAction({ title: 'Convidar para o Lottus Invest', text: `Enviar e-mail para <b>${esc(email)}</b> com o link pessoal para criar a conta no app Lottus Invest?`, confirmLabel: 'Enviar convite' });
    if (ok == null) return;
    let r;
    try { r = await run(btn, () => rpc('partner_investor_invite', { p_investor: id })); } catch (_) { return; }
    B.toast('Convite gerado. Conferindo o envio do e-mail…');
    let st = null;
    for (let i = 0; i < 6; i++) {
      await new Promise((res) => setTimeout(res, 2500));
      try { st = await rpc('partner_email_state', { p_id: r.email_id }); } catch (_) { break; }
      if (st.status !== 'queued') break;
    }
    if (st && st.status === 'failed') { B.toast(`Convite criado, mas o e-mail não foi aceito pelo provedor${st.error ? ': ' + st.error : ''}.`, true); return; }
    B.toast(`Convite enviado para ${email}`);
  };

  function edit(kind, party, done) {
    const p = party || {};
    const isPj = pfpj(kind) && p.cnpj ? String(p.cnpj).length === 14 : false;
    const box = B.drawer({ title: party ? (kind === 'investidor' ? 'Editar investidor' : kind === 'outro' ? 'Editar cadastro' : 'Editar empresa') : (kind === 'investidor' ? 'Novo investidor' : kind === 'outro' ? 'Novo cadastro' : 'Nova empresa'), subtitle: kind === 'outro' ? 'Quem o fundo paga ou de quem recebe fora das operações (fornecedor, prestador, banco…).' : kind === 'investidor' ? 'Dados usados no boletim de subscrição e nos pagamentos.' : kind === 'escriturador' ? 'Os dados entram automaticamente no termo de emissão para assinatura.' : 'Os dados preenchem os contratos automaticamente.',
      body: `<form id="pf" novalidate>
        <div class="fsec"><h3>Tipo</h3>${pfpj(kind) ? `${party && party.id ? `<div class="tag">${isPj ? 'Pessoa jurídica' : 'Pessoa física'}</div><input type="hidden" name="pessoa" value="${isPj ? 'pj' : 'pf'}">` : B.seg('pessoa', [['pf', 'Pessoa física'], ['pj', 'Pessoa jurídica']], 'pf')}<input type="hidden" name="kind" value="investidor">` : (party && party.id) ? `<div class="tag">${LABEL[kind]}</div><input type="hidden" name="kind" value="${kind}">` : kind === 'escriturador' ? B.seg('kind', [['escriturador', 'Escriturador'], ['originador', 'Originador']], 'escriturador') : B.seg('kind', [['cedente', 'Cedente'], ['sacado', 'Sacado']], kind)}</div>
        <div class="fsec"><h3>${kind === 'investidor' ? 'Investidor' : kind === 'outro' ? 'Cadastro' : 'Empresa'}</h3><div id="idf">${idFields(kind, isPj, p, !!party)}</div></div>
        <div class="fsec"><h3>Contato</h3><div class="fgrid">
          <div class="field"><label>E-mail</label><input class="input" type="email" name="email" value="${esc(p.email || '')}"></div>
          <div class="field"><label>Telefone</label><input class="input" name="phone" data-mask="phone" value="${esc(p.phone || '')}"></div></div></div>
        ${pfpj(kind) || kind === 'escriturador' ? addrFields(p.address) : ''}
        ${pfpj(kind) ? '' : `<div class="fsec"><h3>Representantes</h3><div id="reps" class="u-grid12">${(p.representatives && p.representatives.length ? p.representatives : [{}]).map(repRow).join('')}</div>
          <button type="button" class="linkbtn" id="addrep">+ Adicionar representante</button></div>`}
        <div id="bank-host">${kind === 'cedente' || pfpj(kind) || kind === 'escriturador' ? bankSection(p.bank || {}, kind) : ''}</div>
        ${p.id ? '<div class="fsec"><h3>Documentos</h3><div id="pdocs"></div></div>' : '<div class="fsec"><h3>Documentos</h3><div class="small muted">Salve o cadastro primeiro; depois é só editar para anexar os documentos.</div></div>'}
        <div class="error-box" id="pf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    const f = box.querySelector('#pf'), err = box.querySelector('#pf-err'), reps = box.querySelector('#reps') || document.createElement('div'), bankHost = box.querySelector('#bank-host');
    const bind = () => reps && reps.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { b.closest('.rep').remove(); }));
    const bindBank = () => {
      const sel = f.bank_sel; if (!sel) return;
      sel.onchange = () => { box.querySelector('#bank-other').style.display = sel.value === 'other' ? '' : 'none'; };
      B.formInit(bankHost); B.mask.attach(bankHost);
    };
    bind(); bindBank();
    if (p.id) partyDocs(box.querySelector('#pdocs'), p.id, kind);
    const kindInput = f.kind;
    if (kind === 'escriturador' && !(party && party.id)) f.addEventListener('change', (ev) => { if (ev.target.name === 'kind' && ev.target.value === 'originador') { closeModal(); B.originatorForm(null, () => { location.hash = '#/cadastros/originador'; }); } });
    kindInput.addEventListener('change', () => { if (kindInput.value !== 'cedente' && kindInput.value !== 'sacado') return; bankHost.innerHTML = kindInput.value === 'cedente' ? bankSection({}) : ''; bindBank(); });
    const ar = box.querySelector('#addrep'); if (ar) ar.onclick = () => { reps.insertAdjacentHTML('beforeend', repRow()); B.mask.attach(reps); bind(); };
    if (pfpj(kind) || kind === 'escriturador') {
      if (f.pessoa) f.pessoa.addEventListener('change', () => { const pj = f.pessoa.value === 'pj'; box.querySelector('#idf').innerHTML = idFields(kind, pj, {}, false); B.mask.attach(box.querySelector('#idf')); B.formInit(box.querySelector('#idf')); });
      const zip = f.a_zip;
      zip.addEventListener('input', () => { const d = zip.value.replace(/\D/g, '').slice(0, 8); zip.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; });
      zip.addEventListener('blur', async () => { const d = zip.value.replace(/\D/g, ''); if (d.length !== 8) return; try { const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${d}`); if (r.ok) { const j = await r.json(); if (!f.a_street.value) f.a_street.value = j.street || ''; if (!f.a_district.value) f.a_district.value = j.neighborhood || ''; if (!f.a_city.value) f.a_city.value = j.city || ''; if (j.state) f.a_uf.value = j.state; f.a_number.focus(); } } catch (_) { /* digitação manual */ } });
    }
    box.querySelector('#idf').addEventListener('blur', async (ev) => {
      if (ev.target.name !== 'cnpj') return;
      const c = digits(f.cnpj.value);
      if ((!pfpj(kind) || f.pessoa.value === 'pj') && c.length === 14 && !f.legal_name.value) { try { const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`); if (r.ok) { const j = await r.json(); f.legal_name.value = j.razao_social || ''; B.fieldError(f.legal_name, ''); if (!f.email.value && j.email) f.email.value = String(j.email).toLowerCase(); } } catch (_) { /* digitação manual */ } }
    }, true);
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const representatives = [...reps.querySelectorAll('.rep')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-r]')].map((i) => [i.dataset.r, i.value.trim()]))).filter((r) => r.name || r.email || r.cpf);
      const body = { kind: kindInput.value, cnpj: digits(f.cnpj.value), legal_name: f.legal_name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), representatives };
      if (pfpj(kind) || kind === 'escriturador') { body.address = { zip: f.a_zip.value.trim(), street: f.a_street.value.trim(), number: f.a_number.value.trim(), compl: f.a_compl.value.trim(), district: f.a_district.value.trim(), city: f.a_city.value.trim(), uf: f.a_uf.value }; if (!Object.values(body.address).some(Boolean)) delete body.address; }
      if ((body.kind === 'cedente' || pfpj(body.kind) || body.kind === 'escriturador') && f.bank_sel && f.bank_sel.value && f.account_number.value) {
        const other = f.bank_sel.value === 'other';
        body.bank = { bank_code: other ? f.bank_code.value : f.bank_sel.value, bank_name: other ? f.bank_name.value.trim() : (BANKS.find(([c]) => c === f.bank_sel.value) || [])[1] || '', branch: f.branch.value, account_number: f.account_number.value, account_digit: f.account_digit.value.toUpperCase(), account_type: f.account_type.value };
      }
      const pix = f.bank_pix ? f.bank_pix.value.trim() : '';
      if (pix) body.bank = { ...(body.bank || {}), pix_key: pix };
      let bad = false;
      const need = pfpj(body.kind) && f.pessoa && f.pessoa.value === 'pf' ? 11 : 14; if (body.cnpj.length !== need) { B.fieldError(f.cnpj, need === 11 ? 'Informe um CPF válido' : 'Informe um CNPJ válido'); bad = true; }
      if (!body.legal_name) { B.fieldError(f.legal_name, 'Informe a razão social'); bad = true; }
      if (bad) return;
      if (representatives.some((r) => !r.name || r.cpf.replace(/\D/g, '').length !== 11 || !/^\S+@\S+\.\S+$/.test(r.email || ''))) { err.hidden = false; err.textContent = 'Cada representante precisa de nome, CPF e e-mail válidos.'; return; }
      try { await run(ev.currentTarget, () => rpc('partner_party_save', { p: body }), 'Empresa salva'); closeModal(); done(body.kind); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  /* ---------------- Originadores (quem traz operações e investidores e recebe comissão) ---------------- */
  const commTxt = (o) => (o.default_kind === 'fixed' ? B.brl(o.default_value) : String(o.default_value).replace('.', ',') + '%');
  B.originatorForm = function (o, done) {
    const p = o || {};
    const box = B.drawer({ title: o ? 'Editar originador' : 'Novo originador', subtitle: 'Quem traz operações ou investidores e recebe comissão.',
      body: `<form id="of" novalidate>
        ${o ? '' : `<div class="fsec"><h3>Tipo</h3>${B.seg('kind', [['escriturador', 'Escriturador'], ['originador', 'Originador']], 'originador')}</div>`}
        <div class="fsec"><h3>Dados</h3>
          <div class="field"><label>Nome</label><input class="input" name="name" data-req="Informe o nome" value="${esc(p.name || '')}"></div>
          <div class="fgrid"><div class="field"><label>CPF ou CNPJ</label><input class="input mono" name="document" inputmode="numeric" value="${esc(fmtCnpj(p.document || ''))}"></div>
            <div class="field"><label>Telefone</label><input class="input" name="phone" data-mask="phone" value="${esc(p.phone || '')}"></div></div>
          <div class="fgrid"><div class="field"><label>E-mail</label><input class="input" type="email" name="email" value="${esc(p.email || '')}"></div>
            <div class="field"><label>Chave Pix</label><input class="input" name="pix_key" value="${esc(p.pix_key || '')}"></div></div></div>
        <div id="ob-host">${bankSection(p.bank || {}, 'originador')}</div>
        <div class="fsec"><h3>Comissão padrão</h3>${B.seg('default_kind', [['percent', 'Porcentagem'], ['fixed', 'Valor fixo']], p.default_kind || 'percent')}
          <div class="field"><label id="dv-l">${p.default_kind === 'fixed' ? 'Valor por operação' : '% sobre o valor da operação'}</label><input class="input" name="default_value" data-mask="${p.default_kind === 'fixed' ? 'money' : 'rate'}" value="${p.default_value != null ? esc(p.default_kind === 'fixed' ? B.mask.fmtMoney(p.default_value) : String(p.default_value).replace('.', ',')) : ''}" placeholder="0,00"></div>
          <div class="help">Esse valor já vem preenchido em cada operação ou integralização, e pode ser trocado caso a caso.</div></div>
        ${o ? `<label class="swrow"><span><b>Ativo</b><span class="small">Desative para não aparecer mais nas listas.</span></span><input type="checkbox" name="active" ${p.active === false ? '' : 'checked'}></label>` : ''}
        <div class="error-box" id="of-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    const f = box.querySelector('#of'), err = box.querySelector('#of-err');
    if (!o) f.addEventListener('change', (ev) => { if (ev.target.name === 'kind' && ev.target.value === 'escriturador') { closeModal(); edit('escriturador', null, () => { location.hash = '#/cadastros/escriturador'; }); } });
    B.mask.attach(f);
    const obh = box.querySelector('#ob-host'); f.bank_sel.onchange = () => { box.querySelector('#bank-other').style.display = f.bank_sel.value === 'other' ? '' : 'none'; }; B.formInit(obh); B.mask.attach(obh);
    f.default_kind.addEventListener('change', () => { const fx = f.default_kind.value === 'fixed'; box.querySelector('#dv-l').textContent = fx ? 'Valor por operação' : '% sobre o valor da operação'; f.default_value.dataset.mask = fx ? 'money' : 'rate'; f.default_value.value = ''; B.mask.attach(f); });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      if (!f.name.value.trim()) return B.fieldError(f.name, 'Informe o nome');
      const body = { id: p.id || null, name: f.name.value.trim(), document: digits(f.document.value), email: f.email.value.trim(), phone: f.phone.value.trim(), pix_key: f.pix_key.value.trim(),
        default_kind: f.default_kind.value, default_value: B.mask.parse(f.default_value.value) || 0, active: f.active ? f.active.checked : true };
      if (body.default_kind === 'percent' && body.default_value > 100) { err.hidden = false; err.textContent = 'A porcentagem não pode passar de 100%.'; return; }
      const bank = readBank(f);
      if (f.bank_sel.value && !bank) { err.hidden = false; err.textContent = 'Informe a agência e a conta, ou deixe o banco em branco.'; return; }
      try { await run(ev.currentTarget, async () => { const r = await rpc('partner_originator_save', { p: body }); const id = (r && r.id) || p.id; if (id && (bank || p.bank)) await rpc('partner_originator_bank_save', { p_id: id, p_bank: bank }); }, 'Originador salvo'); closeModal(); done && done(); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  };

  /* Moldura comum: abas, e dentro de "Parceiros" a escolha entre escrituradores e originadores */
  const PSUB = [['escriturador', 'Escrituradores'], ['originador', 'Originadores']];
  const frame = (el, tab, sub, newLabel, extra = '') => {
    el.innerHTML = head('Cadastros', SUBTITLE, `<button class="btn" id="new">${newLabel}</button>`)
      + `<div class="ops-bar">${tabs(TABS, tab)}${extra}</div>`
      + (tab === 'parceiros' ? `<div class="u-g6mb14 row">${PSUB.map(([k, l]) => B.pill('data-sub', k, l, sub)).join('')}</div>` : '') + '<div id="list"></div>';
    onTabs(el, (k) => { location.hash = `#/cadastros/${k === 'parceiros' ? (partnerSub || 'escriturador') : k}`; });
    el.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => { location.hash = `#/cadastros/${b.dataset.sub}`; }));
  };
  let partnerSub = 'escriturador';

  async function originadores(el, act) {
    const list = await rpc('partner_originators_list');
    frame(el, 'parceiros', 'originador', 'Novo originador');
    const pg = B.ui.pager('orig', list.map((o, i) => [o, i]), { unit: list.length === 1 ? 'originador' : 'originadores' });
    el.querySelector('#list').innerHTML = list.length ? `<div class="card"><table><thead><tr><th>Originador</th><th>Comissão padrão</th><th class="num">Negócios</th><th class="num">Comissões</th><th></th></tr></thead><tbody>
        ${pg.rows.map(([o, i]) => `<tr><td><b>${esc(o.name)}</b>${o.active === false ? ' <span class="tag">Inativo</span>' : ''}<div class="small muted">${esc(o.email || o.phone || '')}</div></td><td>${esc(commTxt(o))}</td><td class="num">${esc(o.deals)}</td><td class="num">${B.brl(o.commission)}</td>
          <td class="num"><button class="btn ghost sm" data-e="${i}">Editar</button> <button class="btn ghost sm" data-d="${i}">Excluir</button></td></tr>`).join('')}</tbody></table>${pg.bar}</div>`
        : `<div class="card">${empty('Nenhum originador ainda. Cadastre quem traz operações e investidores para você.')}</div>`;
    const again = () => originadores(el);
    B.ui.pagerBind(el, 'orig', again);
    el.querySelector('#new').onclick = () => B.originatorForm(null, again);
    el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => B.originatorForm(list[b.dataset.e], again)));
    el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => {
      const o = list[b.dataset.d];
      const ok = await confirmAction({ title: 'Excluir originador', text: `Remover <b>${esc(o.name)}</b>? Se houver negócios com ele, o cadastro só é desativado.`, confirmLabel: 'Excluir', danger: true });
      if (ok == null) return;
      try { await run(b, () => rpc('partner_originator_delete', { p_id: o.id }), 'Originador removido'); again(); } catch (_) { /* já avisado */ }
    }));
    if (act === 'novo') { history.replaceState(null, '', '#/cadastros/originador'); B.originatorForm(null, again); }
  }

  const NEW_LABEL = { investidor: 'Novo investidor', escriturador: 'Novo escriturador', outro: 'Novo cadastro' };
  B.partyForm = edit;
  B.views.cadastros = async (el, [rawKind, act]) => {
    let kind = rawKind === 'parceiros' ? partnerSub : rawKind;
    kind = [...TABS.map(([k]) => k), 'escriturador', 'originador'].includes(kind) ? kind : 'cedente';
    if (kind === 'originador' || kind === 'escriturador') partnerSub = kind;
    if (kind === 'originador') return originadores(el, act);
    const tab = kind === 'escriturador' ? 'parceiros' : kind;
    const list = await rpc('partner_parties_list', { p_kind: kind });
    frame(el, tab, kind, NEW_LABEL[kind] || 'Nova empresa', '<input class="input search" id="q" type="search" placeholder="Buscar por nome ou documento" aria-label="Buscar">');
    const doc = kind === 'investidor' || kind === 'outro' ? 'CPF/CNPJ' : 'CNPJ';
    const draw = (q) => {
      const t = (q || '').trim().toLowerCase(), qd = digits(q || '');
      const rows = list.map((x, i) => [x, i]).filter(([x]) => !t || String(x.legal_name || '').toLowerCase().includes(t) || (qd && x.cnpj.includes(qd)));
      const pg = B.ui.pager('cad:' + kind, rows, { unit: rows.length === 1 ? 'cadastro' : 'cadastros', sig: t });
      const counter = kind === 'investidor' ? 'Integralizações' : kind === 'cedente' || kind === 'sacado' ? 'Operações' : '';
      el.querySelector('#list').innerHTML = rows.length ? `<div class="card"><table><thead><tr><th>${kind === 'investidor' ? 'Investidor' : kind === 'outro' ? 'Nome' : 'Empresa'}</th><th>${doc}</th>${counter ? `<th class="num">${counter}</th>` : ''}<th></th></tr></thead><tbody>
        ${pg.rows.map(([x, i]) => `<tr><td><b>${esc(x.legal_name || '—')}</b></td><td class="mono" style="white-space:nowrap">${esc(fmtCnpj(x.cnpj))}</td>
          ${counter ? `<td class="num">${esc(x.operations)}</td>` : ''}
          <td class="num">${x.id && kind === 'investidor' ? `<button class="btn ghost sm" data-inv="${i}">Convidar</button> ` : ''}${x.id ? `<button class="btn ghost sm" data-e="${i}">Editar</button> <button class="btn ghost sm" data-d="${i}">Excluir</button>` : `<button class="btn ghost sm" data-e="${i}">Editar</button>`}</td></tr>`).join('')}
        </tbody></table>${pg.bar}</div>` : `<div class="card">${empty(list.length ? 'Nada encontrado para essa busca.' : 'Nenhum cadastro ainda.')}</div>`;
      B.ui.pagerBind(el, 'cad:' + kind, () => draw(q));
      el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => edit(kind, list[b.dataset.e], again)));
      el.querySelectorAll('[data-inv]').forEach((b) => (b.onclick = () => B.inviteInvestor(list[b.dataset.inv].id, list[b.dataset.inv].legal_name, list[b.dataset.inv].email, b)));
      el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => {
        const x = list[b.dataset.d];
        const ok = await confirmAction({ title: 'Excluir cadastro', text: `Remover <b>${esc(x.legal_name)}</b> da lista? Operações e documentos já feitos não são afetados.`, confirmLabel: 'Excluir', danger: true });
        if (ok == null) return;
        try { await run(b, () => rpc('partner_party_delete', { p_id: x.id }), 'Cadastro removido'); again(kind); } catch (_) { /* já avisado */ }
      }));
    };
    const again = (k) => { if (k === kind) B.views.cadastros(el, [kind]); else location.hash = `#/cadastros/${k}`; };
    draw('');
    el.querySelector('#q').oninput = (e) => draw(e.target.value);
    el.querySelector('#new').onclick = () => edit(kind, null, again);
    if (act === 'novo') { history.replaceState(null, '', `#/cadastros/${kind}`); edit(kind, null, again); }
  };
})();
