# Relatório da plataforma: Lottus Sign · 23/11/2026

[MAESTRO] Modo Beta. Ambiente: front local no navegador com a CSP do `_headers`, rede externa bloqueada.

## B0
- 3 páginas: `index.html` (entrar, criar conta, verificar), `assinar.html` (assinatura por link) e `verificar.html` (autenticidade por código). 8 RPCs usadas; todas existem e estão liberadas ao papel certo (as públicas, por token).
- O manual fala em "portal de 13 telas"; neste repositório o Sign tem 3 páginas. O portal logado do Sign (documentos, contatos, planos) não está aqui (S-SIGN-03).
- O Partners tem cópias de `assinar.html`/`verificar.html`. A lógica é igual; as diferenças são só de estilo (classes utilitárias × `style=`). Enquanto `signUrl` não for configurado no Partners, os links de assinatura abrem no Partners.

## Verificado
| Seção | Resultado | Evidência |
| --- | --- | --- |
| Entrar / verificar (home) | Sem achados | 7 larguras sem corte; textos e estados presentes |
| Assinar com link inválido | Sem achados | Mostra "Link indisponível… Peça um novo envio a quem enviou o documento." |
| Verificar com código curto | Sem achados | Mostra "Informe pelo menos 16 caracteres do código." |
| Escape de dados (XSS) | Sem achados | Varredura do verificador: `assinar.js`, `verificar.js` e `home.js` escapam tudo |

## Pendências
| ID | Descrição | Severidade |
| --- | --- | --- |
| S-SIGN-01 | Configurar `signUrl` no Partners quando o domínio do Sign estiver no ar (depende-de-mim 2d) | Média |
| S-SIGN-02 | Páginas duplicadas no Partners e no Sign: duas cópias para manter. Depois do S-SIGN-01, remover as do Partners (com OK) | Média |
| S-SIGN-03 | Portal logado do Sign e regras de plano (contagem, limite, cobrança) não estão neste repositório | Alta (não avaliado) |
| S-SIGN-04 | Assinatura real ponta a ponta (OTP por SMS, PDF assinado, verificação) não testada: exige envelope de teste no branch | Alta (não avaliado) |
