/**
 * Manos CRM - UI Module (Shadow DOM)
 */

export const UI = {
    shadowRoot: null,
    sidebar: null,
    fab: null,

    init() {
        if (document.getElementById('manos-crm-root')) return;

        const host = document.createElement('div');
        host.id = 'manos-crm-root';
        document.body.appendChild(host);

        this.shadowRoot = host.attachShadow({ mode: 'open' });

        // Inject Styles
        this.injectStyles();

        // Create Sidebar Container
        this.sidebar = document.createElement('div');
        this.sidebar.id = 'manos-sidebar-container';
        this.sidebar.innerHTML = `
            <div class="header">
                <div class="header-top">
                    <div class="logo">MANOS <span>CRM</span></div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <div class="minimize" id="manos-minimize">&times;</div>
                    </div>
                </div>
            </div>
            <div class="content" id="manos-content">
                <div style="text-align:center; padding: 40px 20px; color: rgba(255,255,255,0.4); font-size: 13px;">
                    Selecione um chat para ver informações do CRM.
                </div>
            </div>
        `;
        this.shadowRoot.appendChild(this.sidebar);

        // Create FAB
        this.fab = document.createElement('div');
        this.fab.id = 'manos-fab';
        this.fab.innerText = 'M';
        this.shadowRoot.appendChild(this.fab);

        // Events
        this.shadowRoot.getElementById('manos-minimize').onclick = () => this.toggleSidebar(false);

        this.fab.onclick = () => this.toggleSidebar();
    },

    async injectStyles() {
        try {
            const url = chrome.runtime.getURL('styles/sidebar.css');
            const res = await fetch(url);
            const css = await res.text();
            const style = document.createElement('style');
            style.textContent = css;
            this.shadowRoot.appendChild(style);
        } catch (e) {
            console.error("Manos CRM: Erro ao carregar estilos", e);
        }
    },

    toggleSidebar(force) {
        if (typeof force === 'boolean') {
            force ? this.sidebar.classList.add('active') : this.sidebar.classList.remove('active');
        } else {
            this.sidebar.classList.toggle('active');
        }

        // Se abrir a sidebar, remove o alerta visual
        if (this.sidebar.classList.contains('active')) {
            this.setAlert(false);
        }
    },

    setAlert(active) {
        if (active) {
            this.fab.classList.add('alert');
        } else {
            this.fab.classList.remove('alert');
        }
    },

    setMode(mode) {
        // Modo Kanban removido
    },

    setLoading() {
        const content = this.shadowRoot.getElementById('manos-content');
        content.innerHTML = `
            <div style="text-align:center; padding: 60px 20px;">
                <div class="loader"></div>
                <div style="margin-top: 15px; font-size: 12px; opacity: 0.6;">Buscando lead...</div>
            </div>
        `;
    },

    renderLead(lead, onStatusChange, onSync) {
        const content = this.shadowRoot.getElementById('manos-content');
        content.innerHTML = `
            <div class="lead-card">
                <div class="lead-name">${lead.name}</div>
                <div class="status-badge" style="background: ${this.getStatusColor(lead.status)}">
                    ${this.getStatusLabel(lead.status)}
                </div>
                
                <div class="info-item">
                    <div class="info-label">INTERESSE</div>
                    <div class="info-value">${lead.vehicle || 'Não informado'}</div>
                </div>
 
                <div class="info-item">
                    <div class="info-label">CLASSIFICAÇÃO IA</div>
                    <div class="info-value" style="color: ${lead.classification === 'hot' ? '#ef4444' : '#fbbf24'}">
                        ${this.getClassificationLabel(lead.classification)}
                    </div>
                </div>
 
                <div class="info-item">
                    <div class="info-label">VENDEDOR</div>
                    <div class="info-value">${lead.vendedor}</div>
                </div>
            </div>

            <div class="info-label">Atualizar Estágio</div>
            <select class="status-select" id="status-update">
                <option value="">Selecione...</option>
                <option value="received">AGUARDANDO</option>
                <option value="contacted">EM ATENDIMENTO</option>
                <option value="scheduled">AGENDAMENTO</option>
                <option value="visited">VISITA E TEST DRIVE</option>
                <option value="negotiation">NEGOCIAÇÃO</option>
                <option value="closed">VENDIDO ✅</option>
                <option value="lost">PERDA / SEM CONTATO ❌</option>
            </select>

            <button class="btn-sync" id="sync-chat">
                Sincronizar Conversa
            </button>
        `;

        this.shadowRoot.getElementById('status-update').onchange = (e) => onStatusChange(lead.id, e.target.value);
        this.shadowRoot.getElementById('sync-chat').onclick = () => onSync(lead.id);
    },

    getClassificationLabel(classification) {
        const labels = {
            'hot': 'MUITO INTERESSADO 🔥',
            'warm': 'INTERESSADO',
            'cold': 'EM PESQUISA'
        };
        return labels[classification] || 'PENDENTE';
    },

    getStatusLabel(status) {
        const labels = {
            'received': 'AGUARDANDO',
            'new': 'AGUARDANDO',
            'contacted': 'EM ATENDIMENTO',
            'attempt': 'EM ATENDIMENTO',
            'confirmed': 'EM ATENDIMENTO',
            'scheduled': 'AGENDAMENTO',
            'visited': 'VISITA E TEST DRIVE',
            'test_drive': 'VISITA E TEST DRIVE',
            'negotiation': 'NEGOCIAÇÃO',
            'proposed': 'NEGOCIAÇÃO',
            'closed': 'VENDIDO',
            'lost': 'PERDA / SEM CONTATO',
            'post_sale': 'PERDA / SEM CONTATO'
        };
        return labels[status] || status?.toUpperCase() || 'NOVO';
    },

    getStatusColor(status) {
        if (['received', 'new'].includes(status)) return '#3b82f6'; // Azul
        if (['contacted', 'attempt', 'confirmed'].includes(status)) return '#f59e0b'; // Amarelo
        if (['scheduled', 'visited', 'test_drive', 'negotiation', 'proposed'].includes(status)) return '#ef4444'; // Vermelho
        if (status === 'closed') return '#10b981'; // Verde
        return 'rgba(255,255,255,0.1)';
    },

    renderKanban(kanbanData) {
        // Kanban removido a pedido do usuário
    },

    renderNotFound(phone) {
        const content = this.shadowRoot.getElementById('manos-content');
        content.innerHTML = `
            <div style="text-align:center; padding: 40px 20px;">
                <div style="font-size: 40px; margin-bottom: 10px;">👤❓</div>
                <div style="font-weight: 800; margin-bottom: 5px;">LEAD NÃO ENCONTRADO</div>
                <div style="font-size: 12px; opacity: 0.6; margin-bottom: 20px;">${phone}</div>
                <button class="btn-sync" id="create-lead" style="background: #dc2626; border: none;">
                    CRIAR LEAD AGORA
                </button>
            </div>
        `;
    }
};
