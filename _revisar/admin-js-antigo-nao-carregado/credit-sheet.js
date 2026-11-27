/* Lottus · Backoffice — ficha de crédito em CSV
 *
 * Enquanto não há leitura automática dos documentos (balanço, DRE, faturamento, contrato
 * social…), alguém lê os documentos e preenche a ficha padrão. O Admin lê o CSV, confere o
 * CNPJ, mostra o que muda e salva nos dados de crédito do cedente (bo_save_credit_data), e o
 * motor recalcula na hora.
 *
 * Formato (uma linha por campo, separador ";" ou ","; linhas com # são comentário):
 *   campo;descricao;formato;valor;fonte
 *   cnpj;…;…;12345678000190;
 *   receita_bruta;…;…;1.234.567,89;DRE 2025
 * Só "campo" e "valor" são lidos (e "fonte", se houver). Valor vazio não muda nada;
 * "apagar" apaga o dado salvo. Percentuais em %: 35 ou 35% = 35%.
 */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, cnpj: fmtCnpj, toast, modal, closeModal } = B;

  const VERSION = 1;
  const META = [
    ['cnpj', 'CNPJ do cedente (obrigatório)', 'cnpj'],
    ['ficha_referencia', 'Período ou data-base dos documentos (ex.: 2025, 12/2025)', 'text'],
    ['ficha_documentos', 'Documentos lidos (ex.: Balanço 2025; DRE 2025; Faturamento 12 meses)', 'text'],
    ['ficha_observacoes', 'Observações para a análise (pontos de atenção, ressalvas, divergências)', 'text'],
  ];
  const FORMAT = {
    cnpj: 'CNPJ (com ou sem pontuação)', text: 'texto livre', money: 'R$ (ex.: 1.234.567,89; negativo com -)',
    pct: '% (ex.: 35 ou 35%)', int: 'número inteiro', days: 'dias (número inteiro)', date: 'data (dd/mm/aaaa)',
    yn: 'Sim ou Não', opt: 'uma das opções',
  };

  const fields = () => {
    const list = [];
    (B.CREDIT_SECTIONS || []).forEach(([section, fs]) => fs.forEach(([key, label, type]) => list.push({ key, label, type, section })));
    return list;
  };
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cnpjKey = (s) => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

  /* ------------------------------------------------------------------ CSV */
  function parseCsv(text) {
    const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const firstLine = src.split('\n').find((l) => l.trim() && !l.trim().startsWith('#')) || '';
    const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : firstLine.includes('\t') ? '\t' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell.trim() === '') { q = true; cell = ''; }
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c) && !r[0].startsWith('#'));
  }

  /** Número escrito do jeito brasileiro ou com ponto decimal; (1.000) e -1.000 são negativos */
  function toNum(raw) {
    let s = String(raw ?? '').trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/R\$|%|\s/gi, '');
    if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    const n = Number(s);
    return neg ? -n : n;
  }

  function toDate(raw) {
    const s = String(raw).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return Number.isNaN(Date.parse(iso)) ? null : iso;
    }
    return null;
  }

  /** Converte o valor da ficha no formato salvo; devolve { value } ou { error } */
  function convert(f, raw, opts) {
    const s = String(raw).trim();
    if (fold(s) === 'apagar') return { value: null, clear: true };
    switch (f.type) {
      case 'text': return { value: s.slice(0, 2000) };
      case 'money': { const n = toNum(s); return Number.isFinite(n) ? { value: Math.round(n * 100) / 100 } : { error: 'valor em R$ inválido' }; }
      case 'pct': { const n = toNum(s); return Number.isFinite(n) && n >= 0 && n <= 100 ? { value: Math.round(n * 10) / 1000 } : { error: 'use um percentual de 0 a 100' }; }
      case 'int': case 'days': { const n = toNum(s); return Number.isFinite(n) && n >= 0 && Number.isInteger(n) ? { value: n } : { error: 'use um número inteiro' }; }
      case 'date': { const d = toDate(s); return d ? { value: d } : { error: 'use dd/mm/aaaa' }; }
      case 'yn': {
        const v = fold(s);
        if (['sim', 's', 'yes', 'true', '1', 'x'].includes(v)) return { value: 'Sim' };
        if (['nao', 'n', 'no', 'false', '0'].includes(v)) return { value: 'Não' };
        return { error: 'use Sim ou Não' };
      }
      case 'opt': {
        const list = opts[f.key] || [];
        const hit = list.find((o) => fold(o) === fold(s));
        return hit ? { value: hit } : { error: `opção não existe (${list.join(' · ')})` };
      }
      default: return { error: 'campo sem formato' };
    }
  }

  function shown(f, v) {
    if (v == null || v === '') return '<span class="muted">—</span>';
    if (f.type === 'money') return brl(v);
    if (f.type === 'pct') return `${(Number(v) * 100).toFixed(1).replace('.', ',').replace(',0', '')}%`;
    if (f.type === 'date') return esc(String(v).split('-').reverse().join('/'));
    if (f.type === 'days') return `${esc(v)} dias`;
    return esc(String(v));
  }

  /* ---------------------------------------------------------- modelo (CSV) */
  B.creditSheetTemplate = async (company) => {
    let opts = {};
    try {
      if (company?.id) {
        const d = await rpc('bo_credit_engine', { p_company: company.id });
        opts = Object.fromEntries((d.criteria || []).filter((c) => c.options).map((c) => [c.key, c.options]));
      }
    } catch { /* modelo sem a lista de opções */ }
    const cell = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [
      `# Ficha de crédito Lottus · versão ${VERSION}`,
      '# Preencha a coluna "valor". Vazio não muda nada; "apagar" apaga o dado salvo. Percentual em % (35 = 35%).',
      'campo;descricao;formato;valor;fonte',
      ...META.map(([k, label, t]) => [k, label, FORMAT[t], k === 'cnpj' && company?.cnpj ? company.cnpj : '', ''].map(cell).join(';')),
      ...fields().map((f) => [f.key, `${f.section} · ${f.label}`, f.type === 'opt' && opts[f.key] ? `uma opção: ${opts[f.key].join(' | ')}` : FORMAT[f.type], '', ''].map(cell).join(';')),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ficha_credito_${company?.cnpj || 'modelo'}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ----------------------------------------------------------- importação */
  const pickFile = () => new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.csv,text/csv,.txt';
    i.onchange = () => resolve(i.files?.[0] || null);
    i.click();
  });

  async function findCompany(key) {
    const list = await rpc('bo_companies', { p_search: key });
    return (list || []).find((c) => cnpjKey(c.cnpj) === key) || null;
  }

  /**
   * Lê a ficha e salva. ctx.companyId/ctx.cnpj: na página de crédito do cedente (o CNPJ
   * da ficha precisa ser o mesmo). Sem ctx, acha o cedente pelo CNPJ da ficha.
   */
  B.importCreditSheet = async (ctx = {}) => {
    const file = await pickFile();
    if (!file) return;
    if (file.size > 512 * 1024) { toast('Arquivo grande demais para uma ficha (máximo 512 KB).', true); return; }
    const text = await file.text();
    const rows = parseCsv(text);
    const hi = rows.findIndex((r) => r.map(fold).includes('campo') && r.map(fold).includes('valor'));
    const header = hi >= 0 ? rows[hi].map(fold) : ['campo', 'descricao', 'formato', 'valor', 'fonte'];
    const ci = header.indexOf('campo'), vi = header.indexOf('valor'), si = header.indexOf('fonte');
    const body = rows.slice(hi + 1).map((r) => ({ key: fold(r[ci]).replace(/\s/g, '_'), raw: r[vi] ?? '', src: si >= 0 ? r[si] ?? '' : '' }))
      .filter((r) => r.key);

    const cnpjRow = body.find((r) => r.key === 'cnpj');
    const key = cnpjKey(cnpjRow?.raw);
    if (key.length !== 14) { toast('A ficha precisa do CNPJ do cedente na linha "cnpj".', true); return; }
    let companyId = ctx.companyId;
    if (companyId) {
      if (cnpjKey(ctx.cnpj) !== key) { toast(`A ficha é do CNPJ ${fmtCnpj(key)}, não deste cedente.`, true); return; }
    } else {
      const c = await findCompany(key).catch(() => null);
      if (!c) { toast(`Nenhuma empresa com o CNPJ ${fmtCnpj(key)} na Lottus.`, true); return; }
      companyId = c.id;
    }

    const d = await rpc('bo_credit_engine', { p_company: companyId });
    const opts = Object.fromEntries((d.criteria || []).filter((c) => c.options).map((c) => [c.key, c.options]));
    const SHORT = { ficha_referencia: 'Referência dos documentos', ficha_documentos: 'Documentos lidos', ficha_observacoes: 'Observações da análise' };
    const all = [...META.filter(([k]) => k !== 'cnpj').map(([key, , type]) => ({ key, label: SHORT[key], type, section: 'Ficha' })), ...fields()];
    const byKey = Object.fromEntries(all.map((f) => [f.key, f]));
    const seen = new Set();
    const items = [], ignored = [];
    for (const r of body) {
      if (r.key === 'cnpj') continue;
      const f = byKey[r.key];
      if (!f) { if (String(r.raw).trim()) ignored.push(r.key); continue; }
      if (!String(r.raw).trim()) continue;
      if (seen.has(r.key)) { items.push({ f, raw: r.raw, src: r.src, error: 'campo repetido na ficha' }); continue; }
      seen.add(r.key);
      const c = convert(f, r.raw, opts);
      const cur = d.data[f.key];
      items.push({ f, raw: r.raw, src: r.src.slice(0, 200), ...c, same: !c.error && (c.clear ? cur == null : String(cur ?? '') === String(c.value ?? '')) });
    }
    const ok = items.filter((x) => !x.error && !x.same);
    const bad = items.filter((x) => x.error);
    items.sort((a, b) => (b.error ? 1 : 0) - (a.error ? 1 : 0));
    if (!items.length) { toast('A ficha não tem nenhum valor preenchido.', true); return; }

    const row = (x) => `<tr${x.error ? ' style="background:var(--danger-soft, #fdecec)"' : ''}>
      <td><b>${esc(x.f.label)}</b><div class="small muted">${esc(x.f.section)} · ${esc(x.f.key)}</div></td>
      <td>${shown(x.f, d.data[x.f.key])}</td>
      <td>${x.error ? `<span style="color:var(--danger)">${esc(x.raw)}</span><div class="small" style="color:var(--danger)">${esc(x.error)}</div>`
        : x.clear ? '<span class="tag warning">apagar</span>' : x.same ? `${shown(x.f, x.value)} <span class="small muted">igual</span>` : `<b>${shown(x.f, x.value)}</b>`}</td>
      <td class="small muted">${esc(x.src || '')}</td></tr>`;
    const el = modal({
      title: 'Importar ficha de crédito', wide: true,
      subtitle: `${esc(d.company.legal_name)} · ${esc(fmtCnpj(d.company.cnpj))} · ${esc(file.name)}`,
      body: `<div class="stack">
        <div class="small muted">${ok.length} campo(s) para salvar${bad.length ? ` · <span style="color:var(--danger)">${bad.length} com erro (não entram)</span>` : ''}${items.length - ok.length - bad.length ? ` · ${items.length - ok.length - bad.length} igual(is) ao salvo` : ''}${ignored.length ? ` · ignorados (campo desconhecido): ${esc(ignored.join(', '))}` : ''}. Os outros dados do cedente não mudam.</div>
        <div class="table-wrap"><table><thead><tr><th>Campo</th><th>Hoje</th><th>Na ficha</th><th>Fonte</th></tr></thead><tbody>${items.map(row).join('')}</tbody></table></div>
      </div>`,
      foot: `<button class="btn secondary" data-act="cancel">Cancelar</button>
             <button class="btn" data-act="ok" ${ok.length ? '' : 'disabled'}>Salvar ${ok.length} campo(s) e recalcular</button>`,
    });
    el.querySelector('[data-act=cancel]').onclick = closeModal;
    el.querySelector('[data-act=ok]').onclick = async (ev) => {
      const btn = ev.currentTarget;
      const p = {};
      ok.forEach((x) => (p[x.f.key] = x.clear ? null : x.value));
      const fontes = { ...(d.data.ficha_fontes || {}) };
      ok.forEach((x) => { if (x.clear) delete fontes[x.f.key]; else if (x.src) fontes[x.f.key] = x.src; });
      p.ficha_fontes = Object.keys(fontes).length ? fontes : null;
      p.ficha_importada_em = new Date().toISOString();
      p.ficha_arquivo = file.name.slice(0, 200);
      btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        const r = await rpc('bo_save_credit_data', { p_company: companyId, p_data: p });
        closeModal();
        toast(`Ficha importada · nota ${Math.round(r?.score ?? 0)}${r?.tier ? ` (${r.tier})` : ''}`);
        const target = `#/empresas/${companyId}/credito`;
        if (location.hash === target) B.reload(); else location.hash = target;
      } catch (e) {
        btn.disabled = false; btn.textContent = `Salvar ${ok.length} campo(s) e recalcular`;
        toast(B.message(e) || 'Não foi possível salvar a ficha.', true);
      }
    };
  };
})();
