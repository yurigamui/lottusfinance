/* Projeto Supabase da Lottus. A chave publicável pode ficar aqui: o acesso é
   controlado pelo login do representante (com segundo fator) e pelas funções partner_* no banco. */
window.LOTTUS_CONFIG = {
  supabaseUrl: 'https://rowhslnnlzfbhmzbylbz.supabase.co',
  supabaseKey: 'sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ',
  /* Sai sozinho depois de tanto tempo sem uso */
  idleMinutes: 30,
  /* Este site: partners.lottusfinance.com.br (fundos parceiros). A equipe Lottus usa admin.lottusfinance.com.br */
  surface: window.LOTTUS_SURFACE || 'partners',
  adminUrl: 'https://admin.lottusfinance.com.br/',
  partnersUrl: 'https://partners.lottusfinance.com.br/',
};
