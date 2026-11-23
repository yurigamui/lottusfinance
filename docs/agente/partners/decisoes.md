# DECISOES: Lottus Partners

| Data | Decisão | Motivo | Quem decidiu |
| --- | --- | --- | --- |
| 2026-11-23 | Corrigir XSS escapando cada chamada (`esc`) em vez de mudar `B.modal` para escapar o subtítulo por padrão | `B.modal`/`B.drawer` têm ~60 chamadas, várias com HTML fixo de propósito no subtítulo; mudar o componente compartilhado exige reverificar todas as telas logadas, que não podem ser abertas sem um usuário de teste | Time (maestro), alternativa registrada como P-004 |
| 2026-11-23 | Não unificar agora as páginas de assinatura do Partners com as do Sign | Depende de o Sign estar publicado e de `signUrl` configurado | Time |
