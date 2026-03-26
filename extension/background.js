/**
 * Manos CRM v2.1 - Background Service Worker
 * Handles: API proxying, chrome.alarms for new-leads polling, tab management
 */

chrome.runtime.onInstalled.addListener(() => {
    console.log("Manos CRM v2.1 Ready!");
    chrome.alarms.create('poll-new-leads', { periodInMinutes: 1 });
});

// Restart alarm after service worker wakeup
chrome.alarms.create('poll-new-leads', { periodInMinutes: 1 });

// ─── Alarm: Poll new leads every 60s ──────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'poll-new-leads') return;
    const { crmToken } = await chrome.storage.local.get(['crmToken']);

    const url = 'https://manoscrm.com.br/api/extension/kanban';
    const headers = crmToken ? { 'Authorization': `Bearer ${crmToken}` } : {};

    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        // Count received/new leads (pending first contact)
        const kanban = data.kanban || {};
        const count = (kanban['received'] || []).length + (kanban['new'] || []).length;
        const leads = [...(kanban['received'] || []), ...(kanban['new'] || [])];

        // Store and notify all WhatsApp tabs
        await chrome.storage.local.set({ pendingLeadsCount: count, pendingLeads: leads });
        const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { type: 'PENDING_LEADS_UPDATE', count, leads }).catch(() => {});
        }
    } catch (e) {
        console.warn("Manos CRM poll error:", e.message);
    }
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
                if (!res.ok) {
                    let err = `HTTP ${res.status}`;
                    try { const j = await res.json(); err = j.error || j.message || err; } catch (_) {}
                    return sendResponse({ success: false, error: err });
                }
                const data = await res.json();
                sendResponse({ success: true, data });
            })
            .catch(e => {
                clearTimeout(t);
                console.error("Fetch background error:", e);
                sendResponse({ success: false, error: e.name === 'AbortError' ? 'Timeout' : e.message });
            });
        return true; 
    }

    // --- Open new tab for creating a lead in the CRM ---
    if (request.type === 'OPEN_CRM_CREATE') {
        chrome.tabs.create({ url: `https://manoscrm.com.br/v2/leads?create=${request.phone}` });
        sendResponse({ success: true });
        return false;
    }

    // --- Force poll immediately ---
    if (request.type === 'POLL_NOW') {
        chrome.alarms.get('poll-new-leads', (alarm) => {
            if (!alarm) chrome.alarms.create('poll-new-leads', { periodInMinutes: 1 });
            sendResponse({ success: true });
        });
        return true;
    }

    return false;
});
