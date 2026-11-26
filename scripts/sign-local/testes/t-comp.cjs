// Seção 1.0, componentes (lib/ui.js): AC9 toast, AC10 modal e confirm, AC11 pageHead/emptyState/loading, AC12 statusTag, AC13 contraste.
const { open, overflow } = require('./drv.cjs');
const { check, t, done, logged, VER } = require('./lib.cjs');
const UI = async (p, fn, arg) => { await p.evaluate(async (v) => { if (!window.__u) window.__u = await import('/js/lib/ui.js?v=' + v); }, VER); return p.evaluate(fn, arg); }; // funções reais (a CSP do app proíbe eval)

// luminância relativa e razão de contraste (WCAG)
const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = (s) => { const k = String(s).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/); if (k) return { c: [k[1], k[2], k[3]].map((x) => Math.round(parseFloat(x) * 255)), a: 1 }; const m = String(s).match(/rgba?\(([^)]+)\)/); const v = m[1].split(',').map((x) => parseFloat(x)); return { c: v.slice(0, 3), a: v.length > 3 ? v[3] : 1 }; };

(async () => {
  await t('AC9 toast', open, { width: 390 }, async (d) => {
    const p = d.page; await logged(d);
    await UI(p, () => { const u = window.__u; u.toast('Dados salvos', '', 'ok'); });
    const t0 = Date.now();
    check('AC9 1 .toast.ok em #toast-root[aria-live=polite]', (await p.locator('#toast-root[aria-live=polite] > .toast.ok').count()) === 1);
    check('AC9 toast ok sem role=alert', (await p.getAttribute('.toast.ok', 'role')) !== 'alert');
    await p.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 7000 });
    const dt = (Date.now() - t0) / 1000;
    check('AC9 ok some em 4,5 s ± 0,5', Math.abs(dt - 4.5) <= 0.5, dt);
    await UI(p, () => { const u = window.__u; u.toast('Falha', 'Algo deu errado', 'error'); });
    const t1 = Date.now();
    check('AC9 erro tem role=alert', (await p.getAttribute('.toast.error', 'role')) === 'alert');
    await p.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 12000 });
    const de = (Date.now() - t1) / 1000;
    check('AC9 erro some em 8 s ± 0,5', Math.abs(de - 8) <= 0.5, de);
    await UI(p, () => { const u = window.__u; for (const n of [1,2,3,4]) u.toast('Aviso ' + n, '', 'ok'); });
    check('AC9 4 chamadas seguidas: 3 visíveis (a mais antiga saiu)', (await p.locator('.toast').count()) === 3 && !(await p.locator('#toast-root').innerText()).includes('Aviso 1'));
    const bb = await p.evaluate(() => { const b = document.querySelector('.toast-close').getBoundingClientRect(); return [b.width, b.height, document.querySelector('.toast-close').getAttribute('aria-label')]; });
    await p.waitForTimeout(400);
    const b2 = await p.evaluate(() => { const b = document.querySelector('.toast-close').getBoundingClientRect(); return [b.width, b.height]; });
    check('AC9 botão fechar: aria-label "Fechar aviso" e 44 px ou mais', bb[2] === 'Fechar aviso' && b2[0] >= 43.5 && b2[1] >= 43.5, [bb, b2]);
    await p.click('.toast >> nth=0 >> .toast-close');
    await p.waitForTimeout(350);
    check('AC9 fechar remove o toast', (await p.locator('.toast').count()) === 2);
    await UI(p, () => { const u = window.__u; u.toast('<b>negrito</b>', '<i>it</i>', 'ok'); });
    check('AC9 texto com HTML aparece como texto', (await p.locator('#toast-root b, #toast-root i').count()) === 0 && (await p.locator('#toast-root').innerText()).includes('<b>negrito</b>'));
    // pausa com o mouse
    await p.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
    await UI(p, () => { const u = window.__u; u.toast('Pausa', '', 'ok'); });
    await p.hover('.toast'); await p.waitForTimeout(5500);
    check('AC9 não some com o mouse sobre ele', (await p.locator('.toast').count()) === 1);
    await p.mouse.move(5, 5); await p.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 7000 });
    check('AC9 some depois que o mouse sai', true);
    check('AC9 sem erros', d.errors.length === 0, d.errors);
  });

  await t('AC10 modal e confirm', open, { width: 1280 }, async (d) => {
    const p = d.page; await logged(d);
    await p.focus('#avatar');
    await UI(p, () => { const u = window.__u; window.__m = u.modal({ title: 'Título do modal', sub: 'sub', body: (() => { const w = document.createElement('div'); w.innerHTML = ''; const i = document.createElement('input'); i.id = 'mi'; i.setAttribute('aria-label','Campo'); const b = document.createElement('button'); b.id = 'mb'; b.textContent = 'Corpo'; w.append(i, b); return w; })(), foot: (() => { const b = document.createElement('button'); b.className = 'btn'; b.id = 'mf'; b.textContent = 'Salvar'; return b; })() }); });
    check('AC10 role=dialog, aria-modal e nome acessível', await p.evaluate(() => { const m = document.querySelector('#modal-root .modal-backdrop > .modal[role=dialog]'); return !!m && m.getAttribute('aria-modal') === 'true' && document.getElementById(m.getAttribute('aria-labelledby')).textContent === 'Título do modal'; }));
    check('AC10 foco inicial no primeiro campo do corpo', (await p.evaluate(() => document.activeElement.id)) === 'mi');
    const seq = []; for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); seq.push(await p.evaluate(() => document.activeElement.id || document.activeElement.getAttribute('aria-label'))); }
    check('AC10 Tab cicla dentro do modal', seq.every((x) => ['mb', 'mf', 'Fechar', 'mi'].includes(x)) && seq.includes('mi') && seq.includes('Fechar'), seq);
    const sh = []; for (let i = 0; i < 5; i++) { await p.keyboard.press('Shift+Tab'); sh.push(await p.evaluate(() => document.activeElement.id || document.activeElement.getAttribute('aria-label'))); }
    check('AC10 Shift+Tab cicla dentro do modal', sh.every((x) => ['mb', 'mf', 'Fechar', 'mi'].includes(x)) && sh.includes('Fechar'), sh);
    check('AC10 fundo inerte', await p.evaluate(() => document.getElementById('sign').inert === true));
    await p.keyboard.press('Escape');
    check('AC10 Esc fecha e o foco volta ao avatar (origem)', (await p.locator('.modal').count()) === 0 && (await p.evaluate(() => document.activeElement.id)) === 'avatar' && (await p.evaluate(() => document.getElementById('sign').inert === false)));
    await UI(p, () => { const u = window.__u; window.__m = u.modal({ title: 'Outro', body: 'texto' }); });
    await p.mouse.click(5, 5);
    check('AC10 clique no fundo fecha', (await p.locator('.modal').count()) === 0);
    await UI(p, () => { const u = window.__u; window.__m = u.modal({ title: 'Outro', body: 'texto' }); });
    await p.click('.modal-head button');
    check('AC10 botão Fechar fecha', (await p.locator('.modal').count()) === 0);
    // confirm perigoso
    await p.focus('#avatar');
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); window.__r = null; u.confirm('Cancelar envio', 'Isto não pode ser desfeito.', 'Cancelar envio', true).then((x) => { window.__r = x; }); }, VER);
    check('AC10 confirm perigoso: foco inicial em "Cancelar"', (await p.evaluate(() => document.activeElement.textContent)) === 'Cancelar');
    check('AC10 confirm perigoso: ação é .btn.danger e Cancelar é .btn.secondary', (await p.locator('.modal-foot .btn.danger').innerText()) === 'Cancelar envio' && (await p.locator('.modal-foot .btn.secondary').innerText()) === 'Cancelar');
    await p.keyboard.press('Escape'); await p.waitForFunction(() => window.__r !== null);
    check('AC10 Esc resolve false', (await p.evaluate(() => window.__r)) === false);
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); window.__r = null; u.confirm('Sair', 'Tem certeza?', 'Confirmar', true).then((x) => { window.__r = x; }); }, VER);
    await p.click('.modal-foot .btn.danger'); await p.waitForFunction(() => window.__r !== null);
    check('AC10 clique na ação resolve true', (await p.evaluate(() => window.__r)) === true && (await p.locator('.modal').count()) === 0);
    await p.evaluate(async (v) => { const u = await import('/js/lib/ui.js?v=' + v); window.__r = null; u.confirm('Enviar', 'Enviar agora?').then((x) => { window.__r = x; }); }, VER);
    check('AC10 confirm comum: foco na ação e rótulo padrão "Confirmar"', (await p.evaluate(() => document.activeElement.textContent)) === 'Confirmar' && (await p.locator('.modal-foot .btn.danger').count()) === 0);
    await p.click('.modal-head button'); await p.waitForFunction(() => window.__r !== null);
    check('AC10 fechar resolve false', (await p.evaluate(() => window.__r)) === false);
    check('AC10 sem erros', d.errors.length === 0, d.errors);
  });

  await t('AC10 modal longo em 320x568 e drawer', open, { width: 320, height: 568 }, async (d) => {
    const p = d.page; await logged(d);
    await UI(p, () => { const u = window.__u; const b = document.createElement('div'); for (let i = 0; i < 40; i++) { const q = document.createElement('p'); q.textContent = 'Parágrafo ' + i + ' ' + 'texto '.repeat(12) + 'x'.repeat(80); b.append(q); } const f = document.createElement('button'); f.className = 'btn'; f.id = 'acao'; f.textContent = 'Ação principal'; window.__m = u.modal({ title: 'Longo', body: b, foot: f }); });
    const r = await p.evaluate(() => { const m = document.querySelector('.modal'), body = document.querySelector('.modal-body'), a = document.getElementById('acao').getBoundingClientRect(); const mb = m.getBoundingClientRect(); return { rola: body.scrollHeight > body.clientHeight, hMax: mb.height <= innerHeight - 48 + 1, acaoVisivel: a.bottom <= innerHeight && a.top >= 0, hscroll: document.documentElement.scrollWidth > innerWidth, pageScroll: document.documentElement.scrollHeight > innerHeight, bodyScroll: getComputedStyle(body).overflowY, vw: innerWidth, sw: document.documentElement.scrollWidth, mw: mb.right <= innerWidth, tab: body.getAttribute('tabindex') }; });
    check('AC10 o corpo rola por dentro e o modal cabe na tela', r.rola && r.hMax && r.mw, r);
    check('AC10 o botão de ação fica dentro da tela', r.acaoVisivel, r);
    check('AC10 scrollWidth <= innerWidth', !r.hscroll, r);
    check('AC10 corpo rolável alcançável por teclado (tabindex=0)', r.tab === '0', r);
    check('AC10 max-height com dvh', await p.evaluate(() => getComputedStyle(document.querySelector('.modal')).maxHeight) !== 'none');
    await p.keyboard.press('Escape');
    await UI(p, () => { const u = window.__u; window.__m = u.modal({ title: 'Lateral', body: 'x', drawer: true }); });
    check('AC10 drawer usa .modal.drawer', (await p.locator('.modal-backdrop.drawer-bd > .modal.drawer').count()) === 1);
    await p.keyboard.press('Escape');
  });

  await t('AC11 pageHead, emptyState, loading', open, { width: 390 }, async (d) => {
    const p = d.page; await logged(d);
    await UI(p, () => { const u = window.__u; const v = document.getElementById('view'); v.replaceChildren(u.pageHead('Título', 'Sub', [Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Ação' })], { href: '#/documentos', label: 'Voltar' }), u.emptyState('Nada aqui', 'Texto de apoio', Object.assign(document.createElement('a'), { className: 'btn', href: '#/documentos', textContent: 'Ir' })), u.loading(), u.loading('Buscando')); });
    check('AC11 pageHead: 1 h1[tabindex=-1], .page-sub, .back e .row', (await p.locator('#view .page-head h1[tabindex="-1"]').count()) === 1 && (await p.locator('.page-head .page-sub').count()) === 1 && (await p.locator('.page-head a.back').count()) === 1 && (await p.locator('.page-head .row .btn').count()) === 1);
    check('AC11 emptyState com ação: botão alcançável', await p.evaluate(() => { const b = document.querySelector('.empty .btn'); b.focus(); return document.activeElement === b; }));
    check('AC11 emptyState tem strong e p', (await p.locator('.empty strong').first().innerText()) === 'Nada aqui' && (await p.locator('.empty p').first().innerText()) === 'Texto de apoio');
    check('AC11 loading: role=status e aria-label', (await p.locator('.empty .spinner[role=status][aria-label=Carregando]').count()) === 1 && (await p.locator('.empty .spinner[aria-label=Buscando]').count()) === 1);
    await UI(p, () => { const u = window.__u; document.getElementById('view').replaceChildren(u.pageHead('Só título')); });
    check('AC11 pageHead sem ações nem origem não cria .row nem .back', (await p.locator('.page-head .row, .page-head .back').count()) === 0);
  });

  await t('AC12 e AC13 statusTag e contraste', open, { width: 390 }, async (d) => {
    const p = d.page; await logged(d);
    const ESP = [['rascunho', 'Rascunho', 'tag'], ['enviado', 'Enviado', 'tag brand'], ['aguardando', 'Aguardando', 'tag warning'], ['assinado', 'Assinado', 'tag success'], ['recusado', 'Recusado', 'tag danger'], ['expirado', 'Expirado', 'tag muted'], ['cancelado', 'Cancelado', 'tag muted']];
    await UI(p, () => { const u = window.__u; const v = document.getElementById('view'); const w = document.createElement('div'); w.id = 'tags'; for (const k of ['rascunho','enviado','aguardando','assinado','recusado','expirado','cancelado','xyz', undefined, null, 5, '__proto__', 'constructor']) { const s = u.statusTag(k); s.dataset.k = String(k); w.append(s, ' '); } v.replaceChildren(w, (() => { const x = document.createElement('div'); x.className = 'banner warn'; x.textContent = 'aviso warn'; return x; })(), (() => { const x = document.createElement('div'); x.className = 'banner danger'; x.textContent = 'aviso danger'; return x; })(), (() => { const x = document.createElement('div'); x.className = 'banner info'; x.textContent = 'aviso info'; return x; })()); });
    for (const [k, rot, cls] of ESP) {
      const r = await p.evaluate((key) => { const e = document.querySelector(`#tags [data-k="${key}"]`); return { cls: e.className, txt: e.textContent, svg: !!e.querySelector('svg[aria-hidden=true]'), paths: e.querySelectorAll('path').length }; }, k);
      check(`AC12 ${k}: "${rot}", classe "${cls}", ícone svg[aria-hidden]`, r.txt === rot && r.cls === cls && r.svg && r.paths >= 1, r);
    }
    for (const k of ['xyz', 'undefined', 'null', '5', '__proto__', 'constructor']) {
      const r = await p.evaluate((key) => { const e = document.querySelector(`#tags [data-k="${key}"]`); return { cls: e.className, txt: e.textContent, svg: !!e.querySelector('svg') }; }, k);
      check(`AC12 desconhecido (${k}): .tag.muted "Status desconhecido" sem quebrar`, r.cls === 'tag muted' && r.txt === 'Status desconhecido' && r.svg, r);
    }
    check('AC12 nenhum selo é só cor: todos têm texto e ícone', await p.evaluate(() => [...document.querySelectorAll('#tags .tag')].every((e) => e.textContent.trim().length > 0 && e.querySelector('svg'))));
    // contraste
    const items = [...ESP.map(([k]) => `#tags [data-k="${k}"]`), '.banner.warn', '.banner.danger', '.banner.info'];
    for (const sel of items) {
      const r = await p.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); let bg = cs.backgroundColor, n = e; while (/rgba\(.*, 0\)|transparent/.test(bg) && n.parentElement) { n = n.parentElement; bg = getComputedStyle(n).backgroundColor; } return { fg: cs.color, bg, own: cs.backgroundColor }; }, sel);
      const fg = rgb(r.fg).c, bg = rgb(r.bg).c; const q = ratio(fg, bg);
      check(`AC13 contraste ${sel.replace('#tags ', '')} (claro) >= 4,5: ${q.toFixed(2)}`, q >= 4.5, r);
    }
    const muted = await p.evaluate(() => { const e = document.querySelector('#tags [data-k=expirado]'); const cs = getComputedStyle(e); const surf = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(); const mu = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(); return { bg: cs.backgroundColor, color: cs.color, surf, mu, border: cs.borderTopColor }; });
    check('AC13 .tag.muted: fundo transparente (sobre --surface) e texto --muted', /rgba\(0, 0, 0, 0\)|transparent/.test(muted.bg) && muted.surf === '#ffffff' && muted.mu === '#6b605a', muted);
    // informativo: tema escuro
    await d.setTheme('dark');
    const info = [];
    for (const sel of items) {
      const r = await p.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); let bg = cs.backgroundColor, n = e; while (/rgba\(.*, 0\)|transparent/.test(bg) && n.parentElement) { n = n.parentElement; bg = getComputedStyle(n).backgroundColor; } return { fg: cs.color, bg }; }, sel);
      info.push(sel.replace('#tags [data-k=', '').replace(']', '') + '=' + ratio(rgb(r.fg).c, rgb(r.bg).c).toFixed(2));
    }
    console.info('  info (não conta): contraste no tema escuro forçado -> ' + info.join(' '));
    await d.setTheme('light');
    await p.screenshot({ path: (process.env.SHOTS || '/tmp/sign-shots-shell') + '/selos-390.png' });
    await p.setViewportSize({ width: 1280, height: 600 });
  });
  done();
})();
