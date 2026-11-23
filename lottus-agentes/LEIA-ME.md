# Pacote do Agente Desenvolvedor Lottus

Conteúdo:

- `CLAUDE.md`: o Maestro (sessão principal). Vai na raiz do repositório.
- `.claude/agents/`: os seis subagentes (`idealizador`, `arquiteto`, `designer`, `desenvolvedor`, `verificador`, `auditor-dados`).
- `docs/manual-agente-desenvolvedor.md`: o manual completo.
- `docs/agente/wealth/`: arquivos de controle do Wealth já preenchidos (`STATUS.md`, `DECISOES.md`, `PENDENCIAS.md`, `MAPA-DE-VINCULOS.md`).

## Instalação

1. Copie `CLAUDE.md`, `.claude/` e `docs/` para a **raiz do repositório** onde fica o código da Lottus (a pasta que contém `01 - App`, `02 - Backoffice` e as demais). Se já existir um `CLAUDE.md`, junte o conteúdo.
2. Abra o Claude Code nessa pasta. Digite `/agents` para conferir que os seis agentes aparecem.
3. Para outra plataforma, copie `docs/agente/wealth/` para `docs/agente/<plataforma>/` e zere o painel do `STATUS.md`.

## Primeiro comando (Wealth, modo Beta)

```text
Plataforma: Wealth. Modo: Beta. Leia docs/agente/wealth/STATUS.md e execute a Fase 0 e o B0
(inventário real do 07 - Wealth, da migração 20261119000000_wealth.sql e das funções
wealth-pu e wealth-api). Crie um branch do Supabase para os testes e não aplique nada em produção.
Depois audite a seção 1 (Entrar) com o verificador e o auditor-dados e não corrija nada.
```

## Cuidados

- O isolamento do `verificador` é por instrução e por lista de ferramentas (sem Write nem Edit). Ele ainda tem Bash para rodar testes; por isso o manual manda usar o Bash só para ler e medir.
- Conecte o Supabase do Claude Code a um **branch** ou banco local, nunca ao projeto de produção, enquanto os agentes trabalham.
- Os nomes das ferramentas `mcp__Supabase__...` dependem de como o conector Supabase está registrado no seu Claude Code. Se os nomes forem outros, ajuste a linha `tools:` de cada agente (veja `/mcp` e `/agents`).
- Para ferramentas de navegador (clicar nas telas), adicione os nomes das ferramentas do seu navegador à lista `tools:` do `verificador` e do `designer`.
