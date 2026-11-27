// Seção 1.3 (Onboarding) + pacote C2-15, TELA: AC1 a AC13 e AC-R5, AC-R7, AC-R8 (parte da tela), em Playwright contra o Supabase falso em modo repasse
// ao Postgres local ISOLADO (SIGN_DB e SIGN_DB_ANTES SEMPRE exportados). Nada em produção. Contas fictícias onbN@teste.example (onb-lib.cjs).
// Uso: SIGN_DB=sign_onb SIGN_DB_ANTES=sign_onb_antes [SHOTS=<pasta>] [ONLY=<regex>] node t-onb.cjs   (recria o banco no início e no fim)
const { open, overflow } = require('./drv.cjs');
const { check, t: t0, done, hash, text, logged, VER, login, PW } = require('./lib.cjs');
if (!process.env.SIGN_DB || !process.env.SIGN_DB_ANTES) { console.error('defina SIGN_DB e SIGN_DB_ANTES (bancos isolados; nunca o "sign" compartilhado)'); process.exit(2); }
const ONLY = process.env.ONLY;
const t = (name, ...r) => (ONLY && !new RegExp(ONLY).test(name) ? Promise.resolve() : t0(name, ...r));
const { reset, DB } = require('./perfil-lib.cjs');
const { mk, cpfValido } = require('./onb-lib.cjs');
const fs = require('fs'), path = require('path'), cp = require('child_process'), zlib = require('zlib');
const res_tempos = [], res_js = [], res_lines = [];
const SHOTS = process.env.SHOTS || '/tmp/sign-shots-onb';
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 8000 });
const q = async (d, sql, a) => (await d.fake.query(sql, a)).rows;
const PG = { pg: DB };
const ROOT = path.resolve(__dirname, '../../..');
const shot = (p, nome) => p.screenshot({ path: path.join(SHOTS, nome + '.png'), fullPage: true });
const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const num = (s) => { const k = String(s).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/); if (k) return [k[1], k[2], k[3]].map((x) => Math.round(parseFloat(x) * 255)); const m = String(s).match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map((x) => parseFloat(x)) : [0, 0, 0]; };
const nid = { incompleto: 301, semVerif: 302, pronto: 303, concluido: 304, naoConf: 305, cert: 306, fone: 307, a: 308, b: 309, c: 310, d: 311, e: 312, f: 313, g: 314, h: 315, i: 316, j: 317, k: 318, l: 319, m: 320 };
const em = (n) => `onb${n}@teste.example`;
/* cria/recria uma conta e recarrega os usuários do Auth falso */
async function prep(d, chave, o) { const u = await mk((s, a) => q(d, s, a), nid[chave], o); await d.fake.loadUsers(); return u; }
const getState = async (d, n) => (await q(d, `select i.onboarding_done, i.phone_verified_at is not null v, p.full_name, p.cpf from public.sign_identity i left join public.profiles p on p.id = i.user_id where i.user_id = $1`, [`e1000000-0000-4000-8000-${String(n).padStart(12, '0')}`]))[0];
const ver = async (d, u) => { // entra e espera a tela do onboarding pronta (sem esqueleto)
  const p = d.page; await d.go('#/entrar'); await login(p, u.email, PW);
  await wait(p, () => /^#\/(documentos|onboarding)/.test(location.hash) && document.querySelector('.shell') && !document.querySelector('.ob[aria-busy="true"]') && document.querySelector('#view h1'), null, 10000);
};
const pronta = (p) => wait(p, () => document.querySelector('.ob') && !document.querySelector('.ob[aria-busy="true"]') && document.querySelector('#ob-h'), null, 10000);
const irPara = async (p, h) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(150); };
const passoAtual = (p) => p.evaluate(() => { const li = document.querySelector('.ob-steps li[aria-current="step"]'); return li ? [...li.parentElement.children].indexOf(li) + 1 : 0; });
const h1 = (p) => text(p, '#ob-h');
const limpar = async (d, uid) => { for (const tb of ['sign_otps', 'sign_outbox', 'sign_cert_challenges', 'sign_cpf_attempts']) await q(d, `delete from public.${tb} where user_id = $1`, [uid]); };
const sai = async (d) => { await d.page.click('#avatar'); await d.page.click('.menu-item.danger'); await d.page.waitForFunction(() => location.hash === '#/entrar'); };
const toqueMin = (p) => p.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('#sign button, #sign a[href], #sign input:not([type=hidden]), #sign select, #sign textarea')) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let oc = false; for (let x = e; x; x = x.parentElement) if (x.hidden || getComputedStyle(x).display === 'none') { oc = true; break; }
    if (oc || e.classList.contains('skip-link') || e.closest('.sr-only') || e.closest('.flyout')) continue;
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
    if (b.width < 43.5 || b.height < 43.5) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
  }
  return out;
});
const cortes = (p) => p.evaluate(() => {
  const out = []; const vw = window.innerWidth;
  for (const e of document.querySelectorAll('.ob *')) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || e.closest('.vf-trunc') || e.classList.contains('vf-trunc') || e.closest('.sr-only')) continue;
    const b = e.getBoundingClientRect(); if (!b.width) continue;
    if (b.right > vw + 0.5 || b.left < -0.5) out.push('fora: ' + e.tagName + '.' + e.className);
    if (/hidden|clip/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'INPUT') out.push('corte: ' + e.tagName + '.' + e.className + ' ' + e.scrollWidth + '>' + e.clientWidth);
  }
  return out;
});
const svgs = (p) => p.evaluate(() => [...document.querySelectorAll('.banner svg, .toast svg, .empty svg, .sg-alert svg')].map((s) => { const b = s.getBoundingClientRect(); return Math.round(Math.max(b.width, b.height)); }));

(async () => {
  console.info('recriando banco local isolado...'); reset('depois');

  // ---------------------------------------------------------------------------------------------------------------- AC1, AC2, AC3, AC4 (fluxo feliz, 390)
  await t('AC1 a AC4 fluxo feliz completo (conta nova até Documentos)', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'incompleto', { nome: null, cpf: null, meta: { name: 'Nova Pessoa Cadastro' } });
    await ver(d, u); await pronta(p);
    check('AC1 chega em #/onboarding/1', (await hash(p)) === '#/onboarding/1', await hash(p));
    check('AC1 ".ob-steps" com 3 itens e rótulos exatos', JSON.stringify((await p.locator('.ob-steps li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())) === JSON.stringify(['1 Seus dados', '2 Verificar contato', '3 Certificado (opcional)']), await p.locator('.ob-steps li').allInnerTexts());
    check('AC1 aria-label "Etapas" e item 1 com aria-current="step" e classe on', (await p.getAttribute('.ob-steps', 'aria-label')) === 'Etapas' && (await p.getAttribute('.ob-steps li:nth-child(1)', 'aria-current')) === 'step' && (await p.getAttribute('.ob-steps li:nth-child(1)', 'class')) === 'on' && (await p.locator('.ob-steps li[aria-current]').count()) === 1);
    check('AC1 h1 "Seus dados" e subtítulo exato', (await h1(p)) === 'Seus dados' && (await text(p, '.page-sub')) === 'Precisamos do seu nome e CPF para identificar você nas assinaturas.', await text(p, '.page-sub'));
    check('AC1 título da aba "Primeiros passos · Lottus Sign"', (await p.title()) === 'Primeiros passos · Lottus Sign', await p.title());
    check('AC1 menu reduzido: só avatar e Sair (sem itens de navegação)', (await p.locator('.sidenav-items a').count()) === 0);
    check('AC1 foco no h1 depois do login', (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'ob-h');
    check('RN-OB4 o passo 1 não mostra o e-mail editável nem a coluna lateral nem celular', (await p.locator('.pf-side, #pf-mail, #pf-cel').count()) === 0 && (await p.locator('#pf-nome').count()) === 1);
    check('RN-OB4 sugestão do cadastro no nome, botão "Salvar e continuar"', (await p.inputValue('#pf-nome')) === 'Nova Pessoa Cadastro' && (await text(p, '.pf-save')) === 'Salvar e continuar', await p.inputValue('#pf-nome'));
    // AC2: nome com uma palavra
    await p.fill('#pf-nome', 'Ana'); await p.fill('#pf-cpf', '123'); await p.click('.pf-save');
    check('AC2 nome de 1 palavra e CPF curto: mensagens da 1.4, sem sair do passo', (await text(p, '#pf-nome-err')) === 'Informe nome e sobrenome.' && (await text(p, '#pf-cpf-err')) === 'CPF inválido. Confira os números.' && (await hash(p)) === '#/onboarding/1', [await text(p, '#pf-nome-err'), await text(p, '#pf-cpf-err')]);
    check('AC2 nada foi gravado no banco', (await getState(d, nid.incompleto)).cpf === null);
    await p.fill('#pf-nome', 'Nova Pessoa Cadastro'); await p.fill('#pf-cpf', cpfValido(nid.incompleto)); await p.click('.pf-save');
    await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h') && document.querySelector('#ob-h').textContent === 'Verificar contato');
    const st = await getState(d, nid.incompleto);
    check('AC2 passo 1 válido: vai ao passo 2 e grava em profiles (fonte única)', st.full_name === 'Nova Pessoa Cadastro' && st.cpf === cpfValido(nid.incompleto), st);
    check('AC2 o item 1 vira concluído (✓, classe done) e o 2 é o atual', (await p.getAttribute('.ob-steps li:nth-child(1)', 'class')) === 'done' && (await p.locator('.ob-steps li:nth-child(1) span').first().innerText()) === '✓' && (await passoAtual(p)) === 2);
    check('AC2 foco no h1 ao trocar de passo', (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'ob-h');
    // AC3: passo 2
    check('AC3 h1 e subtítulo do passo 2 exatos', (await h1(p)) === 'Verificar contato' && (await text(p, '.page-sub')) === 'Confirme que você recebe mensagens neste contato. Isso protege suas assinaturas.');
    check('AC3 "Continuar" desabilitado até verificar, com a dica', (await p.locator('.ob-actions .btn:not(.secondary)').isDisabled()) && (await text(p, '#ob-dica')) === 'Confirme o código para liberar o botão Continuar.');
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo');
    const c = await d.fake.codeOf(u.email);
    await p.keyboard.type(c);
    await wait(p, () => document.querySelector('.vf-ok'));
    check('AC3 depois do código: "E-mail confirmado" (contact_kind e-mail) e a linha do contato', (await text(p, '.vf-ok')) === 'E-mail confirmado.' && /E-mail confirmado/.test(await text(p, '.vf-value')), [await text(p, '.vf-ok'), await text(p, '.vf-value')]);
    check('AC3 "Continuar" liberado e a dica some', !(await p.locator('.ob-actions .btn:not(.secondary)').isDisabled()) && (await p.locator('#ob-dica').count()) === 0);
    check('AC3 o nível do cabeçalho subiu para Avançada sem recarregar (updateMe)', (await text(p, '.org-sub')) === 'Avançada', await text(p, '.org-sub'));
    check('AC3 foco no aviso de sucesso', (await p.evaluate(() => document.activeElement && document.activeElement.className)) === 'vf-ok', await p.evaluate(() => document.activeElement && document.activeElement.className));
    await p.click('text=Continuar'); await wait(p, () => location.hash === '#/onboarding/3' && document.querySelector('#ob-h') && document.querySelector('#ob-h').textContent === 'Certificado (opcional)');
    // AC4: passo 3
    check('AC4 h1 e subtítulo do passo 3 exatos', (await h1(p)) === 'Certificado (opcional)' && (await text(p, '.page-sub')) === 'Com certificado digital seus documentos podem ter nível mais alto de assinatura. Você pode fazer isso depois.');
    const linhas = (await p.locator('.ob-sum li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    check('AC4 resumo "O que falta para enviar": 3 linhas com Pronto, Pronto e Opcional', (await text(p, '#ob-res-h')) === 'O que falta para enviar' && JSON.stringify(linhas) === JSON.stringify(['Seus dados Pronto', 'Contato verificado Pronto', 'Certificado Opcional']), linhas);
    check('AC4 linha do nível: "Nível de assinatura hoje: Avançada."', (await text(p, '.ob-level')) === 'Nível de assinatura hoje: Avançada.', await text(p, '.ob-level'));
    check('RN-OB8 os passos concluídos no resumo são links (#/onboarding/1 e /2); o certificado não', (await p.getAttribute('.ob-sum li:nth-child(1) a', 'href')) === '#/onboarding/1' && (await p.getAttribute('.ob-sum li:nth-child(2) a', 'href')) === '#/onboarding/2' && (await p.locator('.ob-sum li:nth-child(3) a').count()) === 0);
    check('RN-OB6 botões "Voltar", "Pular certificado" e "Concluir"; texto sobre adicionar depois em Conta > Verificação', (await p.locator('.ob-actions .btn').allInnerTexts()).map((x) => x.trim()).join('|') === 'Voltar|Pular certificado|Concluir' && /Conta > Verificação/.test(await text(p, '.ob-note')), await text(p, '.ob-note'));
    check('RN-OB6 o cartão do certificado (o mesmo da Verificação) aparece e é pulável', (await p.locator('#vf-cert-h').count()) === 1 && /Certificado digital \(opcional\)/.test(await text(p, '#vf-cert-h')));
    await shot(p, 'fluxo-390-3');
    await p.click('text=Pular certificado');
    await wait(p, () => location.hash === '#/documentos' && document.querySelector('#view h1'));
    check('AC4 "Pular certificado": vai a Documentos, onboarding_done=true no banco', (await getState(d, nid.incompleto)).onboarding_done === true && (await hash(p)) === '#/documentos');
    check('AC4 toast "Tudo pronto. Sua conta está configurada."', /Tudo pronto\. Sua conta está configurada\./.test(await p.locator('#toast-root').innerText()), await p.locator('#toast-root').innerText());
    check('AC4 menu de navegação completo depois de concluir', (await p.locator('.sidenav-items a').count()) >= 2);
    check('AC1 a AC4 sem erros no console nem requisição externa', d.errors.length === 0 && d.external.length === 0, [d.errors, d.external]);
    // Voltar do navegador depois de concluir não reabre o onboarding
    await p.goBack(); await p.waitForTimeout(500);
    check('RN-OB: depois de concluir, Voltar não deixa o usuário no onboarding (replace)', !/^#\/onboarding/.test(await hash(p)), await hash(p));
  });

  await t('AC4 "Concluir" idem; destino salvo (de) respeitado e malicioso ignorado', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'pronto', { verif: 'email' });
    await d.go('#/entrar'); await p.evaluate(() => sessionStorage.setItem('lottus.sign.de', '#/plano'));
    await login(p, u.email, PW); await wait(p, () => document.querySelector('#ob-h'));
    check('RN-OB1 tudo pronto sem done: abre no passo 3 (entrada pelo redirecionamento)', (await hash(p)) === '#/onboarding/3', await hash(p));
    await p.click('text=Concluir'); await wait(p, () => location.hash === '#/plano' && document.querySelector('#view h1'));
    check('AC4 "Concluir": vai ao destino salvo da lista branca (#/plano) e grava done', (await hash(p)) === '#/plano' && (await getState(d, nid.pronto)).onboarding_done === true);
    const u2 = await prep(d, 'a', { verif: 'email' });
    await sai(d); await d.go('#/entrar'); await p.evaluate(() => sessionStorage.setItem('lottus.sign.de', 'https://evil.example/x'));
    await login(p, u2.email, PW); await wait(p, () => document.querySelector('#ob-h')); await p.click('text=Concluir');
    await wait(p, () => location.hash === '#/documentos' && document.querySelector('#view h1'));
    check('AC4 destino fora da lista branca vira #/documentos', (await hash(p)) === '#/documentos');
  });

  // ---------------------------------------------------------------------------------------------------------------- AC5 retomada
  await t('AC5 retomada: fechar no passo 2 e entrar de novo abre o passo 2; perfil completo sem verificação abre no 2; tudo pronto abre no 3', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'incompleto', { nome: null, cpf: null });
    await ver(d, u); await pronta(p);
    await p.fill('#pf-nome', 'Retomada Da Silva'); await p.fill('#pf-cpf', cpfValido(nid.incompleto)); await p.click('.pf-save');
    await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h').textContent === 'Verificar contato');
    await sai(d); await ver(d, u); await pronta(p);
    check('AC5 fechou no passo 2 e relogou: abre no passo 2', (await hash(p)) === '#/onboarding/2' && (await passoAtual(p)) === 2, await hash(p));
    await sai(d);
    const v = await prep(d, 'semVerif', {});
    await ver(d, v); await pronta(p);
    check('AC5 perfil completo e sem verificação: abre no 2', (await hash(p)) === '#/onboarding/2', await hash(p));
    await sai(d);
    const w = await prep(d, 'pronto', { verif: 'email' });
    await ver(d, w); await pronta(p);
    check('AC5 tudo pronto sem done: abre no 3', (await hash(p)) === '#/onboarding/3' && (await passoAtual(p)) === 3, await hash(p));
    await sai(d);
    const x = await prep(d, 'cert', { cert: 'ok' });
    await ver(d, x); await pronta(p);
    check('AC5 só certificado válido (sem celular): abre no 3 e mostra o resumo com Contato verificado "Pronto"', (await hash(p)) === '#/onboarding/3' && /Contato verificado Pronto/.test((await text(p, '.ob-sum')).replace(/\s+/g, ' ')), await text(p, '.ob-sum'));
    check('AC5 certificado válido: nível Qualificada na linha do nível', (await text(p, '.ob-level')) === 'Nível de assinatura hoje: Qualificada.', await text(p, '.ob-level'));
    await p.click('text=Voltar'); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h').textContent === 'Verificar contato');
    check('AC5 passo 2 com só certificado: "Identidade verificada" (sem exigir contato) e Continuar liberado', /Identidade verificada/.test(await text(p, '.vf-card')) && !(await p.locator('.ob-actions .btn:not(.secondary)').isDisabled()), await text(p, '.vf-card'));
  });

  // ---------------------------------------------------------------------------------------------------------------- AC6 F5, Voltar, hash inválido
  await t('AC6 F5 fica no passo; Voltar do navegador sem perder dados; hash adiante vira o pendente com aviso; hash inválido vira o inicial (replace)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'incompleto', { nome: null, cpf: null });
    await ver(d, u); await pronta(p);
    await p.fill('#pf-nome', 'Efe Cinco Teste'); await p.fill('#pf-cpf', cpfValido(nid.incompleto)); await p.click('.pf-save');
    await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h').textContent === 'Verificar contato');
    await p.reload(); await pronta(p);
    check('AC6 F5 em /2 fica em /2', (await hash(p)) === '#/onboarding/2' && (await h1(p)) === 'Verificar contato', await hash(p));
    check('AC6 recarregar não mostra aviso nem foca o h1 (1º carregamento)', (await p.locator('.ob-aviso').count()) === 0);
    await p.goBack(); await wait(p, () => location.hash === '#/onboarding/1' && document.querySelector('#pf-nome'));
    check('AC6 Voltar do navegador sai do /2 para /1 sem perder dados (o CPF salvo volta travado e mascarado, regra R5 da 1.4)', (await p.inputValue('#pf-nome')) === 'Efe Cinco Teste' && (await p.inputValue('#pf-cpf')) === `•••.${cpfValido(nid.incompleto).slice(3, 6)}.${cpfValido(nid.incompleto).slice(6, 9)}-••` && (await p.isDisabled('#pf-cpf')), [await p.inputValue('#pf-nome'), await p.inputValue('#pf-cpf')]);
    await p.goForward(); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h').textContent === 'Verificar contato');
    // hash adiante (/3) com contato pendente: replace para /2 + aviso
    const L0 = await p.evaluate(() => history.length);
    await irPara(p, '#/onboarding/3'); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('.ob-aviso'));
    check('AC6 hash /3 com contato pendente vira /2 com o aviso "Falta concluir esta etapa antes." (role=status)', (await text(p, '.ob-aviso')) === 'Falta concluir esta etapa antes.' && (await p.getAttribute('.ob-aviso', 'role')) === 'status', await text(p, '.ob-aviso'));
    check('AC6 a correção foi por replace (só 1 entrada nova no histórico, a do hash digitado)', (await p.evaluate(() => history.length)) === L0 + 1, [L0, await p.evaluate(() => history.length)]);
    for (const hx of ['#/onboarding/9', '#/onboarding/x', '#/onboarding', '#/onboarding/0']) {
      const L1 = await p.evaluate(() => history.length);
      await irPara(p, hx); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h') && !document.querySelector('.ob[aria-busy="true"]'));
      check(`AC6 hash inválido ${hx} vira o passo inicial (/2) por replace, sem aviso de etapa`, (await p.evaluate(() => history.length)) === L1 + 1 && (await p.locator('.ob-aviso').count()) === 0 && (await h1(p)) === 'Verificar contato', hx);
    }
    // perfil incompleto + #/onboarding/3 digitado do zero
    const v = await prep(d, 'b', { nome: null, cpf: null, verif: 'email' });
    await sai(d); await ver(d, v); await pronta(p);
    await irPara(p, '#/onboarding/3'); await wait(p, () => location.hash === '#/onboarding/1' && document.querySelector('.ob-aviso'));
    check('AC6 /3 com perfil incompleto vira /1 com o aviso', (await h1(p)) === 'Seus dados' && (await text(p, '.ob-aviso')) === 'Falta concluir esta etapa antes.');
    await shot(p, 'aviso-1280');
  });

  // ---------------------------------------------------------------------------------------------------------------- AC7 sem beco
  await t('AC7 sem beco: Sair em cada passo, Voltar, e "Tentar de novo" nos erros (rede caída simulada)', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'pronto', { verif: 'email' });
    await ver(d, u); await pronta(p);
    for (const [n, hx] of [[1, '#/onboarding/1'], [2, '#/onboarding/2'], [3, '#/onboarding/3']]) {
      await irPara(p, hx); await wait(p, (h) => location.hash === h && document.querySelector('#ob-h') && !document.querySelector('.ob[aria-busy="true"]'), hx);
      await p.click('#avatar');
      check(`AC7 passo ${n}: o menu do avatar tem "Sair"`, (await p.locator('.menu-item.danger').innerText()).trim() === 'Sair');
      await p.keyboard.press('Escape');
      if (n > 1) check(`AC7 passo ${n}: "Voltar" leva ao passo anterior`, (await p.getAttribute('.ob-back', 'href')) === '#/onboarding/' + (n - 1));
    }
    // erro de rede ao carregar: banner + Tentar de novo
    d.fake.state.mode.rpcDrop = { sign_me: true };
    await p.evaluate(() => { location.reload(); });
    await p.waitForSelector('.ob .banner.danger', { timeout: 15000 });
    check('AC7 erro ao carregar: banner "Não foi possível carregar seus dados." com "Tentar de novo"', (await text(p, '.ob .banner')) === 'Não foi possível carregar seus dados. Tentar de novo' && (await p.getByRole('button', { name: 'Tentar de novo' }).count()) === 1, await text(p, '.ob .banner'));
    check('AC7 erro ao carregar: o foco vai ao "Tentar de novo" e o avatar continua disponível', (await p.evaluate(() => document.activeElement.textContent.trim())) === 'Tentar de novo' && (await p.locator('#avatar').count()) === 1);
    check('AC7 só um aviso de erro na tela (o shell não repete)', (await p.locator('.banner.danger:visible').count()) === 1);
    d.fake.state.mode.rpcDrop = {};
    await p.click('text=Tentar de novo'); await pronta(p);
    check('AC7 "Tentar de novo" recarrega o passo', (await hash(p)) === '#/onboarding/3' && (await h1(p)) === 'Certificado (opcional)');
    // erro de rede ao concluir
    d.fake.state.mode.rpcDrop = { sign_onboarding_done: true };
    await p.click('text=Concluir'); await p.waitForSelector('.ob-msg .banner', { timeout: 15000 });
    check('AC7 erro ao concluir: "Não foi possível concluir agora. Tente de novo." e continua no passo 3', (await text(p, '.ob-msg .banner')).startsWith('Não foi possível concluir agora. Tente de novo.') && (await hash(p)) === '#/onboarding/3');
    check('AC7 erro ao concluir: os botões voltam a funcionar (sem beco)', !(await p.getByRole('button', { name: 'Concluir' }).isDisabled()) && !(await p.getByRole('button', { name: 'Pular certificado' }).isDisabled()));
    d.fake.state.mode.rpcDrop = {};
    await p.click('.ob-msg >> text=Tentar de novo'); await wait(p, () => location.hash === '#/documentos');
    check('AC7 "Tentar de novo" ao concluir termina o onboarding', (await getState(d, nid.pronto)).onboarding_done === true);
    // Sair encerra a sessão
    const w = await prep(d, 'b', {});
    await sai(d); await ver(d, w); await pronta(p);
    await p.click('#avatar'); await p.click('.menu-item.danger'); await wait(p, () => location.hash === '#/entrar');
    check('AC7 "Sair" encerra a sessão (volta ao login, sem token no armazenamento)', (await p.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)).length)) === 0);
    await p.evaluate(() => { location.hash = '#/onboarding/2'; }); await wait(p, () => location.hash === '#/entrar');
    check('AC7 sem sessão, #/onboarding/2 vai ao login', (await hash(p)) === '#/entrar');
  });

  await t('AC7/AC-R7 e-mail não confirmado: um só aviso e saída (passo 1, 2 e 3; sem aviso duplicado do shell)', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'naoConf', {});
    await ver(d, u); await pronta(p);
    await q(d, `update auth.users set email_confirmed_at = null where id = $1`, [`e1000000-0000-4000-8000-${String(nid.naoConf).padStart(12, '0')}`]);
    d.fake.state.mode.noop = true;
    await p.reload(); await wait(p, () => document.querySelector('.ob .banner'), null, 10000);
    const nBan = async () => (await p.locator('body').innerText()).match(/Confirme seu e-mail/g)?.length || 0;
    check('AC-R7 onboarding com e-mail não confirmado: "Confirme seu e-mail" aparece 1 vez só (sem aviso do shell)', (await nBan()) === 1 && (await p.locator('.shell-notice .banner').count()) === 0, await p.locator('body').innerText());
    check('AC7 e-mail não confirmado: "Reenviar e-mail" e a saída pelo avatar existem', (await p.getByRole('button', { name: 'Reenviar e-mail' }).count()) === 1 && (await p.locator('#avatar').count()) === 1);
    await p.click('text=Reenviar e-mail'); await p.waitForSelector('.pf-msg .banner'); check('AC7 reenvio mostra "Enviamos de novo..."', /Enviamos de novo/.test(await text(p, '.pf-msg')), await text(p, '.pf-msg'));
    // Verificação: o aviso era duplicado (banner da página + cartão do contato)
    await irPara(p, '#/conta/verificacao'); await wait(p, () => document.querySelector('.vf') && !document.querySelector('.vf[aria-busy="true"]'));
    check('AC-R7 Conta > Verificação com e-mail não confirmado: um só aviso visível (contagem = 1)', (await nBan()) === 1, await p.locator('body').innerText());
    await irPara(p, '#/conta/perfil'); await wait(p, () => document.querySelector('.pf-card .banner'));
    check('AC-R7 Conta > Perfil com e-mail não confirmado: um só aviso', (await nBan()) === 1);
    await q(d, `update auth.users set email_confirmed_at = now() where id = $1`, [`e1000000-0000-4000-8000-${String(nid.naoConf).padStart(12, '0')}`]);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC8
  await t('AC8 gate: documentos com onboarding pendente volta ao onboarding; quem terminou e abre /2 vai a Documentos', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'semVerif', {});
    await ver(d, u); await pronta(p);
    await irPara(p, '#/documentos'); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h'));
    check('AC8 #/documentos com onboarding pendente volta ao onboarding (no passo pendente, sem aviso)', (await hash(p)) === '#/onboarding/2' && (await p.locator('.ob-aviso').count()) === 0, await hash(p));
    for (const r of ['#/envio/novo', '#/plano']) { await irPara(p, r); await wait(p, () => /^#\/onboarding/.test(location.hash) && document.querySelector('#ob-h')); check(`AC8 ${r} também volta ao onboarding`, /^#\/onboarding\/2$/.test(await hash(p))); }
    await sai(d);
    const v = await prep(d, 'concluido', { verif: 'email', done: true });
    await ver(d, v); await wait(p, () => location.hash === '#/documentos');
    for (const hx of ['#/onboarding/1', '#/onboarding/2', '#/onboarding/3', '#/onboarding/9']) {
      const L1 = await p.evaluate(() => history.length);
      await irPara(p, hx); await wait(p, () => location.hash === '#/documentos' && document.querySelector('#view h1'));
      check(`AC8 quem já terminou e abre ${hx} vai a Documentos por replace`, (await hash(p)) === '#/documentos' && (await p.evaluate(() => history.length)) === L1 + 1, hx);
    }
  });

  await t('Concorrência: dois navegadores concluem; o segundo recebe sucesso idempotente', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'pronto', { verif: 'email' });
    await ver(d, u); await pronta(p);
    const p2 = await d.ctx.newPage(); await p2.goto(d.origin + '/#/onboarding/3'); await p2.waitForSelector('#ob-h'); await p2.waitForSelector('.ob:not([aria-busy="true"])');
    await p.click('text=Concluir'); await wait(p, () => location.hash === '#/documentos');
    await p2.click('text=Pular certificado'); await p2.waitForFunction(() => location.hash === '#/documentos', null, { timeout: 8000 });
    check('Concorrência: o segundo navegador também conclui sem erro e termina em Documentos', (await p2.evaluate(() => location.hash)) === '#/documentos' && (await p2.locator('.banner.danger').count()) === 0);
    check('Concorrência: uma só linha de identidade com done=true', (await q(d, `select count(*)::int n from public.sign_identity where user_id = $1 and onboarding_done`, [u.id]))[0].n === 1);
    await p2.close();
  });

  await t('Servidor recusa: sign_onboarding_done devolve onboarding_incomplete e a tela volta ao passo pendente com o aviso (código cru nunca aparece)', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'pronto', { verif: 'email' });
    await ver(d, u); await pronta(p);
    // outra aba/ação derrubou a verificação depois que a tela carregou
    await q(d, `update public.sign_identity set phone_verified_at = null, phone_channel = null where user_id = $1`, [u.id]);
    await p.click('text=Concluir'); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('.ob-aviso'));
    check('onboarding_incomplete: vai ao passo pendente (2) com "Complete seus dados e verifique seu contato para concluir."', (await text(p, '.ob-aviso')) === 'Complete seus dados e verifique seu contato para concluir.' && !/onboarding_incomplete/.test(await p.locator('body').innerText()), await text(p, '.ob-aviso'));
    check('onboarding_incomplete: o banco continua done=false', (await getState(d, nid.pronto)).onboarding_done === false);
  });

  // ---------------------------------------------------------------------------------------------------------------- V6-01 / AC-R5 rótulos
  await t('AC-R5 (V6-01) UI: "E-mail confirmado" ou "Celular verificado" conforme contact_kind (onboarding, Verificação e Perfil)', open, { ...PG, width: 1280 }, async (d) => {
    const p = d.page;
    const e = await prep(d, 'pronto', { verif: 'email' });
    await ver(d, e); await pronta(p); await irPara(p, '#/onboarding/2'); await wait(p, () => document.querySelector('.vf-card'));
    check('AC-R5 onboarding passo 2, e-mail: "E-mail confirmado"', /E-mail confirmado/.test(await text(p, '.vf-value')) && !/Celular verificado/.test(await text(p, '.vf-value')), await text(p, '.vf-value'));
    await p.click('text=Continuar'); await wait(p, () => location.hash === '#/onboarding/3'); await p.click('text=Concluir'); await wait(p, () => location.hash === '#/documentos');
    await irPara(p, '#/conta/verificacao'); await wait(p, () => document.querySelector('.vf-value'));
    check('AC-R5 Verificação, e-mail: "E-mail confirmado"', /E-mail confirmado/.test(await text(p, '.vf-value')));
    await sai(d);
    const f = await prep(d, 'fone', { verif: 'phone', done: true }); await q(d, `update public.profiles set phone = '5511987651234' where id = $1`, [f.id]); await q(d, `update public.sign_identity set phone = '5511987651234' where user_id = $1`, [f.id]);
    await ver(d, f); await wait(p, () => location.hash === '#/documentos'); await irPara(p, '#/conta/verificacao'); await wait(p, () => document.querySelector('.vf-value'));
    check('AC-R5 Verificação, celular: "Celular verificado" e número mascarado', /Celular verificado/.test(await text(p, '.vf-value')) && /\(11\) •••••-1234/.test(await text(p, '.vf-value')), await text(p, '.vf-value'));
    await irPara(p, '#/conta/perfil'); await wait(p, () => document.querySelector('#pf-cel-l'));
    check('AC-R5 Perfil, celular verificado por celular: selo "Celular verificado" (B-5: rótulo literal)', /Celular verificado/.test(await text(p, '#pf-cel-l + .pf-value')) && !/Não verificado/.test(await text(p, '#pf-cel-l + .pf-value')), await text(p, '#pf-cel-l + .pf-value'));
    await sai(d);
    const g = await prep(d, 'g', { verif: 'email', done: true }); await q(d, `update public.profiles set phone = '5511987651234' where id = $1`, [g.id]); await q(d, `update public.sign_identity set phone = '5511987651234' where user_id = $1`, [g.id]);
    await ver(d, g); await wait(p, () => location.hash === '#/documentos'); await irPara(p, '#/conta/perfil'); await wait(p, () => document.querySelector('#pf-cel-l'));
    check('AC-R5 (V6-01) Perfil, verificação por e-mail: o celular NÃO é rotulado "Verificado" (era o defeito); selo "Não verificado"', /Não verificado/.test(await text(p, '#pf-cel-l + .pf-value')), await text(p, '#pf-cel-l + .pf-value'));
    check('AC-R5 Perfil: e-mail "E-mail confirmado" (B-5: contact_kind=email)', /E-mail confirmado/.test(await text(p, '#pf-mail-l + .pf-value')));
  });

  // ---------------------------------------------------------------------------------------------------------------- AC-R8 CPF no titular
  await t('AC-R8 (V6-05) o CPF completo não aparece no DOM nem no title da linha Titular', open, { ...PG, width: 390, cfg: {} }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'cert', { cert: 'ok', done: true });
    const cpf = cpfValido(nid.cert);
    await ver(d, u); await wait(p, () => location.hash === '#/documentos');
    await irPara(p, '#/conta/verificacao'); await wait(p, () => document.querySelector('.vf-cert'));
    const dom = await p.evaluate(() => ({ html: document.getElementById('sign').innerHTML, titles: [...document.querySelectorAll('[title]')].map((e) => e.getAttribute('title')), titular: document.querySelector('.vf-kv dd').textContent, ttl: document.querySelector('.vf-kv dd').getAttribute('title') }));
    const fmt = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    check('AC-R8 DOM da Verificação: nem o CPF "só números" nem o formatado aparecem (a linha CPF mostra a máscara)', !dom.html.includes(cpf) && !dom.html.includes(fmt), cpf);
    check('AC-R8 linha Titular e seu title sem os 11 dígitos, com a máscara', !/\d{11}/.test(dom.titular + dom.ttl) && /•••\.\d{3}\.\d{3}-••/.test(dom.titular) && dom.ttl === dom.titular, [dom.titular, dom.ttl]);
    // defesa no cliente: mesmo que o servidor devolvesse o CPF inteiro, a tela mascara
    const cli = await p.evaluate(async (v) => { const f = await import('/js/lib/fmt.js?v=' + v); return [f.maskSubject('CN=X:52998224725'), f.maskSubject('CN=X 529.982.247-25'), f.maskSubject('O=E:11222333000181'), f.maskSubject(null), f.maskSubject('•••.982.247-••')]; }, VER);
    check('AC-R8 maskSubject do cliente: mascara CPF, preserva CNPJ, aceita null e é idempotente', cli[0] === 'CN=X:•••.982.247-••' && cli[1] === 'CN=X •••.982.247-••' && cli[2] === 'O=E:11222333000181' && cli[3] === '' && cli[4] === '•••.982.247-••', cli);
  });

  // ---------------------------------------------------------------------------------------------------------------- AC9 larguras e capturas
  for (const tema of ['claro', 'escuro']) for (const w of [320, 375, 768, 1024, 1280, 1440, 2560]) await t(`AC9 ${tema} ${w}: sem rolagem horizontal, sem corte, 3 itens legíveis`, open, { ...PG, width: w, height: w >= 1024 ? 900 : 800, theme: tema === 'escuro' ? 'dark' : undefined }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'incompleto', { nome: null, cpf: null, meta: { name: 'Nova Pessoa Cadastro' } });
    await ver(d, u); await pronta(p);
    if (tema === 'escuro') await d.setTheme('dark');
    for (const passo of [1, 2, 3]) {
      if (passo === 2) { await p.fill('#pf-nome', 'Nova Pessoa Cadastro'); await p.fill('#pf-cpf', cpfValido(nid.incompleto)); await p.click('.pf-save'); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('.vf-card')); }
      if (passo === 3) { await q(d, `update public.sign_identity set phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [u.id]); await p.evaluate(async (v) => { const a = await import('/js/lib/api.js?v=' + v); a.forgetMe(); }, VER); await p.reload(); await pronta(p); await irPara(p, '#/onboarding/3'); await wait(p, () => document.querySelector('.ob-resumo')); await pronta(p); if (tema === 'escuro') await d.setTheme('dark'); }
      await p.waitForTimeout(200);
      const o = await overflow(p); const cz = await cortes(p);
      const tag = `${tema} ${w} passo ${passo}`;
      check(`AC9 ${tag}: sem rolagem horizontal`, !o.hscroll, o);
      check(`AC9 ${tag}: sem elemento cortado ou fora da tela`, cz.length === 0 && o.over.length === 0, [cz, o.over]);
      const itens = await p.evaluate(() => [...document.querySelectorAll('.ob-steps li')].map((li) => { const b = li.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), ok: li.scrollWidth <= li.clientWidth + 1 && b.right <= innerWidth + 0.5 && b.left >= -0.5 && b.width > 0 }; }));
      check(`AC9 ${tag}: os 3 itens de .ob-steps visíveis, inteiros e sem corte`, itens.length === 3 && itens.every((x) => x.ok), itens);
      const largura = await p.evaluate(() => Math.round(document.querySelector('.ob').getBoundingClientRect().width));
      check(`AC9 ${tag}: o conteúdo não passa de ${passo === 3 ? 960 : 640} px (${largura})`, largura <= (passo === 3 ? 960 : 640) + 1, largura);
      if (w >= 1024 && passo === 3) check(`AC9 ${tag}: resumo ao lado do certificado em duas colunas`, await p.evaluate(() => { const g = document.querySelector('.ob-grid'); const [a, b] = [...g.children].map((x) => x.getBoundingClientRect()); return a.top === b.top && b.left > a.left; }));
      if (w < 1024 && passo === 3) check(`AC9 ${tag}: uma coluna só`, await p.evaluate(() => { const g = document.querySelector('.ob-grid'); const [a, b] = [...g.children].map((x) => x.getBoundingClientRect()); return b.top >= a.bottom - 1; }));
      const acao = await p.evaluate(() => { const bs = [...document.querySelectorAll('.ob-actions .btn')].map((b) => b.getBoundingClientRect()); const vw = innerWidth; return { n: bs.length, cheia: bs.length > 0 && bs.every((b) => b.width >= vw - 56), emLinha: bs.length > 1 && new Set(bs.map((b) => Math.round(b.top))).size === 1 }; });
      if (passo > 1 && w < 480) check(`AC9 ${tag}: botões em largura total, empilhados`, acao.cheia && !acao.emLinha, acao);
      if (passo > 1 && w >= 480) check(`AC9 ${tag}: botões em linha`, acao.emLinha, acao);
      await shot(p, `onb-${tema}-${w}-passo${passo}`);
    }
  });

  await t('AC9 zoom de 200% (equivale a 720 px em 1440 e 160 px em 320): sem cortes', open, { ...PG, width: 720, height: 800 }, async (d) => {
    const p = d.page; const u = await prep(d, 'semVerif', {});
    await ver(d, u); await pronta(p);
    for (const w of [720, 160]) {
      await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(300);
      for (const passo of [1, 2, 3]) {
        if (passo === 3) { await q(d, `update public.sign_identity set phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [u.id]); await p.evaluate(async (v) => { const a = await import('/js/lib/api.js?v=' + v); a.forgetMe(); }, VER); }
        await irPara(p, '#/onboarding/' + passo); await p.reload(); await pronta(p); await p.waitForTimeout(200);
        const o = await overflow(p); const cz = await cortes(p);
        check(`AC9 zoom 200%: ${w} px passo ${passo} sem rolagem horizontal nem corte`, !o.hscroll && cz.length === 0, [o, cz]);
        if (w === 160) await shot(p, `onb-zoom-160-passo${passo}`); else await shot(p, `onb-zoom-720-passo${passo}`);
      }
    }
  });

  // ---------------------------------------------------------------------------------------------------------------- AC10 teclado, alvos, contraste
  await t('AC10 teclado em 1280: Tab na ordem visual, Enter aciona, foco visível, foco no h1 a cada troca de passo', open, { ...PG, width: 1280, height: 900 }, async (d) => {
    const p = d.page;
    const u = await prep(d, 'incompleto', { nome: null, cpf: null });
    await ver(d, u); await pronta(p);
    const percorre = async (n) => { const seq = []; for (let i = 0; i < n; i++) { await p.keyboard.press('Tab'); const x = await p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body || !a.closest('#view')) return null; const b = a.getBoundingClientRect(); const c = getComputedStyle(a); return { id: a.id || a.tagName + ':' + (a.textContent || '').trim().slice(0, 14), top: Math.round(b.top), left: Math.round(b.left), foco: (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none') }; }); if (!x) break; seq.push(x); } return seq; }; /* só o conteúdo (#view): para ao sair dele */
    const visual = (seq) => seq.filter((s, i) => i > 0 && seq[i - 1] && s).every((s, i, a) => true) && seq.every((s, i) => i === 0 || !seq[i - 1] || !s || s.top > seq[i - 1].top - 8 || (Math.abs(s.top - seq[i - 1].top) <= 8 && s.left >= seq[i - 1].left));
    await p.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    const s1 = await percorre(12);
    check('AC10 passo 1: Tab percorre nome, CPF e botão, na ordem visual (de cima para baixo, da esquerda para a direita)', visual(s1) && s1.length === 3, s1);
    check('AC10 passo 1: cada foco tem anel visível (outline ou sombra)', s1.filter(Boolean).every((s) => s.foco), s1.filter((s) => s && !s.foco));
    await p.fill('#pf-nome', 'Teclado Teste Dois'); await p.fill('#pf-cpf', cpfValido(nid.incompleto)); await p.focus('#pf-cpf'); await p.keyboard.press('Enter');
    await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h').textContent === 'Verificar contato');
    check('AC10 Enter no formulário aciona "Salvar e continuar"; foco no h1 do passo 2', (await p.evaluate(() => document.activeElement.id)) === 'ob-h');
    await p.evaluate(() => { document.activeElement.blur(); });
    const s2 = await percorre(12);
    check('AC10 passo 2: Tab percorre canal, Enviar código e Voltar na ordem visual, cada foco com anel visível', visual(s2) && s2.length === 3 && s2.every((s) => s.foco), s2);
    await q(d, `update public.sign_identity set phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [u.id]);
    await p.evaluate(async (v) => { const a = await import('/js/lib/api.js?v=' + v); a.forgetMe(); }, VER); await p.reload(); await pronta(p);
    await p.focus('.ob-actions .btn:not(.secondary)'); await p.keyboard.press('Enter');
    await wait(p, () => location.hash === '#/onboarding/3' && document.querySelector('#ob-h').textContent === 'Certificado (opcional)');
    check('AC10 Enter em "Continuar" vai ao passo 3 e o foco cai no h1', (await p.evaluate(() => document.activeElement.id)) === 'ob-h');
    await p.evaluate(() => { document.activeElement.blur(); });
    const s3 = await percorre(14);
    check('AC10 passo 3: cada foco tem anel visível', s3.filter(Boolean).every((s) => s.foco), s3.filter((s) => s && !s.foco));
    check('AC10 passo 3: Tab passa por Voltar, Pular certificado e Concluir, nessa ordem', (() => { const ids = s3.filter(Boolean).map((s) => s.id); const a = ids.indexOf('A:Voltar'), b = ids.indexOf('BUTTON:Pular certific'), c = ids.indexOf('BUTTON:Concluir'); return a >= 0 && b > a && c > b; })(), s3.filter(Boolean).map((s) => s.id));
    check('AC10 passo 3: a ordem visual dos botões segue o Tab no desktop (Voltar à esquerda, Concluir à direita)', await p.evaluate(() => { const bs = [...document.querySelectorAll('.ob-actions .btn')].map((b) => b.getBoundingClientRect().left); return bs.every((x, i) => i === 0 || x > bs[i - 1]); }));
    await p.focus('text=Voltar'); await p.keyboard.press('Enter'); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('#ob-h').textContent === 'Verificar contato');
    check('AC10 Enter em "Voltar" vai ao passo 2 e o foco cai no h1', (await p.evaluate(() => document.activeElement.id)) === 'ob-h');
  });

  for (const w of [320, 390, 1280]) await t(`AC10 alvos >= 44 px e contraste >= 4,5 em ${w} (claro e escuro)`, open, { ...PG, width: w }, async (d) => {
    const p = d.page;
    for (const [tema, chave] of [['claro', 'incompleto'], ['escuro', 'c']]) {
      const u = await prep(d, chave, { nome: null, cpf: null });
      if (tema === 'escuro') await sai(d);
      await ver(d, u); await pronta(p);
      if (tema === 'escuro') await d.setTheme('dark');
      for (const passo of [1, 2, 3]) {
        if (passo === 2) { await p.fill('#pf-nome', 'Nova Pessoa Cadastro'); await p.fill('#pf-cpf', cpfValido(nid[chave])); await p.click('.pf-save'); await wait(p, () => location.hash === '#/onboarding/2' && document.querySelector('.vf-card')); }
        if (passo === 3) { await q(d, `update public.sign_identity set phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [u.id]); await p.evaluate(async (v) => { const a = await import('/js/lib/api.js?v=' + v); a.forgetMe(); }, VER); await p.reload(); await pronta(p); await irPara(p, '#/onboarding/3'); await wait(p, () => document.querySelector('.ob-resumo')); await pronta(p); if (tema === 'escuro') await d.setTheme('dark'); }
        const peq = await toqueMin(p);
        check(`AC10 ${tema} ${w} passo ${passo}: controles interativos >= 44 px`, peq.length === 0, peq);
        const sels = ['.ob-steps li', '.ob-steps li.on', '.ob-steps li.done', '.page-sub', '.help', '.ob-sum .tag', '.ob-level', '.ob-note', '.ob-actions .btn', '.ob-actions .btn.secondary', '.ob-aviso', '.vf-card .vf-empty', '.vf-card .tag', '#ob-h', '.pf-form label'];
        const itens = await p.evaluate((ss) => ss.map((s) => { const e = document.querySelector(s); if (!e) return null; let bg = e; let c = 'rgba(0,0,0,0)'; while (bg && /rgba\(0, 0, 0, 0\)|transparent/.test(c = getComputedStyle(bg).backgroundColor)) bg = bg.parentElement; return { s, fg: getComputedStyle(e).color, bg: c }; }).filter(Boolean), sels);
        for (const it of itens) { const r = ratio(num(it.fg), num(it.bg)); check(`AC10 ${tema} ${w} passo ${passo}: contraste ${it.s} = ${r.toFixed(2)} >= 4,5`, r >= 4.5, it); }
      }
    }
  });

  // ---------------------------------------------------------------------------------------------------------------- AC11, AC13, desempenho
  await t('AC11 CSP sem erros, sem estilo ou script inline; AC13 teto de 32 px nos ícones; CLS e troca de passo', open, { ...PG, width: 390 }, async (d) => {
    const p = d.page;
    await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    const u = await prep(d, 'incompleto', { nome: null, cpf: null });
    await ver(d, u); await pronta(p);
    const inline = async () => p.evaluate(() => ({ style: document.querySelectorAll('#sign [style]').length, scripts: [...document.scripts].filter((s) => !s.src).length, onclick: document.querySelectorAll('#sign [onclick],[onload]').length }));
    check('AC11 passo 1: nenhum atributo style, script inline ou handler inline', JSON.stringify(await inline()) === JSON.stringify({ style: 0, scripts: 0, onclick: 0 }), await inline());
    await p.fill('#pf-nome', 'Ana'); await p.click('.pf-save');
    d.fake.state.mode.rpcDrop = { sign_profile_save: true }; await p.fill('#pf-nome', 'Ana Erro Rede'); await p.fill('#pf-cpf', cpfValido(nid.incompleto)); await p.click('.pf-save'); await p.waitForSelector('.pf-msg .banner', { timeout: 9000 });
    check('AC13 ícone do banner de erro <= 32 px', (await svgs(p)).every((x) => x <= 32) && (await svgs(p)).length > 0, await svgs(p));
    d.fake.state.mode.rpcDrop = {}; await p.click('.pf-save'); await wait(p, () => location.hash === '#/onboarding/2');
    await p.click('text=Enviar código'); await p.waitForSelector('#vf-codigo'); await p.fill('#vf-codigo', '12'); await p.click('.vf-actions .btn:not(.secondary)');
    check('AC13 ícones e toasts em todos os estados <= 32 px', (await svgs(p)).every((x) => x <= 32), await svgs(p));
    await q(d, `update public.sign_identity set phone_verified_at = now(), phone_channel = 'email' where user_id = $1`, [u.id]); await p.evaluate(async (v) => { const a = await import('/js/lib/api.js?v=' + v); a.forgetMe(); }, VER); await p.reload(); await pronta(p);
    // troca de passo sem rede: mede do clique ao h1 novo (a sessão e o sign_me já estão em cache)
    const tempo = await p.evaluate(() => new Promise((ok) => {
      const t0 = performance.now(); const btn = [...document.querySelectorAll('.ob-actions .btn')].find((b) => b.textContent.trim() === 'Continuar');
      const mo = new MutationObserver(() => { const hh = document.getElementById('ob-h'); if (hh && hh.textContent === 'Certificado (opcional)' && !document.querySelector('.ob[aria-busy="true"]')) { mo.disconnect(); ok(performance.now() - t0); } });
      mo.observe(document.body, { subtree: true, childList: true, characterData: true }); btn.click();
    }));
    check(`desempenho: troca de passo (clique até o h1 novo) <= 100 ms: ${tempo.toFixed(1)} ms`, tempo <= 100, tempo);
    const cls = await p.evaluate(() => window.__cls);
    check(`desempenho: CLS acumulado do fluxo <= 0,05: ${cls.toFixed(4)}`, cls <= 0.05, cls);
    await p.click('text=Pular certificado'); await wait(p, () => location.hash === '#/documentos'); await p.waitForSelector('.toast');
    check('AC13 ícone do toast de sucesso <= 32 px', (await svgs(p)).every((x) => x <= 32), await svgs(p));
    check('AC11 nenhum erro no console (inclui CSP) e nenhuma requisição externa no fluxo inteiro', d.errors.length === 0 && d.external.length === 0 && !d.consoleAll.some((m) => /Content Security Policy|Refused to/.test(m)), [d.errors, d.external, d.consoleAll.filter((m) => /Content Security|Refused/.test(m))]);
    res_tempos.push(tempo, cls);
  });

  // ---------------------------------------------------------------------------------------------------------------- JS novo (gzip)
  {
    const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;
    const novos = ['views/onboarding.js', 'views/perfil-form.js', 'views/verificacao-contato.js'];
    const tocados = ['views/perfil.js', 'views/verificacao.js', 'lib/router.js', 'lib/api.js', 'lib/fmt.js', 'app.js', 'views/construcao.js'];
    const lido = (f) => fs.readFileSync(path.join(ROOT, 'apps/sign/js', f));
    const velho = (f) => { try { return cp.execFileSync('git', ['-C', ROOT, 'show', 'HEAD:apps/sign/js/' + f]); } catch { return Buffer.alloc(0); } };
    const antes = [...novos, ...tocados].reduce((s, f) => s + gz(velho(f)), 0);
    const depois = [...novos, ...tocados].reduce((s, f) => s + gz(lido(f)), 0);
    const soNovos = novos.reduce((s, f) => s + gz(lido(f)), 0);
    const delta = depois - antes;
    // definição da spec (seção 8): onboarding.js + componentes extraídos, menos o que saiu de perfil.js e verificacao.js
    const nucleo = [...novos, 'views/perfil.js', 'views/verificacao.js'];
    const deltaSpec = nucleo.reduce((s, f) => s + gz(lido(f)) - gz(velho(f)), 0);
    res_js.push({ novos: novos.map((f) => [f, gz(lido(f))]), soNovos, deltaSpec, deltaTudo: delta, antes, depois });
    check(`JS (definição da spec): onboarding.js + perfil-form.js + verificacao-contato.js menos o que saiu de perfil.js e verificacao.js = ${(deltaSpec / 1024).toFixed(2)} kB gzip <= 6 kB`, deltaSpec <= 6 * 1024, { soNovos, deltaSpec });
    res_lines.push(`  (medido) JS gzip por arquivo: novos ${(soNovos / 1024).toFixed(1)} kB; líquido pela spec ${(deltaSpec / 1024).toFixed(2)} kB; líquido de TODOS os arquivos tocados (inclui router, api, fmt, app) ${(delta / 1024).toFixed(2)} kB (> 6 kB: ver ON-4)`);
    const css0 = gz(cp.execFileSync('git', ['-C', ROOT, 'show', 'HEAD:apps/sign/styles.css'])), css1 = gz(fs.readFileSync(path.join(ROOT, 'apps/sign/styles.css')));
    res_js.push({ css: css1 - css0 });
  }

  console.info('limpando: reset.sh depois'); reset('depois');
  for (const l of res_lines) console.info(l);
  console.info('MEDIDAS ' + JSON.stringify({ tempoTrocaMs: res_tempos[0], cls: res_tempos[1], js: res_js }));
  done();
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
