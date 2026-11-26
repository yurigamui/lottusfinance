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
    nfe_blocked: 'Nota cancelada, não reconhecida pelo cliente ou ainda não conferida na SEFAZ: a operação não pode ser aprovada nem paga',
    protected_delete: 'Registros financeiros e jurídicos não podem ser apagados',
    terms_changed: 'O texto do contrato mudou. Abra de novo e confira.',
    screening_blocked: 'O cedente tem sanção vigente ou CNPJ inativo: não abre operação nova',
    not_configured: 'A verificação ainda não está configurada',
    invalid_url: 'O endereço do webhook precisa começar com https://',
    buyback_overdue: 'O cedente tem recompra vencida: novas antecipações ficam suspensas até o pagamento.',
    forbidden: 'Este login não faz parte da equipe Lottus.',
    mfa_required: 'Confirme o código do autenticador para continuar.',
    insufficient_level: 'Seu nível de acesso não permite esta ação.',
    not_found: 'Não encontrado. Atualize a página.',
    note_required: 'Escreva o motivo. Ele aparece para o cliente.',
    invalid: 'Confira os valores informados.',
    pix_key_required: 'Cadastre a chave Pix da Lottus antes de ligar o repasse.',
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
    org_in_use: 'Esta organização da Trio já está ligada a outro fundo.',
    trio_not_configured: 'O fundo ainda não conectou a Conta Trio (Partners → Configurações → Banco).',
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
    return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };
  const dateTime = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '—');
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
  /* Datas do dia sempre no fuso de Brasília (nunca toISOString, que usa UTC e vira o mês às 21h) */
  const TZ = 'America/Sao_Paulo';
  const tzFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  /** Data de Brasília (AAAA-MM-DD) de um instante; sem argumento, agora. */
  const isoOf = (d) => {
    const p = {};
    tzFmt.formatToParts(d == null ? new Date() : new Date(d)).forEach((x) => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day}`;
  };
  const today = () => isoOf();
  /** Primeiro dia do mês (AAAA-MM-01) da data informada; sem argumento, do mês atual em Brasília. */
  const monthStart = (iso) => String(iso || today()).slice(0, 7) + '-01';
  /** Soma dias a uma data AAAA-MM-DD (conta de calendário, sem fuso). */
  const addDays = (iso, n) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + Number(n || 0))).toISOString().slice(0, 10);
  };
  /** Soma meses e devolve o dia 1 do mês resultante. */
  const addMonths = (iso, n) => {
    const [y, m] = String(iso).slice(0, 7).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + Number(n || 0), 1)).toISOString().slice(0, 10);
  };
  /** Valor em reais digitado: "1.234,56", "1234,5" ou "1234.56". Vazio devolve null; texto inválido devolve NaN. */
  const parseMoney = (v) => {
    const t = String(v == null ? '' : v).trim().replace(/^R\$\s*/i, '');
    if (t === '') return null;
    if (/^-?\d+\.\d{1,2}$/.test(t)) return Number(t);
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
    return NaN;
  };
  const yearsSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 86400000)) : null);

  const LABELS = {
    identity: { in_review: ['Em análise', 'warning'], approved: ['Aprovada', 'success'], rejected: ['Recusada', 'danger'], pending: ['Pendente', ''] },
    doc: { in_review: ['Em análise', 'warning'], approved: ['Aprovado', 'success'], rejected: ['Recusado', 'danger'] },
    bank: { pending_validation: ['A validar', 'warning'], validated: ['Validada', 'success'], rejected: ['Recusada', 'danger'] },
    credit: { in_review: ['Em análise', 'warning'], approved: ['Aprovado', 'success'], rejected: ['Recusado', 'danger'] },
    op: {
      // As mesmas etapas do app e do quadro do fundo (Solicitação, Análise, Pagamento, Ativo, Vencido, Liquidado, Reprovado)
      requested: ['Solicitação', 'brand'], in_review: ['Análise', 'warning'], approved: ['Pagamento', 'warning'],
      paid: ['Ativo', 'success'], settled: ['Liquidado', ''], rejected: ['Reprovado', 'danger'], cancelled: ['Reprovado', 'danger'],
      vencido: ['Vencido', 'danger'],
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

  /* Modal: folha inferior no celular, centrado no desktop; foco preso, Esc fecha, foco volta a quem abriu */
  let modalOpener = null;
  let modalOnClose = null;
  // conta ações da pessoa (toque, clique, tecla): um modal aberto sem ação nova depois da rota veio do endereço (B-4)
  let inputCount = 0;
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { inputCount++; }, true));
  let modalUid = 0;
  const visible = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const modalFocusables = (m) => [...m.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]')]
    .filter((e) => !e.disabled && e.tabIndex >= 0 && visible(e));
  const currentModal = () => { const r = document.getElementById('modal-root'); return r ? r.querySelector('.modal') : null; };
  function syncViewport() {
    const root = document.getElementById('modal-root'), vv = window.visualViewport, m = currentModal();
    if (!root || !vv || !m) return;
    // teclado virtual: a folha acompanha a área realmente visível
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
    const a = document.activeElement;
    if (a && m.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) a.scrollIntoView({ block: 'nearest' });
  }
  function onModalKey(e) {
    const m = currentModal();
    if (!m) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const f = modalFocusables(m);
    if (!f.length) { e.preventDefault(); m.focus(); return; }
    const first = f[0], last = f[f.length - 1], act = document.activeElement;
    if (!m.contains(act) || act === m) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
  }
  function onModalFocusIn(e) {
    const m = currentModal();
    if (!m) return;
    if (!m.contains(e.target) && !e.target.closest('#toast-root')) { const f = modalFocusables(m); (f[0] || m).focus(); return; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) setTimeout(() => { if (e.target.isConnected && m.contains(e.target)) e.target.scrollIntoView({ block: 'center' }); }, 120);
  }
  function closeModal() {
    const root = document.getElementById('modal-root');
    const had = !!(root && root.firstElementChild);
    if (root) { root.innerHTML = ''; root.style.removeProperty('--vvh'); root.style.removeProperty('--vvt'); }
    document.removeEventListener('keydown', onModalKey, true);
    document.removeEventListener('focusin', onModalFocusIn);
    if (window.visualViewport) { window.visualViewport.removeEventListener('resize', syncViewport); window.visualViewport.removeEventListener('scroll', syncViewport); }
    document.documentElement.classList.remove('modal-open');
    const op = modalOpener, cb = modalOnClose;
    modalOpener = null; modalOnClose = null;
    // B-4: modal aberto por endereço profundo (#/funil/l1): ao fechar, o endereço volta para a lista (F5 não reabre)
    const rm = window.BO && window.BO._routeModal;
    if (rm) {
      window.BO._routeModal = null;
      if (had && location.hash === rm.hash) history.replaceState(null, '', rm.base);
    }
    if (had && op && op !== document.body && op.isConnected && typeof op.focus === 'function') op.focus({ preventScroll: true });
    if (had && cb) cb();
  }

  /** Abre um modal; devolve o elemento para ligar os eventos. onClose roda se ele for fechado por Esc, ✕, fundo ou troca de tela. */
  function modal({ title, subtitle, body, foot, wide, onClose }) {
    const root = document.getElementById('modal-root');
    const replacing = !!currentModal();
    if (replacing) {
      // um modal no lugar de outro: o foco volta ao elemento que abriu o primeiro
      const cb = modalOnClose; modalOnClose = null; root.innerHTML = '';
      if (cb) cb();
    } else {
      modalOpener = document.activeElement;
      const ro = window.BO._routeOpen;
      window.BO._routeOpen = null;
      window.BO._routeModal = ro && ro.n === inputCount && location.hash === ro.hash && Date.now() - ro.t < 8000 ? ro : null;
    }
    modalOnClose = onClose || null;
    const uid = ++modalUid;
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-t-${uid}"${subtitle ? ` aria-describedby="modal-s-${uid}"` : ''} tabindex="-1">
          <div class="modal-head">
            <div><h2 id="modal-t-${uid}" tabindex="-1">${esc(title)}</h2>${subtitle ? `<div class="muted" id="modal-s-${uid}">${subtitle}</div>` : ''}</div>
            <button type="button" class="btn ghost sm modal-x" data-close aria-label="Fechar">✕</button>
          </div>
          <div class="modal-body">${body || ''}</div>
          ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
        </div>
      </div>`;
    const el = root.querySelector('.modal');
    const bd = root.querySelector('.modal-backdrop');
    // só fecha pelo fundo se o clique começou e terminou nele (selecionar texto e soltar fora não fecha)
    let downOnBackdrop = null;
    bd.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === bd; });
    bd.addEventListener('click', (e) => { if (e.target === bd && downOnBackdrop !== false) closeModal(); downOnBackdrop = null; });
    el.querySelector('.modal-head [data-close]').addEventListener('click', closeModal);
    document.documentElement.classList.add('modal-open');
    if (!replacing) {
      document.addEventListener('keydown', onModalKey, true);
      document.addEventListener('focusin', onModalFocusIn);
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', syncViewport); window.visualViewport.addEventListener('scroll', syncViewport); }
    }
    syncViewport();
    // foco: primeiro campo (no celular, o título, para o teclado não abrir sozinho e cobrir a folha)
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const field = coarse ? null : el.querySelector('.modal-body input:not([type=hidden]):not([disabled]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled])');
    (field || el.querySelector('h2')).focus({ preventScroll: true });
    return el;
  }

  /**
   * Confirmação com motivo opcional/obrigatório.
   * Resolve com o texto (ou '' sem campo), ou null se cancelou.
   */
  function confirmAction({ title, text, confirmLabel, danger, note, noteLabel, noteRequired, notePlaceholder, extra }) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); };
      const el = modal({
        title,
        onClose: () => finish(null),
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
      el.querySelector('[data-act=cancel]').onclick = () => { finish(null); closeModal(); };
      el.querySelector('[data-act=ok]').onclick = () => {
        const v = note ? el.querySelector('#m-note').value.trim() : '';
        if (note && noteRequired && !v) {
          const e = el.querySelector('#m-err'); e.hidden = false; e.textContent = 'Escreva o motivo.'; return;
        }
        const values = {};
        el.querySelectorAll('[data-field]').forEach((i) => (values[i.dataset.field] = i.value));
        finish(extra ? { note: v, values } : v);
        closeModal();
      };
      const first = el.querySelector('textarea, input');
      if (first && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) first.focus();
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
    sb, rpc, safeUrl, message, esc, brl, pct, date, dateTime, ago, cnpj, cpf, yearsSince, tag, check,
    TZ, isoOf, today, monthStart, addDays, addMonths, parseMoney,
    DOC_KIND, ACCESS, ROLE, LEVEL, REVENUE, toast, modal, closeModal, _inputCount: () => inputCount, confirmAction, run,
    signedUrl, openFile, isImage, copy,
  };
})();
