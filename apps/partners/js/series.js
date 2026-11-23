/* Lottus Partners — Séries (lastro): debêntures e cotas que lastreiam as operações */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, toast, run, closeModal } = B;
  const { head, empty } = B.ui;

  // "1ª", "3" -> "1ª Emissão · 3ª Série" ; "5ª", "Única" -> "5ª Emissão · Série Única" ; aceita também "1ª · 3"
  const serie = (em, se) => {
    if (se === undefined) { const m = String(em || '').split('·').map((t) => t.trim()); em = m[0]; se = m[1] || ''; }
    const e = String(em || '').trim(), t = String(se || '').trim();
    const ee = /^\d+$/.test(e) ? e + 'ª' : e;
    const ss = /^[úu]nica$/i.test(t) ? 'Série Única' : /^\d+$/.test(t) ? t + 'ª Série' : /^\d+ª$/.test(t) ? t + ' Série' : t;
    return [ee ? ee + ' Emissão' : '', ss].filter(Boolean).join(' · ');
  };
  B.serie = serie;

  const IDX = { period: 'No período', manual: 'Manual', cdi: 'CDI', cdi_plus: 'CDI +', ipca: 'IPCA', ipca_plus: 'IPCA +', pre: 'Pré-fixado' };
  const IDX_FORM = { cdi_plus: 'CDI +', ipca_plus: 'IPCA +', pre: 'Pré-fixado', manual: 'Manual' };
  const SPECIES = { quirografaria: 'Quirografária', real: 'Com garantia real', flutuante: 'Com garantia flutuante', subordinada: 'Subordinada' };
  const EMISSIONS = Array.from({ length: 20 }, (_, i) => `${i + 1}ª`);
  const SERIES = ['Única'].concat(Array.from({ length: 20 }, (_, i) => String(i + 1)));
  const PAY = { maturity: 'No vencimento', monthly: 'Mensal', semiannual: 'Semestral', annual: 'Anual' };
  const fmtRate = (v) => Number(v).toLocaleString('pt-BR');
  const rateLabel = (s) => { const u = s.rate_unit === 'am' ? 'a.m.' : 'a.a.'; return s.indexer === 'manual' ? 'Manual' : s.indexer === 'cdi' ? '100% CDI' : s.indexer === 'period' ? `${fmtRate(s.rate)}% no período` : s.indexer === 'pre' ? `${fmtRate(s.rate)}% ${u}` : `${IDX[s.indexer]} ${fmtRate(s.rate)}% ${u}`; };

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
        ${B.seg('indexer', Object.entries(IDX_FORM), s.indexer === 'period' ? 'pre' : s.indexer && IDX_FORM[s.indexer] ? s.indexer : 'cdi_plus')}
        <div class="fgrid"><div class="field" id="rate-f" style="${s.indexer === 'manual' ? 'display:none' : ''}"><label id="rate-l">${s.indexer === 'period' ? 'Rentabilidade no período' : 'Taxa'}</label>${B.affix(`<input class="input" name="rate" data-mask="rate" data-req="Informe a taxa" placeholder="0,00" value="${s.rate != null ? B.mask.fmtMoney(s.rate) : ''}">`, { suf: '%' })}
            <div id="rate-u" style="margin-top:8px">${B.seg('rate_unit', [['aa', 'a.a.'], ['am', 'a.m.'], ['ap', 'a.p.']], s.indexer === 'period' ? 'ap' : s.rate_unit || 'aa').replace('data-v="aa"', 'data-v="aa" title="Ao ano"').replace('data-v="am"', 'data-v="am" title="Ao mês"').replace('data-v="ap"', 'data-v="ap" title="Ao Período"')}</div>
</div>
          <div class="field"><label>Pagamento de juros</label><select class="input" name="interest_payment">${Object.entries(PAY).map(([k, l]) => `<option value="${k}" ${k === (s.interest_payment || 'maturity') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
      <div class="fsec"><h3>Prazo e resgate</h3>
        <div class="field"><label>Vencimento</label><input class="input" name="maturity" data-mask="date" value="${esc(B.mask.toBr(s.maturity || ''))}"></div>
        <label class="swrow"><span><b>Permite resgate antecipado</b><span class="small">O debenturista pode pedir resgate antes do vencimento</span></span><input type="checkbox" name="early_redemption" ${s.early_redemption ? 'checked' : ''}></label>
        <div class="field" id="grace-f" style="${s.early_redemption ? '' : 'display:none'}"><label>Carência para resgate</label>${B.affix(`<input class="input" name="grace_days" data-mask="int" value="${s.grace_days ?? 0}">`, { suf: 'dias' })}</div></div>
      <div class="fsec"><h3>Dados do título</h3><p class="small muted" style="margin:0 0 10px">Preenchem o boletim de integralização e de resgate.</p>
        <div class="field"><label>Descrição</label><input class="input" name="description" maxlength="120" value="${esc(s.description || '')}" placeholder="Ex.: Captação capital de giro 2026" autocomplete="off"></div>
        <div class="fgrid"><div class="field"><label>Data de emissão</label><input class="input" name="issue_date" data-mask="date" value="${esc(B.mask.toBr(s.issue_date || ''))}"></div>
          <div class="field"><label>Espécie</label><select class="input" name="species">${Object.entries(SPECIES).map(([k, l]) => `<option value="${k}" ${k === (s.species || 'quirografaria') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="fgrid"><div class="field"><label>Conversibilidade</label><select class="input" name="convertible"><option value="0" ${s.convertible ? '' : 'selected'}>Não conversível em ações</option><option value="1" ${s.convertible ? 'selected' : ''}>Conversível em ações</option></select></div>
          <div class="field"><label>Agente fiduciário <span class="small muted">(se houver)</span></label><input class="input" name="fiduciary_agent" maxlength="120" value="${esc(s.fiduciary_agent || '')}" autocomplete="off"></div></div></div>
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
    const box = B.drawer({ title: s ? serie(s.emission, s.series) : 'Nova série', subtitle: 'Cada operação aprovada fica vinculada a uma série.', body: form(s, offer),
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar série</button>' });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const ix = box.querySelector('[name=indexer]'), rf = box.querySelector('#rate-f');
    const un = box.querySelector('[name=rate_unit]');
    const pick = (name, v) => { const b = box.querySelector(`[data-seg=${name}] [data-v=${v}]`); if (b) b.click(); };
    const syncIdx = () => {
      const per = un.value === 'ap';
      rf.style.display = ix.value === 'manual' ? 'none' : '';
      box.querySelector('#rate-l').textContent = per ? 'Rentabilidade no período' : 'Taxa';
    };
    ix.addEventListener('change', () => { if (un.value === 'ap' && ix.value !== 'pre' && ix.value !== 'manual') pick('rate_unit', 'aa'); syncIdx(); });
    un.addEventListener('change', () => { if (un.value === 'ap' && ix.value !== 'pre') pick('indexer', 'pre'); syncIdx(); });
    const er = box.querySelector('[name=early_redemption]'), gf = box.querySelector('#grace-f');
    er.onchange = () => { gf.style.display = er.checked ? '' : 'none'; };
    const ov = box.querySelector('[name=ofvis]'), ob = box.querySelector('#of-box');
    ov.onchange = () => { ob.style.display = ov.checked ? 'grid' : 'none'; };
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const f = box.querySelector('#sf'), err = box.querySelector('#sf-err');
      const total = B.mask.parse(f.total_amount.value);
      let bad = false;
      if (!(total > 0)) { B.fieldError(f.total_amount, 'Informe o valor total'); bad = true; }
      if (f.indexer.value !== 'manual' && !(B.mask.parse(f.rate.value) > 0)) { B.fieldError(f.rate, f.rate_unit.value === 'ap' ? 'Informe a rentabilidade no período' : 'Informe a taxa'); bad = true; }
      if (f.ofvis.checked && f.ofsum.value.trim().length < 10) { B.fieldError(f.ofsum, 'Descreva a oferta (mínimo 10 caracteres)'); bad = true; }
      if (bad) { err.hidden = true; return; }
      const p = { id: s && s.id, kind: f.kind.value, emission: f.emission.value, series: f.series.value, total_amount: total,
        unit_price: B.mask.parse(f.unit_price.value) || 1000, indexer: f.indexer.value !== 'manual' && f.rate_unit.value === 'ap' ? 'period' : f.indexer.value, rate: f.indexer.value === 'manual' ? 0 : B.mask.parse(f.rate.value), rate_unit: f.rate_unit.value === 'ap' ? 'aa' : (f.rate_unit.value || 'aa'), interest_payment: f.interest_payment.value,
        issue_date: B.mask.iso(f.issue_date) || null, description: f.description.value.trim(), species: f.species.value, convertible: f.convertible.value === '1', fiduciary_agent: f.fiduciary_agent.value.trim(),
        maturity: B.mask.iso(f.maturity) || null, early_redemption: f.early_redemption.checked, grace_days: f.early_redemption.checked ? parseInt(f.grace_days.value, 10) || 0 : 0 };
      try {
        await run(ev.currentTarget, async () => {
          const r = await rpc('partner_series_save', { p });
          const id = (s && s.id) || (r && r.id);
          if (id && (f.ofvis.checked || (s && offer.offer_visible) || f.ofsum.value.trim())) await rpc('partner_series_offer', { p_series: id, p_visible: f.ofvis.checked, p_min: B.mask.parse(f.ofmin.value) || 0, p_summary: f.ofsum.value });
        }, 'Série salva');
        closeModal(); reload();
      } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  const { today } = B;
  const qty = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const pu = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 12 });
  const pu2 = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


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
  B.pixPayload = pixPayload;
  async function pixModal(x, me) {
    const accs = await rpc('partner_bank_accounts').catch(() => []);
    const acc = accs.find((a) => a.pix_key);
    if (!acc) { B.modal({ title: 'Pix do fundo', body: '<p class="u-m0">Cadastre uma conta com chave Pix em <b>Configurações → Banco → Outras contas</b> para gerar o QR de cobrança da integralização.</p>', foot: '' }); return; }
    const code = pixPayload({ key: acc.pix_key, name: (me.funder && (me.funder.trade_name || me.funder.legal_name)) || acc.label, city: 'SAO PAULO', amount: Number(x.amount), txid: 'INT' + String(x.id).replace(/-/g, '').slice(0, 20) });
    const box = B.modal({ title: `Pix · ${brl(x.amount)}`, body: `<div class="pix-box"><div class="pix-qr">${B.qrSvg(code)}</div><div class="small"><b>${esc(x.investor)}</b> · ${esc(serie(x.series))}<br>Chave: ${esc(acc.pix_key)} (${esc(acc.label)})</div></div>
      <textarea class="u-mt12 input mono" rows="3" readonly>${esc(code)}</textarea><div class="u-mt8 small muted">Pix estático: a confirmação do pagamento continua manual, depois de conferir o valor na conta.</div>`, foot: '<button class="btn" data-act="copy">Copiar código</button>' });
    box.querySelector('[data-act=copy]').onclick = () => B.copy(code);
  }

  /* Valorização manual: define o P.U. de uma data (vale até a próxima valorização) */
  async function valuate(s, reload) {
    const hist = await rpc('partner_series_valuations', { p_series: s.id });
    let base = Number(s.current_pu), at = null;
    const auto = ['cdi', 'cdi_plus', 'ipca', 'ipca_plus', 'pre'].includes(s.indexer);
    const MODES = (auto ? [['idx', 'Pelo índice']] : []).concat([['pct', 'Por %'], ['amt', 'Por valor (R$)'], ['pu', 'Novo P.U.']]);
    const box = B.drawer({ title: `Valorizar ${serie(s.emission, s.series)}`, subtitle: auto ? 'Escolha a data: o P.U. pode ser calculado pelo índice até ela ou informado por você. Vale até a próxima alteração.' : 'Valorize ou desvalorize o P.U. em uma data. Vale até a próxima alteração; cada integralização valoriza a partir da própria data.',
      body: `<form id="vf" novalidate>
        <div class="sumcard" id="curpu"><div><span class="small muted">P.U. na data</span><b>R$ ${pu2(base)}</b></div><div><span class="small muted">${s.pu_date ? 'Última valorização' : 'Origem'}</span><b>${s.pu_date ? date(s.pu_date) : 'P.U. inicial'}</b></div></div>
        <div class="fsec"><h3>Alteração</h3>
          <div class="fgrid"><div class="field"><label>Data da valorização</label><input class="input" name="on_date" data-mask="date" data-req="Informe a data" value="${esc(B.mask.toBr(today()))}"></div></div>
          ${B.seg('mode', MODES, MODES[0][0])}
          <div id="dirw" class="u-mt10">${B.seg('dir', [['up', 'Valorizar (+)'], ['down', 'Desvalorizar (−)']], 'up')}</div>
          <div class="fgrid"><div class="field" id="valw"></div></div>
          <div id="idxpu" hidden></div>
          <div class="sumcard" id="newpu" hidden></div>
          <div class="field"><label>Observação (opcional)</label><input class="input" name="note" maxlength="120" placeholder="Ex.: ajuste conforme laudo do administrador"></div></div>
        ${hist.length ? '<div class="fsec" id="hist"></div>' : ''}
        <div class="error-box" id="vf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    const f = box.querySelector('#vf'), err = box.querySelector('#vf-err'), np = box.querySelector('#newpu'), vw = box.querySelector('#valw'), dw = box.querySelector('#dirw');
    const histBox = box.querySelector('#hist');
    if (histBox) {
      const hf = { from: '', to: '' };
      const drawHist = () => {
        const rows = hist.filter((h) => (!hf.from || h.on_date >= hf.from) && (!hf.to || h.on_date <= hf.to));
        histBox.innerHTML = `<h3>Histórico</h3><div class="row" style="gap:8px;align-items:end;margin-bottom:8px"><div class="field u-m0"><label class="small muted">De</label><input class="input" type="date" id="h-from" value="${esc(hf.from)}"></div><div class="field u-m0"><label class="small muted">Até</label><input class="input" type="date" id="h-to" value="${esc(hf.to)}"></div><button type="button" class="btn ghost sm" id="h-clear">Limpar</button></div>
          ${rows.length ? `<table class="mini"><tbody>${rows.map((h) => `<tr><td>${date(h.on_date)}</td><td class="num"><b>R$ ${pu2(h.unit_price)}</b></td><td class="small muted">${esc(h.note || '')}</td><td class="num nowrap"><button type="button" class="btn ghost sm" data-hedit="${esc(h.on_date)}">Editar</button> <button type="button" class="btn ghost sm" data-hdel="${esc(h.on_date)}">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<div class="small muted">Nenhuma valorização no período.</div>'}`;
        histBox.querySelector('#h-from').onchange = (e) => { hf.from = e.target.value; drawHist(); };
        histBox.querySelector('#h-to').onchange = (e) => { hf.to = e.target.value; drawHist(); };
        histBox.querySelector('#h-clear').onclick = () => { hf.from = ''; hf.to = ''; drawHist(); };
        histBox.querySelectorAll('[data-hedit]').forEach((b) => (b.onclick = () => {
          const h = hist.find((y) => y.on_date === b.dataset.hedit); if (!h) return;
          B.setSeg(box, 'mode', 'pu');
          f.on_date.value = B.mask.toBr(h.on_date); f.on_date.dispatchEvent(new Event('input', { bubbles: true }));
          if (f.val) { f.val.value = String(Number(h.unit_price)).replace('.', ','); f.val.dispatchEvent(new Event('input', { bubbles: true })); }
          f.note.value = h.note || ''; f.on_date.scrollIntoView({ block: 'center' });
        }));
        histBox.querySelectorAll('[data-hdel]').forEach((b) => (b.onclick = async () => {
          const ok = await B.confirmAction({ title: 'Excluir valorização', text: `A valorização de ${date(b.dataset.hdel)} será removida e o P.U. e a contabilização da série são recalculados.`, confirmLabel: 'Excluir' });
          if (ok == null) return;
          try { await run(b, () => rpc('partner_series_valuation_delete', { p_series: s.id, p_date: b.dataset.hdel }), 'Valorização excluída'); closeModal(); reload(); } catch (_) { /* já avisado */ }
        }));
      };
      drawHist();
    }
    const LAB = { pct: ['Variação', { suf: '%' }], amt: ['Variação por debênture', { pre: 'R$' }], pu: ['Novo P.U.', { pre: 'R$' }] };
    const drawVal = () => {
      const isIdx = f.mode.value === 'idx';
      box.querySelector('#idxpu').hidden = !isIdx; vw.parentElement.hidden = isIdx; dw.style.display = 'none';
      if (isIdx) { np.hidden = true; vw.innerHTML = ''; showIdx(); return; }
      const [l, opt] = LAB[f.mode.value];
      vw.innerHTML = `<label>${l}</label>${B.affix(`<input class="input" name="val" data-mask="${f.mode.value === 'pct' ? 'rate' : 'money'}" data-req="Informe o valor" placeholder="0,00">`, opt)}`;
      B.mask.attach(vw); B.formInit(vw); f.val.addEventListener('input', upd);
      dw.style.display = f.mode.value === 'pu' ? 'none' : ''; upd();
    };
    const showIdx = () => {};
    const loadAt = async () => {
      const d = B.mask.iso(f.on_date);
      if (!d || d > today()) return;
      try { at = await rpc('partner_series_pu_at', { p_series: s.id, p_date: d }); at.date = d; base = Number(at.pu) || base; box.querySelector('#curpu').firstElementChild.innerHTML = `<span class="small muted">P.U. na data</span><b>R$ ${pu2(base)}</b>`; if (f.mode.value === 'idx') showIdx(); else upd(); } catch (_) { /* mantém o P.U. atual */ }
    };
    f.on_date.addEventListener('input', () => { if (f.on_date.value.length === 10) loadAt(); });
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
      np.innerHTML = `<div><span class="small muted">Novo P.U.</span><b>R$ ${pu2(v)}</b></div><div><span class="small muted">${diff < 0 ? 'Desvalorização' : 'Valorização'}</span><b>${diff < 0 ? '−' : '+'}R$ ${pu2(Math.abs(diff))} (${diff < 0 ? '−' : '+'}${(Math.abs(diff) / base * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)</b></div>`;
    };
    f.dir.addEventListener('change', upd); f.mode.addEventListener('change', drawVal);
    drawVal(); loadAt();
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const d = B.mask.iso(f.on_date), isIdx = f.mode.value === 'idx', x = isIdx ? 1 : B.mask.parse(f.val.value);
      let bad = false;
      if (!d || d > today()) { B.fieldError(f.on_date, 'Use uma data até hoje'); bad = true; }
      if (!isIdx && !(x > 0)) { B.fieldError(f.val, 'Informe o valor'); bad = true; }
      if (isIdx && !(at && at.date === d && at.index_pu > 0)) { err.hidden = false; err.textContent = 'Aguarde o cálculo do índice para esta data.'; bad = true; }
      else if (isIdx && at.index_until && at.index_until < d) { err.hidden = false; err.textContent = `O índice só está disponível até ${date(at.index_until)}. Escolha uma data até lá ou informe o valor.`; bad = true; }
      if (bad) return;
      const v = isIdx ? Number(at.index_pu) : calc();
      if (!(v > 0)) { err.hidden = false; err.textContent = 'A desvalorização não pode zerar o P.U.'; return; }
      const down = v < base;
      try { await run(ev.currentTarget, () => (isIdx ? rpc('partner_series_valuate_index', { p_series: s.id, p_date: d, p_note: f.note.value || null }) : rpc('partner_series_valuate', { p_series: s.id, p_date: d, p_pu: v, p_note: f.note.value || '' })), down ? 'Série desvalorizada' : 'Série valorizada'); closeModal(); reload(); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  async function seriesTab(el, me, host) {
    const list = await rpc('partner_series_list');
    const tot = list.filter((s) => s.status === 'open').reduce((a, s) => ({ t: a.t + Number(s.total_amount), u: a.u + Number(s.allocated) }), { t: 0, u: 0 });
    const adm = me.is_admin !== false;
    host.innerHTML = (list.length ? `
      <div class="card"><table>
      <thead><tr><th>Série</th><th>Remuneração</th><th>Vencimento</th><th class="num">P.U. atual</th><th class="num">Emitido</th><th class="num">Alocado</th><th></th></tr></thead><tbody>
      ${list.map((s) => { return `<tr><td><b>${esc(serie(s.emission, s.series))}</b>${s.description ? `<div class="small">${esc(s.description)}</div>` : ''}<div class="small muted">${s.kind === 'fidc_quota' ? 'Cota de FIDC' : 'Debênture'} · ${esc(s.operations)} operações${s.status === 'closed' ? ' · encerrada' : ''}</div></td>
        <td>${esc(rateLabel(s))}</td><td>${s.maturity ? date(s.maturity) : '—'}</td>
        <td class="num"><b>R$ ${pu2(s.current_pu)}</b></td>
        <td class="num">${brl(s.total_amount)}</td>
        <td class="num">${brl(s.allocated)}</td>
        <td class="num">${adm ? `${s.indexer !== 'period' ? `<button class="btn ghost sm" data-val="${esc(s.id)}">Valorizar</button> ` : ''}<button class="btn ghost sm" data-edit="${esc(s.id)}">Editar</button> <button class="btn ghost sm" data-close="${esc(s.id)}" data-to="${s.status === 'open' ? 1 : 0}">${s.status === 'open' ? 'Encerrar' : 'Reabrir'}</button>` : ''}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="4">Total (séries abertas)</td><td class="num">${brl(tot.t)}</td><td class="num">${brl(tot.u)}</td><td></td></tr></tfoot></table></div>` : `<div class="card">${empty('Nenhuma série cadastrada. Crie a primeira para vincular as operações ao lastro.')}</div>`);
    const draw = () => seriesTab(el, me, host);
    const n = el.querySelector('#new'); if (n) n.onclick = () => edit(null, draw);
    host.querySelectorAll('[data-val]').forEach((b) => (b.onclick = () => valuate(list.find((x) => x.id === b.dataset.val), draw)));
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
        <div class="fsec"><h3>Série</h3><select class="input" name="series">${open.map((s) => `<option value="${esc(s.id)}">${esc(serie(s.emission, s.series))} — P.U. R$ ${pu(s.unit_price)}</option>`).join('')}</select></div>
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
          <div class="fsec"><h3>Série</h3><select class="input" name="series">${ser.map((s) => `<option value="${esc(s.id)}" ${s.id === pre.series_id ? 'selected' : ''}>${esc(serie(s.emission, s.series))}</option>`).join('')}</select></div>` : ''}
        <div class="fsec"><h3>Valores</h3><div class="fgrid"><div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="numeric" value="${esc(x.quantity || '')}" placeholder="0"></div>
          <div class="field"><label>P.U. na integralização</label>${B.affix(`<input class="input" name="pu" data-mask="pu" value="${x.unit_price ? esc(B.mask.fmtMoney(x.unit_price, 12, 2)) : ''}" placeholder="0,00">`, { pre: 'R$' })}</div></div>
          <div class="sumcard" id="tot"><span class="lbl">Valor total</span><span class="big">${brl(x.amount || 0)}</span></div></div>
        <div class="fsec"><h3>Data da integralização</h3><input class="input" name="pay_date" data-mask="date" value="${esc(B.mask.toBr(x.pay_date || today()))}"></div>
        ${B.commission.html(origs, x)}<div class="error-box" id="sf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    const f = box.querySelector('#sf'), err = box.querySelector('#sf-err');
    B.commission.bind(f, origs);
    const nv = box.querySelector('#newinv'); if (nv) nv.onclick = () => closeModal();
    const tot = () => { const q = Number(String(f.qty.value).replace(/\D/g, '')), p = B.mask.parse(f.pu.value); box.querySelector('#tot .big').textContent = brl(Math.round(q * p * 100) / 100); };
    f.qty.addEventListener('input', tot); f.pu.addEventListener('input', tot);
    if (isNew) { const fillPu = () => { const sr = ser.find((z) => z.id === f.series.value); const base = sr && Number(sr.unit_price); if (base > 0) { f.pu.value = B.mask.fmtMoney(base, 12, 2); tot(); } else { f.pu.value = ''; tot(); } }; f.series.addEventListener('change', fillPu); fillPu(); }
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
    const box = B.drawer({ title: x.investor, subtitle: `${esc(serie(x.series))} · integralização de ${esc(date(x.pay_date || x.created_at))}`,
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


  /* ---------------- Importar posições (CSV) ---------------- */
  function importPositions(done) {
    const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const box = B.drawer({ title: 'Importar posições', subtitle: 'CSV com uma linha por integralização já paga.',
      body: `<div class="fsec"><h3>Arquivo</h3><label class="filebox"><input type="file" id="ip-file" accept=".csv,.txt,text/csv" hidden><span class="btn secondary sm">Escolher CSV</span><span class="fname" id="ip-name">Nenhum arquivo escolhido</span></label>
        <div class="u-mt8 help">Colunas: Data de integralização · Investidor · CPF/CNPJ · Emissão · Série · Quantidade · P.U. (separador ponto e vírgula). O investidor é encontrado pelo CPF/CNPJ e a série pela emissão e número.</div></div>
      <div id="ip-res"></div><div class="error-box" id="ip-err" hidden></div>`,
      foot: '<button class="btn secondary" data-act="cancel">Fechar</button><button class="btn" data-act="ok" disabled>Importar</button>' });
    const res = box.querySelector('#ip-res'), err = box.querySelector('#ip-err'), ok = box.querySelector('[data-act=ok]');
    let rows = [];
    const split = (line, d) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === d && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((x) => x.trim()); };
    const iso = (t) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t) || null; if (m) return `${m[3]}-${m[2]}-${m[1]}`; return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; };
    const nm = (t) => { const v = parseFloat(String(t || '').replace(/\./g, '').replace(',', '.')); return isFinite(v) ? v : null; };
    const parse = (txt) => {
      const lines = txt.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return [];
      const d = lines[0].includes(';') ? ';' : ',', head = split(lines[0], d).map(fold);
      const ix = (re) => head.findIndex((h) => re.test(h));
      const c = { date: ix(/data/), doc: ix(/cpf|cnpj|document/), em: ix(/emiss/), se: ix(/^serie/), q: ix(/quant/), pu: ix(/^p\.?u/) };
      if (c.date < 0 || c.doc < 0 || c.em < 0 || c.se < 0 || c.q < 0) return null;
      return lines.slice(1).map((l) => { const r = split(l, d); return { date: iso(r[c.date]), document: r[c.doc], emission: r[c.em], series: r[c.se], quantity: nm(r[c.q]), unit_price: c.pu >= 0 ? nm(r[c.pu]) : 1000 }; });
    };
    const show = (r) => {
      const bad = r.rows.filter((x) => x.status !== 'ok');
      res.innerHTML = `<div class="fsec"><h3>Conferência</h3><div class="sumcard"><span class="lbl">Prontas para importar</span><span class="big">${r.ok}</span>
        <div class="sub"><span>Já existentes <b>${r.skipped}</b></span><span>Com problema <b>${r.errors}</b></span></div></div>
        ${bad.length ? `<div class="u-mt10 small">${bad.slice(0, 40).map((x) => `<div>Linha ${x.row + 1}: ${esc(x.message)}</div>`).join('')}${bad.length > 40 ? `<div class="muted">… e mais ${bad.length - 40}</div>` : ''}</div>` : ''}</div>`;
      ok.disabled = !r.ok; ok.textContent = r.ok ? `Importar ${r.ok} ${r.ok === 1 ? 'integralização' : 'integralizações'}` : 'Importar';
    };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('#ip-file').onchange = async (e) => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      err.hidden = true; res.innerHTML = ''; ok.disabled = true; rows = [];
      box.querySelector('#ip-name').textContent = file.name;
      try {
        const buf = await file.arrayBuffer(); let txt;
        try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { txt = new TextDecoder('windows-1252').decode(buf); }
        const p = parse(txt);
        if (!p || !p.length) { err.hidden = false; err.textContent = 'Não reconheci as colunas. Use o modelo: Data de integralização; Investidor; CPF/CNPJ; Emissão; Série; Quantidade; P.U.'; return; }
        if (p.length > 1000) { err.hidden = false; err.textContent = 'Máximo de 1.000 linhas por importação.'; return; }
        rows = p; show(await rpc('partner_subs_import', { p_rows: rows, p_dry: true }));
      } catch (e2) { err.hidden = false; err.textContent = B.message(e2); }
    };
    ok.onclick = async () => {
      try { const r = await run(ok, () => rpc('partner_subs_import', { p_rows: rows, p_dry: false })); toast(`${r.ok} ${r.ok === 1 ? 'integralização importada' : 'integralizações importadas'}${r.skipped ? ` · ${r.skipped} já existiam` : ''}`); closeModal(); done(); } catch (_) { /* já avisado */ }
    };
  }

  /* ---------------- Posições (uma linha por integralização) ---------------- */
  let posView = 'all', posF = { q: '', series: '', from: '', to: '' };
  async function positionsTab(el, me, host) {
    const [subsAll, series, reds, cols] = await Promise.all([rpc('partner_subs_list'), rpc('partner_series_list'), rpc('partner_redemptions_list'), rpc('partner_collections_list').catch(() => [])]);
    const puOf = {}; series.forEach((z) => { puOf[z.id] = Number(z.current_pu); });
    const redQ = {}; reds.filter((r) => r.status === 'paid').forEach((r) => { const k = r.document + '|' + r.series; redQ[k] = (redQ[k] || 0) + Number(r.quantity); });
    const lots = subsAll.map((x) => ({ ...x, quantity: Number(x.quantity || 0) }));
    lots.filter((x) => x.status === 'paid').sort((a, b) => String(a.pay_date || a.created_at).localeCompare(String(b.pay_date || b.created_at))).forEach((x) => { const k = x.document + '|' + x.series, take = Math.min(redQ[k] || 0, x.quantity); redQ[k] = (redQ[k] || 0) - take; x.remaining = x.quantity - take; });
    lots.forEach((x) => { if (x.status === 'pending') x.remaining = x.quantity; if (x.status === 'cancelled') x.remaining = 0; x.curPu = x.cur_pu != null ? Number(x.cur_pu) : puOf[x.series_id]; x.value = x.status === 'pending' ? Number(x.amount) : x.remaining * (x.curPu || Number(x.unit_price)); x.closed = x.status === 'cancelled' || (x.status === 'paid' && x.remaining === 0); });
    const bol = {}; cols.filter((c) => c.kind === 'boletim_subscricao' && c.status !== 'cancelled').forEach((c) => { bol[c.ref_id] = c; });
    const pill = (k, l, n) => `<button type="button" data-view="${k}" class="btn ${posView === k ? '' : 'secondary'} sm">${l} <span style="opacity:.7">${n}</span></button>`;
    const tagOf = (x) => (x.status === 'cancelled' ? ['Cancelada', ''] : x.closed ? ['Resgatada', ''] : x.status === 'pending' ? ['Aguardando pagamento', 'warning'] : ['Integralizada', 'success']);
    const gainOf = (x) => (x.status === 'paid' ? x.value - x.remaining * Number(x.unit_price || 0) : 0);
    const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const seriesNames = [...new Set(lots.map((x) => x.series))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const dayOf = (x) => String(x.pay_date || x.created_at || '').slice(0, 10);
    const filtered = () => {
      const q = fold(posF.q).trim(), qd = posF.q.replace(/\D/g, '');
      return lots.filter((x) => (!q || fold(x.investor).includes(q) || (qd && String(x.document || '').includes(qd))) && (!posF.series || x.series === posF.series) && (!posF.from || dayOf(x) >= posF.from) && (!posF.to || dayOf(x) <= posF.to));
    };
    const sumOf = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
    const filtering = () => !!(posF.q || posF.series || posF.from || posF.to);
    const nAct = () => (posF.q ? 1 : 0) + (posF.series ? 1 : 0) + (posF.from || posF.to ? 1 : 0);
    host.innerHTML = `<div class="row between" style="gap:8px;margin-bottom:12px;flex-wrap:wrap"><div id="pp-pills" class="row" style="gap:8px"></div>
        <button type="button" class="btn secondary sm" id="pp-filt" aria-expanded="false">Filtros <span class="tag brand" id="pp-badge" hidden></span></button></div>
      <div class="card" id="pp-panel" hidden style="margin-bottom:12px"><div class="fgrid">
        <div class="field"><label>Investidor ou CPF/CNPJ</label><input class="input" name="q" type="search" placeholder="Buscar" value="${esc(posF.q)}"></div>
        <div class="field"><label>Série</label><select class="input" name="series"><option value="">Todas as séries</option>${seriesNames.map((n) => `<option value="${esc(n)}" ${n === posF.series ? 'selected' : ''}>${esc(serie(n))}</option>`).join('')}</select></div>
        <div class="field"><label>Período</label><input class="input" id="pp-per" placeholder="Selecione o período"></div></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="linkbtn" id="pp-clear">Limpar filtros</button></div></div>
      <div id="pp-list"></div>`;
    const panel = host.querySelector('#pp-panel'); panel.hidden = !nAct();
    let shown = lots;
    const draw = () => {
      const base = filtered(), open = base.filter((x) => !x.closed), closed = base.filter((x) => x.closed);
      shown = posView === 'closed' ? closed : posView === 'open' ? open : base;
      host.querySelector('#pp-pills').innerHTML = pill('all', 'Tudo', base.length) + pill('open', 'Abertas', open.length) + pill('closed', 'Fechadas', closed.length);
      const bd = host.querySelector('#pp-badge'); bd.hidden = !nAct(); bd.textContent = nAct();
      const pg = B.ui.pager('pos', shown, { unit: shown.length === 1 ? 'integralização' : 'integralizações', sig: posView + JSON.stringify(posF), cols: [dayOf, (x) => x.investor, (x) => x.series, (x) => Number(x.status === 'paid' ? x.remaining : x.quantity), (x) => Number(x.amount), (x) => Number(x.status === 'cancelled' ? 0 : x.value), gainOf, (x) => tagOf(x)[0]] });
      host.querySelector('#pp-list').innerHTML = shown.length ? `<div class="card"><table><thead><tr><th>Integralização</th><th>Investidor</th><th>Série</th><th class="num">Qtd.</th><th class="num">Valor inicial</th><th class="num">Valor atual</th><th class="num">Rendimento</th><th>Situação</th><th></th></tr></thead><tbody>
        ${pg.rows.map((x) => { const t = tagOf(x), g = gainOf(x); return `<tr><td>${esc(date(x.pay_date || x.created_at))}</td><td><b>${esc(x.investor)}</b></td><td>${esc(serie(x.series))}</td><td class="num">${esc(x.status === 'paid' ? x.remaining : x.quantity)}</td><td class="num">${brl(x.amount)}</td><td class="num"><b>${brl(x.status === 'cancelled' ? x.amount : x.value)}</b></td><td class="num" style="color:var(--${g < 0 ? 'danger' : 'success'}, inherit)">${x.status === 'paid' ? brl(g) : '—'}</td><td><span class="tag ${t[1]}">${t[0]}</span></td><td class="num"><button class="btn ghost sm" data-lot="${esc(x.id)}">Ver mais</button></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total${filtering() ? ' (filtrado)' : ''}</td><td class="num">${sumOf(shown, (x) => (x.status === 'paid' ? x.remaining : x.quantity))}</td><td class="num">${brl(sumOf(shown, (x) => Number(x.amount)))}</td><td class="num">${brl(sumOf(shown, (x) => (x.status === 'cancelled' ? 0 : x.value)))}</td><td class="num">${brl(sumOf(shown, gainOf))}</td><td colspan="2"></td></tr></tfoot></table>${pg.bar}</div>`
        : `<div class="card">${empty(filtering() ? 'Nenhuma integralização com esses filtros.' : posView === 'closed' ? 'Nenhuma integralização fechada.' : posView === 'open' ? 'Nenhuma integralização aberta. Use "Adicionar posição" para registrar uma.' : 'Nenhuma integralização ainda. Use "Adicionar posição" para registrar uma.')}</div>`;
      B.ui.pagerBind(host, 'pos', draw);
      host.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { posView = b.dataset.view; draw(); }));
      host.querySelectorAll('[data-lot]').forEach((b) => (b.onclick = () => lotDrawer(lots.find((x) => x.id === b.dataset.lot), { me, bol }, again)));
    };
    el._export = () => csv('posicoes', ['Integralização', 'Investidor', 'CPF/CNPJ', 'Série', 'Quantidade', 'P.U. adquirido', 'Valor inicial', 'P.U. atual', 'Valor atual', 'Situação'], shown.map((x) => [x.pay_date || x.created_at.slice(0, 10), x.investor, x.document, serie(x.series), x.status === 'paid' ? x.remaining : x.quantity, num(x.unit_price), num(x.amount), num(x.curPu), num(x.value), tagOf(x)[0]]));
    const again = () => positionsTab(el, me, host);
    let tmr = null;
    const per = B.mask.rangePicker(host.querySelector('#pp-per'), { get: () => ({ from: posF.from, to: posF.to }), set: (f, t2) => { posF.from = f; posF.to = t2; draw(); } });
    host.querySelectorAll('#pp-panel [name]').forEach((inp) => { const h = () => { posF[inp.name] = inp.value; clearTimeout(tmr); tmr = setTimeout(draw, inp.name === 'q' ? 200 : 0); }; inp.addEventListener('input', h); inp.addEventListener('change', h); });
    host.querySelector('#pp-clear').onclick = () => { posF = { q: '', series: '', from: '', to: '' }; host.querySelectorAll('#pp-panel [name]').forEach((i) => { i.value = ''; }); per.refresh(); draw(); };
    host.querySelector('#pp-filt').onclick = (e) => { panel.hidden = !panel.hidden; e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden)); };
    draw();
    const n = el.querySelector('#new'); if (n) n.onclick = () => subForm(null, again);
    const im = el.querySelector('#imp'); if (im) im.onclick = () => importPositions(again);
  }

  /* ---------------- Resgates ---------------- */
  const RST = { pending: ['Efetivado', 'success'], paid: ['Efetivado', 'success'], cancelled: ['Cancelado', ''] };

  async function newRedemption(done, pre) {
    pre = pre || {};
    const pos = await rpc('partner_positions');
    if (!pos.length) { toast('Ainda não há posição para resgatar.'); return; }
    const box = B.drawer({ title: 'Novo resgate', subtitle: 'Resgate das debêntures de um investidor. IR e IOF são calculados sobre o rendimento. O resgate já vale ao criar; o pagamento ao investidor fica na Tesouraria.',
      body: `<form id="rf" novalidate>
        <div class="fsec"><h3>Posição</h3><select class="input" name="pos">${pos.map((x, i) => `<option value="${i}">${esc(x.investor)} · ${esc(serie(x.series))} (${qty(x.quantity)} debêntures)</option>`).join('')}</select></div>
        <div class="fgrid"><div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="decimal" data-req="Informe a quantidade" placeholder="0"></div>
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
        const p = pos[f.pos.value], q = f.all.checked ? Number(p.quantity) : Number(String(f.qty.value).replace(/[^\d,]/g, '').replace(',', '.')), d = B.mask.iso(f.on_date);
        if (f.all.checked) f.qty.value = qty(p.quantity);
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
    const box = B.drawer({ title: x.investor, subtitle: `${esc(serie(x.series))} · resgate de ${esc(date(x.pay_date || x.created_at))}`,
      body: `<div id="rd"></div>`,
      foot: '<button class="btn secondary" data-act="close">Fechar</button><button class="btn danger" data-act="del">Excluir</button><button class="btn secondary" data-act="edit">Editar</button><button class="btn" data-act="bol">Boletim</button>' });
    const q = (a) => box.querySelector(`[data-act=${a}]`), host = box.querySelector('#rd');
    const view = () => {
      host.innerHTML = `<div class="mini-row">${kpi('Líquido ao investidor', brl(x.net), `${qty(x.quantity)} debêntures`)}${kpi('Valor bruto', brl(x.gross), 'P.U. R$ ' + pu(x.unit_price))}</div>
        <div class="u-mt14">${line('Situação', `<span class="tag ${st[1]}">${st[0]}</span>`)}${line('Data', esc(date(x.pay_date || x.created_at)))}${line('Custo das debêntures', brl(x.cost || 0))}${line('Rendimento', brl(x.gain))}${line('IOF', brl(x.iof))}${line('Imposto de renda', brl(x.ir))}${line('Líquido', brl(x.net))}</div>`;
    };
    view();
    q('close').onclick = () => closeModal();
    q('bol').onclick = () => B.boletimPopup('resgate', x.id, x, again).catch((e) => toast(B.message(e), true));
    q('edit').onclick = () => {
      host.innerHTML = `<form id="ef" novalidate><div class="fgrid"><div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="decimal" value="${esc(x.quantity)}"></div>
        <div class="field"><label>Data do resgate</label><input class="input" name="on_date" data-mask="date" value="${esc(B.mask.toBr(x.pay_date || today()))}"></div></div>
        <div class="small muted">IR e IOF são recalculados pela data e pela quantidade.</div><div class="error-box" id="ef-err" hidden></div>
        <div class="u-mt12"><button type="button" class="btn secondary sm" data-x>Cancelar</button> <button type="button" class="btn sm" data-ok>Salvar</button></div></form>`;
      B.mask.attach(host);
      const f = host.querySelector('#ef'), err = host.querySelector('#ef-err');
      f.querySelector('[data-x]').onclick = view;
      f.querySelector('[data-ok]').onclick = async (ev) => {
        const qn = Number(String(f.qty.value).replace(/[^\d,.]/g, '').replace(',', '.')), d = B.mask.iso(f.on_date);
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

  let redF = { q: '', series: '', from: '', to: '' };
  async function redemptionsTab(el, me, host) {
    const list = await rpc('partner_redemptions_list');
    const live = list.filter((x) => x.status !== 'cancelled');
    const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const dayOf = (x) => String(x.pay_date || x.created_at || '').slice(0, 10);
    const seriesNames = [...new Set(live.map((x) => x.series))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
    const filtered = () => {
      const q = fold(redF.q).trim(), qd = redF.q.replace(/\D/g, '');
      return live.filter((x) => (!q || fold(x.investor).includes(q) || (qd && String(x.document || '').includes(qd))) && (!redF.series || x.series === redF.series) && (!redF.from || dayOf(x) >= redF.from) && (!redF.to || dayOf(x) <= redF.to));
    };
    const nAct = () => (redF.q ? 1 : 0) + (redF.series ? 1 : 0) + (redF.from || redF.to ? 1 : 0);
    host.innerHTML = `<div class="row between" style="gap:8px;margin-bottom:12px;flex-wrap:wrap"><div></div>
        <button type="button" class="btn secondary sm" id="rr-filt" aria-expanded="false">Filtros <span class="tag brand" id="rr-badge" hidden></span></button></div>
      <div class="card" id="rr-panel" hidden style="margin-bottom:12px"><div class="fgrid">
        <div class="field"><label>Investidor ou CPF/CNPJ</label><input class="input" name="q" type="search" placeholder="Buscar" value="${esc(redF.q)}"></div>
        <div class="field"><label>Série</label><select class="input" name="series"><option value="">Todas as séries</option>${seriesNames.map((n) => `<option value="${esc(n)}" ${n === redF.series ? 'selected' : ''}>${esc(serie(n))}</option>`).join('')}</select></div>
        <div class="field"><label>Período</label><input class="input" id="rr-per" placeholder="Selecione o período"></div></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="linkbtn" id="rr-clear">Limpar filtros</button></div></div>
      <div id="rr-list"></div>`;
    const panel = host.querySelector('#rr-panel'); panel.hidden = !nAct();
    let shown = live;
    const draw = () => {
      shown = filtered();
      const sm = (k) => shown.reduce((t, x) => t + Number(x[k] || 0), 0);
      const bd = host.querySelector('#rr-badge'); bd.hidden = !nAct(); bd.textContent = nAct();
      const pg = B.ui.pager('red', shown, { unit: shown.length === 1 ? 'resgate' : 'resgates', sig: JSON.stringify(redF),
        cols: [dayOf, (x) => x.investor, (x) => x.series, (x) => Number(x.quantity), (x) => Number(x.unit_price || 0), (x) => Number(x.gross), (x) => Number(x.iof), (x) => Number(x.ir), (x) => Number(x.net), (x) => (RST[x.status] || [x.status])[0]] });
      host.querySelector('#rr-list').innerHTML = shown.length ? `<div class="card"><table><thead><tr><th>Data</th><th>Investidor</th><th>Série</th><th class="num">Qtd.</th><th class="num">P.U.</th><th class="num">Bruto</th><th class="num">IOF</th><th class="num">IR</th><th class="num">Líquido</th><th>Situação</th><th></th></tr></thead><tbody>
        ${pg.rows.map((x) => { const st = RST[x.status] || [x.status, '']; return `<tr><td>${esc(date(x.pay_date || x.created_at))}</td><td><b>${esc(x.investor)}</b></td><td>${esc(serie(x.series))}</td><td class="num">${qty(x.quantity)}</td><td class="num">${x.unit_price ? 'R$ ' + pu(x.unit_price) : '—'}</td><td class="num">${brl(x.gross)}</td><td class="num">${brl(x.iof)}</td><td class="num">${brl(x.ir)}</td><td class="num"><b>${brl(x.net)}</b></td><td><span class="tag ${st[1]}">${st[0]}</span></td><td class="num"><button class="btn ghost sm" data-rv="${esc(x.id)}">Ver mais</button></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total${nAct() ? ' (filtrado)' : ''}</td><td class="num">${qty(sm('quantity'))}</td><td></td><td class="num">${brl(sm('gross'))}</td><td class="num">${brl(sm('iof'))}</td><td class="num">${brl(sm('ir'))}</td><td class="num">${brl(sm('net'))}</td><td colspan="2"></td></tr></tfoot></table>${pg.bar}</div>`
        : `<div class="card">${empty(nAct() ? 'Nenhum resgate com esses filtros.' : 'Nenhum resgate ainda. Crie o primeiro em "Novo resgate".')}</div>`;
      B.ui.pagerBind(host, 'red', draw);
      host.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = () => redemptionDrawer(list.find((x) => x.id === b.dataset.rv), again)));
    };
    el._export = () => csv('resgates', ['Data', 'Investidor', 'CPF/CNPJ', 'Série', 'Quantidade', 'P.U.', 'Bruto', 'Rendimento', 'IOF', 'IR', 'Líquido', 'Situação', 'Pago em'],
      shown.map((x) => [x.created_at.slice(0, 10), x.investor, x.document, serie(x.series), x.quantity, x.unit_price != null ? num(x.unit_price) : '', num(x.gross), num(x.gain), num(x.iof), num(x.ir), num(x.net), (RST[x.status] || [x.status])[0], x.pay_date || '']));
    const again = () => redemptionsTab(el, me, host);
    let tmr = null;
    const per = B.mask.rangePicker(host.querySelector('#rr-per'), { get: () => ({ from: redF.from, to: redF.to }), set: (f, t2) => { redF.from = f; redF.to = t2; draw(); } });
    host.querySelectorAll('#rr-panel [name]').forEach((inp) => { const h = () => { redF[inp.name] = inp.value; clearTimeout(tmr); tmr = setTimeout(draw, inp.name === 'q' ? 200 : 0); }; inp.addEventListener('input', h); inp.addEventListener('change', h); });
    host.querySelector('#rr-clear').onclick = () => { redF = { q: '', series: '', from: '', to: '' }; host.querySelectorAll('#rr-panel [name]').forEach((i) => { i.value = ''; }); per.refresh(); draw(); };
    host.querySelector('#rr-filt').onclick = (e) => { panel.hidden = !panel.hidden; e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden)); };
    draw();
    const n = el.querySelector('#new'); if (n) n.onclick = () => newRedemption(again);
  }

  /* ---------------- Oferta no Lottus Invest + interessados ---------------- */
  async function interestsTab(el, me, host, refresh) {
    const all = await rpc('partner_interests_list');
    const list = all.filter((x) => x.status === 'new');
    const done = all.filter((x) => x.status !== 'new').slice(0, 10);
    host.innerHTML = list.length || done.length ? `<div class="card"><table><thead><tr><th>Investidor</th><th>Pedido</th><th>Série</th><th class="num">Valor / quantidade</th><th></th></tr></thead><tbody>
      ${list.map((x) => `<tr><td><b>${esc(x.name)}</b><div class="small muted">${esc(x.email || '')}${x.phone ? ' · ' + esc(x.phone) : ''} · ${esc(date(x.created_at))}</div>${x.note ? `<div class="small">“${esc(x.note)}”</div>` : ''}</td><td><span class="tag ${x.kind === 'resgate' ? 'warning' : 'brand'}">${x.kind === 'resgate' ? 'Resgate' : 'Integralização'}</span></td><td>${esc(serie(x.series))}</td>
        <td class="num"><b>${x.kind === 'resgate' ? qty(x.quantity) + ' deb.' : brl(x.amount)}</b></td>
        <td class="num"><button class="btn sm" data-acc="${esc(x.id)}">Aceitar</button> <button class="btn ghost sm" data-dis="${esc(x.id)}">Dispensar</button></td></tr>`).join('')}
      ${done.map((x) => `<tr style="opacity:.6"><td>${esc(x.name)}<div class="small muted">${esc(date(x.created_at))}</div></td><td>${x.kind === 'resgate' ? 'Resgate' : 'Integralização'}</td><td>${esc(serie(x.series))}</td><td class="num">${x.kind === 'resgate' ? qty(x.quantity) + ' deb.' : brl(x.amount)}</td><td class="num small muted">${x.status === 'accepted' ? 'Aceito' : 'Dispensado'}</td></tr>`).join('')}</tbody></table></div>`
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
    const action = `<div class="u-g8 row"><button class="btn secondary" id="exp">Exportar CSV</button>${tab === 'posicoes' && adm ? '<button class="btn secondary" id="imp">Importar CSV</button>' : ''}${tab === 'series' ? (adm ? '<button class="btn" id="new">Nova série</button>' : '') : NEW[tab] ? `<button class="btn" id="new">${NEW[tab]}</button>` : ''}</div>`;
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
