// Print "Meus documentos" do Lottus Sign. Dados 100% fictícios.
const path = require('path'), { execFileSync } = require('child_process'), fs = require('fs');
const { shoot, ROOT } = require('./lib.cjs');
const d = (n) => new Date(Date.UTC(2026, 10, 24 - n, 15)).toISOString();
const docs = [
  ['Contrato de cessão de crédito nº 0412', 'Alfa Capital Securitizadora', 1],
  ['Termo de adesão ao fundo, 3ª emissão', 'FIDC Horizonte Recebíveis', 2],
  ['Aditivo ao regulamento do fundo', 'FIDC Aurora Varejo', 3],
  ['Instrumento de cessão, lote 87', 'Beta Fomento Mercantil', 4],
  ['Notificação de cessão ao sacado', 'Alfa Capital Securitizadora', 6],
  ['Termo de ciência de risco', 'FIDC Horizonte Recebíveis', 8],
  ['Procuração para movimentação', 'Gama Investimentos Ltda', 11],
].map(([name, fund, ago], i) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, name, fund, status: i % 3 === 1 ? 'viewed' : 'pending', sent_at: d(ago), signed_at: null, code: 'a1b2c3d4e5f60718' + i }));
(async () => {
  const out = path.join(ROOT, 'apps/site/img/sign-painel.webp');
  const png = await shoot({ app: 'sign', out, ready: '[data-sign]', user: { id: '11111111-1111-4111-8111-111111111111', email: 'marina.souza@exemplo.com.br', meta: { name: 'Marina Souza' } }, rpc: { sign_my_documents: docs } });
  execFileSync('python3', [path.join(__dirname, 'toWebp.py'), png, out]); fs.unlinkSync(png);
  console.log(fs.statSync(out).size, 'bytes');
})();
