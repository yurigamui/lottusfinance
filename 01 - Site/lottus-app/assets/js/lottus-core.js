// Configuração do Supabase (Centralizada)
const supabaseUrl = 'https://rowhslnnlzfbhmzbylbz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvd2hzbG5ubHpmYmhtemJ5bGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4Mjg2MTgsImV4cCI6MjEwMDQwNDYxOH0.hUvOsj_Tpf1asd7Neh4tnlLg5Vc-amcLRfbcoZKYX-0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Variáveis Globais de Sessão
window.activeEmpresaObj = null;
window.userEmpresasGlobal = [];
window.authUser = null;

// Máscaras Básicas
function formatCNPJ(v) { if (!v) return '--'; v = String(v).replace(/\D/g, ""); if (v.length > 14) v = v.substring(0, 14); return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
function getInitials(name) { if (!name) return '--'; const words = name.trim().split(' '); let initials = words[0].substring(0, 1).toUpperCase(); if (words.length > 1) initials += words[words.length - 1].substring(0, 1).toUpperCase(); return initials; }

// Inicialização Principal do Sistema
async function initLottusSystem(currentPage) {
    const loader = document.getElementById('global-loader');
    
    // 1. Verifica Autenticação
    const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
    if (!session || sessionErr) { window.location.href = '../login/index.html'; return; }
    window.authUser = session.user;

    // 2. Tenta carregar empresas do cache (Alta Performance)
    const cachedEmpresas = sessionStorage.getItem('lottus_empresas');
    const cachedActiveId = sessionStorage.getItem('lottus_active_empresa_id');

    if (cachedEmpresas) {
        window.userEmpresasGlobal = JSON.parse(cachedEmpresas);
    } else {
        // Se não tem cache, busca no banco
        const { data: vinculos } = await supabaseClient.from('usuarios_empresa').select('empresa_id').eq('auth_user_id', authUser.id);
        const empIds = vinculos.map(v => v.empresa_id).filter(Boolean);
        if (empIds.length > 0) {
            const { data: empresas } = await supabaseClient.from('empresas').select('*').in('id', empIds);
            window.userEmpresasGlobal = empresas || [];
            sessionStorage.setItem('lottus_empresas', JSON.stringify(empresas));
        }
    }

    if (window.userEmpresasGlobal.length === 0) {
        window.location.href = '../cadastro/empresa.html'; return;
    }

    // 3. Define Empresa Ativa
    if (cachedActiveId) {
        window.activeEmpresaObj = window.userEmpresasGlobal.find(e => e.id == cachedActiveId) || window.userEmpresasGlobal[0];
    } else {
        window.activeEmpresaObj = window.userEmpresasGlobal[0];
        sessionStorage.setItem('lottus_active_empresa_id', window.activeEmpresaObj.id);
    }

    // 4. Renderiza a Sidebar (DRY - Don't Repeat Yourself)
    renderSidebar(currentPage);

    // 5. Injeta funções globais de navegação
    setupGlobalEvents();

    // 6. Finaliza carregamento
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.visibility = 'hidden', 400); }

    // Dispara evento para a página saber que o core carregou
    document.dispatchEvent(new Event('LottusCoreReady'));
}

function renderSidebar(currentPage) {
    const sidebarContainer = document.getElementById('lottus-sidebar-container');
    if (!sidebarContainer) return;

    const nomeCedente = window.activeEmpresaObj.nome || window.activeEmpresaObj.razao || 'Sua Empresa';
    const userName = window.authUser.user_metadata?.nome || window.authUser.email.split('@')[0];
    const isAtivo = window.activeEmpresaObj.status === 'ATIVO';

    let dropdownHtml = window.userEmpresasGlobal.map(emp => `
        <div class="dropdown-company-item ${emp.id === window.activeEmpresaObj.id ? 'active' : ''}" onclick="changeActiveCompany(${emp.id})">
            <div class="dropdown-company-info">
                <h5>${emp.nome || emp.razao || 'Empresa'}</h5>
                <p>${formatCNPJ(emp.cnpj)}</p>
            </div>
            ${emp.id === window.activeEmpresaObj.id ? '<span style="color:var(--lottus-pink); font-weight:800;">✓</span>' : ''}
        </div>
    `).join('');

    sidebarContainer.innerHTML = `
    <aside class="sidebar">
        <div>
            <div class="sidebar-header">
                <img src="../assets/img/Logo 1.png" alt="Lottus Finance" style="max-height: 32px; width: auto; object-fit: contain;">
            </div>
            <div class="company-dropdown-container" id="company-dropdown-container">
                <div class="company-selector" id="company-selector-btn">
                    <div class="company-avatar">${getInitials(nomeCedente)}</div>
                    <div class="company-info">
                        <h4>${nomeCedente}</h4>
                        <p>${formatCNPJ(window.activeEmpresaObj.cnpj)}</p>
                    </div>
                    <svg class="dropdown-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="company-dropdown-menu" id="company-dropdown-list">
                    ${dropdownHtml}
                    <div class="add-company-item" onclick="window.location.href='../cadastro/empresa.html'">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>Adicionar nova empresa
                    </div>
                </div>
            </div>

            <nav class="sidebar-nav">
                <a href="index.html" class="nav-item ${currentPage === 'dashboard' ? 'active' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> Visão Geral
                </a>
                <a href="solicitacoes.html" class="nav-item ${currentPage === 'solicitacoes' ? 'active' : ''} ${!isAtivo ? 'disabled' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg> Solicitações
                </a>
                <a href="relatorios.html" class="nav-item ${currentPage === 'relatorios' ? 'active' : ''} ${!isAtivo ? 'disabled' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> Relatórios
                </a>
                <a href="configuracoes.html" class="nav-item ${currentPage === 'configuracoes' ? 'active' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> Configurações
                </a>
            </nav>
        </div>
        <div class="sidebar-footer">
            <div class="user-avatar">${getInitials(userName)}</div>
            <div class="user-info">
                <p>${userName}</p>
                <span>${window.authUser.email}</span>
            </div>
            <button class="logout-btn" onclick="logoutLottus()" title="Sair da conta">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
        </div>
    </aside>`;
}

function setupGlobalEvents() {
    const dropdownContainer = document.getElementById('company-dropdown-container');
    const dropdownBtn = document.getElementById('company-selector-btn');
    if (dropdownBtn) {
        dropdownBtn.onclick = (e) => { e.stopPropagation(); dropdownContainer.classList.toggle('open'); };
    }
    document.addEventListener('click', () => {
        if(dropdownContainer) dropdownContainer.classList.remove('open');
    });
}

window.changeActiveCompany = function(empresaId) {
    sessionStorage.setItem('lottus_active_empresa_id', empresaId);
    window.location.reload(); // Recarrega a página para resetar os dados focados na nova empresa
}

window.logoutLottus = async function() {
    sessionStorage.clear();
    await supabaseClient.auth.signOut();
    window.location.href = '../login/index.html';
}