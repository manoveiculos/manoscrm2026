/**
 * Manos CRM - DOM Scraper
 */

export const Scraper = {
    VERSION: "2.6.STRICT",

    _isValidPhone(phone) {
        if (!phone) return false;
        if (phone.length > 13) return false; // Bloqueia JID interno WhatsApp longo (como 30726363869235)
        if (!phone.startsWith('55')) return false; // Exige padrão Brasil para segurança
        if (phone.length < 12) return false; // 55 + 2 DDD + 8 ou 9 digitos
        return true;
    },


    getPhone() {
        try {
            console.log(`Manos CRM: [DEBUG] Iniciando getPhone v${this.VERSION}...`);

            // 1. Verificar Header da Conversa (#main header)
            const mainHeader = document.querySelector('#main header');
            if (mainHeader) {
                // Tenta pegar do título (pode ser o número ou nome)
                const titleElem = mainHeader.querySelector('[data-testid="conversation-info-header-chat-title"]')
                    || mainHeader.querySelector('span[title]')
                    || mainHeader.querySelector('div[role="button"]');
                
                const titleText = titleElem ? (titleElem.innerText || titleElem.getAttribute('title') || "") : "";
                const cleanTitle = titleText.replace(/\D/g, '');
                
                if (this._isValidPhone(cleanTitle)) {
                    console.log("Manos CRM: [REFINADO] Telefone encontrado no título ->", cleanTitle);
                    return cleanTitle;
                }

                // Tenta pegar o data-id do Header (mais robusto)
                const headerDataId = mainHeader.closest('[data-id]')?.getAttribute('data-id')
                    || mainHeader.querySelector('[data-id]')?.getAttribute('data-id')
                    || document.querySelector('[data-testid="conversation-panel-wrapper"] [data-id]')?.getAttribute('data-id');

                if (headerDataId && headerDataId.includes('@c.us')) {
                    const phone = headerDataId.split('@')[0].replace(/\D/g, '');
                    if (this._isValidPhone(phone)) {
                        console.log("Manos CRM: [REFINADO] Telefone via data-id Header ->", phone);
                        return phone;
                    }
                }
            }

            // 2. Painel Lateral (Item Selecionado)
            const selectedChat = document.querySelector('div[aria-selected="true"]') 
                || document.querySelector('div[data-testid="list-item"][aria-selected="true"]');
            
            if (selectedChat) {
                const dataId = selectedChat.getAttribute('data-id') 
                    || selectedChat.closest('[data-id]')?.getAttribute('data-id');
                
                if (dataId && dataId.includes('@c.us')) {
                    const phone = dataId.split('@')[0].replace(/\D/g, '');
                    if (this._isValidPhone(phone)) {
                        console.log("Manos CRM: [REFINADO] Telefone via Painel Lateral ->", phone);
                        return phone;
                    }
                }
            }

            // 3. Brute Force Fallback (Qualquer elemento visível com data-id que pareça um chat individual)
            const allPossible = document.querySelectorAll('#main [data-id], #pane-side [aria-selected="true"] [data-id]');
            for (let el of allPossible) {
                const id = el.getAttribute('data-id');
                if (id && id.includes('@c.us') && !id.includes('-')) {
                    const phone = id.split('@')[0].replace(/\D/g, '');
                    if (this._isValidPhone(phone)) {
                        console.log("Manos CRM: [FALLBACK] Telefone encontrado em elemento ->", phone);
                        return phone;
                    }
                }
            }

            console.error(`Manos CRM: [DETECTOR v${this.VERSION}] Todos os caminhos retornaram NULL`);

        } catch (e) {
            console.error("Manos CRM: Erro catastrófico no Scraper", e);
        }
        return null;
    },


    // Auxiliar para garantir limpeza total
    _cleanPhone(phone) {
        if (!phone) return null;
        const clean = phone.replace(/\D/g, '');
        return clean.length >= 8 ? clean : null;
    },

    getName() {
        try {
            // Focar no header da conversa ativa (#main)
            const main = document.getElementById('main');
            const header = main ? main.querySelector('header') : document.querySelector('header');

            if (!header) return "";

            // O titulo às vezes está em um dir="auto"
            const titleElem = header.querySelector('[data-testid="conversation-info-header-chat-title"]')
                || header.querySelector('span[title]')
                || header.querySelector('div[role="button"] span')
                || header.querySelector('h1, h2');

            if (titleElem) {
                // Captura agressiva de span interno ou do próprio elemento
                let text = (titleElem.innerText || titleElem.getAttribute('title') || "").trim();
                const pureTitle = titleElem.querySelector('span[dir="auto"]') || titleElem;
                if (pureTitle && pureTitle.innerText) {
                    text = pureTitle.innerText.trim();
                }

                // Fallback: junta todos os spans do header se ainda estiver vazio
                if (!text && header.innerText) {
                    return header.innerText.split('\n')[0].trim();
                }

                return text;
            }
        } catch (e) {
            console.error("Manos CRM: Erro ao obter nome", e);
        }
        return "";
    },

    // Extrai as mensagens que já estão no DOM atual
    extractMessagesData() {
        const messageElems = document.querySelectorAll('.message-in, .message-out');
        return Array.from(messageElems).map(el => {
            const isOut = el.classList.contains('message-out');

            // Tenta seletores comuns do WhatsApp Web
            const textElem = el.querySelector('.selectable-text span')
                || el.querySelector('.copyable-text span')
                || el.querySelector('span.selectable-text');

            let text = "";
            if (textElem) {
                text = textElem.innerText;
            } else {
                const spans = el.querySelectorAll('span');
                for (let s of spans) {
                    if (s.innerText.length > 1 && !s.classList.contains('copyable-text')) {
                        text = s.innerText;
                        break;
                    }
                }
            }

            // Fallback para evitar vazios se possível
            if (text.trim() === '') {
                // Tenta pegar imagem/audio label
                const labelElem = el.querySelector('[aria-label]');
                if (labelElem) text = `[Mídia: ${labelElem.getAttribute('aria-label')}]`;
            }


            // Tenta capturar o timestamp real do atributo do WhatsApp (mais robusto para deduplicação)
            let timestamp = new Date().toISOString();
            const timeContainer = el.closest('[data-pre-plain-text]') || el.querySelector('[data-pre-plain-text]');
            if (timeContainer) {
                const rawText = timeContainer.getAttribute('data-pre-plain-text');
                const match = rawText.match(/\[(\d{2}:\d{2}), (\d{2}\/\d{2}\/\d{4})\]/);
                if (match) {
                    const [_, time, date] = match;
                    const [day, month, year] = date.split('/');
                    timestamp = new Date(`${year}-${month}-${day}T${time}:00`).toISOString();
                }
            } else {
                // Fallback: Busca em elemento de texto de hora
                const timeElem = el.querySelector('[data-testid="msg-meta"]') || el.querySelector('.copyable-text');
                const timeText = timeElem?.innerText?.match(/\d{2}:\d{2}/)?.[0];
                if (timeText) {
                    const [hours, minutes] = timeText.split(':');
                    const d = new Date();
                    d.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                    timestamp = d.toISOString();
                }
            }

            // Remove caracteres de controle invisíveis
            let cleanText = text.trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

            // ID único robusto baseado no texto, direção e timestamp real
            return {
                text: cleanText,
                direction: isOut ? 'outbound' : 'inbound',
                timestamp: timestamp,
                _rawId: `${cleanText}|${isOut ? 'O' : 'I'}|${timestamp}`
            };

        }).filter(m => m.text && m.text.length > 0);
    },

    // Rola para cima repetidamente para carregar o histórico completo
    async getFullMessages(maxScrolls = 15) {
        console.log(`Manos CRM: Iniciando Auto-Scroll para histórico completo (Max ${maxScrolls} vezes)...`);

        let allMessagesMap = new Map();

        // Encontra o container rolável da conversa
        // No WhatsApp Web, geralmente é o primeiro parente com overflow-y: auto ou scroll dentro do painel
        const scrollContainer = document.querySelector('#main .copyable-area')?.parentElement
            || document.querySelector('[data-testid="conversation-panel-messages"]')?.closest('div[tabindex]')
            || Array.from(document.querySelectorAll('#main div')).find(el => {
                const style = window.getComputedStyle(el);
                return style.overflowY === 'scroll' || style.overflowY === 'auto';
            });

        if (!scrollContainer) {
            console.warn("Manos CRM: Container de scroll não encontrado. Extraindo apenas visíveis.");
            return this.extractMessagesData();
        }

        let currentScrolls = 0;
        let lastHeight = scrollContainer.scrollHeight;

        // Função para extrair e mesclar na coleção
        const extractAndMerge = () => {
            const msgs = this.extractMessagesData();
            msgs.forEach(m => {
                // Usa o texto+direção como chave única rudimentar para evitar duplicadas
                allMessagesMap.set(m._rawId, m);
            });
        };

        // Extrai a base (parte de baixo)
        extractAndMerge();

        while (currentScrolls < maxScrolls) {
            // Rola para o topo do container
            scrollContainer.scrollTop = 0;
            currentScrolls++;
            console.log(`Manos CRM: Scroll ${currentScrolls}/${maxScrolls}...`);

            // Aguarda o WhatsApp carregar mais mensagens (geralmente dispara spinner)
            await new Promise(r => setTimeout(r, 800)); // 800ms é o ideal para o WA Web reagir

            extractAndMerge();

            // Verifica se a altura mudou (se carregou mais mensagens)
            const newHeight = scrollContainer.scrollHeight;
            if (newHeight === lastHeight) {
                // Se a altura não mudou após o scroll e o delay, provavelmente chegamos ao topo da conversa
                console.log("Manos CRM: Topo da conversa alcançado ou limite de carregamento atingido.");
                break;
            }
            lastHeight = newHeight;
        }

        console.log(`Manos CRM: Extração via Scroll finalizada. Total de blocos únicos: ${allMessagesMap.size}`);

        // Retorna convertendo o Map de volta para Array
        // As mensagens adicionadas primeiramente pelo topo podem desordenar o Map nativo, 
        // mas o WA renderiza de cima para baixo na extração final. Apenas retornamos a lista única.
        // O ideal é re-extrair tudo de uma vez no final para garantir ordem temporal correta no DOM:

        // Volta para o rodapé para o usuário não se perder
        scrollContainer.scrollTop = scrollContainer.scrollHeight;

        // Extrai uma última vez para garantir
        const finalExtract = this.extractMessagesData();
        if (finalExtract.length > allMessagesMap.size) {
            return finalExtract;
        } else {
            return Array.from(allMessagesMap.values()).map(m => {
                delete m._rawId;
                return m;
            });
        }
    }
};
