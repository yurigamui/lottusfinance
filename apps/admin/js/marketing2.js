/* Lottus Admin — Marketing: resultados por canal e calendário de conteúdo */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can } = B.ui;
  const CH = { email: 'E-mail', instagram: 'Instagram', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', anuncio: 'Anúncios', evento: 'Eventos', blog: 'Blog / site', outro: 'Outros' };
  const KIND = { post: 'Post', carrossel: 'Carrossel', reels: 'Reels', story: 'Story', artigo: 'Artigo', email: 'E-mail', evento: 'Evento', video: 'Vídeo', outro: 'Outro' };
  const ST = { ideia: ['Ideia', ''], producao: ['Em produção', 'warning'], aprovado: ['Aprovado', 'brand'], publicado: ['Publicado', 'success'] };
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');
  const pct = (a, b) => (Number(b) ? ((Number(a) / Number(b)) * 100).toFixed(1).replace('.', ',') + '%' : '—');
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(Array.isArray(l) ? l[0] : l)}</option>`).join('');

  /* ------------------------------------------------------------- resultados */
  B.views.resultados = async (el, [per]) => {
    const PER = [['mes', 'Este mês'], ['30', '30 dias'], ['90', '90 dias'], ['ano', 'Este ano']];
    const p = PER.some(([k]) => k === per) ? per : 'mes';
    const to = B.today();
    const from = p === 'mes' ? B.monthStart(to) : p === 'ano' ? `${to.slice(0, 4)}-01-01` : B.addDays(to, -Number(p));
    const [r, integ] = await Promise.all([rpc('bo_mkt_results', { p_from: from, p_to: to }), rpc('bo_integrations').catch(() => ({ social: {} }))]);
    const rows = r.channels.filter((c) => Number(c.reach) || Number(c.leads) || Number(c.spend) || Number(c.customers));
    const T = r.channels.reduce((t, c) => ({ reach: t.reach + Number(c.reach), clicks: t.clicks + Number(c.clicks), leads: t.leads + Number(c.leads), customers: t.customers + Number(c.customers), spend: t.spend + Number(c.spend) }), { reach: 0, clicks: 0, leads: 0, customers: 0, spend: 0 });
    const soc = integ.social || {};
    const followers = (prov) => { const s = r.social.filter((x) => x.provider === prov && x.followers != null); return s.length ? s.at(-1).followers : null; };
    el.innerHTML = `
      ${head('Resultados', 'Quantas pessoas a Lottus alcançou, por qual canal, e quanto isso virou lead e cliente.', tabs(PER, p))}
      <div class="kpi4">
        <div class="tile main"><span class="kpi-label">Alcance</span><span class="tile-value">${n(T.reach)}</span><span class="small muted">${n(T.clicks)} cliques · ${pct(T.clicks, T.reach)}</span></div>
        <div class="tile"><span class="kpi-label">Leads gerados</span><span class="tile-value">${n(T.leads)}</span><span class="small muted">${T.spend && T.leads ? brl(T.spend / T.leads) + ' por lead' : 'custo por lead aparece com gasto lançado'}</span></div>
        <div class="tile"><span class="kpi-label">Clientes gerados</span><span class="tile-value">${n(T.customers)}</span><span class="small muted">${T.spend && T.customers ? 'CAC ' + brl(T.spend / T.customers) : 'leads de campanha que viraram cliente'}</span></div>
        <div class="tile"><span class="kpi-label">Investido</span><span class="tile-value">${brl(T.spend)}</span><span class="small muted">lançado nas campanhas</span></div>
      </div>
      <div class="card flush dash-row"><div class="card-head" style="padding:16px 20px 0"><h2>Por canal</h2></div>${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Canal</th><th class="num">Alcance</th><th class="num">Cliques</th><th class="num">Leads</th><th class="num">Clientes</th><th class="num">Gasto</th><th class="num">Custo por lead</th></tr></thead>
        <tbody>${rows.map((c) => `<tr><td><b>${esc(CH[c.channel] || c.channel)}</b></td><td class="num">${n(c.reach)}</td><td class="num">${n(c.clicks)}</td><td class="num">${n(c.leads)}</td><td class="num">${n(c.customers)}</td><td class="num">${brl(c.spend)}</td><td class="num">${Number(c.leads) && Number(c.spend) ? brl(c.spend / c.leads) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Sem resultados no período. Conecte o Instagram e o LinkedIn em Configurações › Integrações ou lance resultados nas campanhas.')}</div>
      <div class="grid-2 dash-row">
        <div class="card"><div class="card-head"><h2>Redes sociais</h2><a class="small" href="#/integracoes">integrações</a></div>
          ${['instagram', 'linkedin'].map((k) => { const s = soc[k]; return `<div class="list-row"><div class="grow"><b>${CH[k]}</b> ${s && s.account_name ? `<span class="small muted">${esc(s.account_name)}</span>` : ''}<div class="small muted">${s ? (s.status === 'connected' ? 'conectado' + (s.last_sync_at ? ' · atualizado ' + B.ago(s.last_sync_at) : '') : s.status === 'error' ? 'erro: ' + esc(s.last_error || '') : s.status === 'off' ? 'desligado' : 'conectando') : 'não conectado'}</div></div>${followers(k) != null ? `<b>${n(followers(k))}</b><span class="small muted">seguidores</span>` : ''}</div>`; }).join('')}
          <div id="socch" style="margin-top:12px"></div></div>
        <div class="card"><h2>E-mails de campanha</h2>
          <div class="conc">${[['Enviados', r.emails.sent], ['Entregues', r.emails.delivered], ['Abertos', r.emails.opened], ['Clicaram', r.emails.clicked]].map(([l, v]) => `<div class="conc-row"><span class="conc-name">${l}</span><span class="conc-val">${n(v)} <span class="muted">· ${pct(v, r.emails.sent)}</span></span><div class="meter"><span style="width:${Number(r.emails.sent) ? Math.max(2, (v / r.emails.sent) * 100).toFixed(1) : 0}%"></span></div></div>`).join('')}</div>
          ${r.top_links.length ? `<h3 style="margin:16px 0 6px">Links mais clicados</h3>${r.top_links.map((x) => `<div class="list-row small"><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.url)}</span><b>${n(x.clicks)}</b></div>`).join('')}` : ''}</div>
      </div>
      <div class="card"><h2>De onde vieram os leads</h2>${r.sources.length ? `<div class="conc">${r.sources.map((s) => `<div class="conc-row"><span class="conc-name">${esc(s.source)}</span><span class="conc-val">${n(s.leads)} lead(s) <span class="muted">· ${n(s.customers)} cliente(s)</span></span><div class="meter"><span style="width:${Math.max(3, (s.leads / Math.max(...r.sources.map((x) => x.leads))) * 100).toFixed(1)}%"></span></div></div>`).join('')}</div>` : empty('Nenhum lead no período.')}</div>`;
    onTabs(el.querySelector('.page-head'), (k) => (location.hash = `#/resultados/${k}`));
    const days = [...new Set(r.social.map((x) => x.day))].sort().slice(-28);
    if (days.length && B.columnChart) B.columnChart(el.querySelector('#socch'), days.map((d) => ({ label: d.slice(8, 10), long: date(d), value: r.social.filter((x) => x.day === d).reduce((t, x) => t + Number(x.reach), 0) })), { name: 'Alcance por dia (redes)', format: n, height: 160 });
  };

  /* ------------------------------------------------------------- calendário */
  B.views.calendario = async (el, [arg], me) => {
    const tIso = B.today();
    let ym = /^\d{4}-\d{2}$/.test(arg || '') && Number(arg.slice(5)) >= 1 && Number(arg.slice(5)) <= 12 ? arg : tIso.slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const [data, camps] = await Promise.all([rpc('bo_mkt_content', { p_month: `${ym}-01` }), rpc('bo_mkt_campaigns').catch(() => [])]);
    const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`, next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const byDay = (d) => data.rows.filter((c) => c.publish_on === `${ym}-${String(d).padStart(2, '0')}`);
    const chip = (c) => `<button class="cal-chip ch-${esc(c.channel)} st-${esc(c.status)}" data-id="${esc(c.id)}" title="${esc(CH[c.channel])} · ${esc(ST[c.status][0])}">${esc(c.title)}</button>`;
    const label = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const cnt = (s) => data.rows.filter((c) => c.status === s && c.publish_on).length;
    el.innerHTML = `
      ${head('Calendário de conteúdo', 'Cada post, e-mail e evento planejado, por canal e responsável.', '<button class="btn" id="new">Nova peça</button>')}
      <div class="row u-mb16" style="gap:12px;justify-content:space-between;flex-wrap:wrap">
        <div class="row" style="gap:8px"><a class="btn secondary sm" href="#/calendario/${prev}" aria-label="Mês anterior">‹</a><b style="text-transform:capitalize;min-width:150px;text-align:center">${esc(label)}</b><a class="btn secondary sm" href="#/calendario/${next}" aria-label="Próximo mês">›</a></div>
        <div class="row small" style="gap:12px">${Object.entries(ST).map(([k, [l, c]]) => `<span><span class="tag ${c}">${l}</span> ${cnt(k)}</span>`).join('')}</div></div>
      <div class="card flush"><div class="cal"><div class="cal-head">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => `<div>${d}</div>`).join('')}</div>
        <div class="cal-grid">${Array.from({ length: lead }, () => '<div class="cal-day off"></div>').join('')}${Array.from({ length: daysIn }, (_, i) => {
          const d = i + 1, isToday = `${ym}-${String(d).padStart(2, '0')}` === tIso;
          return `<div class="cal-day ${isToday ? 'today' : ''}" data-day="${ym}-${String(d).padStart(2, '0')}"><span class="cal-n">${d}</span>${byDay(d).map(chip).join('')}</div>`;
        }).join('')}</div></div></div>
      ${data.rows.some((c) => !c.publish_on) ? `<div class="card" style="margin-top:16px"><h2>Sem data (banco de ideias)</h2><div class="row" style="gap:6px;flex-wrap:wrap">${data.rows.filter((c) => !c.publish_on).map(chip).join('')}</div></div>` : ''}`;
    el.querySelectorAll('.cal-chip').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); edit(data.rows.find((c) => c.id === b.dataset.id)); }));
    el.querySelectorAll('.cal-day[data-day]').forEach((d) => (d.ondblclick = () => edit({ publish_on: d.dataset.day })));
    el.querySelector('#new').onclick = () => edit(null);
    if (arg === 'new') edit(null);

    function edit(c) {
      const v = Object.assign({ channel: 'instagram', kind: 'post', status: 'ideia' }, c || {});
      const box = modal({ title: v.id ? 'Editar peça' : 'Nova peça', body: `<div class="stack">
        <div class="field"><label>Título</label><input class="input" id="p-t" value="${esc(v.title || '')}" placeholder="Ex.: Carrossel: como funciona a antecipação"></div>
        <div class="grid-3"><div class="field"><label>Canal</label><select class="input" id="p-ch">${opts(CH, v.channel)}</select></div>
          <div class="field"><label>Formato</label><select class="input" id="p-k">${opts(KIND, v.kind)}</select></div>
          <div class="field"><label>Situação</label><select class="input" id="p-s">${opts(ST, v.status)}</select></div></div>
        <div class="grid-3"><div class="field"><label>Publicar em</label><input class="input" type="date" id="p-d" value="${esc(v.publish_on || '')}"></div>
          <div class="field"><label>Responsável</label><input class="input" id="p-o" value="${esc(v.owner_name || '')}"></div>
          <div class="field"><label>Campanha</label><select class="input" id="p-c"><option value="">Nenhuma</option>${camps.map((k) => `<option value="${esc(k.id)}" ${k.id === v.campaign_id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></div></div>
        <div class="field"><label>Link (rascunho ou publicado)</label><input class="input" id="p-l" type="url" value="${esc(v.link || '')}" placeholder="https://"></div>
        <div class="field"><label>Roteiro / legenda</label><textarea class="input" id="p-n" rows="4">${esc(v.notes || '')}</textarea></div><div class="error-box" id="p-err" hidden></div></div>`,
        foot: `${v.id ? '<button class="btn danger" id="p-del">Excluir</button><span class="grow"></span>' : ''}<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="p-ok">Salvar</button>` });
      const g = (s) => box.querySelector(s).value;
      box.querySelector('[data-close]').onclick = closeModal;
      const del = box.querySelector('#p-del');
      if (del) del.onclick = async () => { if ((await confirmAction({ title: 'Excluir peça', text: 'A peça sai do calendário.', confirmLabel: 'Excluir', danger: true })) == null) return; run(del, () => rpc('bo_mkt_content_delete', { p_id: v.id }), 'Peça excluída').then(() => { closeModal(); B.reload(); }).catch(() => {}); };
      box.querySelector('#p-ok').onclick = async (e) => {
        if (!g('#p-t').trim()) { const er = box.querySelector('#p-err'); er.hidden = false; er.textContent = 'Dê um título à peça.'; return; }
        try { await run(e.target, () => rpc('bo_mkt_content_save', { p: { id: v.id, title: g('#p-t'), channel: g('#p-ch'), kind: g('#p-k'), status: g('#p-s'), publish_on: g('#p-d'), owner_name: g('#p-o'), campaign_id: g('#p-c'), link: g('#p-l'), notes: g('#p-n') } }), 'Peça salva'); closeModal(); B.reload(); } catch { /* aviso mostrado */ }
      };
    }
  };
})();
