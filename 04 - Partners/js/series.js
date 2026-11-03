/* Lottus Partners — Séries (lastro): debêntures e cotas que lastreiam as operações */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, toast, run, closeModal } = B;
  const { head, empty } = B.ui;

  const IDX = { manual: 'Manual', cdi: 'CDI', cdi_plus: 'CDI +', ipca: 'IPCA', ipca_plus: 'IPCA +', pre: 'Pré-fixado' };
  const IDX_FORM = { cdi_plus: 'CDI +', ipca_plus: 'IPCA +', pre: 'Pré-fixado', manual: 'Manual' };
  const EMISSIONS = Array.from({ length: 20 }, (_, i) => `${i + 1}ª`);
  const SERIES = ['Única'].concat(Array.from({ length: 20 }, (_, i) => String(i + 1)));
  const PAY = { maturity: 'No vencimento', monthly: 'Mensal', semiannual: 'Semestral', annual: 'Anual' };
  const rateLabel = (s) => (s.indexer === 'manual' ? 'Manual (valorização pelo fundo)' : s.indexer === 'cdi' ? '100% CDI' : s.indexer === 'pre' ? `${Number(s.rate).toLocaleString('pt-BR')}% a.a.` : `${IDX[s.indexer]} ${Number(s.rate).toLocaleString('pt-BR')}% a.a.`);

  function form(s, offer) {
    s = s || {};
    offer = offer || {};
    const sel = (name, list, v) => `<select class="input" name="${name}">${(v && !list.includes(v) ? [v].concat(list) : list).map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    const ro = (name, v) => `<input class="input" name="${name}" value="${esc(v)}" readonly>`;
    return `<form id="sf" novalidate>
      <div class="fsec"><h3>Tipo</h3>${B.seg('kind', [['debenture', 'Debênture privada'], ['fidc_quota', 'Cota de FIDC']], s.kind || 'debenture')}</div>
      <div class="fsec"><h3>Identificação</h3><div class="fgrid">
        <div class="field"><label>Emissão</label>${s.id ? ro('emission', s.emission) : sel('emission', EMISSIONS, '1ª')}</div>
        <div class="field"><label>Série</label>${s.id ? ro('series', s.series) : sel('series', SERIES, 'Única')}</div></div></div>
      <div class="fsec"><h3>Valores</h3><div class="fgrid">
        <div class="field"><label>Valor total</label>${B.affix(`<input class="input" name="total_amount" data-mask="money" data-req="Informe o valor total" placeholder="0,00" value="${s.total_amount != null ? B.mask.fmtMoney(s.total_amount) : ''}">`, { pre: 'R$' })}</div>
        <div class="field"><label>P.U. inicial</label>${B.affix(`<input class="input" name="unit_price" data-mask="money" value="${B.mask.fmtMoney(s.unit_price ?? 1000)}">`, { pre: 'R$' })}</div></div></div>
      <div class="fsec"><h3>Remuneração</h3>
        <label class="swrow"><span><b>Integralizar sempre pelo P.U. inicial</b><span class="small">Cada integralização entra pelo valor inicial e valoriza individualmente, a partir da própria data. Só dá para mudar enquanto a série não tem integralizações.</span></span><input type="checkbox" name="individual_accrual" ${s.individual_accrual ? 'checked' : ''}></label>
        ${B.seg('indexer', Object.entries(IDX_FORM), s.indexer && IDX_FORM[s.indexer] ? s.indexer : 'cdi_plus')}
        <div class="fgrid"><div class="field" id="rate-f" style="${s.indexer === 'manual' ? 'display:none' : ''}"><label>Taxa</label>${B.affix(`<input class="input" name="rate" data-mask="rate" data-req="Informe a taxa" placeholder="0,00" value="${s.rate != null ? B.mask.fmtMoney(s.rate) : ''}">`, { suf: '% a.a.' })}</div>
          <div class="field"><label>Pagamento de juros</label><select class="input" name="interest_payment">${Object.entries(PAY).map(([k, l]) => `<option value="${k}" ${k === (s.interest_payment || 'maturity') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
      <div class="fsec"><h3>Prazo e resgate</h3>
        <div class="field"><label>Vencimento</label><input class="input" name="maturity" data-mask="date" value="${esc(B.mask.toBr(s.maturity || ''))}"></div>
        <label class="swrow"><span><b>Permite resgate antecipado</b><span class="small">O debenturista pode pedir resgate antes do vencimento</span></span><input type="checkbox" name="early_redemption" ${s.early_redemption ? 'checked' : ''}></label>
        <div class="field" id="grace-f" style="${s.early_redemption ? '' : 'display:none'}"><label>Carência para resgate</label>${B.affix(`<input class="input" name="grace_days" data-mask="int" value="${s.grace_days ?? 0}">`, { suf: 'dias' })}</div></div>
      <div class="fsec"><h3>Características do título</h3><textarea class="input" name="chars" rows="3" maxlength="600" placeholder="Ex.: Debêntures simples, não conversíveis em ações, com garantia real…">${esc(s.characteristics || '')}</textarea><div class="u-mt6 help">Aparece no boletim de subscrição.</div></div>
      <div class="fsec"><h3>Oferta no Lottus Invest</h3>
        <label class="switch-row"><input type="checkbox" name="ofvis" ${offer.offer_visible ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span><b>Divulgar no Lottus Invest</b><small>Investidores com conta veem a série e podem registrar interesse.</small></span></label>
        <div id="of-box" style="display:${offer.offer_visible ? 'grid' : 'none'};gap:14px;margin-top:12px">
          <div class="field"><label>Aplicação mínima</label>${B.affix(`<input class="input" name="ofmin" data-mask="money" placeholder="${B.mask.fmtMoney(s.unit_price ?? 1000)}" value="${offer.offer_min ? B.mask.fmtMoney(offer.offer_min) : ''}">`, { pre: 'R$' })}<div class="u-mt6 help">Em branco usa o valor de 1 debênture.</div></div>
          <div class="field"><label>Descrição da oferta</label><textarea class="input" name="ofsum" rows="4" maxlength="600" placeholder="Para que serve a captação, lastro, garantias, público-alvo…">${esc(offer.offer_summary || '')}</textarea><div class="u-mt6 help">Texto visível aos investidores logados. Não inclua dados de clientes nem promessa de rentabilidade.</div></div></div></div>
      <div class="error-box" id="sf-err" hidden></div></form>`;
  }

  async function edit(s, reload) {
    let offer = {};
    if (s) { try { offer = (await rpc('partner_series_offers')).find((x) => x.id === s.id) || {}; } catch (_) { /* segue sem oferta */ } }
    if (s) { try { const pr = await rpc('partner_fund_profile'); const hit = (pr.series || []).find((x) => x.id === s.id); if (hit) s = { ...s, characteristics: hit.characteristics }; } catch (_) { /* segue sem */ } }
    const box = B.drawer({ title: s ? `Série ${s.emission} · ${s.series}` : 'Nova série', subtitle: 'Cada operação aprovada fica vinculada a uma série.', body: form(s, offer),
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar série</button>' });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const ix = box.querySelector('[name=indexer]'), rf = box.querySelector('#rate-f');
    ix.addEventListener('change', () => { rf.style.display = ix.value === 'manual' ? 'none' : ''; });
    const er = box.querySelector('[name=early_redemption]'), gf = box.querySelector('#grace-f');
    er.onchange = () => { gf.style.display = er.checked ? '' : 'none'; };
    const ov = box.querySelector('[name=ofvis]'), ob = box.querySelector('#of-box');
    ov.onchange = () => { ob.style.display = ov.checked ? 'grid' : 'none'; };
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const f = box.querySelector('#sf'), err = box.querySelector('#sf-err');
      const total = B.mask.parse(f.total_amount.value);
      let bad = false;
      if (!(total > 0)) { B.fieldError(f.total_amount, 'Informe o valor total'); bad = true; }
      if (f.indexer.value !== 'manual' && !f.rate.value.trim()) { B.fieldError(f.rate, 'Informe a taxa'); bad = true; }
      if (f.ofvis.checked && f.ofsum.value.trim().length < 10) { B.fieldError(f.ofsum, 'Descreva a oferta (mínimo 10 caracteres)'); bad = true; }
      if (bad) { err.hidden = true; return; }
      const p = { id: s && s.id, kind: f.kind.value, emission: f.emission.value, series: f.series.value, total_amount: total,
        unit_price: B.mask.parse(f.unit_price.value) || 1000, indexer: f.indexer.value, rate: f.indexer.value === 'manual' ? 0 : B.mask.parse(f.rate.value), interest_payment: f.interest_payment.value,
        maturity: B.mask.iso(f.maturity) || null, early_redemption: f.early_redemption.checked, grace_days: f.early_redemption.checked ? parseInt(f.grace_days.value, 10) || 0 : 0 };
      try {
        await run(ev.currentTarget, async () => {
          const r = await rpc('partner_series_save', { p });
          const id = (s && s.id) || (r && r.id);
          if (id && (f.individual_accrual.checked !== !!(s && s.individual_accrual))) await rpc('partner_series_accrual_set', { p_series: id, p_on: f.individual_accrual.checked });
          if (id) await rpc('partner_series_characteristics_save', { p_series: id, p_text: f.chars.value });
          if (id && (f.ofvis.checked || (s && offer.offer_visible) || f.ofsum.value.trim())) await rpc('partner_series_offer', { p_series: id, p_visible: f.ofvis.checked, p_min: B.mask.parse(f.ofmin.value) || 0, p_summary: f.ofsum.value });
        }, 'Série salva');
        closeModal(); reload();
      } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  const { today } = B;
  const pu = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 });


  /* ---------------- utilidades: CSV e Pix estático ---------------- */
  const csv = (name, head, rows) => B.csvFile(name, head, rows);
  const num = (v) => (v == null ? '' : String(v).replace('.', ','));
  const crc16 = (s) => { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, '0'); };
  const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const ascii = (t, n) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, n);
  function pixPayload({ key, name, city, amount, txid }) {
    const p = tlv('00', '01') + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key)) + tlv('52', '0000') + tlv('53', '986') + (amount ? tlv('54', Number(amount).toFixed(2)) : '')
      + tlv('58', 'BR') + tlv('59', ascii(name, 25) || 'FUNDO') + tlv('60', ascii(city, 15) || 'SAO PAULO') + tlv('62', tlv('05', ascii(txid, 25) || '***')) + '6304';
    return p + crc16(p);
  }
  async function pixModal(x, me) {
    const accs = await rpc('partner_bank_accounts').catch(() => []);
    const acc = accs.find((a) => a.pix_key);
    if (!acc) { B.modal({ title: 'Pix do fundo', body: '<p class="u-m0">Cadastre uma conta com chave Pix em <b>Configurações → Banco → Outras contas</b> para gerar o QR de cobrança da integralização.</p>', foot: '' }); return; }
    const code = pixPayload({ key: acc.pix_key, name: (me.funder && (me.funder.trade_name || me.funder.legal_name)) || acc.label, city: 'SAO PAULO', amount: Number(x.amount), txid: 'INT' + String(x.id).replace(/-/g, '').slice(0, 20) });
    const box = B.modal({ title: `Pix · ${brl(x.amount)}`, body: `<div class="pix-box"><div class="pix-qr">${B.qrSvg(code)}</div><div class="small"><b>${esc(x.investor)}</b> · ${esc(x.series)}<br>Chave: ${esc(acc.pix_key)} (${esc(acc.label)})</div></div>
      <textarea class="u-mt12 input mono" rows="3" readonly>${esc(code)}</textarea><div class="u-mt8 small muted">Pix estático: a confirmação do pagamento continua manual, depois de conferir o valor na conta.</div>`, foot: '<button class="btn" data-act="copy">Copiar código</button>' });
    box.querySelector('[data-act=copy]').onclick = () => B.copy(code);
  }

  /* Valorização manual: define o P.U. de uma data (vale até a próxima valorização) */
  async function valuate(s, reload) {
    const hist = await rpc('partner_series_valuations', { p_series: s.id });
    const base = Number(s.current_pu);
    const box = B.drawer({ title: `Valorizar série ${s.emission} · ${s.series}`, subtitle: 'Valorize ou desvalorize o P.U. em uma data. Ele vale até a próxima alteração e é usado nas novas integralizações.',
      body: `<form id="vf" novalidate>
        <div class="sumcard"><div><span class="small muted">P.U. atual</span><b>R$ ${pu(base)}</b></div><div><span class="small muted">${s.pu_date ? 'Atualizado em' : 'Origem'}</span><b>${s.pu_date ? date(s.pu_date) : 'P.U. inicial'}</b></div></div>
        <div class="fsec"><h3>Alteração</h3>${B.seg('mode', [['pct', 'Por %'], ['amt', 'Por valor (R$)'], ['pu', 'Novo P.U.']], 'pct')}
          <div id="dirw" class="u-mt10">${B.seg('dir', [['up', 'Valorizar (+)'], ['down', 'Desvalorizar (−)']], 'up')}</div>
          <div class="fgrid"><div class="field"><label>Data</label><input class="input" name="on_date" data-mask="date" data-req="Informe a data" value="${esc(B.mask.toBr(today()))}"></div>
          <div class="field" id="valw"></div></div>
          <div class="sumcard" id="newpu" hidden></div>
          <div class="field"><label>Observação (opcional)</label><input class="input" name="note" maxlength="120" placeholder="Ex.: ajuste conforme laudo do administrador"></div></div>
        ${hist.length ? `<div class="fsec"><h3>Histórico</h3><table class="mini"><tbody>${hist.map((h) => `<tr><td>${date(h.on_date)}</td><td class="num"><b>R$ ${pu(h.unit_price)}</b></td><td class="small muted">${esc(h.note || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <div class="error-box" id="vf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    const f = box.querySelector('#vf'), err = box.querySelector('#vf-err'), np = box.querySelector('#newpu'), vw = box.querySelector('#valw'), dw = box.querySelector('#dirw');
    const LAB = { pct: ['Variação', { suf: '%' }], amt: ['Variação por debênture', { pre: 'R$' }], pu: ['Novo P.U.', { pre: 'R$' }] };
    const drawVal = () => {
      const [l, opt] = LAB[f.mode.value];
      vw.innerHTML = `<label>${l}</label>${B.affix(`<input class="input" name="val" data-mask="${f.mode.value === 'pct' ? 'rate' : 'money'}" data-req="Informe o valor" placeholder="0,00">`, opt)}`;
      B.mask.attach(vw); B.formInit(vw); f.val.addEventListener('input', upd);
      dw.style.display = f.mode.value === 'pu' ? 'none' : ''; upd();
    };
    const calc = () => {
      const x = B.mask.parse(f.val ? f.val.value : '') || 0, sg = f.dir.value === 'down' ? -1 : 1;
      const v = f.mode.value === 'pct' ? base * (1 + sg * x / 100) : f.mode.value === 'amt' ? base + sg * x : x;
      return Math.round(v * 1e8) / 1e8;
    };
    const upd = () => {
      const x = B.mask.parse(f.val ? f.val.value : '');
      if (!(x > 0)) { np.hidden = true; return; }
      const v = calc(), diff = v - base;
      np.hidden = false;
      np.innerHTML = `<div><span class="small muted">Novo P.U.</span><b>R$ ${pu(v)}</b></div><div><span class="small muted">${diff < 0 ? 'Desvalorização' : 'Valorização'}</span><b>${diff < 0 ? '−' : '+'}R$ ${pu(Math.abs(diff))} (${diff < 0 ? '−' : '+'}${(Math.abs(diff) / base * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)</b></div>`;
    };
    f.dir.addEventListener('change', upd); f.mode.addEventListener('change', drawVal);
    drawVal();
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const d = B.mask.iso(f.on_date), x = B.mask.parse(f.val.value);
      let bad = false;
      if (!d || d > today()) { B.fieldError(f.on_date, 'Use uma data até hoje'); bad = true; }
      if (!(x > 0)) { B.fieldError(f.val, 'Informe o valor'); bad = true; }
      if (bad) return;
      const v = calc();
      if (!(v > 0)) { err.hidden = false; err.textContent = 'A desvalorização não pode zerar o P.U.'; return; }
      const down = v < base;
      try { await run(ev.currentTarget, () => rpc('partner_series_valuate', { p_series: s.id, p_date: d, p_pu: v, p_note: f.note.value }), down ? 'Série desvalorizada' : 'Série valorizada'); closeModal(); reload(); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  async function seriesTab(el, me, host) {
    const list = await rpc('partner_series_list');
    const tot = list.filter((s) => s.status === 'open').reduce((a, s) => ({ t: a.t + Number(s.total_amount), u: a.u + Number(s.allocated) }), { t: 0, u: 0 });
    const adm = me.is_admin !== false;
    host.innerHTML = (list.length ? `
      <div class="card"><table>
      <thead><tr><th>Série</th><th>Remuneração</th><th>Vencimento</th><th class="num">P.U. atual</th><th class="num">Emitido</th><th></th></tr></thead><tbody>
      ${list.map((s) => { return `<tr><td><b>${esc(s.emission)} · ${esc(s.series)}</b><div class="small muted">${s.kind === 'fidc_quota' ? 'Cota de FIDC' : 'Debênture'} · ${esc(s.operations)} operações${s.status === 'closed' ? ' · encerrada' : ''}</div></td>
        <td>${esc(rateLabel(s))}</td><td>${s.maturity ? date(s.maturity) : '—'}</td>
        <td class="num"><b>R$ ${pu(s.current_pu)}</b><div class="small muted">${s.individual_accrual ? 'cada integralização valoriza sozinha' : s.pu_date ? 'em ' + date(s.pu_date) : 'inicial'}</div></td>
        <td class="num">${brl(s.total_amount)}</td>
        <td class="num">${adm ? `${s.indexer === 'manual' ? `<button class="btn ghost sm" data-val="${esc(s.id)}">Valorizar</button> ` : s.status === 'open' && s.pu_updates ? `<button class="btn ghost sm" data-rec="${esc(s.id)}">Recalcular P.U.</button> ` : ''}<button class="btn ghost sm" data-edit="${esc(s.id)}">Editar</button> <button class="btn ghost sm" data-close="${esc(s.id)}" data-to="${s.status === 'open' ? 1 : 0}">${s.status === 'open' ? 'Encerrar' : 'Reabrir'}</button>` : ''}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="4">Total (séries abertas)</td><td class="num">${brl(tot.t)}</td><td></td></tr></tfoot></table></div>` : `<div class="card">${empty('Nenhuma série cadastrada. Crie a primeira para vincular as operações ao lastro.')}</div>`);
    const draw = () => seriesTab(el, me, host);
    const n = el.querySelector('#new'); if (n) n.onclick = () => edit(null, draw);
    host.querySelectorAll('[data-val]').forEach((b) => (b.onclick = () => valuate(list.find((x) => x.id === b.dataset.val), draw)));
    host.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = async () => {
      try { const r = await run(b, () => rpc('partner_series_recalc', { p_series: b.dataset.rec })); toast(r && r.days ? `P.U. recalculado (${r.days} dias${r.last_index ? ', CDI até ' + date(r.last_index) : ''})` : 'Nada a recalcular ainda: os índices do Banco Central chegam em instantes. Tente de novo em 1 minuto.'); draw(); } catch (_) { /* já avisado */ }
    }));
    el._export = () => csv('series', ['Emissão', 'Série', 'Tipo', 'Indexador', 'Taxa', 'Vencimento', 'Valor emitido', 'Alocado', 'Integralizado', 'P.U. atual', 'Situação'],
      list.map((s) => [s.emission, s.series, s.kind === 'fidc_quota' ? 'Cota FIDC' : 'Debênture', IDX[s.indexer], num(s.rate), s.maturity || '', num(s.total_amount), num(s.allocated), num(s.integralized), num(s.current_pu), s.status === 'open' ? 'Aberta' : 'Encerrada']));
    host.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => edit(list.find((x) => x.id === b.dataset.edit), draw)));
    host.querySelectorAll('[data-close]').forEach((b) => (b.onclick = async () => {
      try { await run(b, () => rpc('partner_series_close', { p_id: b.dataset.close, p_closed: b.dataset.to === '1' }), 'Série atualizada'); draw(); } catch (e) { /* já avisado */ }
    }));
  }

  /* ---------------- Integralizações ---------------- */
  const SUB = { pending: ['Aguardando pagamento', 'warning'], paid: ['Integralizada', 'success'], cancelled: ['Cancelada', ''] };

  async function newSub(done, pre) {
    pre = pre || {};
    const [inv, ser, origs] = await Promise.all([rpc('partner_parties_list', { p_kind: 'investidor' }), rpc('partner_series_list'), rpc('partner_originators_list').catch(() => [])]);
    const open = ser.filter((s) => s.status === 'open');
    if (!inv.length) { toast('Cadastre o investidor antes de criar a integralização.'); location.hash = '#/cadastros/investidor/novo'; return; }
    if (!open.length) { toast('Crie uma série aberta antes.'); return; }
    const box = B.drawer({ title: 'Nova integralização', subtitle: 'O valor é ajustado para baixo ao múltiplo do P.U.',
      body: `<form id="sb" novalidate>
        <div class="fsec"><h3>Investidor</h3><select class="input" name="investor"><option value="">Selecione…</option>${inv.map((i) => `<option value="${esc(i.id)}">${esc(i.legal_name)}</option>`).join('')}</select>
          <a class="linkbtn" href="#/cadastros/investidor/novo">+ Cadastrar novo investidor</a></div>
        <div class="fsec"><h3>Série</h3><select class="input" name="series">${open.map((s) => `<option value="${esc(s.id)}">${esc(s.emission)} · ${esc(s.series)} — P.U. R$ ${pu(s.individual_accrual ? s.unit_price : s.current_pu)}</option>`).join('')}</select></div>
        <div class="fsec"><h3>Valor</h3>${B.affix('<input class="input" name="amount" data-mask="money" data-req="Informe o valor" placeholder="0,00">', { pre: 'R$' })}</div>
        <div class="sumcard" id="calc" hidden></div>${B.commission.html(origs)}<div class="error-box" id="sb-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok" disabled>Criar integralização</button>' });
    box.querySelector('a.linkbtn').addEventListener('click', () => closeModal());
    const f = box.querySelector('#sb'), calc = box.querySelector('#calc'), err = box.querySelector('#sb-err'), ok = box.querySelector('[data-act=ok]');
    let timer, last = null;
    const refresh = () => {
      clearTimeout(timer); last = null; ok.disabled = true;
      timer = setTimeout(async () => {
        const a = B.mask.parse(f.amount.value);
        if (!(a > 0)) { calc.hidden = true; return; }
        try {
          const c = await rpc('partner_sub_preview', { p_series: f.series.value, p_amount: a });
          last = c; err.hidden = true; calc.hidden = false; ok.disabled = false;
          calc.innerHTML = `<div><span class="small muted">P.U.</span><b>R$ ${pu(c.pu)}</b></div><div><span class="small muted">Quantidade</span><b>${esc(c.quantity)}</b></div><div><span class="small muted">Valor a integralizar</span><b>${brl(c.amount)}</b></div>${c.adjusted ? `<div class="small" style="grid-column:1/-1">Ajustado de ${brl(c.requested)} para o múltiplo do P.U.</div>` : ''}`;
        } catch (e) { calc.hidden = true; err.hidden = false; err.textContent = B.message(e); }
      }, 300);
    };
    f.amount.addEventListener('input', refresh); f.series.addEventListener('change', refresh);
    B.commission.bind(f, origs);
    if (pre.investor_id) f.investor.value = pre.investor_id;
    if (pre.series_id) f.series.value = pre.series_id;
    if (pre.amount) { f.amount.value = B.mask.fmtMoney(pre.amount); refresh(); }
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    ok.onclick = async (ev) => {
      if (!f.investor.value) { B.fieldError(f.investor, 'Escolha o investidor'); return; }
      if (!last) return;
      try { const r = await run(ev.currentTarget, () => rpc('partner_sub_create', { p: { investor_id: f.investor.value, series_id: f.series.value, amount: B.mask.parse(f.amount.value) } }), 'Integralização criada');
        const c = B.commission.read(f); if (c.originator_id && r && r.id) await rpc('partner_sub_set_meta', { p_sub: r.id, p: c });
        closeModal(); done(r); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  /* Adicionar ou editar uma integralização (inclusive histórica): quantidade, P.U., data, situação e originador */
  async function subForm(x, done, pre) {
    x = x || {}; pre = pre || {};
    const [inv, ser, origs] = await Promise.all([rpc('partner_parties_list', { p_kind: 'investidor' }), rpc('partner_series_list'), rpc('partner_originators_list').catch(() => [])]);
    const isNew = !x.id;
    if (isNew && !inv.length) { toast('Cadastre o investidor antes.'); location.hash = '#/cadastros/investidor/novo'; return; }
    const box = B.drawer({ title: isNew ? 'Adicionar posição' : 'Editar integralização', subtitle: isNew ? 'Registre uma integralização que já aconteceu ou uma nova. Sem criar cobrança.' : 'As alterações recalculam o valor e a posição.',
      body: `<form id="sf" novalidate>
        ${isNew ? `<div class="fsec"><h3>Investidor</h3><select class="input" name="investor"><option value="">Selecione…</option>${inv.map((i) => `<option value="${esc(i.id)}" ${i.id === pre.investor_id ? 'selected' : ''}>${esc(i.legal_name)}</option>`).join('')}</select><a class="linkbtn" href="#/cadastros/investidor/novo" id="newinv">+ Cadastrar novo investidor</a></div>
          <div class="fsec"><h3>Série</h3><select class="input" name="series">${ser.map((s) => `<option value="${esc(s.id)}" ${s.id === pre.series_id ? 'selected' : ''}>${esc(s.emission)} · ${esc(s.series)}</option>`).join('')}</select></div>` : ''}
        <div class="fsec"><h3>Valores</h3><div class="fgrid"><div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="numeric" value="${esc(x.quantity || '')}" placeholder="0"></div>
          <div class="field"><label>P.U. na integralização <span class="small muted">(P.U. do dia, pode alterar)</span></label>${B.affix(`<input class="input" name="pu" data-mask="money" value="${x.unit_price ? esc(B.mask.fmtMoney(x.unit_price)) : ''}" placeholder="0,00">`, { pre: 'R$' })}</div></div>
          <div class="sumcard" id="tot"><span class="lbl">Valor total</span><span class="big">${brl(x.amount || 0)}</span></div></div>
        <div class="fsec"><h3>Data da integralização</h3><input class="input" name="pay_date" data-mask="date" value="${esc(B.mask.toBr(x.pay_date || today()))}"></div>
        ${B.commission.html(origs, x)}<div class="error-box" id="sf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    const f = box.querySelector('#sf'), err = box.querySelector('#sf-err');
    B.commission.bind(f, origs);
    const nv = box.querySelector('#newinv'); if (nv) nv.onclick = () => closeModal();
    const tot = () => { const q = Number(String(f.qty.value).replace(/\D/g, '')), p = B.mask.parse(f.pu.value); box.querySelector('#tot .big').textContent = brl(Math.round(q * p * 100) / 100); };
    f.qty.addEventListener('input', tot); f.pu.addEventListener('input', tot);
    if (isNew) { const fillPu = () => { const sr = ser.find((z) => z.id === f.series.value); const base = sr && (sr.individual_accrual ? Number(sr.unit_price) : Number(sr.current_pu)); if (base > 0) { f.pu.value = B.mask.fmtMoney(base); tot(); } else { f.pu.value = ''; tot(); } }; f.series.addEventListener('change', fillPu); fillPu(); }
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const q = Number(String(f.qty.value).replace(/\D/g, '')), p = B.mask.parse(f.pu.value);
      if (isNew && !f.investor.value) { B.fieldError(f.investor, 'Escolha o investidor'); return; }
      if (!(q > 0) || !(p > 0)) { err.hidden = false; err.textContent = 'Informe a quantidade e o P.U.'; return; }
      const body = { id: x.id || null, investor_id: isNew ? f.investor.value : undefined, series_id: isNew ? f.series.value : undefined, quantity: q, unit_price: p, status: x.status === 'pending' ? 'pending' : 'paid', pay_date: x.status === 'pending' ? null : B.mask.iso(f.pay_date), ...B.commission.read(f) };
      try { await run(ev.currentTarget, () => rpc('partner_sub_save', { p: body }), 'Integralização salva'); closeModal(); done && done(); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  /* Detalhe da posição: todas as integralizações do investidor naquela série */
  /* Detalhe de uma integralização: o que foi pago, quanto vale hoje, boletim e edição */
  function lotDrawer(x, ctx, again) {
    const st = SUB[x.status] || [x.status, ''], cost = x.remaining * Number(x.unit_price || 0), gain = x.status === 'paid' ? x.value - cost : 0;
    const kpi = B.mini;
    const line = B.dline;
    const sent = ctx.bol[x.id];
    const bolTxt = !sent ? 'Não enviado' : sent.status === 'draft' ? 'Rascunho' : (sent.signers || []).every((g) => g.status === 'signed') ? 'Totalmente assinado' : 'Enviado, aguardando assinaturas';
    const box = B.drawer({ title: x.investor, subtitle: `Série ${x.series} · integralização de ${date(x.pay_date || x.created_at)}`,
      body: `<div class="mini-row">${kpi('Valor inicial', brl(x.amount), `${esc(x.quantity)} debêntures`)}${kpi('Valor atual', brl(x.value), x.curPu ? 'P.U. hoje R$ ' + pu(x.curPu) : '')}${x.status === 'paid' ? kpi('Rendimento', (gain >= 0 ? '+' : '') + brl(gain), cost ? ((gain / cost) * 100).toFixed(2).replace('.', ',') + '%' : '', gain >= 0 ? '#2e7a57' : '#c73053') : ''}</div>
        <div class="u-mt14">${line('Situação', `<span class="tag ${st[1]}">${x.closed && x.status === 'paid' ? 'Resgatada' : st[0]}</span>`)}${line('P.U. adquirido', 'R$ ' + pu(x.unit_price))}${line('Quantidade adquirida', esc(x.quantity))}${x.status === 'paid' ? line('Quantidade em posição', esc(x.remaining)) : ''}${line('Data da integralização', esc(date(x.pay_date || x.created_at)))}${x.originator ? line('Originador', esc(x.originator)) : ''}${x.commission_amount ? line('Comissão', brl(x.commission_amount)) : ''}${line('Boletim', bolTxt)}</div>`,
      foot: `<button class="btn secondary" data-act="close">Fechar</button><button class="btn danger" data-act="del">Excluir</button><button class="btn secondary" data-act="edit">Editar</button>${x.status === 'pending' ? '<button class="btn secondary" data-act="pix">Pix</button><button class="btn" data-act="pay">Registrar pagamento</button>' : ''}${x.status !== 'cancelled' ? '<button class="btn" data-act="bol">Boletim</button>' : ''}` });
    const q = (a) => box.querySelector(`[data-act=${a}]`);
    const item = { document: x.document, investor: x.investor, series: x.series };
    q('close').onclick = () => closeModal();
    q('edit').onclick = () => { closeModal(); subForm(x, again); };
    const bl = q('bol'); if (bl) bl.onclick = () => B.boletimPopup('subscricao', x.id, item, again).catch((e) => toast(B.message(e), true));
    const px = q('pix'); if (px) px.onclick = () => pixModal(x, ctx.me);
    const py = q('pay'); if (py) py.onclick = async () => {
      const ok = await B.confirmAction({ title: 'Dar baixa', text: 'Marcar esta integralização como paga? Use depois de conferir o Pix na conta do fundo.', confirmLabel: 'Dar baixa' });
      if (ok == null) return;
      try { await run(py, () => rpc('partner_sub_confirm', { p_id: x.id }), 'Pagamento confirmado'); closeModal(); again(); } catch (_) { /* já avisado */ }
    };
    q('del').onclick = async () => {
      const ok = await B.confirmAction({ title: 'Excluir integralização', text: 'A integralização e o boletim ligado a ela são apagados e a posição do investidor é recalculada. Não dá para desfazer.', confirmLabel: 'Excluir', danger: true });
      if (ok == null) return;
      try { await run(q('del'), () => rpc('partner_sub_delete', { p_id: x.id }), 'Integralização excluída'); closeModal(); again(); } catch (_) { /* já avisado */ }
    };
  }

  /* ---------------- Posições (uma linha por integralização) ---------------- */
  let posView = 'all';
  async function positionsTab(el, me, host) {
    const [subsAll, series, reds, cols] = await Promise.all([rpc('partner_subs_list'), rpc('partner_series_list'), rpc('partner_redemptions_list'), rpc('partner_collections_list').catch(() => [])]);
    const puOf = {}; series.forEach((z) => { puOf[z.id] = Number(z.current_pu); });
    const redQ = {}; reds.filter((r) => r.status === 'paid').forEach((r) => { const k = r.document + '|' + r.series; redQ[k] = (redQ[k] || 0) + Number(r.quantity); });
    const lots = subsAll.map((x) => ({ ...x, quantity: Number(x.quantity || 0) }));
    lots.filter((x) => x.status === 'paid').sort((a, b) => String(a.pay_date || a.created_at).localeCompare(String(b.pay_date || b.created_at))).forEach((x) => { const k = x.document + '|' + x.series, take = Math.min(redQ[k] || 0, x.quantity); redQ[k] = (redQ[k] || 0) - take; x.remaining = x.quantity - take; });
    lots.forEach((x) => { if (x.status === 'pending') x.remaining = x.quantity; if (x.status === 'cancelled') x.remaining = 0; x.curPu = x.cur_pu != null ? Number(x.cur_pu) : puOf[x.series_id]; x.value = x.status === 'pending' ? Number(x.amount) : x.remaining * (x.curPu || Number(x.unit_price)); x.closed = x.status === 'cancelled' || (x.status === 'paid' && x.remaining === 0); });
    const bol = {}; cols.filter((c) => c.kind === 'boletim_subscricao' && c.status !== 'cancelled').forEach((c) => { bol[c.ref_id] = c; });
    const open = lots.filter((x) => !x.closed), closed = lots.filter((x) => x.closed), shown = posView === 'closed' ? closed : posView === 'open' ? open : lots;
    const pill = (k, l, n) => `<button type="button" data-view="${k}" class="btn ${posView === k ? '' : 'secondary'} sm">${l} <span style="opacity:.7">${n}</span></button>`;
    const tagOf = (x) => (x.status === 'cancelled' ? ['Cancelada', ''] : x.closed ? ['Resgatada', ''] : x.status === 'pending' ? ['Aguardando pagamento', 'warning'] : ['Integralizada', 'success']);
    const gainOf = (x) => (x.status === 'paid' ? x.value - x.remaining * Number(x.unit_price || 0) : 0);
    const sumOf = (fn) => shown.reduce((t, x) => t + fn(x), 0);
    const pg = B.ui.pager('pos', shown, { unit: shown.length === 1 ? 'integralização' : 'integralizações', sig: posView });
    host.innerHTML = `<div class="row" style="gap:8px;margin-bottom:12px">${pill('all', 'Tudo', lots.length)}${pill('open', 'Abertas', open.length)}${pill('closed', 'Fechadas', closed.length)}</div>
      ${shown.length ? `<div class="card"><table><thead><tr><th>Integralização</th><th>Investidor</th><th>Série</th><th class="num">Qtd.</th><th class="num">Valor inicial</th><th class="num">Valor atual</th><th class="num">Rendimento</th><th>Situação</th><th></th></tr></thead><tbody>
        ${pg.rows.map((x) => { const t = tagOf(x), g = gainOf(x); return `<tr><td>${esc(date(x.pay_date || x.created_at))}</td><td><b>${esc(x.investor)}</b></td><td>${esc(x.series)}</td><td class="num">${esc(x.status === 'paid' ? x.remaining : x.quantity)}</td><td class="num">${brl(x.amount)}</td><td class="num"><b>${brl(x.status === 'cancelled' ? x.amount : x.value)}</b></td><td class="num" style="color:var(--${g < 0 ? 'danger' : 'success'}, inherit)">${x.status === 'paid' ? brl(g) : '—'}</td><td><span class="tag ${t[1]}">${t[0]}</span></td><td class="num"><button class="btn ghost sm" data-lot="${esc(x.id)}">Ver mais</button></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="num">${sumOf((x) => (x.status === 'paid' ? x.remaining : x.quantity))}</td><td class="num">${brl(sumOf((x) => Number(x.amount)))}</td><td class="num">${brl(sumOf((x) => (x.status === 'cancelled' ? 0 : x.value)))}</td><td class="num">${brl(sumOf(gainOf))}</td><td colspan="2"></td></tr></tfoot></table>${pg.bar}</div>`
        : `<div class="card">${empty(posView === 'closed' ? 'Nenhuma integralização fechada.' : posView === 'open' ? 'Nenhuma integralização aberta. Use "Adicionar posição" para registrar uma.' : 'Nenhuma integralização ainda. Use "Adicionar posição" para registrar uma.')}</div>`}`;
    el._export = () => csv('posicoes', ['Integralização', 'Investidor', 'CPF/CNPJ', 'Série', 'Quantidade', 'P.U. adquirido', 'Valor inicial', 'P.U. atual', 'Valor atual', 'Situação'], lots.map((x) => [x.pay_date || x.created_at.slice(0, 10), x.investor, x.document, x.series, x.status === 'paid' ? x.remaining : x.quantity, num(x.unit_price), num(x.amount), num(x.curPu), num(x.value), tagOf(x)[0]]));
    const again = () => positionsTab(el, me, host);
    B.ui.pagerBind(host, 'pos', again);
    host.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { posView = b.dataset.view; again(); }));
    host.querySelectorAll('[data-lot]').forEach((b) => (b.onclick = () => lotDrawer(lots.find((x) => x.id === b.dataset.lot), { me, bol }, again)));
    const n = el.querySelector('#new'); if (n) n.onclick = () => subForm(null, again);
  }

  /* ---------------- Resgates ---------------- */
  const RST = { pending: ['Efetivado', 'success'], paid: ['Efetivado', 'success'], cancelled: ['Cancelado', ''] };

  async function newRedemption(done, pre) {
    pre = pre || {};
    const pos = await rpc('partner_positions');
    if (!pos.length) { toast('Ainda não há posição para resgatar.'); return; }
    const box = B.drawer({ title: 'Novo resgate', subtitle: 'Resgate das debêntures de um investidor. IR e IOF são calculados sobre o rendimento. O resgate já vale ao criar; o pagamento ao investidor fica na Tesouraria.',
      body: `<form id="rf" novalidate>
        <div class="fsec"><h3>Posição</h3><select class="input" name="pos">${pos.map((x, i) => `<option value="${i}">${esc(x.investor)} · ${esc(x.series)} (${esc(x.quantity)} debêntures)</option>`).join('')}</select></div>
        <div class="fgrid"><div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="numeric" data-req="Informe a quantidade" placeholder="0"></div>
          <div class="field"><label>Data do resgate</label><input class="input" name="on_date" data-mask="date" value="${esc(B.mask.toBr(today()))}"></div></div>
        <label class="u-mt6 switch-row"><input type="checkbox" name="all"><span class="switch" aria-hidden="true"></span><span><b>Resgatar tudo</b></span></label>
        <div class="sumcard" id="rcalc" hidden></div><div class="error-box" id="rf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok" disabled>Criar resgate</button>' });
    const f = box.querySelector('#rf'), calc = box.querySelector('#rcalc'), err = box.querySelector('#rf-err'), ok = box.querySelector('[data-act=ok]');
    let timer, last = null;
    const pi = pos.findIndex((x) => x.series_id === pre.series_id && x.investor_id === pre.investor_id);
    const refresh = () => {
      clearTimeout(timer); last = null; ok.disabled = true;
      timer = setTimeout(async () => {
        const p = pos[f.pos.value], q = f.all.checked ? Number(p.quantity) : Number(String(f.qty.value).replace(/\D/g, '')), d = B.mask.iso(f.on_date);
        if (f.all.checked) f.qty.value = p.quantity;
        if (!(q > 0) || !d) { calc.hidden = true; return; }
        try {
          const c = await rpc('partner_redemption_preview', { p_series: p.series_id, p_investor: p.investor_id, p_qty: q, p_date: d });
          last = { p, q, d }; err.hidden = true; calc.hidden = false; ok.disabled = false;
          calc.innerHTML = `<div><span class="small muted">P.U.</span><b>R$ ${pu(c.pu)}</b></div><div><span class="small muted">Valor bruto</span><b>${brl(c.gross)}</b></div><div><span class="small muted">Rendimento</span><b>${brl(c.gain)}</b></div>
            <div><span class="small muted">IOF</span><b>${brl(c.iof)}</b></div><div><span class="small muted">IR</span><b>${brl(c.ir)}</b></div><div><span class="small muted">Líquido ao investidor</span><b>${brl(c.net)}</b></div>`;
        } catch (e) { calc.hidden = true; err.hidden = false; err.textContent = B.message(e); }
      }, 300);
    };
    ['input', 'change'].forEach((ev) => f.addEventListener(ev, refresh));
    if (pi >= 0) { f.pos.value = String(pi); if (pre.quantity) f.qty.value = pre.quantity; refresh(); }
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    ok.onclick = async (ev) => {
      if (!last) return;
      try { await run(ev.currentTarget, () => rpc('partner_redemption_create', { p: { series_id: last.p.series_id, investor_id: last.p.investor_id, quantity: last.q, date: last.d } }), 'Resgate criado'); closeModal(); done(); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  function redemptionDrawer(x, again) {
    const st = RST[x.status] || [x.status, ''];
    const kpi = B.mini;
    const line = B.dline;
    const box = B.drawer({ title: x.investor, subtitle: `Série ${x.series} · resgate de ${date(x.pay_date || x.created_at)}`,
      body: `<div id="rd"></div>`,
      foot: '<button class="btn secondary" data-act="close">Fechar</button><button class="btn danger" data-act="del">Excluir</button><button class="btn secondary" data-act="edit">Editar</button><button class="btn" data-act="bol">Boletim</button>' });
    const q = (a) => box.querySelector(`[data-act=${a}]`), host = box.querySelector('#rd');
    const view = () => {
      host.innerHTML = `<div class="mini-row">${kpi('Líquido ao investidor', brl(x.net), `${esc(x.quantity)} debêntures`)}${kpi('Valor bruto', brl(x.gross), 'P.U. R$ ' + pu(x.unit_price))}</div>
        <div class="u-mt14">${line('Situação', `<span class="tag ${st[1]}">${st[0]}</span>`)}${line('Data', esc(date(x.pay_date || x.created_at)))}${line('Custo das debêntures', brl(x.cost || 0))}${line('Rendimento', brl(x.gain))}${line('IOF', brl(x.iof))}${line('Imposto de renda', brl(x.ir))}${line('Líquido', brl(x.net))}</div>`;
    };
    view();
    q('close').onclick = () => closeModal();
    q('bol').onclick = () => B.boletimPopup('resgate', x.id, x, again).catch((e) => toast(B.message(e), true));
    q('edit').onclick = () => {
      host.innerHTML = `<form id="ef" novalidate><div class="fgrid"><div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="numeric" value="${esc(x.quantity)}"></div>
        <div class="field"><label>Data do resgate</label><input class="input" name="on_date" data-mask="date" value="${esc(B.mask.toBr(x.pay_date || today()))}"></div></div>
        <div class="small muted">IR e IOF são recalculados pela data e pela quantidade.</div><div class="error-box" id="ef-err" hidden></div>
        <div class="u-mt12"><button type="button" class="btn secondary sm" data-x>Cancelar</button> <button type="button" class="btn sm" data-ok>Salvar</button></div></form>`;
      B.mask.attach(host);
      const f = host.querySelector('#ef'), err = host.querySelector('#ef-err');
      f.querySelector('[data-x]').onclick = view;
      f.querySelector('[data-ok]').onclick = async (ev) => {
        const qn = Number(String(f.qty.value).replace(/\D/g, '')), d = B.mask.iso(f.on_date);
        if (!(qn > 0) || !d) { err.hidden = false; err.textContent = 'Informe a quantidade e a data.'; return; }
        try {
          await run(ev.currentTarget, async () => {
            await rpc('partner_redemption_update', { p: { id: x.id, quantity: qn, date: d } });
          }, 'Resgate salvo');
          closeModal(); again();
        } catch (e) { err.hidden = false; err.textContent = B.message(e); }
      };
    };
    q('del').onclick = async () => {
      const ok = await B.confirmAction({ title: 'Excluir resgate', text: x.status === 'paid' ? 'Este resgate já foi pago. Ao excluir, as debêntures voltam para a posição do investidor. Não dá para desfazer.' : 'As debêntures continuam na posição do investidor. Não dá para desfazer.', confirmLabel: 'Excluir', danger: true });
      if (ok == null) return;
      try { await run(q('del'), () => rpc('partner_redemption_delete', { p_id: x.id }), 'Resgate excluído'); closeModal(); again(); } catch (_) { /* já avisado */ }
    };
  }

  async function redemptionsTab(el, me, host) {
    const list = await rpc('partner_redemptions_list');
    const live = list.filter((x) => x.status !== 'cancelled');
    const sm = (k) => live.reduce((t, x) => t + Number(x[k] || 0), 0);
    const pg = B.ui.pager('red', live, { unit: live.length === 1 ? 'resgate' : 'resgates' });
    host.innerHTML = live.length ? `<div class="card"><table><thead><tr><th>Data</th><th>Investidor</th><th>Série</th><th class="num">Qtd.</th><th class="num">Bruto</th><th class="num">IOF</th><th class="num">IR</th><th class="num">Líquido</th><th>Situação</th><th></th></tr></thead><tbody>
      ${pg.rows.map((x) => { const st = RST[x.status]; return `<tr><td>${esc(date(x.pay_date || x.created_at))}</td><td><b>${esc(x.investor)}</b></td><td>${esc(x.series)}</td><td class="num">${esc(x.quantity)}</td><td class="num">${brl(x.gross)}</td><td class="num">${brl(x.iof)}</td><td class="num">${brl(x.ir)}</td><td class="num"><b>${brl(x.net)}</b></td><td><span class="tag ${st[1]}">${st[0]}</span></td><td class="num"><button class="btn ghost sm" data-rv="${esc(x.id)}">Ver mais</button></td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="num">${sm('quantity')}</td><td class="num">${brl(sm('gross'))}</td><td class="num">${brl(sm('iof'))}</td><td class="num">${brl(sm('ir'))}</td><td class="num">${brl(sm('net'))}</td><td colspan="2"></td></tr></tfoot></table>${pg.bar}</div>`
      : `<div class="card">${empty('Nenhum resgate ainda. Crie o primeiro em "Novo resgate".')}</div>`;
    el._export = () => csv('resgates', ['Data', 'Investidor', 'CPF/CNPJ', 'Série', 'Quantidade', 'Bruto', 'Rendimento', 'IOF', 'IR', 'Líquido', 'Situação', 'Pago em'],
      list.map((x) => [x.created_at.slice(0, 10), x.investor, x.document, x.series, x.quantity, num(x.gross), num(x.gain), num(x.iof), num(x.ir), num(x.net), (RST[x.status] || [x.status])[0], x.pay_date || '']));
    const draw = () => redemptionsTab(el, me, host);
    B.ui.pagerBind(host, 'red', draw);
    host.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = () => redemptionDrawer(list.find((x) => x.id === b.dataset.rv), draw)));
    const n = el.querySelector('#new'); if (n) n.onclick = () => newRedemption(draw);
  }

  /* ---------------- Oferta no Lottus Invest + interessados ---------------- */
  async function interestsTab(el, me, host, refresh) {
    const all = await rpc('partner_interests_list');
    const list = all.filter((x) => x.status === 'new');
    const done = all.filter((x) => x.status !== 'new').slice(0, 10);
    host.innerHTML = list.length || done.length ? `<div class="card"><table><thead><tr><th>Investidor</th><th>Pedido</th><th>Série</th><th class="num">Valor / quantidade</th><th></th></tr></thead><tbody>
      ${list.map((x) => `<tr><td><b>${esc(x.name)}</b><div class="small muted">${esc(x.email || '')}${x.phone ? ' · ' + esc(x.phone) : ''} · ${esc(date(x.created_at))}</div>${x.note ? `<div class="small">“${esc(x.note)}”</div>` : ''}</td><td><span class="tag ${x.kind === 'resgate' ? 'warning' : 'brand'}">${x.kind === 'resgate' ? 'Resgate' : 'Integralização'}</span></td><td>${esc(x.series)}</td>
        <td class="num"><b>${x.kind === 'resgate' ? esc(x.quantity) + ' deb.' : brl(x.amount)}</b></td>
        <td class="num"><button class="btn sm" data-acc="${esc(x.id)}">Aceitar</button> <button class="btn ghost sm" data-dis="${esc(x.id)}">Dispensar</button></td></tr>`).join('')}
      ${done.map((x) => `<tr style="opacity:.6"><td>${esc(x.name)}<div class="small muted">${esc(date(x.created_at))}</div></td><td>${x.kind === 'resgate' ? 'Resgate' : 'Integralização'}</td><td>${esc(x.series)}</td><td class="num">${x.kind === 'resgate' ? esc(x.quantity) + ' deb.' : brl(x.amount)}</td><td class="num small muted">${x.status === 'accepted' ? 'Aceito' : 'Dispensado'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card">${empty('Nenhuma solicitação. Quando um investidor pedir integralização ou resgate no app Lottus Invest, o pedido aparece aqui.')}</div>`;
    host.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = async () => {
      const x = list.find((y) => y.id === b.dataset.acc);
      try {
        let r = { investor_id: x.investor_id };
        if (!x.investor_id) r = await run(b, () => rpc('partner_interest_accept', { p_id: x.id }));
        const finish = async () => { if (x.investor_id) { try { await rpc('partner_interest_accept', { p_id: x.id }); } catch (_) { /* já aceito */ } } refresh(); };
        if (x.kind === 'resgate') newRedemption(finish, { investor_id: r.investor_id, series_id: x.series_id, quantity: x.quantity });
        else newSub(finish, { investor_id: r.investor_id, series_id: x.series_id, amount: x.amount });
      } catch (_) { /* já avisado */ }
    }));
    host.querySelectorAll('[data-dis]').forEach((b) => (b.onclick = async () => {
      try { await run(b, () => rpc('partner_interest_dismiss', { p_id: b.dataset.dis }), 'Solicitação dispensada'); refresh(); } catch (_) { /* já avisado */ }
    }));
  }

  const TABS = [['solicitacoes', 'Solicitações'], ['posicoes', 'Posições'], ['resgates', 'Resgates'], ['series', 'Séries']];
  const ALIAS = { integralizacoes: 'posicoes', interessados: 'solicitacoes' };
  B.views.debentures = async (el, [rawTab0], me) => {
    let rawTab = rawTab0;
    rawTab = ALIAS[rawTab] || rawTab;
    const tab = TABS.some(([k]) => k === rawTab) ? rawTab : 'solicitacoes';
    const adm = me.is_admin !== false;
    const NEW = { posicoes: 'Adicionar posição', resgates: 'Novo resgate' };
    const action = `<div class="u-g8 row"><button class="btn secondary" id="exp">Exportar CSV</button>${tab === 'series' ? (adm ? '<button class="btn" id="new">Nova série</button>' : '') : NEW[tab] ? `<button class="btn" id="new">${NEW[tab]}</button>` : ''}</div>`;
    el.innerHTML = head('Debêntures', 'Solicitações, posições, resgates e séries', action) + B.ui.tabs(TABS, tab) + '<div id="tab"></div>';
    B.ui.onTabs(el, (k) => { location.hash = `#/debentures/${k}`; });
    const host = el.querySelector('#tab');
    el.querySelector('#exp').onclick = () => (el._export ? el._export() : toast('Nada para exportar.'));
    if (tab === 'series') await seriesTab(el, me, host); else if (tab === 'resgates') await redemptionsTab(el, me, host); else if (tab === 'posicoes') await positionsTab(el, me, host); else {
      await interestsTab(el, me, host, () => B.views.debentures(el, ['solicitacoes'], me));
    }
  };
  B.views.series = (el) => { location.hash = '#/debentures/series'; };
})();
