#!/usr/bin/env python3
"""Monta as páginas do site a partir das partes comuns (cabeçalho e rodapé).

Edite os textos aqui e rode:  python3 build.py
Gera index.html, solucoes.html, sobre.html e contato.html na mesma pasta.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).parent

I = {
    'check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    'x': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    'arrow': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6l6 6-6 6"/></svg>',
    'left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    'right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    'menu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>',
    'mail': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/></svg>',
    'doc': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    'calendar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    'team': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/></svg>',
    'shield': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    'eye': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    'pen': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    'chat': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    'bank': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>',
    'bolt': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6z"/></svg>',
    'lock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
    'homei': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/></svg>',
    'useri': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>',
    'upload': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m-5 5l5-5 5 5M5 15v4a1 1 0 001 1h12a1 1 0 001-1v-4"/></svg>',
    'phonei': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
    'playi': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M7 4l12 8-12 8z"/></svg>',
    'star': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    'sun': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    'moon': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>',
    'auto': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 010 18z" fill="currentColor"/></svg>',
    'swap': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
}

PAGES = [('index', 'Início'), ('solucoes', 'Soluções'), ('sobre', 'Sobre nós'), ('contato', 'Contato')]
# Página única: o menu leva às seções
SECTIONS = [('sobre', 'Sobre a Lottus'), ('como-funciona', 'Como funciona'), ('duvidas', 'Dúvidas'), ('contato', 'Contato')]


# Lojas de aplicativo: troque pelos links reais do app publicado
APP_STORE_URL = 'https://apps.apple.com/'
PLAY_STORE_URL = 'https://play.google.com/store/'
INSTAGRAM_URL = 'https://www.instagram.com/'
LINKEDIN_URL = 'https://www.linkedin.com/'
# Ícones oficiais das redes: img/icon-instagram.svg e img/icon-linkedin.svg (kits de marca de cada rede).

# Avaliações reais de clientes (nome, empresa, nota de 1 a 5, texto, origem: "App Store", "Google Play" ou "Google").
# A seção só aparece quando houver pelo menos uma. Não publique avaliações que não sejam de clientes de verdade.
REVIEWS = [
    # {'name': 'Nome do cliente', 'company': 'Empresa', 'stars': 5, 'text': 'O que ele escreveu.', 'source': 'Google Play'},
]

# Fotos de pessoas: coloque os arquivos com estes nomes na pasta img/ (JPG, ~1600 px de largura).
#   img/pessoa-hero.jpg   — pessoa à direita do topo (empresário/empresária sorrindo)
#   img/pessoa-app.jpg    — pessoa usando o celular (faixa "Veja como é simples")
#   img/pessoa-sobre.jpg  — equipe ou cliente (topo da página Sobre nós)
# Sem o arquivo, o espaço mostra um fundo suave da marca.


def _status():
    return '<div class="s-status"><b>9:41</b><span class="s-icons"><i></i><i></i><i></i></span></div>'


def _tabs(active):
    items = [('home', 'Início'), ('doc', 'Notas'), ('swap', 'Antecipações'), ('user', 'Conta')]
    ico = {'home': I['homei'], 'doc': I['doc'], 'swap': I['swap'], 'user': I['useri']}
    return '<div class="s-tabs">' + ''.join(
        f'<div class="{"on" if k == active else ""}">{ico[k]}<span>{l}</span></div>' for k, l in items) + '</div>'


def screen_inicio(dim=False):
    return f'''<div class="s-screen{' dim' if dim else ''}">{_status()}
  <div class="s-pad">
    <div class="s-over">Casa Aurora Alimentos</div>
    <div class="s-hello">Olá, Marina</div>
    <div class="s-card">
      <div class="s-over">Saldo disponível</div>
      <div class="s-big">R$ 15.647,00</div>
      <div class="s-bar"><i style="width:26%"></i><i style="width:13%"></i></div>
      <div class="s-muted">Envie mais notas para usar até R$ 88.721,00.</div>
      <div class="s-row s-muted" style="margin-top:1.4em"><span>Limites e taxas</span><span>›</span></div>
    </div>
    <div class="s-btns"><span class="s-btn dark">Sacar</span><span class="s-btn">Enviar notas</span></div>
    <div class="s-row" style="margin-top:2.2em"><b class="s-h">Extrato</b><span class="s-link">Ver extrato</span></div>
    <div class="s-card s-list">
      <div class="s-item"><span class="s-ic">{I['clock']}</span><div class="s-grow"><b>Antecipação em andamento</b><span class="s-muted">13 de out. · Solicitada</span></div><b class="s-num">R$ 14.199,29</b></div>
      <div class="s-item"><span class="s-ic rosa">{I['check']}</span><div class="s-grow"><b>Antecipação recebida</b><span class="s-muted">9 de out. · Duplicatas</span></div><b class="s-num ok">+ R$ 15.264,00</b></div>
    </div>
  </div>
  {_tabs('home')}
</div>'''


NOTAS = [('Hotel Boa Vista Hospedagem', 'R$ 5.900,00', 'NF-e 1004 · 1 parcela · vence 10 de jan.', True),
         ('Restaurante Vale do Sol', 'R$ 6.696,00', 'NF-e 1003 · 1 parcela · vence 25 de nov.', False),
         ('Empório Serra Azul', 'R$ 3.051,00', 'NF-e 1002 · 1 parcela · vence 9 de dez.', True)]


def screen_notas():
    rows = ''.join(f'''<div class="s-item top"><span class="s-cb{' on' if on else ''}">{I['check'] if on else ''}</span>
      <div class="s-grow"><div class="s-row"><b class="s-trunc">{n}</b><b class="s-num">{v}</b></div><span class="s-muted">{d}</span><span class="s-ok">✓ Disponível</span></div></div>''' for n, v, d, on in NOTAS)
    return f'''<div class="s-screen">{_status()}
  <div class="s-pad">
    <div class="s-row"><div class="s-title">Notas fiscais</div><span class="s-round">{I['upload']}</span></div>
    <div class="s-card s-row" style="gap:1.2em"><span class="s-ic rosa">{I['mail']}</span><div class="s-grow"><b>Receber notas automaticamente</b><span class="s-muted">Mande o XML ou um .zip para notas@lottusfinance.com.br.</span></div><span class="s-muted">›</span></div>
    <div class="s-chips"><span class="on">Disponíveis</span><span>Em andamento</span><span>Vencidas</span><span>Todas</span></div>
    <div class="s-link" style="margin:1.6em 0 1.2em">Marcar todas</div>
    <div class="s-card s-list">{rows}</div>
  </div>
  <div class="s-foot"><div><span>2 notas</span><b>R$ 8.951,00</b></div><span class="s-btn dark">Ver proposta</span></div>
  {_tabs('doc')}
</div>'''


def screen_sacar():
    rows = ''.join(f'''<div class="s-item"><span class="s-cb{' on' if on else ''}">{I['check'] if on else ''}</span>
      <div class="s-grow"><b class="s-trunc">{n}</b><span class="s-muted">{d.split(' · ')[-1].capitalize()}</span></div>
      <div class="s-right"><b class="s-num">{v2}</b><span class="s-muted">de {v}</span></div></div>'''
                   for (n, v, d, on), v2 in zip([NOTAS[1], NOTAS[2], NOTAS[0]], ['R$ 6.383,56', 'R$ 2.863,74', 'R$ 5.329,10']))
    rows = rows.replace('s-cb"', 's-cb on"', 1) if False else rows
    return f'''<div class="s-screen sheet-open">{screen_inicio(dim=True)}
  <div class="s-sheet"><span class="s-grab"></span>
    <div class="s-row"><div><div class="s-title sm">Sacar</div><span class="s-muted">Saldo disponível R$ 15.647,00</span></div><span class="s-x">×</span></div>
    <div class="s-card s-list">{rows}</div>
    <div class="s-row" style="align-items:flex-end;margin-top:1.4em"><div><span class="s-muted">Você recebe aprox.</span><b class="s-mid">R$ 11.712,66</b></div><span class="s-muted">2 parcelas · R$ 12.596,00</span></div>
    <div class="s-btns"><span class="s-btn">Agendar</span><span class="s-btn dark">Sacar agora</span></div>
  </div>
</div>'''


SCREENS = {'app-inicio': screen_inicio, 'app-notas': screen_notas, 'app-sacar': screen_sacar}


def phone(src, alt, cls=''):
    # Prints reais do app (modo claro), com uma faixa no topo para a câmera não cobrir nada
    return (f'<div class="phone {cls}"><div class="phone-in">'
            f'<img src="img/{src}.webp" alt="{alt}" width="540" height="1185" decoding="async"></div></div>')


def badges(dark=False):
    # Selos oficiais: coloque img/badge-app-store.svg e img/badge-google-play.svg (baixados da Apple e do Google).
    # Enquanto o arquivo não existir, aparece o selo em texto.
    return (f'<div class="badges{" on-dark" if dark else ""}">'
            f'<a class="badge" href="{APP_STORE_URL}" target="_blank" rel="noopener" aria-label="Baixar na App Store">'
            f'<img class="badge-img" src="img/badge-app-store.svg" alt="" hidden>'
            f'<span class="badge-txt">{I["phonei"]}<span><small>Disponível na</small><b>App Store</b></span></span></a>'
            f'<a class="badge" href="{PLAY_STORE_URL}" target="_blank" rel="noopener" aria-label="Disponível no Google Play">'
            f'<img class="badge-img" src="img/badge-google-play.svg" alt="" hidden>'
            f'<span class="badge-txt">{I["playi"]}<span><small>Disponível no</small><b>Google Play</b></span></span></a></div>')


def head(title, desc):
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#f5f2eb">
<meta name="color-scheme" content="light">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="icon" type="image/png" href="img/mark-rosa.png">
<link rel="stylesheet" href="style.css">
</head>
<body>
'''


def header(active, home=False):
    links = ''.join(f'<li><a href="#{a}">{label}</a></li>' for a, label in SECTIONS)
    return f'''<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<main>
<div class="top">
<div class="hero-card{' home' if home else ''}" id="inicio">
<header class="site-header">
  <div class="nav">
    <a class="logo" href="#inicio" aria-label="Lottus Finance, início"><img src="img/logo-rosa.png" alt="Lottus" width="132" height="35"></a>
    <ul class="nav-links">{links}</ul>
    <a class="btn btn-rosa nav-cta" href="#contato">Baixe o app</a>
    <button class="nav-toggle" aria-label="Abrir menu" aria-expanded="false">{I['menu']}</button>
  </div>
</header>
'''



FOOTER = f'''</main>
<footer class="site-footer">
  <div class="foot-cta wrap">
    <h2>Venda a prazo.<br>Receba hoje.<br><span>Baixe o app.</span></h2>
    {badges(dark=True)}
  </div>
  <div class="wrap foot-base">
    <div class="foot-line">
      <div class="foot-info">
        <span>{I['mail']} contato@lottusfinance.com.br</span>
      </div>
      <div class="foot-social">
        <a href="{INSTAGRAM_URL}" target="_blank" rel="noopener" aria-label="Instagram da Lottus"><img class="social-img" src="img/icon-instagram.svg" alt="" hidden><span class="social-txt">Instagram</span></a>
        <a href="{LINKEDIN_URL}" target="_blank" rel="noopener" aria-label="LinkedIn da Lottus"><img class="social-img" src="img/icon-linkedin.svg" alt="" hidden><span class="social-txt">LinkedIn</span></a>
      </div>
    </div>
    <p class="foot-legal-text">A Lottus pertence à <b>Lottus Securitizadora de Créditos S/A</b>. As antecipações estão sujeitas a análise de crédito e são feitas por meio de cessão de direitos creditórios com coobrigação a fundos e instituições parceiras, como a Credit4sure Securitizadora de Créditos S.A. (C4S Securitizadora), CNPJ 37.566.075/0001-44. O custo de cada operação (deságio, tarifas e impostos, quando houver) e o valor líquido são mostrados no app antes da assinatura. Os valores do simulador são ilustrativos.</p>
    <div class="foot-links">
      <a href="contato.html#canais">Política de Privacidade</a>
      <a href="contato.html#duvidas">Dúvidas frequentes</a>
      <a href="contato.html#form">Fale com a Lottus</a>
      <span>© <span data-year>2026</span> Lottus</span>
    </div>
  </div>
</footer>
<script src="main.js"></script>
</body>
</html>
'''


def li(items):
    return ''.join(f'<li>{I["check"]}<span>{t}</span></li>' for t in items)


CTA = ''

# --------------------------------------------------------------------- mini telas
MOCK_NFSE = f'''<div class="mock" aria-hidden="true">
  <div class="mock-title">Notas fiscais</div>
  <div class="mock-row"><span class="mock-ico">{I['doc']}</span><div class="grow"><b>Consultoria — Grupo Aurora</b><small>NFS-e 482 · vence 30 de nov.</small></div><b class="num">R$ 18.400,00</b></div>
  <div class="mock-row"><span class="mock-ico">{I['doc']}</span><div class="grow"><b>Manutenção — Rede Litoral</b><small>NFS-e 479 · vence 15 de dez.</small></div><b class="num">R$ 7.250,00</b></div>
  <div class="mock-row"><span class="mock-ico">{I['doc']}</span><div class="grow"><b>Treinamento — Vale Norte</b><small>NFS-e 476 · vence 9 de jan.</small></div><b class="num">R$ 4.900,00</b></div>
  <small style="text-align:center">Exemplo ilustrativo</small>
</div>'''
MOCK_AGENDA = f'''<div class="mock" aria-hidden="true">
  <div class="mock-title">Saque agendado</div>
  <div class="mock-row"><span class="mock-ico">{I['calendar']}</span><div class="grow"><b>Segunda, 3 de nov.</b><small>2 duplicatas · às 9h</small></div><span class="pill">Agendado</span></div>
  <div class="mock-row"><span class="mock-ico">{I['calendar']}</span><div class="grow"><b>Sexta, 28 de nov.</b><small>Folha de pagamento</small></div><span class="pill">Agendado</span></div>
  <div class="mock-row"><span class="mock-ico">{I['check']}</span><div class="grow"><b>Quarta, 15 de out.</b><small>Antecipação recebida</small></div><span class="ok num">+ R$ 9.812,40</span></div>
  <small style="text-align:center">Exemplo ilustrativo</small>
</div>'''
MOCK_TEAM = f'''<div class="mock" aria-hidden="true">
  <div class="mock-title">Equipe</div>
  <div class="mock-row"><span class="mock-ico">{I['team']}</span><div class="grow"><b>Mariana · Sócia</b><small>Administradora · assina sem limite</small></div></div>
  <div class="mock-row"><span class="mock-ico">{I['pen']}</span><div class="grow"><b>Rafael · Financeiro</b><small>Assina até R$ 20 mil por operação</small></div><span class="pill">Alçada</span></div>
  <div class="mock-row"><span class="mock-ico">{I['eye']}</span><div class="grow"><b>Beatriz · Contabilidade</b><small>Só consulta</small></div></div>
  <small style="text-align:center">Exemplo ilustrativo</small>
</div>'''
MOCK_MAIL = f'''<div class="mock" aria-hidden="true">
  <div class="mock-row" style="border:0"><span class="mock-ico">{I['mail']}</span><div class="grow"><b>Para: notas@lottusfinance.com.br</b><small>Anexos: NF-e_1004.xml, notas_outubro.zip</small></div></div>
  <div class="mock-row"><span class="mock-ico">{I['check']}</span><div class="grow"><b>12 notas importadas</b><small>Emissor reconhecido pelo CNPJ</small></div><span class="ok">Pronto</span></div>
  <small style="text-align:center">Exemplo ilustrativo</small>
</div>'''
MOCK_COBRANCA = f'''<div class="mock" aria-hidden="true">
  <div class="mock-title">Aviso ao seu cliente</div>
  <div class="mock-row"><span class="mock-ico">{I['mail']}</span><div class="grow"><b>Boleto da NF-e 1004</b><small>Enviado ao financeiro do sacado</small></div><span class="pill">Enviado</span></div>
  <div class="mock-row"><span class="mock-ico">{I['check']}</span><div class="grow"><b>Pagamento confirmado</b><small>Baixa automática da duplicata</small></div><span class="ok">Pago</span></div>
  <small style="text-align:center">Exemplo ilustrativo</small>
</div>'''

def reviews_html():
    if not REVIEWS:
        return ''
    cards = ''.join(f'''<figure class="review"><div class="review-head"><b>{r['name']}</b><span class="review-src">{r.get('source', '')}</span></div>
      <div class="stars" aria-label="{r['stars']} de 5 estrelas">{I['star'] * int(r['stars'])}</div>
      <blockquote>{r['text']}</blockquote>{f'<figcaption>{r["company"]}</figcaption>' if r.get('company') else ''}</figure>''' for r in REVIEWS)
    return f'''<section class="reviews">
  <div class="wrap">
    <h2 class="h-mid">Empresas reais que agora vendem a prazo <em>sem apertar o caixa</em></h2>
    <div class="review-track">{cards}</div>
    <a class="btn btn-rosa" href="contato.html#form">Quero antecipar {I['arrow']}</a>
  </div>
</section>'''


# ============================================================================ INÍCIO
INDEX = head('Lottus Finance', 'Antecipe suas notas fiscais pelo app da Lottus. Você vê quanto vai receber antes de assinar e o dinheiro cai na conta da empresa em até 1 hora.') + header('index', home=True) + f'''
<div class="hero-photo" aria-hidden="true"></div>
<div class="hero-inner hero-grid">
  <div class="hero-copy">
    <h1 class="rise">Não precisa mais esperar<br><span>o cliente pagar.</span></h1>
    <p class="lead rise d1">Se a sua empresa vende a prazo para outras empresas, a Lottus adianta o dinheiro das notas fiscais. Simples, transparente e direto no app, com o valor final na tela antes de assinar.</p>
    <ul class="hero-proof rise d2">
      <li>{I['bolt']} Dinheiro em até 1h após a aprovação</li>
      <li>{I['eye']} Taxa e valor final antes de assinar</li>
    </ul>
    <div class="hero-actions rise d3">{badges()}</div>
  </div>
  <div class="hero-phone rise d2">{phone('app-inicio', 'Tela inicial do app Lottus com saldo disponível para antecipar')}</div>
</div>
</div>
</div>

<section class="intro" id="conteudo">
  <div class="wrap intro-grid">
    <div class="stack-lg">
      <h2 class="h-mid">A Lottus é a forma mais <em>rápida</em> e <em>clara</em> de antecipar suas notas fiscais.</h2>
      <p class="muted">Cliente pagando em 60 dias, fornecedor cobrando hoje. A gente conhece esse aperto e criou um jeito simples de resolver: você manda a nota, vê quanto recebe e o dinheiro cai na conta da empresa.</p>
      <ul class="checks">
        <li>{I['check']} Sem trocar de banco e sem abrir conta nova</li>
        <li>{I['check']} Contrato completo na tela, assinado só depois de ler</li>
        <li>{I['check']} Escolha nota por nota, ou só algumas parcelas</li>
      </ul>
    </div>
  </div>
  <div class="wrap mini-cards">
    <div class="mini"><span class="mini-ico">{I['bolt']}</span><h3>Dinheiro <em>no mesmo dia</em></h3><p>Aprovou, recebeu. Em até 1 hora o valor está na conta da empresa.</p></div>
    <div class="mini"><span class="mini-ico">{I['doc']}</span><h3><em>Notas</em> que chegam sozinhas</h3><p>Encaminhe o XML para notas@lottusfinance.com.br e ele aparece no app.</p></div>
    <div class="mini"><span class="mini-ico">{I['eye']}</span><h3>Transparência <em>do início ao fim</em></h3><p>Deságio, tarifa e valor líquido antes do botão de assinar. Sem surpresa.</p></div>
  </div>
</section>

<section class="how">
  <div class="how-art"><div class="how-photo" aria-hidden="true"></div>
  </div>
  <div class="how-card">
    <h2 class="h-mid">Veja como é simples antecipar com a Lottus</h2>
    <ol class="how-steps">
      <li><span>1</span><div><b>Baixe o app e faça o cadastro</b><p>Dados da empresa e de quem a representa. Uma vez só.</p></div></li>
      <li><span>2</span><div><b>Análise de crédito</b><p>Nossa equipe libera o seu limite e avisa no app se faltar algo.</p></div></li>
      <li><span>3</span><div><b>Envio de NF-e</b><p>Pelo app, em .zip ou por e-mail.</p></div></li>
      <li><span>4</span><div><b>Liquidação em até 1h</b><p>Escolha as notas, leia o termo, assine e receba.</p></div></li>
    </ol>
    <p class="how-dl">Baixe e faça já sua simulação!</p>
    {badges()}
  </div>
</section>

<section id="simulador">
  <div class="wrap">
    <div class="section-head">
      <h2 class="h-mid">Quanto sua nota vale <em>hoje</em>?</h2>
      <p class="muted">Arraste para escolher o valor das notas e o prazo até o vencimento. A conta é simples e aparece igualzinha no app, antes de qualquer assinatura.</p>
    </div>
    <div class="sim">
      <div class="sim-controls">
        <div class="sim-field">
          <label for="sim-valor">Valor das notas</label>
          <div class="sim-value num" id="sim-valor-out" aria-live="polite">R$ 30.000,00</div>
          <input type="range" id="sim-valor" min="1000" max="100000" step="500" value="30000" aria-describedby="sim-ends">
          <div class="range-ends num" id="sim-ends"><span>R$ 1 mil</span><span>R$ 100 mil</span></div>
        </div>
        <div class="sim-field">
          <span class="sim-label" id="sim-prazo-l">Vencimento das notas</span>
          <div class="seg" role="group" aria-labelledby="sim-prazo-l">
            <button type="button" data-dias="30" aria-pressed="false">30 dias</button>
            <button type="button" data-dias="60" aria-pressed="true">60 dias</button>
            <button type="button" data-dias="90" aria-pressed="false">90 dias</button>
            <button type="button" data-dias="120" aria-pressed="false">120 dias</button>
          </div>
        </div>
        <div class="sim-how">
          <span class="sim-how-ico">{I['eye']}</span>
          <p><b>Como a conta é feita</b>Custo = valor das notas × taxa ao mês × prazo ÷ 30 dias. No app, você vê esse mesmo cálculo para cada nota antes de assinar.</p>
        </div>
      </div>
      <div class="sim-result" aria-live="polite">
        <div>
          <div class="label" style="color:#e8708b">Você recebe aproximadamente</div>
          <div class="sim-big num" id="sim-liquido" style="margin-top:12px">R$ 28.866,00</div>
        </div>
        <div class="sim-bar" aria-hidden="true"><i id="sim-bar-net" style="width:96%"></i><i id="sim-bar-cost" style="width:4%"></i></div>
        <dl class="sim-lines num" style="margin:0">
          <div><dt>Valor das notas</dt><dd id="sim-face">R$ 30.000,00</dd></div>
          <div><dt>Custo da antecipação</dt><dd id="sim-custo">− R$ 1.134,00</dd></div>
          <div><dt>Prazo</dt><dd id="sim-dias">60 dias</dd></div>
          <div><dt>Taxa de exemplo</dt><dd id="sim-taxa">1,89% ao mês</dd></div>
        </dl>
        <p class="sim-note">Simulação com taxa de exemplo. A taxa da sua empresa é definida na análise de crédito e depende também de quem são os seus clientes. Tarifas e impostos, quando houver, aparecem no resumo do app.</p>
        <a class="btn btn-light" href="contato.html#form">Quero minha taxa {I['arrow']}</a>
      </div>
    </div>
  </div>
</section>

<section class="trust">
  <div class="wrap">
    <div class="section-head">
      <h2 class="h-mid">Confiança e segurança</h2>
      <p class="muted">Crédito é coisa séria. Por isso cada contrato, assinatura e dado da sua empresa recebe o mesmo cuidado que a gente teria com o nosso.</p>
    </div>
    <div class="trust-cards">
      <div class="trust-card"><span class="trust-ico">{I['pen']}</span><h3>Assinatura<br>com prova</h3><p>Cada assinatura guarda o texto exato que você leu, data, hora e aparelho, encadeados para que nada seja alterado depois.</p></div>
      <div class="trust-card"><span class="trust-ico">{I['bank']}</span><h3>Parceiros<br>regulados</h3><p>Os créditos são comprados por securitizadoras e fundos parceiros, com contrato e termo de cessão para cada operação.</p></div>
      <div class="trust-card"><span class="trust-ico">{I['lock']}</span><h3>Privacidade<br>nos seus termos</h3><p>Seus dados servem só para analisar e operar o crédito, seguindo a LGPD. Nada de vender cadastro.</p></div>
    </div>
  </div>
</section>

<section class="faq-split" id="duvidas">
  <div class="wrap faq-grid">
    <div class="stack-lg">
      <h2 class="h-mid">Dúvidas frequentes</h2>
      <p class="muted">Tire as principais dúvidas sobre como a Lottus funciona, quanto custa e o que muda na rotina da sua empresa.</p>
      <div class="row-cta"><a class="btn btn-rosa" href="contato.html#form">Falar com a Lottus {I['arrow']}</a><span class="muted small">Gente de verdade<br><b>do outro lado</b></span></div>
    </div>
    <div class="faq compact">
      <details><summary>Quem pode antecipar com a Lottus?</summary><p>Empresas com CNPJ que vendem a prazo para outras empresas e emitem nota fiscal de venda (NF-e) ou de serviço (NFS-e). O cadastro é feito por um sócio ou por um procurador da empresa.</p></details>
      <details><summary>Quanto custa?</summary><p>O custo é um desconto sobre o valor das notas, proporcional ao prazo até o vencimento. A taxa da sua empresa sai na análise de crédito. Em cada antecipação, o app mostra o valor das notas, o desconto, eventuais tarifas e o valor líquido antes de você assinar.</p></details>
      <details><summary>Meu cliente vai saber da antecipação?</summary><p>Sim. Quando você antecipa, a nota é cedida e o seu cliente recebe um aviso com o boleto para pagar no vencimento, como já faria. Isso é o que dá segurança jurídica à operação, e a comunicação é feita de forma cordial, em nome da sua empresa.</p></details>
      <details><summary>E se o meu cliente atrasar ou não pagar?</summary><p>A antecipação da Lottus é feita com coobrigação: se o seu cliente não pagar, a sua empresa responde pelo valor. Por isso analisamos também quem são os seus clientes, para você antecipar com tranquilidade.</p></details>
      <details><summary>Preciso trocar de banco ou mudar algo na minha rotina?</summary><p>Não. Você continua emitindo as notas no seu sistema e recebendo na conta que já usa. A única novidade é mandar o XML para a Lottus, pelo app ou por e-mail.</p></details>
    </div>
  </div>
</section>

{reviews_html()}
''' + FOOTER

# ========================================================================== SOLUÇÕES
SOLUCOES = head('Soluções Lottus', 'Antecipação de NF-e e NFS-e, recebimento automático de notas, saque agendado, equipe com alçadas e cobrança integrada.') + header('solucoes') + f'''
  <div class="hero-inner">
    <h1 class="rise" style="max-width:15ch">Tudo para transformar vendas a prazo em caixa</h1>
    <p class="lead rise d1">Comece com a antecipação de notas e vá usando o resto conforme a empresa cresce. Tudo no mesmo app, com o mesmo cadastro.</p>
  </div>
</div>
</div>
<div id="conteudo"></div>

<section style="padding-top:0">
  <div class="wrap">
    <article class="solution" id="nfe">
      <div class="solution-body">
        <span class="label">Antecipação de NF-e</span>
        <h2>Receba hoje o que só entraria daqui a meses</h2>
        <p class="lead">Você vendeu, entregou e emitiu a nota. Agora não precisa esperar o cliente pagar para ter o dinheiro: a Lottus adianta o valor das duplicatas, com desconto proporcional ao prazo.</p>
        <ul>{li(['Antecipe uma nota, várias, ou só algumas parcelas', 'Veja deságio, tarifa e valor líquido antes de assinar', 'Leia o termo de cessão completo direto no app', 'Receba na conta da empresa em até 1 hora após a aprovação'])}</ul>
      </div>
      <div class="solution-art">{phone('app-notas', 'Lista de notas fiscais disponíveis no app')}</div>
    </article>

    <article class="solution flip" id="email">
      <div class="solution-body">
        <span class="label">Recebimento automático</span>
        <h2>Mandou o e-mail, a nota já está no app</h2>
        <p class="lead">Encaminhe o XML ou um .zip com várias notas para <b>notas@lottusfinance.com.br</b>. A gente reconhece quem emitiu pelo CNPJ e coloca cada nota na conta certa, pronta para antecipar.</p>
        <ul>{li(['Funciona com o XML que seu sistema já gera', 'Aceita arquivos .zip com muitas notas de uma vez', 'Seu contador ou ERP pode mandar direto', 'Notas canceladas ou duplicadas ficam de fora'])}</ul>
      </div>
      <div class="solution-art">{MOCK_MAIL}</div>
    </article>

    <article class="solution" id="nfse">
      <div class="solution-body">
        <span class="label">Notas de serviço (NFS-e)</span>
        <h2>Para quem vende serviço para outras empresas</h2>
        <p class="lead">Consultoria, manutenção, tecnologia, logística, treinamento. Se a sua empresa emite NFS-e para clientes pessoa jurídica e recebe a prazo, também pode antecipar.</p>
        <ul>{li(['Mesmo app e mesmo fluxo da NF-e', 'Bom para contratos recorrentes e medições mensais', 'Análise do tomador do serviço incluída'])}</ul>
      </div>
      <div class="solution-art">{MOCK_NFSE}</div>
    </article>

    <article class="solution flip" id="agendar">
      <div class="solution-body">
        <span class="label">Saque e agendamento</span>
        <h2>Saque agora ou no dia que for melhor</h2>
        <p class="lead">Precisa do dinheiro hoje? Toque em sacar. Precisa só no dia da folha? Agende. Na data escolhida, a antecipação é feita de manhã com a taxa do dia e o valor cai na conta.</p>
        <ul>{li(['Escolha as parcelas e veja o valor aproximado na hora', 'Agende e cancele até a véspera', 'Se uma nota deixar de estar disponível, você é avisado'])}</ul>
      </div>
      <div class="solution-art">{phone('app-sacar', 'Tela de saque com opção de agendar', 'peek-bottom')}</div>
    </article>

    <article class="solution" id="equipe">
      <div class="solution-body">
        <span class="label">Equipe e alçadas</span>
        <h2>Cada pessoa com o acesso certo</h2>
        <p class="lead">Quem cuida do financeiro no dia a dia não precisa da senha do sócio. Convide a equipe e defina quem só consulta, quem opera e até quanto cada um pode assinar.</p>
        <ul>{li(['Acessos de administrador, financeiro e consulta', 'Limite de assinatura por operação e por mês', 'Acima do limite, a operação espera um administrador', 'Histórico de quem fez o quê'])}</ul>
      </div>
      <div class="solution-art">{MOCK_TEAM}</div>
    </article>

    <article class="solution flip" id="cobranca">
      <div class="solution-body">
        <span class="label">Cobrança integrada</span>
        <h2>Seu cliente recebe o boleto. Você não precisa correr atrás</h2>
        <p class="lead">Depois da antecipação, o seu cliente é avisado por e-mail e recebe o boleto para pagar no vencimento. A baixa é automática e você acompanha tudo pelo app.</p>
        <ul>{li(['Aviso de cessão claro e cordial', 'Boleto emitido em nome de quem comprou o crédito', 'Status de cada duplicata no app'])}</ul>
      </div>
      <div class="solution-art">{MOCK_COBRANCA}</div>
    </article>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <div class="section-head"><h2>Para quem é a Lottus</h2><p class="lead">Empresas que vendem para outras empresas e não querem que o prazo do cliente vire aperto no próprio caixa.</p></div>
    <div class="who">
      <div><h3>Indústrias e distribuidoras</h3><p>Vendem com prazo longo para o varejo e precisam comprar matéria-prima antes de receber.</p></div>
      <div><h3>Atacado e comércio B2B</h3><p>Giro alto, muitas notas por mês e clientes que pagam em 30, 60 ou 90 dias.</p></div>
      <div><h3>Prestadores de serviço</h3><p>Contratos mensais com empresas, folha para pagar todo dia 5 e recebimento só no dia 30.</p></div>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <div class="compare">
      <div class="compare-col old">
        <h3>O caminho de sempre</h3>
        <ul>
          <li>{I['x']}<span>Agência, gerente e papelada para cada desconto de duplicata</span></li>
          <li>{I['x']}<span>Taxa que você só entende no extrato</span></li>
          <li>{I['x']}<span>Contrato de dezenas de páginas assinado sem ler</span></li>
          <li>{I['x']}<span>Limite preso a garantias e reciprocidade</span></li>
        </ul>
      </div>
      <div class="compare-col new">
        <h3>Com a Lottus</h3>
        <ul>
          <li>{I['check']}<span>Tudo pelo app, do cadastro ao saque</span></li>
          <li>{I['check']}<span>Valor líquido na tela antes de assinar</span></li>
          <li>{I['check']}<span>Termo completo no app, assinado depois da leitura</span></li>
          <li>{I['check']}<span>Limite que cresce com as notas que você envia</span></li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="dark rounded-band" id="parceiros">
  <div class="wrap split top">
    <div class="section-head" style="margin:0">
      <span class="label">Para fundos e instituições</span>
      <h2>Originação de recebíveis com análise e lastro organizados</h2>
      <p class="lead">A Lottus trabalha com FIDCs, securitizadoras e instituições parceiras que compram os créditos cedidos pelas empresas da plataforma.</p>
      <a class="btn btn-light" href="contato.html#form" style="align-self:flex-start;margin-top:8px">Quero ser parceiro {I['arrow']}</a>
    </div>
    <div class="channels">
      <div class="channel"><span class="value-ico">{I['doc']}</span><div><h3>Lastro verificável</h3><p>Cada duplicata vem com a NF-e validada, o termo de cessão assinado e o registro completo da assinatura.</p></div></div>
      <div class="channel"><span class="value-ico">{I['pen']}</span><div><h3>Aceite no portal</h3><p>O representante do fundo vê a operação, lê o termo e assina o aceite num portal próprio.</p></div></div>
      <div class="channel"><span class="value-ico">{I['bolt']}</span><div><h3>Cobrança integrada</h3><p>Boletos emitidos em nome do fundo, pela conta e pela API do próprio parceiro, com baixa automática.</p></div></div>
    </div>
  </div>
</section>
''' + '<div style="height:clamp(56px,7vw,96px)"></div>' + CTA + FOOTER

# ========================================================================= SOBRE NÓS
SOBRE = head('Sobre a Lottus', 'A Lottus nasceu para que empresas que vendem a prazo não precisem esperar o cliente pagar para crescer.') + header('sobre') + f'''
  <div class="hero-inner split">
    <div>
      <h1 class="rise">Crédito no ritmo de quem vende</h1>
      <p class="lead rise d1">Toda empresa que vende para outra empresa conhece o descompasso: o fornecedor quer receber agora, o cliente paga daqui a 60 dias. A Lottus existe para fechar essa conta.</p>
    </div>
    <div class="rise d2" style="display:flex;justify-content:center">{phone('app-inicio', 'Tela inicial do app Lottus')}</div>
  </div>
</div>
</div>
<div id="conteudo"></div>

<section style="padding-top:0">
  <div class="wrap split top">
    <h2>Por que a gente começou</h2>
    <div class="prose">
      <p>Antecipar recebíveis não é novidade. O que sempre incomodou foi o caminho: ir até a agência, juntar pilhas de documentos, esperar dias por uma resposta e assinar um contrato que ninguém tem tempo de ler.</p>
      <p>A gente acredita que o crédito para empresas pode ser <strong>tão simples quanto pagar uma conta pelo celular</strong>, sem perder o cuidado que o assunto exige. Por isso juntamos tecnologia e uma equipe de análise de verdade: o app cuida da parte chata, as pessoas cuidam das decisões.</p>
      <p>O resultado é uma plataforma em que você manda a nota, vê o valor exato, lê o contrato inteiro e recebe. E se tiver dúvida, fala com alguém que entende do seu negócio.</p>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <div class="section-head"><h2>No que a gente acredita</h2></div>
    <div class="values">
      <div class="value"><span class="value-ico">{I['eye']}</span><h3>Clareza antes de tudo</h3><p>Se a empresa não entende quanto vai pagar, a gente explicou mal. Números e condições aparecem antes da assinatura, em português simples.</p></div>
      <div class="value"><span class="value-ico">{I['chat']}</span><h3>Relação de longo prazo</h3><p>Crédito bom é o que a empresa consegue usar de novo no mês seguinte. A gente prefere crescer junto a ganhar numa operação só.</p></div>
      <div class="value"><span class="value-ico">{I['shield']}</span><h3>Cuidado com o que é sério</h3><p>Contrato, assinatura e dados são tratados com rigor. Cada passo fica registrado e cada informação é usada só para o que foi combinado.</p></div>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <div class="section-head"><h2>Como a operação funciona por dentro</h2><p class="lead">Três partes, cada uma com um papel claro. Todas aparecem nos contratos que você lê no app.</p></div>
    <div class="parties">
      <div class="party"><span class="label">Sua empresa</span><h3>Cedente</h3><p>Vende a prazo, emite a nota e cede as duplicatas em troca do dinheiro antecipado. Continua responsável pela existência e pelo pagamento dos créditos.</p></div>
      <div class="party"><span class="label">Lottus</span><h3>Plataforma</h3><p>Faz o cadastro, a análise de crédito, prepara os contratos, registra as assinaturas e cuida da notificação e da cobrança dos seus clientes.</p></div>
      <div class="party"><span class="label">Parceiros</span><h3>Cessionários</h3><p>Fundos, securitizadoras e instituições habilitadas pela Lottus que compram os créditos e pagam o valor antecipado à sua empresa.</p></div>
    </div>
  </div>
</section>

<section class="dark rounded-band">
  <div class="wrap split top">
    <div class="section-head" style="margin:0">
      <span class="label">Segurança</span>
      <h2>Contrato que você lê. Assinatura que vale.</h2>
      <p class="lead">Assinar pelo celular precisa ser tão seguro quanto assinar no papel. Então a gente foi além do básico.</p>
    </div>
    <div class="channels">
      <div class="channel"><span class="value-ico">{I['doc']}</span><div><h3>Leitura antes da assinatura</h3><p>Todo contrato e termo abre inteiro numa janela própria. O botão de assinar só aparece depois que você chega ao fim do texto.</p></div></div>
      <div class="channel"><span class="value-ico">{I['pen']}</span><div><h3>Registro de cada assinatura</h3><p>Guardamos o código único do texto assinado, data e hora, aparelho e confirmação do signatário, encadeados para que nada seja alterado depois.</p></div></div>
      <div class="channel"><span class="value-ico">{I['lock']}</span><div><h3>Dados tratados pela LGPD</h3><p>Coletamos o necessário para analisar e operar o crédito, com acesso restrito e por tempo definido. Você pode pedir informações sobre seus dados quando quiser.</p></div></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap split top">
    <div class="section-head" style="margin:0">
      <h2>Para onde estamos indo</h2>
      <p class="lead">Começamos pela antecipação porque é onde a dor do caixa aparece primeiro. Mas a ideia é cuidar de todo o crédito da empresa.</p>
    </div>
    <ol class="timeline">
      <li class="now"><span class="when">Hoje</span><h3>Antecipação de notas</h3><p>NF-e e NFS-e pelo app, com recebimento automático por e-mail, saque agendado e equipe com alçadas.</p></li>
      <li><span class="when">Próximo passo</span><h3>Novas linhas de crédito</h3><p>Notas comerciais e cédulas de crédito bancário para prazos maiores e projetos de crescimento.</p></li>
      <li><span class="when">Mais adiante</span><h3>Conta da empresa na Lottus</h3><p>Receber, pagar e antecipar no mesmo lugar, com a conta conectada ao crédito.</p></li>
    </ol>
  </div>
</section>
''' + CTA + FOOTER

# =========================================================================== CONTATO
CONTATO = head('Contato Lottus', 'Fale com a Lottus: antecipação de recebíveis, parcerias com fundos e dúvidas sobre o app.') + header('contato') + f'''
  <div class="hero-inner">
    <h1 class="rise" style="max-width:14ch">Vamos conversar sobre o seu caixa</h1>
    <p class="lead rise d1">Conte um pouco da sua empresa e do que você precisa. Quanto mais detalhe, mais certeira a primeira resposta.</p>
  </div>
</div>
</div>
<div id="conteudo"></div>

<section style="padding-top:0" id="form">
  <div class="wrap contact-grid">
    <div class="form-card">
      <form id="contato-form" novalidate class="form-done" style="gap:22px">
        <div class="field">
          <span style="font-size:14.5px;font-weight:600">Sobre o que você quer falar?</span>
          <div class="chips">
            <label><input type="checkbox" name="assunto" value="Antecipar notas" id="as-antecipar" checked><span>Antecipar notas</span></label>
            <label><input type="checkbox" name="assunto" value="Já sou cliente" id="as-cliente"><span>Já sou cliente</span></label>
            <label><input type="checkbox" name="assunto" value="Parceria (fundo ou instituição)" id="as-parceria"><span>Parceria com fundo</span></label>
            <label><input type="checkbox" name="assunto" value="Outro assunto" id="as-outro"><span>Outro assunto</span></label>
          </div>
        </div>
        <div class="form-row">
          <div class="field" data-required><label for="f-nome">Seu nome</label><input id="f-nome" name="nome" autocomplete="name" placeholder="Como podemos te chamar"><span class="err">Conte seu nome para a gente.</span></div>
          <div class="field"><label for="f-empresa">Empresa</label><input id="f-empresa" name="empresa" autocomplete="organization" placeholder="Nome da empresa"></div>
        </div>
        <div class="form-row">
          <div class="field" data-required><label for="f-email">E-mail</label><input id="f-email" name="email" type="email" autocomplete="email" placeholder="voce@empresa.com.br"><span class="err">Confira o e-mail, parece que falta algo.</span></div>
          <div class="field"><label for="f-tel">Telefone ou WhatsApp</label><input id="f-tel" name="telefone" inputmode="tel" autocomplete="tel" placeholder="(11) 90000-0000"></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="f-cnpj">CNPJ</label><input id="f-cnpj" name="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00"><span class="hint">Opcional, mas ajuda a gente a se preparar.</span></div>
          <div class="field"><label for="f-fat">Faturamento mensal</label>
            <select id="f-fat" name="faturamento">
              <option value="">Prefiro não informar</option>
              <option>Até R$ 100 mil</option><option>De R$ 100 mil a R$ 500 mil</option>
              <option>De R$ 500 mil a R$ 2 milhões</option><option>Acima de R$ 2 milhões</option>
            </select></div>
        </div>
        <div class="field"><label for="f-msg">Mensagem</label><textarea id="f-msg" name="mensagem" placeholder="Ex.: vendemos para supermercados com prazo de 60 dias e queremos antecipar parte das notas todo mês."></textarea></div>
        <label class="consent field" data-required style="flex-direction:row"><input type="checkbox" id="f-ok" name="consentimento"><span>Concordo que a Lottus use estes dados para responder ao meu contato, conforme a LGPD. <span class="err">Precisamos da sua concordância para responder.</span></span></label>
        <p class="small" id="form-error" hidden style="color:var(--rosa)">Não conseguimos enviar agora. Tente de novo em alguns minutos ou escreva direto para o e-mail ao lado.</p>
        <button class="btn btn-primary" type="submit" style="align-self:flex-start">Enviar mensagem {I['arrow']}</button>
      </form>
      <div class="form-done" id="form-done" hidden>
        <h2 id="done-title" style="font-size:30px">Sua mensagem está pronta</h2>
        <p class="muted" id="done-text">Copie o texto abaixo e envie para <b>{'contato@lottusfinance.com.br'}</b>. Assim ele chega direto ao nosso time.</p>
        <div id="done-copy" class="stack" style="display:flex;flex-direction:column;gap:12px">
          <div class="copybox" id="done-summary"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" type="button" data-copy-summary>Copiar mensagem</button><button class="btn btn-ghost" type="button" data-copy="contato@lottusfinance.com.br">Copiar e-mail</button></div>
        </div>
        <button class="btn btn-ghost" type="button" id="form-again" style="align-self:flex-start">Escrever outra mensagem</button>
      </div>
    </div>

    <div class="channels" id="canais">
      <div class="channel"><span class="value-ico">{I['chat']}</span><div><h3>Atendimento e novos clientes</h3><p>Dúvidas sobre antecipação, cadastro e condições.</p><span class="addr"><span>contato@lottusfinance.com.br</span><button class="copy" data-copy="contato@lottusfinance.com.br">Copiar</button></span></div></div>
      <div class="channel"><span class="value-ico">{I['doc']}</span><div><h3>Envio de notas fiscais</h3><p>Para clientes com cadastro: mande o XML ou um .zip e a nota aparece no app.</p><span class="addr"><span>notas@lottusfinance.com.br</span><button class="copy" data-copy="notas@lottusfinance.com.br">Copiar</button></span></div></div>
      <div class="channel"><span class="value-ico">{I['lock']}</span><div><h3>Privacidade e dados pessoais</h3><p>Pedidos sobre seus dados, conforme a LGPD.</p><span class="addr"><span>privacidade@lottusfinance.com.br</span><button class="copy" data-copy="privacidade@lottusfinance.com.br">Copiar</button></span></div></div>
      <div class="channel" style="background:var(--grafite);color:#f5f0e8;border-color:var(--grafite)"><span class="value-ico" style="background:#3a2228;color:#e8708b">{I['bank']}</span><div><h3>Fundos e instituições</h3><p style="color:#b9ada4">Quer comprar recebíveis originados pela Lottus? Marque “Parceria com fundo” no formulário e conte sobre a sua política.</p></div></div>
    </div>
  </div>
</section>

<section id="duvidas" style="padding-top:clamp(40px,6vw,80px)">
  <div class="wrap">
    <div class="section-head"><h2>Antes de escrever, talvez ajude</h2></div>
    <div class="faq">
      <details><summary>Já sou cliente e minha nota não apareceu no app. O que faço?</summary><p>Confira se o arquivo enviado é o XML da nota (não o PDF/DANFE) e se a nota foi emitida pelo CNPJ cadastrado. Notas canceladas não entram. Se continuar sem aparecer, escreva para contato@lottusfinance.com.br com o número da nota.</p></details>
      <details><summary>Quais documentos vou precisar no cadastro?</summary><p>Os dados da empresa, o documento de quem representa a empresa e, conforme o caso, o contrato social e comprovantes que o app pedir. Tudo é enviado pelo próprio app, com foto ou arquivo.</p></details>
      <details><summary>Quanto tempo leva a análise de crédito?</summary><p>Depende de quão completo está o cadastro. Quando falta algo, avisamos no app o que é e por quê, para você não ficar esperando sem saber.</p></details>
      <details><summary>Posso antecipar só uma parte das notas?</summary><p>Pode. Você escolhe quais notas e quais parcelas quer antecipar, e o resto continua com você para receber no vencimento.</p></details>
    </div>
  </div>
</section>
''' + FOOTER

# ------------------------------------------------------------------ página única, enxuta (no ritmo da referência)
SOLUCOES_GRID = f"""<section class="sol-grid-sec" id="solucoes">
  <div class="wrap">
    <div class="section-head">
      <h2 class="h-mid">Tudo o que sua empresa precisa para <em>vender a prazo</em> sem apertar o caixa</h2>
      <p class="muted">Comece pela antecipação de notas e use o resto quando fizer sentido. Mesmo app, mesmo cadastro.</p>
    </div>
    <div class="sol-grid">
      <div class="sol"><span class="mini-ico">{I['doc']}</span><h3>Antecipação de NF-e</h3><p>Escolha nota por nota, ou só algumas parcelas, e veja o valor líquido antes de assinar.</p></div>
      <div class="sol"><span class="mini-ico">{I['pen']}</span><h3>Notas de serviço</h3><p>Emite NFS-e para empresas? Antecipe do mesmo jeito, com o mesmo app.</p></div>
      <div class="sol"><span class="mini-ico">{I['mail']}</span><h3>Notas por e-mail</h3><p>Encaminhe o XML ou um .zip para o nosso e-mail e a nota aparece pronta no app.</p></div>
      <div class="sol"><span class="mini-ico">{I['calendar']}</span><h3>Saque agendado</h3><p>Precisa do dinheiro no dia da folha? Agende e cancele até a véspera.</p></div>
      <div class="sol"><span class="mini-ico">{I['team']}</span><h3>Equipe e alçadas</h3><p>Convide o financeiro e defina até quanto cada pessoa pode assinar.</p></div>
      <div class="sol"><span class="mini-ico">{I['bank']}</span><h3>Para fundos parceiros</h3><p>Securitizadoras e FIDCs compram os créditos com lastro verificável e aceite no portal.</p></div>
    </div>
  </div>
</section>
"""

EXTRA_FAQ = (
    '      <details><summary>Quais documentos vou precisar no cadastro?</summary><p>Os dados da empresa, o documento de quem representa a empresa e, conforme o caso, o contrato social e comprovantes que o app pedir. Tudo é enviado pelo próprio app.</p></details>\n'
    '      <details><summary>Posso antecipar só uma parte das notas?</summary><p>Pode. Você escolhe quais notas e quais parcelas quer antecipar, e o resto continua com você para receber no vencimento.</p></details>\n')

page = INDEX
# ordem: topo, sobre (apresentação), como funciona, soluções, simulador, segurança, dúvidas, avaliações, rodapé
page = page.replace('<section class="intro" id="conteudo">', '<section class="intro" id="sobre">')
page = page.replace('<section class="how">', '<section class="how" id="como-funciona">')
page = page.replace('<footer class="site-footer">', '<footer class="site-footer" id="contato">')
page = page.replace('      <details><summary>Preciso trocar de banco', EXTRA_FAQ + '      <details><summary>Preciso trocar de banco')
PAGE = page
for old, new_ in [('contato.html#form', 'mailto:contato@lottusfinance.com.br'), ('contato.html#canais', '#contato'), ('contato.html#duvidas', '#duvidas'),
                  ('index.html#simulador', '#simulador'), ('href="index.html"', 'href="#inicio"')]:
    PAGE = PAGE.replace(old, new_)
PAGE = re.sub(r'solucoes\.html#\w+', '#solucoes', PAGE)
PAGE = re.sub(r'href="(solucoes|sobre|contato)\.html"', lambda m: f'href="#{m.group(1)}"', PAGE)

(ROOT / 'index.html').write_text(PAGE, encoding='utf-8')
for old in ['solucoes', 'sobre', 'contato']:
    f = ROOT / f'{old}.html'
    if f.exists():
        f.unlink()
print('ok')
