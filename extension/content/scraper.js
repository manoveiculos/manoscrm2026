/**
 * Manos CRM - DOM Scraper
 */

export const Scraper = {
    getPhone() {
        try {
            // 1. URL search (fastest)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('phone')) return urlParams.get('phone').replace(/\D/g, '');

            // 2. Procura em todos os headers (pode haver mais de um no WA)
            const headers = document.querySelectorAll('header');

            for (const header of headers) {
                // Tenta achar o título do chat dentro deste header
                const titleElem = header.querySelector('[data-testid="conversation-info-header-chat-title"]')
                    || header.querySelector('span[title]')
                    || header.querySelector('div[role="button"] span')
                    || header.querySelector('h1, h2, canvas + div span'); // Agreste, mas cobre versões Business

                if (titleElem) {
                    const titleText = (titleElem.innerText || titleElem.getAttribute('title') || "").trim();

                    // Regex para telefone (com ou sem +, espaços, etc)
                    const matches = titleText.match(/\+?\d[\d\s\-\(\)]{8,}\d/);
                    if (matches) {
                        const clean = matches[0].replace(/\D/g, '');
                        if (clean.length >= 10 && clean.length <= 15) {
                            return clean;
                        }
                    }
                }

                // Fallback: Procura qualquer padrão de telefone no texto bruto do header
                const bodyMatches = header.innerText.match(/\+?\d[\d\s\-\(\)]{8,}\d/);
                if (bodyMatches) {
                    const clean = bodyMatches[0].replace(/\D/g, '');
                    if (clean.length >= 10 && clean.length <= 15) {
                        console.log("Manos CRM Scraper: Telefone encontrado no texto do header ->", clean);
                        return clean;
                    }
                }
            }

        } catch (e) {
            console.error("Manos CRM: Erro crítico no Scraper", e);
        }
        return null;
    },

    getMessages() {
        const messageElems = document.querySelectorAll('.message-in, .message-out');
        return Array.from(messageElems).map(el => {
            const isOut = el.classList.contains('message-out');
            const textElem = el.querySelector('.selectable-text span');
            return {
                text: textElem ? textElem.innerText : "",
                direction: isOut ? 'outbound' : 'inbound',
                timestamp: new Date().toISOString()
            };
        }).filter(m => m.text);
    }
};
