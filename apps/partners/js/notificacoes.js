/* Lottus Partners — Configurações › Notificações: Rotinas (avisos agendados) e Modelos (e-mails e relatórios) */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, toast, run, modal, closeModal, confirmAction } = B;
  const { empty } = B.ui;

    const AUD = { cedente: 'Cedentes', sacado: 'Sacados', investidor: 'Investidores', originador: 'Parceiros', usuario: 'Usuários do fundo' };
  const AUD_HELP = { cedente: 'Cada cedente recebe só as parcelas das suas operações.', sacado: 'Cada sacado recebe só as parcelas dele.', investidor: 'Recebem o resumo geral da carteira.', originador: 'Recebem o resumo geral da carteira.', usuario: 'A equipe recebe a lista completa do fundo.' };
  const CONTENT = { vencimentos_semana: 'Vencimentos da semana', vencidos: 'Parcelas vencidas em aberto', resumo_carteira: 'Resumo da carteira' };
  const contentsFor = (aud) => (aud === 'investidor' || aud === 'originador' ? ['resumo_carteira'] : Object.keys(CONTENT));
  const FREQ = { daily: 'Todos os dias', weekly: 'Toda semana', monthly: 'Todo mês' };
  const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const hh = (h) => `${String(h).padStart(2, '0')}h`;
  const when = (r) => `${r.frequency === 'daily' ? 'Todos os dias' : r.frequency === 'weekly' ? `Toda ${DAYS[r.weekday]}` : `Todo dia ${r.month_day}`} às ${hh(r.send_hour)}`;
  const VARS = [['{{nome}}', 'Nome do destinatário'], ['{{fundo}}', 'Nome do fundo'], ['{{periodo}}', 'Período'], ['{{lista}}', 'Lista de parcelas'], ['{{qtd}}', 'Quantidade'], ['{{total}}', 'Valor total']];
  const SAMPLE = { '{{nome}}': 'Empresa Exemplo Ltda', '{{fundo}}': 'Seu Fundo', '{{periodo}}': 'de 03/11 a 10/11', '{{lista}}': '• 05/11/2026 · R$ 10.000,00 · NF 123/1\n• 07/11/2026 · R$ 4.500,00 · NF 124/1', '{{qtd}}': '2', '{{total}}': 'R$ 14.500,00' };
  const fill = (t) => VARS.reduce((s, [k]) => s.split(k).join(SAMPLE[k]), String(t || ''));
  const opts = (obj, cur) => Object.entries(obj).map(([k, l]) => `<option value="${esc(k)}" ${String(cur) === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const fail = (e) => toast(B.message(e), true);

  /* Modo de ambientação: pausa todos os e-mails da plataforma (para importar dados de outro sistema sem avisar ninguém) */
  async function pausa(box, adm) {
    const r = await rpc('partner_email_pause_get');
    box.innerHTML = `<div class="card row between" style="gap:12px;flex-wrap:wrap;align-items:center">
      <div><h2 class="u-m0">Modo de ambientação ${r.paused ? '<span class="tag warning">Ligado</span>' : ''}</h2>
        <p class="small muted" style="margin:4px 0 0;max-width:600px">Ligado, o sistema não envia nenhum e-mail (rotinas, cobranças, assinaturas, avisos). Use enquanto traz as informações de outro sistema; os envios que seriam feitos ficam registrados como “pausado”. Vale para toda a plataforma.</p></div>
      ${adm ? `<button class="btn ${r.paused ? '' : 'secondary'}" id="pz-t">${r.paused ? 'Desligar e voltar a enviar e-mails' : 'Ligar modo de ambientação'}</button>` : ''}</div>`;
    const b = box.querySelector('#pz-t');
    if (b) b.onclick = async () => {
      if (!r.paused && (await confirmAction({ title: 'Ligar modo de ambientação', text: 'Nenhum e-mail será enviado até você desligar.', confirmLabel: 'Ligar' })) == null) return;
      try { const x = await run(b, () => rpc('partner_email_pause_set', { p_on: !r.paused }), r.paused ? 'E-mails voltaram a ser enviados' : 'Modo de ambientação ligado'); if (B.emailBanner) B.emailBanner(!r.paused); pausa(box, adm).catch(fail); return x; } catch (_) { /* já avisado */ }
    };
  }
  async function pane(host, adm) {
    host.innerHTML = '<div id="pz"></div><div id="rt" class="u-mt14"></div>';
    await Promise.all([pausa(host.querySelector('#pz'), adm), routines(host.querySelector('#rt'), adm)]);
  }

  /* ---------------- Modelos ---------------- */
  const ATT = [['vencimentos_semana', 'Vencimentos da semana'], ['vencidos', 'Parcelas vencidas'], ['carteira', 'Carteira em aberto']];
  async function templates(box, adm, only) {
    const list = (await rpc('partner_notif_templates')).filter((t) => !only || t.kind === only);
    const KIND = { email: 'E-mail', relatorio: 'Relatório' };
    box.innerHTML = `<div class="card stack">
      <div class="u-g12w row between"><div><h2 class="u-m0">${only === 'relatorio' ? 'Modelos de relatórios' : 'Modelos de e-mails'}</h2><p class="u-lead small muted">Os textos usados pelas Rotinas de envio em Notificações. Use as variáveis para preencher nome, período e lista de parcelas.</p></div>
        ${adm ? '<button class="btn sm" id="newt">Novo modelo</button>' : ''}</div>
      ${list.length ? `<div class="stack-sm">${list.map((t) => `<div class="u-ac list-row"><div class="grow"><b>${esc(t.name)}</b> <span class="tag">${KIND[t.kind] || t.kind}</span><div class="small muted">${esc(t.subject || 'Sem assunto')}</div></div>
        <button class="btn ghost sm" data-ed="${esc(t.id)}">${adm ? 'Editar' : 'Ver'}</button></div>`).join('')}</div>` : empty('Nenhum modelo ainda.')}</div>`;
    const again = () => templates(box, adm, only).catch(fail);
    const nb = box.querySelector('#newt'); if (nb) nb.onclick = () => tplForm(null, adm, again, only);
    box.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => tplForm(list.find((t) => t.id === b.dataset.ed), adm, again)));
  }
  function tplForm(t, adm, done, only) {
    const d = t || { kind: only || 'email', name: '', subject: '', body: 'Olá, {{nome}}.\n' };
    const m = modal({ title: t ? 'Modelo' : 'Novo modelo', subtitle: 'O texto sai igual para todos; as variáveis mudam por destinatário.',
      body: `<form class="stack" id="tf" novalidate>
        <div class="grid-2"><div class="field"><label>Nome</label><input class="input" name="name" maxlength="80" value="${esc(d.name)}" ${adm ? '' : 'disabled'}></div>
          <div class="field" ${only ? 'hidden' : ''}><label>Tipo</label><select class="input" name="kind" ${adm ? '' : 'disabled'}><option value="email" ${d.kind === 'email' ? 'selected' : ''}>E-mail</option><option value="relatorio" ${d.kind === 'relatorio' ? 'selected' : ''}>Relatório</option></select></div></div>
        <div class="field"><label>Assunto</label><input class="input" name="subject" maxlength="200" value="${esc(d.subject)}" ${adm ? '' : 'disabled'}></div>
        <div class="field"><label>Texto</label><textarea class="input" name="body" rows="8" maxlength="6000" ${adm ? '' : 'disabled'}>${esc(d.body)}</textarea>
          ${adm ? `<div class="u-mt6 chips">${VARS.map(([k, l]) => `<button type="button" class="chip" data-var="${esc(k)}" title="${esc(l)}">${esc(k)}</button>`).join('')}</div>` : ''}</div>
        <div class="field"><label>Relatório em anexo <span class="small muted">(planilha CSV, abre no Excel)</span></label>
          <select class="input" name="attachment" ${adm ? '' : 'disabled'}><option value="">Sem anexo</option>${ATT.map(([k, l]) => `<option value="${k}" ${d.attachment === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <div class="help">O anexo já vai filtrado para quem recebe (o sacado vê só as parcelas dele, o cedente só as dele). Sem parcelas, o e-mail não é enviado.</div></div>
        <div class="note-box small"><b>Prévia</b><div id="pv" style="white-space:pre-wrap;margin-top:6px"></div></div>
        <div class="error-box" id="te" hidden></div></form>`,
      foot: `${t && adm ? '<button class="btn danger ghost" data-act="del">Excluir</button>' : ''}<button class="btn secondary" data-act="cancel">${adm ? 'Cancelar' : 'Fechar'}</button>${adm ? '<button class="btn" data-act="ok">Salvar</button>' : ''}` });
    const f = m.querySelector('#tf'), pv = m.querySelector('#pv');
    const paint = () => { pv.textContent = `${fill(f.subject.value)}\n\n${fill(f.body.value)}`; };
    f.oninput = paint; paint();
    m.querySelectorAll('[data-var]').forEach((b) => (b.onclick = () => {
      const ta = f.body, s = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + b.dataset.var + ta.value.slice(ta.selectionEnd ?? s); ta.focus(); paint();
    }));
    m.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const del = m.querySelector('[data-act=del]');
    if (del) del.onclick = async () => {
      if ((await confirmAction({ title: 'Excluir o modelo', text: 'Rotinas que usam este modelo passam a usar o texto padrão.', confirmLabel: 'Excluir' })) == null) return;
      run(del, () => rpc('partner_notif_template_delete', { p_id: t.id }), 'Modelo excluído').then(() => { closeModal(); done(); }).catch(() => null);
    };
    const ok = m.querySelector('[data-act=ok]');
    if (ok) ok.onclick = () => {
      if (!f.name.value.trim()) { const e = m.querySelector('#te'); e.hidden = false; e.textContent = 'Dê um nome ao modelo.'; return; }
      run(ok, () => rpc('partner_notif_template_save', { p: { id: t && t.id, name: f.name.value, kind: f.kind.value, subject: f.subject.value, body: f.body.value, attachment: f.attachment.value || null } }), 'Modelo salvo')
        .then(() => { closeModal(); done(); }).catch(() => null);
    };
  }

  /* ---------------- Rotinas ---------------- */
  async function routines(box, adm) {
    const [list, tpls] = await Promise.all([rpc('partner_notif_routines'), rpc('partner_notif_templates')]);
    box.innerHTML = `<div class="card stack">
      <div class="u-g12w row between"><div><h2 class="u-m0">Rotinas de envio</h2><p class="u-lead small muted">Avisos e relatórios enviados por e-mail em dia e horário fixos (horário de Brasília). Só vai e-mail para quem tem algo a ser avisado.</p></div>
        ${adm ? '<button class="btn sm" id="newr">Nova rotina</button>' : ''}</div>
      ${list.length ? `<div class="stack-sm">${list.map((r) => `<div class="list-row" style="align-items:center;gap:12px;flex-wrap:wrap"><div class="grow"><b>${esc(r.name)}</b> ${r.active ? '' : '<span class="tag">Pausada</span>'}
          <div class="small muted">${esc(AUD[r.audience])} · ${esc(CONTENT[r.content])} · ${esc(when(r))}${r.last_run_on ? ` · último envio ${esc(B.date(r.last_run_on))} (${esc(r.last_sent || 0)} e-mails)` : ''}</div></div>
          ${adm ? `<button class="btn ghost sm" data-send="${esc(r.id)}">Enviar agora</button>` : ''}<button class="btn ghost sm" data-ed="${esc(r.id)}">${adm ? 'Editar' : 'Ver'}</button></div>`).join('')}</div>`
        : empty('Nenhuma rotina criada. Exemplo: toda segunda às 8h, enviar aos sacados os vencimentos da semana.')}
      <div id="remhost"></div></div>`;
    const again = () => routines(box, adm).catch(fail);
    const nb = box.querySelector('#newr'); if (nb) nb.onclick = () => routineForm(null, tpls, adm, again);
    box.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => routineForm(list.find((r) => r.id === b.dataset.ed), tpls, adm, again)));
    box.querySelectorAll('[data-send]').forEach((b) => (b.onclick = async () => {
      const r = list.find((x) => x.id === b.dataset.send);
      if ((await confirmAction({ title: 'Enviar agora', text: `Vamos enviar agora a rotina <b>${esc(r.name)}</b> para ${esc(AUD[r.audience].toLowerCase())}. Cada pessoa recebe só se tiver algo a ser avisado.`, confirmLabel: 'Enviar' })) == null) return;
      run(b, () => rpc('partner_notif_routine_run', { p_id: r.id }), 'Rotina executada').then((x) => { toast(x.sent ? `${x.sent} e-mails enviados` : 'Ninguém tinha o que ser avisado agora.'); again(); }).catch(() => null);
    }));
    // Lembretes de parcela ao sacado (régua por dias antes/depois do vencimento)
    if (B.reminders) B.reminders(box.querySelector('#remhost'), adm, true);
  }
  function routineForm(r, tpls, adm, done) {
    const d = r || { name: '', audience: 'sacado', content: 'vencimentos_semana', frequency: 'weekly', weekday: 1, month_day: 1, send_hour: 8, template_id: '', active: true };
    const m = modal({ title: r ? 'Rotina' : 'Nova rotina', subtitle: 'Escolha quem recebe, o que vai no e-mail e quando.',
      body: `<form class="stack" id="rf" novalidate ${adm ? '' : 'disabled'}>
        <div class="field"><label>Nome</label><input class="input" name="name" maxlength="80" placeholder="Ex.: Vencimentos da semana aos sacados" value="${esc(d.name)}"></div>
        <div class="grid-2"><div class="field"><label>Para quem</label><select class="input" name="audience">${opts(AUD, d.audience)}</select><div class="help" id="ah"></div></div>
          <div class="field"><label>O que enviar</label><select class="input" name="content"></select></div></div>
        <div class="grid-2"><div class="field"><label>Quando</label><select class="input" name="frequency">${opts(FREQ, d.frequency)}</select></div>
          <div class="field" id="wd"><label>Dia da semana</label><select class="input" name="weekday">${DAYS.map((x, i) => `<option value="${i}" ${d.weekday === i ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="field" id="md"><label>Dia do mês</label><select class="input" name="month_day">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${d.month_day === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
          <div class="field"><label>Horário</label><select class="input" name="send_hour">${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${d.send_hour === i ? 'selected' : ''}>${hh(i)}</option>`).join('')}</select></div></div>
        <div class="field"><label>Modelo do e-mail</label><select class="input" name="template_id"><option value="">Padrão do sistema</option>${tpls.map((t) => `<option value="${esc(t.id)}" ${d.template_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          <div class="help">Edite os textos na aba Modelos.</div></div>
        <label class="switch-row"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span><b>Rotina ativa</b></span></label>
        <div class="error-box" id="re" hidden></div></form>`,
      foot: `${r && adm ? '<button class="btn danger ghost" data-act="del">Excluir</button>' : ''}<button class="btn secondary" data-act="cancel">${adm ? 'Cancelar' : 'Fechar'}</button>${adm ? '<button class="btn" data-act="ok">Salvar</button>' : ''}` });
    const f = m.querySelector('#rf');
    const sync = () => {
      const cs = contentsFor(f.audience.value), cur = cs.includes(f.content.value) ? f.content.value : cs[0] || 'resumo_carteira';
      f.content.innerHTML = cs.map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(CONTENT[k])}</option>`).join('');
      m.querySelector('#ah').textContent = AUD_HELP[f.audience.value];
      m.querySelector('#wd').hidden = f.frequency.value !== 'weekly'; m.querySelector('#md').hidden = f.frequency.value !== 'monthly';
    };
    f.audience.onchange = sync; f.frequency.onchange = sync;
    f.content.innerHTML = contentsFor(d.audience).map((k) => `<option value="${k}" ${k === d.content ? 'selected' : ''}>${esc(CONTENT[k])}</option>`).join('');
    sync();
    if (!adm) f.querySelectorAll('input,select').forEach((x) => (x.disabled = true));
    m.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const del = m.querySelector('[data-act=del]');
    if (del) del.onclick = async () => {
      if ((await confirmAction({ title: 'Excluir a rotina', text: 'Ela deixa de enviar. Os e-mails já enviados continuam no histórico.', confirmLabel: 'Excluir' })) == null) return;
      run(del, () => rpc('partner_notif_routine_delete', { p_id: r.id }), 'Rotina excluída').then(() => { closeModal(); done(); }).catch(() => null);
    };
    const ok = m.querySelector('[data-act=ok]');
    if (ok) ok.onclick = () => {
      if (!f.name.value.trim()) { const e = m.querySelector('#re'); e.hidden = false; e.textContent = 'Dê um nome à rotina.'; return; }
      const p = { id: r && r.id, name: f.name.value, audience: f.audience.value, content: f.content.value, frequency: f.frequency.value, weekday: Number(f.weekday.value), month_day: Number(f.month_day.value),
        send_hour: Number(f.send_hour.value), template_id: f.template_id.value || null, active: f.active.checked };
      run(ok, () => rpc('partner_notif_routine_save', { p }), 'Rotina salva').then(() => { closeModal(); done(); }).catch(() => null);
    };
  }

  B.notif = { pane, templates };
})();
