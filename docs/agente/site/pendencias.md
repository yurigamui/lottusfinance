# PENDENCIAS: Site e páginas públicas

| ID | Descrição | Severidade | Dono | Prazo | Origem |
| --- | --- | --- | --- | --- | --- |
| S-001 | Rodapé da home mostra "CNPJ [preencher]" e Termos/Privacidade têm `[preencher]` (CNPJ, endereço da sede, encarregado de dados, comarca). Bloqueia o lançamento (manual, seção 13) | Alta | Yuri / jurídico | antes de divulgar | auditoria 23/11 |
| S-002 | Links de Instagram, LinkedIn, App Store e Google Play apontam para as páginas iniciais genéricas (`instagram.com/`, `linkedin.com/`, `apps.apple.com/`, `play.google.com/`), não para os perfis e o app da Lottus | Média | Yuri (fornecer os endereços) | antes de divulgar | auditoria 23/11 |
| S-003 | `build.py` e `legal.py` desatualizados em relação ao `index.html` e ao `termos.html` publicados (Termos 1.2 no ar × 1.0 no gerador). Aviso posto no README; sincronizar exige decidir qual versão é a certa | Média | Agente (com OK do Yuri sobre o texto jurídico) | a definir | auditoria 23/11 |
| S-004 | Formulário de contato sem destino (`formEndpoint` vazio em `main.js`): mostra a mensagem pronta para copiar. Ligar a uma função própria exige decidir o serviço | Baixa | Yuri | a definir | auditoria 23/11 |
| S-005 | `build.py` menciona `solucoes.html`, `sobre.html` e `contato.html`, que não existem no site publicado (página única). Comentário enganoso | Baixa | Agente | com S-003 | auditoria 23/11 |
