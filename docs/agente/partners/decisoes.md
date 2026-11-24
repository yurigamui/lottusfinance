# DECISOES: Lottus Partners

| Data | Decisão | Motivo | Quem decidiu |
| --- | --- | --- | --- |
| 2026-11-23 | Corrigir XSS escapando cada chamada (`esc`) em vez de mudar `B.modal` para escapar o subtítulo por padrão | `B.modal`/`B.drawer` têm ~60 chamadas, várias com HTML fixo de propósito no subtítulo; mudar o componente compartilhado exige reverificar todas as telas logadas, que não podem ser abertas sem um usuário de teste | Time (maestro), alternativa registrada como P-004 |
| 2026-11-23 | Não unificar agora as páginas de assinatura do Partners com as do Sign | Depende de o Sign estar publicado e de `signUrl` configurado | Time |
| 2026-11-24 | **Alinhamento com o Site:** a apresentação do Partners fica em `lottusfinance.com.br/partners/`. A raiz de `partners.lottusfinance.com.br` continua sendo a entrada do app; não mover rotas nem mudar `index.html`. Se o Yuri decidir o contrário (apresentação na raiz do subdomínio), a entrada do app passa a `/entrar` com redirecionamentos e o Partners precisa ser reverificado | Evitar dividir SEO e quebrar links já enviados | Time (Site); Yuri aprovou a opção (a) em 24/11 |
