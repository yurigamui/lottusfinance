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
    note_required: 'Escreva o motivo. Ele aparece para o cliente.',
    invalid: 'Confira os valores informados.',
    invalid_status: 'Esta ação não vale para a situação atual. Atualize a página.',
    reference_required: 'Informe o comprovante do pagamento (ex.: id do Pix ou da TED).',
    bank_required: 'A operação não tem conta de crédito.',
    user_not_found: 'Não há login com este e-mail. Use o convite pelo backoffice.',
    cannot_demote_self: 'Você não pode tirar o próprio acesso de administrador.',
    funder_signature_required: 'O parceiro ainda não assinou o aceite desta cessão.',
    funder_required: 'Escolha o parceiro (cessionária) da operação antes de aprovar.',
    funder_declined: 'O parceiro recusou esta cessão. Escolha outro parceiro.',
    funder_inactive: 'Este parceiro está inativo.',
    funder_exists: 'Já existe um fundo com este CNPJ.',
    unavailable: 'Não foi possível concluir agora. Tente de novo em instantes.',
    not_authenticated: 'Sua sessão expirou. Entre de novo.',
  };
  function message(err) {
    const raw = (err && (err.message || err.error_description || err.msg)) || String(err || '');
    if (ERRORS[raw]) return ERRORS[raw];
    const key = Object.keys(ERRORS).find((k) => raw.includes(k));
    if (key) return ERRORS[key];
    if (/Failed to fetch|NetworkError/i.test(raw)) return 'Sem conexão com o servidor.';
    return raw || 'Algo deu errado.';
  }

  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) throw new Error(error.message);
    return data;
  }

  /* ---------------------------------------------------------- formatação */
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
          ${text ? `<p style="margin:0">${text}</p>` : ''}
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
  const isImage = (path, mime) => /^image\//.test(mime || '') || /\.(jpe?g|png|webp|heic)$/i.test(path || '');

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { toast('Não deu para copiar', true); }
  }

  window.addEventListener('unhandledrejection', (ev) => { if (ev.reason && ev.reason.handled) ev.preventDefault(); });

  window.BO = {
    sb, rpc, message, esc, brl, pct, date, dateTime, ago, cnpj, cpf, yearsSince, tag, check,
    DOC_KIND, ACCESS, ROLE, LEVEL, REVENUE, toast, modal, closeModal, confirmAction, run,
    signedUrl, openFile, isImage, copy,
  };
})();
