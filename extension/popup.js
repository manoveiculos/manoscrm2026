// Manos CRM v2.3.0 popup — token + identificação do consultor
const $ = (id) => document.getElementById(id);
const tokenEl = $('crm-token');
const emailEl = $('crm-consultant-email');
const nameEl = $('crm-consultant-name');
const statusEl = $('status-msg');
const saveBtn = $('save-btn');

function showStatus(msg, color) {
    statusEl.style.display = 'block';
    statusEl.style.color = color || '#4ade80';
    statusEl.textContent = msg;
}

saveBtn.onclick = () => {
    const token = (tokenEl.value || '').trim();
    const email = emailEl ? (emailEl.value || '').trim() : '';
    const name = nameEl ? (nameEl.value || '').trim() : '';

    if (!token) {
        showStatus('⚠️ Token é obrigatório.', '#f87171');
        return;
    }
    if (!email && !name) {
        showStatus('⚠️ Preencha email ou nome (heartbeat depende disso).', '#fbbf24');
        return;
    }

    chrome.storage.local.set(
        { crmToken: token, crmConsultantEmail: email, crmConsultantName: name },
        () => {
            showStatus('✅ Salvo. Recarregue o WhatsApp Web.', '#4ade80');
            setTimeout(() => {
                statusEl.style.display = 'none';
                window.close();
            }, 2200);
        }
    );
};

// Pré-popula campos ao abrir
chrome.storage.local.get(['crmToken', 'crmConsultantEmail', 'crmConsultantName'], (r) => {
    if (r.crmToken) tokenEl.value = r.crmToken;
    if (r.crmConsultantEmail && emailEl) emailEl.value = r.crmConsultantEmail;
    if (r.crmConsultantName && nameEl) nameEl.value = r.crmConsultantName;

    const ident = r.crmConsultantName || r.crmConsultantEmail;
    if (r.crmToken && ident) {
        showStatus(`✅ Conectado como ${ident}`, '#4ade80');
    } else if (r.crmToken && !ident) {
        showStatus('⚠️ Falta identificar o consultor (tracking ao vivo off).', '#fbbf24');
    } else {
        showStatus('🔧 Preencha pra começar.', '#94a3b8');
    }
});
