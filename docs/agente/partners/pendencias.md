# PENDENCIAS: Lottus Partners

| ID | Descrição | Severidade | Dono | Prazo | Origem |
| --- | --- | --- | --- | --- | --- |
| P-001 | Bloqueios da auditoria pré-MVP de 16/11: o documento não está no repositório, então não puderam ser conferidos um a um. Trazer a lista para `docs/agente/partners/` | Alta (não avaliado) | Yuri | antes do lançamento | progresso 23/11 |
| P-002 | 10 áreas logadas (Painel, Operações, Cobrança, Cadastros, Contratos, Debêntures e Cotas, Tesouraria, Contabilidade, Configurações) não auditadas na tela: exigem usuário de fundo com 2FA no branch | Alta (não avaliado) | Yuri (usuário de teste) e agente | a definir | progresso 23/11 |
| P-003 | Correções de injeção de HTML verificadas pelo padrão e no navegador com `confirmAction`/`modal` reais, mas não pelo fluxo completo de cada tela (exige login) | Média | Agente | com P-002 | verificação 23/11 |
| P-004 | `B.modal`/`B.drawer` renderizam o subtítulo sem escape (por design): toda chamada nova é uma armadilha. Proposta: `subtitleHtml` explícito e `subtitle` escapado por padrão, com reverificação das ~60 chamadas | Baixa | Agente | com P-002 | verificação 23/11 (A2) |
| P-005 | Páginas de assinatura duplicadas com o Sign (ver `sign/relatorio.md`, S-SIGN-02) | Média | Yuri (signUrl) | a definir | auditoria 23/11 |
