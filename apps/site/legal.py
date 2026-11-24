#!/usr/bin/env python3
"""Gera termos.html (Termos de Uso) e privacidade.html (Política de Privacidade).

Preencha os dados da empresa abaixo e rode:  python3 legal.py
Enquanto um dado estiver vazio, a página mostra o campo destacado em amarelo.
Antes de publicar, peça a revisão de um advogado.
"""
import pathlib

ROOT = pathlib.Path(__file__).parent

# ------------------------------------------------------------------ dados da empresa
EMPRESA = {
    'razao': 'Lottus Tecnologia LTDA',   # razão social exatamente como no contrato social
    'marca': 'Lottus Finance',
    'cnpj': '',                                        # 00.000.000/0000-00
    'endereco': '',                                    # rua, número, complemento, bairro, cidade/UF, CEP
    'foro': '',                                        # comarca da sede, ex.: São Paulo/SP
    'email_contato': 'contato@lottusfinance.com.br',
    'email_privacidade': 'privacidade@lottusfinance.com.br',
    'encarregado': '',                                 # nome do encarregado (DPO) ou da empresa contratada para a função
    'site': 'lottusfinance.com.br',
}
VERSAO = '1.0'
VIGENCIA = '13 de outubro de 2026'


def d(k, label=None):
    v = EMPRESA.get(k, '')
    return v if v else f'<span class="fill">[preencher: {label or k}]</span>'


QUALIFICACAO = (f"{d('razao', 'razão social')}, inscrita no CNPJ sob o nº {d('cnpj', 'CNPJ')}, "
                f"com sede em {d('endereco', 'endereço da sede')}")

# ====================================================================== TERMOS DE USO
TERMOS = [
    ('aceite', 'Aceitação destes Termos', f'''
<p>Estes Termos de Uso ("Termos") regulam o acesso e o uso do site {d('site')}, do aplicativo Lottus e dos demais ambientes eletrônicos mantidos por {QUALIFICACAO} ("Lottus", "nós"), em conjunto chamados de "Plataforma".</p>
<p>Ao acessar o site, criar uma conta ou usar qualquer funcionalidade da Plataforma, você declara que leu, entendeu e concorda com estes Termos e com a <a href="privacidade.html">Política de Privacidade</a>. Se não concordar, não use a Plataforma.</p>
<p>Quando você usa a Plataforma em nome de uma empresa, declara ter poderes para vinculá-la a estes Termos, e a empresa passa a ser responsável, junto com você, pelo cumprimento deles.</p>'''),

    ('definicoes', 'Definições', '''
<ul>
<li><b>Usuário:</b> pessoa física que acessa a Plataforma, por conta própria ou em nome de uma Empresa.</li>
<li><b>Empresa ou Cedente:</b> pessoa jurídica cadastrada que oferece seus direitos creditórios para antecipação.</li>
<li><b>Representante:</b> sócio, administrador ou procurador com poderes para representar a Empresa, e as pessoas que ele autorizar na Plataforma.</li>
<li><b>Sacado:</b> cliente da Empresa, devedor da nota fiscal ou da duplicata.</li>
<li><b>Cessionária:</b> fundo de investimento, companhia securitizadora, instituição financeira ou outra entidade habilitada que adquire os direitos creditórios oferecidos pela Empresa.</li>
<li><b>Operação:</b> cada antecipação, formalizada por cessão de direitos creditórios entre a Empresa e uma Cessionária.</li>
<li><b>Contratos da Operação:</b> o Contrato Normativo de Cessão de Direitos Creditórios, os Termos de Cessão e os demais documentos assinados na Plataforma para cada Operação.</li>
</ul>'''),

    ('natureza', 'O que a Lottus faz e o que ela não faz', '''
<p>A Lottus é uma empresa de tecnologia. A Plataforma permite que a Empresa envie suas notas fiscais, acompanhe seus recebíveis, receba propostas de antecipação e formalize, de forma eletrônica, a cessão desses créditos a Cessionárias.</p>
<div class="box"><b>Importante:</b> a Lottus <b>não é instituição financeira</b>, não capta recursos do público, não concede empréstimos ou financiamentos e não garante o pagamento de nenhum crédito. Quem adquire os créditos e paga o valor antecipado à Empresa é a Cessionária indicada em cada Operação.</div>
<p>Quando atuar como correspondente de instituição financeira, a Lottus o fará nos limites do contrato firmado com essa instituição e da regulamentação aplicável, em especial a Resolução CMN nº 4.935/2021, e essa condição será informada no próprio documento da Operação.</p>
<p>Cada Operação é regida pelos Contratos da Operação, que prevalecem sobre estes Termos naquilo que tratarem de forma específica, inclusive quanto a preço, coobrigação, recompra, garantias e cobrança.</p>'''),

    ('elegibilidade', 'Quem pode usar', '''
<ul>
<li>A Plataforma é destinada a pessoas jurídicas regularmente constituídas no Brasil, com inscrição ativa no CNPJ.</li>
<li>Os Representantes devem ser maiores de 18 anos, plenamente capazes e ter poderes para agir em nome da Empresa.</li>
<li>O site pode ser visitado por qualquer pessoa, mas os serviços de antecipação não são oferecidos a pessoas físicas nem a consumidores.</li>
<li>A Lottus pode recusar cadastros, limitar funcionalidades ou encerrar contas a seu critério, inclusive por política de crédito, prevenção a fraudes ou exigência legal, sem obrigação de justificar a decisão, ressalvado o direito de revisão previsto na Política de Privacidade.</li>
</ul>'''),

    ('cadastro', 'Cadastro, verificação e prevenção à lavagem de dinheiro', '''
<p>Para usar os serviços, a Empresa e seus Representantes devem fornecer informações verdadeiras, completas e atualizadas, e mantê-las assim. A Lottus pode pedir documentos, selfies, comprovantes e informações adicionais a qualquer momento, e consultar bases públicas e privadas para confirmar os dados.</p>
<p>A Lottus e as Cessionárias adotam procedimentos de identificação e de prevenção à lavagem de dinheiro e ao financiamento do terrorismo, nos termos da Lei nº 9.613/1998 e da regulamentação aplicável, e podem comunicar operações suspeitas às autoridades competentes, sem aviso prévio ao Usuário, quando a lei assim determinar.</p>
<p>Informações falsas, incompletas ou desatualizadas autorizam a suspensão imediata da conta e das Operações em andamento, sem prejuízo da responsabilidade civil e criminal de quem as forneceu.</p>'''),

    ('conta', 'Conta, acessos e segurança', '''
<ul>
<li>Login, senha, códigos de verificação e biometria do aparelho são pessoais e intransferíveis. Tudo o que for feito com essas credenciais é considerado feito pelo titular delas e, quando em nome da Empresa, pela Empresa.</li>
<li>O administrador da Empresa é responsável por convidar pessoas, definir níveis de acesso e alçadas de assinatura, e por revogá-los quando necessário.</li>
<li>O Usuário deve manter seu aparelho, e-mail e senhas protegidos e avisar a Lottus imediatamente em {email} se suspeitar de acesso indevido.</li>
<li>A Lottus pode exigir autenticação adicional, bloquear acessos suspeitos e encerrar sessões para proteger a conta.</li>
</ul>'''.replace('{email}', d('email_contato'))),

    ('operacoes', 'Notas fiscais, propostas e Operações', '''
<ul>
<li>A Empresa pode enviar notas fiscais pelo aplicativo, em arquivo .xml ou .zip, por e-mail ou por integração com seu sistema de gestão (ERP), quando disponível. A Lottus pode recusar ou excluir documentos que não puder validar.</li>
<li>Limites, taxas, tarifas e prazos são definidos com base na análise de crédito da Empresa e dos Sacados, e podem ser alterados, suspensos ou cancelados a qualquer tempo para novas Operações.</li>
<li>Propostas exibidas na Plataforma não obrigam a Empresa a ceder nem a Cessionária a adquirir. A Operação só se forma com a assinatura dos documentos aplicáveis e o aceite da Cessionária, nas condições dos Contratos da Operação.</li>
<li>Antes de cada assinatura, a Plataforma mostra o valor de face, o deságio, as tarifas, os tributos, quando houver, e o valor líquido. A Empresa deve conferir essas informações antes de concordar.</li>
<li>Prazos de crédito informados, como "em até 1 hora", são estimativas para Operações aprovadas e dependem de fatores como horário bancário, análise de documentos e sistemas de terceiros. Eles não constituem garantia.</li>
</ul>'''),

    ('simulador', 'Simulações e conteúdos informativos', '''
<p>Os valores do simulador do site e quaisquer exemplos, taxas de referência ou conteúdos informativos são <b>ilustrativos</b>. Eles não constituem oferta, proposta, promessa de aprovação de crédito ou recomendação de investimento. As condições reais de cada Empresa são definidas na análise de crédito e apresentadas na Plataforma antes da assinatura.</p>'''),

    ('obrigacoes', 'Obrigações da Empresa e condutas proibidas', '''
<p>A Empresa e seus Representantes se obrigam a usar a Plataforma de boa-fé e de acordo com a lei. É proibido, entre outras condutas:</p>
<ul>
<li>enviar notas fiscais falsas, simuladas, canceladas, duplicadas ou que não correspondam a vendas ou serviços efetivamente realizados e aceitos;</li>
<li>oferecer créditos que já tenham sido cedidos, descontados, dados em garantia, pagos ou que sejam objeto de discussão com o Sacado;</li>
<li>receber diretamente valores de créditos cedidos sem repassá-los na forma dos Contratos da Operação;</li>
<li>usar a Plataforma para fraude, lavagem de dinheiro, evasão fiscal ou qualquer finalidade ilícita;</li>
<li>acessar ou tentar acessar contas, dados ou áreas restritas de terceiros, ou burlar medidas de segurança;</li>
<li>copiar, fazer engenharia reversa, extrair dados de forma automatizada (scraping) ou interferir no funcionamento da Plataforma;</li>
<li>usar a marca, o nome ou os conteúdos da Lottus sem autorização por escrito.</li>
</ul>
<p>O descumprimento autoriza a suspensão ou o encerramento da conta, o vencimento antecipado das obrigações previstas nos Contratos da Operação e a adoção das medidas judiciais e extrajudiciais cabíveis.</p>'''),

    ('sacados', 'Comunicação com os Sacados', '''
<p>A Empresa autoriza a Lottus e as Cessionárias a notificar os Sacados sobre a cessão dos créditos, nos termos do art. 290 do Código Civil, e a enviar a eles boletos, avisos e cobranças relativos aos créditos cedidos. A Empresa declara ter base legal para fornecer os dados de contato dos Sacados e se compromete a manter esses dados corretos.</p>'''),

    ('assinatura', 'Assinatura eletrônica e provas', '''
<p>Os documentos da Plataforma são assinados eletronicamente. A Empresa e seus Representantes reconhecem, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, a validade, a autoria e a integridade das assinaturas feitas na Plataforma com login, senha, códigos de verificação e biometria do aparelho, e se obrigam a não contestá-las por esse motivo.</p>
<p>A Plataforma registra, para cada assinatura, o texto integral exibido, seu código de integridade, data e hora, endereço IP, dados do aparelho e da sessão. Esses registros podem ser usados como prova em qualquer processo judicial ou administrativo.</p>'''),

    ('disponibilidade', 'Disponibilidade e limitação de responsabilidade', '''
<ul>
<li>A Lottus emprega esforços razoáveis para manter a Plataforma disponível e segura, mas não garante funcionamento ininterrupto ou livre de erros. Manutenções, falhas de internet, de provedores, de bancos ou de outros terceiros podem causar indisponibilidade temporária.</li>
<li>A Lottus não responde por: (a) decisões de crédito das Cessionárias; (b) inadimplemento dos Sacados; (c) atos da Empresa, de seus Representantes ou de terceiros; (d) danos causados por uso indevido de credenciais, informações incorretas fornecidas pelo Usuário ou falhas de equipamentos e conexões do Usuário; (e) caso fortuito ou força maior, nos termos do art. 393 do Código Civil.</li>
<li>Nas relações empresariais reguladas por estes Termos, e na máxima extensão permitida pela lei, a Lottus não responde por lucros cessantes, perda de oportunidade ou danos indiretos, e sua responsabilidade total ficará limitada ao valor das tarifas efetivamente pagas pela Empresa à Lottus nos 12 meses anteriores ao fato que originou o pedido. Essa limitação não se aplica a danos causados por dolo ou culpa grave.</li>
</ul>'''),

    ('indenizacao', 'Indenização', '''
<p>A Empresa e o Representante que agir em seu nome se obrigam, solidariamente, a manter a Lottus, seus sócios, administradores, colaboradores e as Cessionárias livres de qualquer prejuízo, multa, custo ou despesa, inclusive honorários advocatícios, decorrentes de violação destes Termos, dos Contratos da Operação ou da lei, ou de informações e documentos falsos ou incorretos fornecidos à Plataforma.</p>'''),

    ('propriedade', 'Propriedade intelectual', '''
<p>A marca Lottus, os logotipos, o software, o design, os textos, as imagens e os demais conteúdos da Plataforma pertencem à Lottus ou a seus licenciantes e são protegidos pelas Leis nº 9.279/1996 e nº 9.610/1998. O uso da Plataforma concede apenas uma licença pessoal, limitada, revogável e não exclusiva de acesso, e não transfere nenhum direito sobre esses elementos.</p>
<p>Marcas de terceiros exibidas no site, como as das lojas de aplicativos e das redes sociais, pertencem aos respectivos titulares.</p>'''),

    ('terceiros', 'Links e serviços de terceiros', '''
<p>O site e o aplicativo podem conter links para lojas de aplicativos, redes sociais e outros serviços de terceiros. A Lottus não controla esses serviços e não responde por seu conteúdo, disponibilidade ou práticas de privacidade, que seguem os termos de cada fornecedor.</p>'''),

    ('confidencialidade', 'Confidencialidade', '''
<p>As condições comerciais, limites, taxas e demais informações não públicas recebidas pela Plataforma são confidenciais e não devem ser divulgadas a terceiros, salvo aos assessores da Empresa sujeitos a sigilo ou quando exigido por lei.</p>'''),

    ('encerramento', 'Suspensão e encerramento', '''
<ul>
<li>A Empresa pode pedir o encerramento da conta a qualquer momento pelo e-mail {email}. O encerramento não afeta Operações já formalizadas, que seguem até a liquidação integral de todas as obrigações.</li>
<li>A Lottus pode suspender ou encerrar a conta, total ou parcialmente, em caso de descumprimento destes Termos, indícios de fraude, risco de crédito, ordem de autoridade ou exigência legal.</li>
<li>Após o encerramento, os dados serão tratados conforme os prazos de guarda da Política de Privacidade.</li>
</ul>'''.replace('{email}', d('email_contato'))),

    ('alteracoes', 'Alterações destes Termos', '''
<p>A Lottus pode atualizar estes Termos para refletir mudanças nos serviços, na lei ou em nossas práticas. A versão vigente fica sempre disponível nesta página, com a data de atualização. Mudanças relevantes serão comunicadas pela Plataforma ou por e-mail, e o uso continuado após o aviso, ou o novo aceite quando solicitado, significa concordância com a nova versão. As alterações não afetam Operações já formalizadas.</p>'''),

    ('comunicacoes', 'Comunicações', f'''
<p>A Lottus se comunica com o Usuário pelo aplicativo, por notificações no celular e pelo e-mail cadastrado, e esses avisos são considerados recebidos na data do envio. O Usuário pode falar com a Lottus pelo e-mail {d('email_contato')}.</p>'''),

    ('gerais', 'Disposições gerais', '''
<ul>
<li>A tolerância com o descumprimento de qualquer obrigação não significa renúncia ou alteração destes Termos.</li>
<li>Se alguma disposição for considerada inválida, as demais continuam válidas.</li>
<li>A Lottus pode ceder sua posição nestes Termos a empresa do mesmo grupo ou a sucessora, mediante aviso ao Usuário. A Empresa não pode ceder sua posição sem autorização por escrito da Lottus.</li>
<li>Estes Termos não criam vínculo societário, trabalhista, de representação ou de mandato entre as partes, além do expressamente previsto nos Contratos da Operação.</li>
<li>Nas relações entre a Lottus e as Empresas, as partes reconhecem tratar-se de relação empresarial, regida pelo Código Civil, em que prevalecem a liberdade contratual e a alocação de riscos aqui prevista (art. 421-A do Código Civil).</li>
</ul>'''),

    ('foro', 'Lei aplicável e foro', f'''
<p>Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de {d('foro', 'comarca')}, com renúncia a qualquer outro, por mais privilegiado que seja, para resolver questões relacionadas a estes Termos, salvo regra legal de competência obrigatória.</p>'''),
]

# =============================================================== POLÍTICA DE PRIVACIDADE
PRIVACIDADE = [
    ('intro', 'Sobre esta Política', f'''
<p>Esta Política de Privacidade explica como {QUALIFICACAO} ("Lottus", "nós") trata dados pessoais no site {d('site')}, no aplicativo Lottus e nos demais ambientes da Plataforma, em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados, "LGPD"), o Marco Civil da Internet (Lei nº 12.965/2014) e as normas da Autoridade Nacional de Proteção de Dados ("ANPD").</p>
<p>Ela se aplica a visitantes do site, aos representantes e usuários das empresas cadastradas, aos sócios e garantidores dessas empresas e às pessoas cujos dados chegam até nós por meio das empresas, como os contatos dos clientes delas.</p>'''),

    ('controlador', 'Quem é o controlador e como falar com o encarregado', f'''
<p>A Lottus é a <b>controladora</b> dos dados pessoais tratados na Plataforma. As Cessionárias que participam das Operações atuam como controladoras independentes em relação aos dados que recebem para avaliar e adquirir os créditos, conforme as políticas delas.</p>
<p><b>Encarregado pelo tratamento de dados (DPO):</b> {d('encarregado', 'nome do encarregado')}<br>
<b>E-mail:</b> {d('email_privacidade')}<br>
<b>Endereço:</b> {d('endereco', 'endereço da sede')}</p>'''),

    ('dados', 'Quais dados tratamos', '''
<h3>Visitantes do site</h3>
<ul>
<li>Dados técnicos de navegação registrados pelo servidor: endereço IP, data e hora, páginas acessadas, navegador e sistema.</li>
<li>Dados que você envia ao nos escrever, como nome, e-mail, telefone, empresa e o conteúdo da mensagem.</li>
</ul>
<h3>Representantes e usuários das empresas</h3>
<ul>
<li><b>Cadastro:</b> nome, CPF, data de nascimento, e-mail, telefone, cargo, vínculo com a empresa e poderes de representação.</li>
<li><b>Identificação:</b> imagens de documento de identidade e selfie, usadas para confirmar a identidade e prevenir fraudes. A comparação facial envolve dado biométrico, que é dado pessoal sensível e é tratado apenas para essa finalidade.</li>
<li><b>Garantias:</b> dados das pessoas que figuram como devedoras solidárias ou garantidoras nas Operações, incluindo estado civil quando necessário à validade da garantia.</li>
<li><b>Técnicos e de segurança:</b> endereço IP, porta lógica, identificadores do aparelho, sistema e versão do app, registros de acesso, de ações e de assinatura. A biometria do celular, como digital ou rosto, é verificada pelo próprio aparelho: a Lottus recebe apenas a confirmação de que a verificação foi feita.</li>
</ul>
<h3>Dados das empresas e de terceiros relacionados</h3>
<ul>
<li>Dados da empresa, do quadro societário, contas bancárias, notas fiscais, duplicatas, limites, propostas e histórico de Operações.</li>
<li>Dados de contato dos clientes da empresa (Sacados), como nome do responsável financeiro e e-mail, usados para notificação da cessão e cobrança.</li>
<li>Informações obtidas em fontes públicas e em birôs de crédito, como Receita Federal, juntas comerciais, cartórios de protesto e bases de prevenção a fraudes.</li>
</ul>'''),

    ('finalidades', 'Para que usamos os dados e com qual base legal', '''
<div class="table-wrap"><table>
<thead><tr><th>Finalidade</th><th>Base legal (LGPD)</th></tr></thead>
<tbody>
<tr><td>Criar e manter a conta, prestar os serviços da Plataforma e executar os contratos firmados com a empresa</td><td>Execução de contrato e de procedimentos preliminares (art. 7º, V)</td></tr>
<tr><td>Analisar e proteger o crédito, definir limites e taxas</td><td>Proteção do crédito (art. 7º, X)</td></tr>
<tr><td>Confirmar identidade, prevenir fraudes e proteger o titular, inclusive com biometria facial</td><td>Prevenção à fraude e segurança do titular (art. 11, II, "g") e legítimo interesse (art. 7º, IX)</td></tr>
<tr><td>Cumprir obrigações legais e regulatórias, inclusive de prevenção à lavagem de dinheiro, guarda de registros e atendimento a autoridades</td><td>Cumprimento de obrigação legal ou regulatória (art. 7º, II, e art. 11, II, "a")</td></tr>
<tr><td>Registrar assinaturas e operações e usá-las como prova</td><td>Exercício regular de direitos em processo judicial, administrativo ou arbitral (art. 7º, VI, e art. 11, II, "d")</td></tr>
<tr><td>Notificar Sacados sobre a cessão e enviar cobranças</td><td>Execução de contrato (art. 7º, V) e exercício regular de direitos (art. 7º, VI)</td></tr>
<tr><td>Enviar avisos sobre a conta, as Operações e a segurança</td><td>Execução de contrato (art. 7º, V)</td></tr>
<tr><td>Responder mensagens enviadas pelo site</td><td>Procedimentos preliminares a contrato (art. 7º, V) e legítimo interesse (art. 7º, IX)</td></tr>
<tr><td>Melhorar a Plataforma, gerar estatísticas e garantir sua segurança</td><td>Legítimo interesse (art. 7º, IX), com dados minimizados sempre que possível</td></tr>
<tr><td>Enviar comunicações comerciais sobre os serviços da Lottus</td><td>Legítimo interesse (art. 7º, IX) ou consentimento, com opção de descadastro em cada mensagem</td></tr>
</tbody></table></div>
<p>Não vendemos dados pessoais. Não usamos dados sensíveis para finalidades diferentes das descritas acima.</p>'''),

    ('decisoes', 'Decisões automatizadas', '''
<p>Parte da análise de crédito e de prevenção a fraudes usa regras e modelos automatizados, sempre com supervisão da nossa equipe. Você pode pedir a revisão de decisões tomadas unicamente com base em tratamento automatizado e informações sobre os critérios usados, nos termos do art. 20 da LGPD, respeitados os segredos comercial e industrial.</p>'''),

    ('compartilhamento', 'Com quem compartilhamos', '''
<p>Compartilhamos dados pessoais apenas na medida necessária para cada finalidade, com:</p>
<ul>
<li><b>Cessionárias e potenciais Cessionárias</b> (fundos, securitizadoras e instituições financeiras), para avaliar, adquirir e cobrar os créditos, como a Credit4sure Securitizadora de Créditos S.A. e outras parceiras habilitadas;</li>
<li><b>Bancos, instituições de pagamento e registradoras de recebíveis</b>, para pagamentos, emissão de boletos e Pix, cobrança e registro dos créditos;</li>
<li><b>Birôs de crédito e o Sistema de Informações de Créditos do Banco Central (SCR)</b>, para consultas e registros, nos termos da regulamentação e das autorizações aplicáveis;</li>
<li><b>Prestadores de serviço</b> que atuam em nosso nome, como hospedagem e banco de dados em nuvem, envio de e-mails e notificações, validação de identidade e prevenção a fraudes, sempre sob contrato com obrigações de confidencialidade e segurança;</li>
<li><b>Sacados</b>, que recebem a notificação da cessão e os dados necessários ao pagamento;</li>
<li><b>Autoridades públicas</b>, quando houver obrigação legal, regulatória ou ordem judicial;</li>
<li><b>Assessores jurídicos e auditores</b>, para defesa de direitos e cumprimento de obrigações;</li>
<li><b>Sucessores</b>, em caso de reorganização societária, fusão, aquisição ou venda de ativos, mantidas as garantias desta Política.</li>
</ul>'''),

    ('internacional', 'Transferência internacional', '''
<p>Alguns prestadores de serviços de tecnologia podem armazenar ou processar dados em servidores fora do Brasil. Nesses casos, a transferência é feita com base nos mecanismos do art. 33 da LGPD, como cláusulas contratuais padrão aprovadas pela ANPD (Resolução CD/ANPD nº 19/2024), e os prestadores são escolhidos por adotarem padrões de proteção compatíveis com a lei brasileira.</p>'''),

    ('cookies', 'Cookies e tecnologias semelhantes', '''
<ul>
<li>O site <b>não usa cookies de publicidade nem de rastreamento</b> entre sites.</li>
<li>O site carrega fontes do Google Fonts. Para entregá-las, o navegador se conecta aos servidores do Google, que recebem dados técnicos como o endereço IP, conforme a política de privacidade do Google.</li>
<li>O site e o aplicativo podem usar o armazenamento local do navegador ou do aparelho apenas para preferências e para manter a sessão do usuário com segurança.</li>
<li>Se passarmos a usar ferramentas de análise ou publicidade, esta Política será atualizada e, quando exigido, pediremos seu consentimento antes.</li>
</ul>'''),

    ('retencao', 'Por quanto tempo guardamos os dados', '''
<div class="table-wrap"><table>
<thead><tr><th>Dados</th><th>Prazo de guarda</th></tr></thead>
<tbody>
<tr><td>Registros de acesso ao site e ao aplicativo (IP, data e hora)</td><td>No mínimo 6 meses (art. 15 do Marco Civil da Internet), e por mais tempo quando necessários à segurança ou à defesa de direitos</td></tr>
<tr><td>Cadastro e documentos de identificação</td><td>Enquanto a conta estiver ativa e por, no mínimo, 5 anos após o encerramento do relacionamento (art. 10 da Lei nº 9.613/1998)</td></tr>
<tr><td>Registros de Operações, contratos, assinaturas e evidências</td><td>No mínimo 10 anos após a liquidação da Operação, prazo prescricional geral do art. 205 do Código Civil</td></tr>
<tr><td>Documentos fiscais e contábeis</td><td>Pelo prazo da legislação tributária, contado do primeiro dia do exercício seguinte</td></tr>
<tr><td>Mensagens enviadas pelo site sem relação contratual</td><td>Até 2 anos após o último contato</td></tr>
</tbody></table></div>
<p>Terminados os prazos, os dados são eliminados ou anonimizados, salvo quando outra hipótese legal permitir a guarda (art. 16 da LGPD).</p>'''),

    ('direitos', 'Seus direitos e como exercê-los', f'''
<p>Nos termos do art. 18 da LGPD, você pode pedir, a qualquer momento e sem custo:</p>
<ul>
<li>confirmação de que tratamos seus dados e acesso a eles;</li>
<li>correção de dados incompletos, inexatos ou desatualizados;</li>
<li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;</li>
<li>portabilidade dos dados, conforme a regulamentação da ANPD;</li>
<li>eliminação dos dados tratados com base no consentimento, e revogação do consentimento;</li>
<li>informações sobre as entidades com as quais compartilhamos dados e sobre a possibilidade de não consentir e suas consequências;</li>
<li>revisão de decisões automatizadas;</li>
<li>oposição a tratamento feito com base em legítimo interesse, quando houver descumprimento da lei.</li>
</ul>
<p>Para exercer seus direitos, escreva para {d('email_privacidade')}. Podemos pedir informações para confirmar sua identidade antes de atender, para proteger seus dados. Responderemos nos prazos da LGPD. Alguns dados não podem ser eliminados enquanto houver obrigação legal, contrato em vigor ou necessidade de defesa de direitos.</p>
<p>Você também pode apresentar reclamação à ANPD (gov.br/anpd), de preferência depois de falar com a gente.</p>'''),

    ('seguranca', 'Segurança e incidentes', '''
<p>Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não autorizados e situações acidentais ou ilícitas (art. 46 da LGPD), como criptografia em trânsito, controle de acesso por perfil, autenticação em dois fatores para a equipe, registro das ações administrativas e cadeia de integridade dos registros de assinatura.</p>
<p>Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente de segurança que possa causar risco ou dano relevante aos titulares, comunicaremos os afetados e a ANPD, nos termos do art. 48 da LGPD e da Resolução CD/ANPD nº 15/2024.</p>'''),

    ('terceiros-dados', 'Dados de terceiros enviados pela empresa', '''
<p>Quando a empresa nos envia dados de outras pessoas, como sócios, garantidores, colaboradores convidados ou contatos de Sacados, ela declara ter base legal para isso e se compromete a informá-las sobre este tratamento e sobre esta Política.</p>'''),

    ('menores', 'Crianças e adolescentes', '''
<p>A Plataforma não é destinada a menores de 18 anos e não tratamos intencionalmente dados de crianças ou adolescentes. Se identificarmos esse tratamento, os dados serão eliminados, salvo obrigação legal de guarda.</p>'''),

    ('alteracoes', 'Alterações desta Política', '''
<p>Podemos atualizar esta Política para refletir mudanças nos serviços, na lei ou em nossas práticas. A versão vigente fica sempre nesta página, com a data de atualização, e mudanças relevantes serão comunicadas pela Plataforma ou por e-mail.</p>'''),

    ('contato', 'Fale com a gente', f'''
<p>Dúvidas, pedidos e reclamações sobre privacidade: {d('email_privacidade')}.<br>
Assuntos gerais: {d('email_contato')}.</p>'''),
]


def page(slug, title, intro, sections):
    toc = ''.join(f'<li><a href="#{sid}">{i}. {t}</a></li>' for i, (sid, t, _) in enumerate(sections, 1))
    body = ''.join(f'<h2 id="{sid}">{i}. {t}</h2>{html}' for i, (sid, t, html) in enumerate(sections, 1))
    other = ('privacidade.html', 'Política de Privacidade') if slug == 'termos' else ('termos.html', 'Termos de Uso')
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} · Lottus Finance</title>
<meta name="description" content="{title} da Lottus Finance.">
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
    <h1>{title}</h1>
    <p>{intro}</p>
    <div class="legal-meta"><span>Versão <b>{VERSAO}</b></span><span>Vigente desde <b>{VIGENCIA}</b></span><span>Veja também: <a href="{other[0]}">{other[1]}</a></span></div>
  </div>
  <div class="legal-wrap">
    <nav class="legal-toc" aria-label="Índice"><b>Índice</b><ol>{toc}</ol></nav>
    <article class="legal-doc">{body}</article>
  </div>
</main>
<footer class="legal-top" style="padding-bottom:40px;color:var(--muted);font-size:13px">
  <span>© 2026 Lottus Finance · {d('razao')} · CNPJ {d('cnpj', 'CNPJ')}</span>
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


(ROOT / 'termos.html').write_text(page('termos', 'Termos de Uso',
    'Estas são as regras para usar o site e o aplicativo da Lottus. Escrevemos da forma mais clara possível, mas são regras jurídicas: leia com atenção.', TERMOS), encoding='utf-8')
(ROOT / 'privacidade.html').write_text(page('privacidade', 'Política de Privacidade',
    'Como coletamos, usamos, compartilhamos e protegemos dados pessoais, e como você exerce seus direitos pela Lei Geral de Proteção de Dados.', PRIVACIDADE), encoding='utf-8')
print('ok')
