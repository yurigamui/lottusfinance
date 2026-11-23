# Relatório da plataforma: Lottus Wealth · 23/11/2026

[MAESTRO] Modo Beta, execução autônoma. Ambiente: banco de produção **só em leitura**; testes em Postgres 16 local descartável (`scripts/test-db.sh`). Branch do Supabase recusado (D-01).

## O que existe de fato (B0)
- **Banco:** 12 migrações `wealth_*` aplicadas em produção em 19/11 (os documentos diziam o contrário, ver W-001). 27 tabelas `w_`, todas com RLS ligada, **sem política e sem grant** para `anon`/`authenticated`: o acesso é só por RPC. 87 funções `w_`/`_w_`, todas `SECURITY DEFINER` com `search_path` vazio; as internas (`_w_*`) e as administrativas (`w_admin_*`, `w_billing_*`, `w_*_upsert`, `w_payment_event_apply`) não são executáveis por usuários. A única pública é `w_invite_get` (por token com hash SHA-256).
- **Front (21 páginas) e funções de borda:** fora do repositório (D-02). Nada de tela pôde ser aberto, medido ou verificado.
- **Projeto Supabase separado "Lottus Wealth":** mesmas tabelas `w_`, vazias e sem migrações registradas (W-030).

## O que foi verificado e está certo
- Toda RPC que recebe uma carteira chama `_w_need(carteira, papel)` antes de ler ou gravar, e toda exclusão/edição filtra por `wallet_id` (sem IDOR direto). Grupos usam `_w_group_need` (só o dono).
- Papéis Visualizador < Editor < Gestor aplicados no servidor; carteira arquivada ou com cobrança atrasada fica só leitura (`read_only`).
- Dados (consultas da seção 12 do manual, só contagens): 0 CPF fora do formato, 0 CPF duplicado, 0 perfil órfão, 0 nome divergente entre `w_profiles` e `profiles`, 0 código de banco fora de `w_banks`, 0 e-mail de convite fora do padrão, 0 carteira sem gestor.

## Achados e o que foi feito
| ID | Severidade | Achado | Situação |
| --- | --- | --- | --- |
| W-022 | Alta | `w_spend_update` e `w_rule_save` gravam contraparte/centro/grupo de **outra carteira** | Corrigido por gatilho em `20261123120000_wealth_integridade_e_indices.sql`; verificação: ciclo 1 reprovada, ciclo 2 aprovada com ressalvas; **não aplicado** |
| W-016 | Bloqueante (controle) | `legacy_gl_lines` sem RLS (sem grant, não exposta hoje) | Corrigido em `20261123121000_seguranca_rls_e_helpers_internos.sql`; **não aplicado** |
| W-029 | Alta | Pessoa duplicada em `w_profiles` (nome, CPF, telefone) | Pendente: exige mudar RPCs e front (bloqueado pelo D-02) |
| W-001 | Alta | Documentação diz "não aplicado"; produção diz "aplicado" | Depende do Yuri |
| W-023 | Média | 16 FKs sem índice | Corrigido na migração 1 |
| W-024 | Média | Tabelas financeiras sem `_guard_delete` | Corrigido na migração 1 |
| W-025, W-028, W-030 | Média | `w_audit` sem guarda; custodiante em texto livre; projeto duplicado | Pendências |
| W-026, W-027 | Baixa | Detalhes de `w_bank_delete` e `_w_cadastro_lock` | Pendências |

## O que não foi testado
Todas as 21 telas; as funções de borda; as RPCs reais com os gatilhos novos (o teste usa esquema mínimo); desempenho com volume real; o job `banco-local` no GitHub Actions (push bloqueado, G-04).

## O que depende do Yuri
D-01 (branch), D-02 (trazer o código), W-001 (confirmar a aplicação de 19/11), aplicar as duas migrações depois do branch, W-025 (política de exclusão), W-030 (projeto duplicado) e as pendências jurídicas e de preço já listadas (W-002 a W-015).

## Roteiro de 5 minutos (quando o front estiver no ar)
1. Criar conta e finalizar cadastro. 2. Criar carteira. 3. Importar um extrato de exemplo. 4. Criar uma contraparte e classificar um lançamento. 5. Convidar outro CPF como Visualizador e conferir que ele não edita. 6. Sair.
