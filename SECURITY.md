# Política de segurança

## Como relatar uma vulnerabilidade

Não abra issue pública. Escreva para **contato@lottusfinance.com.br** com o assunto `Segurança`, ou use **Security → Report a vulnerability** neste repositório (relato privado do GitHub). Inclua o endereço afetado, os passos para reproduzir e o impacto esperado. Não acesse, altere ou apague dados de outras pessoas para provar o problema.

Respondemos em até 5 dias úteis e combinamos com você o prazo de correção e de divulgação.

## O que está no escopo

- Sites em `*.lottusfinance.com.br` publicados a partir de `apps/`.
- Funções do banco (RPCs) e funções de borda chamadas por esses sites.

## Padrão de segurança adotado

- RLS ligada em todas as tabelas; `anon` sem acesso a tabelas; escrita só por RPC `SECURITY DEFINER` que confere o usuário, com `grant execute` explícito; funções internas com prefixo `_` executáveis só pelo `service_role`.
- CSP estrita em cada `apps/<plataforma>/_headers`: sem script inline, sem biblioteca de CDN, `supabase-js` servido localmente.
- Nenhum segredo no front nem no repositório. A chave publicável do Supabase é pública por definição; a `service_role` e os tokens de integração ficam no Vault.
- MFA obrigatório para a equipe e os fundos.
- Varredura automática de segredos e de dependências a cada push (`.github/workflows/seguranca.yml`).
