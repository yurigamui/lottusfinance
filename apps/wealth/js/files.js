/* Lottus Wealth — leitura de arquivos no navegador (nada é enviado antes de você conferir): OFX e CSV. */
(function () {
  'use strict';
  const F = (W.files = {});

  F.readText = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('Não consegui ler o arquivo.'));
    r.onload = () => {
      // tenta UTF-8; se aparecer o caractere de substituição, refaz em Latin-1 (extratos antigos)
      let t = new TextDecoder('utf-8').decode(r.result);
      if (t.includes('�')) t = new TextDecoder('latin1').decode(r.result);
      res(t);
    };
    r.readAsArrayBuffer(file);
  });

  /** OFX 1.x (SGML) e 2.x (XML): devolve [{date, description, amount, fitid}] */
  F.parseOfx = (text) => {
    const out = [];
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    const tag = (b, n) => { const m = b.match(new RegExp(`<${n}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
    for (const b of blocks) {
      const date = W.parseDate(tag(b, 'DTPOSTED')); const amt = W.parseNum(tag(b, 'TRNAMT').replace(',', '.'));
      const desc = [tag(b, 'MEMO'), tag(b, 'NAME')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || tag(b, 'TRNTYPE');
      if (date && amt !== null) out.push({ date, description: desc, amount: amt, fitid: tag(b, 'FITID') });
    }
    return out;
  };

  /** CSV com delimitador automático (; , tab), aspas e quebras de linha dentro de campo */
  F.parseCsv = (text) => {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
    const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
    return rows;
  };

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const SYN = {
    // extrato
    date: ['data', 'date', 'dt', 'data lancamento', 'data mov', 'data movimentacao', 'data operacao', 'data do negocio', 'data negocio', 'data da operacao'],
    description: ['descricao', 'historico', 'lancamento', 'memo', 'detalhe', 'descricao do lancamento', 'estabelecimento', 'identificacao'],
    amount: ['valor', 'amount', 'valor r', 'valor rs', 'montante'],
    credit: ['credito', 'entrada', 'entradas', 'receita'],
    debit: ['debito', 'saida', 'saidas', 'despesa'],
    // investimentos
    kind: ['tipo', 'tipo de movimentacao', 'tipo movimentacao', 'operacao', 'tipo de operacao', 'c v', 'compra venda', 'natureza'],
    ticker: ['ticker', 'codigo', 'codigo de negociacao', 'cod negociacao', 'papel', 'ativo', 'codigo do ativo', 'simbolo'],
    name: ['nome', 'produto', 'descricao do ativo', 'ativo', 'especificacao', 'titulo'],
    qty: ['quantidade', 'qtd', 'qtde', 'quant', 'posicao', 'saldo', 'quantidade total'],
    unit_price: ['preco', 'preco unitario', 'pu', 'p u', 'valor unitario', 'preco medio', 'cotacao', 'preco r'],
    custodian: ['custodiante', 'instituicao', 'corretora', 'banco', 'custodia'],
  };
  F.FIELDS = {
    extrato: [['date', 'Data', true], ['description', 'Descrição', true], ['amount', 'Valor (negativo = saída)', false], ['credit', 'Crédito (opcional)', false], ['debit', 'Débito (opcional)', false]],
    invest: [['date', 'Data (vazia = hoje, para posições)', false], ['kind', 'Compra/Venda', false], ['ticker', 'Código/ticker', false], ['name', 'Nome do ativo', false], ['qty', 'Quantidade', true], ['unit_price', 'Preço unitário', true], ['custodian', 'Custodiante', false]],
  };
  /** descobre qual coluna é qual pelo cabeçalho */
  F.guess = (header, mode) => {
    const map = {}; const used = new Set(); const h = header.map(norm);
    for (const [key] of F.FIELDS[mode]) {
      let idx = h.findIndex((x, i) => !used.has(i) && SYN[key].includes(x));
      if (idx < 0) idx = h.findIndex((x, i) => !used.has(i) && SYN[key].some((s) => s.length > 3 && x.includes(s)));
      if (idx >= 0) { map[key] = idx; used.add(idx); }
    }
    return map;
  };

  /** aplica o mapeamento de colunas e devolve linhas prontas para o banco + descartadas */
  F.rowsExtrato = (rows, map) => {
    const ok = [], bad = [];
    rows.forEach((r, i) => {
      const date = W.parseDate(r[map.date]); const desc = String(r[map.description] ?? '').replace(/\s+/g, ' ').trim();
      let amt = map.amount !== undefined ? W.parseNum(r[map.amount]) : null;
      if (amt === null && (map.credit !== undefined || map.debit !== undefined)) {
        const c = map.credit !== undefined ? W.parseNum(r[map.credit]) : null, d = map.debit !== undefined ? W.parseNum(r[map.debit]) : null;
        if (c || d) amt = (c || 0) - Math.abs(d || 0);
      }
      if (date && desc && amt) ok.push({ date, description: desc, amount: amt }); else bad.push(i + 2);
    });
    return { ok, bad };
  };
  F.rowsInvest = (rows, map) => {
    const ok = [], bad = [];
    rows.forEach((r, i) => {
      const date = map.date === undefined ? W.ymd() : W.parseDate(r[map.date]); const qty = W.parseNum(r[map.qty]); const pu = W.parseNum(r[map.unit_price]);
      const rawKind = norm(map.kind !== undefined ? r[map.kind] : 'compra');
      const kind = /^(v|venda|vend|resgate|saida|alienacao)/.test(rawKind) ? 'venda' : /(provento|dividendo|jcp|juros|rendimento)/.test(rawKind) ? 'provento' : 'compra';
      let ticker = String(map.ticker !== undefined ? r[map.ticker] : '').trim().toUpperCase();
      if (/^[A-Z]{4}\d{1,2}F$/.test(ticker)) ticker = ticker.slice(0, -1);   // fracionário (PETR4F → PETR4)
      const name = String(map.name !== undefined ? r[map.name] : '').trim();
      if (date && qty > 0 && pu !== null && pu >= 0 && (ticker || name)) ok.push({ date, kind, ticker: /^[A-Z]{4}\d{1,2}$/.test(ticker) ? ticker : '', name: name || ticker, asset_kind: /^[A-Z]{4}11$/.test(ticker) ? 'fii' : /^[A-Z]{4}\d{1,2}$/.test(ticker) ? 'acao' : 'outro', qty, unit_price: pu, custodian: map.custodian !== undefined ? String(r[map.custodian] || '').trim() : '' });
      else bad.push(i + 2);
    });
    return { ok, bad };
  };
})();
