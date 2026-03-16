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

    renderLead(lead, crmUrl, onStatusChange, onSync) {
        const content = this.shadowRoot.getElementById('manos-content');
        const crmLink = `${crmUrl}/leads?id=${lead.id}`;
        
        content.innerHTML = `
            <div class="lead-card">
                <div class="lead-header">
                    <div class="lead-name-container">
                        <div class="lead-name">${lead.name || 'Sem Nome'}</div>
                        <a href="${crmLink}" target="_blank" class="crm-link" title="Ver no CRM">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                    </div>
                </div>
                ${lead.phone ? `<div class="lead-phone" style="font-size: 11px; opacity: 0.6; margin-bottom: 8px;">${lead.phone}</div>` : ''}
                <div class="status-badge" style="background: ${this.getStatusColor(lead.status)}">
                    ESTÁGIO: ${this.getStatusLabel(lead.status)}
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

                <!-- Seção de Próximos Passos -->
                <div id="next-steps-container" style="display:none; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                    <div class="info-label" style="color: #10b981; font-weight: 800; margin-bottom: 10px;">PRÓXIMOS PASSOS DA GESTÃO</div>
                    <div id="diagnostico-ia" style="font-size: 12px; margin-bottom: 10px; line-height: 1.4; opacity: 0.9;"></div>
                    <div id="steps-list" style="display: flex; flex-direction: column; gap: 5px;"></div>
                </div>
        `;


        this.shadowRoot.getElementById('status-update').onchange = (e) => onStatusChange(lead.id, e.target.value);
        this.shadowRoot.getElementById('sync-chat').onclick = (e) => {
            const btn = e.target;
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "Extraindo Histórico...";
            onSync(lead.id).finally(() => {
                btn.disabled = false;
                btn.innerText = originalText;
            });
        };

        // Remove old click-outside handler if exists
        document.removeEventListener('mousedown', this._clickOutsideHandler);

        // Hover listener to open
        this.fab.onmouseenter = () => this.toggleSidebar(true);

        // Click outside to close (excluding FAB and sidebar)
        const handleClickOutside = (e) => {
            const host = document.getElementById('manos-crm-root');
            const path = e.composedPath();
            const isInside = path.some(el => el === this.sidebar || el === this.fab || el === host);

            if (!isInside && this.sidebar.classList.contains('active')) {
                this.toggleSidebar(false);
            }
        };

        this._clickOutsideHandler = handleClickOutside;
        document.addEventListener('mousedown', this._clickOutsideHandler);
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



    renderNotFound(phone, onCreate) {
        const content = this.shadowRoot.getElementById('manos-content');
        content.innerHTML = `
            <div style="text-align:center; padding: 40px 20px;">
                <div style="font-size: 40px; margin-bottom: 10px;">👤❓</div>
                <div style="font-weight: 800; margin-bottom: 5px;">LEAD NÃO ENCONTRADO</div>
                <div style="font-size: 12px; opacity: 0.6; margin-bottom: 20px;">${phone}</div>
                <button id="create-lead-btn" class="btn-sync" style="background: #10b981;">Cadastrar no CRM</button>
            </div>
        `;
        this.shadowRoot.getElementById('create-lead-btn').onclick = onCreate;
    },


    renderNextSteps(data) {
        const container = this.shadowRoot.getElementById('next-steps-container');
        const diagElem = this.shadowRoot.getElementById('diagnostico-ia');
        const listElem = this.shadowRoot.getElementById('steps-list');

        if (!container || !data) return;

        diagElem.innerText = data.diagnostico || "";
        listElem.innerHTML = (data.proximos_passos || []).map(step => `
            <div style="background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; padding: 8px; font-size: 11px; border-radius: 4px;">
                ${step}
            </div>
        `).join('');

        container.style.display = 'block';
    }
};

