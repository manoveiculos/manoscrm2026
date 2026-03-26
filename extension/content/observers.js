/**
 * Manos CRM v2 - DOM Observers
 * Detecta troca de conversa no WhatsApp com múltiplas estratégias
 */
const Observers = {
    watchChatChange(callback) {
        let debounceTimer = null;
        let lastTitle = '';
        let lastUrl = location.href;
        let lastPhone = '';

        const fire = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(callback, 350);
        };

        // 1. Observa mudanças no título do cabeçalho (indicador mais confiável de troca de contato)
        const watchHeader = () => {
            const hdr = document.querySelector('#main header');
            if (!hdr) { setTimeout(watchHeader, 800); return; }

            new MutationObserver(() => {
                // Pega o título atual do header (nome do contato)
                const titleEl = hdr.querySelector('span[title]');
                const title = titleEl?.getAttribute('title') || hdr.innerText?.split('\n')[0] || '';
                if (title && title !== lastTitle) {
                    lastTitle = title;
                    fire();
                }
            }).observe(hdr, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['title'],
                characterData: true
            });
        };
        watchHeader();

        // Quando o #main ainda não existe, tenta de novo depois
        const watchMain = () => {
            const m = document.getElementById('main');
            if (!m) { setTimeout(watchMain, 800); return; }
            // Observa apenas childList do #main (não subtree inteiro — evita disparo excessivo)
            new MutationObserver(() => {
                // Verifica se o header mudou após o childList mudar
                const hdr = m.querySelector('header');
                const titleEl = hdr?.querySelector('span[title]');
                const title = titleEl?.getAttribute('title') || '';
                if (title && title !== lastTitle) {
                    lastTitle = title;
                    fire();
                }
            }).observe(m, { childList: true, subtree: false });
        };
        watchMain();

        // 2. Observa seleção na lista lateral (clique em novo contato)
        const watchSide = () => {
            const s = document.getElementById('pane-side');
            if (s) {
                new MutationObserver(fire).observe(s, {
                    subtree: true,
                    attributeFilter: ['aria-selected'],
                    childList: false
                });
            } else { setTimeout(watchSide, 1000); }
        };
        watchSide();

        // 3. Observa #app (muda quando abre/fecha painéis)
        const app = document.getElementById('app');
        if (app) new MutationObserver(fire).observe(app, { childList: true, subtree: false });

        // 4. Polling de URL — WhatsApp às vezes muda a URL ao trocar chat
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                fire();
            }
        }, 600);

        // 5. Polling do título — fallback caso MutationObserver falhe
        setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            const hdr = document.querySelector('#main header');
            const titleEl = hdr?.querySelector('span[title]');
            const title = titleEl?.getAttribute('title') || '';
            if (title && title !== lastTitle) {
                lastTitle = title;
                fire();
            }
        }, 1500);

        // 6. Verificação periódica de visibilidade
        setInterval(() => {
            if (document.visibilityState === 'visible') fire();
        }, 8000);
    }
};
