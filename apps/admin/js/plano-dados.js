/* Lottus Admin — camada de dados de plano, preço personalizado e cobrança (Pacote 3)
   Chama as RPCs bo_plan_catalog, bo_customer_plan, bo_price_override_*, bo_set_plan e bo_overdue_list.
   Essas RPCs vêm da migração 20261125120000 (ainda não aplicada): se a função não existe no banco,
   B.plan.isMissing(erro) é verdadeiro e as telas mostram B.plan.MISSING_TEXT em vez de quebrar.
   product: 'partners' | 'sign' | 'wealth' (Wealth: pronto aqui, sem tela no Admin por enquanto).
   Sujeito: partners = funders.id; sign = sign_accounts.id; wealth = w_profiles.user_id. */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc } = B;

  const MISSING_TEXT = 'Esta função fica disponível depois da atualização do banco.';
  /** Função inexistente no banco: PostgREST 404 / PGRST202 ("Could not find the function") ou Postgres 42883 ("function … does not exist"). */
  const isMissing = (e) => {
    const t = [e && e.message, e && e.detail, e && e.code, e && e.hint].filter(Boolean).join(' ');
    return /could not find the function|schema cache|PGRST202|42883|function [^\n]* does not exist|\b404\b/i.test(t);
  };

  const ERRORS = {
    forbidden: 'Este login não faz parte da equipe Lottus.',
    insufficient_level: 'Seu nível de acesso não permite esta ação.',
    mfa_required: 'Confirme o código do autenticador para continuar.',
    discount_needs_admin: 'Desconto acima de 20% exige um administrador.',
    invalid_value: 'Confira o valor informado.',
    invalid_kind: 'Escolha um tipo de preço válido.',
    invalid_plan: 'Esse plano não está disponível. Escolha outro.',
    reason_required: 'Explique o motivo (pelo menos 5 caracteres).',
    invalid_period: 'A validade não pode ser anterior a hoje.',
    subject_not_found: 'Cliente não encontrado. Atualize a página.',
    invalid_product: 'Produto inválido para esta ação.',
    fee_rate_needs_contract: 'Taxa personalizada só vale para fundos com contrato. Este fundo segue a tabela por faixa.',
    unchanged: 'Nada mudou: já estava assim.',
    not_found: 'Preço personalizado não encontrado. Atualize a página.',
  };
  /** Mensagem em português para qualquer erro destas RPCs (cai no tradutor geral se não for um código conhecido). */
  function errorMessage(e) {
    if (isMissing(e)) return MISSING_TEXT;
    const raw = String((e && (e.message || e.msg)) || e || '');
    if (ERRORS[raw]) return ERRORS[raw];
    const key = Object.keys(ERRORS).find((k) => raw.includes(k));
    if (key) return ERRORS[key];
    if (/duplicate key value violates unique constraint/i.test(raw)) return 'Esse registro já existe.';
    if (/violates foreign key/i.test(raw)) return 'Registro vinculado inexistente.';
    if (/null value in column/i.test(raw)) return 'Faltou preencher um campo.';
    if (/statement timeout/i.test(raw)) return 'A consulta demorou demais. Tente de novo.';
    if (/JWT expired|jwt expired|invalid JWT|PGRST30[0-9]/i.test(raw)) return 'Sua sessão expirou. Entre de novo.';
    if (/violates (check )?constraint|check constraint|23514|23505|23502|23503|22003|22P02/i.test(raw + ' ' + String((e && e.code) || ''))) return 'Algum valor não é permitido. Revise os campos.';
    if (/permission denied|42501|row-level security/i.test(raw + ' ' + String((e && e.code) || ''))) return 'Você não tem permissão para isso.';
    if (/Failed to fetch|NetworkError|Load failed|network request failed|timeout/i.test(raw)) return 'Sem conexão com o servidor. Tente de novo.';
    return B.message(e);
  }
  /** Dia de vencimento exibido: sempre de 1 a 28. */
  const dueDay = (x) => Math.min(28, Math.max(1, Math.trunc(Number(x)) || 1));

  const PRODUCT_OF = { funder: 'partners', sign: 'sign', partners: 'partners', wealth: 'wealth' };
  const productOf = (kind) => PRODUCT_OF[kind] || kind;

  B.plan = {
    MISSING_TEXT, isMissing, errorMessage, dueDay, productOf, ERRORS,
    catalog: () => rpc('bo_plan_catalog'),
    customer: (product, subject) => rpc('bo_customer_plan', { p_product: productOf(product), p_subject: subject }),
    overrides: (product, subject) => rpc('bo_price_override_list', { p_product: productOf(product), p_subject: subject }),
    /** p: { product, subject, kind: 'fixed'|'discount_pct'|'fee_rate', value, valid_until?, reason } (fee_rate em fração ao ano: 0,001 = 0,1% a.a.) */
    setOverride: (p) => rpc('bo_price_override_set', { p }),
    revokeOverride: (id, reason) => rpc('bo_price_override_revoke', { p_id: id, p_reason: reason }),
    /** p: { product, subject, plan, payment_ok? (wealth), rate_aa? e min_monthly? (partners 'contract') } */
    setPlan: (p) => rpc('bo_set_plan', { p }),
    overdue: () => rpc('bo_overdue_list'),
  };
})();
