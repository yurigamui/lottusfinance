# PENDENCIAS: Site e páginas públicas

| ID | Descrição | Severidade | Dono | Prazo | Origem |
| --- | --- | --- | --- | --- | --- |
| S-001 | Rodapé da home mostra "CNPJ [preencher]" e Termos/Privacidade têm `[preencher]` (CNPJ, endereço da sede, encarregado de dados, comarca). Bloqueia o lançamento (manual, seção 13) | Alta | Yuri / jurídico | antes de divulgar | auditoria 23/11 |
| S-002 | Links de Instagram, LinkedIn, App Store e Google Play apontam para as páginas iniciais genéricas (`instagram.com/`, `linkedin.com/`, `apps.apple.com/`, `play.google.com/`), não para os perfis e o app da Lottus | Média | Yuri (fornecer os endereços) | antes de divulgar | auditoria 23/11 |
| S-003 | `build.py` e `legal.py` desatualizados em relação ao `index.html` e ao `termos.html` publicados (Termos 1.2 no ar × 1.0 no gerador). Aviso posto no README; sincronizar exige decidir qual versão é a certa | Média | Agente (com OK do Yuri sobre o texto jurídico) | a definir | auditoria 23/11 |
| S-004 | Formulário de contato sem destino (`formEndpoint` vazio em `main.js`): mostra a mensagem pronta para copiar. Ligar a uma função própria exige decidir o serviço | Baixa | Yuri | a definir | auditoria 23/11 |
| S-005 | `build.py` menciona `solucoes.html`, `sobre.html` e `contato.html`, que não existem no site publicado (página única). Comentário enganoso | Baixa | Agente | com S-003 | auditoria 23/11 |
| S-006 | Home sem páginas próprias por solução (`/partners`, `/sign`): páginas dedicadas ranqueariam melhor por palavra-chave. Exige textos novos e decisão de escopo | Média | Yuri (aprovar escopo) | a definir | SEO 24/11 |
| S-007 | Wealth ganhou página (em breve); Invest removido do site (ver S-020) | Média | Yuri | – | 24/11 |
| S-008 | Após publicar: cadastrar o site no Google Search Console e no Bing Webmaster, enviar `sitemap.xml`, validar o JSON-LD no Teste de Resultados Ricos; medir LCP/INP/CLS em 4G real | Média | Yuri / agente | no lançamento | SEO 24/11 |
| S-009 | `build.py`/`legal.py` seguem desatualizados e NÃO geram o novo SEO nem o bloco do Sign. Rodá-los apagaria as mudanças | Alta (risco) | Agente | com S-003 | 24/11 |
| S-010 | Confirmar `lottusfinance.com.br` sem `www` como endereço canônico (redirecionar o outro na hospedagem) | Baixa | Yuri | no lançamento | SEO 24/11 |
| S-011 | `ciencia.html` e `pagar.html` sem h1 estático (privadas, noindex; título vem do JS?). Conferir | Baixa | Agente | com S-003 | verificação 24/11 |
| S-012 | Não medidos: LCP/INP/CLS, Safari/Firefox, leitor de screen reader, Tab completo, envio real do lead, fluxos de `pagar`/`ciencia`/`descadastrar` com token | Média | Agente / Yuri | antes de divulgar | verificação 24/11 |
| S-013 | Conferir com ferramenta de contraste o eyebrow rosa sobre o gradiente do hero das páginas internas (medida aproximada 4,31:1; escurecido para #a3203f) e o link inline "Política de Preços" no FAQ (alvo de 20 px, texto em linha) | Baixa | Agente | antes de divulgar | verificação 24/11 |
| S-014 | **Revisão jurídica** dos textos de `/invest/` e `/wealth/` (CVM: comunicação de debêntures privadas, "convite do emissor", ausência de oferta/recomendação; LGPD) antes de divulgar | Alta | Yuri / jurídico | antes de divulgar | 24/11 |
| S-015 | Quando Wealth e Invest forem ao ar: trocar "em breve" e o CTA por link do app e atualizar a home, JSON-LD e FAQ. Wealth: incluir preços só depois de W-031 | Média | Agente | no lançamento | 24/11 |
| S-016 | Confirmar na função `site_lead` (fora do repositório) que aceita `wealth` e `invest` em `product`; hoje há reenvio como "ambos" | Baixa | Agente / Yuri | antes de divulgar | 24/11 |
| S-017 | O status do Invest no site ("em breve") assume que o app ainda não está no ar; Yuri confirmar a data e o endereço | Média | Yuri | no lançamento | 24/11 |
| S-018 | "Debêntures privadas" como público do Invest vem do manual (seção 3) e do Projeto, não dos documentos de `docs/agente/invest`. Yuri confirmar o texto | Baixa | Yuri | antes de divulgar | verificação 24/11 |
| S-019 | Checkbox de consentimento (4×13 px) e logo do cabeçalho (28 px) do formulário abaixo de 44 px; já existiam | Baixa | Agente | com S-012 | verificação 24/11 |
| S-020 | Invest saiu do site a pedido do Yuri. Voltar quando houver app e texto jurídico (S-014, S-017, S-018 ficam adiados). Página antiga recuperável no histórico do git (commit `df401d8`) | Baixa | Yuri | quando decidir | 24/11 |
| S-021 | Faixa "R$ 0" do Partners e plano "Grátis" do Sign aparecem nas tabelas de planos (vêm da Política de Preços). Yuri decide se ficam | Média | Yuri | antes de divulgar | 24/11 |
| S-022 | Wealth: tabela de planos só depois de W-031/W-039 (preço, Grátis com 1 ou 3 carteiras) | Média | Yuri | no lançamento | 24/11 |
| S-023 | Prints têm nomes fictícios ("Alfa Capital Securitizadora" etc.): conferir se algum coincide com empresa real | Baixa | Yuri | antes de divulgar | 24/11 |
| S-024 | Textos do Sign ajustados ao que está documentado: "conta com identidade confirmada" (quem envia) e "signatário assina pelo link com o CPF conferido". A promessa de confirmação de identidade do signatário (OTP, T-04) e o nível da assinatura (J-01) voltam ao site só depois de implementados e aprovados pelo jurídico | Alta | Yuri / jurídico | antes de divulgar | verificação 24/11 |
| S-025 | Texto "a conta confirma a identidade por código de verificação ou certificado digital" depende de P1-02 (canal do código: e-mail, telefone) na Ficha do Sign; ajustar quando decidido | Baixa | Agente | com P1-02 | verificação 24/11 |
