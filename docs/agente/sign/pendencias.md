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
| D-01..D-06 | Divergências do front atual a corrigir ao construir: senha mínima 8 (RN2 pede 10); `100vh` em `.sign-body` e `.modal` (usar `100dvh`); alvos de toque abaixo de 44 px (`.pw-toggle` 38 px, `.btn.sm`, `.tabs button`, `.otp-box`); `aria-live` no `<main>` inteiro e foco perdido ao reescrever com `innerHTML`; `style=""` inline em `home.js`; hash dos e-mails do Auth colide com o roteador | Média | Desenvolvedor | Seção 1.1 | parte-1-design.md |
| S-SIGN-05 | **Alta (segurança).** `sign_phone_verify`: o `update attempts+1` é desfeito pelo `raise otp_invalid` na mesma transação; 8 códigos errados deixaram `attempts = 0` (reproduzido no banco local com o código exportado de produção; não executado em produção). O limite de 5 tentativas é ineficaz. Corrigir em migração nova (retornar `{ok:false, remaining}` em vez de exceção) | Alta | Arquiteto/Desenvolvedor | Seção 1.5 | teste local 24/11 |
| R3 | Nome do remetente na evidência vem de `raw_user_meta_data`, editável pelo usuário (`_senv_owner_name`); passar a ler de `profiles` | Alta | Arquiteto | Parte 2 | parte-1-arquitetura.md |
| R5 | `sign_profile_save` sobrescreve nome e CPF em `profiles`, compartilhada com Partners e Wealth: definir regra de quem pode alterar | Alta | Arquiteto, Yuri | Seção 1.4 | parte-1-arquitetura.md |
| R2 | OTP em claro em `sign_outbox.params` quando o envio falha; purga a cada 15 min | Média | Arquiteto | Seção 1.5 | parte-1-arquitetura.md |
| RN9 | `sign_me` e `sign_env_create` aceitam certificado vencido (não olham `cert_not_after`) | Alta | Arquiteto | Seção 1.5 | parte-1-arquitetura.md |
| RN7 | Trocar o número mantém `phone_verified_at`: número novo aparece como verificado | Alta | Arquiteto | Seção 1.5 | parte-1-arquitetura.md |
| T-07 | Edge Functions `sign-messenger` (entrega do OTP) e a de validação da cadeia do certificado não estão no repositório; versionar antes da seção 1.5 | Média | Yuri (D-02) | Seção 1.5 | parte-1-arquitetura.md |
| T-08 | Conferir em produção (SELECT): `sms_enabled`, `require_mfa`, `unique(cpf)` em `profiles` e a duplicidade de nome/CPF (T-02) | Média | Auditor | G2 | parte-1-arquitetura.md |
| P1-12 / P1-13 | Conferir no painel do Auth (Confirm email, senha mínima, enumeração de e-mail, redirecionamentos); RPC `sign_terms_accept` (não aplicada) | Média | Yuri / Arquiteto | Seção 1.1 | micro-especificação 1.1 |
| M1 | Auxiliares `_` executáveis por `anon` **em produção** (confirmado por SELECT em 24/11): `_sha256`, `_html_escape`, `_cnpj_ok`, `_email_html`, `_sign_mask_phone`, `_signature_statement`. A migração `20261123121000` já trata 4; falta incluir `_sign_mask_phone` e `_signature_statement` (migração nova, não aplicada). Risco baixo (não são security definer, não leem dados) | Média | Arquiteto | Release | auditor 1.1 |
| M2 | `sign_me` devolve `cpf` e `phone` vindos de `raw_user_meta_data` (editável pelo usuário) como fallback; corrigir na migração da 1.3/1.4 e não tratar como verificado | Média | Arquiteto | Seções 1.3/1.4 | auditor 1.1 |
| B1 | Link com `#access_token=lixo&type=signup` mostra "E-mail confirmado": trocar para texto neutro/"link venceu" quando o token for inválido | Baixa | Desenvolvedor | Ciclo 2 da 1.1 | auditor 1.1 |
| B2 | Login CSRF por fragmento (fluxo implícito do Auth): avaliar PKCE | Baixa | Arquiteto | Release | auditor 1.1 |
| B3 | Limite de reenvio (3/h) só no cliente (localStorage) e conta mesmo em falha de rede; defesa real é o limite do Auth (P1-11/P1-12) | Baixa | Desenvolvedor | Ciclo 2 da 1.1 | auditor 1.1 |
| B4 | CSP com `style-src 'unsafe-inline'` e `connect-src` com `brasilapi.com.br` sem uso na 1.1: apertar depois | Baixa | Desenvolvedor | G6 | auditor 1.1 |
| B5 | `terms_version`/`privacy_version` vão como "[preencher]" no signUp: não publicar assim (J-02/P1-10) | Média | Yuri/Jurídico | Release | auditor 1.1 |
| S-02 | Proteção contra senha vazada do Auth desligada em produção (alerta do Supabase, confirmado em 24/11) | Média | Yuri | Release | advisors |
| M-1 | Voltar do navegador após login cai sempre em `#/documentos` (empilha histórico): usar `replace` no redirecionamento | Média | Desenvolvedor | Antes do G5 da Parte 1 | verificação 1.1 |
| M-2 | `[preencher]` visível e enviado em `terms_version`/`privacy_version`; Termos/Política sem link. Bloqueia release (G7) até J-02/P1-10 | Média | Yuri/Jurídico | G7 | verificação 1.1 |
| M-3 | Estado "link vencido": após reenviar, botão e contagem somem | Média | Desenvolvedor | Antes do G5 da Parte 1 | verificação 1.1 |
| B-1/B-3/B-4 | Hash do Auth só no carregamento; `aria-pressed` no "Mostrar"; tema escuro forçado a claro por `theme.js` (decidir) | Baixa | Desenvolvedor | Antes do G5 | verificação 1.1 |
| T-09 | Desempenho em rede lenta: 7 módulos em cascata; meta de 1 s não atingida (1,7 s a 1,6 Mbps/150 ms). Pré-carregar (`modulepreload`) ou agrupar | Média | Desenvolvedor | Antes do G5 | nota de construção |
| UX-01 | Tema escuro nas 4 plataformas: `lottus.theme` com claro/escuro/sistema e seletor em Conta, para todas de uma vez (CSS escuro já existe) | Baixa | Yuri/Maestro | Pós-v1 | ux-alinhamento.md |
| UX-02 | Folha inferior (modal no celular) só nasce no Sign; portar às outras plataformas exige reverificação delas (regra 14) | Baixa | Maestro | Pós-v1 | ux-alinhamento.md |
