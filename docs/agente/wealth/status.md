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
