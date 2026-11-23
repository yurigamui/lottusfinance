# Relatório da plataforma: Lottus Wealth · 23/11/2026

[MAESTRO] Modo Beta. Banco de produção **só em leitura**. Front (`apps/wealth`, enviado pelo Yuri em 23/11) testado no navegador contra **as funções reais do banco** num Postgres local, com um Supabase falso (`scripts/wealth-local`). Verificação por um subagente independente (Verificador), que não recebeu o raciocínio do desenvolvedor.

## 1. O que existe (B0)
- **Front:** 24 rotas (21 seções do controle + convite, nova senha e grupo), 12 arquivos JS sem build, CSP estrita, sem script inline. As 63 RPCs que a tela chama existem no banco e batem com os nomes de parâmetro.
- **Banco:** 12 migrações `wealth_*` aplicadas em produção em 19/11 (os documentos diziam o contrário, W-001). 27 tabelas `w_` com RLS ligada, sem política e sem grant: acesso só por RPC. 79 RPCs `w_`, todas `SECURITY DEFINER` com `search_path` vazio; toda RPC com carteira confere o acesso (`_w_need`) e filtra por carteira.
- **Mapa de vínculos:** `mapa-de-vinculos.md`. Nenhuma seção sem saída (menu lateral e do avatar em toda tela logada). O README citava duas rotas que não existem; corrigido.

## 2. Verificado e certo (com evidência no navegador e no banco)
- **Entrada:** login com erro em PT-BR; cadastro valida senha e aceite; CPF inválido recusado; sair limpa a sessão; link profundo sem sessão volta à tela pedida depois do login (corrigido).
- **Alçadas e privacidade:** visualizador sem nenhum botão de escrita em 12 telas; editor sem acessos e configurações; quem não é membro volta a Minhas carteiras; e-mail e CPF dos outros só para gestores, CPF mascarado; titular não deixa de ser gestor.
- **Patrimônio:** conta conferida contra SQL independente (R$ 762.327,65 = investimentos + contas + bens − dívidas). HTML em nomes vira texto; R$ 999.999.999,99 inteiro; negativo recusado.
- **Investimentos e Gastos:** clique duplo não duplica; importar CSV e OFX; reimportar não duplica; regras classificam; excluir conta com lançamentos é barrado com explicação.
- **Conta e white-label:** 2FA recusa código errado e passa a ser pedido no login; troca de senha; chave de API mostrada uma vez, só o hash guardado; dados de cobrança validam CPF e CEP.
- **Responsividade:** 16 telas logadas × 320, 390, 768 e 1440 px e 10 modais em 390 px sem rolagem horizontal nem corte. Sem erro de JS nem violação de CSP.

## 3. Achados e correções
| ID | Severidade | Achado | Situação |
| --- | --- | --- | --- |
| WE-04 | Alta | O calendário abria por cima do botão Salvar; o clique trocava a data e não salvava | Corrigido (abre só pelo ícone; digitar fecha); portado ao Partners |
| A2 | Alta | Data impossível ou incompleta era salva como **hoje**, com "Salvo" | Corrigido (recusada com "Data inválida" ao lado do campo, em todos os formulários) |
| WE-06 | Alta | Venda maior que a posição era aceita (posição −390, patrimônio errado) | Corrigido no banco (`20261123123000`, gatilho adiado; não aplicada) |
| WE-07 | Alta | Filtro "Ativo" listava 30 ativos do catálogo global, não os da carteira | Corrigido (`w_tx_assets`, `20261123124000`; não aplicada) |
| W-022 | Alta | Lançamento/regra aceitava cadastro de outra carteira | Corrigido no banco (`20261123120000`; não aplicada); mensagem na tela comprovada |
| Própria | Alta | A primeira versão do gatilho da posição rodava no commit como `authenticated` e bloquearia toda compra em produção | Pego pelo ambiente local antes de sair; corrigido (`SECURITY DEFINER`) e coberto na CI |
| WE-01, M1 | Média | Erros sem mensagem viravam "Algo deu errado" | Corrigido |
| WE-02 | Média | Depois do login não voltava à tela pedida | Corrigido |
| WE-08 | Média | Rótulos de filtros não ligados aos campos; botões de página sem nome | Corrigido |
| M2 | Média | Confirmação dos dados de cobrança sumia na hora | Corrigido |
| M4 | Média | Tabelas no celular rolam de lado sem indicação | Sombra nas bordas indicando rolagem |
| Diversos | Baixa | "Novo dívida", e-mail capitalizado, texto de cobrança contraditório, "1 ignoradas", confirmação aberta após recusa, alçada do titular habilitada, erro antigo no cadastro | Corrigidos |

Ciclos de verificação: 5. Reprovações e correções: ciclo 1 (calendário cobrindo o Salvar; data inválida salva como hoje), ciclo 2 (calendário aberto pelo ícone ainda cobria), ciclo 3 (calendário de período fora da tela no celular), ciclo 4 (fórmula de planilha no CSV, alto, segurança). **Ciclo 5: todas as partes aprovadas, sem bloqueante nem alto aberto.** Painel em `status.md`.

Achados dos ciclos 3–5 também corrigidos: R1 calendário de período no celular (folha na parte de baixo), X1 CSV neutraliza fórmulas, X2 vírgula decimal, X4 logo só https, V1 calendário fecha ao navegar, X5 aspas preservadas na importação. O componente de data corrigido foi levado também ao Partners.

## 4. Pendências por severidade (detalhe em `pendencias.md`)
- **Alta (dependem do Yuri):** W-031 cobrança fixa por carteira × decisão de AuM; W-032 e W-007 termos e privacidade do Wealth (o aceite não tem texto); W-008 DPA/LGPD; W-001 aplicação de 19/11; W-029 pessoa duplicada em `w_profiles`.
- **Média:** M5/W-039 grupos anunciados no Pro, mas o banco exige Fund; W-038 busca de ativos sem índice de trigramas (medir no branch); W-033 pagamento sem gateway; W-025, W-028, W-030.
- **Média (código):** W-041 troca de senha sem pedir a atual; M4 tabelas no celular rolam de lado (com indicação).
- **Baixa:** W-040 erros da cobrança só em aviso flutuante; W-042 Tipo e casas decimais no CSV; W-036 impressão de PDF; W-037 inatividade.

## 5. O que não foi testado
Supabase real (e-mails de confirmação, convite e recuperação; MFA de verdade; desempenho com o volume real, ~35 mil ativos e 54 mil preços); função de borda `wealth-pu`/`wealth-api`; contraste AA medido, zoom de 200%, leitor de tela e aparelhos reais; impressão de PDF; 1.000+ lançamentos.

## 6. Ambiente de teste (para repetir)
`scripts/wealth-local/README.md`. O esquema é exportado só em leitura com a consulta abaixo (tabelas `w_*` e funções `w_*`, `_w_*`, `_sha256`, `_email_html`, `_html_escape`, `_send_email`) e fica **fora** do repositório:

```sql
-- gera o DDL das tabelas w_ (colunas, restrições, índices, RLS) e o código das funções; ver histórico desta sessão
select pg_get_functiondef(p.oid) from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and (p.proname like 'w\_%' or p.proname like '\_w\_%' or p.proname in ('_sha256','_email_html','_html_escape','_send_email'));
```

## 7. Depende do Yuri
D-01 (branch) e D-03 (aplicar `supabase/migrations/20261123*` na ordem: 120000, 121000, 122000, 123000, 124000); W-001; W-031 (preço); W-032/W-007/W-008 (jurídico); M5/W-039 (grupos no Pro ou só no Fund); publicar `apps/wealth` em `wealth.lottusfinance.com.br` e configurar o Auth (passos 3 e 4 do README do Wealth).

## 8. Roteiro de 5 minutos (depois de publicar)
1. Criar conta, confirmar o e-mail e finalizar o cadastro. 2. Criar a carteira. 3. Importar um extrato (OFX ou CSV). 4. Lançar uma compra e tentar vender mais do que tem (deve recusar). 5. Convidar outro CPF como Visualizador, entrar com ele e conferir que não há botões de edição. 6. Sair.
