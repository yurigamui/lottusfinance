// Mede o JS da seção (sem vendor) e o tempo até interativo (campo E-mail focado) contra o fake, sem e com rede lenta simulada.
const { open, APP } = require('./drv.cjs');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const files = ['js/app.js', ...fs.readdirSync(path.join(APP, 'js/lib')).map((f) => 'js/lib/' + f), ...fs.readdirSync(path.join(APP, 'js/views')).map((f) => 'js/views/' + f)];
let raw = 0, gz = 0;
for (const f of files) { const b = fs.readFileSync(path.join(APP, f)); raw += b.length; gz += zlib.gzipSync(b).length; }
console.info(`JS da seção (${files.length} arquivos, sem vendor): ${(raw / 1024).toFixed(1)} kB brutos, ${(gz / 1024).toFixed(1)} kB gzip`);
(async () => {
  for (const slow of [false, true]) {
    const times = [];
    for (let i = 0; i < 7; i++) {
      const d = await open({ width: 390 });
      if (slow) { const c = await d.ctx.newCDPSession(d.page); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }); }
      await d.page.addInitScript(() => { const t = setInterval(() => { const a = document.activeElement; if (a && a.id === 'email') { window.__tti = performance.now(); clearInterval(t); } }, 10); });
      await d.page.goto(d.origin + '/#/entrar');
      await d.page.waitForFunction(() => window.__tti, null, { timeout: 20000 });
      times.push(Math.round(await d.page.evaluate(() => window.__tti)));
      await d.close();
    }
    times.sort((a, b) => a - b);
    console.info(`${slow ? 'rede lenta (1,6 Mbps, 150 ms)' : 'sem limite (localhost)'}: tempo até o E-mail focado, mediana ${times[3]} ms, min ${times[0]}, max ${times[6]} (n=7)`);
  }
})();
