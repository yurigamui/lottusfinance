# Ficha da Plataforma: Lottus Sign
24/11/2026 · v0.1 (rascunho para G1) · Modo Parcial

## Problema e público
Pessoas e empresas precisam colher assinatura de terceiros em PDF, com validade jurídica e prova que resista a contestação, sem imprimir e sem certificado digital em todas as pontas. Hoje só o Partners (fundos) envia documentos para assinar; a Lottus não tem produto de assinatura aberto.

## Promessa
Envie um PDF, colha assinaturas de qualquer pessoa pelo celular e guarde a prova, verificável por qualquer um.

## Papéis
- **Remetente** (conta Sign, logado): envia e acompanha documentos.
- **Signatário** (sem conta): abre o link, confirma identidade, assina ou recusa.
- **Verificador** (público): confere autenticidade pelo código.
- **Equipe Lottus** (Admin): planos, cotas, mensageria. Fora do Sign.

## Jornada de ouro (7 passos)
1. Remetente cria conta e confirma e-mail.
2. Verifica o celular (OTP) e, se quiser, o certificado ICP-Brasil.
3. Envia um PDF, informa signatários (nome, e-mail, CPF), ordem e validade.
4. Signatário recebe o link, lê o PDF e confirma CPF e código.
5. Signatário assina (ou recusa com motivo).
6. Remetente acompanha o status, reenvia lembrete ou cancela.
7. Todos baixam o PDF final com o relatório de assinaturas e qualquer pessoa verifica pelo código.

## Mapa de partes
| # | Parte | Objetivo | v1? | Motivo |
| --- | --- | --- | --- | --- |
| 1 | Conta e identidade | Entrar, perfil, telefone, certificado, onboarding | Sim | Back-end exige identidade para enviar |
| 2 | Envio e acompanhamento | Criar envelope, lista, detalhe, lembrar, cancelar, baixar | Sim | Núcleo da jornada |
| 3 | Assinatura pelo signatário | Página pública: ler, confirmar, assinar, recusar | Sim | Núcleo da jornada |
| 4 | Verificação pública e comprovantes | Verificar por código, relatório de assinaturas, trilha de eventos | Sim | Exigência de prova |
| 5 | Plano e uso | Ver cota, histórico, pedir mudança de plano | Sim | O banco já bloqueia por cota; sem tela o usuário não entende o bloqueio |
| 6 | Contatos | Agenda de signatários | Não (v2) | Sem ela a jornada funciona |
| 7 | Empresas vinculadas | Ligar CNPJ e abrir documentos de fundos (Partners) | Não (v2) | Vínculo com Partners, não essencial |

## Fora da v1
Contatos, empresas vinculadas, campos posicionados no PDF (assinatura em local escolhido), modelos reutilizáveis, API, assinatura em lote, app móvel, WhatsApp/SMS próprio (depende de provedor contratado).

## Dados mestres reaproveitados
Pessoa em `profiles` (nome, CPF, telefone); empresa em `companies`; login em `auth.users`. Tabelas `sign_*` guardam só o que é do Sign (envelope, signatário, evidência). Ponto de atenção: `sign_accounts.name/doc` e `sign_env_signers.name/cpf` repetem dados de pessoa; auditar na Fase 2 da Parte 1.

## Planos e preços (hipótese: valores que estão no banco, o Yuri valida)
Grátis 3 docs; Essencial R$ 39 (20); Profissional R$ 99 (80); Empresa R$ 249 (300).

## Regulação e riscos (todos para o jurídico)
- **Lei 14.063/2020:** três níveis de assinatura eletrônica. O Sign hoje entrega *simples* (e-mail, CPF, IP, aparelho) e, com OTP e cadeia de hash, caminha para *avançada*. A *qualificada* exige certificado ICP-Brasil do signatário (MP 2.200-2/2001); a verificação de certificado existe no banco para o remetente, não para o signatário.
- **Aceite do nível de assinatura:** para terceiros que não usam ICP-Brasil, a validade como avançada depende de as partes aceitarem o método (art. 4º, §1º). O texto desse aceite precisa de revisão jurídica.
- **Código Civil e CPC:** admissão de documento eletrônico e força probatória; a Lottus não pode afirmar "equivale a firma reconhecida".
- **Documentos que a lei exige forma específica** (imóvel, testamento, etc.): aviso na tela de envio.
- **LGPD:** CPF, IP, aparelho e PDF são dado pessoal; retenção, base legal e atendimento ao titular sem texto definido. DPO e CNPJ estão `[preencher]` no site.
- **Carimbo do tempo:** a hora hoje vem do banco, não de autoridade ICP-Brasil (ACT). Prova mais forte exige serviço pago de terceiro.
- **Armazenamento:** `pdf_b64` dentro de `sign_envelopes` (até 10 MB × volume) não escala; migrar para Storage privado.
- **Provedor de SMS/WhatsApp** ainda não testado.

## Métricas de sucesso
1. Taxa de documentos concluídos em até 7 dias.
2. Tempo da criação do envelope à primeira assinatura.
3. Disputas ou verificações que falharam (meta: zero).

## Aprovação do Yuri
Nível de assinatura aprovado em 24/11/2026 (avançada, ICP opcional). Partes v1: 1 a 5. Aprovação das demais partes e do escopo: implícita no pedido "todas as seções"; Yuri pode vetar.
