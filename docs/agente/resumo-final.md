# Resumo final do time autônomo · 23/11/2026

Branch `agentes-autonomo` no GitHub (cópia em `claude/blissful-dijkstra-mw332a`). Nada foi para a `main`. **Nada foi escrito no banco de produção:** só consultas de leitura. As 3 migrações estão prontas, testadas em Postgres 16 local e **não aplicadas**.

## Estado de cada plataforma

| Plataforma | Estado | O que foi feito | O que trava o resto |
| --- | --- | --- | --- |
| Repositório | Concluído | Estrutura `apps/`, `docs/`, `scripts/`, `supabase/`; varredura de segredos (nada grave); CSP estrita em todos os fronts; CI gratuito; README com Mermaid; modelos e políticas | Configurações do GitHub e da hospedagem (só você) |
| Wealth | Banco auditado; telas bloqueadas | RLS/RPCs conferidas; IDOR de referência entre carteiras corrigido; 16 índices; `_guard_delete`; 13 testes | Front `07 - Wealth` fora do repo (D-02); branch (D-01); W-001 |
| Partners | Beta parcial | 192 RPCs conferidas; 6 pontos de injeção de HTML corrigidos (inclui a confirmação do Pix) | Telas logadas e lista pré-MVP (P-001, P-002) |
| Sign | Beta parcial, sem achados nas páginas públicas | 3 páginas verificadas em 7 larguras | Portal logado fora do repo; `signUrl` |
| Admin | Beta parcial | 89 RPCs conferidas; a que faltava (`bo_nfe_manual_check`) criada | Telas logadas (usuário de equipe no branch) |
| Invest | Bloqueado | Banco conferido: convite não revela oferta, taxa ou valor | App Expo fora do repo (D-02) |
| Site e News | Beta, com pendências de conteúdo | CSP estrita, scripts fora do HTML, 8 páginas sem corte de 320 a 1920 px | `[preencher]` (CNPJ etc.), links de redes e lojas, versão dos Termos |
| API | Parcial | 23 funções inventariadas; 3 lidas e corretas | 19 funções sem JWT não avaliadas: código fora do repo |

Verificações independentes (subagente Verificador, sem ver o raciocínio do desenvolvedor): 5 seções, todas **aprovadas com ressalvas**; 3 delas reprovadas no 1º ciclo e corrigidas. Nenhuma chegou a 3 reprovações.

## Principais decisões tomadas sozinho (para contestar)
1. Estrutura `apps/<plataforma>` com nomes curtos em inglês e arquivos de controle em minúsculas (`status.md`, `pendencias.md`).
2. Nada apagado: arquivos sem uso (cópia do Partners na raiz, 6 JS não carregados) foram para `_revisar/`.
3. Correção do IDOR do Wealth por **gatilho** no banco, sem reescrever as RPCs; no UPDATE só valida a coluna que mudou.
4. Não proteger `w_audit` com `_guard_delete` até a política de exclusão (LGPD) ser decidida.
5. Não fixar `search_path` em duas funções SQL puras (perderiam o inlining: 19,8 ms → 304 ms medido).
6. XSS do Partners corrigido chamada a chamada, sem mudar o componente `B.modal` (P-004).
7. Testes de banco em Postgres local com esquema mínimo, já que o branch do Supabase foi recusado duas vezes pelo conector.
8. Não rodar os geradores do site (`build.py`, `legal.py`): estão atrás do HTML publicado.
9. Mantive os "limites que nunca se cruzam" mesmo depois da autorização ampla, porque ela não os revogou explicitamente.

## O que depende de você (consolidado; passo a passo em `depende-de-mim.md`)
**Antes do merge na main**
- P-01: apontar cada projeto de hospedagem para a pasta nova (`apps/admin`, `apps/partners`, `apps/sign`, `apps/site`, `apps/news`); P-02: conferir se algum publica a raiz.
- G-03: abrir o pull request `agentes-autonomo` → `main` e revisar.

**Banco**
- D-01: criar o branch do Supabase (custo por hora) para testar as 3 migrações contra o esquema real.
- D-03: aplicar as migrações em produção, com backup, depois do branch.
- W-001: confirmar se o Wealth aplicado em produção em 19/11 foi intencional; W-030: decidir sobre o projeto duplicado *Lottus Wealth*.
- S-02: ligar a proteção contra senhas vazadas.

**Código que falta no repositório (D-02)**
- `07 - Wealth`, app Invest, app Business, `supabase/functions/` (sem segredos), lista de bloqueios pré-MVP do Partners (P-001).

**Conteúdo e jurídico**
- CNPJ, endereço, encarregado de dados e comarca (S-001); endereços das redes e das lojas (S-002); versão vigente dos Termos (S-003); pendências jurídicas do Wealth (W-007, W-008, W-021).

**GitHub**
- Proteção da `main`, Dependabot, secret scanning, relato privado de vulnerabilidade, 2FA, permissões do Actions; descrição, tópicos e imagem social (G-01); licença (G-02).
- S-01: desligar as chaves JWT legadas do Supabase (a `anon` legada está no histórico; é pública, risco baixo).

**Para continuar a auditoria das telas logadas**
- Usuários de teste (fundo e equipe, com MFA) **no branch**, com dados fictícios (2e).

Quando qualquer item acima for resolvido, diga "retome": o próximo passo exato está em `progresso.md`.
