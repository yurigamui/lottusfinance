# Nota de construção: Sign 1.4 Perfil e conta
26/11/2026 · Desenvolvedor · **Construída, NÃO verificada.** Nada aplicado em produção; nada commitado por mim (o commit 6d9e6e8 com o trabalho em andamento veio do Maestro).

## O que foi feito
- **Migração** `supabase/migrations/20261126120000_sign_perfil_fonte_unica.sql` (só no Postgres local): `sign_me` sem fallback de metadado + `name_hint`, `cpf_locked`, `profile_complete`; `sign_profile_save` (R5: nome sempre editável 3 a 140 e 2+ palavras; CPF só preenche; igual = no-op; diferente = `cpf_locked`; duplicado = `cpf_in_use`; nunca toca email/phone); `sign_account_save` e `sign_plan_state` lendo/gravando só `profiles`; `_senv_owner_name` de `profiles` (R3). Internas novas sem grant: `_sign_name_norm`, `_sign_cpf_locked`, `_sign_profile_apply`. Revoke de public/anon e grant só a authenticated. Idempotente, reversão no topo (gerar-reversao.sh grava fora do repo).
- **Front** `js/views/perfil.js` (aba Perfil, sem innerHTML, sem style=), ajustes em `shell.js` (remonta por usuário, `updateMe`, `ownMe`, Sair com confirmação), `ui.js` (pageHead só `#/…`, `abasConta`, `confirm` com rótulo, toast ok `role=status`), `router.js` (guarda de formulário sujo, `sessionEnded`, pageshow, hash solto), `api.js` (`profileSave`, `me` com fusão de chamadas e `fresh`, rascunho só em memória, `dropSession`, `classify` novo), `fmt.js` (CPF, máscaras), `construcao.js` (replace), `entrar.js` (B-1), `app.js`, `styles.css` (layout por faixa, M-2, B-2, `.skel`, CLS), `config.js` (`supportEmail` vazio), `_headers` (no-store só nos HTML, CSP intacta). `?v=` global trocado para 20261126a.
- **Pacote 1.0-C2**: A10-MA, A10-MB, M-1, M-2, B-1, B-2, A10-B1, A10-B2, A10-B4.
- **Infra de teste**: `fake-sign.cjs` com modo repasse ao Postgres (porta 54350, pacote `pg` em `testes/package.json`, node_modules não commitado), `drv.cjs` (opção `pg`, `_headers` por caminho), `seed.sql` (U1..U7), `reset.sh [antes|depois|ambos]` (bancos `sign_antes` e `sign`), `gerar-reversao.sh`, `perfil-lib.cjs`.

## Testado (Postgres local 16 + Chromium/Playwright)
| Suíte | Resultado |
| --- | --- |
| t-perfil-db.cjs (AC-B1 a B14) | 119 de 119 |
| t-perfil.cjs (AC1 a AC16, AC-R1 a R9, LCP/CLS) | 149 de 149 |
| t-ac / t-shell / t-layout / t-comp / t-corr | 96 / 183 / 99 / 63 / 45, todos n de n |
| t-regressao (36 capturas, antes 059afb2 x depois) | 35 de 36 idênticas; 1920-3-confirme difere em 45 px, desvio máx 4/765 (antialiasing), não investigado |
| check.mjs | 0 erros |
| smoke.mjs sign | nenhum problema (ver saída no relatório) |

Números: `sign_me` p95 3,4 ms e `sign_profile_save` p95 3,9 ms sequenciais ponta a ponta (100 chamadas, 10 mil perfis); paralelo 10x10 p95 30,3 e 13,3 ms; banco puro p95 2,1 e 2,8 ms. EXPLAIN (ANALYZE, BUFFERS) e p95 em `docs/agente/sign/evidencias-1-4/`. Sem Seq Scan em profiles, sign_identity, sign_envelopes, auth.users. Tela (4G simulado, sem compressão): LCP 1692 ms, CLS 0. JS: perfil.js 4,4 kB gzip; delta total do JS do app +8,4 kB gzip (antes 18,5; agora 26,9), um pouco acima do teto de 8 kB se contado tudo.

## Mudanças nos testes existentes
- t-ac AC18: compara só as linhas de segurança do `_headers` com o último commit (o arquivo ganhou `Cache-Control`); CSP idêntica.
- t-shell: #/conta/perfil agora é a tela real (AC4 usa o botão "Ir para Documentos" por texto; AC23 Tab com 18 passos; títulos "Perfil · Conta · Lottus Sign"; AC28 seletor por texto; teste de erro de `sign_me` usa #/plano, pois o Perfil mostra o erro na própria tela).
- t-comp AC9: toast ok com `role !== 'alert'` (agora `status`).
- `.sidenav-mark` 44 px (AC13 pegou 40 px na 1.0) e `.sg-root{display:flow-root}` (CLS do body).

## NÃO testado
Produção e Supabase real (PostgREST, GoTrue); bfcache real (simulado por `PageTransitionEvent`); `unique(cpf)` e índices de produção (T-08, o esquema local infere); leitor de tela real; Safari/Firefox; modo escuro; compressão em produção; reenvio real de e-mail; troca de usuário por outra aba (só pelo hash do Auth).

## Decisões e dúvidas
1. `cpf_locked` também quando o CPF já está preenchido (E-04). Sem isso AC1 mostraria campo editável que o servidor recusa.
2. `_sign_cpf_locked` (a)/(b) com CPF vazio trava; só passa o CPF igual ao do certificado verificado.
3. CPF 529.982.247-25 do AC-B4 já é de outra conta do seed (unique): o teste usa o CPF livre de U3 com máscara e prova o outro como `cpf_locked`.
4. `sign_account_save` não toca `crm_leads.doc` (só `name`). Sem linha em `profiles` e sem CPF, `invalid_cpf`.
5. Mailto do suporte sem endereço (E-06). Texto LGPD com `[preencher]` visível, como na spec (G7).
6. Rascunho do perfil guardado em memória e devolvido ao mesmo usuário após novo login; apagado em Sair.
7. Em formulário sujo, a navegação desfeita usa `replaceState` (pode duplicar uma entrada do histórico).
8. `pageHead` aceita `{href,label}` também como 3º argumento (a spec escreve assim; o código usava o 4º).
9. Criar índices em tabelas de Partners/Wealth ficou de fora (E-05).
