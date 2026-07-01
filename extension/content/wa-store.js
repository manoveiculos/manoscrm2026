/**
 * Manos CRM — WA Store Bridge (roda no MAIN world, contexto da página).
 *
 * Por quê: a partir de 2025 o WhatsApp Web parou de colocar o telefone no DOM
 * das mensagens (data-id agora é só o ID da msg, sem `<phone>@c.us`). Pra
 * contato SALVO o número some completamente do DOM. A única fonte confiável é
 * o Store interno do WhatsApp (modelo do chat ativo → telefone do contato).
 *
 * Comunicação com o content script (isolated world) via window.postMessage:
 *   pedido:    { __manos:'getPhone', reqId }
 *   resposta:  { __manos:'phoneResult', reqId, phone, debug }
 *
 * Não acessa chrome.* (não precisa) e não mexe na tela.
 */
(function () {
    if (window.__manosWAStore) return;
    window.__manosWAStore = { store: null, triedLoad: false };

    function findStore() {
        const ctx = window.__manosWAStore;
        if (ctx.store) return ctx.store;
        try {
            const chunkKey = Object.keys(window).find(k => k.startsWith('webpackChunk'));
            if (!chunkKey) return null;
            const chunk = window[chunkKey];
            if (!chunk || typeof chunk.push !== 'function') return null;

            const found = {};
            const id = 'manos_' + Date.now();
            chunk.push([[id], {}, (require) => {
                for (const moduleId of Object.keys(require.m || {})) {
                    let mod;
                    try { mod = require(moduleId); } catch (e) { continue; }
                    if (!mod) continue;
                    const cand = mod.default || mod;
                    if (!cand || typeof cand !== 'object') continue;
                    if (cand.Chat && cand.Msg && !found.Chat) { found.Chat = cand.Chat; found.Msg = cand.Msg; }
                    if (cand.Contact && !found.Contact) found.Contact = cand.Contact;
                    if (cand.WidFactory && !found.WidFactory) found.WidFactory = cand.WidFactory;
                    // alguns builds expõem Chat isolado
                    if (cand.Chat && cand.Chat.getModelsArray && !found.Chat) found.Chat = cand.Chat;
                }
            }]);
            ctx.store = (found.Chat) ? found : null;
            return ctx.store;
        } catch (e) {
            console.warn('[ManosWA] findStore erro:', e);
            return null;
        }
    }

    function digitsOnly(s) { return (s == null ? '' : String(s)).replace(/\D/g, ''); }

    function activeChat(store) {
        const C = store.Chat;
        try {
            if (typeof C.getActive === 'function') { const a = C.getActive(); if (a) return a; }
        } catch (e) {}
        try {
            const arr = (typeof C.getModelsArray === 'function') ? C.getModelsArray() : (C.models || C._models || []);
            return arr.find(c => c && (c.active === true)) || null;
        } catch (e) { return null; }
    }

    function phoneFromChat(chat) {
        const out = { phone: null, debug: {} };
        if (!chat) { out.debug.reason = 'no_active_chat'; return out; }
        try {
            out.debug.isGroup = !!(chat.isGroup || (chat.id && chat.id.server === 'g.us'));
            if (out.debug.isGroup) { out.debug.reason = 'group'; return out; }

            const tryWids = [];
            if (chat.id) tryWids.push(chat.id);
            if (chat.contact && chat.contact.id) tryWids.push(chat.contact.id);
            // alguns modelos guardam o número canônico em campos diferentes:
            if (chat.contact && chat.contact.phoneNumber) tryWids.push(chat.contact.phoneNumber);

            out.debug.wids = tryWids.map(w => (w && (w._serialized || w.user || String(w))) || null);

            for (const w of tryWids) {
                if (!w) continue;
                const server = w.server || (w._serialized ? w._serialized.split('@')[1] : '');
                const user = w.user || (w._serialized ? w._serialized.split('@')[0] : '');
                const d = digitsOnly(user);
                // @c.us → telefone direto. @lid → 'user' é opaco (não é telefone), pula.
                if (server === 'c.us' && d.length >= 8 && d.length <= 15) { out.phone = d; return out; }
                if (!server && d.length >= 10 && d.length <= 15) { out.phone = d; return out; }
            }

            // @lid: o telefone real costuma estar no contato. Tenta campos conhecidos.
            const ct = chat.contact || {};
            const guesses = [
                ct.userid, ct.phoneNumber && ct.phoneNumber.user,
                ct.id && ct.id.user, ct.notifyName, ct.verifiedName
            ];
            for (const g of guesses) {
                const d = digitsOnly(g);
                if (d.length >= 10 && d.length <= 15) { out.phone = d; return out; }
            }

            // Sem sucesso → devolve estrutura pra diagnóstico (1 iteração e acerto o campo).
            out.debug.reason = 'phone_field_not_found';
            out.debug.chatKeys = Object.keys(chat).slice(0, 40);
            out.debug.idObj = chat.id ? { ...chat.id } : null;
            out.debug.contactKeys = chat.contact ? Object.keys(chat.contact).slice(0, 40) : null;
        } catch (e) {
            out.debug.reason = 'exception';
            out.debug.error = String(e);
        }
        return out;
    }

    function getActivePhone() {
        const store = findStore();
        if (!store) return { phone: null, debug: { reason: 'store_not_found' } };
        return phoneFromChat(activeChat(store));
    }

    window.addEventListener('message', (ev) => {
        if (ev.source !== window || !ev.data || ev.data.__manos !== 'getPhone') return;
        let res;
        try { res = getActivePhone(); } catch (e) { res = { phone: null, debug: { reason: 'fatal', error: String(e) } }; }
        window.postMessage({ __manos: 'phoneResult', reqId: ev.data.reqId, phone: res.phone, debug: res.debug }, '*');
    });

    // Ferramenta manual de inspeção: rode window.__manosDebugChat() no console.
    window.__manosDebugChat = () => { const r = getActivePhone(); console.log('[ManosWA] debug:', r); return r; };

    console.log('[ManosWA] Store bridge pronto (main world).');
})();
