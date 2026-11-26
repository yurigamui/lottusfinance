/* Lottus Sign: validação e normalização de texto (sem dependências). A regra que vale é a do servidor. */
export const LIMITS = { email: 254, name: 140, passwordMin: 10 };

export function normEmail(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

export function isEmail(v) {
  const s = String(v || '');
  return s.length > 0 && s.length <= LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function normName(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

export function nameOk(v) {
  const s = normName(v);
  return s.length >= 3 && s.length <= LIMITS.name && s.split(' ').filter(Boolean).length >= 2;
}

/* ---- CPF e celular (seção 1.4). O servidor é a autoridade; aqui só conforto de uso. ---- */
export const onlyDigits = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/* 11 dígitos, sem sequência repetida, com os dois dígitos verificadores (mesma regra do servidor, _cpf_ok) */
export function cpfOk(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/* máscara só visual: 000.000.000-00 (aceita menos de 11 dígitos enquanto se digita) */
export function fmtCpf(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/^(\d{3})(\d{1,3})?(\d{1,3})?(\d{1,2})?$/, (m, a, b, c, e) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (e ? '-' + e : ''));
}

/* CPF travado: mostra só os 6 dígitos do meio (•••.456.789-••) */
export function maskCpf(v) {
  const d = onlyDigits(v);
  return d.length === 11 ? '•••.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-••' : '';
}

/* celular com código do país (5511987651234) -> (11) •••••-1234; só DDD e os 4 últimos dígitos aparecem */
export function maskPhone(v) {
  let d = onlyDigits(v);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 8) return d ? '•••' + d.slice(-2) : '';
  const ddd = d.length >= 10 ? '(' + d.slice(0, 2) + ') ' : '';
  return ddd + (d.length - (ddd ? 2 : 0) >= 9 ? '•••••' : '••••') + '-' + d.slice(-4);
}

export function passwordMissing(v) { return Math.max(0, LIMITS.passwordMin - String(v || '').length); }
