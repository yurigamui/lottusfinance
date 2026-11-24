# Ficha da Parte: Lottus Sign / 1. Conta e identidade
24/11/2026 · v0.1 (rascunho para G2) · Idealizador (texto gravado pelo Maestro)

## Objetivo
Permitir que o Remetente crie conta, entre com segurança, complete o perfil, comprove quem é (contato verificado e, se quiser, certificado ICP-Brasil) e conclua o onboarding. Usa só dados mínimos e não tem custo de provedor. Sem esta parte o banco bloqueia o envio, porque exige contato verificado ou certificado válido. A identidade do signatário (sem conta) fica na Parte 3.

## Papéis e permissões
| Papel | Pode | Não pode |
| --- | --- | --- |
| Visitante | Criar conta, entrar, recuperar senha, verificar documento por código (link para a Parte 4) | Ver qualquer dado de conta |
| Remetente (logado) | Ver e editar o próprio perfil e conta, verificar contato, enviar e validar certificado, ativar ou desativar MFA, sair, concluir onboarding | Ver dados de outro usuário; enviar documento sem identidade verificada |
| Equipe Lottus (Admin) | Listar, adicionar e ativar/desativar raízes de confiança ICP (`sign_root_*`) | Ver senha, código ou chave privada de ninguém |

## Seções, em ordem
| # | Seção | Objetivo | Chega-se por | Leva a |
| --- | --- | --- | --- | --- |
| 1 | Entrar e criar conta | Autenticar ou cadastrar (e-mail e senha) e confirmar e-mail | Raiz do Sign; "Entrar" nas páginas públicas; link do e-mail de confirmação | Seção 2; seção 3 se o onboarding estiver pendente; área logada (Parte 2) se concluído |
| 2 | Recuperar senha | Redefinir senha por link enviado ao e-mail | "Esqueci a senha" na seção 1; link do e-mail de recuperação | Seção 1 |
| 3 | Onboarding | Guiar o primeiro acesso: perfil, contato, certificado opcional | Seção 1 (conta nova ou `sign_onboarding_done` pendente) | Seções 4 e 5; área logada (Parte 2) ao concluir |
| 4 | Perfil e conta | Editar nome, CPF/CNPJ, tipo de conta, contato | Menu da conta; seção 3 | Seção 5; Parte 5 (plano) |
| 5 | Verificação de identidade | Verificar contato (código pelo canal ativo) e, opcional, certificado ICP-Brasil | Seção 3; menu da conta; aviso "verifique para enviar" vindo da Parte 2 | Seção 4; Parte 2 (envio) |
| 6 | Segurança da conta | Trocar senha, MFA opcional, ver sessão e sair | Menu da conta | Seção 2; seção 1 (após sair) |

Gestão das raízes ICP (`sign_root_*`) é da equipe e mora no Admin; o Arquiteto confirma o local. Não entra no front do Sign.

## Funcionalidades (como capacidades do usuário)
- Criar conta com e-mail e senha e confirmar o e-mail.
- Entrar, sair e manter a sessão com segurança.
- Recuperar a senha sem ajuda da equipe.
- Informar e corrigir nome, CPF ou CNPJ e contato.
- Receber um código no canal configurado e confirmá-lo.
- Enviar um certificado ICP-Brasil, provar a posse (desafio) e ver o resultado.
- Ativar MFA opcional.
- Concluir o onboarding e saber exatamente o que falta para poder enviar.
- Equipe: manter a lista de raízes de confiança ICP.

## Regras de negócio (numeradas e testáveis)
RN1. A conta exige e-mail confirmado antes de qualquer envio; antes disso o usuário vê só o onboarding com o aviso "Confirme seu e-mail".
RN2. Senha com no mínimo 10 caracteres, validada no servidor e na tela, com mensagem que diz o que falta.
RN3. Após 5 falhas de login seguidas para o mesmo e-mail, bloqueio de 15 minutos. A mensagem é igual para e-mail inexistente e senha errada (sem enumerar contas). Valores são hipótese do Arquiteto.
RN4. A recuperação de senha sempre responde "Se o e-mail existir, enviamos o link", exista a conta ou não. O link expira em 1 hora e vale uma vez. Após a troca, as outras sessões são encerradas.
RN5. O código de contato tem 6 dígitos e vale 10 minutos, com no máximo 5 tentativas por código e 3 reenvios por hora por usuário. É guardado só com hash e descartado ao ser usado ou expirar.
RN6. O canal vem de `sign_messaging_config`: `email` ativo, `whatsapp` pronto e desligado, SMS inexistente. Canal desligado não é oferecido na tela e a chamada direta é recusada pelo servidor.
RN7. Contato verificado = canal confirmado por código. Mudar o contato derruba a verificação e exige novo código.
RN8. CPF e CNPJ só com dígitos, com dígito verificador válido, validados no servidor. Dois usuários não podem ter o mesmo CPF.
RN9. O certificado ICP-Brasil só é aceito se (a) a cadeia termina em raiz ativa de `sign_trusted_roots`, (b) está na validade, (c) o titular prova a posse via `sign_cert_challenge`, (d) o CPF/CNPJ do certificado confere com o do perfil. Qualquer falha mostra o motivo específico, e o caminho por contato verificado continua disponível.
RN10. Para enviar documento basta contato verificado OU certificado válido. O certificado é opcional e eleva o remetente para qualificada.
RN11. Só a equipe Lottus (papel conferido no servidor) executa `sign_root_add/toggle/list`. Desativar uma raiz não apaga certificados já aceitos; vale só para as próximas verificações.
RN12. MFA é opcional por usuário. Se ativo, o login exige o segundo fator e a recuperação de senha não o desativa. A perda do segundo fator tem fluxo definido pelo Arquiteto. Se o MFA não couber em custo zero, a seção 6 entrega só troca de senha e sessão.
RN13. A sessão expira por inatividade (hipótese: 8 h). "Sair" invalida a sessão no servidor. Sessão expirada leva à seção 1 e devolve o usuário à tela de origem após o login.
RN14. LGPD, finalidade e mínimo: a conta coleta só nome, e-mail, CPF/CNPJ e contato, usados para identificar o remetente e dar prova da assinatura. Nenhum outro dado é pedido, e cada campo mostra para que serve. Base legal e retenção: [preencher] (jurídico).
RN15. LGPD, titular: o usuário vê e corrige seus dados na seção 4. Pedido de exclusão ou portabilidade usa canal [preencher] (DPO). Dado que é prova de documento já assinado não é apagado por pedido de exclusão, e o aviso explica isso. Texto: jurídico.
RN16. Pessoa vive em `profiles`. `sign_accounts` guarda só o que é do Sign (tipo de conta, plano, onboarding, nível de verificação) e não repete nome ou documento. A duplicidade existente vira migração (T-02).
RN17. Segredos, códigos e chaves nunca aparecem em log, URL ou resposta. Toda escrita passa por RPC com `grant execute` explícito. Nenhuma RPC recebe o id do usuário como parâmetro; todas usam o usuário da sessão.
RN18. O primeiro acesso cai no onboarding até `sign_onboarding_done` ser chamada. Passos opcionais (certificado) podem ser pulados e retomados.

## Entidades e campos
| Entidade | Fonte única | Campos novos |
| --- | --- | --- |
| Login, e-mail, senha, MFA, sessão | Supabase Auth (`auth.users`) | Nenhum |
| Pessoa (nome, CPF, telefone/contato) | `profiles` | Nenhum esperado; confirmar se existe campo de contato verificado (se não, novo, em migração não aplicada) |
| Empresa | `companies` | Nenhum (vínculo é v2) |
| Estado da conta no Sign | `sign_accounts` | Remover nome e documento duplicados (T-02) |
| Código de verificação | `sign_otps` | Canal `email` (hoje só `sms`/`whatsapp`), decisão P1-01 |
| Certificado e desafio | `sign_identity` | Nenhum esperado |
| Raízes de confiança | `sign_trusted_roots` | Nenhum |
| Canais e entrega | `sign_messaging_config`, `sign_outbox` | E-mail ativo; WhatsApp desligado |

## Vínculos com outras partes e plataformas
- Parte 2 (Envio): exige RN1 e RN10 antes de criar envelope; quando faltar, leva à seção 5 com o motivo.
- Parte 3 (Assinatura): reaproveita o mecanismo de código por e-mail (T-04), mas é outra identidade, sem conta.
- Parte 4 (Verificação): "Verificar um documento" fica visível sem login.
- Parte 5 (Plano): a seção 4 mostra o plano atual e leva a ela.
- Admin: gestão das raízes ICP. Partners: pode compartilhar usuário Auth e `profiles`; o Arquiteto confirma o impacto em CSP e redirecionamentos.
- Site: link de Termos e Privacidade (J-02).

## Estados e casos de borda previstos
- Em toda seção: carregando, erro de rede com "Tentar de novo", sem permissão e sucesso.
- E-mail já cadastrado: mensagem neutra (RN4) com orientação a entrar ou recuperar a senha.
- E-mail não confirmado: reenvio do link, com limite.
- Código expirado, errado ou com tentativas esgotadas: mensagem específica e botão de novo código.
- Canal de contato desligado: a seção 5 mostra só o canal ativo, sem beco sem saída.
- Certificado expirado, de cadeia desconhecida ou corrompido: mensagem por causa.
- Link de recuperação ou confirmação vencido ou já usado: oferece pedir outro.
- Troca de CPF por quem já enviou documentos: ver P1-05.
- Sessão expirada no meio do formulário: preservar o digitado quando possível.
- Duas abas: sair em uma encerra a outra.
- 320 px a monitor grande, sem corte.

## Integrações e dependências externas
- Supabase Auth: confirmação, recuperação, MFA. O limite de e-mails do plano gratuito pode ser pequeno; o Arquiteto avalia e propõe alternativa de custo zero antes do release (P1-11).
- Fila `sign_outbox` para o código por e-mail e, no futuro, WhatsApp (sem provedor contratado).
- Raízes ICP-Brasil: lista oficial carregada pela equipe; sem consulta a serviço pago. Revogação online (CRL/OCSP): P1-07.
- Textos legais: jurídico.

## Critérios de aceite da parte
1. Visitante cria conta, confirma o e-mail, entra e cai no onboarding, sem custo de terceiros.
2. Completa o perfil, recebe o código por e-mail, confirma e passa a poder enviar. Sem verificação, o servidor recusa o envio com mensagem que leva à seção 5.
3. Sai e entra de novo, e o onboarding não reaparece.
4. Esquece a senha, recebe o link, redefine e entra; o link não funciona uma segunda vez.
5. Após 5 falhas de login há bloqueio, e a mensagem não revela se a conta existe.
6. Certificado válido gera o aviso "qualificada"; inválido é recusado com o motivo.
7. Um usuário não vê nem altera dados de outro (teste de RLS com duas contas).
8. A equipe adiciona e desativa uma raiz ICP; usuário comum recebe "sem permissão".
9. Com WhatsApp desligado, a seção 5 não o oferece e a chamada direta é recusada.
10. Nenhum campo de pessoa duplicado fora de `profiles` (auditoria do `auditor-dados`).
11. As seis seções funcionam em 320, 768 e 1280 px, sem corte e sem beco sem saída.

## Fora do escopo
Identidade do signatário e seu OTP (Parte 3, T-04) · SMS e WhatsApp ativo · login social, sem senha e biometria · vínculo de empresas e agenda de contatos (v2) · carimbo do tempo ICP-Brasil (J-03) · gestão de usuários pela equipe e exclusão de conta pelo próprio usuário (decisão pendente).

## Decisões em aberto (quem decide)
| ID | Decisão | Quem | Recomendação |
| --- | --- | --- | --- |
| P1-01 | Como `sign_phone_send/verify` aceita o canal e-mail: generalizar o canal em `sign_otps` ou criar RPCs novas | Arquiteto | Generalizar o canal, mantendo as RPCs atuais |
| P1-02 | Contato verificado é o telefone (como hoje) ou o e-mail? Código por e-mail é redundante com a confirmação do cadastro e não prova a posse do celular | Arquiteto, depois Yuri | Manter telefone como dado, verificado pelo canal ativo; decidir se e-mail confirmado já basta para RN10 |
| P1-03 | MFA em custo zero (TOTP do Auth) e perda do segundo fator | Arquiteto | Oferecer TOTP, sem SMS |
| P1-04 | Limites numéricos de RN3, RN5 e RN13 | Arquiteto | Valores da ficha |
| P1-05 | Pode trocar CPF depois de ter enviado documentos? | Arquiteto, Yuri | Bloquear; só pelo suporte |
| P1-06 | Remetente PJ: conta de pessoa, de empresa ou ambas? | Yuri | Só pessoa na v1 |
| P1-07 | Revogação de certificado (CRL/OCSP) em custo zero | Arquiteto | Cadeia e validade na v1; revogação na v2 |
| P1-08 | Finalidade, base legal, retenção, exclusão de conta, canal do DPO (RN14, RN15) | **Jurídico**: [preencher] | Rascunho só depois de J-02 |
| P1-09 | Texto do aceite do método e do aviso de uso de certificado | **Jurídico** (J-01): [preencher] | n/a |
| P1-10 | Aceite de Termos e Privacidade no cadastro, versionado | **Jurídico**, Yuri | Sim, com data e versão registradas; texto [preencher] |
| P1-11 | Limite de e-mails do Auth no plano gratuito e SMTP próprio | Yuri | Medir antes do release |

Observações do Idealizador: `apps/sign/js/home.js` já tem login, cadastro, recuperação de senha e lista de documentos por Supabase Auth (`guest()`, `recovery()`, `home()`), o que cobre parte das seções 1 e 2; faltam verificação de contato, certificado, onboarding, perfil e MFA. Não foi confirmado se `profiles` tem campo de contato verificado. Os números de RN3, RN5 e RN13 são hipóteses.
