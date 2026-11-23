const { open } = require('../drv.cjs');
const WID='3bfa150e-729f-44d6-bb89-4199f8888232';
const R = ['patrimonio','bens','investimentos','posicao','transacoes','ativos','gastos','gastos/transacoes','gastos/cadastros','relatorios','acessos','config'];
const WRITE = /Nova transação|Importar|Novo ativo|Novo\b|Nova regra|Convidar|Salvar|Excluir|Arquivar|Reaplicar|Dívida|Bem\b|Editar|Remover/;
async function login(w, email){ await w.go('#/entrar'); await w.page.fill('#email', email); await w.page.fill('#password','senha-exemplo-1'); await w.page.click('button[type=submit]'); await w.page.waitForTimeout(1200); }
(async () => {
  for (const who of ['carla.visual@exemplo.com.br','bruno.editor@exemplo.com.br']) {
    const w = await open({ width: 1280 }); await login(w, who);
    const menu = await w.page.$$eval('#nav a', (as) => as.map((a) => a.getAttribute('href').split('/').slice(3).join('/')).filter(Boolean));
    console.log('==', who, 'menu:', [...new Set(menu)].join(' '));
    for (const r of R) {
      await w.page.evaluate((h)=>{location.hash=h}, '/w/'+WID+'/'+r); await w.page.waitForTimeout(1100);
      const btns = await w.page.$$eval('#view button:not([disabled]), #view a.btn', (bs) => bs.filter(b=>b.offsetParent).map((b) => b.textContent.trim()).filter(Boolean));
      const hash = await w.page.evaluate(()=>location.hash);
      const writes = btns.filter((b) => WRITE.test(b));
      console.log('  ', r.padEnd(18), hash.endsWith(r)?'':'-> '+hash.replace(WID,'W'), writes.length ? 'BOTÕES DE ESCRITA: '+writes.join(' | ') : 'sem escrita', w.errors.length? 'ERROS '+w.errors.join('|'):'');
    }
    await w.close();
  }
  const w = await open({ width: 1280 }); await login(w, 'davi.intruso@exemplo.com.br');
  await w.page.evaluate((h)=>{location.hash=h}, '/w/'+WID+'/patrimonio'); await w.page.waitForTimeout(1500);
  console.log('== davi (fora da carteira) ->', await w.page.evaluate(()=>location.hash), (await w.page.innerText('body')).replace(/\s+/g,' ').slice(0,200));
  await w.close();
})();
