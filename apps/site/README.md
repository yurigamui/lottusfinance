# Site institucional Lottus

Página única (index.html): topo, Sobre a Lottus, Como funciona, Simulador, Confiança e segurança, Dúvidas e rodapé (Contato).
Tudo é gerado por build.py: edite e rode `python3 build.py`.

No topo de build.py:
- APP_STORE_URL / PLAY_STORE_URL: links do app nas lojas.
- REVIEWS: avaliações reais de clientes. A seção "avaliações" só aparece quando houver pelo menos uma.
- Fotos de pessoas: coloque em img/ com estes nomes (JPG ~1600 px):
  - pessoa-hero.jpg (topo, à direita), pessoa-app.jpg (faixa "Veja como é simples").
  Sem o arquivo, o espaço fica com o fundo da marca.

As telas do app nos celulares são prints reais em img/app-*.webp (com uma faixa no topo para a câmera). Para trocar, substitua os arquivos.
Em main.js (CONFIG): taxaExemplo do simulador, formEndpoint do formulário e e-mail de contato.

Selos e ícones oficiais (baixe nos kits de marca e salve em img/ com estes nomes; o site usa automaticamente):
- img/badge-app-store.svg  — "Download on the App Store" em português (Apple Marketing Resources)
- img/badge-google-play.svg — "Disponível no Google Play" (Google Play badges)
- img/icon-instagram.svg e img/icon-linkedin.svg — ícones dos kits de marca do Instagram e do LinkedIn
Links: APP_STORE_URL, PLAY_STORE_URL, INSTAGRAM_URL e LINKEDIN_URL no topo de build.py.

Onde baixar os arquivos oficiais:
- App Store (selo em português): https://developer.apple.com/app-store/marketing/guidelines/ → "Download on the App Store" badges, versão pt-BR, preto. Salve como img/badge-app-store.svg
- Google Play (selo em português): https://play.google.com/intl/pt-BR/badges/ → baixe o PNG/SVG. Salve como img/badge-google-play.svg (ou .png e troque a extensão em build.py)
- Instagram: https://about.meta.com/brand/resources/instagram/instagram-brand/ → glifo. Salve como img/icon-instagram.svg
- LinkedIn: https://brand.linkedin.com/downloads → "In" logo. Salve como img/icon-linkedin.svg
