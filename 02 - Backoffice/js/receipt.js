/* Lottus · Backoffice — comprovante da operação (mesmo modelo do app) */
(function () {
  'use strict';
  const LOGO = 'data:image/png;base64,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';
/**
 * Comprovante da operação (HTML para virar PDF)
 *
 * Função pura: recebe o que o servidor devolve em operation_receipt e monta o
 * documento com as partes, os valores, as duplicatas cedidas e a trilha das
 * assinaturas eletrônicas (quem, quando, de onde e o código de cada registro).
 */
const esc = (v) => String(v !== null && v !== void 0 ? v : '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const pct = (v) => (v == null ? '—' : `${(Number(v) * 100).toFixed(2).replace('.', ',')}% a.m.`);
const tz = { timeZone: 'America/Sao_Paulo' };
const dateTime = (v) => v ? new Date(v).toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const date = (v) => {
    if (!v)
        return '—';
    const [y, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const cnpj = (v) => {
    const s = String(v !== null && v !== void 0 ? v : '');
    return s.length === 14 ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : s;
};
const key = (k) => k.replace(/(\d{4})(?=\d)/g, '$1 ');
const row = (label, value) => value ? `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>` : '';
const STATUS = {
    requested: 'Pedida', in_review: 'Em análise', approved: 'Aprovada', paid: 'Paga (recurso enviado)',
    settled: 'Liquidada', rejected: 'Recusada', cancelled: 'Cancelada',
};
const FUNDER_KIND = { securitizadora: 'Securitizadora', fidc: 'FIDC', bancarizador: 'Instituição financeira', outro: 'Cessionária' };
const SOURCE = {
    app: 'Confirmada por administrador', request: 'Pedido do financeiro aprovado por administrador',
    delegated: 'Confirmada dentro da alçada delegada', schedule: 'Saque agendado',
};
const KIND = {
    master_agreement: 'Aceite do contrato de cessão',
    anticipation_request: 'Pedido de antecipação',
    scheduled_withdrawal: 'Agendamento do saque',
    anticipation: 'Cessão das duplicatas',
    funder_acceptance: 'Aceite da cessionária',
    delegation: 'Delegação de alçada',
};
const ACCESS = { funder: 'Representante da cessionária', admin: 'Administrador', finance: 'Financeiro', viewer: 'Consulta' };
function methods(m) {
    if (!Array.isArray(m) || m.length === 0)
        return '—';
    const name = { password: 'senha', otp: 'código por e-mail', totp: 'autenticador', mfa: 'segundo fator' };
    return [...new Set(m.map((x) => { var _a; return (_a = name[x === null || x === void 0 ? void 0 : x.method]) !== null && _a !== void 0 ? _a : x === null || x === void 0 ? void 0 : x.method; }).filter(Boolean))].join(', ');
}
function buildReceiptHtml(r) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const o = r.operation;
    const avgDays = r.items.length
        ? Math.round(r.items.reduce((s, i) => s + i.days * i.amount, 0) / Math.max(1, r.items.reduce((s, i) => s + i.amount, 0)))
        : 0;
    const shortId = o.id.slice(0, 8).toUpperCase();
    const items = r.items
        .map((i) => {
        var _a, _b;
        return `<tr>
        <td><b>${esc((_a = i.nfe_number) !== null && _a !== void 0 ? _a : '—')}</b>${i.series ? `<span class="m">/${esc(i.series)}</span>` : ''}<div class="key">${esc(key(i.nfe_key))}</div></td>
        <td>${esc((_b = i.debtor_name) !== null && _b !== void 0 ? _b : '—')}<div class="m">${esc(cnpj(i.debtor_cnpj))}</div></td>
        <td class="c">${esc(i.installment)}</td>
        <td class="c">${esc(date(i.due_date))}<div class="m">${esc(i.days)} dias</div></td>
        <td class="r">${esc(money(i.amount))}</td>
        <td class="r m">${esc(money(i.discount))}</td>
      </tr>`;
    })
        .join('');
    const sigs = r.signatures
        .map((s) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return `<div class="sig">
        <div class="sig-head"><b>${esc((_a = KIND[s.kind]) !== null && _a !== void 0 ? _a : s.kind)}</b><span>${esc(dateTime(s.signed_at))}</span></div>
        <table class="kv">
          <tr><td>Signatário</td><td>${esc(s.signer_name)} · CPF ${esc(s.signer_cpf)}${s.signer_access ? ` · ${esc((_b = ACCESS[s.signer_access]) !== null && _b !== void 0 ? _b : s.signer_access)}` : ''}</td></tr>
          ${row('Declaração', (_c = s.evidence) === null || _c === void 0 ? void 0 : _c.statement)}
          ${row('Confirmação', ((_d = s.evidence) === null || _d === void 0 ? void 0 : _d.confirmation) && `${s.evidence.confirmation}${s.evidence.confirmation_at ? ` · ${dateTime(s.evidence.confirmation_at)}` : ''}`)}
          ${row('Aparelho', ((_e = s.evidence) === null || _e === void 0 ? void 0 : _e.device) && `${s.evidence.device}${s.evidence.device_since ? ` · em uso desde ${date(s.evidence.device_since)}` : ''}`)}
          <tr><td>Origem</td><td>${esc([s.ip, (_f = s.evidence) === null || _f === void 0 ? void 0 : _f.country, (_g = s.evidence) === null || _g === void 0 ? void 0 : _g.timezone, ((_h = s.evidence) === null || _h === void 0 ? void 0 : _h.device) ? null : s.user_agent].filter(Boolean).join(' · ') || ((_j = s.evidence) === null || _j === void 0 ? void 0 : _j.origin) || '—')}</td></tr>
          <tr><td>Autenticação</td><td>${esc(methods(s.auth_methods))}${((_k = s.evidence) === null || _k === void 0 ? void 0 : _k.session_started_at) ? esc(` · login em ${dateTime(s.evidence.session_started_at)}`) : ''}</td></tr>
          ${row('Conta', ((_l = s.evidence) === null || _l === void 0 ? void 0 : _l.email) && `${s.evidence.email}${s.evidence.email_confirmed_at ? ` · e-mail confirmado em ${date(s.evidence.email_confirmed_at)}` : ''}`)}
          ${row('Identidade', ((_m = s.evidence) === null || _m === void 0 ? void 0 : _m.identity_approved_at) && `Documento com foto e selfie validados em ${date(s.evidence.identity_approved_at)}`)}
          ${row('Aviso ao signatário', ((_o = s.evidence) === null || _o === void 0 ? void 0 : _o.notified_email) && `E-mail enviado para ${s.evidence.notified_email}${s.evidence.notified_at ? ` em ${dateTime(s.evidence.notified_at)}` : ''}`)}
          <tr><td>Código do documento</td><td class="hash">${esc(s.document_hash)}</td></tr>
          ${((_p = s.evidence) === null || _p === void 0 ? void 0 : _p.context_hash) ? `<tr><td>Código do contexto</td><td class="hash">${esc(s.evidence.context_hash)}</td></tr>` : ''}
          <tr><td>Código do registro</td><td class="hash">${esc(s.record_hash)}</td></tr>
        </table>
      </div>`;
    })
        .join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante ${esc(shortId)}</title><style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2B2321; font-size: 9pt; line-height: 1.45; }
  @media screen { body { max-width: 182mm; margin: 0 auto; padding: 14mm 0; } }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.5mm solid #2B2321; padding-bottom: 4mm; }
  .brand { display: flex; align-items: center; gap: 2.5mm; }
  .brand img { height: 9mm; width: auto; display: block; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 15pt; letter-spacing: -0.02em; }
  .m { color: #6B605A; }
  .hero { display: flex; gap: 5mm; margin: 6mm 0 2mm; }
  .net { flex: 1.2; background: #2B2321; color: #F5F2EB; border-radius: 4mm; padding: 5mm 6mm; }
  .net .lbl { font-size: 8pt; opacity: 0.75; }
  .net .val { font-size: 22pt; font-weight: 800; letter-spacing: -0.03em; margin-top: 1mm; }
  .net .st { margin-top: 2mm; font-size: 8.5pt; }
  .net .st i { font-style: normal; background: #C73053; color: #fff; border-radius: 1.5mm; padding: 0.6mm 2mm; font-weight: 700; margin-right: 2mm; }
  .breakdown { flex: 1; border: 0.3mm solid #E2DFD8; border-radius: 4mm; padding: 4mm 5mm; }
  .line { display: flex; justify-content: space-between; padding: 0.9mm 0; }
  .line.total { border-top: 0.3mm solid #E2DFD8; margin-top: 1mm; padding-top: 2mm; font-weight: 700; }
  h2 { font-size: 10.5pt; margin: 7mm 0 2.5mm; letter-spacing: -0.01em; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .card { border: 0.3mm solid #E2DFD8; border-radius: 3mm; padding: 3.5mm 4.5mm; }
  .card .t { font-size: 7.8pt; color: #6B605A; margin-bottom: 1mm; }
  .card b { font-size: 10pt; }
  table.list { width: 100%; border-collapse: collapse; }
  .list th { text-align: left; font-size: 7.5pt; color: #6B605A; font-weight: 600; border-bottom: 0.4mm solid #2B2321; padding: 1.8mm 1.2mm; }
  .list td { border-bottom: 0.2mm solid #E2DFD8; padding: 2.2mm 1.2mm; vertical-align: top; }
  .list tr { page-break-inside: avoid; }
  .c { text-align: center; white-space: nowrap; } .r { text-align: right; white-space: nowrap; }
  .key { font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 6.8pt; color: #6B605A; margin-top: 0.6mm; letter-spacing: 0.02em; }
  .sig { border: 0.3mm solid #E2DFD8; border-radius: 3mm; padding: 3mm 4mm; margin-bottom: 3mm; page-break-inside: avoid; }
  .sig-head { display: flex; justify-content: space-between; margin-bottom: 1.5mm; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .kv td { padding: 0.7mm 0; vertical-align: top; } .kv td:first-child { color: #6B605A; width: 34mm; }
  .hash { font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 7pt; word-break: break-all; }
  .foot { margin-top: 7mm; padding-top: 3mm; border-top: 0.3mm solid #E2DFD8; font-size: 7.4pt; color: #6B605A; }
  .foot p { margin: 0 0 1.5mm; }
</style></head><body>
  <div class="top">
    <div class="brand"><img src="${LOGO}" alt="Lottus"></div>
    <div class="doc"><h1>Comprovante de antecipação</h1>
      <div class="m">Operação ${esc(shortId)} · emitido em ${esc(dateTime(r.generated_at))}</div></div>
  </div>

  <div class="hero">
    <div class="net">
      <div class="lbl">Valor líquido para a empresa</div>
      <div class="val">${esc(money(o.net))}</div>
      <div class="st"><i>${esc((_a = STATUS[o.status]) !== null && _a !== void 0 ? _a : o.status)}</i>${esc((_b = SOURCE[o.source]) !== null && _b !== void 0 ? _b : '')}</div>
    </div>
    <div class="breakdown">
      <div class="line"><span>Valor das duplicatas</span><span>${esc(money(o.gross))}</span></div>
      <div class="line"><span>Deságio</span><span>− ${esc(money(o.discount))}</span></div>
      ${Number(o.fee) ? `<div class="line"><span>Tarifa</span><span>− ${esc(money(o.fee))}</span></div>` : ''}
      ${Number(o.bonus) ? `<div class="line"><span>Bônus de indicação</span><span>+ ${esc(money(o.bonus))}</span></div>` : ''}
      <div class="line total"><span>Líquido</span><span>${esc(money(o.net))}</span></div>
      <div class="line m"><span>Taxa · custo efetivo</span><span>${esc(pct(o.monthly_rate))} · ${esc(pct(o.effective_monthly_rate))}</span></div>
      <div class="line m"><span>Prazo médio</span><span>${esc(avgDays)} dias</span></div>
    </div>
  </div>

  <h2>Partes</h2>
  <div class="grid">
    <div class="card"><div class="t">Cedente</div><b>${esc(r.assignor.legal_name)}</b>
      <div class="m">CNPJ ${esc(cnpj(r.assignor.cnpj))}${r.assignor.city ? ` · ${esc(r.assignor.city)}/${esc((_c = r.assignor.uf) !== null && _c !== void 0 ? _c : '')}` : ''}</div></div>
    <div class="card"><div class="t">Cessionária</div><b>${esc((_e = (_d = r.assignee) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : 'Instituição financeira parceira')}</b>
      <div class="m">${((_f = r.assignee) === null || _f === void 0 ? void 0 : _f.document) ? `CNPJ ${esc(cnpj(r.assignee.document))} · ` : ''}${((_g = r.assignee) === null || _g === void 0 ? void 0 : _g.kind) ? `${esc((_h = FUNDER_KIND[r.assignee.kind]) !== null && _h !== void 0 ? _h : r.assignee.kind)} · operação originada pela Lottus` : 'via Lottus, correspondente bancário'}</div></div>
  </div>

  <h2>Datas e crédito</h2>
  <div class="grid">
    <div class="card"><div class="t">Linha do tempo</div>
      <div class="line"><span class="m">Pedida</span><span>${esc(dateTime(o.created_at))}</span></div>
      <div class="line"><span class="m">Aprovada</span><span>${esc(dateTime(o.approved_at))}</span></div>
      <div class="line"><span class="m">Paga</span><span>${esc(dateTime(o.paid_at))}</span></div>
      ${o.settled_at ? `<div class="line"><span class="m">Liquidada</span><span>${esc(dateTime(o.settled_at))}</span></div>` : ''}
    </div>
    <div class="card"><div class="t">Conta de crédito</div>
      ${r.bank ? `<b>${esc(r.bank.bank_code)} · ${esc(r.bank.bank_name)}</b>
      <div class="m">Agência ${esc(r.bank.branch)} · ${r.bank.type === 'payment' ? 'conta de pagamento' : 'conta corrente'} ${esc(r.bank.account)}</div>
      ${o.payout_reference ? `<div class="m">Comprovante do envio: ${esc(o.payout_reference)}</div>` : ''}` : '<span class="m">—</span>'}
    </div>
  </div>

  <h2>Duplicatas cedidas (${r.items.length})</h2>
  <table class="list"><thead><tr><th>NF-e e chave de acesso</th><th>Sacado</th><th class="c">Parcela</th><th class="c">Vencimento</th><th class="r">Valor</th><th class="r">Deságio</th></tr></thead>
    <tbody>${items}</tbody></table>

  <h2>Assinaturas eletrônicas</h2>
  ${sigs || '<p class="m">Nenhuma assinatura registrada para esta operação.</p>'}

  <div class="foot">
    <p>As assinaturas acima foram feitas eletronicamente no app da Lottus, com login da pessoa e, quando disponível, biometria do aparelho, conforme aceito pelas partes no contrato de cessão${r.agreement_version ? ` (versão ${esc(r.agreement_version)})` : ''}, nos termos do art. 10, § 2º, da MP 2.200-2/2001. Cada registro guarda o documento assinado, o texto exibido, a confirmação no aparelho, o aparelho, a sessão e a identidade validada da pessoa, e é encadeado aos anteriores; os códigos do documento e do contexto permitem conferir que nada foi alterado.</p>
    <p>${((_j = r.assignee) === null || _j === void 0 ? void 0 : _j.kind) ? 'A cessionária das duplicatas é a indicada em Partes; a Lottus origina e acompanha a operação.' : 'A Lottus atua como correspondente bancário de instituição financeira autorizada pelo Banco Central do Brasil.'} Este comprovante não substitui o contrato de cessão.</p>
  </div>
</body></html>`;
}

  window.BO.buildReceiptHtml = buildReceiptHtml;
})();
