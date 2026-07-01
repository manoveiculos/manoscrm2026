/**
 * Manos CRM v2 - DOM Scraper
 * Baseado no v1 funcional. Usa data-id @c.us para extrair telefone.
 */
const Scraper = {
    _isValid(p) { if(!p) return false; const c=p.replace(/\D/g,''); return c.length>=8&&c.length<=15; },
    _norm(p) { if(!p) return null; let c=p.replace(/\D/g,''); if((c.length===10||c.length===11)&&!c.startsWith('55')) c='55'+c; return c; },

    getPhone() {
        try {
            // 0. CANÔNICO (não-intrusivo): JID @c.us / @s.whatsapp.net no data-id das
            //    mensagens. Funciona p/ contato SALVO e NÃO-salvo sempre que houver
            //    conversa — sem depender do header (que esconde o número atrás do
            //    nome salvo) e SEM abrir nenhum painel.
            for (const n of document.querySelectorAll('#main [data-id^="true_"], #main [data-id^="false_"]')) {
                const id = n.getAttribute('data-id') || '';
                const at = id.includes('@c.us') ? '@c.us' : (id.includes('@s.whatsapp.net') ? '@s.whatsapp.net' : null);
                if (at) {
                    const ph = id.split(at)[0].split('_').pop().replace(/\D/g, '');
                    if (this._isValid(ph)) return this._norm(ph);
                }
            }

            const fromDataId = (sel) => {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    const d = el?.closest('[data-id]') || el?.querySelector('[data-id]') || el;
                    const id = d?.getAttribute?.('data-id');
                    if (id && (id.includes('@c.us') || id.includes('@s.whatsapp.net'))) {
                        const ph = id.split('@')[0].split('_').pop().replace(/\D/g, '');
                        if (this._isValid(ph)) return this._norm(ph);
                    }
                }
                return null;
            };

            // 1. Header (Mais rápido e comum)
            let r = fromDataId('#main header') || fromDataId('[data-testid="conversation-panel-wrapper"] [data-id]') || fromDataId('[data-testid="chat-header"]');
            if (r) return r;

            // 2. Contact info drawer (Agressivo se aberto) — só LÊ se já estiver aberto.
            const drawer = document.querySelector('[data-testid="contact-info-drawer"]') || document.querySelector('section[role="region"]');
            if (drawer) {
                // Tenta extrair do data-id do drawer
                r = fromDataId('[data-testid="contact-info-drawer"] [data-id]');
                if (r) return r;

                // Scan por texto que pareça telefone dentro do drawer
                const textElements = drawer.querySelectorAll('span, div');
                for (const el of textElements) {
                    const txt = el.innerText || '';
                    if (txt.includes('+') || (txt.replace(/\D/g, '').length >= 10)) {
                        const clean = txt.replace(/\D/g, '');
                        if (this._isValid(clean)) return this._norm(clean);
                    }
                }
            }

            // 3. Pane side selected
            r = fromDataId('#pane-side [aria-selected="true"]') || fromDataId('#pane-side [data-testid="list-item"][aria-selected="true"]');
            if (r) return r;

            // 4. Header text regex (Fallback)
            const hdr = document.querySelector('#main header');
            if (hdr) {
                const m = (hdr.innerText||'').match(/\+?\d[\d\s\-\(\)]{10,15}\d/g);
                if (m) for (const x of m) { const c=x.replace(/\D/g,''); if(this._isValid(c)) return this._norm(c); }
            }

            // 5. Brute force header spans
            if (hdr) {
                for (const s of hdr.querySelectorAll('span,div')) {
                    const t=(s.innerText||'').replace(/\D/g,'');
                    if(t.length>=10 && t.length<=14 && this._isValid(t)) return this._norm(t);
                }
            }

            // 6. Global scan #main data-id (Último recurso)
            const main = document.querySelector('#main');
            if (main) {
                r = fromDataId('#main [data-id]');
                if (r) return r;
            }
        } catch(e) { console.error("Scraper error",e); }
        return null;
    },

    // Fallback para CONTATO SALVO (o DOM novo do WhatsApp não expõe mais o número):
    // pede o telefone do chat ativo ao bridge no main world (wa-store.js), que lê
    // do Store interno do WhatsApp. Não abre painel, não clica em nada.
    getPhoneFromStore(timeoutMs = 1800) {
        return new Promise((resolve) => {
            let done = false;
            const reqId = 'p' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const handler = (ev) => {
                if (ev.source !== window || !ev.data || ev.data.__manos !== 'phoneResult' || ev.data.reqId !== reqId) return;
                done = true;
                window.removeEventListener('message', handler);
                // 'store_not_found' é esperado nessa versão do WhatsApp (cai pro painel) —
                // não polui o console. Loga só motivos inesperados (útil p/ futuro).
                if (ev.data.debug && !ev.data.phone && ev.data.debug.reason && ev.data.debug.reason !== 'store_not_found') {
                    console.log('[Manos] Store sem telefone:', ev.data.debug);
                }
                const ph = ev.data.phone ? this._norm(String(ev.data.phone)) : null;
                resolve(this._isValid(ph) ? ph : null);
            };
            window.addEventListener('message', handler);
            window.postMessage({ __manos: 'getPhone', reqId }, '*');
            setTimeout(() => {
                if (done) return;
                window.removeEventListener('message', handler);
                resolve(null);
            }, timeoutMs);
        });
    },

    // ── Painel "Dados do contato": fonte do número p/ contato SALVO ──────────
    // O WhatsApp novo tirou o telefone do DOM das mensagens; o número só aparece
    // no painel de contato. Abrimos, lemos e FECHAMOS no X — NUNCA Escape (Escape
    // fecha a conversa inteira).

    // Procura um texto que seja SÓ um telefone com '+' (DDI). O '+' evita pegar
    // horário/contador; "ser o texto inteiro" evita pegar número no meio de msg.
    _scanPhoneFromText(root) {
        if (!root) return null;
        for (const el of root.querySelectorAll('span, div')) {
            const t = (el.innerText || '').trim();
            if (/^\+\d[\d\s().\-]{8,17}$/.test(t)) {
                const c = t.replace(/\D/g, '');
                if (this._isValid(c)) return this._norm(c);
            }
        }
        return null;
    },

    _closeContactPanel() {
        // Fecha pelo X do painel. Se não achar o X, DEIXA ABERTO (nunca Escape).
        const sels = [
            '[data-testid="btn-close-drawer"]',
            'header [data-icon="x"]',
            'span[data-icon="x"]',
            'div[aria-label="Fechar"]',
            'button[aria-label="Fechar"]',
            'div[aria-label="Close"]'
        ];
        for (const s of sels) {
            const el = document.querySelector(s);
            if (el) { (el.closest('div[role="button"]') || el).click(); return true; }
        }
        return false;
    },

    async getPhoneFromPanel(timeoutMs = 2500) {
        let opened = false;
        try {
            // Já aberto? lê direto.
            let scope = document.querySelector('[data-testid="contact-info-drawer"]') || document.querySelector('section');
            let p = scope ? this._scanPhoneFromText(scope) : null;
            if (p) return p;

            const hdr = document.querySelector('#main header');
            if (!hdr) return null;

            // Clica no título/avatar do cabeçalho (abre "Dados do contato").
            const titleEl = hdr.querySelector('span[title]') || hdr.querySelector('img');
            const opener = titleEl?.closest('div[role="button"]')
                || titleEl?.closest('[tabindex]')
                || titleEl?.parentElement
                || hdr.querySelector('div[role="button"]');
            if (!opener) return null;
            opener.click();
            opened = true;

            const start = Date.now();
            while (Date.now() - start < timeoutMs && !p) {
                await new Promise(r => setTimeout(r, 150));
                scope = document.querySelector('[data-testid="contact-info-drawer"]') || document.querySelector('section') || document.body;
                p = this._scanPhoneFromText(scope);
            }
            return p;
        } catch (e) {
            console.error('getPhoneFromPanel', e);
            return null;
        } finally {
            if (opened) this._closeContactPanel();   // restaura a tela (X, não Escape)
        }
    },

    getName() {
        try {
            // Textos que indicam elemento errado (tooltip, subtítulo, status)
            const BAD = [
                'clique para mostrar', 'click to see', 'conta comercial',
                'business account', 'online', 'digitando', 'typing',
                'gravando', 'recording', 'visto por último', 'last seen',
                'ausente', 'away'
            ];
            const clean = (txt) => {
                if (!txt) return '';
                txt = txt.trim();
                // Descarta strings que contenham termos ruins
                if (BAD.some(b => txt.toLowerCase().includes(b))) return '';
                // Descarta se for só número (telefone)
                if (/^\+?[\d\s\-\(\)]{8,}$/.test(txt)) return '';
                // Descarta strings muito longas (provavelmente não é nome)
                if (txt.length > 60) return '';
                return txt;
            };

            const hdr = document.querySelector('#main header');

            // 1. data-testid específico do título
            const byTestId = hdr?.querySelector('[data-testid="conversation-info-header-chat-title"]');
            if (byTestId) {
                const txt = clean(byTestId.getAttribute('title') || byTestId.innerText);
                if (txt) return txt;
            }

            // 2. Primeiro span[title] dentro do header que tenha valor de nome
            if (hdr) {
                for (const span of hdr.querySelectorAll('span[title]')) {
                    const txt = clean(span.getAttribute('title'));
                    if (txt && txt.length >= 2) return txt;
                }
            }

            // 3. span[dir="auto"] dentro do botão de cabeçalho (nome clicável)
            if (hdr) {
                const btn = hdr.querySelector('div[role="button"]') || hdr.querySelector('[tabindex]');
                if (btn) {
                    for (const span of btn.querySelectorAll('span[dir="auto"], span')) {
                        const txt = clean(span.innerText);
                        if (txt && txt.length >= 2) return txt;
                    }
                }
            }

            // 4. Chat selecionado na lista lateral (nome exibido no painel)
            const selected =
                document.querySelector('#pane-side [aria-selected="true"]') ||
                document.querySelector('#pane-side [data-testid="list-item"][aria-selected="true"]');
            if (selected) {
                const nameEl =
                    selected.querySelector('[data-testid="cell-frame-title"] span') ||
                    selected.querySelector('span[title]') ||
                    selected.querySelector('span[dir="auto"]');
                if (nameEl) {
                    const txt = clean(nameEl.getAttribute('title') || nameEl.innerText);
                    if (txt) return txt;
                }
            }

            // 5. Fallback: innerText do header sem spans problemáticos
            if (hdr) {
                const firstLine = (hdr.innerText || '').split('\n')[0];
                const txt = clean(firstLine);
                if (txt && txt.length >= 2) return txt;
            }
        } catch(e) {}
        return '';
    },

    extractTimestamp(msgElement) {
        try {
            const copyable = msgElement.querySelector('.copyable-text') || (msgElement.classList?.contains('copyable-text') ? msgElement : null);
            if (copyable) {
                const preText = copyable.getAttribute('data-pre-plain-text');
                if (preText) {
                    // Aceita ano 2 ou 4 dígitos (WA varia: 27/05/2026 ou 27/05/26)
                    const match = preText.match(/\[(\d{1,2}):(\d{2})(?:\s*(AM|PM))?,\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})\]/i);
                    if (match) {
                        let [_, hourStr, minuteStr, ampm, part1Str, part2Str, yearStr] = match;
                        let hour = parseInt(hourStr, 10);
                        const minute = parseInt(minuteStr, 10);
                        let year = parseInt(yearStr, 10);
                        if (year < 100) year += 2000;
                        const part1 = parseInt(part1Str, 10);
                        const part2 = parseInt(part2Str, 10);

                        if (ampm) {
                            ampm = ampm.toUpperCase();
                            if (ampm === 'PM' && hour < 12) hour += 12;
                            if (ampm === 'AM' && hour === 12) hour = 0;
                        }

                        // Padrão brasileiro DD/MM, mas tolera US (MM/DD) se part1>12
                        let day = part1;
                        let month = part2;
                        if (part1 > 12 && part2 <= 12) { day = part1; month = part2; }
                        else if (part2 > 12 && part1 <= 12) { day = part2; month = part1; }

                        const date = new Date(year, month - 1, day, hour, minute);
                        if (!isNaN(date.getTime())) {
                            return date.toISOString();
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Erro ao extrair timestamp:", e);
        }
        return null;
    },

    extractMessages() {
        // V3.80.2: dedup HARD por data-id. Seletor único focado em containers reais
        // (data-id = "true_<jid>_<msgId>" outbound | "false_<jid>_<msgId>" inbound).
        // Antes combinava .message-in/.message-out/[data-testid="msg-container"] +
        // div[data-id^=...] → mesmo nó capturado N vezes via closest/querySelector.
        // Gerava 2-3 duplicatas por msg.
        const msgs = new Map();

        document.querySelectorAll('[data-id^="true_"], [data-id^="false_"]').forEach(n => {
            try {
                const did = n.getAttribute('data-id');
                if (!did || !did.includes('_')) return;
                if (msgs.has(did)) return;

                const isOut = did.startsWith('true_');

                let txt = '';
                const tn = n.querySelector('.selectable-text, span.copyable-text');
                if (tn) txt = tn.innerText || '';
                else {
                    const ps = [];
                    n.querySelectorAll('span').forEach(s => {
                        const t = s.innerText?.trim();
                        if (t && t.length > 0 && !/^\d{1,2}:\d{2}/.test(t)) ps.push(t);
                    });
                    txt = ps.join(' ');
                }
                if (!txt?.trim()) {
                    const l = n.querySelector('[aria-label]');
                    if (l) txt = `[Mídia: ${l.getAttribute('aria-label')}]`;
                }
                txt = txt?.trim();
                if (!txt || txt.length === 0) return;

                msgs.set(did, {
                    id: did,
                    text: txt.replace(/[ -]/g, '').replace(/\s+/g, ' '),
                    direction: isOut ? 'outbound' : 'inbound',
                    timestamp: this.extractTimestamp(n) || new Date().toISOString(),
                });
            } catch (e) { /* ignora msg corrompida */ }
        });

        // Fallback emergencial: nenhum data-id encontrado (DOM legacy ou bug WA)
        if (msgs.size === 0) {
            const main = document.querySelector('#main');
            if (main) {
                let synth = 0;
                main.querySelectorAll('span.copyable-text, .selectable-text span').forEach(s => {
                    const t = s.innerText?.trim();
                    if (t && t.length > 2) {
                        msgs.set(`fallback_${synth++}_${t.slice(0, 24)}`, {
                            id: null,
                            text: t,
                            direction: 'inbound',
                            timestamp: new Date().toISOString(),
                        });
                    }
                });
            }
        }

        // Ordenação cronológica ASC — IA precisa contexto na ordem certa
        return Array.from(msgs.values()).sort((a, b) => {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
    },

    async getFullMessages(maxScrolls = 25) {
        // Map por data-id mantém dedup entre scrolls. No final sort por timestamp.
        // (scroll-up insere msgs antigas DEPOIS no Map → sem sort sairiam fora de ordem).
        const merged = new Map();
        const sc = document.querySelector('#main .copyable-area')?.parentElement
            || document.querySelector('[data-testid="conversation-panel-messages"]')?.closest('div[tabindex]')
            || Array.from(document.querySelectorAll('#main div')).find(el => {
                const s = getComputedStyle(el);
                return s.overflowY === 'scroll' || s.overflowY === 'auto';
            });
        if (!sc) return this.extractMessages();

        const merge = () => this.extractMessages().forEach(m => {
            const key = m.id || `text:${m.direction}:${m.text}`;
            if (!merged.has(key)) merged.set(key, m);
        });

        merge();
        let lh = sc.scrollHeight;
        for (let i = 0; i < maxScrolls; i++) {
            sc.scrollTop = 0;
            await new Promise(r => setTimeout(r, 1200));
            merge();
            const nh = sc.scrollHeight;
            if (nh === lh) break;
            lh = nh;
        }
        sc.scrollTop = sc.scrollHeight;

        return Array.from(merged.values()).sort((a, b) => {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
    }
};
