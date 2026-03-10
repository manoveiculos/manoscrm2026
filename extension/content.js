
// Manos CRM - Content Script
console.log("Manos CRM Extension Loaded 🚀");

let API_BASE = "http://localhost:3000/api/extension";

// Carregar URL personalizada
chrome.storage.local.get(['crmUrl'], (result) => {
    if (result.crmUrl) {
        API_BASE = result.crmUrl.endsWith('/') ? result.crmUrl + 'api/extension' : result.crmUrl + '/api/extension';
    }
});
let currentLead = null;

// 1. Injetar Sidebar e FAB
function injectUI() {
    if (document.getElementById('manos-crm-sidebar')) return;

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.id = 'manos-crm-sidebar';
    sidebar.innerHTML = `
        <div class="manos-header">
            <div class="manos-header-top">
                <img src="${chrome.runtime.getURL('icons/icon128.png')}" class="manos-logo-img" alt="Logo">
                <div class="manos-minimize" id="manos-minimize-btn" title="Minimizar">✕</div>
            </div>
            <div class="manos-logo">MANOS <span>CRM</span></div>
        </div>
        <div class="manos-content" id="manos-sidebar-content">
            <div style="text-align:center; padding: 40px 20px; color: rgba(255,255,255,0.4)">
                Selecione um chat para ver informações do CRM.
            </div>
        </div>
    `;
    document.body.appendChild(sidebar);

    document.getElementById('manos-minimize-btn').onclick = () => {
        sidebar.classList.remove('active');
    };

    // FAB (Floating Action Button)
    const fab = document.createElement('div');
    fab.id = 'manos-crm-fab';
    fab.innerText = 'M';
    fab.onclick = () => {
        sidebar.classList.toggle('active');
    };
    document.body.appendChild(fab);
}

// 2. Detectar Número do Chat Ativo
function getActiveChatPhone() {
    // Tenta pegar da URL se for link de direta
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('phone')) return urlParams.get('phone');

    // Tenta pegar do cabeçalho do chat (estratégia DOM)
    // No WA Web moderno, o título do chat ou o 'copyable-text' pode conter o número
    const chatTitleElem = document.querySelector('header span[title]');
    if (chatTitleElem) {
        const title = chatTitleElem.getAttribute('title');
        const phoneMatch = title.replace(/\D/g, '');
        if (phoneMatch.length >= 10) return phoneMatch;
    }

    return null;
}

// 3. Buscar Dados do CRM
async function fetchLeadInfo(phone) {
    try {
        const res = await fetch(`${API_BASE}/lead-info?phone=${phone}`);
        const data = await res.json();
        if (data.success) {
            currentLead = data.lead;
            renderLeadInfo(data.lead);
        } else {
            currentLead = null;
            renderNotFound();
        }
    } catch (err) {
        console.error("Erro CRM:", err);
    }
}

// 4. Renderizar Sidebar
function renderLeadInfo(lead) {
    const content = document.getElementById('manos-sidebar-content');
    content.innerHTML = `
        <div class="lead-card">
            <div class="lead-name">${lead.name}</div>
            <div class="lead-status-badge">${lead.status}</div>
            
            <div class="info-item">
                <div class="info-label">Interesse</div>
                <div class="info-value">${lead.vehicle || 'Não informado'}</div>
            </div>

            <div class="info-item">
                <div class="info-label">Classificação IA</div>
                <div class="info-value" style="color: ${lead.classification === 'hot' ? '#ef4444' : '#fbbf24'}">
                    ${lead.classification ? lead.classification.toUpperCase() : 'PENDENTE'}
                </div>
            </div>

            <div class="info-item">
                <div class="info-label">Vendedor</div>
                <div class="info-value">${lead.vendedor}</div>
            </div>
        </div>

        <div class="info-label">Mudar Estágio</div>
        <select class="status-select" id="manos-status-update">
            <option value="">Selecione...</option>
            <option value="new">Novo</option>
            <option value="contacted">Contatado</option>
            <option value="scheduled">Agendado</option>
            <option value="visited">Visitou</option>
            <option value="negotiation">Negociação</option>
            <option value="closed">Vendido ✅</option>
            <option value="lost">Perdido ❌</option>
        </select>

        <button class="btn-sync" id="btn-sync-chat">
            <span>Sincronizar Conversa</span>
        </button>
    `;

    document.getElementById('manos-status-update').onchange = (e) => updateLeadStatus(lead.id, e.target.value);
    document.getElementById('btn-sync-chat').onclick = () => syncFullChat(lead.id);
}

function renderNotFound() {
    const content = document.getElementById('manos-sidebar-content');
    content.innerHTML = `
        <div style="text-align:center; padding: 40px 20px;">
            <div style="font-size: 40px; margin-bottom: 10px;">👤❓</div>
            <div style="font-weight: 800; margin-bottom: 10px;">LEAD NÃO ENCONTRADO</div>
            <p style="font-size: 11px; opacity: 0.5;">Este número não consta na base de dados do Manos CRM.</p>
        </div>
    `;
}

// 5. Sincronizar Mensagens
async function syncFullChat(leadId) {
    const btn = document.getElementById('btn-sync-chat');
    btn.classList.add('loading');
    btn.innerText = "Sincronizando...";

    try {
        // Capturar mensagens do DOM do WhatsApp
        const messageElems = document.querySelectorAll('.message-in, .message-out');
        const messages = Array.from(messageElems).map(el => {
            const isOut = el.classList.contains('message-out');
            const textElem = el.querySelector('.selectable-text span');
            return {
                text: textElem ? textElem.innerText : "",
                direction: isOut ? 'outbound' : 'inbound',
                timestamp: new Date().toISOString() // WA doesn't show full ISO in DOM easily
            };
        }).filter(m => m.text);

        const res = await fetch(`${API_BASE}/sync-messages`, {
            method: 'POST',
            body: JSON.stringify({ leadId, messages })
        });

        const data = await res.json();
        if (data.success) {
            btn.innerText = "Sucesso! ✅";
            setTimeout(() => {
                btn.classList.remove('loading');
                btn.innerText = "Sincronizar Conversa";
            }, 2000);
        }
    } catch (err) {
        btn.innerText = "Erro ❌";
        btn.classList.remove('loading');
    }
}

// 6. Atualizar Status
async function updateLeadStatus(leadId, status) {
    if (!status) return;
    try {
        await fetch(`${API_BASE}/update-status`, {
            method: 'POST',
            body: JSON.stringify({ leadId, status })
        });
        alert(`Status atualizado para: ${status}`);
    } catch (err) {
        alert("Erro ao atualizar status");
    }
}

// Inicialização e Monitoramento
injectUI();

let lastPhone = null;
setInterval(() => {
    const phone = getActiveChatPhone();
    if (phone && phone !== lastPhone) {
        lastPhone = phone;
        console.log("Chat detectado:", phone);
        fetchLeadInfo(phone);
    }
}, 3000);
