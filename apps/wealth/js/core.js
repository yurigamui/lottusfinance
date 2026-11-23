/* Lottus Wealth — núcleo: cliente Supabase, formatação pt-BR, ícones, avisos, janelas e seletor de período. */
window.BO = window.BO || {};
(function () {
  'use strict';
  const cfg = window.WEALTH_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, storage: window.sessionStorage, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const W = { cfg, sb, state: { me: null, wallets: [], wallet: null }, acts: {}, forms: {}, live: {}, routes: [] };
  window.W = W;

  /* ---------- erros ---------- */
  const MSG = {
    forbidden: 'Você não tem permissão para isso.', read_only: 'Esta carteira está somente para visualização (pagamento pendente ou arquivada).',
    payment_required: 'Para criar ou assumir mais de uma carteira é preciso cadastrar uma forma de pagamento (plano Pro).',
    profile_required: 'Termine o seu cadastro primeiro.', email_not_confirmed: 'Confirme o e-mail da sua conta primeiro.',
    cpf_invalid: 'CPF inválido.', cpf_in_use: 'Este CPF já está cadastrado em outra conta.', name_required: 'Preencha o nome.', email_invalid: 'E-mail inválido.',
    invalid_role: 'Alçada inválida.', already_member: 'Esta pessoa já tem acesso à carteira.', last_manager: 'A carteira precisa ter ao menos um gestor.',
    owner_must_manage: 'O titular da cobrança precisa continuar como gestor.', owner_cannot_leave: 'O titular da cobrança não pode sair; peça a outro gestor para removê-lo ou arquive a carteira.',
    owner_only: 'Só o titular da cobrança pode fazer isso.', not_found: 'Não encontrado.', invalid_value: 'Valor inválido.', invalid_file: 'Arquivo inválido ou grande demais.',
    in_use: 'Existem lançamentos nesta conta; exclua-os antes.', plan_required: 'Disponível no plano Fund.',
    doc_invalid: 'CPF ou CNPJ inválido.', zip_invalid: 'CEP inválido.', invalid_name: 'Dê um nome com 2 a 80 caracteres.', user_not_found: 'Não há conta no Wealth com este CPF. Peça para a pessoa criar a conta primeiro.',
    invalid_reference: 'Esse cadastro não pertence a esta carteira. Atualize a página e escolha de novo.',
    position_negative: 'A venda é maior que a quantidade em carteira nessa data. Confira as compras lançadas antes dela.',
    'Invalid login credentials': 'E-mail ou senha incorretos.', 'Email not confirmed': 'Confirme seu e-mail antes de entrar.', 'User already registered': 'Este e-mail já tem conta. Entre ou recupere a senha.',
  };
  const msgOf = (m) => { m = String(m || ''); if (MSG[m]) return MSG[m]; const k = Object.keys(MSG).find((x) => m.includes(x)); return k ? MSG[k] : 'Algo deu errado. Tente de novo.'; };
  W.msgOf = msgOf;
  W.rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) { const e = new Error(msgOf(error.message)); e.code = error.message; throw e; }
    return data;
  };

  /* ---------- formatação ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fBrl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 });
  const fCompact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  Object.assign(W, {
    esc,
    brl: (v) => (v === null || v === undefined || v === '' ? '—' : fBrl.format(Number(v)).replace(/ /g, ' ')),
    brlC: (v) => `R$ ${fCompact.format(Number(v) || 0)}`,
    num: (v, d = 2) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v))),
    qty: (v) => (v === null || v === undefined ? '—' : fNum.format(Number(v))),
    pct: (v, d = 2) => (v === null || v === undefined ? '—' : `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) * 100)}%`),
    dt: (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'),
    dtm: (s) => { if (!s) return '—'; const d = new Date(s); return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); },
    monthLabel: (s) => { const [y, m] = String(s).slice(0, 7).split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}/${y.slice(2)}`; },
    digits: (s) => String(s || '').replace(/\D/g, ''),
    cpf: (s) => { const d = String(s || '').replace(/\D/g, '').slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); },
    cpfMasked: (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : '—'; },
    ymd: (d) => { const x = d || new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },
    cls: (v) => (Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : ''),
    sign: (v, f) => `${Number(v) > 0 ? '+' : ''}${f(v)}`,
  });
  /** número digitado no padrão brasileiro ("1.234,56") ou internacional ("1234.56") */
  W.parseNum = (s) => {
    s = String(s ?? '').trim().replace(/[R$\s ]/g, '');
    if (!s) return null;
    let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  };
  // Converte para AAAA-MM-DD e só aceita datas que existem no calendário (31/02 vira null, como no banco).
  const realDate = (iso) => { if (!iso) return null; const [y, mo, d] = iso.split('-').map(Number); const t = new Date(y, mo - 1, d); return t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d ? iso : null; };
  W.parseDate = (s) => realDate(parseDateRaw(s));
  const parseDateRaw = (s) => {
    s = String(s ?? '').trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/))) return `${m[3]}-${m[2]}-${m[1]}`;
    if ((m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{2})$/))) return `20${m[3]}-${m[2]}-${m[1]}`;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;   // OFX
    return null;
  };
  W.initials = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

  /* ---------- ícones (traço 2,2px, estilo Lucide) ---------- */
  const P = {
    layout: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    trend: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    bank: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
    tags: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    bars: '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  };
  W.ico = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

  /* ---------- avisos ---------- */
  W.toast = (title, msg, type = 'ok') => {
    const root = document.getElementById('toast-root'); if (!root) return;
    const t = document.createElement('div'); t.className = `toast ${type}`; t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.innerHTML = `<div class="toast-body"><div class="toast-icon">${W.ico(type === 'error' ? 'x' : 'check')}</div><div class="toast-text"><div class="toast-title">${esc(title)}</div>${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}</div></div><div class="toast-bar"></div>`;
    t.querySelector('.toast-bar').style.animationDuration = '4.5s';
    root.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, 4500);
  };
  W.fail = (e) => W.toast('Não deu certo', e && e.message ? e.message : msgOf(''), 'error');

  /* ---------- janela / gaveta ---------- */
  let current = null;
  W.closeModal = () => { if (current) { current.remove(); current = null; document.body.classList.remove('noscroll'); } };
  W.modal = ({ title, sub, body, foot, wide, drawer }) => {
    W.closeModal();
    const bd = document.createElement('div');
    bd.className = `modal-backdrop${drawer ? ' drawer-bd' : ''}`;
    bd.innerHTML = `<div class="modal${wide ? ' wide' : ''}${drawer ? ' drawer' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<div class="muted">${esc(sub)}</div>` : ''}</div><button class="btn ghost sm" data-act="modal-close" aria-label="Fechar">${W.ico('x')}</button></div>
      <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    document.getElementById('modal-root').appendChild(bd);
    current = bd;
    bd.addEventListener('mousedown', (e) => { if (e.target === bd) W.closeModal(); });
    const f = bd.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus();
    return bd;
  };
  W.confirm = (title, text, okLabel = 'Confirmar', danger = false) => new Promise((resolve) => {
    W.modal({ title, body: `<p class="muted">${esc(text)}</p>`, foot: `<button class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn ${danger ? 'danger' : ''}" data-act="confirm-ok">${esc(okLabel)}</button>` });
    const el = current;
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; const ok = b.dataset.act === 'confirm-ok'; if (ok) W.closeModal(); resolve(ok); });
    new MutationObserver((_, ob) => { if (!document.body.contains(el)) { resolve(false); ob.disconnect(); } }).observe(document.getElementById('modal-root'), { childList: true });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') W.closeModal(); });

  /** executa uma ação com o botão em "carregando" */
  W.busy = async (btn, fn) => {
    if (btn) btn.classList.add('loading');
    try { return await fn(); } catch (e) { W.fail(e); } finally { if (btn) btn.classList.remove('loading'); }
  };
  W.form = (form) => { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); form.querySelectorAll('[data-mask=date]').forEach((el) => {
      if (!el.name) return;
      const iso = (window.BO.mask && window.BO.mask.toIso(el.value)) || (/^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '');
      W.fieldError(el, '');
      if (el.value.trim() && !iso) { W.fieldError(el, 'Data inválida. Use dd/mm/aaaa.'); el.focus(); throw new Error('Data inválida. Use dd/mm/aaaa.'); }
      o[el.name] = iso;
    }); return o; };
  // Mensagem de erro ao lado do campo (some na próxima tentativa)
  W.fieldError = (el, msg) => {
    const fd = el.closest('.field') || el.parentElement; let m = fd.querySelector(':scope > .field-err');
    if (!msg) { el.removeAttribute('aria-invalid'); if (m) m.remove(); return; }
    el.setAttribute('aria-invalid', 'true'); if (!m) { m = document.createElement('div'); m.className = 'field-err small neg'; m.setAttribute('role', 'alert'); fd.appendChild(m); } m.textContent = msg;
  };
  /** Lista de opções logo abaixo do campo. host = elemento .combo (com um input e um .combo-list). */
  W.combo = (host, { fetch, label, sub, onPick }) => {
    const input = host.querySelector('input[type=text],input[type=search],input:not([type])'), list = host.querySelector('.combo-list');
    let items = [], active = -1, tm, seq = 0;
    const close = () => { list.hidden = true; active = -1; };
    const render = () => {
      list.innerHTML = items.length ? items.map((it, i) => `<button type="button" class="combo-item${i === active ? ' on' : ''}" data-i="${i}"><span>${esc(label(it))}</span>${sub ? `<small>${esc(sub(it))}</small>` : ''}</button>`).join('') : '<div class="combo-empty">Nada encontrado. Tente outro termo.</div>';
      list.hidden = false;
    };
    const load = async () => { const n = ++seq; try { const r = await fetch(input.value.trim()); if (n !== seq) return; items = r || []; active = -1; render(); } catch (e) { close(); } };
    const pick = (i) => { const it = items[i]; if (!it) return; input.value = label(it); close(); onPick(it); };
    input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(load, 200); if (host.__onType) host.__onType(); });
    input.addEventListener('focus', load);
    input.addEventListener('keydown', (e) => {
      if (list.hidden) { if (e.key === 'ArrowDown') { load(); e.preventDefault(); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && active >= 0) { pick(active); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.stopPropagation(); }
    });
    list.addEventListener('mousedown', (e) => { const b = e.target.closest('.combo-item'); if (b) { e.preventDefault(); pick(Number(b.dataset.i)); } });
    document.addEventListener('click', (e) => { if (!host.contains(e.target)) close(); });
    return { close, load };
  };
  W.opts = (list, sel, blank) => (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') + list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
  W.download = (name, text, type = 'text/csv;charset=utf-8') => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  W.csv = (rows) => rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n');

  /* ---------- seletor de período: calendário do Partners (js/mask.js) ---------- */
  W.rangeHtml = (from, to) => `<div class="range" data-range><input type="hidden" name="from" value="${esc(from || '')}"><input type="hidden" name="to" value="${esc(to || '')}"><input type="text" class="input" data-rangeinp aria-label="Período"></div>`;
  W.initRanges = (root) => {
    const M = window.BO.mask; if (!M) return;
    (root || document).querySelectorAll('[data-range]').forEach((box) => {
      if (box.__r) return; box.__r = true;
      const f = box.querySelector('[name=from]'), t = box.querySelector('[name=to]'), inp = box.querySelector('[data-rangeinp]');
      M.rangePicker(inp, {
        get: () => ({ from: f.value, to: t.value }),
        set: (a, b) => { f.value = a || ''; t.value = b || ''; t.dispatchEvent(new Event('change', { bubbles: true })); },
        presets: M.presetsStd({ months: [6, 12] }), emptyLabel: 'Todo o período',
      });
    });
  };
  /* máscaras (data, valor…) e calendários em tudo que for desenhado depois */
  let raf = 0;
  new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const M = window.BO.mask; if (M) M.attach(document); W.initRanges(); }); }).observe(document.documentElement, { childList: true, subtree: true });
})();
