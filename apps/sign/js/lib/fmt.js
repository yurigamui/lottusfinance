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
  return s.length <= LIMITS.name && s.split(' ').filter(Boolean).length >= 2;
}

export function passwordMissing(v) { return Math.max(0, LIMITS.passwordMin - String(v || '').length); }
