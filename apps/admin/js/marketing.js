/* Lottus Admin — marketing: campanhas, contatos (com importação e descadastro) e resultados */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, toast, run, modal, closeModal, confirmAction } = B;
  const { head, empty, can } = B.ui;

  const CHANNEL = { email: 'E-mail', instagram: 'Instagram', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', anuncio: 'Anúncio pago', evento: 'Evento', outro: 'Outro' };
  const STATUS = { rascunho: ['Rascunho', ''], em_andamento: ['No ar', 'success'], pausada: ['Pausada', 'warning'], concluida: ['Concluída', 'brand'] };
  const today = () => B.today();
  const int = (v) => Math.max(0, Math.round(Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0));
  const dec = (v) => Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');
  const tagList = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(Array.isArray(l) ? l[0] : l)}</option>`).join('');

  /* -------------------------------------------------------------- campanhas */
  B.views.campanhas = async (el, [arg], me) => {
    const mayWrite = can(me, 'approver');
    const list = await rpc('bo_mkt_campaigns');
    const tot = list.reduce((t, c) => ({ reach: t.reach + Number(c.reach), clicks: t.clicks + Number(c.clicks), leads: t.leads + Number(c.leads), spend: t.spend + Number(c.spend) }), { reach: 0, clicks: 0, leads: 0, spend: 0 });
    el.innerHTML = `
      ${head('Campanhas', 'Planeje, envie e acompanhe o que a Lottus faz para ser encontrada: e-mail, redes sociais, anúncios e eventos.', mayWrite ? '<button class="btn" id="new">Nova campanha</button>' : '')}
      <div class="kpi4">
        <div class="tile main"><span class="kpi-label">Alcance total</span><span class="tile-value">${n(tot.reach)}</span><span class="small muted">pessoas e e-mails atingidos</span></div>
        <div class="tile"><span class="kpi-label">Cliques</span><span class="tile-value">${n(tot.clicks)}</span><span class="small muted">${tot.reach ? ((tot.clicks / tot.reach) * 100).toFixed(1).replace('.', ',') + '% do alcance' : 'sem dados'}</span></div>
        <div class="tile"><span class="kpi-label">Leads gerados</span><span class="tile-value">${n(tot.leads)}</span><span class="small muted">${tot.leads && tot.spend ? 'custo por lead ' + brl(tot.spend / tot.leads) : 'lançados nas campanhas'}</span></div>
        <div class="tile"><span class="kpi-label">Investido</span><span class="tile-value">${brl(tot.spend)}</span><span class="small muted">${list.length} campanha${list.length === 1 ? '' : 's'}</span></div>
      </div>
      ${list.length ? `<div class="camp-grid">${list.map((c) => {
        const [sl, st] = STATUS[c.status] || [c.status, ''];
        return `<button class="card camp" data-id="${esc(c.id)}">
          <div class="row between"><span class="tag">${esc(CHANNEL[c.channel] || c.channel)}</span><span class="tag ${st}">${esc(sl)}</span></div>
          <h3>${esc(c.name)}</h3>
          <div class="small muted">${c.starts_on ? date(c.starts_on) : 'sem data'}${c.ends_on ? ' a ' + date(c.ends_on) : ''}${Number(c.budget) ? ' · orçamento ' + brl(c.budget) : ''}</div>
          <div class="camp-nums"><div><b>${n(c.reach)}</b><span>alcance</span></div><div><b>${n(c.clicks)}</b><span>cliques</span></div><div><b>${n(c.leads)}</b><span>leads</span></div><div><b>${brl(c.spend)}</b><span>gasto</span></div></div>
          ${c.scheduled_at && !c.sent_at ? `<div class="small"><span class="tag warning">Envio agendado</span> ${dateTime(c.scheduled_at)}</div>` : ''}
          ${c.channel === 'email' && c.sent_count ? `<div class="small muted">${n(c.sent_count)} enviados · ${n(c.delivered)} entregues · ${n(c.opened)} abertos${Number(c.failed) ? ' · ' + n(c.failed) + ' com problema' : ''}</div>` : ''}
        </button>`;
      }).join('')}</div>` : `<div class="card">${empty('Nenhuma campanha ainda. Crie a primeira para começar a medir o alcance.')}</div>`}`;
    if (mayWrite) { el.querySelector('#new').onclick = () => openCampaign(null); if (arg === 'new') openCampaign(null); }
    el.querySelectorAll('.camp').forEach((b) => (b.onclick = () => openCampaign(list.find((c) => c.id === b.dataset.id))));

    async function openCampaign(c) {
      const v = c || { channel: 'email', status: 'rascunho', audience_tags: [], budget: 0 };
      const metrics = c ? await rpc('bo_mkt_metrics', { p_id: c.id }).catch(() => []) : [];
      const box = modal({ title: c ? c.name : 'Nova campanha', wide: true,
        body: `<div class="stack">
          <div class="grid-2"><div class="field"><label>Nome</label><input class="input" id="c-name" value="${esc(v.name || '')}" placeholder="Ex.: Lançamento do Lottus Sign"></div>
            <div class="field"><label>Canal</label><select class="input" id="c-ch">${opts(CHANNEL, v.channel)}</select></div></div>
          <div class="grid-2"><div class="field"><label>Objetivo</label><input class="input" id="c-obj" value="${esc(v.objective || '')}" placeholder="Ex.: 30 novos leads de gestoras"></div>
            <div class="field"><label>Situação</label><select class="input" id="c-st">${opts(STATUS, v.status)}</select></div></div>
          <div class="grid-3"><div class="field"><label>Início</label><input class="input" id="c-s" type="date" value="${esc(v.starts_on || '')}"></div>
            <div class="field"><label>Fim</label><input class="input" id="c-e" type="date" value="${esc(v.ends_on || '')}"></div>
            <div class="field"><label>Orçamento (R$)</label><input class="input" id="c-b" inputmode="decimal" value="${v.budget ? String(v.budget).replace('.', ',') : ''}"></div></div>
          <div class="grid-2"><div class="field"><label>Código da campanha (link rastreável)</label><input class="input" id="c-utm" value="${esc(v.utm_code || '')}" placeholder="ex.: lancamento-sign"><div class="help" id="c-link"></div></div>
            <div class="field" id="sched-box"><label>Agendar envio (e-mail)</label><input class="input" type="datetime-local" id="c-when" value="${v.scheduled_at ? new Date(new Date(v.scheduled_at).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''}" ${can(me, 'admin') ? '' : 'disabled'}><div class="help">${v.sent_at ? 'Já enviada em ' + dateTime(v.sent_at) + '.' : 'Em branco: envio manual.'}</div></div></div>
          <div id="mail-box">
            <div class="field"><label>Público (etiquetas dos contatos, separadas por vírgula)</label><input class="input" id="c-tags" value="${esc((v.audience_tags || []).join(', '))}" placeholder="Em branco: todos os contatos ativos"></div>
            <div class="field"><label>Assunto</label><input class="input" id="c-sub" value="${esc(v.subject || '')}"></div>
            <div class="field"><label>Mensagem</label><textarea class="input" id="c-body" rows="7" placeholder="Use {{nome}} para o primeiro nome do contato.">${esc(v.body || '')}</textarea>
              <div class="help">O link para deixar de receber é adicionado automaticamente ao final.</div></div>
          </div>
          <div class="field"><label>Observações</label><textarea class="input" id="c-n" rows="2">${esc(v.notes || '')}</textarea></div>
          ${c ? `<div><h3 style="margin:8px 0">Resultados por dia</h3>
            <div class="table-wrap"><table class="mini"><thead><tr><th>Dia</th><th class="num">Alcance</th><th class="num">Impressões</th><th class="num">Cliques</th><th class="num">Leads</th><th class="num">Gasto</th><th></th></tr></thead><tbody>
              <tr class="addrow"><td><input class="input" id="m-d" type="date" value="${today()}"></td><td><input class="input" id="m-r" inputmode="numeric"></td><td><input class="input" id="m-i" inputmode="numeric"></td><td><input class="input" id="m-c" inputmode="numeric"></td><td><input class="input" id="m-l" inputmode="numeric"></td><td><input class="input" id="m-s" inputmode="decimal"></td><td><button class="btn sm" id="m-add">Lançar</button></td></tr>
              ${metrics.map((m) => `<tr><td>${date(m.day)}</td><td class="num">${n(m.reach)}</td><td class="num">${n(m.impressions)}</td><td class="num">${n(m.clicks)}</td><td class="num">${n(m.leads)}</td><td class="num">${brl(m.spend)}</td><td class="num"><button class="btn ghost sm" data-md="${m.id}" aria-label="Apagar">✕</button></td></tr>`).join('')}
            </tbody></table></div></div>` : ''}
          <div class="error-box" id="c-err" hidden></div></div>`,
        foot: `${c && mayWrite ? '<button class="btn danger" id="c-del">Excluir</button>' : ''}<span class="grow"></span>${c && v.channel === 'email' && can(me, 'admin') ? '<button class="btn secondary" id="c-test">Enviar teste</button><button class="btn secondary" id="c-send">Enviar para o público</button>' : ''}${mayWrite ? '<button class="btn" id="c-save">Salvar</button>' : ''}` });
      const g = (s) => box.querySelector(s).value;
      const syncMail = () => { box.querySelector('#mail-box').hidden = g('#c-ch') !== 'email'; box.querySelector('#sched-box').hidden = g('#c-ch') !== 'email'; };
      const linkHelp = () => { const code = g('#c-utm').trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''); box.querySelector('#c-link').innerHTML = code ? `Use este link: <code>https://lottusfinance.com.br/?utm_source=${esc(g('#c-ch'))}&amp;utm_campaign=${esc(code)}</code>. Quem preencher o formulário do site vira lead desta campanha.` : 'Gere um link para medir quem chega ao site por esta campanha.'; };
      box.querySelector('#c-utm').oninput = linkHelp; linkHelp();
      box.querySelector('#c-ch').onchange = syncMail; syncMail();
      const payload = () => ({ id: c && c.id, name: g('#c-name'), channel: g('#c-ch'), objective: g('#c-obj'), status: g('#c-st'), starts_on: g('#c-s'), ends_on: g('#c-e'), budget: dec(g('#c-b')),
        audience_tags: tagList(g('#c-tags')), subject: g('#c-sub'), body: g('#c-body'), notes: g('#c-n') });
      const save = async (btn) => run(btn, async () => {
        const id = await rpc('bo_mkt_campaign_save', { p: payload() });
        const when = g('#c-when');
        await rpc('bo_mkt_campaign_extra', { p_id: id, p: Object.assign({ utm_code: g('#c-utm') }, can(me, 'admin') && g('#c-ch') === 'email' ? { scheduled_at: when ? new Date(when).toISOString() : '' } : {}) });
        return id;
      });
      const sv = box.querySelector('#c-save');
      if (sv) sv.onclick = async () => { const err = box.querySelector('#c-err'); if (!g('#c-name').trim()) { err.hidden = false; err.textContent = 'Dê um nome à campanha.'; return; } try { await save(sv); toast('Campanha salva'); closeModal(); B.reload(); } catch { /* aviso mostrado */ } };
      const del = box.querySelector('#c-del');
      if (del) del.onclick = async () => { if ((await confirmAction({ title: 'Excluir campanha', text: 'A campanha e os resultados lançados serão apagados.', confirmLabel: 'Excluir', danger: true })) == null) return; run(del, () => rpc('bo_mkt_campaign_delete', { p_id: c.id }), 'Campanha excluída').then(() => { closeModal(); B.reload(); }).catch(() => {}); };
      const test = box.querySelector('#c-test');
      if (test) test.onclick = async () => {
        const r = await confirmAction({ title: 'Enviar teste', text: 'Envia a mensagem salva para um e-mail seu. Salve antes se mudou o texto.', confirmLabel: 'Enviar', note: true, noteLabel: 'E-mail do teste', noteRequired: true });
        if (r) run(test, () => rpc('bo_mkt_send', { p_id: c.id, p_test_to: r }), 'Teste enviado').catch(() => {});
      };
      const send = box.querySelector('#c-send');
      if (send) send.onclick = async () => {
        const total = (await rpc('bo_mkt_contacts', { p_search: null, p_tag: null, p_status: 'active' })).counts.active;
        if ((await confirmAction({ title: 'Enviar campanha', text: `Envia agora para os contatos ativos${(c.audience_tags || []).length ? ' com as etiquetas ' + esc(c.audience_tags.join(', ')) : ' (' + total + ' no total)'}. Isso não pode ser desfeito. A mensagem usada é a última salva.`, confirmLabel: 'Enviar agora' })) == null) return;
        run(send, () => rpc('bo_mkt_send', { p_id: c.id, p_test_to: null })).then((r) => { toast(`${r.sent} e-mails na fila de envio`); closeModal(); B.reload(); }).catch(() => {});
      };
      const add = box.querySelector('#m-add');
      if (add) add.onclick = () => run(add, () => rpc('bo_mkt_metric_save', { p: { campaign_id: c.id, day: g('#m-d'), reach: int(g('#m-r')), impressions: int(g('#m-i')), clicks: int(g('#m-c')), leads: int(g('#m-l')), spend: dec(g('#m-s')) } }), 'Resultado lançado').then(() => { closeModal(); B.reload(); }).catch(() => {});
      box.querySelectorAll('[data-md]').forEach((b) => (b.onclick = () => run(b, () => rpc('bo_mkt_metric_delete', { p_id: Number(b.dataset.md) }), 'Removido').then(() => { closeModal(); B.reload(); }).catch(() => {})));
    }
  };

  /* --------------------------------------------------------------- contatos */
  function parseCsv(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows[0] ? rows[0].map((h) => h.trim().toLowerCase()) : [];
    const hasHead = head.some((h) => /mail/.test(h));
    const idx = (re, d) => { const k = head.findIndex((h) => re.test(h)); return hasHead ? k : d; };
    const cols = { name: idx(/nome|name/, 0), email: idx(/mail/, 1), phone: idx(/tel|cel|fone|phone/, 2), company: idx(/empresa|company|raz/, 3), role: idx(/cargo|role/, 4) };
    return rows.slice(hasHead ? 1 : 0).filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, i >= 0 ? (r[i] || '').trim() : ''])));
  }

  B.views.contatos = async (el, [arg], me) => {
    const mayWrite = can(me, 'approver');
    let fq = '', ftag = '', fst = '';
    el.innerHTML = `
      ${head('Contatos', 'A base de pessoas e empresas que a Lottus pode alcançar. Quem pede para sair é descadastrado e nunca mais recebe e-mail de campanha.',
        mayWrite ? '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn secondary" id="crm">Trazer do CRM</button><button class="btn secondary" id="imp">Importar CSV</button><button class="btn" id="new">Novo contato</button></div>' : '')}
      <div class="kpi4" id="sum"></div>
      <div class="row u-mb16" style="gap:8px;flex-wrap:wrap"><input class="input search" id="q" type="search" placeholder="Buscar nome, e-mail ou empresa" aria-label="Buscar contato">
        <select class="input" id="tg" style="width:auto"><option value="">Todas as etiquetas</option></select>
        <select class="input" id="st" style="width:auto"><option value="">Todas as situações</option><option value="active">Ativos</option><option value="unsubscribed">Descadastrados</option><option value="bounced">E-mail inválido</option></select></div>
      <div class="card flush"><div class="table-wrap" id="list"><div class="spinner"></div></div></div>`;
    let data;
    const load = async () => {
      data = await rpc('bo_mkt_contacts', { p_search: fq || null, p_tag: ftag || null, p_status: fst || null });
      const c = data.counts;
      el.querySelector('#sum').innerHTML = [['Total', c.total, 'main'], ['Ativos', c.active, ''], ['Descadastrados', c.unsubscribed, ''], ['E-mail inválido', c.bounced, '']]
        .map(([l, v, k]) => `<div class="tile ${k}"><span class="kpi-label">${l}</span><span class="tile-value">${n(v)}</span></div>`).join('');
      const tg = el.querySelector('#tg'); tg.innerHTML = '<option value="">Todas as etiquetas</option>' + data.tags.map((t) => `<option ${t === ftag ? 'selected' : ''}>${esc(t)}</option>`).join('');
      el.querySelector('#list').innerHTML = !data.rows.length ? empty(c.total ? 'Nenhum contato com esses filtros.' : 'Sem contatos ainda. Importe um CSV ou traga os leads do CRM.') : `<table>
        <thead><tr><th>Contato</th><th>Empresa</th><th>Etiquetas</th><th>Origem</th><th>Situação</th></tr></thead>
        <tbody>${data.rows.map((r) => `<tr class="link" data-id="${esc(r.id)}"><td><b>${esc(r.name || '—')}</b><div class="small muted">${esc(r.email || '')}${r.phone ? ' · ' + esc(r.phone) : ''}</div></td><td>${esc(r.company || '—')}<div class="small muted">${esc(r.role || '')}</div></td>
          <td>${(r.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</td><td class="small muted">${esc(r.source || '')}<br>${date(r.created_at)}</td>
          <td>${r.status === 'active' ? '<span class="tag success">Ativo</span>' : r.status === 'unsubscribed' ? '<span class="tag warning">Descadastrado</span>' : '<span class="tag danger">Inválido</span>'}</td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('#list tr[data-id]').forEach((r) => (r.onclick = () => edit(data.rows.find((x) => x.id === r.dataset.id))));
    };
    await load();
    let t; el.querySelector('#q').oninput = (e) => { fq = e.target.value.trim(); clearTimeout(t); t = setTimeout(load, 250); };
    el.querySelector('#tg').onchange = (e) => { ftag = e.target.value; load(); };
    el.querySelector('#st').onchange = (e) => { fst = e.target.value; load(); };
    if (!mayWrite) return;
    el.querySelector('#new').onclick = () => edit(null);
    if (arg === 'new') edit(null);
    el.querySelector('#crm').onclick = async (e) => { const r = await run(e.target, () => rpc('bo_mkt_contacts_from_crm')).catch(() => null); if (r) { toast(`${r.new} contato${r.new === 1 ? '' : 's'} novo${r.new === 1 ? '' : 's'} do CRM`); load(); } };
    el.querySelector('#imp').onclick = () => {
      const box = modal({ title: 'Importar contatos', subtitle: 'CSV com colunas nome, e-mail, telefone, empresa e cargo (a primeira linha pode ser o cabeçalho).',
        body: `<div class="stack"><div class="field"><label>Arquivo CSV</label><input class="input" type="file" id="i-f" accept=".csv,text/csv,text/plain"></div>
          <div class="field"><label>Ou cole aqui</label><textarea class="input" id="i-t" rows="5" placeholder="nome;email&#10;Ana Souza;ana@empresa.com"></textarea></div>
          <div class="field"><label>Etiquetas para todos (separadas por vírgula)</label><input class="input" id="i-tags" placeholder="Ex.: gestoras, evento-2026"></div>
          <div class="help">Quem já está na base só ganha as etiquetas. Contatos descadastrados continuam descadastrados.</div><div class="error-box" id="i-err" hidden></div></div>`,
        foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="i-go">Importar</button>' });
      box.querySelector('[data-close]').onclick = closeModal;
      box.querySelector('#i-f').onchange = async (e) => { const f = e.target.files[0]; if (f) box.querySelector('#i-t').value = await f.text(); };
      box.querySelector('#i-go').onclick = (e) => {
        const rows = parseCsv(box.querySelector('#i-t').value.replace(/^﻿/, ''));
        if (!rows.length) { const er = box.querySelector('#i-err'); er.hidden = false; er.textContent = 'Nenhum contato encontrado. Cole ou escolha um CSV.'; return; }
        run(e.target, () => rpc('bo_mkt_contacts_import', { p_rows: rows, p_tags: tagList(box.querySelector('#i-tags').value), p_source: 'importação' })).then((r) => { toast(`${r.new} novos, ${r.updated} já existiam, ${r.invalid} inválidos`); closeModal(); load(); }).catch(() => {});
      };
    };
    function edit(r) {
      const v = r || { tags: [] };
      const box = modal({ title: r ? (r.name || r.email) : 'Novo contato',
        body: `<div class="stack"><div class="grid-2"><div class="field"><label>Nome</label><input class="input" id="e-n" value="${esc(v.name || '')}"></div><div class="field"><label>E-mail</label><input class="input" id="e-m" type="email" value="${esc(v.email || '')}"></div></div>
          <div class="grid-2"><div class="field"><label>Telefone</label><input class="input" id="e-p" value="${esc(v.phone || '')}"></div><div class="field"><label>Empresa</label><input class="input" id="e-c" value="${esc(v.company || '')}"></div></div>
          <div class="grid-2"><div class="field"><label>Cargo</label><input class="input" id="e-r" value="${esc(v.role || '')}"></div><div class="field"><label>Etiquetas</label><input class="input" id="e-t" value="${esc((v.tags || []).join(', '))}"></div></div>
          <div class="field"><label>Observações</label><textarea class="input" id="e-o" rows="2">${esc(v.notes || '')}</textarea></div><div class="error-box" id="e-err" hidden></div></div>`,
        foot: `${r ? '<button class="btn danger" id="e-del">Excluir</button>' : ''}<span class="grow"></span><button class="btn" id="e-ok">Salvar</button>` });
      const g = (s) => box.querySelector(s).value;
      box.querySelector('#e-ok').onclick = async (e) => {
        try { await run(e.target, () => rpc('bo_mkt_contact_save', { p: { id: r && r.id, name: g('#e-n'), email: g('#e-m'), phone: g('#e-p'), company: g('#e-c'), role: g('#e-r'), tags: tagList(g('#e-t')), notes: g('#e-o') } }), 'Contato salvo'); closeModal(); load(); } catch { /* aviso mostrado */ }
      };
      const d = box.querySelector('#e-del');
      if (d) d.onclick = async () => { if ((await confirmAction({ title: 'Excluir contato', text: 'Se ele já pediu para sair, prefira manter o registro: excluir apaga a lista de bloqueio.', confirmLabel: 'Excluir', danger: true })) == null) return; run(d, () => rpc('bo_mkt_contact_delete', { p_id: r.id }), 'Contato excluído').then(() => { closeModal(); load(); }).catch(() => {}); };
    }
  };
})();
