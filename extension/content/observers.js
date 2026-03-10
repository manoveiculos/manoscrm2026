/**
 * Manos CRM - DOM Observers
 */

export const Observers = {
    chatObserver: null,

    watchChatChange(callback) {
        // Obserbar o contêiner principal do chat
        const main = document.getElementById('main');

        // Se o chat ainda não carregou, tentamos novamente em 1s
        if (!main) {
            setTimeout(() => this.watchChatChange(callback), 1000);
            return;
        }

        console.log("Manos CRM: Iniciando observação de chat...");

        // Usamos um MutationObserver no body ou em um container estável 
        // para detectar quando a estrutura do chat principal muda (troca de conversa)
        this.chatObserver = new MutationObserver((mutations) => {
            callback();
        });

        // Observar o container principal e o cabeçalho especificamente
        this.chatObserver.observe(main, { childList: true, subtree: true, characterData: true });

        // Heartbeat: Às vezes o MutationObserver pode falhar em SPAs
        setInterval(() => {
            callback();
        }, 2000);

        // Também observar a URL (Single Page Application navigation)
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                console.log("Manos CRM: Mudança de URL detectada 🧭");
                callback();
            }
        }, 1000);
    },

    stop() {
        if (this.chatObserver) this.chatObserver.disconnect();
    }
};
