# Relatório da plataforma: Lottus Admin · 23/11/2026

[MAESTRO] Modo Beta. Ambiente: front local no navegador (Playwright, CSP do `_headers` aplicada, rede externa bloqueada ou Supabase simulado); banco de produção só em leitura; migrações testadas em Postgres local.

## B0 (inventário real)
- 1 página (`index.html`) e 20 módulos JS carregados. 5 arquivos em `js/` não eram carregados por nenhuma página (cópias antigas do Partners): movidos para `_revisar/admin-js-nao-carregados/` (P-03).
- 89 RPCs chamadas pela tela: **88 existem e estão liberadas** a `authenticated`; **`bo_nfe_manual_check` não existia** (o botão "Registrar" da conferência manual da NF-e sempre falhava).

## Seções verificadas
| Seção | Veredito | Ciclos | Evidência |
| --- | --- | --- | --- |
| Entrar (estado sem conexão) | Sem achados | — | `smoke.mjs` 7 larguras; login com rede bloqueada mostra "Sem conexão com o servidor." e reabilita o botão |
| Operação · Conferência manual da NF-e | **Aprovada com ressalvas** | 2 | Migração `20261123122000_admin_conferencia_manual_nfe.sql` (não aplicada), testes N1–N6 em Postgres local, modal testado no navegador com Supabase simulado em 4 larguras |

## Pendências
| ID | Descrição | Severidade |
| --- | --- | --- |
| A-001 | Aplicar a migração da conferência manual depois de testá-la no branch contra `_staff_log` e `_nfe_check_save` reais | Alta (corrigida, não aplicada) |
| A-002 | O modal da conferência não tem `<form>`: `required`/`minlength` do textarea não bloqueiam; o erro vem do servidor e aparece em toast, não na caixa `#nm-err` | Baixa |
| A-003 | A 320 px o toast de erro cobre o título do modal e a opção longa do select fica cortada quando fechado | Baixa |
| A-004 | Demais seções (cadastros, crédito, jurídico, controle, crescimento) exigem login de equipe com MFA: não auditadas na tela | Alta (não avaliado) |

## Depende do Yuri
Branch do Supabase (D-01) e, para auditar as telas logadas, um usuário de equipe de teste **no branch** (nunca em produção).
