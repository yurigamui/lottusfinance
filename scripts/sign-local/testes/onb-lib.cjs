// Apoio dos testes da seção 1.3 (Onboarding): cria contas FICTÍCIAS (onbN@teste.example, senha senha-correta-1) em estados de onboarding
// diferentes, direto no banco local isolado. CPFs gerados com dígitos verificadores válidos. Nada fala com a produção.
const dv = (d, n) => { let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
/* CPF válido e determinístico a partir de um número (1..): 9 dígitos + 2 verificadores */
function cpfValido(n) {
  const base = String(100000000 + n * 7919).slice(0, 9).split('').map(Number);
  if (base.every((x) => x === base[0])) base[8] = (base[8] + 1) % 10;
  base.push(dv(base, 9)); base.push(dv(base, 10));
  return base.join('');
}
const uid = (n) => `e1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const email = (n) => `onb${n}@teste.example`;
const NOME = (n) => `Pessoa Onboarding Numero${n}`.replace(/\d/g, (d) => 'ABCDEFGHIJ'[d]);

/* o: { nome: string|null, cpf: string|null|undefined(=válido), semPerfil, verif: 'email'|'phone'|null, cert: 'ok'|'vencido'|'semCadeia'|null, done, confirmado, meta }
   Perfil padrão = COMPLETO (nome com 2+ palavras e CPF válido). */
async function mk(q, n, o = {}) {
  const id = uid(n);
  await q(`delete from auth.users where id = $1`, [id]);
  await q(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1, $2, extensions.crypt('senha-correta-1', extensions.gen_salt('bf')), $3, $4)`,
    [id, email(n), JSON.stringify(o.meta || {}), o.confirmado === false ? null : new Date().toISOString()]);
  if (!o.semPerfil) {
    const nome = o.nome === undefined ? NOME(n) : o.nome;
    const cpf = o.cpf === undefined ? cpfValido(n) : o.cpf;
    await q(`insert into public.profiles (id, full_name, cpf, email) values ($1, $2, $3, $4)`, [id, nome, cpf, email(n)]);
  }
  const v = o.verif || null;
  const cert = o.cert || null;
  await q(`insert into public.sign_identity (user_id, phone, phone_verified_at, phone_channel, onboarding_done, cert_serial, cert_subject, cert_issuer, cert_cpf, cert_not_before, cert_not_after, cert_verified_at, cert_chain_ok)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
  [id, v === 'phone' ? '5511987651234' : null, v ? new Date().toISOString() : null, v === 'phone' ? 'whatsapp' : v, !!o.done,
    cert ? '0A1B' : null, cert ? 'CN=Pessoa Cert:' + cpfValido(n) : null, cert ? 'AC Exemplo' : null, cert ? cpfValido(n) : null,
    cert ? new Date(Date.now() - 30 * 864e5).toISOString() : null, cert ? new Date(Date.now() + (cert === 'vencido' ? -2 : 300) * 864e5).toISOString() : null, cert ? new Date().toISOString() : null, cert ? cert !== 'semCadeia' : false]);
  return { id, email: email(n), n, nome: o.nome === undefined ? NOME(n) : o.nome, cpf: o.cpf === undefined ? cpfValido(n) : o.cpf };
}
module.exports = { cpfValido, uid, email, mk, NOME };
