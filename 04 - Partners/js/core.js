/* Lottus · Backoffice — base: cliente Supabase, formatação, modal, avisos */
(function () {
  'use strict';

  const cfg = window.LOTTUS_CONFIG;
  // Sessão só nesta aba: fechou o navegador, precisa entrar de novo
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, storage: window.sessionStorage, autoRefreshToken: true, detectSessionInUrl: false },
  });

  /* ---------------------------------------------------------------- erros */
  const ERRORS = {
    forbidden: 'Este login não faz parte da equipe Lottus.',
    mfa_required: 'Confirme o código do autenticador para continuar.',
    insufficient_level: 'Seu nível de acesso não permite esta ação.',
    not_found: 'Não encontrado. Atualize a página.',
    signing_url_missing: 'Peça a um administrador do fundo para enviar o primeiro documento (isso define o endereço de assinatura).',
    signer_required: 'O representante precisa de nome, CPF e e-mail.',
    already_signed: 'Este documento já foi assinado.',
    invalid_bank: 'Confira os dados da conta bancária (banco com 3 dígitos, agência, conta e dígito).',
    link_invalid: 'Link inválido ou substituído por um mais recente.',
    too_many_attempts: 'Muitas tentativas. Peça um novo link.',
    not_manual: 'Só séries com indexador Manual são valorizadas à mão.',
    amount_too_low: 'O valor é menor que o P.U. da série. Aumente o valor.',
    file_too_large: 'O PDF é grande demais. Use um arquivo de até 5 MB.',
    invalid_pdf: 'O arquivo não é um PDF válido.',
    in_use: 'Este cadastro já tem movimentações e não pode ser excluído.',
    series_required: 'Escolha a série (lastro) da operação antes de aprovar.',
    series_full: 'A série escolhida não comporta o valor desta operação.',
    series_exists: 'Já existe uma série com essa emissão e número.',
    below_allocated: 'O valor total não pode ficar abaixo do que já está alocado em operações.',
    note_required: 'Escreva o motivo. Ele aparece para o cliente.',
    invalid: 'Confira os valores informados.',
    invalid_status: 'Esta ação não vale para a situação atual. Atualize a página.',
    reference_required: 'Informe o comprovante do pagamento (ex.: id do Pix ou da TED).',
    bank_required: 'A operação não tem conta de crédito.',
    user_not_found: 'Não há login com este e-mail. Use o convite pelo backoffice.',
    cannot_demote_self: 'Você não pode tirar o próprio acesso de administrador.',
    funder_signature_required: 'O parceiro ainda não assinou o aceite desta cessão.',
    documents_missing: 'Faltam documentos assinados',
    wrong_surface_partners: 'Este endereço é dos fundos parceiros. A equipe Lottus entra em admin.lottusfinance.com.br.',
    wrong_surface_admin: 'Este endereço é da equipe Lottus. Fundos parceiros entram em partners.lottusfinance.com.br.',
    contract_not_found: 'O texto integral deste termo não foi guardado (operação anterior à versão atual dos contratos).',
    funder_required: 'Escolha o parceiro (cessionária) da operação antes de aprovar.',
    funder_declined: 'O parceiro recusou esta cessão. Escolha outro parceiro.',
    funder_inactive: 'Este parceiro está inativo.',
    funder_exists: 'Já existe um fundo com este CNPJ.',
    unavailable: 'Não foi possível concluir agora. Tente de novo em instantes.',
    not_authenticated: 'Sua sessão expirou. Entre de novo.',
    above_approval_limit: 'Acima da sua alçada de aprovação',
    credentials_missing: 'Falta preencher a credencial',
    provider_cannot: 'Este banco não faz isso pela integração',
    invalid_pem: 'Certificado ou chave fora do formato PEM',
    invalid_rules: 'Confira as regras de cobrança',
    invalid_url: 'O endereço precisa começar com https://',
    email_required: 'Cadastre um e-mail válido do investidor antes de convidar.',
    email_not_confirmed: 'Confirme o e-mail da conta antes de continuar.',
    too_many_requests: 'Muitas solicitações em aberto.',
    not_auto: 'Esta série é valorizada manualmente.',
    not_redeemable: 'Esta série só permite resgate no vencimento.',
    insufficient_position: 'O investidor não tem essa quantidade de debêntures.',
    invalid_file: 'Arquivo inválido. Envie PDF, PNG ou JPG.',
    too_many_files: 'Limite de 30 arquivos neste cadastro.',
    invalid_provider: 'Escolha um banco da lista.',
    member_elsewhere: 'Esta pessoa é da equipe Lottus e não pode ser cadastrada em um fundo.',
    has_positions: 'A série já tem integralizações: não dá para mudar esta opção.',
    cannot_demote_self: 'Você não pode tirar o seu próprio acesso de administrador.',
    user_not_found: 'Não encontramos este e-mail.',
    screening_blocked: 'O cedente tem sanção vigente ou CNPJ inativo: não abre operação nova',
    not_configured: 'A verificação ainda não está configurada',
    payout_failed: 'O Pix não saiu',
    trio_not_ready: 'Conecte a conta bancária do fundo em Configurações → Banco',
    invalid_keys: 'Confira o Client ID e a Secret Key.',
    trio_not_configured: 'Configure a conta bancária do fundo em Configurações → Banco.',
    trio_error: 'Não deu para concluir agora',
    manual_disabled: 'O pagamento sai pela conta do fundo; não há registro manual.',
    invalid_phone: 'Confira os celulares dos representantes, com DDD.',
    not_pdf: 'Envie o documento em PDF.',
    file_too_large: 'O arquivo passa de 10 MB.',
    consent_required: 'Marque a autorização para abrir a conta.',
    boleto_required: 'Envie o boleto de cada duplicata',
    invalid_digitable_line: 'Confira a linha digitável: 47 números (ou 48, nas contas de consumo).',
    reference_required: 'Informe a identificação do pagamento.',
    pix_key_required: 'Cadastre a chave Pix e a cidade do fundo em Configurações → Banco.',
    items_required: 'Marque pelo menos uma duplicata.',
    invalid_e2e: 'O ID do Pix não está no formato do Banco Central (começa com E e tem 32 caracteres).',
    e2e_reused: 'Este ID do Pix já foi usado em outra operação.',
    e2e_date: 'A data do ID do Pix não bate com esta operação',
    e2e_other_bank: 'Este Pix saiu de outro banco, não do banco cadastrado do fundo.',
    doc_failed: 'Não deu para enviar o documento agora. Tente de novo.',
    buyback_overdue: 'O cedente tem recompra vencida: novas antecipações ficam suspensas até o pagamento.',
    cannot_sign: 'Seu usuário não tem permissão para assinar pelo fundo. Peça a um administrador.',
    already_sent: 'Este documento já foi enviado para assinatura. Edite as partes ou cancele o envio.',
    nfe_invalid: 'Nota fiscal inválida. Confira o XML e tente de novo.',
    nfe_duplicate: 'Esta nota fiscal já foi usada em outra operação.',
    too_many_rules: 'No máximo 12 lembretes.',
    too_many_reminders: 'Limite de lembretes manuais atingido para esta parcela.',
    no_email: 'O sacado não tem e-mail cadastrado.',
  };
  function message(err) {
    const raw = (err && (err.message || err.error_description || err.msg)) || String(err || '');
    const extra = err && err.detail ? `: ${err.detail}` : '';
    if (ERRORS[raw]) return ERRORS[raw] + extra;
    const key = Object.keys(ERRORS).find((k) => raw.includes(k));
    if (key) return ERRORS[key] + extra;
    if (/Failed to fetch|NetworkError/i.test(raw)) return 'Sem conexão com o servidor.';
    return raw || 'Algo deu errado.';
  }

  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) { const e = new Error(error.message); e.detail = error.details || null; throw e; }
    return data;
  }

  /* ---------------------------------------------------------- formatação */
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** Só endereços https (ou âncoras internas): nada de javascript: vindo do banco ou de um parceiro */
  const safeUrl = (v) => { const s = String(v == null ? '' : v).trim(); return /^https:\/\//i.test(s) || /^#\//.test(s) ? s : '#'; };
  // Sem atributos onclick no HTML (a política de segurança bloqueia script embutido)
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-reload]')) location.reload();
    if (e.target.closest('a[data-stop]')) e.stopPropagation();
  }, true);
  const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (v) => (v == null || v === '' ? '—' : brlFmt.format(Number(v)));
  const pct = (v, d = 2) => (v == null ? '—' : (Number(v) * 100).toFixed(d).replace('.', ',') + '%');
  const date = (v) => {
    if (!v) return '—';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
    return new Date(s).toLocaleDateString('pt-BR');
  };
  const dateTime = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const ago = (v) => {
    if (!v) return '';
    const m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if (m < 60) return `há ${Math.max(1, m)} min`;
    const h = Math.round(m / 60);
    if (h < 48) return `há ${h} h`;
    return `há ${Math.round(h / 24)} dias`;
  };
  const cnpj = (v) => {
    const s = String(v || '');
    return s.length === 14 ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : s;
  };
  const cpf = (v) => {
    const s = String(v || '');
    return s.length === 11 ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
  };
  const yearsSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 86400000)) : null);

  const LABELS = {
    identity: { in_review: ['Em análise', 'warning'], approved: ['Aprovada', 'success'], rejected: ['Recusada', 'danger'], pending: ['Pendente', ''] },
    doc: { in_review: ['Em análise', 'warning'], approved: ['Aprovado', 'success'], rejected: ['Recusado', 'danger'] },
    bank: { pending_validation: ['A validar', 'warning'], validated: ['Validada', 'success'], rejected: ['Recusada', 'danger'] },
    credit: { in_review: ['Em análise', 'warning'], approved: ['Aprovado', 'success'], rejected: ['Recusado', 'danger'] },
    op: {
      requested: ['Pedida', 'brand'], in_review: ['Em análise', 'warning'], approved: ['Aprovada · a pagar', 'warning'],
      paid: ['Paga · em cobrança', 'success'], settled: ['Liquidada', ''], rejected: ['Recusada', 'danger'], cancelled: ['Cancelada', 'danger'],
    },
    charge: { open: ['Em aberto', ''], paid: ['Paga', 'success'], cancelled: ['Cancelada', 'danger'] },
    schedule: { scheduled: ['Agendado', 'brand'], done: ['Feito', 'success'], failed: ['Não feito', 'danger'], cancelled: ['Cancelado', ''] },
    settlement: { awaiting_payment: ['Aguardando Pix', 'warning'], paid: ['Paga', 'success'], expired: ['Expirada', ''], cancelled: ['Cancelada', 'danger'] },
  };
  function tag(group, status) {
    const [label, tone] = (LABELS[group] && LABELS[group][status]) || [status || '—', ''];
    return `<span class="tag ${tone}">${esc(label)}</span>`;
  }
  const check = (ok, yes, no) => `<span class="check ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'} ${esc(ok ? yes : no || yes)}</span>`;

  const DOC_KIND = {
    contract: 'Contrato social', power_of_attorney: 'Procuração', revenue: 'Faturamento 12 meses',
    address: 'Comprovante de endereço', financials: 'Balanço e DRE', other: 'Outro',
  };
  const ACCESS = { admin: 'Administrador', finance: 'Financeiro', viewer: 'Consulta', funder: 'Representante da cessionária' };
  const ROLE = { partner: 'Sócio', attorney: 'Procurador', employee: 'Colaborador' };
  const LEVEL = { analyst: 'Analista', approver: 'Aprovador', admin: 'Administrador' };
  const REVENUE = { ate_50k: 'Até R$ 50 mil', '50k_200k': 'R$ 50–200 mil', '200k_1m': 'R$ 200 mil–1 mi', '1m_5m': 'R$ 1–5 mi', acima_5m: 'Acima de R$ 5 mi' };

  /* --------------------------------------------------------- avisos/modal */
  const TOAST_ICON = {
    ok: '<path d="M5 13l4 4L19 7"/>',
    error: '<path d="M6 18L18 6M6 6l12 12"/>',
  };
  function toast(text, isError) {
    const root = document.getElementById('toast-root');
    const ms = isError ? 7000 : 4000;
    const el = document.createElement('div');
    el.className = `toast ${isError ? 'error' : 'ok'}`;
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.innerHTML = `<div class="toast-body">
        <span class="toast-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${isError ? TOAST_ICON.error : TOAST_ICON.ok}</svg></span>
        <div class="toast-text"><div class="toast-title">${isError ? 'Não deu certo' : 'Pronto'}</div><div class="toast-msg">${esc(text)}</div></div>
        <button class="toast-close" aria-label="Fechar">✕</button>
      </div><div class="toast-bar" style="animation-duration:${ms}ms"></div>`;
    const close = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    el.querySelector('.toast-close').onclick = close;
    const timer = setTimeout(close, ms);
    el.addEventListener('mouseenter', () => { clearTimeout(timer); el.querySelector('.toast-bar').style.animationPlayState = 'paused'; });
    el.addEventListener('mouseleave', () => setTimeout(close, 1500));
    root.prepend(el);
  }

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }

  /** Abre um modal; devolve o elemento para ligar os eventos. */
  function modal({ title, subtitle, body, foot, wide }) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="modal-head">
            <div><h2>${esc(title)}</h2>${subtitle ? `<div class="muted">${subtitle}</div>` : ''}</div>
            <button class="btn ghost sm" data-close aria-label="Fechar">✕</button>
          </div>
          <div class="modal-body">${body || ''}</div>
          ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
        </div>
      </div>`;
    const el = root.querySelector('.modal');
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close')) closeModal();
    });
    el.querySelector('.modal-head [data-close]').addEventListener('click', closeModal);
    document.addEventListener('keydown', onEsc);
    return el;
  }

  /**
   * Confirmação com motivo opcional/obrigatório.
   * Resolve com o texto (ou '' sem campo), ou null se cancelou.
   */
  function confirmAction({ title, text, confirmLabel, danger, note, noteLabel, noteRequired, notePlaceholder, extra }) {
    return new Promise((resolve) => {
      const el = modal({
        title,
        body: `<div class="stack">
          ${text ? `<p class="u-m0">${text}</p>` : ''}
          ${extra || ''}
          ${note ? `<div class="field"><label for="m-note">${esc(noteLabel || 'Motivo')}</label>
            <textarea id="m-note" class="input" placeholder="${esc(notePlaceholder || '')}"></textarea>
</div>` : ''}
          <div class="error-box" id="m-err" hidden></div>
        </div>`,
        foot: `<button class="btn secondary" data-act="cancel">Cancelar</button>
               <button class="btn ${danger ? 'danger' : ''}" data-act="ok">${esc(confirmLabel || 'Confirmar')}</button>`,
      });
      el.querySelector('[data-act=cancel]').onclick = () => { closeModal(); resolve(null); };
      el.querySelector('[data-act=ok]').onclick = () => {
        const v = note ? el.querySelector('#m-note').value.trim() : '';
        if (note && noteRequired && !v) {
          const e = el.querySelector('#m-err'); e.hidden = false; e.textContent = 'Escreva o motivo.'; return;
        }
        const values = {};
        el.querySelectorAll('[data-field]').forEach((i) => (values[i.dataset.field] = i.value));
        closeModal();
        resolve(extra ? { note: v, values } : v);
      };
      const first = el.querySelector('textarea, input');
      if (first) first.focus();
    });
  }

  /** Executa uma ação com aviso de sucesso/erro e trava o botão. */
  async function run(btn, fn, okText) {
    if (btn) btn.disabled = true;
    try {
      const r = await fn();
      if (okText) toast(okText);
      return r;
    } catch (e) {
      toast(message(e), true);
      e.handled = true; // já avisado; o resto da cadeia não roda
      throw e;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------ arquivos */
  async function signedUrl(bucket, path, download) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 300, download ? { download: true } : undefined);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }
  async function openFile(bucket, path) {
    try {
      window.open(await signedUrl(bucket, path), '_blank', 'noopener');
    } catch (e) {
      toast('Não conseguimos abrir o arquivo: ' + message(e), true);
    }
  }
  /** QR Code em SVG (biblioteca qrcode-generator, em js/qrcode.js) */
  function qrSvg(text) {
    if (!window.qrcode) return '';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="QR Code do Pix"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#2b2321"/></svg>`;
  }

  /** Baixa o arquivo (em vez de abrir), com o nome indicado */
  async function downloadFile(bucket, path, name) {
    try {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 300, { download: name || true });
      if (error) throw new Error(error.message);
      const a = document.createElement('a');
      a.href = data.signedUrl; a.rel = 'noopener'; if (name) a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      toast('Não conseguimos baixar o arquivo: ' + message(e), true);
    }
  }
  const isImage = (path, mime) => /^image\//.test(mime || '') || /\.(jpe?g|png|webp|heic)$/i.test(path || '');

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { toast('Não deu para copiar', true); }
  }

  window.addEventListener('unhandledrejection', (ev) => { if (ev.reason && ev.reason.handled) ev.preventDefault(); });

  /* ---------- helpers compartilhados (um só lugar para todas as telas) ---------- */
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const monthStart = () => today().slice(0, 8) + '01';
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const fmtDoc = (d) => { const v = digits(d); return v.length === 11 ? v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : v.length === 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v; };
  const kpi = (l, v, sub, bad) => `<div class="card kpi${bad ? ' alert' : ''}"><span class="lbl">${l}</span><span class="big">${v}</span>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
  const pill = (attr, k, l, cur) => `<button type="button" ${attr}="${k}" class="btn ${cur === k ? '' : 'secondary'} sm">${l}</button>`;
  const mini = (l, v, sub, col) => `<div class="mini-card"><div class="small muted">${l}</div><div class="mini-v"${col ? ` style="color:${col}"` : ''}>${v}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
  const dline = (l, v) => `<div class="dline"><span class="muted">${l}</span><b>${v}</b></div>`;
  const csvFile = (name, head, rows) => {
    const cell = (v) => { const t = String(v == null ? '' : v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = name.endsWith('.csv') ? name : `${name}-${today()}.csv`; a.click();
  };

  window.BO = {
    sb, rpc, safeUrl, message, esc, brl, pct, date, dateTime, ago, cnpj, cpf, yearsSince, tag, check,
    DOC_KIND, ACCESS, ROLE, LEVEL, REVENUE, toast, modal, closeModal, confirmAction, run,
    signedUrl, openFile, downloadFile, qrSvg, isImage, copy,
    today, monthStart, digits, fmtDoc, kpi, pill, mini, dline, csvFile,
  };
})();
