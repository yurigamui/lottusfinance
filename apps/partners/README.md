# Lottus Partners

Site dos fundos parceiros, publicado em **partners.lottusfinance.com.br**. Cada representante vê só as operações enviadas ao fundo dele:

- **Configurações:**
  - **Conta Lottus:** aberta automaticamente depois da autorização do administrador do fundo (pedida uma vez, ao entrar). Durante a análise, pede os documentos conforme o tipo do fundo e acompanha a prova de vida. Com a conta ativa, aprovar = Pix na hora ao cedente, e as duplicatas viram boletos com Pix. Também define as regras dos boletos (multa, juros, desconto e prazo para pagar).
  - **Política de crédito:** aceita, taxa e limite por nota da Lottus.
  - **Equipe:** o administrador do fundo convida pessoas (Administrador, Aprovador com alçada, Consulta), edita, desliga e vê o histórico de alterações. Alertas por e-mail.
- **Painel:** o que está esperando o fundo (aprovar e pagar), carteira a receber e vencidos, volume cedido, valor pago aos cedentes, taxa e prazo médios, volume pago por mês, recebimentos previstos por mês e os maiores sacados e cedentes da carteira. Período de 6, 12 ou 24 meses.

- **Para aprovar:** valores, sacados com rating, cedente com rating e documentos. "Aprovar" assina o aceite da cessão; "Recusar" passa a operação para o próximo fundo da fila.
- **A pagar:** por enquanto, o fundo paga pelo próprio banco e registra o pagamento com o comprovante e o boleto (PDF) de cada duplicata. Com a Conta Lottus ligada, o Pix sai pela conta.
- **Pagas** e **Todas**.

Entrada com e-mail, senha e segundo fator. O primeiro acesso de cada fundo sai do Admin (Partes → Fundos → Acesso); depois, o administrador do fundo convida o resto da equipe. Login da equipe Lottus aqui é recusado com o aviso do endereço certo.

Só tema claro. HTML, CSS e JavaScript puro, sem build. Usa o mesmo projeto Supabase do app e do Admin.

## Publicar

1. Publique esta pasta como site estático (Vercel, Netlify, Cloudflare Pages…) com o domínio `partners.lottusfinance.com.br`.
2. No DNS, crie `partners` como CNAME para o endereço que a hospedagem indicar.
3. No Supabase → Authentication → URL Configuration, acrescente `https://partners.lottusfinance.com.br/**` em Redirect URLs.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `js/config.js` | Projeto Supabase e endereços |
| `js/core.js` | Conexão, formatação, avisos, arquivos |
| `js/ui.js` | Títulos, abas e listas |
| `js/charts.js` | Gráfico de colunas (dica ao passar o mouse e tabela) |
| `js/dashboard.js` | Painel do fundo |
| `js/reports.js` | Relatório por período (PDF, A4 deitado, com gráficos) e extrato em CSV |
| `js/settings.js` | Configurações: Conta Lottus e regras dos boletos, política de crédito, equipe e convites |
| `js/portal.js` | Lista (busca e abas) e detalhe das operações (checklist, seleção de títulos, alçada, saldo da Conta Lottus, aprovar, recusar com motivo, pagar) |
| `js/app.js` | Login, segundo fator, menu e navegação |
