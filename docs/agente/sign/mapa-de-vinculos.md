# Mapa de Vínculos: Lottus Sign
Vínculos reais hoje (código lido, 24/11/2026). Preenchido por seção à medida que forem aprovadas.
| Seção de origem | Elemento | Destino | Existe volta? | Verificado em |
| --- | --- | --- | --- | --- |
| index.html | "Verificar documento" | verificar.html | Sim (logo) | 23/11 |
| assinar.html | "Verificar autenticidade" (após assinar) | verificar.html?c= | Parcial | 23/11 |
| verificar.html | "Verificar outro documento" | verificar.html | Sim | 23/11 |
| `#/entrar` | Esqueci a senha | `#/recuperar` (1.2, hoje "Em construção") | Sim (Sair / Voltar ao início) | 24/11 |
| `#/entrar` | Verificar um documento | verificar.html | Sim (logo) | 24/11 |
| `#/entrar` | Login confirmado, onboarding pendente | `#/onboarding/1` (1.3, hoje "Em construção") | Sim (Sair) | 24/11 |
| `#/entrar` | Login confirmado, onboarding feito | rota de origem na lista branca ou `#/documentos` (Parte 2, hoje "Em construção") | Sim (Sair) | 24/11 |
| `#/criar` | Cadastro enviado | tela "Confirme seu e-mail" → Reenviar, Usar outro e-mail, Entrar | Sim | 24/11 |
| e-mail do Auth | link de confirmação | `#/onboarding/1` ou `#/entrar` com aviso | Sim | 24/11 |
| e-mail do Auth | link de recuperação | `#/nova-senha` (1.2, hoje "Em construção") | Sim | 24/11 |
| `#/conta/perfil` | abas Verificação e Segurança | `#/conta/verificacao`, `#/conta/seguranca` (hoje "Em construção") | Sim (menu, abas, Documentos) | 26/11 |
| `#/conta/perfil` | "Verificar contato" | `#/conta/verificacao` | Sim | 26/11 |
| shell | menu Documentos / Conta; avatar → Conta, Sair | `#/documentos`, `#/conta/perfil`, `#/entrar` | Sim | 26/11 |
| `#/conta/verificacao` | Voltar ao perfil / Ir para meus documentos / Corrigir meu CPF | `#/conta/perfil`, `#/documentos`, `#/conta/perfil` | Sim | 27/11 |
| `#/onboarding/1..3` | Salvar e continuar / Continuar / Concluir / Pular certificado / Voltar / Sair | passo seguinte, `#/documentos`, passo anterior, `#/entrar` | Sim | 27/11 |
