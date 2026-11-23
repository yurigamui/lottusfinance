# O que depende do Yuri

Lista consolidada do que o time de agentes não pode ou não deve fazer sozinho. Cada item: o que é, por que, e o passo a passo. Itens novos entram no fim da seção certa, com a data.

## 1. Banco de dados

### D-01 · Autorizar um branch do Supabase para os testes (23/11/2026)
- **O que:** a criação do branch `agentes-autonomo` no projeto *Lottus Finance* foi recusada (o branch tem custo por hora e precisa da sua confirmação).
- **Por quê:** sem branch, nenhuma migração nova foi aplicada nem testada em Postgres real; as auditorias de banco foram feitas só com consultas de leitura.
- **Passo a passo:** Supabase → projeto *Lottus Finance* → **Branches** → *Create branch* (nome `agentes-autonomo`) e confirme o custo. Depois diga "retome": o time aplica as migrações de `supabase/migrations/` só no branch e roda os testes.

### D-02 · Trazer para o repositório o código que não está aqui (23/11/2026)
- **O que:** não estão no repositório: `07 - Wealth` (21 páginas), o app Invest (Expo), o app Business, as funções de borda (`wealth-pu`, `wealth-api`, `pix-charge`, `cession-ack` e as demais) e as migrações aplicadas (`supabase/migrations`).
- **Por quê:** o banco de produção já tem as migrações `wealth_1` a `wealth_12` aplicadas (19/11), mas o front do Wealth e o Invest não podem ser construídos, testados nem verificados sem o código.
- **Passo a passo:** copie as pastas para `apps/wealth/`, `apps/invest/`, `apps/business/` e as funções para `supabase/functions/` (sem `.env` nem chaves). Para as migrações: `supabase link --project-ref <ref>` e `supabase db pull`, revisando antes se algum arquivo contém segredo (por exemplo, tokens em `cron.schedule` ou `vault.create_secret`). O repositório é público: só suba o que pode ficar público.

### D-03 · Aplicar em produção as migrações prontas (quando houver OK)
- Lista e ordem em `supabase/migrations/README.md`. Antes: backup, teste no branch (D-01) e plano de reversão escrito no topo de cada arquivo.

## 2. Segredos e chaves

### S-01 · Chave `anon` legada no histórico do git (baixa)
- **O que:** a pasta `01 - Site`, apagada em 13/10/2026, tinha a chave JWT `anon` legada do projeto *Lottus Finance* em 12 arquivos (commits de 11/08 a 31/08/2026, ex.: `76069bf`, `0f1c36d`). Tipo: chave pública de papel `anon`. **Não há** `service_role`, senha, token ou chave privada no histórico.
- **Por quê:** a chave `anon` é pública por definição e só dá o acesso que a RLS permite; o risco é baixo. Como os fronts já usam a chave publicável nova, dá para desligar as legadas.
- **Passo a passo:** Supabase → *Project Settings* → **API Keys** → *Legacy API keys* → confirme que nenhum app usa a chave legada → *Disable legacy keys*. O histórico não foi reescrito (regra do time).

### S-02 · Ligar a proteção contra senhas vazadas (alerta do Supabase)
- **O que:** o alerta de segurança do Supabase aponta `auth_leaked_password_protection` desligado.
- **Por quê:** impede cadastro e troca de senha com senhas que já vazaram (o manual pede essa proteção ligada).
- **Passo a passo:** Supabase → *Authentication* → *Providers* → *Email* (ou *Attack Protection*) → ligar *Prevent use of leaked passwords*.

## 2b. Banco de produção: divergência e projeto duplicado
- **W-001:** os documentos dizem que a migração do Wealth não foi aplicada, mas o histórico do projeto *Lottus Finance* mostra `wealth_1` a `wealth_12` aplicadas em 19/11. Confirme se foi intencional.
- **W-030:** existe um segundo projeto Supabase, *Lottus Wealth* (us-east-2, criado em 19/11), com as mesmas tabelas `w_` vazias. Decida se ele deve existir; se não, pause-o no painel (o time não apaga nada).

## 2c. Migrações prontas para aplicar (depois do branch, D-01)
1. `20261123120000_wealth_integridade_e_indices.sql` — cadastros da mesma carteira, 16 índices, `_guard_delete` em `w_invoices` e `w_payment_events`. Diagnóstico antes: a consulta do cabeçalho deve dar 0.
2. `20261123121000_seguranca_rls_e_helpers_internos.sql` — RLS em `legacy_gl_lines`, 34 helpers `_` sem `anon`, `search_path` em `news.log_forecast`.
3. `20261123122000_admin_conferencia_manual_nfe.sql` — cria `bo_nfe_manual_check` (o botão da conferência manual da NF-e no Admin hoje sempre falha).
- **Passo a passo:** no branch, `supabase db push` (ou colar cada arquivo no SQL Editor do branch, nesta ordem) e rodar `supabase/tests/*.sql` contra o branch. Depois, backup e o mesmo em produção, com o seu OK.

## 2d. Dados que só você tem (o time não inventa)
- **Site (S-001):** CNPJ, endereço da sede, encarregado de dados (LGPD) e comarca — aparecem como `[preencher]` no rodapé da home, nos Termos e na Privacidade.
- **Site (S-002):** endereços do Instagram, LinkedIn e do app na App Store e no Google Play (hoje apontam para as páginas iniciais genéricas).
- **Site (S-003):** qual versão dos Termos vale (no ar: 1.2 de 28/10; no gerador: 1.0).
- **Sign:** quando `sign.lottusfinance.com.br` estiver no ar, acrescentar `signUrl: 'https://sign.lottusfinance.com.br/'` em `apps/partners/js/config.js` (passo 2 do README do Sign). Até lá, as assinaturas abrem no Partners.

## 2e. Para auditar as telas logadas (Partners, Admin, Wealth)
- Criar, **no branch** (nunca em produção), um usuário de fundo e um da equipe, com MFA, e dados fictícios. Sem isso, as telas depois do login só foram auditadas pelo código e com o Supabase simulado.

## 3. Configurações do GitHub (só o dono altera)

O repositório é **público**. Em *Settings*:

1. **Proteção da main:** *Branches* (ou *Rules → Rulesets*) → *Add rule* para `main` → marcar *Require a pull request before merging* (1 aprovação), *Require status checks to pass* (escolher `Verificação do repositório` e `Varredura de segredos`), *Block force pushes* e *Restrict deletions*.
2. **Dependabot:** *Security → Code security* → ligar *Dependabot alerts* e *Dependabot security updates*.
3. **Secret scanning:** mesma tela → ligar *Secret scanning* e *Push protection* (grátis em repositório público).
4. **Relato privado de vulnerabilidade:** mesma tela → ligar *Private vulnerability reporting* (o `SECURITY.md` aponta para ele).
5. **2FA:** *github.com/settings/security* → *Two-factor authentication* → ativar (app autenticador ou chave de segurança).
6. **Actions:** *Actions → General* → *Workflow permissions* = *Read repository contents*.

### G-01 · Texto pronto para a página do repositório
- **Descrição:** `Ecossistema Lottus: Partners, Sign, Admin, Wealth, Invest, site e API sobre Supabase. Fronts estáticos com CSP estrita e RLS em tudo.`
- **Website:** `https://lottusfinance.com.br`
- **Tópicos:** `fintech`, `supabase`, `postgresql`, `rls`, `static-site`, `cloudflare-pages`, `credito`, `recebiveis`, `investimentos`, `brasil`
- **Imagem social:** *Settings → General → Social preview* → enviar `apps/site/img/logo-rosa.png` sobre fundo creme, 1280×640 px.

### G-02 · Licença
- O repositório não tem `LICENSE` de propósito: sem licença, ninguém tem permissão de reutilizar o código, mesmo sendo público. A escolha (manter sem licença, licença proprietária ou aberta) é sua.

### G-03 · Branch de trabalho
- O trabalho está na branch `agentes-autonomo` (cópia também em `claude/blissful-dijkstra-mw332a`). Nada foi para a `main`. Para levar ao ar: abrir um pull request de `agentes-autonomo` para `main`, revisar e fazer o merge.

## 4. Publicação (hospedagem)

### P-01 · Novas pastas de publicação depois do merge
- **O que:** as plataformas mudaram de pasta (`git mv`, histórico preservado): `02 - Backoffice` → `apps/admin`, `03 - Site` → `apps/site`, `04 - Partners` → `apps/partners`, `05 - Sign` → `apps/sign`, `06 - News` → `apps/news`.
- **Por quê:** a hospedagem aponta para a pasta antiga; depois do merge na `main`, o próximo deploy quebraria.
- **Passo a passo:** em cada projeto do Cloudflare Pages (ou Vercel) → *Settings → Build* → *Root directory* = a pasta nova. Faça isso **antes** do merge.

### P-02 · Cópia do Partners que estava na raiz
- **O que:** a raiz do repositório tinha uma cópia idêntica do Partners (`index.html`, `js/`, `styles.css`, `_headers`...). Ela foi movida para `_revisar/partners-copia-na-raiz/`.
- **Por quê:** se algum projeto de hospedagem publica a raiz do repositório, ele deve passar a apontar para `apps/partners`.
- **Passo a passo:** confira qual pasta o projeto `partners.lottusfinance.com.br` publica; ajuste para `apps/partners`. Depois, autorize apagar `_revisar/partners-copia-na-raiz/`.

### P-03 · Arquivos em `_revisar/` (sem uso aparente)
- `_revisar/admin-js-nao-carregados/` (`charts`, `settings`, `portal`, `dashboard`, `reports`): cópias antigas de arquivos do Partners que o `index.html` do Admin não carrega.
- `_revisar/partners-js-nao-carregados/receipts.js`: o `index.html` do Partners não carrega este arquivo (recebimentos: baixa pelo extrato, ocorrências e recompras). Se era trabalho em andamento, diga para religar.
- **Passo a passo:** responda "pode apagar `_revisar/...`" ou "religue ...".

### G-04 · Acesso de push do Claude ao repositório (23/11/2026) — RESOLVIDO
- **Atualização:** o push voltou a funcionar mais tarde na mesma sessão; a branch `agentes-autonomo` está no GitHub.
- **O que:** o `git push` da branch `agentes-autonomo` voltou **403** ("Claude doesn't have GitHub access to yurigamui/lottusfinance").
- **Por quê:** os commits ficam só no contêiner desta sessão, que é apagado por inatividade. Sem o push, o trabalho se perde.
- **Passo a passo:** reconecte o GitHub em https://claude.ai/connect-github e instale o Claude GitHub App no repositório (https://github.com/apps/claude/installations/select_target). Depois diga "retome" nesta mesma sessão: o primeiro passo é `git push -u origin agentes-autonomo`.
