/**
 * Manos CRM - DOM Scraper
 */

export const Scraper = {
    VERSION: "2.9.STABLE",

    _isValidPhone(phone) {
        if (!phone) return false;
        const clean = phone.replace(/\D/g, '');
        if (clean.length > 15) return false; 
        if (clean.length < 8) return false; 
        return true;
    },

    _normalizePhone(phone) {
        if (!phone) return null;
        let clean = phone.replace(/\D/g, '');
        // Se for número brasileiro sem o 55 (10 ou 11 dígitos), adiciona o 55
        if (clean.length === 10 || clean.length === 11) {
            if (!clean.startsWith('55')) {
                clean = '55' + clean;
            }
        }
        return clean;
    },


    getPhone() {
        try {
            console.log(`Manos CRM: [DEBUG] Iniciando getPhone v${this.VERSION} Agressivo...`);

            // FUNÇÃO HELPER: Extrair de data-id de forma segura
            const findFromDataId = (selector) => {
                const el = document.querySelector(selector);
                const id = el?.getAttribute('data-id') || el?.closest('[data-id]')?.getAttribute('data-id');
                if (id && (id.includes('@c.us') || id.includes('@s.whatsapp.net'))) {
                    const phone = id.split('@')[0].split('_').pop().replace(/\D/g, '');
                    if (this._isValidPhone(phone)) return this._normalizePhone(phone);
                }
                return null;
            };

            // 1. Header do Chat (Prioridade Máxima)
            const phoneFromHeader = findFromDataId('#main header') 
                || findFromDataId('[data-testid="conversation-panel-wrapper"] [data-id]')
                || findFromDataId('[data-testid="chat-header"]');
            
            if (phoneFromHeader) {
                console.log("Manos CRM: [REFINADO] Telefone via Header Data-ID ->", phoneFromHeader);
                return phoneFromHeader;
            }

            // 2. Título do Header (Regex Agressiva)
            const mainHeader = document.querySelector('#main header');
            if (mainHeader) {
                const text = mainHeader.innerText || "";
                const matches = text.match(/\+?\d[\d\s\-\(\)]{8,15}\d/g);
                if (matches) {
                    for (let m of matches) {
                        const clean = m.replace(/\D/g, '');
                        if (this._isValidPhone(clean)) {
                            console.log("Manos CRM: [REFINADO] Telefone via Regex Header ->", clean);
                            return this._normalizePhone(clean);
                        }
                    }
                }
            }

            // 3. Item Selecionado no Pane Side
            const selectedPhone = findFromDataId('#pane-side [aria-selected="true"]')
                || findFromDataId('#pane-side [data-testid="list-item"][aria-selected="true"]');
            
            if (selectedPhone) {
                console.log("Manos CRM: [REFINADO] Telefone via Pane Side ->", selectedPhone);
                return selectedPhone;
            }

            // 4. Elemento de "Informações do Contato" se estiver aberto
            const drawerDetails = findFromDataId('[data-testid="contact-info-drawer"]')
                || findFromDataId('section[role="region"]');
            if (drawerDetails) return drawerDetails;

            // 5. Brute Force em todos os spans do header
            if (mainHeader) {
                const spans = mainHeader.querySelectorAll('span, div');
                for (let s of spans) {
                    const t = s.innerText.replace(/\D/g, '');
                    if (t.length >= 10 && t.length <= 13 && this._isValidPhone(t)) {
                        return this._normalizePhone(t);
                    }
                }
            }

            console.error(`Manos CRM: [DETECTOR v${this.VERSION}] NENHUM TELEFONE IDENTIFICADO.`);

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

    /**
     * Extrai as mensagens visíveis com extrema robustez
     */
    extractMessagesData() {
        console.log("Manos CRM Scraper: Iniciando extração de mensagens...");
        const messages = [];
        
        // Estratégia de Precisão: Seletores específicos de mensagens do WA Web
        const msgNodes = document.querySelectorAll('.message-in, .message-out, [data-testid="msg-container"], div[data-id^="true_"], div[data-id^="false_"]');
        
        console.log(`Manos CRM Scraper: Encontrados ${msgNodes.length} nós de mensagem.`);

        msgNodes.forEach(node => {
            try {
                const dataId = node.getAttribute('data-id') || "";
                if (dataId && !dataId.includes('_')) return;

                const isOut = node.classList.contains('message-out') || 
                             node.closest('.message-out') !== null ||
                             (dataId && dataId.startsWith('true_'));

                let text = "";
                const textNode = node.querySelector('.selectable-text, span.copyable-text');
                
                if (textNode) {
                    text = textNode.innerText || textNode.textContent || "";
                } else {
                    const spans = node.querySelectorAll('span');
                    const textParts = [];
                    spans.forEach(s => {
                        const t = s.innerText?.trim();
                        // Ignora se for o horário (ex: 10:15)
                        if (t && t.length > 0 && !t.match(/^\d{1,2}:\d{2}(\s?[APap][Mm])?$/)) {
                            textParts.push(t);
                        }
                    });
                    text = textParts.join(" ");
                }

                if (!text || text.trim() === '') {
                    const labelElem = node.querySelector('[aria-label]');
                    if (labelElem) text = `[Mídia: ${labelElem.getAttribute('aria-label')}]`;
                }

                text = text?.trim();

                if (text && text.length > 0) {
                    const cleanText = text
                        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
                        .replace(/\s+/g, " ");
                        
                    console.log(`Manos CRM Scraper: Mensagem extraída: [${isOut ? 'OUT' : 'IN'}] ${cleanText.substring(0, 30)}...`);

                    messages.push({
                        text: cleanText,
                        direction: isOut ? 'outbound' : 'inbound',
                        timestamp: new Date().toISOString(),
                        _rawId: `${cleanText}|${isOut ? 'O' : 'I'}`
                    });
                }
            } catch (e) {
                console.error("Manos CRM Scraper: Erro ao processar nó de mensagem", e);
            }
        });

        if (messages.length === 0) {
            console.warn("Manos CRM Scraper: Nenhuma mensagem estruturada encontrada. Tentando Brute Force...");
            const chatMain = document.querySelector('#main');
            if (chatMain) {
                const spans = chatMain.querySelectorAll('span.copyable-text, .selectable-text span');
                spans.forEach(span => {
                    const text = span.innerText?.trim();
                    if (text && text.length > 2) {
                        messages.push({
                            text: text,
                            direction: 'inbound',
                            timestamp: new Date().toISOString(),
                            _rawId: `${text}|I`
                        });
                    }
                });
            }
        }

        return messages;
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
            await new Promise(r => setTimeout(r, 1200)); // 1200ms para garantir carregamento

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
