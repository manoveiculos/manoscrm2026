/**
 * Manos CRM v2 - DOM Scraper
 * Baseado no v1 funcional. Usa data-id @c.us para extrair telefone.
 */
const Scraper = {
    _isValid(p) { if(!p) return false; const c=p.replace(/\D/g,''); return c.length>=8&&c.length<=15; },
    _norm(p) { if(!p) return null; let c=p.replace(/\D/g,''); if((c.length===10||c.length===11)&&!c.startsWith('55')) c='55'+c; return c; },

    getPhone() {
        try {
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

            // 2. Contact info drawer (Agressivo se aberto)
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

    extractMessages() {
        const msgs = [];
        document.querySelectorAll('.message-in,.message-out,[data-testid="msg-container"],div[data-id^="true_"],div[data-id^="false_"]').forEach(n => {
            try {
                const did = n.getAttribute('data-id')||'';
                if(did&&!did.includes('_')) return;
                const isOut = n.classList.contains('message-out')||n.closest('.message-out')||(did&&did.startsWith('true_'));
                let txt=''; const tn=n.querySelector('.selectable-text,span.copyable-text');
                if(tn) txt=tn.innerText||'';
                else { const ps=[]; n.querySelectorAll('span').forEach(s=>{const t=s.innerText?.trim();if(t&&t.length>0&&!/^\d{1,2}:\d{2}/.test(t))ps.push(t);}); txt=ps.join(' '); }
                if(!txt?.trim()){const l=n.querySelector('[aria-label]');if(l)txt=`[Mídia: ${l.getAttribute('aria-label')}]`;}
                txt=txt?.trim();
                if(txt&&txt.length>0) msgs.push({text:txt.replace(/[\u0000-\u001F]/g,'').replace(/\s+/g,' '),direction:isOut?'outbound':'inbound',timestamp:new Date().toISOString(),_rawId:`${txt}|${isOut?'O':'I'}`});
            } catch(e){}
        });
        if(!msgs.length){const m=document.querySelector('#main');if(m)m.querySelectorAll('span.copyable-text,.selectable-text span').forEach(s=>{const t=s.innerText?.trim();if(t&&t.length>2)msgs.push({text:t,direction:'inbound',timestamp:new Date().toISOString(),_rawId:`${t}|I`});});}
        return msgs;
    },

    async getFullMessages(maxScrolls=25) {
        const map=new Map();
        const sc=document.querySelector('#main .copyable-area')?.parentElement||document.querySelector('[data-testid="conversation-panel-messages"]')?.closest('div[tabindex]')||Array.from(document.querySelectorAll('#main div')).find(el=>{const s=getComputedStyle(el);return s.overflowY==='scroll'||s.overflowY==='auto';});
        if(!sc) return this.extractMessages();
        const merge=()=>this.extractMessages().forEach(m=>map.set(m._rawId,m));
        merge(); let lh=sc.scrollHeight;
        for(let i=0;i<maxScrolls;i++){sc.scrollTop=0;await new Promise(r=>setTimeout(r,1200));merge();const nh=sc.scrollHeight;if(nh===lh)break;lh=nh;}
        sc.scrollTop=sc.scrollHeight;
        const f=this.extractMessages();
        return f.length>map.size?f:Array.from(map.values()).map(m=>{delete m._rawId;return m;});
    }
};
