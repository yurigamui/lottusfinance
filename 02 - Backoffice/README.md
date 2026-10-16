# Lottus · Admin

Site da equipe Lottus, publicado em **admin.lottusfinance.com.br**: cadastros, crédito, acompanhamento das operações (só para ver: quem aprova e paga é o fundo, no Lottus Partners), jurídico, controle e crescimento.

O site dos fundos fica na pasta `lottus-partners`, publicado em partners.lottusfinance.com.br. Representante de fundo que tenta entrar aqui é recusado com o aviso do endereço certo.

HTML, CSS e JavaScript puro, sem build. Usa o mesmo projeto Supabase do app.

## Publicar

1. Publique esta pasta como site estático (Vercel, Netlify, Cloudflare Pages…) com o domínio `admin.lottusfinance.com.br`.
2. No DNS, crie `admin` como CNAME para o endereço que a hospedagem indicar.
3. No Supabase → Authentication → URL Configuration, acrescente `https://admin.lottusfinance.com.br/**` em Redirect URLs.

## O que tem

| Tela | O que faz |
|---|---|
| Painel | Filas do dia e números da carteira |
| Identidade | Documento + selfie lado a lado; aprovar ou recusar com motivo |
| Documentos | Abrir, aprovar ou recusar os documentos da empresa |
| Empresas | Busca e ficha completa: Receita, QSA, pessoas, documentos, contas, operações, histórico |
| Crédito | Checklist, sugestão do motor, aprovar limite (taxa, rating, prazo, tarifa) ou recusar |
| Operações | Analisar → aprovar → registrar pagamento (com comprovante) → baixa das duplicatas → liquidada; recusar/cancelar libera as notas; boleto registrado; XML; evidências de assinatura; origem (app, financeiro, alçada, agendamento); comprovante em PDF |
| Quitações | Confirmar o Pix do valor presente |
| Agendamentos | Saques agendados pelas empresas: a fazer, feitos, não feitos (com o motivo) e cancelados |
| Indicações | Quem indicou quem, situação do bônus, valor do bônus (administrador altera), cancelar indicação |
| Sacados | Rating, limite global, bloqueio, exposição |
| Auditoria | Toda ação da equipe + conferência da cadeia de assinaturas |
| Equipe Lottus | Pessoas e níveis (só administrador) |

Níveis: **analista** (identidade e documentos), **aprovador** (+ crédito, operações, baixas, sacados),
**administrador** (+ equipe). Toda ação passa por uma função `bo_*` no banco, que confere o
nível e o segundo fator e grava em `staff_actions` (não pode ser alterada nem apagada).

## Como colocar no ar

1. **SQL** (Supabase → SQL Editor), nesta ordem, se ainda não rodou:
   `20261009050000_signatures.sql`, `20261009060000_backoffice.sql`, `20261009070000_backoffice_no_bank_check.sql` e `20261010000000_features.sql`.
2. **Login da equipe**: Authentication → Users → *Add user* → e-mail e senha, marque *Auto Confirm*.
   Use um e-mail que não seja de cliente do app.
3. **Primeiro administrador** (SQL Editor):
   ```sql
   insert into staff_users (user_id, name, level)
   select id, 'Seu nome', 'admin' from auth.users where email = 'voce@lottus.com.br';
   ```
   Os próximos você adiciona pela tela **Equipe Lottus** (o login precisa existir antes).
4. **Segundo fator**: Authentication → Multi-Factor → TOTP habilitado (vem ligado por padrão).
   No primeiro acesso, o site mostra um QR para o app autenticador.
5. **Hospedar**: qualquer hospedagem de site estático (Netlify, Vercel, Cloudflare Pages) —
   suba a pasta inteira. Para testar no computador, abrir o `index.html` no navegador já funciona.
   Recomendado: proteger o endereço também na hospedagem (senha ou acesso por e-mail).

`js/config.js` tem o endereço do projeto e a chave publicável (pode ficar pública: o que protege
os dados é o login + segundo fator + as funções do banco). A sessão fica só na aba aberta e cai
depois de 30 minutos sem uso.

## Menu (2026-10-13)

Menu lateral em grupos: Painel · Análises (Identidade, Documentos, Crédito) · Operações (Operações, Agendamentos, Quitações) · Partes (Cedentes, Sacados, Representantes, Fundos) · Crescimento (Indicações) · Controle (Contratos, Auditoria, Equipe Lottus). O botão « recolhe o menu para só ícones (a escolha fica salva no navegador). Novos arquivos: `js/people.js`. Requer `20261013030000_backoffice_people.sql`.
