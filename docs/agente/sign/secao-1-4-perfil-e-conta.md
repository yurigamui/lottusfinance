# Seção: Sign / Parte 1 / 1.4 Perfil e conta

Autor: [IDEALIZADOR] · 26/11/2026 · Status: proposta, não verificada, nada aplicado. Arquivo de destino: docs/agente/sign/secao-1-4-perfil-e-conta.md. Rota: `#/conta/perfil` (aba Perfil, dentro do shell da 1.0).
Leituras feitas: parte-1-design (2.4), parte-1-arquitetura (P1-05, R3, R5, T-02), pendencias, verificacao-1-0-ciclo-1, shell.js, construcao.js, api.js, funções `sign_me`, `sign_profile_save`, `sign_account_save`, `sign_plan_state`, `_senv_owner_name` e tabelas `sign_envelopes`/`sign_identity` no esquema. Não li integralmente, nesta passada, app.js, router.js, ui.js, styles.css, ux-alinhamento.md, parte-1-conta-e-identidade.md (só trechos) nem os arquivos de `scripts/sign-local/testes`; o desenvolvedor deve conferir os pontos marcados "(conferir)". `profiles` não está definida no dump do esquema; no prelude local ela é reconstruída com `cpf text unique` marcado como inferido. Isso é a pendência T-08 e vira a verificação 0 da migração.

## Objetivo e papéis com acesso
Quem está logado vê e corrige seus dados de pessoa (nome completo, CPF), vê e-mail, contato e nível de assinatura, e entende o que fazer para trocar o que não pode editar. Papel: só o próprio usuário autenticado com e-mail confirmado (`sign_me` exige). Não há acesso a dados de outra pessoa. Sem sessão: redireciona a `#/entrar` com replace e guarda o destino. Fora do escopo: edição de celular e verificação (1.5), senha/MFA (1.6), plano (Parte 5), onboarding (1.3), tipo PJ (P1-06, só pessoa física na v1), troca de e-mail.

## Entradas e saídas
| Elemento | Destino ou efeito | Condição |
| --- | --- | --- |
| Menu "Conta", item "Conta" do avatar, redirecionamento pós-login futuro | `#/conta/perfil` | sessão válida |
| Abas "Verificação" e "Segurança" | `#/conta/verificacao`, `#/conta/seguranca` (telas provisórias até 1.5/1.6, com saída) | sempre |
| Link "Verificar contato" (no cartão Contato) | `#/conta/verificacao` | sempre |
| Botão "Salvar alterações" | RPC `sign_profile_save`, depois atualiza cache de `sign_me` e o cabeçalho do shell | há mudança e campos válidos |
| "Falar com o suporte" | `mailto:` do suporte [preencher: e-mail de suporte, Yuri] | CPF bloqueado |
| "Termos e Política" / pedido de exclusão | [preencher: Jurídico/DPO, J-02, P1-10], sem link até existir | sempre texto |
| Sair da tela com mudanças | confirmação "Descartar alterações?" | formulário sujo |
Saídas obrigatórias (sem beco): abas, menu do shell, "Ir para Documentos".

## Elementos e comportamento
| Elemento | Tipo | Comportamento | Validação |
| --- | --- | --- | --- |
| Título `h1` "Conta" + `pageHead` + abas | cabeçalho | foco inicial no `h1` (`focusH1`) ao entrar; aba Perfil com `aria-current="page"` | n/a |
| Selo de nível (Simples/Avançada/Qualificada) | `.tag`, texto + ícone (nunca só cor) | `levelOf(me)` (shell.js): certificado válido e não vencido = Qualificada; `verified` = Avançada; senão Simples. Mesma função do cabeçalho; não duplicar regra | derivado, não editável |
| Nome completo | `input type=text`, `autocomplete="name"`, `maxlength=140` | editável. Rótulo visível, erro abaixo, `aria-describedby` | trim; colapsa espaços; 3 a 140 caracteres; pelo menos 2 palavras (regra atual do servidor `invalid_name`, alinhar a `fmt.js nameOk`, conferir) |
| CPF | `input inputmode=numeric`, máscara só visual, `autocomplete="off"` | Se `sign_me.cpf_locked=false`: editável. Se `true`: campo `disabled`, valor mascarado (`•••.456.789-••`, só os 6 dígitos do meio), texto de apoio "Para alterar o CPF, fale com o suporte." com link. Campo vazio e destravado: pode preencher | só dígitos; 11 dígitos; dígito verificador (cliente confere para UX; o servidor é a autoridade); único |
| E-mail | texto somente leitura + selo "Confirmado" | sem edição; apoio "Para trocar o e-mail, fale com o suporte." | n/a |
| Celular | texto somente leitura mascarado (`(11) •••••-1234`) + selo "Verificado"/"Não verificado" + link "Verificar contato" | sem edição aqui (1.5). Sem celular: "Não informado" | n/a |
| Salvar alterações | `button.btn` | desligado (`disabled`, `aria-disabled`) sem mudança; ao enviar fica `aria-busy` e bloqueia duplo clique | n/a |
| Cartão "Seus dados e a LGPD" | texto informativo | só texto com [preencher: J/DPO]; nenhum botão que exclua nada | n/a |
| Aviso de sessão | banner | ver Estados | n/a |

### Regra de escrita segura em `profiles` (R5), hipótese do Idealizador, confirmar com Yuri
1. Nome: sempre editável (P1-05), 3 a 140 caracteres. Só altera `full_name` do próprio `auth.uid()`; nunca toca `email`, `phone` ou `cpf` da linha.
2. CPF vazio em `profiles`: grava o validado. CPF já preenchido e igual: não muda nada (sem erro). CPF já preenchido e diferente: recusa com `cpf_locked`, mesmo que o usuário não tenha enviado envelope (isso protege Partners e Wealth e cobre o vínculo em `company_members`/`funder_members`, que usam o CPF como chave).
3. Além disso, `cpf_locked=true` em `sign_me` quando: (a) existe linha em `sign_envelopes` com `owner = uid` (P1-05, 1º envelope), ou (b) certificado verificado (`cert_verified_at` não nulo e `cert_chain_ok`), ou (c) CPF preenchido com vínculo em `company_members` ou `funder_members`. Na prática, na UI: CPF editável somente quando o campo está vazio em `profiles` (e, por consequência, sem envelope). Fica registrado como decisão: "CPF só se preenche, nunca se troca, pelo Sign; troca = suporte via RPC `bo_` com log".
4. Duplicado: `unique(cpf)` em `profiles` devolve `cpf_in_use`; a UI mostra texto neutro (não revela de quem é).
5. Pendência para o Yuri (impacta suporte): confirmar a regra 2 (mais restritiva que P1-05) e se o nome também deve travar quando há vínculo com Partners/Wealth. Recomendação: não travar o nome.

## Estados
- Carregando: esqueleto das linhas (`.skel`) por até o retorno de `sign_me`; `aria-busy="true"` no cartão; shell já visível.
- Vazio (não é erro): campos sem dado mostram "Não informado"; CPF e nome vazios abrem o formulário em modo preenchimento com a faixa "Complete seu perfil para enviar documentos." (sem bloquear a navegação).
- Erro de rede/servidor ao carregar: banner "Não foi possível carregar seus dados. Verifique sua conexão." + "Tentar de novo" (foco no botão). O shell mantém menu.
- Erro ao salvar: banner `role="alert"` acima do botão, valores digitados preservados, foco no primeiro campo inválido (ou no banner se for rede).
- Sem permissão / sessão: sem sessão ou 401 do token: guarda o digitado em memória (não em storage), mostra "Sua sessão terminou. Entre de novo; seus dados continuam aqui." e leva a `#/entrar` com replace (M-1 do pacote C2). E-mail não confirmado (`email_not_confirmed`): "Confirme seu e-mail para continuar." + "Reenviar e-mail".
- Sucesso: toast "Dados salvos." (`role="status"`), foco no campo editado, botão volta a desligado, cabeçalho do shell atualizado sem recarregar.
- Muitos dados: n/a (um registro). Nome de 140 caracteres: quebra de linha sem estourar (ver layout).
- CPF bloqueado: estado próprio descrito nos elementos.

## Dados lidos e escritos (RPCs, tabelas, fonte única)
| Dado | Fonte única | Leitura | Escrita |
| --- | --- | --- | --- |
| Nome, CPF | `profiles` (`full_name`, `cpf`) | `sign_me` | `sign_profile_save` |
| E-mail | `auth.users` (via `_sign_me()`) | `sign_me` | nenhuma |
| Celular, verificação, certificado | `sign_identity` (1.5) | `sign_me` | nenhuma na 1.4 |
| Nível | derivado de `sign_me.verified` e `sign_me.cert` | `levelOf` | nenhuma |
| Plano/uso | `sign_accounts` (Parte 5) | não lido na 1.4 | nenhuma |
Nenhum dado de pessoa é copiado para o Sign. `sign_accounts.name/doc` continuam existindo e deixam de ser escritos (etapa B futura os remove).

Contrato de `sign_me` (alterações na migração, mantendo as chaves atuais para não quebrar 1.0/1.1): `name` e `cpf` só de `profiles` (sem fallback de `raw_user_meta_data`; M2); novo `name_hint` (metadado, só para pré-preencher o formulário, nunca gravado sem o usuário confirmar nem exibido como validado); `phone` só de `sign_identity.phone` ou `profiles.phone`; novos `cpf_locked` (boolean) e `profile_complete` (boolean: nome válido e CPF válido). Nenhuma chave nova vaza dado de outra pessoa.

Códigos de erro de `sign_profile_save`: `email_not_confirmed`, `invalid_name`, `invalid_cpf`, `cpf_locked`, `cpf_in_use`. O cliente classifica por `message` (padrão de `api.me`) em `naoconfirmado | nome | cpf | cpf_travado | cpf_usado | sessao | rede | geral` e nunca mostra a mensagem crua.

### Migração proposta (não aplicada): `supabase/migrations/AAAAMMDDHHMMSS_sign_perfil_fonte_unica.sql`
Escrita e testada pelo desenvolvedor no Postgres local (porta 54350). Idempotente (`create or replace`, `if not exists`, `drop ... if exists`). Plano de reversão em comentário no topo (reaplicar as definições antigas de `sign_me`, `sign_profile_save`, `sign_account_save`, `sign_plan_state`, `_senv_owner_name` do esquema atual; a migração não apaga colunas nem dados). Conteúdo:
0. Pré-verificação em comentário/SELECT para produção (T-08): `unique(cpf)` em `profiles` existe; contagem de divergências nome/CPF entre `profiles` e `sign_accounts`. Se a constraint faltar, criar `unique index if not exists` só depois do Yuri conferir duplicados.
1. `sign_me`: remove fallback de `raw_user_meta_data` para `cpf` e `phone`; `name` só de `profiles`; acrescenta `name_hint`, `cpf_locked`, `profile_complete` (M2).
2. `_sign_cpf_locked(uid)`: função interna (prefixo `_`, sem `grant` a `anon`/`authenticated`) com as condições (a), (b), (c) acima.
3. `sign_profile_save(p jsonb)`: valida nome (trim, colapsa espaços, 3 a 140, 2+ palavras) e CPF (`_cpf_ok`, só dígitos); aplica a regra R5 (preenche só se vazio; igual é no-op; diferente é `cpf_locked`); `insert ... on conflict (id) do update` atualizando apenas `full_name` e, se vazio, `cpf`, nunca `email`/`phone`; `unique_violation` vira `cpf_in_use`; retorna `sign_me()`. Se o usuário só altera o nome, `cpf` do payload igual ao atual é aceito.
4. `sign_account_save`: o nome passa a ser gravado só em `profiles` pela mesma validação (função interna `_sign_profile_apply`, compartilhada com o item 3); deixa de gravar `sign_accounts.name/doc`; mantém a sincronização de `crm_leads.name` a partir de `profiles` (T-02 etapa A). `doc` com 14 dígitos (CNPJ) é ignorado na v1 (P1-06), sem erro.
5. `sign_plan_state`: `account.name` e `account.doc` passam a ler de `profiles` (mesma forma de resposta).
6. `_senv_owner_name`: `profiles.full_name`, depois `split_part(email,'@',1)`, nunca `raw_user_meta_data` (R3). Envelopes antigos mantêm `owner_name` já gravado (evidência não é reescrita).
7. `grant execute` explícito e `revoke ... from public, anon` para `sign_me`, `sign_profile_save`, `sign_account_save`, `sign_plan_state`; `search_path` vazio e SECURITY DEFINER mantidos; funções `_` sem grant.
8. Etapa B (NÃO agora): `alter table sign_accounts drop column name, doc`, e duplicidade de `sign_env_signers`. Registrar em pendencias.md.

## Textos da interface e mensagens de erro (PT-BR)
- `h1`: "Conta". Subtítulo: "Seus dados, verificação e segurança." Abas: "Perfil", "Verificação", "Segurança".
- Cartão "Seus dados": rótulos "Nome completo", "CPF", "E-mail", "Celular", "Nível de assinatura". Selos: "Confirmado", "Verificado", "Não verificado", "Simples", "Avançada", "Qualificada". Vazio: "Não informado".
- Apoio do nível: "Simples: e-mail confirmado. Avançada: contato verificado. Qualificada: certificado digital válido. Veja como em Verificação." com link "Ir para Verificação".
- Apoio do nome: "Use seu nome completo, como nos seus documentos." Apoio do CPF (editável): "Só números. Depois do primeiro envio de documento, o CPF não poderá ser alterado por aqui." CPF bloqueado: "Para alterar o CPF, fale com o suporte." E-mail: "Para trocar o e-mail, fale com o suporte."
- Faixa de perfil incompleto: "Complete seu perfil para enviar documentos."
- Botão: "Salvar alterações". Descartar: título "Descartar alterações?", corpo "As alterações não salvas serão perdidas.", botões "Continuar editando" e "Descartar".
- Sucesso: "Dados salvos."
- Erros por campo: nome vazio: "Informe seu nome completo."; nome curto/uma palavra: "Informe nome e sobrenome."; nome longo: "O nome pode ter até 140 caracteres."; CPF vazio: "Informe seu CPF."; CPF inválido: "CPF inválido. Confira os números."; CPF travado: "Para alterar o CPF, fale com o suporte."; duplicado/qualquer conflito: "Não foi possível salvar este CPF. Confira os números ou fale com o suporte."
- Erros gerais: rede: "Não foi possível salvar. Verifique sua conexão e tente de novo."; geral: "Não foi possível salvar agora. Tente de novo em instantes."; carregar: "Não foi possível carregar seus dados. Verifique sua conexão."; sessão: "Sua sessão terminou. Entre de novo; seus dados continuam aqui."; e-mail não confirmado: "Confirme seu e-mail para continuar."
- Cartão LGPD: título "Seus dados e a LGPD". Texto: "Para pedir exclusão ou portabilidade dos seus dados: [preencher: canal do DPO, Jurídico]. Dados de documentos já assinados são mantidos pelo prazo legal: [preencher: Jurídico, J-02/P1-10]." Sem botão de exclusão.
- `title` do documento: "Perfil · Conta · Lottus Sign" (via `setTitle`).
Nenhum `[preencher]` pode ir como valor enviado ao servidor (M-2 vale: é só texto informativo; o verificador reporta como pendência G7, não como falha da seção).

## Layout por faixa
- 320 a 479: uma coluna; cartão em largura total com 16 px de respiro; rótulos acima dos campos; botão "Salvar alterações" em largura total; selo de nível no topo do cartão; abas rolam na horizontal dentro de `.tabs` (sem rolar a página); sem rolagem horizontal da página.
- 480 a 767: uma coluna, cartão até 560 px centralizado ao conteúdo.
- 768 a 1023: duas colunas de campos (Nome em 2 colunas; CPF e Celular lado a lado; E-mail em 2 colunas); botão alinhado à direita.
- 1024 a 1599: formulário de 640 px + coluna lateral (selo de nível, explicação dos 3 níveis, cartão LGPD).
- 1600 a 2560: conteúdo limitado a 1200 px, centralizado na `.surface`; sem esticar campos além de 640 px.
- Zoom 200% em 1280 equivale a ~640 px: deve se comportar como a faixa 480–767, sem corte. Nome de 140 caracteres: `overflow-wrap:anywhere` no valor somente leitura e no resumo do cabeçalho.
- Alvos de toque e clique de 44 px mínimo (campos, botões, abas, links de suporte). Contraste AA (texto 4,5:1; selos e foco 3:1); foco visível; `prefers-reduced-motion` respeitado. `100dvh` mantido.

## Orçamento de desempenho
- `sign_me` e `sign_profile_save`: p95 ≤ 300 ms medido no Postgres local com `EXPLAIN (ANALYZE, BUFFERS)` anexo: leituras por chave primária de `profiles`, `sign_identity`, `auth.users`; `_sign_cpf_locked` usa índice em `sign_envelopes(owner)` (criar `create index if not exists` se o plano mostrar Seq Scan relevante) e `company_members/funder_members(user_id)`. Medir com 100 chamadas sequenciais e 10 paralelas.
- Tela: LCP ≤ 2,5 s e CLS ≤ 0,05 em 4G simulado (medido pelo `medir.cjs`, conferir); JS novo da view ≤ 8 KB gzip, sem biblioteca nova (custo zero); no máximo 1 chamada de `sign_me` por abertura (cache de 5 s reaproveitado); nenhuma chamada extra a `sign_plan_state`.

## Infraestrutura de teste: Supabase falso repassando ao Postgres local
`scripts/sign-local/testes/fake-sign.cjs` mantém o Auth falso (sessões, tokens, hash do Auth) e passa a encaminhar `POST /rest/v1/rpc/<fn>` ao Postgres real em `localhost:54350` (modelo `scripts/wealth-local/fake-supabase.cjs`, conferir o mecanismo). Requisitos:
1. Banco criado por `scripts/sign-local/reset.sh` com o esquema real mais a migração candidata aplicada só no local, em duas modalidades: `ANTES` (esquema atual) e `DEPOIS` (com a migração), para os testes provarem a diferença.
2. Cada chamada vira uma transação: `set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated","email":"..."}', true)`, `set local role authenticated`, `select public.<fn>($1::jsonb)`, e `commit`. Sem token: `set local role anon` (deve falhar por permissão). O `uid` vem do token emitido pelo Auth falso, nunca do corpo.
3. Erros do Postgres viram resposta HTTP no formato do PostgREST (`{code, message}`, status 400), para o cliente `classify` ser exercitado de verdade.
4. Usuários semeados em `auth.users` e `profiles` por `seed.sql`: U1 (`pronto@teste.example`, nome e CPF preenchidos, 0 envelopes), U2 (`outro@teste.example`, CPF diferente), U3 (`vazio@teste.example`, perfil vazio, metadado com nome/CPF/phone malicioso), U4 (Partners/Wealth: CPF preenchido, vínculo em `company_members` e `funder_members`, nome conhecido), U5 (com 1 envelope), U6 (certificado verificado). Valores fictícios e CPFs válidos gerados por script; nada de dado real.
5. Testes em `scripts/sign-local/testes/t-perfil-db.cjs` (SQL via RPC) e `t-perfil.cjs` (Playwright). Fechar o ambiente ao final e limpar o banco com `reset.sh`.

## Critérios de aceite
Formato Dado/quando/então. AC-B* rodam no Postgres via RPC; AC* e AC-R* rodam em Playwright contra o falso conectado ao banco. Larguras: 320, 360, 390, 768, 1024, 1280, 1920, 2560.

### Banco (AC-B)
- AC-B1 (IDOR). Dado U1 e U2 logados, quando U1 chama `sign_profile_save` com `{"id":"<uid U2>","user_id":"<uid U2>","name":"Novo Nome","cpf":"..."}`, então só a linha de U1 muda e a de U2 permanece idêntica (comparar `full_name`, `cpf`, `updated_at`). `sign_me` de U1 nunca contém dados de U2. O `uid` não é aceito como parâmetro.
- AC-B2 (anon). Dado chamada sem JWT ou como `anon`, quando chama `sign_me`, `sign_profile_save`, `sign_account_save`, `sign_plan_state`, então erro de permissão e nenhuma linha alterada. `_sign_cpf_locked` e `_senv_owner_name` não são executáveis por `authenticated`.
- AC-B3 (CPF duplicado). Dado CPF de U2 válido, quando U3 tenta salvar esse CPF, então erro `cpf_in_use`, `profiles` de U3 intacto e a mensagem não contém o nome de U2.
- AC-B4 (CPF inválido). Dado `11111111111`, `123`, `abc`, `""`, `12345678900`, quando U3 salva, então `invalid_cpf` (ou `invalid_name` se o nome falha antes) e nada gravado; CPF com máscara `529.982.247-25` (se válido) grava só dígitos.
- AC-B5 (nome). Dado nome de exatamente 140 caracteres, então grava; com 141, `invalid_name`; com 2 caracteres ou uma palavra só, `invalid_name`; com espaços duplicados, grava colapsado e aparado.
- AC-B6 (XSS no nome). Dado nome `Ana <img src=x onerror=alert(1)> Silva`, quando U3 salva, então grava literalmente (o servidor não interpreta) e `sign_me` devolve o texto idêntico; a sanitização é na saída (AC9).
- AC-B7 (R5, sem sobrescrever). Dado U4 (CPF e nome do Partners), quando chama `sign_profile_save` com CPF diferente, então `cpf_locked` e `profiles.cpf` e `profiles.email`/`phone` de U4 intactos; com o mesmo CPF e nome novo, grava só `full_name`. Nenhuma chamada altera `phone` ou `email`.
- AC-B8 (P1-05 e certificado). Dado U5 (1 envelope) e U6 (certificado), quando `sign_me`, então `cpf_locked=true`; salvar com CPF diferente dá `cpf_locked`; U3 (sem envelope, CPF vazio) tem `cpf_locked=false` e preenche.
- AC-B9 (M2). Dado U3 com `raw_user_meta_data` contendo `cpf`, `phone` e `name`, quando `sign_me`, então `cpf` e `phone` vêm nulos, `name` nulo e `name_hint` traz o metadado; `profile_complete=false`. No esquema ANTES o mesmo teste falha (prova a regressão corrigida).
- AC-B10 (R3). Dado U3 com `raw_user_meta_data.name = "Banco Falso S.A."` e `profiles.full_name = "Ana Silva"`, quando se cria envelope de teste, então `sign_envelopes.owner_name = "Ana Silva"`; sem `profiles.full_name`, usa a parte local do e-mail e nunca o metadado.
- AC-B11 (T-02). Dado `sign_account_save` com `name` e `doc`, então `profiles.full_name` muda conforme as regras, `sign_accounts.name/doc` não mudam e `sign_plan_state.account.name/doc` refletem `profiles`.
- AC-B12 (idempotência e reversão). Dado o banco `ANTES`, quando aplica a migração duas vezes, então sem erro nem mudança na 2ª; quando aplica o bloco de reversão, as 5 funções voltam à definição anterior e os dados permanecem.
- AC-B13 (desempenho). `sign_me` e `sign_profile_save` p95 ≤ 300 ms com 10 mil perfis semeados; planos `EXPLAIN` sem Seq Scan nas tabelas grandes, anexados.
- AC-B14 (grants). Consulta ao catálogo mostra `grant execute` apenas para `authenticated` nas funções públicas e nenhum para `anon`/`public`.

### Tela (AC)
- AC1 (leitura). Dado U1 logado com perfil completo, quando abre `#/conta/perfil`, então vê nome, CPF mascarado ou editável conforme `cpf_locked`, e-mail com "Confirmado", celular mascarado com seu selo, nível coerente com o cabeçalho, e "Salvar alterações" desligado.
- AC2 (editar nome). Dado nome alterado para valor válido, quando clica "Salvar alterações", então aparece "Dados salvos.", o foco fica no campo, o botão desliga e o nome do cabeçalho muda sem recarregar; ao recarregar (F5) o nome persiste.
- AC3 (validação). Dado nome vazio, uma palavra, 141 caracteres ou CPF inválido, quando tenta salvar, então a mensagem do campo (texto exato acima) aparece, nada é enviado (cliente) e o foco vai ao primeiro campo inválido; servidor reforça (AC-B3 a B5).
- AC4 (CPF travado). Dado U5, quando abre, então o campo CPF está `disabled`, mascarado, com "Para alterar o CPF, fale com o suporte." e link mailto; o payload enviado ao salvar o nome não contém CPF diferente.
- AC5 (CPF duplicado). Dado CPF de outro usuário, quando salva, então "Não foi possível salvar este CPF. Confira os números ou fale com o suporte." e valores preservados.
- AC6 (perfil vazio). Dado U3, então o formulário abre em modo preenchimento com "Complete seu perfil para enviar documentos." e o nome aparece pré-preenchido do `name_hint` apenas como sugestão (campo marcado como não salvo; só grava se o usuário clicar em salvar).
- AC7 (estados). Dado atraso/erro de rede simulados no falso, então esqueleto durante carga; "Não foi possível carregar seus dados. Verifique sua conexão." com "Tentar de novo" que funciona; erro ao salvar mostra o banner `role="alert"` e preserva o digitado; sessão expirada mostra o texto de sessão e redireciona com replace.
- AC8 (sem beco). Dado qualquer estado, então há caminho de saída: abas, menu, "Ir para Documentos"; "Verificar contato" leva a `#/conta/verificacao`, que mostra tela provisória com saída; todos os links percorridos pelo rastreador de links.
- AC9 (XSS). Dado nome `<img src=x onerror=...>` salvo, então aparece como texto literal no formulário, no cabeçalho do shell, no menu e na aba, sem execução de script e sem violação de CSP (`window.__xss` não definido; nenhum `securitypolicyviolation`).
- AC10 (descarte). Dado formulário sujo, quando troca de aba, volta pelo navegador ou fecha o menu para navegar, então aparece "Descartar alterações?"; "Continuar editando" mantém tudo; "Descartar" navega.
- AC11 (responsivo). Dado cada largura (320, 360, 390, 768, 1024, 1280, 1920, 2560) e zoom 200% em 1280, quando abre a tela com nome de 140 caracteres sem espaços, então `scrollWidth <= clientWidth` do documento, sem texto cortado nem sobreposto, e o layout é o da faixa (1 coluna, 2 colunas, formulário + coluna lateral). Capturas anexadas por largura.
- AC12 (teclado e leitor). Dado só teclado, então a ordem de Tab é: pular ao conteúdo, menu, abas, campos, link, botão; Enter envia; Esc fecha menu e confirmação; foco volta ao disparador; todos os campos têm rótulo associado; erros usam `aria-describedby` e `role="alert"`; `h1` único; selos têm texto.
- AC13 (alvos e contraste). Dado cada controle interativo, então alto e largo ≥ 44 px (medido por `getBoundingClientRect`) e contraste ≥ 4,5:1 para texto e ≥ 3:1 para selos e foco (medido, nos temas existentes).
- AC14 (CSP e segredos). Dado a tela carregada, então 0 violações de CSP, 0 `eval`/estilos inline novos, `node scripts/check.mjs` sem erros, nenhuma chave de serviço no front, nenhuma gravação do CPF ou nome em `localStorage`/`sessionStorage`.
- AC15 (duplo clique). Dado clique duplo em "Salvar alterações", então uma única chamada RPC.
- AC16 (cabeçalho coerente). Dado nome alterado, então `.org-name`, menu do avatar e iniciais refletem o novo nome; sem nome, mostram o e-mail (comportamento da 1.0 preservado).

### Regressão do ciclo 2 da 1.0 (pendência 1.0-C2), construída junto e verificada com a regressão existente
- AC-R1 (A10-MA). Dado U1 logado com shell montado, quando o hash do Auth traz sessão de U2 (`setSession` com outro `user.id`), então o shell é remontado e nenhum nome/e-mail/iniciais de U1 permanecem no DOM; teste observa o DOM por mutações e a ausência de "pronto@teste.example" após a troca.
- AC-R2 (A10-MB). Dado logado, quando a página é restaurada com `pageshow` `persisted=true` após logout em outra aba, então a sessão é rechecada e o usuário vai a `#/entrar` sem exibir dados da área logada; o HTML é servido com `Cache-Control: no-store` (conferido no `_headers` de apps/sign e na resposta do servidor de teste). Não testado em bfcache real se o Chromium do teste não o ativa; registrar.
- AC-R3 (M-1, aviso de sessão). Dado sessão encerrada em outra aba ou token vencido durante o uso, então o aviso "Sua sessão terminou. Entre de novo; seus dados continuam aqui." (texto da 1.0 mantido onde for o aviso global) aparece em `#/entrar` (via `setFlash('sessao')`) e o login seguinte leva ao destino guardado com replace.
- AC-R4 (M-2, sidenav). Dado larguras ≤ 420 px com mais de 5 itens de menu (forçar 6 itens no teste), então a página não rola na horizontal; `.sidenav` tem `overflow-x:auto` e `max-width:100%`.
- AC-R5 (B-1). Dado reenvio de link bem-sucedido seguido de 429, então só um alerta é exibido (o mais recente), sem mensagens contraditórias simultâneas.
- AC-R6 (B-2). Dado largura 320 com toast longo, então o toast não cobre o botão "Sair" do menu nem controles principais (reposicionado ou truncado com `aria-live` íntegro).
- AC-R7 (A10-B1). Dado `pageHead(titulo, sub, voltar)` com `href` `javascript:alert(1)`, `https://x`, `//x` e `#/conta/perfil`, então só o último gera link; os demais não renderizam link.
- AC-R8 (A10-B2). Dado carga com hash `#foo` ou `foo` que não começa com `#/` e não é do Auth, então redireciona a `#/entrar` com replace (sem tela em branco, sem entrada extra no histórico).
- AC-R9 (A10-B4). Dado `construcao.js` em rota pública, quando clica a ação de entrada ou "Sair", então `go('#/entrar', true)` com replace; `history.length` não cresce.
- AC-R10 (regressão geral). Todos os ACs e scripts existentes (`t-shell`, `t-regressao`, `t-ac`, `t-corr`, `t-comp`, `t-layout`) continuam passando; `shell.js`, `ui.js`, `router.js`, `styles.css` são compartilhados e disparam reverificação da 1.0 e da 1.1 (regra 14).

## Pendências, hipóteses e o que não está testado
- Yuri: confirmar regra R5/P1-05 como acima (CPF só se preenche; troca só por suporte), nome sempre editável, mailto do suporte, rótulos dos três níveis (hipótese).
- Jurídico/DPO: texto LGPD, prazo de retenção, canal de exclusão/portabilidade (todos `[preencher]`).
- Time: confirmar `unique(cpf)` em `profiles` e índices (T-08) antes de aplicar em qualquer ambiente; nada foi aplicado em produção.
- Depois da 1.4: etapa B de T-02 (remover `sign_accounts.name/doc`), `bo_` para troca de CPF com log, edição do celular na 1.5, reutilização do formulário no onboarding (1.3).
- Não foi verificado nesta especificação: funcionamento do fake em modo repasse, bfcache real e medições de desempenho; tudo isso é evidência exigida do desenvolvedor e do verificador.
Arquivos de referência: /home/user/lottusfinance/docs/agente/sign/parte-1-design.md, /home/user/lottusfinance/docs/agente/sign/parte-1-arquitetura.md, /home/user/lottusfinance/docs/agente/sign/pendencias.md, /home/user/lottusfinance/apps/sign/js/views/shell.js, /home/user/lottusfinance/apps/sign/js/views/construcao.js, /home/user/lottusfinance/apps/sign/js/lib/api.js, /home/user/lottusfinance/scripts/sign-local/testes/fake-sign.cjs, /home/user/lottusfinance/scripts/wealth-local/fake-supabase.cjs, /root/sign-schema.sql.
