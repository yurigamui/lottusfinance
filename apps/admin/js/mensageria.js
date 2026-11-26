/* Lottus · Backoffice — Mensageria do Lottus Sign: código por SMS/WhatsApp e raízes ICP-Brasil do certificado digital */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, run, dateTime } = B;
  const { head } = B.ui;
  const fail = (e) => B.toast(B.message(e), true);

  B.views.mensageria = async (el, _p, me) => {
    // Só administrador: confere antes de qualquer chamada ao banco
    if (!B.ui.can(me || B.me, 'admin')) return B.ui.denied(el, me || B.me, 'A tela de Mensageria (Sign)', 'administradores');
    const [c, roots] = await Promise.all([rpc('sign_messaging_get'), rpc('sign_roots_list')]);
    const sw = (name, on, label, help) => `<label class="switch-row"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span></label>`;
    el.innerHTML = `${head('Mensageria do Lottus Sign', 'Como o código de verificação chega ao celular e quais certificados digitais são aceitos.')}
      <div class="stack">
        <form class="card stack" id="mf" novalidate>
          <div><h2>Canais de envio do código</h2><p class="muted small u-m4t">O código de 6 dígitos vale por 10 minutos. O e-mail continua sempre disponível para avisos.</p></div>
          ${sw('sms_enabled', c.sms_enabled, 'SMS', 'Enviado pelo TextBee (os segredos TEXTBEE_API_KEY e TEXTBEE_DEVICE_ID já ficam nas funções).')}
          ${sw('whatsapp_enabled', c.whatsapp_enabled, 'WhatsApp (API oficial da Meta)', 'Só liga com número, modelo e token preenchidos.')}
          <div class="grid-2">
            <div class="field"><label>ID do número (Phone Number ID)</label><input class="input mono" name="whatsapp_phone_number_id" value="${esc(c.whatsapp_phone_number_id || '')}" autocomplete="off" placeholder="Ex.: 123456789012345"></div>
            <div class="field"><label>Token de acesso permanente</label><input class="input mono" type="password" name="whatsapp_token" autocomplete="new-password" placeholder="${c.has_token ? `Guardado (final ${esc(c.key_hint || '••••')}). Deixe em branco para manter` : 'Cole o token da Meta'}"></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>Modelo (template) de autenticação</label><input class="input mono" name="whatsapp_template" value="${esc(c.whatsapp_template)}" autocomplete="off"></div>
            <div class="field"><label>Idioma do modelo</label><input class="input mono" name="whatsapp_lang" value="${esc(c.whatsapp_lang)}" autocomplete="off"></div>
          </div>
          <div class="field"><label>Versão da API</label><input class="input mono" name="whatsapp_api_version" value="${esc(c.whatsapp_api_version)}" style="max-width:140px" autocomplete="off"></div>
          <div class="note-box small">O modelo precisa ser de categoria “Autenticação”, aprovado na Meta, com uma variável no corpo (o código) e o botão de copiar código. O token fica no cofre do banco e nunca volta para a tela.</div>
          <div class="error-box" id="me" hidden></div>
          <div><button class="btn" type="submit">Salvar</button></div>
        </form>
        <div class="card stack">
          <div><h2>Certificados digitais aceitos (raízes ICP-Brasil)</h2><p class="muted small u-m4t">Para um certificado A1 valer como verificação de identidade, a cadeia dele precisa chegar a uma destas raízes. Cole o certificado raiz (e, se quiser, as autoridades intermediárias) em formato PEM, baixado do site oficial do ITI (gov.br/iti). Sem raízes cadastradas, nenhum certificado é aceito.</p></div>
          ${roots.length ? roots.map((r) => `<div class="list-row"><div class="grow"><b>${esc(r.name)}</b><div class="small muted mono">${esc(r.sha256)}</div></div><span class="tag ${r.active ? 'success' : ''}">${r.active ? 'Ativa' : 'Desativada'}</span><button class="btn ghost sm" data-tg="${esc(r.id)}" data-on="${r.active ? 0 : 1}">${r.active ? 'Desativar' : 'Ativar'}</button></div>`).join('') : '<p class="small muted u-m0">Nenhuma raiz cadastrada.</p>'}
          <form id="rf" class="stack" novalidate>
            <div class="field"><label>Nome</label><input class="input" name="name" maxlength="120" placeholder="Ex.: AC Raiz ICP-Brasil v10"></div>
            <div class="field"><label>Certificado (PEM)</label><textarea class="input mono" name="pem" rows="6" placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----"></textarea></div>
            <div class="error-box" id="re" hidden></div>
            <div><button class="btn secondary" type="submit">Adicionar raiz</button></div>
          </form>
        </div></div>`;
    const reload = () => B.views.mensageria(el, [], me);
    const f = el.querySelector('#mf');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = el.querySelector('#me'); err.hidden = true;
      const p = { sms_enabled: f.sms_enabled.checked, whatsapp_enabled: f.whatsapp_enabled.checked, whatsapp_phone_number_id: f.whatsapp_phone_number_id.value, whatsapp_token: f.whatsapp_token.value,
        whatsapp_template: f.whatsapp_template.value, whatsapp_lang: f.whatsapp_lang.value, whatsapp_api_version: f.whatsapp_api_version.value };
      try { await run(f.querySelector('[type=submit]'), () => rpc('sign_messaging_save', { p }), 'Mensageria salva'); reload(); }
      catch (x) { err.hidden = false; err.textContent = /whatsapp_incomplete/.test(String(x.message)) ? 'Para ligar o WhatsApp, preencha o ID do número e o token.' : B.message(x); }
    });
    const rf = el.querySelector('#rf');
    rf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = el.querySelector('#re'); err.hidden = true;
      if (!rf.name.value.trim() || !/BEGIN CERTIFICATE/.test(rf.pem.value)) { err.hidden = false; err.textContent = 'Informe o nome e cole o certificado em PEM.'; return; }
      try { await run(rf.querySelector('[type=submit]'), () => rpc('sign_root_add', { p_name: rf.name.value.trim(), p_pem: rf.pem.value }), 'Raiz adicionada'); reload(); }
      catch (x) { err.hidden = false; err.textContent = 'Certificado inválido. Cole o PEM completo.'; }
    });
    el.querySelectorAll('[data-tg]').forEach((b) => (b.onclick = async () => { try { await run(b, () => rpc('sign_root_toggle', { p_id: b.dataset.tg, p_active: b.dataset.on === '1' }), 'Atualizado'); reload(); } catch (x) { fail(x); } }));
  };
})();
