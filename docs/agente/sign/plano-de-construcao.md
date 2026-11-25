# Plano de construção: Lottus Sign (25/11/2026)

Seções de cada parte (resumo do Idealizador; a Ficha completa de cada parte é pedida na hora de construí-la, conforme a Fase 2 do manual).

| Parte | Seções |
| --- | --- |
| 1 Conta e identidade | 1.1 Entrar e criar conta (aprovada com ressalvas) · 1.2 Recuperar senha · 1.3 Onboarding · 1.4 Perfil e conta · 1.5 Verificação de identidade (migração do canal e-mail e correção de S-05) · 1.6 Segurança da conta |
| 2 Envio e acompanhamento | 2.1 Lista de documentos · 2.2 Detalhe e linha do tempo · 2.3 Novo envio (3 passos) · 2.4 Signatários e ordem · 2.5 Revisão e envio · 2.6 Lembrar/cancelar/copiar meu link · 2.7 Baixar PDFs · 2.8 Inbox (documentos que devo assinar) · 2.9 PDF em Storage (T-01) |
| 3 Assinatura pelo signatário | 3.1 Abrir e ler (migra para `sign_env_public_*`, T-03) · 3.2 CPF + OTP por e-mail (T-04, tabela `sign_signer_otps`, tentativa persistida) · 3.3 Aceite do método e assinar · 3.4 Recusar · 3.5 Comprovante e PDF final |
| 4 Verificação pública | 4.1 Por código · 4.2 Por upload do PDF (hash no navegador) · 4.3 Relatório e trilha (recalcula a cadeia) · 4.4 Certificado de conclusão em PDF |
| 5 Plano e uso | 5.1 Cota do mês · 5.2 Histórico · 5.3 Pedir mudança de plano (pedido vai à equipe; sem cobrança automática) |
| 6 Contatos | 6.1 Agenda · 6.2 Escolher contato no passo 2.4 |
| 7 Empresas vinculadas | v2 (fora desta entrega) |

## Ordem de construção (uma seção por vez; cada uma só avança após a verificação)
0. **1.0 Shell da área logada + correções da 1.1** (M-1, M-3, B-1, B-3, T-09, alinhamento de UX) → 1.3 Onboarding → 1.5 Verificação de identidade (migração do canal e-mail, S-05) 
1. 2.1 Lista → 2. 2.3/2.4/2.5 Novo envio → 3. 3.1 → 4. 3.2 → 5. 3.3/3.4 → 6. 3.5 → 7. 2.2/2.7 (jornada de ouro dos passos 1 a 6 completa)
8. 4.1/4.3 → 9. 4.2/4.4 → 10. 5.1/5.3/5.2 → 11. 2.6/2.8 → 12. 1.2/1.4/1.6 (restante da Parte 1) → 13. Parte 6 → 14. 2.9 (T-01) antes do release

## Reverificação por mudança compartilhada (regra 14)
Gerador de PDF → 3.5 e 4.4 · T-01 → 2.3, 2.7, 3.1, 4.3 · correção de R3 → 2.2, 3.5, 4.4 · migração do canal e-mail → Parte 1 e 3.2 · `ui.js`/`shell.js`/`styles.css` → todas as telas já aprovadas.

## Restrições permanentes
`assinar.html?t=` e `verificar.html?c=` não mudam de endereço (links já circulam). Produção só leitura; migrações preparadas e não aplicadas. Sem texto jurídico inventado.
