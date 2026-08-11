/**
 * ============================================================================
 * main.js - Script Principal
 * Lógica Dinâmica do Carrossel de Crédito Corporativo
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    
    function initMobileHeaderMenu() {
        const headerContainer = document.querySelector('.header-container');
        const mainNav = document.querySelector('.main-nav');
        if (!headerContainer || !mainNav) return;

        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'mobile-menu-toggle';
        menuBtn.setAttribute('aria-label', 'Abrir menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.innerHTML = '<span class="hamburger-bar"></span><span class="hamburger-bar"></span><span class="hamburger-bar"></span>';
        headerContainer.insertBefore(menuBtn, mainNav);

        const closeMobileMenu = () => {
            menuBtn.setAttribute('aria-expanded', 'false');
            mainNav.classList.remove('is-active');
            document.body.classList.remove('menu-open');
        };

        menuBtn.addEventListener('click', () => {
            const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
            menuBtn.setAttribute('aria-expanded', String(!isOpen));
            mainNav.classList.toggle('is-active', !isOpen);
            document.body.classList.toggle('menu-open', !isOpen);
        });

        document.addEventListener('click', (event) => {
            const insideHeader = headerContainer.contains(event.target);
            if (!insideHeader && mainNav.classList.contains('is-active')) {
                closeMobileMenu();
            }
        });

        const dropdownToggle = mainNav.querySelector('.dropdown-toggle');
        const dropdownMenu = mainNav.querySelector('.dropdown-menu');
        if (dropdownToggle && dropdownMenu) {
            dropdownToggle.addEventListener('click', (event) => {
                if (window.innerWidth <= 991) {
                    event.preventDefault();
                    const visible = dropdownMenu.classList.toggle('is-visible');
                    dropdownToggle.setAttribute('aria-expanded', String(visible));
                }
            });

            window.addEventListener('resize', () => {
                if (window.innerWidth > 991) {
                    dropdownMenu.classList.remove('is-visible');
                    dropdownToggle.setAttribute('aria-expanded', 'false');
                    closeMobileMenu();
                }
            });
        }

        const actions = document.querySelector('.header-actions');
        if (actions) {
            actions.querySelectorAll('a').forEach((link) => {
                const href = link.getAttribute('href') || '';
                if (href.includes('app.lottusfinance.com.br')) {
                    link.setAttribute('href', 'contato.html');
                }
            });
        }
    }

    initMobileHeaderMenu();
    
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