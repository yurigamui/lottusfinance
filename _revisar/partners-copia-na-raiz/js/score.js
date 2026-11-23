/* Score do cedente: nota com qualquer dado disponível, que vai afinando conforme chegam mais informações.
   Fontes (da mais automática à mais manual): dados públicos do CNPJ → notas importadas → histórico de pagamento → balanço/DRE → respostas do analista. */
(() => {
  const B = window.BO;
  const { rpc, esc, brl, run, closeModal, date } = B;
  const pct0 = (x) => `${Math.round(Number(x || 0) * 100)}%`;
  const FIN = [['faturamento_gerencial', 'Faturamento anual (gerencial)'], ['receita_bruta', 'Receita bruta (12 meses)'], ['receita_liquida', 'Receita líquida'], ['lucro_bruto', 'Lucro bruto'], ['ebitda', 'EBITDA'], ['lucro_liquido', 'Lucro líquido'],
    ['ativo_circulante', 'Ativo circulante'], ['passivo_circulante', 'Passivo circulante'], ['contas_receber', 'Contas a receber'], ['contas_pagar', 'Contas a pagar'], ['emprestimos_lp', 'Empréstimos de longo prazo'],
    ['lucros_acumulados', 'Lucros acumulados'], ['prejuizos_acumulados', 'Prejuízos acumulados'], ['limites_outras', 'Limites em outras factorings']];
  const SRC_HINT = { 'Receita': 'dados públicos do CNPJ', 'Receita (CNAE)': 'dados públicos do CNPJ' };
  const ago = (iso) => (iso ? date(String(iso).slice(0, 10)) : '');

  /* busca os dados públicos dos cedentes que ainda não têm e recalcula as notas */
  B.enrichCedentes = async (btn) => {
    const r = await run(btn, async () => {
      const { data, error } = await B.sb.functions.invoke('cedente-enrich', { body: {} });
      if (error || !data || data.error) throw new Error('Não foi possível consultar a Receita agora. Tente de novo em instantes.');
      return data;
    });
    return r;
  };

  const fieldInput = (f, v) => {
    const cur = v == null ? '' : v;
    if (f.kind === 'option') return `<select class="input" data-k="${esc(f.key)}"><option value="">—</option>${(f.options || []).map((o) => `<option ${String(cur) === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (f.unit === 'pct') return B.affix(`<input class="input" data-k="${esc(f.key)}" data-pct="1" data-mask="rate" placeholder="0,00" value="${cur === '' ? '' : String(Number(cur) * 100).replace('.', ',')}">`, { suf: '%' });
    return `<input class="input" data-k="${esc(f.key)}" data-mask="int" value="${esc(cur)}">`;
  };

  B.cedenteScore = async (cnpj, name, done) => {
    let d;
    try { d = await rpc('partner_cedente_score', { p_cnpj: cnpj }); } catch (e) { return B.toast ? B.toast(B.message(e), 'error') : alert(B.message(e)); }
    const show = (d) => {
      const cov = Number(d.coverage || 0), has = cov > 0, c = d.company || {}, man = d.manual || {};
      const used = (d.breakdown || []).map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.band == null ? String(x.value ?? '') : x.band)}</td><td class="small muted">${esc(SRC_HINT[x.source] || x.source || '')}</td></tr>`).join('');
      const box = B.drawer({ title: name || c.legal_name || 'Cedente', subtitle: 'Score de crédito',
        body: `<form novalidate>
          <div class="card" style="padding:14px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
            ${has ? `${B.gauge ? B.gauge(d.score, d.tier) : ''}<div><div style="font-size:26px;font-weight:700">${Math.round(Number(d.score))} <span style="font-size:14px">${B.tierTag ? B.tierTag(d.tier) : esc(d.tier)}</span></div>
              <div class="small muted">Pontuação de 0 a 1000 · <b>${pct0(cov)}</b> dos critérios com dado</div></div>` : '<div><b>Sem dados ainda</b><div class="small muted">Busque os dados públicos do CNPJ para gerar a primeira nota.</div></div>'}
            ${has ? `<div style="margin-left:auto" class="small"><div>Taxa sugerida: <b>${(Number(d.monthly_rate) * 100).toFixed(2).replace('.', ',')}% a.m.</b></div><div>Limite sugerido: <b>${brl(d.limit)}</b></div></div>` : ''}
          </div>
          <div class="fsec"><h3>Dados públicos (Receita Federal)</h3>
            ${c.enriched ? `<dl class="kv"><dt>Situação</dt><dd>${esc(c.status || '—')}</dd><dt>Abertura</dt><dd>${c.opened_at ? date(c.opened_at) : '—'}</dd><dt>UF / cidade</dt><dd>${esc(c.uf || '—')}${c.city ? ' · ' + esc(c.city) : ''}</dd><dt>Atividade</dt><dd>${esc(c.activity || '—')}</dd><dt>Porte</dt><dd>${esc(c.porte || '—')}${c.simples ? ' · Simples Nacional' : ''}${c.mei ? ' · MEI' : ''}</dd><dt>Sócios</dt><dd>${esc(c.partners || 0)}</dd></dl><div class="small muted">Consultado em ${ago(c.fetched_at)}</div>`
              : '<div class="small muted" style="margin-bottom:8px">Ainda não consultado.</div><button type="button" class="btn secondary sm" id="sc-enrich">Buscar dados do CNPJ</button>'}</div>
          ${used ? `<div class="fsec"><h3>O que já entrou na nota</h3><table class="mini"><thead><tr><th>Critério</th><th>Faixa</th><th>Fonte</th></tr></thead><tbody>${used}</tbody></table></div>` : ''}
          <div class="fsec"><h3>Informar mais dados</h3>
            <details><summary class="small"><b>Respostas do analista</b> (experiência dos gestores, praça, estrutura…)</summary><div class="fgrid" style="margin-top:10px">${(d.fields || []).map((f) => `<div class="field"><label>${esc(f.label)}</label>${fieldInput(f, man[f.key])}</div>`).join('')}</div></details>
            <details style="margin-top:8px"><summary class="small"><b>Balanço e DRE</b> (valores em R$)</summary><div class="fgrid" style="margin-top:10px">${FIN.map(([k, l]) => `<div class="field"><label>${esc(l)}</label>${B.affix(`<input class="input" data-k="${k}" data-fin="1" data-mask="money" placeholder="0,00" value="${man[k] == null || man[k] === '' ? '' : Number(man[k]).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}">`, { pre: 'R$' })}</div>`).join('')}</div></details>
          </div>
          <div class="error-box" id="sc-err" hidden></div></form>`,
        foot: '<button class="btn secondary" data-act="cancel">Fechar</button><button class="btn" data-act="ok">Salvar e recalcular</button>' });
      box.querySelector('[data-act=cancel]').onclick = () => { closeModal(); if (done) done(); };
      const en = box.querySelector('#sc-enrich');
      if (en) en.onclick = async () => { try { await B.enrichCedentes(en); closeModal(); B.cedenteScore(cnpj, name, done); } catch (_) { /* já avisado */ } };
      box.querySelector('[data-act=ok]').onclick = async (ev) => {
        const p = {}, err = box.querySelector('#sc-err');
        box.querySelectorAll('[data-k]').forEach((i) => {
          const k = i.dataset.k, raw = String(i.value || '').trim(), was = man[k] == null ? '' : String(man[k]);
          let val = raw;
          if (raw !== '' && i.dataset.fin) val = B.mask.parse(raw);
          else if (raw !== '' && i.dataset.pct) val = B.mask.parse(raw) / 100;
          else if (raw !== '' && i.dataset.mask === 'int') val = Number(String(raw).replace(/\D/g, ''));
          if (String(val === '' ? '' : val) !== was) p[k] = val === '' ? null : val;
        });
        if (!Object.keys(p).length) { closeModal(); if (done) done(); return; }
        try { const nd = await run(ev.currentTarget, () => rpc('partner_cedente_data_save', { p_cnpj: cnpj, p_data: p }), 'Nota recalculada'); closeModal(); show(nd); if (done) done(true); }
        catch (e) { err.hidden = false; err.textContent = B.message(e); }
      };
    };
    show(d);
  };
})();
