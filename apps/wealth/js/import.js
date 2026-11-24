/* Lottus Wealth — assistente de importação de arquivo (OFX/CSV): escolhe o arquivo, confere as colunas, vê uma prévia e só então envia. */
(function () {
  'use strict';
  const { esc } = W;

  /** mode: 'extrato' | 'invest'. onImport(rows, filename) devolve o resumo (HTML) para mostrar depois do envio. */
  W.importUI = (host, { mode, onImport, label }) => {
    let rows = [], header = [], map = {}, parsed = null, filename = '';
    const fields = W.files.FIELDS[mode];
    host.innerHTML = `<label class="dropzone" data-dz><input type="file" accept="${mode === 'extrato' ? '.ofx,.qfx,.csv,.txt' : '.csv,.txt'}"><div><b>${esc(label || 'Escolha o arquivo')}</b></div><div class="small">ou arraste para cá · ${mode === 'extrato' ? 'OFX ou CSV' : 'CSV'}</div></label><div data-out class="stack" style="margin-top:16px"></div>`;
    const dz = host.querySelector('[data-dz]'), input = host.querySelector('input'), out = host.querySelector('[data-out]');
    ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) load(input.files[0]); });

    async function load(file) {
      filename = file.name;
      if (file.size > 8 * 1024 * 1024) { out.innerHTML = '<div class="error-box">Arquivo grande demais (limite de 8 MB).</div>'; return; }
      const text = await W.files.readText(file);
      if (mode === 'extrato' && (/\.(ofx|qfx)$/i.test(file.name) || /<OFX>/i.test(text))) {
        const list = W.files.parseOfx(text); parsed = { ok: list, bad: [] }; header = []; return show();
      }
      const all = W.files.parseCsv(text);
      if (all.length < 2) { out.innerHTML = '<div class="error-box">Não encontrei linhas no arquivo.</div>'; return; }
      // o cabeçalho pode não estar na 1ª linha (alguns bancos põem título antes): procura a primeira linha com data/valor reconhecíveis
      let h = 0; for (let i = 0; i < Math.min(all.length, 15); i++) { if (Object.keys(W.files.guess(all[i], mode)).length >= 2) { h = i; break; } }
      header = all[h].map((x, i) => String(x || `Coluna ${i + 1}`)); rows = all.slice(h + 1); map = W.files.guess(header, mode); recompute(); show();
    }
    function recompute() { parsed = mode === 'extrato' ? W.files.rowsExtrato(rows, map) : W.files.rowsInvest(rows, map); }
    function show() {
      const ok = parsed.ok, bad = parsed.bad;
      const prev = ok.slice(0, 8).map((r) => (mode === 'extrato'
        ? `<tr><td>${W.dt(r.date)}</td><td class="cell-name" title="${esc(r.description)}">${esc(r.description)}</td><td class="num ${W.cls(r.amount)}">${W.brl(r.amount)}</td><td class="hide-sm">${esc([r.counterparty, r.cost_center, r.group].filter(Boolean).join(' · ') || '—')}</td></tr>`
        : `<tr><td>${W.dt(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.ticker || r.name)}</td><td class="num">${W.qty(r.qty)}</td><td class="num">${W.num(r.unit_price, 4)}</td></tr>`)).join('');
      const head = mode === 'extrato' ? '<th>Data</th><th>Descrição</th><th class="num">Valor</th><th class="hide-sm">Classificação</th>' : '<th>Data</th><th>Tipo</th><th>Ativo</th><th class="num">Qtd</th><th class="num">P.U.</th>';
      out.innerHTML = `${header.length ? `<div class="card"><h3>Confira as colunas</h3><div class="form-grid">${fields.map(([k, l, req]) => `<div class="field"><label>${esc(l)}${req ? ' *' : ''}</label><select class="input" data-key="${k}">${W.opts(header.map((h, i) => [i, h]), map[k], '—')}</select></div>`).join('')}</div></div>` : ''}
        <div class="card flush"><div class="table-wrap"><table class="tight"><thead><tr>${head}</tr></thead><tbody>${prev || `<tr><td colspan="5" class="empty">Nenhuma linha válida com esse mapeamento.</td></tr>`}</tbody></table></div>
        <div class="pager-bar"><span><b>${ok.length}</b> linhas prontas${bad.length ? ` · ${bad.length} ${bad.length === 1 ? 'ignorada (linha' : 'ignoradas (linhas'} ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? '…' : ''})` : ''}</span><button class="btn" data-go${ok.length ? '' : ' disabled'}>Importar ${ok.length} linhas</button></div></div>`;
      out.querySelectorAll('select[data-key]').forEach((s) => s.addEventListener('change', () => { if (s.value === '') delete map[s.dataset.key]; else map[s.dataset.key] = Number(s.value); recompute(); show(); }));
      const go = out.querySelector('[data-go]');
      if (go) go.addEventListener('click', () => W.busy(go, async () => { const res = await onImport(parsed.ok, filename); out.innerHTML = `<div class="card"><h3>Importação concluída</h3>${res}</div>`; }));
    }
  };
})();
