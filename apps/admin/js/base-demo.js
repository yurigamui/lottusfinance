/* Lottus · Admin — rota oculta #/_base: demonstra a base visual (page/list) com dados fictícios.
   Fora do menu; só para administradores. Serve de apoio à verificação da Seção 1. */
(function () {
  'use strict';
  const B = window.BO;
  const { esc, brl } = B;
  const { pageHead, onPage, list, onList, more, skeleton, tabs, onTabs, empty, can } = B.ui;

  const LONG = 'Exemplo' + 'NomeMuitoLongoSemEspacoNenhumParaTestarOCorteXXXXXXXXXXXXXXXXXXXXXX'.slice(0, 53); // 60 caracteres
  const STATUS = [['Em análise', 'warning'], ['Aprovado', 'success'], ['Recusado', 'danger']];
  function sample(n) {
    return Array.from({ length: n }, (_, i) => ({
      name: i === 0 ? LONG : `Exemplo ${String(i + 1).padStart(4, '0')} · Cedente fictício`,
      status: STATUS[i % 3],
      due: `2026-12-${String((i % 28) + 1).padStart(2, '0')}`,
      amount: i === 0 ? 999999999.99 : (i * 1234.56) % 50000,
    }));
  }
  const COLS = [
    { key: 'name', label: 'Nome' },
    { key: 'status', label: 'Situação', render: (r) => `<span class="tag ${esc(r.status[1])}">${esc(r.status[0])}</span>` },
    { key: 'due', label: 'Vencimento', render: (r) => esc(B.date(r.due)) },
    { key: 'amount', label: 'Valor (exemplo)', num: true, render: (r) => esc(brl(r.amount)) },
  ];
  // A busca olha o texto de cada coluna: a situação vira texto simples
  const prep = (rows) => rows.map((r) => Object.assign({}, r, { statusText: r.status[0] }));

  B.views._base = async (el, params, me) => {
    if (!can(me, 'admin')) { el.innerHTML = `<div class="card">${empty('Só administradores veem esta página.')}</div>`; return; }
    const n = [0, 1, 30, 1000].includes(Number(params[0])) ? Number(params[0]) : 30;
    const cols = COLS.map((c) => (c.key === 'status' ? Object.assign({}, c, { key: 'statusText' }) : c));
    el.innerHTML = `
      ${pageHead({ title: 'Base visual (exemplo)', sub: 'Página de apoio com dados fictícios. Não faz parte do menu.', primary: { label: 'Ação principal', id: 'main' }, more: [{ label: 'Exportar exemplo', id: 'exp' }, { label: 'Apagar exemplo', id: 'del', danger: true }] })}
      <div class="stack">
        ${tabs([['0', '0 linhas'], ['1', '1 linha'], ['30', '30 linhas'], ['1000', '1.000 linhas']], String(n))}
        <p class="muted small" id="base-msg" role="status">Todos os dados abaixo são fictícios (Exemplo).</p>
        ${list({ columns: cols, rows: prep(sample(n)), pageSize: 25, cardTitle: 'name' })}
        ${more('Ver mais (exemplo)', '<p>Conteúdo secundário de exemplo, recolhido por padrão.</p>')}
        <div><h2>Esqueleto de carregamento</h2>${skeleton(3)}</div>
      </div>`;
    onPage(el, { main: () => { el.querySelector('#base-msg').textContent = 'Ação principal acionada (exemplo).'; }, exp: () => { el.querySelector('#base-msg').textContent = 'Exportar acionado (exemplo).'; }, del: () => { el.querySelector('#base-msg').textContent = 'Apagar acionado (exemplo, sem efeito).'; } });
    onList(el);
    onTabs(el, (v) => { location.hash = `#/_base/${v}`; });
  };
})();
