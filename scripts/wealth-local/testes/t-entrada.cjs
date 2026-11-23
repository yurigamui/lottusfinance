const { open, overflow } = require('../drv.cjs');
const out = (k, v) => console.log(`[${k}]`, typeof v === 'string' ? v.slice(0, 260) : JSON.stringify(v));
(async () => {
  const w = await open({ width: 390, height: 844 });
  const P = w.page;
  // 1. Entrar: senha errada
  await w.go('#/entrar');
  await P.fill('#email', 'naoexiste@exemplo.com.br'); await P.fill('#password', 'senhaerrada1'); await P.click('button[type=submit]'); await P.waitForTimeout(800);
  out('entrar-senha-errada', (await P.innerText('#login-err')));
  // 2. Criar conta: senhas diferentes, curta, termos
  await w.go('#/criar-conta');
  out('criar-conta-tela', await w.text());
  await P.fill('#email', 'ana.exemplo@exemplo.com.br'); await P.fill('#password', 'segredo123'); await P.fill('#password2', 'segredo124'); await P.check('input[name=terms]'); await P.click('button[type=submit]'); await P.waitForTimeout(600);
  out('criar-conta-senhas-diferentes', await P.innerText('#su-err'));
  await P.fill('#password2', 'segredo123'); await P.click('button[type=submit]'); await P.waitForTimeout(1500);
  out('apos-criar-hash', await P.evaluate(() => location.hash));
  out('finalizar-tela', await w.text());
  // 3. Finalizar: CPF inválido, depois válido
  await P.fill('#name', 'Ana Exemplo da Silva'); await P.fill('#cpf', '11111111111'); await P.click('button[type=submit]'); await P.waitForTimeout(800);
  out('finalizar-cpf-invalido', await P.innerText('#fn-err'));
  await P.fill('#cpf', '529.982.247-25'); await P.fill('#phone', '11 98765-4321'); await P.click('button[type=submit]'); await P.waitForTimeout(1500);
  out('apos-finalizar-hash', await P.evaluate(() => location.hash));
  out('carteiras-tela', await w.text());
  out('overflow-390', await overflow(P));
  await P.screenshot({ path: process.env.SHOTS + '/entrada-carteiras-390.png', fullPage: true });
  // 4. Sair e entrar de novo
  await P.click('#avatar'); await P.waitForTimeout(200); await P.click('[data-act=logout]'); await P.waitForTimeout(800);
  out('apos-sair', await P.evaluate(() => location.hash));
  await w.go('#/carteiras'); out('carteiras-sem-login', await P.evaluate(() => location.hash));
  await P.fill('#email', 'ANA.EXEMPLO@exemplo.com.br'); await P.fill('#password', 'segredo123'); await P.click('button[type=submit]'); await P.waitForTimeout(1500);
  out('login-maiusculas', await P.evaluate(() => location.hash));
  // 5. Convite inválido e recuperar
  await P.click('#avatar'); await P.click('[data-act=logout]'); await P.waitForTimeout(600);
  await w.go('#/convite/abc'); out('convite-invalido', await w.text());
  await w.go('#/recuperar'); await P.fill('#email', 'ana.exemplo@exemplo.com.br'); await P.click('button[type=submit]'); await P.waitForTimeout(600); out('recuperar', await P.innerText('#fg-msg'));
  // 6. Rota inexistente e link profundo sem sessão
  await w.go('#/w/00000000-0000-0000-0000-000000000000/patrimonio'); out('link-profundo-sem-sessao', await P.evaluate(() => location.hash));
  out('ERROS', w.errors);
  await w.close();
})();
