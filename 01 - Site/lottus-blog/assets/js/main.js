/**
 * ============================================================================
 * main.js - Script Principal
 * Lógica Dinâmica do Carrossel de Crédito Corporativo
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    
    function initMobileHeaderMenu() {
        console.log('🔍 Iniciando menu mobile...');
        
        const headerElement = document.querySelector('.lottus-header');
        const mainNav = document.querySelector('.main-nav');
        
        console.log('headerElement:', headerElement);
        console.log('mainNav:', mainNav);
        
        if (!headerElement || !mainNav) {
            console.error('❌ Elementos não encontrados!');
            return;
        }

        // Get mobile hamburger menu button
        let menuBtn = headerElement.querySelector('.mobile-menu-toggle');
        console.log('menuBtn:', menuBtn);
        
        if (!menuBtn) {
            console.log('⚠️ Botão não encontrado, criando...');
            menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'mobile-menu-toggle';
            menuBtn.setAttribute('aria-label', 'Abrir menu');
            menuBtn.setAttribute('aria-expanded', 'false');
            menuBtn.innerHTML = '<span class="hamburger-bar"></span><span class="hamburger-bar"></span><span class="hamburger-bar"></span>';
            const headerContent = headerElement.querySelector('.header-content');
            if (headerContent) {
                headerContent.appendChild(menuBtn);
            }
        }

        const closeMobileMenu = () => {
            console.log('🔒 Fechando menu...');
            menuBtn.setAttribute('aria-expanded', 'false');
            mainNav.classList.remove('is-active');
            document.body.classList.remove('menu-open');
        };

        // Click no botão hamburger
        menuBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            console.log('📱 Clicou no hamburger!');
            const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
            const newState = !isOpen;
            console.log('Estado atual:', isOpen, '→ Novo:', newState);
            menuBtn.setAttribute('aria-expanded', String(newState));
            mainNav.classList.toggle('is-active', newState);
            document.body.classList.toggle('menu-open', newState);
        });

        // Fecha menu ao clicar fora
        document.addEventListener('click', (event) => {
            const isClickInside = headerElement.contains(event.target) || mainNav.contains(event.target);
            if (!isClickInside && mainNav.classList.contains('is-active')) {
                console.log('🌍 Clicou fora, fechando menu...');
                closeMobileMenu();
            }
        });

        // Populate mobile action buttons
        const actions = document.querySelector('.header-actions');
        if (actions && !mainNav.querySelector('.mobile-nav-actions')) {
            console.log('📋 Adicionando botões de ação ao menu mobile');
            const mobileActions = document.createElement('div');
            mobileActions.className = 'mobile-nav-actions';
            actions.querySelectorAll('a').forEach(btn => {
                const clone = btn.cloneNode(true);
                mobileActions.appendChild(clone);
            });
            mainNav.appendChild(mobileActions);
        }

        // Fechar ao clicar em links
        mainNav.querySelectorAll('a:not(.dropdown-toggle)').forEach(link => {
            link.addEventListener('click', () => {
                console.log('🔗 Clicou em link, fechando menu...');
                closeMobileMenu();
            });
        });

        // Dropdown em mobile
        const dropdownToggle = mainNav.querySelector('.dropdown-toggle');
        const dropdownMenu = mainNav.querySelector('.dropdown-menu');
        if (dropdownToggle && dropdownMenu) {
            dropdownToggle.addEventListener('click', (event) => {
                if (window.innerWidth <= 991) {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('🔻 Clicou em Soluções');
                    const visible = dropdownMenu.classList.toggle('is-visible');
                    dropdownToggle.setAttribute('aria-expanded', String(visible));
                }
            });

            window.addEventListener('resize', () => {
                if (window.innerWidth > 991) {
                    console.log('📏 Redimensionado para desktop');
                    dropdownMenu.classList.remove('is-visible');
                    dropdownToggle.setAttribute('aria-expanded', 'false');
                    closeMobileMenu();
                }
            });
        }
        
        console.log('✅ Menu mobile inicializado com sucesso');
    }

    // Executar inicialização
    try {
        initMobileHeaderMenu();
    } catch (error) {
        console.error('❌ Erro ao inicializar menu:', error);
    }
    
    // 1. Mapeamento de Elementos do DOM
    const tabs = document.querySelectorAll('.solutions-tab-pill');
    const container = document.querySelector('.solutions-carousel');
    const carouselSection = document.querySelector('.solutions-carousel-section');
    const progressFill = document.querySelector('.solutions-progress-fill');
    
    // Proteção de execução caso não exista carrossel na página
    if (tabs.length === 0 || !container) return;

    // 2. Configurações do Carrossel (Dinâmico)
    // Lê automaticamente quais abas existem na tela e cria a ordem correta
    const order = Array.from(tabs).map(tab => tab.getAttribute('data-tab'));
    const AUTOPLAY_TIME = 8000;
    let currentIndex = 0;
    let autoplayTimer = null;

    // 3. Função Principal: Atualiza a interface
    function updateCarousel(activeTab) {
        currentIndex = order.indexOf(activeTab);
        
        if (currentIndex === -1) return;

        container.setAttribute('data-active', activeTab);

        // Atualiza o estado visual das Abas
        tabs.forEach(tab => {
            const isSelected = tab.getAttribute('data-tab') === activeTab;
            tab.classList.toggle('active', isSelected);
            tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });

        // Calcula a posição circular dinamicamente baseada no tamanho do array
        const leftIndex = (currentIndex - 1 + order.length) % order.length;
        const rightIndex = (currentIndex + 1) % order.length;

        const leftCardTarget = order[leftIndex];
        const rightCardTarget = order[rightIndex];

        // Atualiza o posicionamento dos Cards
        order.forEach((cardName, index) => {
            const sideCard = container.querySelector(`.solution-carousel-card-side[data-card="${cardName}"]`);
            const activeCard = container.querySelector(`.solution-carousel-card-active[data-card="${cardName}"]`);

            if (sideCard) {
                sideCard.classList.remove('is-left', 'is-right', 'is-hidden');
                sideCard.setAttribute('aria-hidden', 'true');
            }
            if (activeCard) {
                activeCard.classList.add('is-hidden');
                activeCard.classList.remove('is-active');
                activeCard.setAttribute('hidden', 'true');
            }

            if (index === currentIndex) {
                // Card Central Ativo
                if (activeCard) {
                    activeCard.classList.remove('is-hidden');
                    activeCard.classList.add('is-active');
                    activeCard.removeAttribute('hidden');
                }
                if (sideCard) sideCard.classList.add('is-hidden');
                
            } else if (cardName === leftCardTarget) {
                // Lateral Esquerda
                if (sideCard) sideCard.classList.add('is-left');
                
            } else if (cardName === rightCardTarget) {
                // Lateral Direita
                if (sideCard) sideCard.classList.add('is-right');
                
            } else {
                // Fica Oculto
                if (sideCard) sideCard.classList.add('is-hidden');
            }
        });

        // 4. Reinicia a animação da Barra de Progresso
        if (progressFill) {
            progressFill.classList.remove('is-running');
            void progressFill.offsetWidth; 
            progressFill.classList.add('is-running');
        }
    }

    // 5. Controles de Autoplay
    function startAutoplay() {
        stopAutoplay();
        autoplayTimer = setInterval(() => {
            const nextIndex = (currentIndex + 1) % order.length;
            updateCarousel(order[nextIndex]);
        }, AUTOPLAY_TIME);
    }

    function stopAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    // 6. Listeners 
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');
            updateCarousel(targetTab);
            startAutoplay();
        });
    });

    if (container) {
        container.addEventListener('click', (e) => {
            const clickedSideCard = e.target.closest('.solution-carousel-card-side');
            if (clickedSideCard) {
                const targetCard = clickedSideCard.getAttribute('data-card');
                updateCarousel(targetCard);
                startAutoplay();
            }
        });
    }

    if (carouselSection) {
        carouselSection.addEventListener('mouseenter', stopAutoplay);
        carouselSection.addEventListener('mouseleave', startAutoplay);
    }

    // 7. Inicialização
    updateCarousel(order[0]);
    startAutoplay();
});