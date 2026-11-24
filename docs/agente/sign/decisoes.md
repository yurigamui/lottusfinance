# Decisões: Lottus Sign
| Data | Decisão | Motivo | Quem | Descartado |
| --- | --- | --- | --- | --- |
| 24/11/2026 | Modo Parcial: o back-end atual é a base; o front logado é construído novo | Back-end tem RLS, hash encadeado e regras de cota prontas | Maestro | Recriar o back-end |
| 24/11/2026 | Nenhuma RPC `sign_env_*` muda sem necessidade comprovada em teste; correções vão em migração nova, não aplicada | Regra 12 | Maestro | Editar em produção |
| 24/11/2026 | v1 promete assinatura **avançada** (link + CPF + OTP ao signatário + IP + aparelho + hash encadeado + aceite do método registrado), com certificado ICP-Brasil opcional (qualificada). Textos legais são rascunho até o jurídico revisar (J-01) | Cobre contratos privados sem exigir certificado de todos | Yuri | Só simples; escolha por envelope; só qualificada |
| 24/11/2026 | **Custo zero**: sem branch do Supabase, sem SMS, sem carimbo do tempo pago. Testes em Postgres local (modelo `scripts/wealth-local`) | Pedido do Yuri | Yuri | Branch D-01; provedor de SMS |
| 24/11/2026 | OTP do signatário por **e-mail** (gratuito). Canais ficam atrás de uma interface (`sign_outbox.channel`: `email` ativo; `whatsapp` pronto e desligado em `sign_messaging_config`) para ligar o WhatsApp depois só com credenciais, sem mudar tela nem regra | Pedido do Yuri: deixar pronto para WhatsApp | Yuri | SMS; WhatsApp já ativo |
| 24/11/2026 | Marca só pelo PNG oficial (`img/logo-rosa.png`); o `h1` "Lottus Sign" em texto sai | Regra do manual (seção 11); decisão reversível de design | Maestro | Manter o texto |
| 24/11/2026 | Front novo em módulos ES nativos (`<script type="module">`), sem build e sem CDN, roteamento por hash com guarda de rota (ver `parte-1-design.md`, seção 5) | Passa na CSP atual e mantém o padrão estático | Maestro (proposta do Designer) | Bundler |
