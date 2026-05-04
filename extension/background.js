/**
 * Manos CRM v2.3.0 - Background Service Worker
 * Handles: API proxying, chrome.alarms for new-leads polling, heartbeat tracking
 */

// Regex para validar UUID
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

chrome.runtime.onInstalled.addListener(() => {
    console.log("Manos CRM v2.3.0 Ready!");
    chrome.alarms.create('poll-new-leads', { periodInMinutes: 1 });
    // Limpar cache antigo de leads ao instalar/atualizar
    chrome.storage.local.remove(['pendingLeads', 'pendingLeadsCount']);
});

// Restart alarm after service worker wakeup
chrome.alarms.create('poll-new-leads', { periodInMinutes: 1 });

// ─── Função de poll reutilizável ─────────────────────
async function pollNewLeads() {
    const { crmToken, consultantId } = await chrome.storage.local.get(['crmToken', 'consultantId']);

    let url = 'https://manoscrm.com.br/api/extension/kanban';
    // Só envia consultantId se for UUID válido (não nome/texto antigo)
    if (consultantId && UUID_RE.test(consultantId)) {
        url += `?consultantId=${consultantId}`;
    }
    const headers = crmToken ? { 'Authorization': `Bearer ${crmToken}` } : {};

    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        // Count received/new/entrada leads (pending first contact)
        const kanban = data.kanban || {};
        const count = (kanban['received'] || []).length + (kanban['novo'] || []).length + (kanban['entrada'] || []).length;
        const leads = [...(kanban['received'] || []), ...(kanban['novo'] || []), ...(kanban['entrada'] || [])];

        // Store and notify all WhatsApp tabs
        await chrome.storage.local.set({ pendingLeadsCount: count, pendingLeads: leads });
        const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { type: 'PENDING_LEADS_UPDATE', count, leads }).catch(() => {});
        }
    } catch (e) {
        console.warn("Manos CRM poll error:", e.message);
    }
}

// ─── Alarm: Poll new leads every 60s ──────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'poll-new-leads') return;
    await pollNewLeads();
});

// ─── Message handler ──────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // --- Proxy API fetch (CORS bypass) ---
    if (request.type === 'FETCH_DATA') {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);

        fetch(request.url, { ...(request.options || {}), signal: ctrl.signal })
            .then(async res => {
                clearTimeout(t);
                
                const contentType = res.headers.get('content-type');
                const isJson = contentType && contentType.includes('application/json');

                if (!res.ok) {
                    let err = `HTTP ${res.status}`;
                    try {
                        if (isJson) {
                            const j = await res.json();
                            err = j.error || j.message || err;
                        } else {
                            const text = await res.text();
                            err = text.slice(0, 100) || err;
                        }
                    } catch (_) {}
                    return sendResponse({ success: false, error: err });
                }

                if (isJson) {
                    const data = await res.json();
                    sendResponse({ success: true, data });
                } else {
                    const text = await res.text();
                    sendResponse({ success: false, error: "Response is not JSON", raw: text.slice(0, 200) });
                }
            })
            .catch(e => {
                clearTimeout(t);
                console.error("[ManosCRM-BG] Fetch error:", {
                    url: request.url,
                    error: e.message,
                    stack: e.stack
                });
                sendResponse({ success: false, error: e.name === 'AbortError' ? 'Timeout (15s)' : e.message });
            });
        return true;
    }

    // --- Open new tab for creating a lead in the CRM ---
    if (request.type === 'OPEN_CRM_CREATE') {
        chrome.tabs.create({ url: `https://manoscrm.com.br/v2/leads?create=${request.phone}` });
        sendResponse({ success: true });
        return false;
    }

    // --- Force poll immediately (não espera 60s) ---
    if (request.type === 'POLL_NOW') {
        pollNewLeads().then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
        return true;
    }

    return false;
});
