# STATUS: Lottus Wealth · atualizado em 23/11/2026

Modo: **Beta** · Fase atual: **6 concluída no ambiente local; 7 (release) depende do Yuri** · Parte atual: nenhuma · Seção atual: nenhuma

Leitura adotada (execução autônoma, 23/11): o front `07 - Wealth` e as funções de borda **não estão no repositório**, então B0 e B1 ficaram limitados ao banco. O banco de produção **já tem** as migrações `wealth_1` a `wealth_12` aplicadas (19/11) e 27 tabelas `w_`; a auditoria foi feita só com consultas de leitura. Correções saíram como migrações prontas, testadas em Postgres local, não aplicadas.

## Painel

Front verificado em 23/11 no navegador contra as funções reais do banco (Postgres local + Supabase falso, `scripts/wealth-local`), por verificador independente, em 5 ciclos. **Nenhum achado bloqueante ou alto aberto.**

| Parte | Seções | Veredito final | Ciclos | Ressalvas |
| --- | --- | --- | --- | --- |
| Entrada | 1 Entrar · 2 Criar conta · 3 Finalizar · convite · recuperar/nova senha | Aprovada | 2 | — |
| Carteiras, Acessos e Configurações | 4 Minhas carteiras · 5 Nova carteira · 17 Acessos · 18 Configurações | Aprovada com ressalvas | 5 | M4 tabelas no celular (sombra de rolagem), W-039 Grupos Pro×Fund, W-040 erros da cobrança em aviso |
| Patrimônio | 6 Patrimônio · 21 Bens e dívidas | Aprovada com ressalvas | 3 (reprovada 2×: calendário cobria o Salvar; data inválida virava hoje) | — |
| Investimentos | Visão geral · 7 Posição · 8 Transações · 9 Importar arquivo · 10 Ativos personalizados · 11 Detalhe do ativo | Aprovada | 4 (reprovada 1×: calendário de período fora da tela no celular) | — |
| Gastos | 12 Visão geral · 13 Transações · 14 Importar extrato · 15 Cadastros e regras | Aprovada | 4 (idem) | — |
| Relatórios | 16 Relatórios | Aprovada com ressalvas | 2 (reprovada 1×: fórmula no CSV) | W-042 Tipo e casas do CSV |
| Conta e plano | 19 Conta e plano | Aprovada com ressalvas | 1 | W-041 troca de senha sem a senha atual |
| White-label e grupos | 20 White-label · Grupos | Aprovada | 1 | — |
| Banco | migrações 120000, 121000, 123000, 124000 | Aprovadas com ressalvas | 2–3 cada | não aplicadas (D-01, D-03) |

## Próximo passo

1. Yuri: W-031 (preço), W-039 (Grupos no Pro ou no Fund), W-032/W-007/W-008 (termos e LGPD) e W-001.
2. Com o branch (D-01): aplicar `supabase/migrations/20261123120000…124000` no branch, rodar `scripts/test-db.sh` e repetir `scripts/wealth-local/testes/*` apontando para o branch; medir `w_asset_search` com ~35 mil ativos (W-038).
3. Publicar `apps/wealth` (README do Wealth, passos 3 e 4) e rodar o roteiro de 5 minutos do `relatorio.md`.
4. Próxima rodada de polimento: W-040, W-041, W-042, M4 (tabelas em cartões no celular).

## Bloqueios que dependem do Yuri

- Revisão jurídica: LGPD, guarda de dados, DPA, termos de uso e privacidade.
- Termos da B3 para o COTAHIST e formato de exportação da B3.
- Acesso ao Open Finance sem ser instituição autorizada.
- Validar faixas de AuM, mensalidade mínima e carência; decidir Grátis com 1 ou 3 carteiras.
- Confirmar `ENABLE ROW LEVEL SECURITY` em `public.legacy_gl_lines`.

## Últimas decisões

Ver `decisoes.md` (documento `claude/wealth-decisoes.md`).

## Wealth v2 (23/11/2026)
Seções S1–S6 **aprovadas com ressalvas** em 2 ciclos do verificador (ciclo 1 reprovou: 1 bloqueante de segurança e 4 altos, todos corrigidos). S7 (preços) e S8 (cobrança) **não verificadas em execução** (sem Deno, rede e credenciais). Especificação: `v2-especificacao.md`. Migração `20261123125000` (não aplicada); testes `scripts/wealth-local/testes/v2.sql` (55 verificações). Próximo: v3 (`v3-plano.md`).

## Wealth v3 (23–24/11/2026)
T1–T7 **aprovadas** (T2, T3, T6/T7 com ressalvas) em 4 ciclos do verificador + 1 reverificação da busca (regra 14). Ciclos 1–3 reprovaram (7 altos no 1º, 2 no 2º, 1 no 3º), todos corrigidos. T2 (robô de preços) só revisado no código: não roda aqui (sem Deno e sem rede). Migração `20261123130000` (não aplicada); testes `scripts/wealth-local/testes/v3.sql` (65) e `v2.sql` (55). Plano e critérios: `v3-plano.md`. Pendências W-052 a W-061.
**Próximo passo exato:** com o OK do Yuri e o branch (D-01): aplicar `20261123125000` e `20261123130000` no branch, rodar `testes/v2.sql` e `testes/v3.sql`, publicar `wealth-pu`, `wealth-billing` e `wealth-api` no branch e conferir os preços reais (Tesouro, CVM, B3, Mercado Bitcoin); depois produção e `apps/wealth`.

## Trio (Pix Automático) e ANBIMA (24/11/2026)
Adaptador da Trio reescrito conforme a documentação V2 (docs.trio.com.br) e ANBIMA conferida com developers.anbima.com.br; tela "Gerar código do Pix Automático". **Aprovada com ressalvas** no 3º ciclo do verificador (ciclo 1: autorização perdida com vários códigos; ciclo 2: duas declarações presas em comentário — `check.mjs` agora acusa isso). Sem teste contra os provedores (sem credenciais). Branch do Supabase recusado: exige plano Pro (D-01b). Próximo passo: credenciais de sandbox da Trio e da ANBIMA (W-v2-01, W-v2-02) e decisão sobre o plano Pro.

## Produção (24/11/2026, com OK explícito do Yuri)
Aplicadas em produção, nesta ordem, as migrações 20261123120000, 121000, 122000, 123000, 124000, 125000 e 130000 (o front da v3 já estava publicado e recebia 404 em `w_networth`). Antes: checagens de leitura (0 lançamentos/regras inconsistentes, 0 posições negativas, 0 faturas, nenhum conflito de rotina agendada, nenhuma outra função chamando as assinaturas trocadas). Depois: as RPCs das telas responderam como o titular (série diária com 366 pontos, 20 posições, 90 ativos com "faltam dados" na carteira com histórico) e os alertas de segurança do Supabase não trouxeram nada novo (RLS sem política = acesso só por RPC; `_w_norm` sem search_path = decisão registrada; senha vazada = S-02).
**Ainda não publicadas:** as funções de borda novas (`wealth-pu`, `wealth-billing`, `wealth-api`); em produção seguem as versões antigas. Observação: a carteira com as 399 transações está **arquivada**; a carteira ativa do titular está vazia.

## Wealth v4 (24/11/2026) — construída, ainda não verificada pelo `verificador`
**Banco:** migração `20261124120000` (não aplicada em produção): renda fixa com P.U. diário pela curva (CDI/PRE/IPCA, âncora na 1ª compra), atualização dos índices do BCB por `pg_net` + `pg_cron`, `w_positions` com TWR/P&L/período, `w_liquidity` (vencimentos), `w_wallets_archived`/`w_wallet_unarchive`, importação de extrato com contraparte/centro de custo/grupo, fim do conceito de "titular da cobrança" (criador = Titular, sem transferência). Testes: `testes/v4.sql` (30), `v3.sql` (66), `v2.sql` (55) passam.
**Front (`apps/wealth`, versão `v4a`):** KPIs sem quebra e sem textos explicativos; Patrimônio com tabela de vencimentos/liquidez e botão Relatórios (janela com marca do grupo no PDF); menu sem Acessos/Relatórios no Patrimônio (Acessos dentro de Configurações); Posição hierárquica estilo Gorila (classe → subclasse → ativo, TWR, P&L, custodiante, % do portfólio, ordenar, expandir/recolher, período por calendário); arrastar no gráfico mostra o desempenho só do trecho; máscaras de quantidade/P.U./taxa; "Valor total da transação" ao vivo; nomes em uma linha; carteiras arquivadas com "Desarquivar"; importação de extrato com colunas de contraparte/centro de custo/grupo; tela de assinatura enxuta. Teste de navegador `testes/t-v4.cjs` (1280 e 390 px, sem erros de console nem rolagem horizontal).
**Próximo passo exato:** chamar o `verificador` nas seções v4; com o OK do Yuri, aplicar `20261124120000` em produção, publicar `wealth-pu`/`wealth-billing`/`wealth-api` e só então publicar o front `v4a`. O Yuri precisa editar os CDBs ("% do CDI") para que sejam valorizados.

## Wealth v4 — Dashboard do Patrimônio (24/11/2026)
Página Patrimônio refeita como dashboard (modelo Gorila): rentabilidade × CDI (arrastável), alocação por classe, evolução patrimonial, resumo por período (rentabilidade, retorno, CDI, volatilidade, Sharpe), resultado mês a mês, eventos, volatilidade móvel, drawdown, liquidez e custodiantes. Calculado no navegador a partir da série diária `w_dashboard_series` (migração `20261124140000`, não aplicada). Verificação da v4 anterior: **aprovada com ressalvas** (sem bloqueantes; ressalvas: nomes em celular, toque no gráfico não testado em aparelho, `w_equity` no limite de 300 ms = W-065). O dashboard ainda precisa de verificação independente.

## Produção — v4 (24/11/2026, com OK explícito do Yuri)
Aplicadas em produção `20261124120000` (posição/TWR, liquidez, arquivadas, titular, importação com classificação, P.U. diário da renda fixa, índices do BCB por pg_net + 3 rotinas pg_cron `wealth-indices-fetch/ingest/rf-reprice` às 10h e 21h UTC) e `20261124140000` (série diária do dashboard). Conferido: todas as funções com `security definer` + `search_path` vazio; internas sem execute para `anon`/`authenticated`; as de tela só `authenticated`; 3 rotinas novas ativas; os alertas do Supabase não trouxeram nada novo (só os 5 antigos já registrados).
**Verificação independente:** v4 e dashboard aprovados com ressalvas (3 ciclos do `verificador`).
**Falta (depende do Yuri):** publicar o front `apps/wealth` (versão `v4a`); editar os CDBs ("% do CDI") para valorizá-los; o CDI em produção está parado em 19/11 até a primeira rodada do cron; funções de borda `wealth-pu`, `wealth-billing`, `wealth-api` seguem NÃO publicadas (aguardam OK e credenciais Trio/ANBIMA/Asaas).

## Wealth v4.1 (25/11/2026) — pedidos do Yuri sobre o dashboard
1. Balão da seleção no gráfico cortado na borda: agora fica dentro do gráfico, com o "×" visível, e o texto do eixo não é selecionado ao arrastar.
2. "Explosão de rentabilidade" na carteira do Geraldo (causa confirmada em leitura na produção): ações/fundos comprados antes de existir histórico de preço (ex.: AMBEV comprada a 7,43 em 12/01; 1ª cotação em 18/11 a 16,07) valiam o preço pago até a 1ª cotação e pulavam no dia dela. Migração `20261125100000` (**não aplicada em produção**): entre a última operação e a 1ª cotação o preço é interpolado (`w_equity_range` e `w_dashboard_series`). Teste `v5.sql`. A solução definitiva é o histórico real de preços (backfill pela função `wealth-pu`, pendente de OK/publicação). Ativos personalizados sem taxa ("outro", ex.: LCI/LCA importadas) seguem sem valorização até o Yuri informar a taxa (W-067).
3. Estrutura: **Investimentos > Visão geral** é o dashboard estilo Gorila; **Patrimônio** virou a visão geral das duas partes (patrimônio líquido, evolução total/por parte, composição, resumo de Investimentos e de Gastos com atalhos, liquidez do patrimônio).

## Wealth v4.2 (25/11/2026) — renda fixa importada pelo nome
Pedido do Yuri: títulos importados (ex.: "LCI-CDI ITAU 92,00 01/2031") passam a ser **Renda Fixa**, com a rentabilidade acrescida sozinha. Migração `20261125110000` (**não aplicada em produção**): `_w_parse_rf` lê indexador (CDI/DI, IPCA, pré), taxa e vencimento (mês/ano → último dia do mês, estimativa editável) do nome; `w_tx_import` cria o ativo já como renda fixa e calcula a curva. Migração de **dados** `20261125111000` (só com OK do Yuri): converte os ativos já importados como "outro" (em produção: 18 candidatos na carteira do Geraldo; os outros 2, CFF Itaúba e Kinea PE, não são títulos e ficam). Testes `v6.sql` (16); v2–v6 passam. Vencimento só por mês/ano: dia exato precisa ser conferido no extrato.

## Produção — v4.1 e v4.2 (25/11/2026, com OK explícito do Yuri)
Aplicadas: `20261125100000` (série sem salto na 1ª cotação), `20261125110000` (importação de renda fixa pelo nome; `_w_parse_rf` fechado ao navegador) e, como dados, `20261125111000`: 17 títulos da carteira do Geraldo (LCI/LCA/CDB/LCD/LIG) convertidos de "outro" para Renda Fixa (IPCA ou % do CDI, vencimento = último dia do mês), todos com curva calculada até 25/11 (a carteira passou a ter 19 pós-fixados no CDI e 2 IPCA+). Ficaram como estão: CFF Itaúba e Kinea PE (não são títulos). O CDI de produção já está atualizado até 24/11 (a rotina do banco rodou). Permissões conferidas (anon sem execute; parser sem execute para authenticated). Verificação independente: aprovada.
Pendente: o dia exato do vencimento (só mês/ano no nome) e o histórico real de preços das ações/fundos (função `wealth-pu`, aguardando OK).

## Produção — função de borda wealth-pu v5 (25/11/2026, com OK do Yuri)
Publicada `wealth-pu` (versão 5, `verify_jwt` desligado como antes: ela mesma exige o segredo do cron). Inclui cripto (Mercado Bitcoin), ANBIMA (só liga com credenciais; hoje "sem credenciais"), histórico B3/CVM e a ação `pu_at`. A curva da renda fixa passou a ser só do banco; a função preenche o preço a mercado de pré e IPCA+ (revisão independente: pode publicar). **Não testada em execução** (sem Deno aqui): o primeiro resultado real vem da rodada do cron (21:30 UTC, dias úteis); conferir o `log` e a tabela de preços. O histórico de ações e fundos é preenchido aos poucos (B3: 3 meses por execução; CVM: 4) — a carteira do Geraldo (AMBEV desde janeiro) fecha em cerca de 4 rodadas. Publicar `wealth-billing` e `wealth-api` continua dependendo de OK e de credenciais.

## Correção de layout (26/11/2026)
Na tela Patrimônio publicada, os cartões "Investimentos" e "Gastos" ficavam espremidos em colunas estreitas: faltava a classe de grade `span-6` no CSS (só existiam 4, 5, 7, 8 e 12). Corrigido, e as legendas da rosca não quebram mais palavra nem número. Conferido em 1280 e 390 px (cartões com 538 px e 342 px). Versão dos arquivos `v4b`.

## Wealth v4.3 (27/11/2026) — pedidos do Yuri
1. **Rentabilidade sobre o patrimônio investido no dia:** o retorno diário passou a ser (valor do dia + proventos) ÷ (saldo do dia anterior + aporte do dia). Antes, o aporte grande de um dia contra um saldo pequeno virava "perda" (ex.: carteira do Yuri em 01/08/2025: Tesouro comprado a 811,32 contra cotação 805,91 sobre saldo de R$ 58 = −7,44%; agora o pior dia da carteira é −3,4%, causado por Bitcoin sem histórico de cotação, valorizado pelo último preço negociado).
2. Período no cabeçalho, ao lado de Relatórios (Investimentos e Patrimônio), em estilo de botão.
3. Relatórios: janela nova (3 cartões, PDF e planilha para cada um) e PDFs no estilo da marca (cabeçalho, cartões de resumo, tabelas com cabeçalho repetido, total, rodapé). Posição, transações e gastos.
4. Sempre na curva: removidos o seletor "A mercado", a opção em Configurações e o P.U. a mercado do ativo (o cálculo continua no banco).
5. Conta do Yuri como Fund: ver pendência com o Yuri (cobrança).
