/* Projeto Supabase da Lottus. A chave publicável pode ficar aqui: o acesso é
   controlado pelo login da equipe (com segundo fator) e pelas funções bo_* no banco. */
window.LOTTUS_CONFIG = {
  supabaseUrl: 'https://rowhslnnlzfbhmzbylbz.supabase.co',
  supabaseKey: 'sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ',
  /* Sai sozinho depois de tanto tempo sem uso */
  idleMinutes: 30,
  /* Este site: admin.lottusfinance.com.br (equipe Lottus). Os fundos usam partners.lottusfinance.com.br */
  surface: window.LOTTUS_SURFACE || 'admin',
  adminUrl: 'https://admin.lottusfinance.com.br/',
  partnersUrl: 'https://partners.lottusfinance.com.br/',
};
