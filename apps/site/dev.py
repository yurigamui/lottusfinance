#!/usr/bin/env python3
"""Gera desenvolvedores.html: documentação da API v1 para plataformas parceiras.

Edite os textos aqui e rode:  python3 dev.py
Mantenha igual a supabase/functions/api/server.ts (rotas, campos e códigos de erro).
"""
import html
import pathlib

ROOT = pathlib.Path(__file__).parent
BASE = 'https://api.lottusfinance.com.br'
SANDBOX = 'https://api-sandbox.lottusfinance.com.br'
UPDATED = '25 de outubro de 2026'


def code(text, lang=''):
    return f'<pre class="code" data-lang="{lang}"><code>{html.escape(text.strip())}</code></pre>'


def ep(method, path, desc):
    return f'<div class="ep"><span class="m m-{method.lower()}">{method}</span><code>{html.escape(path)}</code></div><p>{desc}</p>'


def table(head, rows):
    th = ''.join(f'<th>{h}</th>' for h in head)
    tr = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<div class="table-wrap"><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


SECTIONS = [
    ('visao', 'Visão geral', f'''
<p>A API da Lottus permite que um ERP, sistema de gestão ou marketplace ofereça antecipação de recebíveis dentro do próprio produto. A plataforma manda os dados que já tem (CNPJ, sócio, conta e as notas fiscais); a Lottus analisa o crédito, formaliza a cessão com o fundo e paga o cliente na conta da empresa dele.</p>
<p>Os passos que valem como prova (consentimento, documento com selfie, aceite do contrato e confirmação de cada antecipação com código no e-mail) acontecem na <b>tela Conectar</b>, uma página da Lottus que você abre dentro do seu sistema. Você não precisa construir essas telas nem guardar provas de aceite.</p>
<div class="box"><b>Como fica para o seu cliente:</b> a primeira vez leva uns 3 minutos (dados, fotos, contrato). Depois, o seu sistema mostra quanto ele pode antecipar; ele escolhe as notas, vê o valor e confirma com um código de 6 números.</div>
<h3>Dois jeitos de integrar</h3>
{table(['', 'Tela Conectar (recomendado)', 'Modo avançado'], [
    ['Telas no seu sistema', 'Um botão que abre a tela da Lottus', 'Você constrói todas'],
    ['Documento e selfie', 'Na tela da Lottus', 'Você envia as fotos'],
    ['Aceites e provas', 'Colhidos e guardados pela Lottus', 'Colhidos e guardados por você'],
    ['Chamadas', '4 a 5', 'Cerca de 12'],
    ['Disponível para', 'Todas as plataformas', 'Mediante contrato específico'],
])}'''),

    ('ambientes', 'Ambientes e autenticação', f'''
{table(['Ambiente', 'Endereço base', 'Chave'], [
    ['Produção', f'<code>{BASE}/v1</code>', '<code>lt_live_…</code>'],
    ['Sandbox', f'<code>{SANDBOX}/v1</code>', '<code>lt_test_…</code>'],
])}
<p>As chaves são criadas pela Lottus e entregues por canal seguro. Envie a chave em todas as chamadas:</p>
{code(f"""curl {BASE}/v1 \\
  -H "Authorization: Bearer lt_live_SUA_CHAVE\"""", 'bash')}
<ul>
<li>A chave é secreta: use só no seu servidor, nunca no navegador ou no app do seu cliente.</li>
<li>Chave de teste não funciona em produção e vice-versa (erro <code>wrong_environment</code>).</li>
<li>Se a chave vazar, peça a revogação à Lottus; outra é criada na hora.</li>
<li>Limite padrão: 300 chamadas por minuto por plataforma (erro <code>429 rate_limited</code>).</li>
</ul>'''),

    ('convencoes', 'Convenções', f'''
<ul>
<li>Corpo e respostas em JSON (UTF-8). Valores em reais com ponto decimal (<code>12500.50</code>); datas em ISO 8601.</li>
<li>CNPJ e CPF podem ir com ou sem máscara.</li>
<li>Arquivos vão em base64 no próprio JSON (até 25 MB por chamada).</li>
<li>Listas aceitam <code>limit</code> (até 200) e <code>created_before</code> para paginar.</li>
</ul>
<h3>Erros</h3>
<p>Toda resposta de erro tem o mesmo formato. Use o <code>code</code> no seu sistema; a <code>message</code> é em português e pode ser mostrada ao usuário.</p>
{code('''{
  "error": {
    "code": "debtor_contact_required",
    "message": "Falta o e-mail de cobrança de um dos clientes.",
    "detail": "12345678000190"
  }
}''', 'json')}
<h3>Idempotência</h3>
<p>Envie o cabeçalho <code>Idempotency-Key</code> (até 200 caracteres, por exemplo um UUID) nos POST. Repetir a mesma chave com o mesmo corpo devolve a resposta guardada, com o cabeçalho <code>Idempotent-Replayed: true</code>, sem criar nada de novo. Com outro corpo, a resposta é <code>409 idempotency_conflict</code>. A chave vale por 24 horas. Em <code>POST /v1/operations</code> ela é obrigatória.</p>
<p>Erros não ficam guardados: depois de corrigir o problema, você pode tentar de novo com a mesma chave.</p>'''),

    ('empresas', 'Empresas (cedentes)', f'''
{ep('POST', '/v1/companies', 'Vincula uma empresa à sua plataforma. A Lottus busca os dados na Receita Federal. A empresa precisa estar ativa e ter pelo menos 6 meses de abertura.')}
{code('''{
  "cnpj": "12.345.678/0001-90",
  "external_id": "cliente-8812",
  "consent": {
    "accepted": true,
    "accepted_at": "2026-10-25T14:02:11-03:00",
    "ip": "177.10.20.30",
    "user_reference": "usuario-551",
    "text": "Autorizo o compartilhamento dos dados da minha empresa com a Lottus para análise de antecipação."
  }
}''', 'json')}
<p><code>external_id</code> é o código do cliente no seu sistema; ele volta em todos os avisos. O <code>consent</code> registra que o cliente autorizou o envio dos dados dele à Lottus.</p>
<p>Resposta <code>201</code>: o objeto <code>company</code>.</p>
{code('''{
  "id": "6f1c…",
  "object": "company",
  "cnpj": "12345678000190",
  "legal_name": "Exemplo Comércio LTDA",
  "registry_status": "ATIVA",
  "external_id": "cliente-8812",
  "credit": { "status": "not_requested" },
  "signers": [],
  "bank_accounts": [],
  "documents": [],
  "master_agreement": null,
  "requirements": ["signer", "profile", "document_contract", "bank_account", "scr_consent", "master_agreement"],
  "ready_to_operate": false
}''', 'json')}
{ep('GET', '/v1/companies/{id}', 'Dados atuais da empresa: crédito (<code>limit</code>, <code>available</code>, <code>monthly_rate</code>, <code>max_days</code>), representantes, contas, documentos e o que falta.')}
{ep('GET', '/v1/companies?cnpj=… ou ?external_id=…', 'Busca uma empresa sua pelo CNPJ ou pelo seu código. Sem filtro, lista as empresas.')}
<h3>O que falta (<code>requirements</code>)</h3>
{table(['Valor', 'Como resolver'], [
    ['<code>signer</code>', 'Cadastre um representante (<a href="#representantes">representantes</a>).'],
    ['<code>signer_identity</code>', 'Envie documento e selfie de um representante sócio, ou uma procuração.'],
    ['<code>profile</code>', '<code>PUT /v1/companies/{id}/profile</code>'],
    ['<code>document_contract</code>', 'Envie o contrato social (<code>kind: "contract"</code>).'],
    ['<code>bank_account</code>', 'Cadastre uma conta no CNPJ da empresa.'],
    ['<code>scr_consent</code>', 'Envie <code>scr_consent: true</code> ao cadastrar a conta.'],
    ['<code>master_agreement</code>', 'Colha o aceite do contrato-mãe (<a href="#contrato">contrato-mãe</a>).'],
])}
<p>Se a empresa já usa a Lottus pelo app ou por outra plataforma, a resposta é <code>409 company_in_use</code>. Fale com a Lottus para unir as contas.</p>'''),

    ('representantes', 'Representantes', f'''
<p>O representante é a pessoa que aceita os contratos em nome da empresa. Ele precisa ser sócio no quadro da Receita (a Lottus confere pelo nome e pelo CPF) ou ter uma procuração enviada como documento.</p>
{ep('POST', '/v1/companies/{id}/signers', 'Cadastra o representante. <code>terms_accepted</code> registra que ele aceitou os Termos de Uso e a Política de Privacidade da Lottus.')}
{code('''{
  "name": "Maria da Silva Souza",
  "cpf": "123.456.789-09",
  "email": "maria@exemplo.com.br",
  "phone": "+5511999990000",
  "external_id": "usuario-551",
  "terms_accepted": true
}''', 'json')}
<p>Resposta <code>201</code> com <code>signer_id</code>, <code>role</code> e <code>qsa_verified</code>. Os textos dos Termos ficam em <code>GET /v1/contracts/terms</code>.</p>
{ep('POST', '/v1/companies/{id}/signers/{signer_id}/identity', 'Documento com foto (frente e verso) e selfie, em JPEG de até 5 MB cada, em base64. A análise é da Lottus; o resultado chega no aviso <code>signer.identity_updated</code>. Vale por 90 dias.')}
{code('''{
  "document_type": "cnh",
  "document_front": "/9j/4AAQSkZJRg…",
  "document_back": "/9j/4AAQSkZJRg…",
  "selfie": "/9j/4AAQSkZJRg…",
  "provider": "seu-fornecedor-de-biometria",
  "provider_reference": "sess_99812",
  "liveness_score": 0.97,
  "evidence": { "ip": "177.10.20.30", "user_agent": "Mozilla/5.0 …", "authenticated_at": "2026-10-25T14:05:00-03:00" }
}''', 'json')}
<p><code>document_type</code>: <code>cnh</code> ou <code>rg</code>. Se você já faz prova de vida, informe o fornecedor e a referência; isso ajuda a análise.</p>'''),

    ('cadastro', 'Perfil, documentos e conta', f'''
{ep('PUT', '/v1/companies/{id}/profile', 'Faturamento e prazo médio de recebimento.')}
{code('''{
  "signer_id": "a7d2…",
  "monthly_revenue": "200k_1m",
  "avg_receivable_days": 45,
  "invoice_types": ["nfe"]
}''', 'json')}
<p><code>monthly_revenue</code>: <code>ate_50k</code>, <code>50k_200k</code>, <code>200k_1m</code>, <code>1m_5m</code> ou <code>acima_5m</code>.</p>
{ep('POST', '/v1/companies/{id}/documents', 'PDF, JPEG ou PNG de até 15 MB, em base64.')}
{code('''{
  "signer_id": "a7d2…",
  "kind": "contract",
  "file_name": "contrato-social.pdf",
  "content_base64": "JVBERi0xLjcK…"
}''', 'json')}
{table(['kind', 'Documento'], [
    ['<code>contract</code>', 'Contrato social ou última alteração consolidada (obrigatório)'],
    ['<code>power_of_attorney</code>', 'Procuração, quando o representante não é sócio'],
    ['<code>financials</code>', 'Balanço e DRE'],
    ['<code>revenue</code>', 'Faturamento dos últimos 12 meses'],
    ['<code>address</code>', 'Comprovante de endereço'],
    ['<code>other</code>', 'Outro'],
])}
<p>Quanto mais documentos financeiros, melhor e mais rápida a análise de crédito.</p>
{ep('POST', '/v1/companies/{id}/bank_accounts', 'Conta para receber o valor antecipado. Precisa estar no CNPJ da empresa.')}
{code('''{
  "signer_id": "a7d2…",
  "bank_code": "341",
  "branch": "1234",
  "account_number": "56789",
  "account_digit": "0",
  "account_type": "checking",
  "default": true,
  "scr_consent": true,
  "evidence": { "ip": "177.10.20.30", "accepted_at": "2026-10-25T14:10:00-03:00" }
}''', 'json')}
<p><code>scr_consent: true</code> registra que o representante autorizou a consulta da empresa ao SCR do Banco Central, obrigatória para a análise. Mostre o texto dessa autorização antes de pedir o aceite.</p>'''),

    ('contrato', 'Contrato-mãe de cessão', f'''
<p>Uma vez por empresa, o representante aceita o Contrato Normativo de Cessão de Direitos Creditórios. Mostre o texto completo e peça o aceite de forma ativa (por exemplo, caixa de seleção e botão).</p>
{ep('GET', '/v1/companies/{id}/contracts/master-agreement?signer_id=…', 'Devolve <code>version</code>, <code>title</code>, <code>text</code> e <code>sha256</code> (hash do texto). Mostre o <code>text</code> como veio.')}
{ep('POST', '/v1/companies/{id}/agreement', 'Registra o aceite. O <code>document_sha256</code> precisa ser o do texto mostrado; se o contrato mudou no meio do caminho, a resposta é <code>409 terms_changed</code> e você busca o texto de novo.')}
{code('''{
  "signer_id": "a7d2…",
  "evidence": {
    "document_sha256": "9b1f…",
    "accepted_at": "2026-10-25T14:12:40-03:00",
    "ip": "177.10.20.30",
    "user_agent": "Mozilla/5.0 …",
    "user_reference": "usuario-551",
    "auth_method": "senha+otp",
    "authenticated_at": "2026-10-25T14:01:02-03:00"
  }
}''', 'json')}'''),

    ('notas', 'Notas fiscais', f'''
{ep('POST', '/v1/invoices', 'Envia o XML autorizado de uma NF-e (modelo 55) emitida pela empresa. A Lottus confere a chave, o emitente, o cliente na Receita e as parcelas (duplicatas) da nota.')}
{code('''{
  "company_id": "6f1c…",
  "xml_base64": "PD94bWwgdmVyc2lvbj0iMS4wIj8+…"
}''', 'json')}
<p>Você pode enviar <code>xml</code> (texto) em vez de <code>xml_base64</code>. Para várias de uma vez, envie <code>files</code> com até 50 itens (<code>{{ "name", "xml_base64" }}</code>); a resposta traz o resultado de cada uma, sem interromper as outras.</p>
<p>Resposta <code>201</code>: o objeto <code>invoice</code>, com <code>status</code> e as parcelas.</p>
{table(['status', 'Significado'], [
    ['<code>available</code>', 'Pode ser antecipada.'],
    ['<code>in_review</code>', 'Em conferência.'],
    ['<code>rejected</code>', 'Cancelada ou não reconhecida na SEFAZ. Motivo em <code>status_note</code>.'],
    ['<code>ineligible</code>', 'Fora das regras (por exemplo, vencida ou para pessoa física).'],
])}
<p>Cada parcela tem <code>id</code>, <code>due_date</code>, <code>amount</code> e <code>assigned</code> (já antecipada).</p>
{ep('GET', '/v1/invoices?company_id=…&amp;status=…', 'Lista as notas da empresa.')}
{ep('GET', '/v1/invoices/{id}', 'Uma nota.')}
{ep('PUT', '/v1/companies/{id}/debtors/{cnpj_do_cliente}', 'E-mail de cobrança do cliente da nota (o sacado). É obrigatório antes de antecipar, porque a cessão é comunicada a ele e os boletos chegam por esse e-mail. A Lottus usa o e-mail do XML quando existe.')}
{code('''{ "email": "financeiro@cliente.com.br", "name": "Financeiro" }''', 'json')}'''),

    ('operacoes', 'Simulação e antecipação', f'''
{ep('POST', '/v1/quotes', 'Simula a antecipação das notas ou parcelas escolhidas e devolve o Termo de Cessão já preenchido, que o representante precisa aceitar.')}
{code('''{
  "company_id": "6f1c…",
  "signer_id": "a7d2…",
  "invoice_ids": ["c0a1…", "c0a2…"],
  "bank_account_id": "e91d…"
}''', 'json')}
<p>Use <code>installment_ids</code> em vez de <code>invoice_ids</code> para escolher parcelas específicas. Resposta:</p>
{code('''{
  "object": "quote",
  "gross": 12000.00,
  "discount": 744.42,
  "fee": 95.00,
  "bonus": 0,
  "net": 11160.58,
  "monthly_rate": 0.031,
  "effective_monthly_rate": 0.0335,
  "over_limit": false,
  "debtor_issues": [],
  "installments": [{ "installment_id": "…", "due_date": "2026-12-10", "days": 46, "amount": 6000.00, "discount": 291.10 }],
  "terms": { "kind": "assignment_terms", "version": "…", "title": "Termo de Cessão", "text": "…", "sha256": "4e07…" },
  "expires_at": "2026-10-26T00:00:00-03:00"
}''', 'json')}
<p>Mostre o valor líquido (<code>net</code>), o custo e o texto do termo. A simulação vale até o fim do dia.</p>
{ep('POST', '/v1/operations', 'Pede a antecipação. Exige o cabeçalho <code>Idempotency-Key</code>. Envie o <code>net</code> que o cliente viu em <code>expected_net</code>: se os valores mudaram, a resposta é <code>409 quote_changed</code> e você simula de novo.')}
{code(f"""curl -X POST {BASE}/v1/operations \\
  -H "Authorization: Bearer lt_live_SUA_CHAVE" \\
  -H "Idempotency-Key: 0b8f5a8e-2f8a-4a4f-9c1e-0f7a2c9d1e33" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "company_id": "6f1c…",
    "signer_id": "a7d2…",
    "invoice_ids": ["c0a1…", "c0a2…"],
    "bank_account_id": "e91d…",
    "expected_net": 11160.58,
    "evidence": {{
      "document_sha256": "4e07…",
      "accepted_at": "2026-10-25T15:20:03-03:00",
      "ip": "177.10.20.30",
      "user_agent": "Mozilla/5.0 …",
      "user_reference": "usuario-551",
      "auth_method": "senha+otp",
      "authenticated_at": "2026-10-25T15:18:40-03:00"
    }}
  }}'""", 'bash')}
<p>Resposta <code>201</code>: o objeto <code>operation</code>.</p>
{ep('GET', '/v1/operations/{id}', 'Situação atual, valores, fundo e itens.')}
{ep('GET', '/v1/operations?company_id=…', 'Lista as operações.')}
<p>As etapas estão em <a href="#antecipacoes">Antecipações</a>.</p>'''),

    ('webhooks', 'Avisos (webhooks)', f'''
<p>A Lottus envia um <code>POST</code> para o endereço https que você informar sempre que algo muda. Responda com qualquer status 2xx em até 10 segundos. Se falhar, tentamos de novo com intervalos crescentes, até 10 vezes.</p>
{table(['Evento', 'Quando'], [
    ['<code>connect.session_completed</code>', 'O cliente terminou a tela Conectar (cadastro ou confirmação de antecipação).'],
    ['<code>company.credit_updated</code>', 'Limite de crédito aprovado, alterado ou recusado.'],
    ['<code>signer.identity_updated</code>', 'Identidade do representante aprovada ou recusada.'],
    ['<code>invoice.updated</code>', 'A nota mudou de situação (por exemplo, cancelada na SEFAZ).'],
    ['<code>operation.updated</code>', 'A operação mudou de etapa.'],
])}
{code('''POST /seu-endpoint
Lottus-Event: operation.updated
Lottus-Event-Id: evt_1842
Lottus-Signature: t=1761416403,v1=5c2e…

{
  "id": "evt_1842",
  "type": "operation.updated",
  "created_at": "2026-10-25T15:40:03-03:00",
  "data": { "id": "…", "object": "operation", "stage": "ativo", "net": 11160.58, "company_id": "6f1c…", "external_id": "cliente-8812", … }
}''', 'http')}
<p>O mesmo aviso pode chegar mais de uma vez: use o <code>id</code> para ignorar repetidos. Os avisos também ficam em <code>GET /v1/events</code>.</p>
<h3>Conferir a assinatura</h3>
<p>Cada aviso é assinado com o segredo do webhook (<code>whsec_…</code>) que a Lottus entrega a você. Calcule o HMAC-SHA256 de <code>t + "." + corpo</code> e compare com <code>v1</code>. Recuse avisos com <code>t</code> de mais de 5 minutos.</p>
{code('''// Node.js
import crypto from 'node:crypto';

function avisoValido(corpoBruto, cabecalho, segredo) {
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(partes.t)) > 300) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(`${partes.t}.${corpoBruto}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.v1));
}''', 'js')}
{code('''# Python
import hashlib, hmac, time

def aviso_valido(corpo_bruto: bytes, cabecalho: str, segredo: str) -> bool:
    partes = dict(p.split("=", 1) for p in cabecalho.split(","))
    if abs(time.time() - int(partes["t"])) > 300:
        return False
    esperado = hmac.new(segredo.encode(), f"{partes['t']}.".encode() + corpo_bruto, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, partes["v1"])''', 'python')}
<p>Use o corpo exatamente como chegou, antes de converter o JSON.</p>'''),

    ('provas', 'Provas de aceite', f'''
<p>Como a pessoa aceita os contratos dentro do seu sistema, a prova de que foi ela quem aceitou vem de você. A Lottus grava junto com cada aceite o que você enviar em <code>evidence</code>, e o contrato de parceria obriga a plataforma a guardar os registros que comprovam esses dados e a entregá-los quando pedidos.</p>
{table(['Campo', 'Obrigatório', 'O que é'], [
    ['<code>ip</code>', 'sim', 'IP de onde a pessoa aceitou (não o do seu servidor).'],
    ['<code>accepted_at</code>', 'sim', 'Momento do aceite, com fuso.'],
    ['<code>document_sha256</code>', 'sim', 'O <code>sha256</code> do texto mostrado (contrato-mãe ou termo da simulação).'],
    ['<code>user_agent</code>', 'recomendado', 'Navegador ou app da pessoa.'],
    ['<code>user_reference</code>', 'recomendado', 'Código do usuário no seu sistema.'],
    ['<code>auth_method</code>', 'recomendado', 'Como a pessoa entrou (por exemplo, <code>senha+otp</code>, <code>sso</code>).'],
    ['<code>authenticated_at</code>', 'recomendado', 'Quando ela entrou.'],
    ['<code>device</code>, <code>app_version</code>, <code>timezone</code>, <code>locale</code>', 'opcional', 'Dados do aparelho.'],
])}
<div class="box">Boas práticas: peça o aceite com uma ação clara da pessoa logada (não deixe marcado por padrão), mostre o texto completo antes, peça um segundo fator de autenticação para antecipar e guarde os registros por pelo menos 5 anos.</div>'''),

    ('erros', 'Códigos de erro', table(['Código', 'HTTP', 'O que fazer'], [
        ['<code>unauthorized</code>', '401', 'Chave ausente, inválida ou revogada.'],
        ['<code>wrong_environment</code>', '401', 'Chave de teste em produção, ou o contrário.'],
        ['<code>partner_suspended</code>', '403', 'Acesso suspenso. Fale com a Lottus.'],
        ['<code>rate_limited</code>', '429', 'Espere alguns segundos e tente de novo.'],
        ['<code>invalid</code>, <code>invalid_json</code>', '422 / 400', 'Corrija o campo indicado em <code>message</code>.'],
        ['<code>not_found</code>, <code>route_not_found</code>', '404', 'O recurso não existe ou não é da sua plataforma.'],
        ['<code>consent_required</code>', '422', 'Falta o consentimento do cliente ou o aceite dos Termos.'],
        ['<code>company_not_found</code>', '404', 'CNPJ não encontrado na Receita.'],
        ['<code>company_not_eligible</code>', '422', 'Empresa inativa ou com menos de 6 meses.'],
        ['<code>company_in_use</code>', '409', 'A empresa já usa a Lottus por outro canal.'],
        ['<code>cpf_in_use</code>, <code>email_in_use</code>', '409', 'CPF ou e-mail ligado a outra pessoa.'],
        ['<code>signer_not_authorized</code>', '403', 'Representante não é sócio e não há procuração.'],
        ['<code>identity_expired</code>', '403', 'Envie de novo documento e selfie.'],
        ['<code>terms_changed</code>', '409', 'O texto mudou. Busque de novo e peça novo aceite.'],
        ['<code>evidence_required</code>', '422', 'Faltam <code>ip</code>, <code>accepted_at</code> ou <code>document_sha256</code>.'],
        ['<code>signup_incomplete</code>', '422', 'Veja <code>requirements</code>.'],
        ['<code>agreement_required</code>', '422', 'Falta o aceite do contrato-mãe.'],
        ['<code>credit_not_approved</code>', '422', 'O limite ainda não foi aprovado.'],
        ['<code>over_limit</code>, <code>debtor_over_limit</code>', '422', 'Escolha menos notas ou parcelas.'],
        ['<code>quote_changed</code>', '409', 'Simule de novo.'],
        ['<code>invoice_not_eligible</code>, <code>installment_overdue</code>, <code>installment_too_long</code>', '422', 'Alguma parcela não pode ser antecipada.'],
        ['<code>debtor_contact_required</code>', '422', 'Informe o e-mail de cobrança do cliente (<a href="#notas">notas fiscais</a>).'],
        ['<code>debtor_blocked</code>, <code>screening_blocked</code>, <code>buyback_overdue</code>', '422', 'A operação não pode ser aberta agora.'],
        ['<code>bank_required</code>, <code>scr_required</code>', '422', 'Cadastre a conta ou a autorização do SCR.'],
        ['<code>duplicate</code>, <code>already_registered</code>', '409', 'A nota já foi enviada.'],
        ['<code>not_nfe</code>, <code>invalid_xml</code>, <code>invalid_access_key</code>, <code>invoice_rejected</code>', '422', 'O XML não é uma NF-e válida desta empresa ou a nota não pode ser antecipada.'],
        ['<code>identity_files</code>, <code>invalid_file</code>, <code>too_large</code>', '422 / 413', 'Formato ou tamanho do arquivo.'],
        ['<code>idempotency_required</code>, <code>idempotency_conflict</code>', '400 / 409', 'Veja <a href="#convencoes">convenções</a>.'],
        ['<code>signer_required</code>', '422', 'Há mais de um representante habilitado: informe <code>signer_id</code>.'],
        ['<code>debtor_limit</code>', '422', 'Um cliente passaria do limite dele: escolha outras notas.'],
        ['<code>sandbox_only</code>', '403', 'Rota de teste chamada em produção.'],
        ['<code>receita_unavailable</code>, <code>unavailable</code>', '503 / 500', 'Tente de novo em instantes.'],
    ])),

    ('sandbox', 'Sandbox e homologação', f'''
<p>O sandbox é um ambiente separado (<code>{SANDBOX}/v1</code>), com as mesmas regras e sem dinheiro de verdade. Use a chave <code>lt_test_…</code>; as sessões começam com <code>cs_test_</code> e a mesma tela Conectar funciona com elas.</p>
<ul>
<li>Use CNPJs reais de empresas de teste suas (a consulta à Receita é real).</li>
<li>Notas de homologação da SEFAZ (ambiente 2) são aceitas.</li>
<li>Os códigos de confirmação chegam de verdade no e-mail informado: use um e-mail seu.</li>
</ul>
<p>Para testar sozinho, sem esperar a equipe da Lottus, use estas rotas (só existem no sandbox):</p>
{table(['Rota', 'O que faz'], [
    ['<code>POST /v1/sandbox/signers/{{id}}/approve_identity</code>', 'Aprova a identidade do representante.'],
    ['<code>POST /v1/sandbox/companies/{{id}}/approve_credit</code>', 'Aprova o limite. Corpo opcional: <code>limit</code>, <code>monthly_rate</code>, <code>max_days</code>, <code>fee</code> ou <code>approve: false</code> para recusar.'],
    ['<code>POST /v1/sandbox/operations/{{id}}/approve</code>', 'Aprova a operação (com o aceite do fundo).'],
    ['<code>POST /v1/sandbox/operations/{{id}}/pay</code>', 'Aprova e marca como paga.'],
    ['<code>POST /v1/sandbox/operations/{{id}}/settle</code>', 'Aprova, paga e liquida.'],
    ['<code>POST /v1/sandbox/operations/{{id}}/reject</code>', 'Recusa. Corpo opcional: <code>reason</code>.'],
])}
<p>Cada rota dispara os mesmos avisos de webhook da produção. Para entrar em produção, rode o caminho completo no sandbox e fale com a Lottus: <a href="mailto:contato@lottusfinance.com.br">contato@lottusfinance.com.br</a>.</p>'''),
    ('inicio', 'Integração rápida', f'''
<p>O caminho completo, do cadastro à primeira antecipação:</p>
<ol>
<li><b>Crie uma sessão de cadastro</b> no seu servidor, com o que você já sabe do cliente.
{code(f'''curl -X POST {BASE}/v1/connect/sessions \\
  -H "Authorization: Bearer lt_live_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "type": "onboarding",
    "cnpj": "12.345.678/0001-90",
    "external_id": "cliente-8812",
    "return_url": "https://seu-sistema.com.br/antecipacao",
    "prefill": {{
      "signer": {{ "name": "Maria da Silva Souza", "cpf": "123.456.789-09", "email": "maria@exemplo.com.br", "phone": "+5511999990000" }},
      "profile": {{ "monthly_revenue": "200k_1m", "avg_receivable_days": 45 }},
      "bank": {{ "bank_code": "341", "branch": "1234", "account_number": "56789", "account_digit": "0" }}
    }}
  }}'
''', 'bash')}
A resposta traz <code>url</code>, válida por 7 dias.</li>
<li><b>Abra a tela</b> para o cliente, na sua página:
{code('''<script src="https://lottusfinance.com.br/conectar/lottus.js"></script>
<script>
  LottusConectar.open(sessao.url, {
    onComplete: () => mostrarMensagem('Cadastro enviado! Avisaremos quando o limite sair.'),
    onClose: () => {},
  });
</script>''', 'html')}
No celular ou num app, você também pode redirecionar para <code>url</code> ou abrir numa aba do navegador; no fim, a tela volta para o seu <code>return_url</code>.</li>
<li><b>Espere o limite.</b> Os avisos <code>connect.session_completed</code> e depois <code>company.credit_updated</code> (com <code>status: "approved"</code>) chegam no seu webhook.</li>
<li><b>Envie as notas automaticamente.</b> Sempre que o cliente emitir uma NF-e a prazo, mande o XML (<code>POST /v1/invoices</code>). Mostre no seu sistema o valor de <code>GET /v1/companies/{{id}}/available</code>: "Você tem R$ 48.300 para antecipar".</li>
<li><b>Antecipe.</b> Quando ele escolher as notas, crie a sessão de antecipação e abra a tela de novo; ele confere o valor e confirma com o código do e-mail.
{code(f'''curl -X POST {BASE}/v1/anticipations \\
  -H "Authorization: Bearer lt_live_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{{ "company_id": "6f1c…", "invoice_ids": ["c0a1…", "c0a2…"], "reference": "pedido-981" }}'
''', 'bash')}
O aviso <code>operation.updated</code> acompanha cada etapa até o dinheiro cair na conta.</li>
</ol>'''),

    ('conectar', 'Tela Conectar', f'''
{ep('POST', '/v1/connect/sessions', 'Cria a sessão de cadastro. A Lottus busca a empresa na Receita; ela precisa estar ativa e ter pelo menos 6 meses de abertura.')}
{table(['Campo', 'O que é'], [
    ['<code>type</code>', '<code>onboarding</code> (padrão) ou <code>anticipation</code> (o mesmo que <code>POST /v1/anticipations</code>).'],
    ['<code>cnpj</code>', 'CNPJ da empresa do seu cliente.'],
    ['<code>external_id</code>', 'Código do cliente no seu sistema; volta em todos os avisos.'],
    ['<code>return_url</code>', 'Opcional, https. Para onde a tela volta no fim, com <code>?lottus_session=…&amp;status=completed</code>.'],
    ['<code>reference</code>', 'Opcional. Texto seu, devolvido nos avisos.'],
    ['<code>prefill</code>', 'Opcional. <code>signer</code>, <code>profile</code> e <code>bank</code>: a tela mostra preenchido e o cliente só confere.'],
])}
<p>Resposta <code>201</code>:</p>
{code('''{
  "id": "5d2e…",
  "object": "connect_session",
  "type": "onboarding",
  "status": "open",
  "company_id": "6f1c…",
  "url": "https://lottusfinance.com.br/conectar/#cs_live_…",
  "expires_at": "2026-11-01T14:02:11-03:00"
}''', 'json')}
<p>A <code>url</code> é só do seu cliente: não guarde nem reaproveite. Se ela expirar ou ele fechar no meio, crie outra sessão: os passos já feitos não se repetem.</p>
<p>A tela mostra só o que falta. Se você já enviou algo pelo modo avançado (por exemplo, o contrato social), ela pula esse passo.</p>
{ep('GET', '/v1/connect/sessions/{id}', 'Situação da sessão: <code>open</code>, <code>completed</code> ou <code>expired</code>; em antecipações, traz <code>operation_id</code>.')}
<h3>Eventos na página</h3>
<p>Com <code>lottus.js</code>, a tela abre numa janela sobre a sua página (em celular, ocupa a tela toda) e avisa o seu código por <code>postMessage</code>:</p>
{table(['Evento', 'Quando'], [
    ['<code>ready</code>', 'A tela carregou.'],
    ['<code>completed</code>', 'O cliente terminou. Em antecipações, traz <code>operation_id</code> e <code>net</code>.'],
    ['<code>closed</code>', 'O cliente fechou sem terminar.'],
    ['<code>error</code>', 'Link inválido ou expirado.'],
])}
<p>Use o aviso do webhook como fonte da verdade; os eventos da página servem para atualizar a tela na hora.</p>'''),

    ('antecipacoes', 'Antecipações', f'''
{ep('GET', '/v1/companies/{id}/available', 'Quanto a empresa pode antecipar agora: notas disponíveis, dentro do limite e do prazo máximo. Use para mostrar a oferta no seu sistema.')}
{code('''{
  "object": "available",
  "credit_status": "approved",
  "credit_available": 80000.00,
  "gross": 48300.00,
  "amount": 48300.00,
  "estimated_net": 46912.40,
  "installments": 7,
  "invoices": 4,
  "invoice_ids": ["c0a1…", "c0a2…", "c0a3…", "c0a4…"]
}''', 'json')}
{ep('POST', '/v1/anticipations', 'Cria a sessão de confirmação para as notas ou parcelas escolhidas (vale 30 minutos). A Lottus confere as notas, o limite e os clientes na hora e devolve o valor estimado.')}
{table(['Campo', 'O que é'], [
    ['<code>company_id</code>', 'A empresa.'],
    ['<code>invoice_ids</code> ou <code>installment_ids</code>', 'As notas inteiras ou parcelas específicas.'],
    ['<code>bank_account_id</code>', 'Opcional. Sem ele, usa a conta principal.'],
    ['<code>signer_id</code>', 'Só quando a empresa tem mais de um representante habilitado.'],
    ['<code>return_url</code>, <code>reference</code>', 'Como na sessão de cadastro.'],
])}
<p>A resposta é uma <code>connect_session</code> com <code>type: "anticipation"</code> e <code>quote</code> (<code>gross</code>, <code>net</code>, <code>monthly_rate</code>). Abra a <code>url</code> do mesmo jeito. Na tela, o cliente vê as notas, o valor líquido, o custo e o Termo de Cessão, e confirma com o código enviado ao e-mail do representante.</p>
<h3>Etapas da operação</h3>
{table(['stage', 'status', 'O que acontece'], [
    ['<code>solicitacao</code>', '<code>requested</code>', 'Pedido recebido.'],
    ['<code>analise</code>', '<code>in_review</code>', 'Conferência da Lottus e do fundo.'],
    ['<code>pagamento</code>', '<code>approved</code>', 'Aprovada; o pagamento ao cedente está sendo feito.'],
    ['<code>ativo</code>', '<code>paid</code>', 'Valor pago na conta da empresa. Os clientes pagam os boletos no vencimento.'],
    ['<code>vencido</code>', '<code>paid</code>', 'Alguma parcela venceu sem pagamento.'],
    ['<code>liquidado</code>', '<code>settled</code>', 'Tudo pago.'],
    ['<code>reprovado</code>', '<code>rejected</code> / <code>cancelled</code>', 'Não seguiu. Motivo em <code>status_note</code>.'],
])}
{ep('GET', '/v1/operations/{id}', 'Situação atual, valores, fundo e itens.')}
{ep('GET', '/v1/operations?company_id=…', 'Lista as operações.')}'''),

    ('avancado', 'Modo avançado', '''
<p>No modo avançado, a sua plataforma faz tudo pela API: envia documento e selfie, mostra os contratos, colhe os aceites e manda as provas para a Lottus. Ele é liberado para plataformas que já têm verificação de identidade própria e assinam com a Lottus o contrato que trata da guarda das provas.</p>
<p>As seções a seguir descrevem esse modo. As duas formas convivem: você pode, por exemplo, enviar o contrato social pela API e deixar o restante para a tela Conectar.</p>'''),
]

# Ordem e títulos da página
_ORDER = ['visao', 'ambientes', 'inicio', 'convencoes', 'conectar', 'notas', 'antecipacoes', 'webhooks', 'sandbox', 'erros',
          'avancado', 'empresas', 'representantes', 'cadastro', 'contrato', 'operacoes', 'provas']
_TITLES = {'empresas': 'Avançado: empresas', 'representantes': 'Avançado: representantes', 'cadastro': 'Avançado: perfil, documentos e conta',
           'contrato': 'Avançado: contrato-mãe', 'operacoes': 'Avançado: simulação e operação', 'provas': 'Avançado: provas de aceite'}
_BY = {k: (k, _TITLES.get(k, t), h) for k, t, h in SECTIONS}
SECTIONS = [_BY[k] for k in _ORDER]


def page():
    toc = ''.join(f'<li><a href="#{sid}">{i}. {t}</a></li>' for i, (sid, t, _) in enumerate(SECTIONS, 1))
    body = ''.join(f'<h2 id="{sid}">{i}. {t}</h2>{h}' for i, (sid, t, h) in enumerate(SECTIONS, 1))
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>API para plataformas · Lottus Finance</title>
<meta name="description" content="Documentação da API da Lottus para plataformas que querem oferecer antecipação de recebíveis.">
<meta name="color-scheme" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="icon" type="image/png" href="img/mark-rosa.png">
<link rel="stylesheet" href="vendor/lenis.css">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="legal-top">
  <a class="logo" href="index.html" aria-label="Lottus Finance, início"><img src="img/logo-rosa.png" alt="Lottus" width="132" height="35"></a>
  <a class="back" href="index.html">← Voltar ao site</a>
</header>
<main>
  <div class="legal-hero">
    <h1>API para plataformas</h1>
    <p>Ofereça antecipação de recebíveis dentro do seu sistema. Seu cliente envia as notas, vê a proposta e recebe o dinheiro sem sair da sua plataforma; a Lottus cuida do crédito, dos contratos e do fundo.</p>
    <div class="legal-meta"><span>Versão <b>v1</b></span><span>Atualizada em <b>{UPDATED}</b></span><span>Veja também: <a href="termos.html">Termos de Uso</a></span></div>
  </div>
  <div class="legal-wrap">
    <nav class="legal-toc" aria-label="Índice"><b>Índice</b><ol>{toc}</ol></nav>
    <article class="legal-doc dev-doc">{body}</article>
  </div>
</main>
<footer class="legal-top" style="padding-bottom:40px;color:var(--muted);font-size:13px">
  <span>© 2026 Lottus Finance · Lottus Tecnologia LTDA</span>
  <span><a href="termos.html">Termos de Uso</a> · <a href="privacidade.html">Política de Privacidade</a></span>
</footer>
<script src="vendor/lenis.min.js"></script>
<script>
if (window.Lenis) {{ var l = new Lenis({{ lerp: 0.09, wheelMultiplier: 0.9 }}); document.documentElement.style.scrollBehavior = 'auto';
  (function f(t) {{ l.raf(t); requestAnimationFrame(f); }})(0);
  document.addEventListener('click', function (e) {{ var a = e.target.closest('a[href^="#"]'); if (!a) return; var t = document.getElementById(a.getAttribute('href').slice(1));
    if (t) {{ e.preventDefault(); l.scrollTo(t, {{ offset: -16, duration: 1.1 }}); history.pushState(null, '', a.getAttribute('href')); }} }}); }}
</script>
</body>
</html>
'''


(ROOT / 'desenvolvedores.html').write_text(page(), encoding='utf-8')
print('desenvolvedores.html')
