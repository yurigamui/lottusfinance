# Verificação da plataforma (Fase 6): Admin v2 · 27/11/2026 · HEAD 008d3cf
[VERIFICADOR] Ambiente: Postgres 16 local descartável (stubs) + front real no Playwright (CSP do `_headers`) com Supabase simulado, ligado por ponte às RPCs reais do Postgres local. Nada em produção.

## Veredito: Aprovada com ressalvas (sem Bloqueante nem Alto)
- Suíte: `check.mjs` 312 arquivos, 0 erro; `smoke.mjs admin` sem problema; `PG_ONLY='admin|seguranca|integridade' bash scripts/test-db.sh`: `admin_planos_precos` 158/158, `admin_seguranca_sign` 24/24, NF-e e integridade ok; migrações aplicam e reaplicam sem erro.
- Mutação: reverter cada correção (M2, M3, M4, B2, B5, B6) faz a suíte falhar.
- Regressão: 31 rotas × 3 níveis × 10 larguras (930 cargas) com nome de 64 caracteres, HTML e R$ 999.999.999,99: 0 rolagem horizontal, 0 erro de JS/CSP, 0 XSS.
- Grants no banco local: 7 `bo_*` novas só `authenticated`; 8 internas e 3 `_sign_*_impl` só `service_role`; `price_overrides` sem acesso direto, `_guard_delete` ativo.
- Sem `[preencher]`, lorem, `console.log`, segredo, CDN ou script inline carregado (fonte do Google já permitida pela CSP). `portal.js` (órfão, com `onclick` inline) não é carregado.

## Achados e destino
| ID | Sev. | Resumo | Destino |
| --- | --- | --- | --- |
| M-A | Média | `bo_customer_plan` não devolve `list_rate` nem `min_monthly`: editar contrato começa em branco | corrigido em 27/11 (migração + front), teste local |
| M-B | Média | Assinaturas › "Mudanças do mês": nome longo corta a 320/390 (pré-existente) | corrigido em 27/11 (CSS), teste local |
| M-C | Média | Passo "Revise antes de confirmar" não quebra nome longo | corrigido em 27/11 (CSS), teste local |
| M-D | Média | Rodada completa de migrações não roda (stub sem `_w_pos`): Wealth v2/v3 não provadas junto | depende do branch (D-01) |
| B-1..B-6 | Baixa | etiqueta "Sem efeito" sem validade/autor; erros do Postgres em inglês (core.rpc descarta `error.code`); URL longa sem title; `portal.js` órfão; ✕ do modal 33 px no desktop | pendências A-047 |
| Reversão | — | migração `20261126120000` só tinha "idem"; Wealth v2/v3 sem reversão | bloco testado adicionado (ver release.md); Wealth: salvar `pg_get_functiondef` antes de aplicar |

## O que NÃO foi testado
Banco real/branch, pg_cron real, RLS com JWT e MFA reais, corpos reais de `_staff`, `_funder_pl`, `_plan_fee` e das 3 funções do Sign (só stubs), migrações Wealth v2/v3, envio real de e-mail e job de faturas, navegadores além do Chromium, toque real, leitor de tela, >200 faturas em atraso na tela, superfície Partners.

## Roteiro de teste manual de 5 minutos (produção, depois de publicar)
1. Abra admin.lottusfinance.com.br, entre com e-mail, senha e o código do autenticador (MFA). O Início deve abrir sem erro.
2. No Início, confira MRR, a receber e em atraso; role até o fim e veja se nada está cortado.
3. Em Clientes, abra um cliente de TESTE (um fundo ou conta Sign pequeno que você conheça).
4. Na ficha, "Plano e preço": plano atual, preço de tabela, preço efetivo, próxima cobrança (grátis/isento mostra "Sem cobrança prevista").
5. "Definir preço personalizado": Desconto (%) 10, motivo "teste Yuri", Revisar, Confirmar e salvar. Veja o aviso de sucesso e o novo preço efetivo.
6. Confira o preço personalizado, quem definiu e o motivo; no histórico, "Vigente".
7. "Revogar", motivo "fim do teste": o preço volta ao de tabela e o histórico mostra "Revogado".
8. Financeiro › A receber › "Em atraso": resumo, etapa de carência; nada deve ser enviado ou bloqueado sozinho.
9. Configurações › Auditoria: as duas ações aparecem com o seu nome.
10. Saia pelo menu e confirme a tela de entrada. Texto em inglês, tela vazia ou valor cortado: anote a tela e a largura. Não troque o plano de cliente real neste teste.
