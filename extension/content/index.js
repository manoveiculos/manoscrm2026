/**
 * Manos CRM v2.1 – Main Controller
 * Orquestra: Lead lookup, Kanban, Auth, Novos Leads (polling)
 */

const App = {
    API_BASE: '',
    baseUrl: '',
    apiToken: '',
    currentPhone: null,
    currentLeadId: null,
    currentNextSteps: null,
    isFetching: false,

    // Retorna headers padrão incluindo Authorization token
    authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (this.apiToken) h['Authorization'] = `Bearer ${this.apiToken}`;
        return h;
    },

    async init() {
        console.log('Manos CRM v2.1: Iniciando...');
        const s = await chrome.storage.local.get(['crmUrl', 'crmToken', 'pendingLeadsCount', 'pendingLeads']);

        let raw = (s.crmUrl || 'http://localhost:3000').replace(/\/$/, '');
        try { raw = new URL(raw).origin; } catch (_) {}
        this.baseUrl = raw;
        this.API_BASE = `${raw}/api/extension`;
        this.apiToken = s.crmToken || '';
        console.log('Manos CRM v2.1: API ->', this.API_BASE);

        // Inicializar UI
        UI.init();

        // Restaurar badge de leads pendentes do storage (persistência entre reloads)
        if (s.pendingLeads?.length) {
            UI.renderPendingLeads(s.pendingLeads);
        }

        // Observar mudanças de chat
        Observers.watchChatChange(() => this.handleChatChange());

        // Listener para updates do background (polling de leads)
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'PENDING_LEADS_UPDATE') {
                UI.renderPendingLeads(msg.leads || []);
            }
        });

        // Listener para carregar kanban quando painel abre
        document.addEventListener('manos-load-kanban', () => this.loadKanban());

        // Refresh manual de chat ao abrir painel de lead
        window.addEventListener('manos-crm-refresh', () => {
            this.currentPhone = null;
            this.currentNextSteps = null;
            this.handleChatChange();
        });

        // Poll imediato ao iniciar
        chrome.runtime.sendMessage({ type: 'POLL_NOW' });

        this.handleChatChange();
    },

    // ── Troca de Chat ─────────────────────────────────
    async handleChatChange() {
        const phone = Scraper.getPhone();
        const name  = Scraper.getName();
        console.log('Manos CRM v2.1: [chat] phone ->', phone, '| name ->', name);

        if (phone) {
            if (phone.length > 13 || !phone.startsWith('55')) return;
            if (phone !== this.currentPhone && !this.isFetching) {
                // Novo contato detectado — limpa estado imediatamente
                this.currentPhone = phone;
                this.currentLeadId = null;
                this.currentNextSteps = null;
                UI.setLeadFound(false);
                UI.setLoading();
                await this.fetchLead(phone);
            }
        } else {
            // Sem telefone identificável — pode ser grupo ou tela inicial
            this.currentPhone = null;
            this.currentLeadId = null;
            this.currentNextSteps = null;
            UI.setLeadFound(false);
        }
    },

    // ── Buscar Lead ───────────────────────────────────
    async fetchLead(phone) {
        if (this.isFetching) return;
        this.isFetching = true;
        try {
            const url = `${this.API_BASE}/lead-info?phone=${phone}`;
            chrome.runtime.sendMessage({ type: 'FETCH_DATA', url }, (response) => {
                this.isFetching = false;
                console.log('Manos CRM Proxy Response:', response);

                if (response?.success && response.data?.success) {
                    const lead = response.data.lead;
                    if (lead) {
                        this.currentLeadId = lead.id;
                        UI.setLeadFound(true);
                        UI.renderLead(
                            lead, this.baseUrl,
                            (id, status) => this.handleStatusChange(id, status),
                            (id) => this.handleSync(id),
                            (id) => this.handleTimeline(id),
                            (id) => this.handleFollowUp(id),
                            (id) => this.handleArsenal(id),
                            () => this.handleInventory(),
                            this.currentNextSteps
                        );
                        this.fetchNextSteps(phone, lead);
                    } else {
                        UI.setLeadFound(false);
                        const contactName = Scraper.getName();
                        UI.renderNotFound(phone, contactName, (formData) => this.handleCreate(formData));
                    }
                } else {
                    UI.setLeadFound(false);
                    const contactName = Scraper.getName();
                    UI.renderNotFound(phone, contactName, (formData) => this.handleCreate(formData));
                }
            });
        } catch (err) {
            console.error('Manos CRM v2.1: Erro fetchLead ->', err);
            this.isFetching = false;
        }
    },

    // ── Próximos Passos (IA) ──────────────────────────
    async fetchNextSteps(phone, lead) {
        try {
            const url = `${this.API_BASE}/next-steps?phone=${phone}&lead_id=${lead.id}`;
            chrome.runtime.sendMessage({ type: 'FETCH_DATA', url }, (response) => {
                if (response?.success && response.data) {
                    this.currentNextSteps = response.data;
                    UI.renderNextSteps(response.data);
                }
            });
        } catch (_) {}
    },

    // ── Kanban ────────────────────────────────────────
    async loadKanban() {
        const url = `${this.API_BASE}/kanban`;
        chrome.runtime.sendMessage({ type: 'FETCH_DATA', url }, (response) => {
            if (response?.success && response.data?.kanban) {
                UI.renderKanban(response.data.kanban);
            } else {
                const board = document.getElementById('manos-kanban-board');
                if (board) board.innerHTML = `<div style="margin:auto;color:#555;font-size:12px;font-family:Inter,sans-serif">Erro ao carregar kanban.</div>`;
            }
        });
    },

    // ── Status ────────────────────────────────────────
    async handleStatusChange(leadId, status) {
        try {
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: `${this.API_BASE}/update-status`,
                options: {
                    method: 'POST',
                    headers: this.authHeaders(),
                    body: JSON.stringify({ lead_id: leadId, status })
                }
            }, (r) => console.log('Status atualizado:', r));
        } catch (e) { console.error(e); }
    },

    // ── Sync Conversa ─────────────────────────────────
    async handleSync(leadId) {
        try {
            const messages = Scraper.extractMessages();
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: `${this.API_BASE}/sync-messages`,
                options: {
                    method: 'POST',
                    headers: this.authHeaders(),
                    body: JSON.stringify({ lead_id: leadId, messages })
                }
            }, (r) => console.log('Sync:', r));
        } catch (e) { console.error(e); }
    },

    // ── Timeline ──────────────────────────────────────
    async handleTimeline(leadId) {
        try {
            chrome.runtime.sendMessage(
                { type: 'FETCH_DATA', url: `${this.API_BASE}/timeline?lead_id=${leadId}` },
                (r) => { if (r?.success && r.data) UI.updateTimeline(r.data.events || r.data); }
            );
        } catch (e) { console.error(e); }
    },

    // ── Follow-up ─────────────────────────────────────
    async handleFollowUp(leadId) {
        try {
            chrome.runtime.sendMessage(
                { type: 'FETCH_DATA', url: `${this.API_BASE}/follow-ups?lead_id=${leadId}` },
                (r) => { if (r?.success && r.data) UI.updateFollowUps(r.data.followups || r.data); }
            );
        } catch (e) { console.error(e); }
    },

    // ── Arsenal ───────────────────────────────────────
    async handleArsenal(leadId) {
        try {
            chrome.runtime.sendMessage(
                { type: 'FETCH_DATA', url: `${this.API_BASE}/arsenal` },
                (r) => { if (r?.success && r.data) UI.updateArsenal(r.data.scripts || r.data); }
            );
        } catch (e) { console.error(e); }
    },

    // ── Estoque / Simulação ───────────────────────────
    async handleInventory() {
        try {
            chrome.runtime.sendMessage(
                { type: 'FETCH_DATA', url: `${this.API_BASE}/inventory` },
                (r) => {
                    if (r?.success && r.data?.inventory) {
                        UI.updateInventory(r.data.inventory);
                    } else {
                        UI.updateInventory([]);
                    }
                }
            );
        } catch (e) { console.error(e); }
    },

    // ── Criar Lead pelo formulário da extensão ────────
    // Usa fetch() direto para não depender do SW (que pode estar morto no MV3)
    async handleCreate(formData) {
        const { name, phone, interesse, valor, tipo, messages } = formData;
        const c = UI.shadow?.getElementById('content');

        const setErr = (msg) => {
            const btn = c?.querySelector('#cf-finish');
            if (btn) { btn.disabled = false; btn.textContent = 'Cadastrar no CRM'; }
            let errEl = c?.querySelector('.cf-error');
            if (!errEl && c) {
                errEl = document.createElement('div');
                errEl.className = 'cf-error';
                errEl.style.cssText = 'font-size:11px;color:#f87171;text-align:center;margin-top:8px';
                c.appendChild(errEl);
            }
            if (errEl) errEl.textContent = msg;
        };

        try {
            // Obter nome do consultor — chrome.storage pode falhar se contexto morreu,
            // então envolvemos em try/catch
            let consultantName = '';
            try {
                const s = await chrome.storage.local.get(['consultantName']);
                consultantName = s.consultantName || '';
            } catch (_) {}

            // ── Chamada direta via fetch (content script tem host_permissions) ──
            const res = await fetch(`${this.API_BASE}/create-lead`, {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify({
                    name: name || 'Lead WhatsApp',
                    phone,
                    interesse,
                    valor_investimento: valor,
                    tipo,
                    consultor_name: consultantName,
                    source: 'WhatsApp Extension'
                })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                setErr(data.error || `Erro ${res.status}. Tente novamente.`);
                return;
            }

            const lead = data.lead;
            this.currentLeadId = lead.id;

            // Sincronizar conversa — também via fetch direto
            if (messages?.length && lead.id) {
                fetch(`${this.API_BASE}/sync-messages`, {
                    method: 'POST',
                    headers: this.authHeaders(),
                    body: JSON.stringify({ lead_id: lead.id, messages })
                }).catch(() => {});
            }

            // Exibir o lead criado no painel
            UI.setLeadFound(true);
            UI.renderLead(
                lead, this.baseUrl,
                (id, status) => this.handleStatusChange(id, status),
                (id) => this.handleSync(id),
                (id) => this.handleTimeline(id),
                (id) => this.handleFollowUp(id),
                (id) => this.handleArsenal(id),
                () => this.handleInventory(),
                null
            );

        } catch (e) {
            console.error('handleCreate error:', e);
            setErr('Erro ao conectar ao CRM. Verifique a URL nas configurações.');
        }
    }
};

App.init();
