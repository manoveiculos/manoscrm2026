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

            // Caminho A: Número puro no título (Header)
            const name = this.getName();
            console.log("Manos CRM: [DEBUG] Nome capturado no Header ->", `"${name}"`);

            if (name) {
                // Tenta limpar e verificar diretamente se o texto contém o número
                const cleanName = name.replace(/\D/g, '');
                if (this._isValidPhone(cleanName)) {
                    console.log("Manos CRM: [CAMINHO A] Sucesso direto do texto ->", cleanName);
                    return cleanName;
                }
            }

            // Caminho B: Atributo de Sistema no Painel de Conversa (#main)
            const mainPanel = document.getElementById('main') || document.querySelector('[data-testid="conversation-panel-wrapper"]');
            if (mainPanel) {
                let dataId = mainPanel.getAttribute('data-id')
                    || mainPanel.querySelector('[data-id]')?.getAttribute('data-id')
                    || mainPanel.querySelector('[data-testid="conversation-info-header"]')?.getAttribute('data-id');

                if (dataId) {
                    const phoneB = dataId.split('@')[0].replace(/\D/g, '');
                    if (this._isValidPhone(phoneB)) {
                        console.log("Manos CRM: [CAMINHO B] Sucesso ->", phoneB);
                        return phoneB;
                    } else {
                        console.log("Manos CRM: [CAMINHO B] Bloqueado pela validação ->", phoneB);
                    }
                }
            }

            // Caminho C: Painel Lateral (Item selecionado)
            const selectedChat = document.querySelector('div[aria-selected="true"]');
            if (selectedChat) {
                let dataId = selectedChat.getAttribute('data-id')
                    || selectedChat.closest('[data-id]')?.getAttribute('data-id')
                    || selectedChat.querySelector('[data-id]')?.getAttribute('data-id');

                if (dataId) {
                    const phoneC = dataId.split('@')[0].replace(/\D/g, '');
                    if (this._isValidPhone(phoneC)) {
                        console.log("Manos CRM: [CAMINHO C] Sucesso ->", phoneC);
                        return phoneC;
                    }
                }
            }

            // Caminho D: Header Fallback
            const header = document.querySelector('header');
            if (header) {
                const headerDataId = header.closest('[data-id]')?.getAttribute('data-id')
                    || header.querySelector('[data-id]')?.getAttribute('data-id');

                if (headerDataId) {
                    const phoneD = headerDataId.split('@')[0].replace(/\D/g, '');
                    if (this._isValidPhone(phoneD)) {
                        console.log("Manos CRM: [CAMINHO D] Sucesso ->", phoneD);
                        return phoneD;
                    }
                }
            }

            // Caminho E: Brute Force (Busca em qualquer elemento com JID)
            console.log("Manos CRM: [DEBUG] Acionando Brute Force (Caminho E)...");
            const allWithJid = document.querySelectorAll('[data-id*="@c.us"], [data-id*="@s.whatsapp.net"]');
            for (let el of allWithJid) {
                const jid = el.getAttribute('data-id');
                if (jid && !jid.includes('-')) { // Ignora grupos
                    const phoneE = jid.split('@')[0].replace(/\D/g, '');
                    if (this._isValidPhone(phoneE)) {
                        // Se estiver no #main ou no chat selecionado, é quase certeza
                        if (el.closest('#main') || el.closest('div[aria-selected="true"]') || el.closest('#pane-side')) {
                            console.log("Manos CRM: [CAMINHO E] Sucesso via Brute Force ->", phoneE);
                            return phoneE;
                        }
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

            // Remove caracteres de controle invisíveis
            let cleanText = text.trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

            // ID único simples baseado no texto e posição para evitar duplicações no Set
            return {
                text: cleanText,
                direction: isOut ? 'outbound' : 'inbound',
                timestamp: new Date().toISOString(), // Fallback
                _rawId: cleanText + (isOut ? 'O' : 'I')
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
