# Decisões: Lottus Sign
| Data | Decisão | Motivo | Quem | Descartado |
| --- | --- | --- | --- | --- |
| 24/11/2026 | Modo Parcial: o back-end atual é a base; o front logado é construído novo | Back-end tem RLS, hash encadeado e regras de cota prontas | Maestro | Recriar o back-end |
| 24/11/2026 | Nenhuma RPC `sign_env_*` muda sem necessidade comprovada em teste; correções vão em migração nova, não aplicada | Regra 12 | Maestro | Editar em produção |
| 24/11/2026 | v1 promete assinatura **avançada** (link + CPF + OTP ao signatário + IP + aparelho + hash encadeado + aceite do método registrado), com certificado ICP-Brasil opcional (qualificada). Textos legais são rascunho até o jurídico revisar (J-01) | Cobre contratos privados sem exigir certificado de todos | Yuri | Só simples; escolha por envelope; só qualificada |
