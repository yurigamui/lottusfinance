/* Lottus Sign (sign.lottusfinance.com.br): só assinatura e verificação de documentos, sem login.
   A chave publicável pode ficar aqui: as funções públicas usam o token do link e o CPF do signatário. */
window.LOTTUS_CONFIG = {
  supabaseUrl: 'https://rowhslnnlzfbhmzbylbz.supabase.co',
  supabaseKey: 'sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ',
  signUrl: 'https://sign.lottusfinance.com.br/',
  /* Termos e Política (seção 1.1): URL e versão dependem do jurídico (J-02/P1-10). Vazio = o texto aparece sem link. */
  termsUrl: '',
  privacyUrl: '',
  termsVersion: '[preencher]',
  privacyVersion: '[preencher]',
  /* Suporte (seção 1.4, pendência E-01): e-mail a definir pelo Yuri. Vazio = o link "fale com o suporte" abre o e-mail sem destinatário. */
  supportEmail: '',
  /* Seção 1.5: endereço da função de borda que valida o certificado digital (T-07; NÃO está no repositório). Vazio = desligado: a tela mostra
     "Validação de certificado indisponível neste ambiente." e o envio do arquivo fica desligado. Precisa estar em um host liberado no connect-src do _headers. */
  certEndpoint: '',
};
