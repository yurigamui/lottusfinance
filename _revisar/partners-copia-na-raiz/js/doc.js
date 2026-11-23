/* Lottus — documentos: texto dos contratos formatado, estilo de impressão e logo
   (o mesmo arquivo no Partners e no Admin) */
(function () {
  'use strict';
  const B = (window.BO = window.BO || {});
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  B.LOGO_URL = 'https://lottusfinance.com.br/img/logo-rosa.png';

  /** Linha de cláusula: "4.2. Encargos. Texto…" → número, título curto (se houver) e texto */
  function clause(line, mark) {
    const m = line.match(/^(\d+\.(?:\d+\.?)*)\s+(.*)$/s);
    const inline = (s) => {
      let h = esc(s);
      if (mark) h = h.replace(/\{\{(\w+)\}\}/g, '<mark>{{$1}}</mark>');
      // Rótulo em maiúsculas no começo ("CEDENTE:", "DEVEDOR SOLIDÁRIO:")
      return h.replace(/^([A-ZÀ-Ý][A-ZÀ-Ý ]{2,40}):/, '<b>$1:</b>');
    };
    if (!m) return { num: null, html: inline(line) };
    const [, num, rest] = m;
    const t = rest.match(/^([A-ZÀ-Ý][^.,;:]{1,48})\.\s+(.+)$/s);
    if (t && t[1].trim().split(/\s+/).length <= 6) return { num, html: `<b>${inline(t[1])}.</b> ${inline(t[2])}` };
    return { num, html: inline(rest) };
  }

  /**
   * Texto dos modelos com marcação simples: "# " título, "## " seção, linha em branco entre
   * parágrafos, "• " ou "- " item de lista. Cláusulas numeradas ganham recuo e o número em destaque.
   * mark: destaca os campos {{...}} (prévia de modelo no Admin).
   */
  B.contractHtml = (text, mark = false) => {
    const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    let afterTitle = false;
    const out = blocks.map((b) => {
      if (b.startsWith('# ')) { afterTitle = true; return `<h1 class="doc-title">${esc(b.slice(2))}</h1>`; }
      if (b.startsWith('## ')) { afterTitle = false; return `<h2 class="doc-sec">${esc(b.slice(3))}</h2>`; }
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.every((l) => /^[•\-–]\s+/.test(l))) {
        return `<ul class="doc-list">${lines.map((l) => `<li>${clause(l.replace(/^[•\-–]\s+/, ''), mark).html}</li>`).join('')}</ul>`;
      }
      if (lines.length > 1 && lines.every((l) => /^[^:\d][^:]{1,39}:\s/.test(l))) {
        // Pares "Rótulo: valor" (resumo de valores)
        return `<dl class="doc-kv">${lines.map((l) => { const i = l.indexOf(':'); return `<dt>${esc(l.slice(0, i))}</dt><dd>${esc(l.slice(i + 1).trim())}</dd>`; }).join('')}</dl>`;
      }
      const lead = afterTitle && !/^\d+\./.test(b); afterTitle = false;
      return lines.map((l) => {
        const c = clause(l, mark);
        return c.num ? `<p class="doc-cl"><span class="n">${esc(c.num)}</span><span class="t">${c.html}</span></p>` : `<p${lead ? ' class="doc-lead"' : ''}>${c.html}</p>`;
      }).join('');
    }).join('');
    return `<div class="contract doc">${out}</div>`;
  };

  /** Estilo dos documentos impressos (contrato, termo, relatório) */
  B.DOC_CSS = `
    @page { size: A4; margin: 18mm 18mm 20mm; }
    * { box-sizing: border-box; }
    body { font-family: Inter, -apple-system, Helvetica, Arial, sans-serif; color: #2b2321; font-size: 10.5pt; line-height: 1.6; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; margin-bottom: 18px; border-bottom: 2px solid #c73053; }
    .doc-head img { height: 30px; width: auto; display: block; }
    .doc-head .brand { color: #c73053; font-weight: 800; font-size: 20pt; letter-spacing: -.03em; }
    .doc-head .tag { font-size: 8pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #c73053; text-align: right; }
    .muted { color: #6b605a; }
    .doc h1.doc-title { font-size: 15pt; line-height: 1.3; letter-spacing: -.01em; text-align: center; margin: 22px 0 6px; }
    .doc p.doc-lead { text-align: center; color: #4a403b; font-size: 9.5pt; margin: 0 auto 14px; max-width: 150mm; }
    .doc h2.doc-sec { font-size: 10.5pt; letter-spacing: .04em; text-transform: uppercase; color: #231c1a; margin: 20px 0 8px; padding-top: 10px; border-top: 1px solid #ece8e1; page-break-after: avoid; break-after: avoid; }
    .doc p { margin: 0 0 7px; text-align: left; orphans: 3; widows: 3; }
    .doc p.doc-cl .t { text-align: justify; hyphens: auto; }
    .doc p.doc-cl { display: grid; grid-template-columns: 11mm 1fr; column-gap: 2mm; }
    .doc p.doc-cl .n { font-weight: 700; color: #c73053; font-variant-numeric: tabular-nums; }
    .doc ul.doc-list { margin: 2px 0 10px 13mm; padding: 0; } .doc ul.doc-list li { margin: 0 0 4px; }
    .doc dl.doc-kv { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 4px 0 10px 13mm; }
    .doc dl.doc-kv dt { color: #6b605a; } .doc dl.doc-kv dd { margin: 0; font-weight: 600; }
    .doc mark { background: #fbe7ec; color: inherit; padding: 0 2px; border-radius: 3px; }
    h2.box-title { font-size: 10.5pt; letter-spacing: .04em; text-transform: uppercase; margin: 22px 0 8px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0 16px; }
    .box { background: #f5f2eb; border-radius: 10px; padding: 10px 12px; } .box b { display: block; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
    th, td { text-align: left; padding: 6px 6px; border-bottom: 1px solid #ece8e1; font-size: 9pt; vertical-align: top; }
    th { color: #6b605a; font-weight: 600; background: #f7f5f1; } .num { text-align: right; white-space: nowrap; }
    .sig { page-break-inside: avoid; break-inside: avoid; border: 1px solid #ece8e1; border-radius: 10px; padding: 9px 12px; margin-bottom: 8px; }
    .mono { font-family: 'Courier New', Menlo, monospace; font-size: 8.5pt; word-break: break-all; }
    .foot { margin-top: 18px; padding-top: 10px; border-top: 1px solid #ece8e1; font-size: 8pt; color: #6b605a; }
  `;

  /** Cabeçalho com a logo (data URI para a impressão não sair antes da imagem carregar) */
  let logoCache;
  B.logoData = async () => {
    if (logoCache !== undefined) return logoCache;
    const toData = (url) => fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('logo')))).then((b) => new Promise((res) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b);
    }));
    logoCache = window.LOTTUS_LOGO || await toData('img/logo-rosa.png').catch(() => toData(B.LOGO_URL)).catch(() => null);
    return logoCache;
  };
  B.docHead = (logo, tag) => `<div class="doc-head">${logo ? `<img src="${logo}" alt="Lottus">` : `<img src="${B.LOGO_URL}" alt="Lottus">`}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</div>`;
})();
