/* Lottus Partners — documentos para assinatura: envio ao representante do cedente, painel da operação, leitura do texto */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, toast, run, closeModal } = B;
  const KIND = { contrato_mae: 'Contrato-mãe', termo_cessao: 'Termo de cessão', nota_comercial: 'Nota comercial', ccb: 'CCB' };
  const { digits } = B;
  const base = () => { const c = window.LOTTUS_CONFIG || {}; return c.signUrl || c.partnersUrl || location.origin; };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Link copiado'); } catch (_) { toast('Copie o link manualmente', true); } };

  const linkBox = (r) => `<div class="sumcard"><span class="lbl">E-mail enviado para ${esc(r.email)}</span>
    <div class="u-break small muted">${esc(r.link)}</div><div><button type="button" class="btn secondary sm" data-copy="${esc(r.link)}">Copiar link</button></div></div>`;

  /* Escolhe o representante, gera o documento a partir do modelo e envia o link */
  B.sendDocument = function ({ kind, cnpj, operation_id, reps, onDone }) {
    const list = (reps || []).filter((r) => r.name && r.email && digits(r.cpf).length === 11);
    const box = B.drawer({ title: `Enviar ${KIND[kind] || 'documento'} para assinatura`, subtitle: 'O representante recebe um link por e-mail, lê o documento e confirma o CPF.',
      body: list.length ? `<form id="df"><div class="fsec"><h3>Quem assina</h3><div class="field"><label>Representante do cedente</label><select class="input" name="rep">${list.map((r, i) => `<option value="${i}">${esc(r.name)} · ${esc(r.email)}</option>`).join('')}</select></div></div><div id="res"></div></form>`
        : `<div class="fsec"><div class="note-box">Cadastre ao menos um representante do cedente com nome, CPF e e-mail para enviar documentos.</div><a class="btn secondary" href="#/cadastros/cedente">Ir para Cadastros</a></div>`,
      foot: list.length ? '<button class="btn secondary" data-act="cancel">Fechar</button><button class="btn" data-act="ok">Gerar e enviar</button>' : '<button class="btn secondary" data-act="cancel">Fechar</button>' });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const ok = box.querySelector('[data-act=ok]');
    if (!ok) return;
    ok.onclick = async () => {
      const f = box.querySelector('#df'), r = list[+f.rep.value];
      try {
        const d = await run(ok, () => rpc('partner_doc_prepare', { p: { kind, cnpj, operation_id, signer: { name: r.name, cpf: digits(r.cpf), email: r.email, phone: r.phone || '' } } }));
        const s = await run(ok, () => rpc('partner_doc_send', { p_id: d.id, p_base: base() }), 'Documento enviado');
        box.querySelector('#res').innerHTML = `<div class="fsec">${linkBox(s)}</div>`;
        box.querySelector('[data-copy]').onclick = (e) => copy(e.currentTarget.dataset.copy);
        ok.remove(); onDone && onDone();
      } catch (_) { /* já avisado */ }
    };
  };

  B.resendDocument = async function (id, onDone) {
    try { const s = await run(null, () => rpc('partner_doc_send', { p_id: id, p_base: base() }), 'Novo link enviado');
      const box = B.drawer({ title: 'Link reenviado', body: `<div class="fsec">${linkBox(s)}<p class="small muted">O link anterior deixou de valer.</p></div>`, foot: '<button class="btn secondary" data-act="cancel">Fechar</button>' });
      box.querySelector('[data-act=cancel]').onclick = () => closeModal(); box.querySelector('[data-copy]').onclick = (e) => copy(e.currentTarget.dataset.copy); onDone && onDone();
    } catch (_) { /* já avisado */ }
  };

  B.viewDocument = async function (id) {
    const ev = String(id).startsWith('ev:');
    const d = ev ? await rpc('partner_evidence_text', { p_id: Number(String(id).slice(3)) }) : await rpc('partner_doc_text', { p_id: id });
    const box = B.drawer({ title: d.title, subtitle: `${ev && d.signer ? esc(d.signer) + ' · ' : ''}Código ${esc(String(d.sha256).slice(0, 16))}…`, body: `<div class="fsec"><div class="doc-text">${esc(d.text)}</div></div>`, foot: '<button class="btn secondary" data-act="cancel">Fechar</button>' });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
  };

  /* O painel de documentos da operação (B.docsBox) fica em docsmk.js */
})();
