/**
 * Manos CRM - DOM Observers
 */

export const Observers = {
    chatObserver: null,

    watchChatChange(callback) {
        console.log("Manos CRM: Iniciando observadores sensíveis...");

        // 1. Observer para #app (Monitora mudanças globais de navegação)
        const app = document.getElementById('app');
        if (app) {
            const appObserver = new MutationObserver(() => callback());
            appObserver.observe(app, { childList: true, subtree: false });
        }

        // 2. Observer para a lista lateral (Troca de seleção)
        const watchSidePane = () => {
            const sidePane = document.getElementById('pane-side');
            if (sidePane) {
                const sideObserver = new MutationObserver(() => callback());
                sideObserver.observe(sidePane, {
                    subtree: true,
                    attributeFilter: ['aria-selected'],
                    childList: true
                });
                console.log("Manos CRM: Observando lista lateral (#pane-side)");
            } else {
                setTimeout(watchSidePane, 1500);
            }
        };

        // 3. Observer para o container de chat (Mudança interna e Header)
        const watchMainChat = () => {
            const main = document.getElementById('main');
            if (main) {
                const mainObserver = new MutationObserver(() => callback());
                // Subtree true é vital para detectar mudanças no título/header
                mainObserver.observe(main, { childList: true, subtree: true });
                console.log("Manos CRM: Observando mudanças em #main (subtree)");
            } else {
                setTimeout(watchMainChat, 1500);
            }
        };

        watchSidePane();
        watchMainChat();

        // 4. Heartbeat: Failsafe a cada 2s
        setInterval(() => callback(), 2000);
    },

    stop() {
        if (this.chatObserver) this.chatObserver.disconnect();
    }
};
