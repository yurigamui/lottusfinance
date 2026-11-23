/* Tema antes de desenhar a página: claro (padrão). Fica num arquivo (sem script embutido) para a política de segurança (CSP). */
document.documentElement.dataset.theme = 'light';
try { localStorage.removeItem('lottus.bo.theme'); } catch (e) { /* sem armazenamento */ }
