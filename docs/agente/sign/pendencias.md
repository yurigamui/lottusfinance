# Pendências: Lottus Sign
| ID | Descrição | Sev. | Dono | Prazo | Origem |
| --- | --- | --- | --- | --- | --- |
| S-SIGN-01 | Configurar `signUrl` no Partners quando o domínio do Sign estiver no ar | Média | Yuri | Release | auditoria 23/11 |
| S-SIGN-02 | Páginas duplicadas Partners/Sign; remover as do Partners depois do 01 (com OK) | Média | Yuri | Release | auditoria 23/11 |
| S-SIGN-03 | Portal logado inexistente no repositório (em construção neste ciclo) | Alta | Time | G6 | auditoria 23/11 |
| S-SIGN-04 | Assinatura ponta a ponta nunca testada | Alta | Time | G4 de cada parte | auditoria 23/11 |
| J-01 | Definir nível de assinatura prometido (simples, avançada, qualificada) e texto de aceite do método (Lei 14.063, art. 4º §1º) | Alta | Jurídico/Yuri | G1 | ficha |
| J-02 | Termos de uso, política de privacidade e retenção do Sign | Alta | Jurídico | Release | ficha |
| J-03 | Carimbo do tempo ICP-Brasil: contratar ou não (serviço pago) | Média | Yuri | v2 | ficha |
| J-04 | Aviso sobre documentos com forma legal obrigatória | Média | Jurídico | G6 | ficha |
| T-01 | Mover `pdf_b64` para Storage privado (escala) | Média | Arquiteto | Parte 2 | ficha |
| T-02 | Duplicação nome/CPF em `sign_accounts` e `sign_env_signers` vs `profiles` | Média | Auditor | Parte 1 | ficha |
| T-03 | Páginas públicas usam RPCs antigas; precisam usar `sign_env_public_*` e `verify_envelope*` | Alta | Desenvolvedor | Partes 3 e 4 | linha de base |
| T-04 | Signatário não tem OTP: `sign_otps` é só de usuário logado e `sign_env_public_submit` confere só o CPF. Construir OTP do signatário por e-mail, canal WhatsApp pronto e desligado | Alta | Arquiteto | Parte 3 | decisão G1 |
| P1-01..P1-11 | Decisões em aberto da Parte 1 (ver `parte-1-conta-e-identidade.md`): canal e-mail no OTP, contato verificado, MFA grátis, limites, troca de CPF, remetente PJ, CRL/OCSP, LGPD, aceite do método, aceite de termos, limite de e-mails do Auth | Média/Alta | Arquiteto, Yuri, Jurídico | G2 da Parte 1 | Ficha da Parte 1 |
| T-05 | Após 5 CPFs errados o link do signatário trava até o remetente lembrar ou pedir novo link. Decidir se é desejado (segurança × atrito) | Média | Yuri | Parte 3 | teste local 24/11 |
| T-06 | Ambiente local não cobre: sign_collection_*, verify_collection*, sign_company_*, sign_my_documents, sign_root_*, sign_cert_*, sign_profile_save, sign_account_save (faltam funções/tabelas de outras plataformas) | Média | Desenvolvedor | cada parte | ambiente-local.md |
