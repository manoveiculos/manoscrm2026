/**
 * Manos CRM v2.1 – Main Controller
 * Orquestra: Lead lookup, Kanban, Auth, Novos Leads (polling)
 */

const App = {
    API_BASE: 'https://manoscrm.com.br/api/extension',
    // API_BASE: 'http://localhost:3000/api/extension',
    baseUrl: '',
    apiToken: '',
    currentPhone: null,
    currentLeadId: null,
    currentNextSteps: null,
    isFetching: false,
    _pollInterval: null,

    // Retorna headers padrão incluindo Authorization token
    authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (this.apiToken) h['Authorization'] = `Bearer ${this.apiToken}`;
        return h;
    },

    async init() {
        console.log('Manos CRM v2.1: Iniciando...');
        const s = await chrome.storage.local.get(['crmToken', 'pendingLeadsCount', 'pendingLeads']);

        this.baseUrl = 'https://manoscrm.com.br';
        this.apiToken = s.crmToken || '';
        console.log('Manos CRM v2.1: API ->', this.API_BASE);

        // Inicializar UI
        UI.init();

        // Não restaurar cache antigo — esperar poll fresco do background
        UI.renderPendingLeads([]);

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

        if (phone) {
            if (phone.length > 13 || !phone.startsWith('55')) return;
            if (phone !== this.currentPhone && !this.isFetching) {
                console.log('Manos CRM: novo chat ->', phone, name);
                // Novo contato detectado — para polling anterior e limpa estado
                this._stopLeadPolling();
                this.currentPhone = phone;
                this.currentLeadId = null;
                this.currentNextSteps = null;
                UI.setLeadFound(false);
                UI.setLoading();
                await this.fetchLead(phone);
            }
        } else {
            // Sem telefone identificável — pode ser grupo ou tela inicial
            this._stopLeadPolling();
            this.currentPhone = null;
            this.currentLeadId = null;
            this.currentNextSteps = null;
            UI.setLeadFound(false);
        }
    },

    // ── Feedback de Score ────────────────────────────
    async handleScoreFeedback(leadId, feedback) {
        try {
            const data = await this._apiFetch('/ai-feedback', {
                method: 'POST',
                body: JSON.stringify({ lead_id: leadId, ...feedback })
            });
            return data.success;
        } catch (e) {
            console.error('Manos CRM: Feedback erro ->', e.message);
            return false;
        }
    },

    // ── Buscar Lead ───────────────────────────────────
    async fetchLead(phone) {
        if (this.isFetching) return;
        this.isFetching = true;
        try {
            const url = `${this.API_BASE}/lead-info?phone=${phone}`;
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA', url,
                options: { headers: this.authHeaders() }
            }, (response) => {
                this.isFetching = false;
                if (!response?.success) {
                    console.warn('Manos CRM: API erro ->', response?.error || 'sem resposta');
                }

                if (response?.success && response.data?.success) {
                    const lead = response.data.lead;
                    if (lead) {
                        // Normaliza ID: produção antiga retorna UUID puro (sem prefixo).
                        // Reconstruímos o prefixo a partir de response.data.source.
                        const rawId = String(lead.id || '');
                        const uuidOnly = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
                        let cleanId;
                        if (uuidOnly) {
                            const src = response.data.source || 'main';
                            cleanId = `${src}_${rawId}`;
                        } else {
                            cleanId = rawId.replace(/^master_/, '') || rawId;
                        }
                        lead.id = cleanId;
                        this.currentLeadId = cleanId;
                        UI.setLeadFound(true);
                        UI.renderLead(lead, {
                            onStatusChange: (s) => this.handleStatusChange(lead.id, s),
                            onSync: () => this.handleSync(lead.id),
                            onTimeline: () => this.handleTimeline(lead.id),
                            onFollowUp: () => this.handleFollowUp(lead.id),
                            onArsenal: () => this.handleArsenal(),
                            onInventory: () => this.handleInventory(),
                            onAddNote: (note) => this.handleAddNote(lead.id, note),
                            onUpdateField: (field, val) => this.handleUpdateField(lead.id, field, val),
                            onFipeSearch: (brand, model, year) => this.handleFipeSearch(brand, model, year),
                            onScoreFeedback: (fb) => this.handleScoreFeedback(lead.id, fb),
                            onCreateFollowUp: (id, data) => this.handleCreateFollowUp(id, data),
                            onCompleteFollowUp: (fuId, id) => this.handleCompleteFollowUp(fuId, id),
                            onFinishLead: (id, type, details) => this.handleFinishLead(id, type, details),
                            onDeleteLead: (id) => this.handleDeleteLead(id),
                            nextSteps: this.currentNextSteps,
                            crmUrl: this.baseUrl
                        });
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
            const url = `${this.baseUrl}/api/lead/next-steps?phone=${phone}&lead_id=${lead.id}`;
            chrome.runtime.sendMessage({ type: 'FETCH_DATA', url, options: { headers: this.authHeaders() } }, (response) => {
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
        chrome.runtime.sendMessage({ type: 'FETCH_DATA', url, options: { headers: this.authHeaders() } }, (response) => {
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
        if (!leadId || leadId === 'null' || leadId === 'undefined') {
            console.warn('Manos CRM: Tentativa de update sem leadId válido. Abortando.');
            UI.renderError('Lead não identificado. Sincronize novamente.');
            return;
        }

        const payload = { lead_id: leadId, leadId, status };
        console.log('Manos CRM: Payload Status ->', payload);

        try {
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: `${this.API_BASE}/update-status`,
                options: {
                    method: 'POST',
                    headers: this.authHeaders(),
                    body: JSON.stringify(payload)
                }
            }, (r) => {
                console.log('Manos CRM: Status atualizado ->', r);
                if (r && !r.success && r.error?.includes('não encontrado')) {
                    UI.setLeadFound(false);
                    UI.renderNotFound(this.currentPhone, Scraper.getName(), (fd) => this.handleCreate(fd));
                }
            });
        } catch (e) { console.error(e); }
    },

    // ── Sync Conversa ─────────────────────────────────
    handleSync(leadId) {
        if (!leadId) {
            UI.renderNotFound(this.currentPhone, Scraper.getName(), (fd) => this.handleCreate(fd));
            return Promise.resolve({ success: false });
        }

        const messages = Scraper.extractMessages();
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: `${this.API_BASE}/sync-messages`,
                options: {
                    method: 'POST',
                    headers: this.authHeaders(),
                    body: JSON.stringify({
                        lead_id: leadId,
                        leadId,
                        messages,
                        phone: this.currentPhone,
                        name: Scraper.getName()
                    })
                }
            }, (r) => {
                const apiData = r?.data || {};
                console.log('Manos CRM: Sync ->', apiData);
                if (r?.success && apiData.success) {
                    resolve({ success: true, count: apiData.count || messages.length });
                } else {
                    const err = apiData.error || r?.error || 'erro desconhecido';
                    if (err.includes('não encontrado')) {
                        UI.setLeadFound(false);
                        UI.renderNotFound(this.currentPhone, Scraper.getName(), (fd) => this.handleCreate(fd));
                    }
                    resolve({ success: false, error: err });
                }
            });
        });
    },

    // ── API fetch via background (evita CORS do content script) ──
    _apiFetch(path, opts = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: `${this.API_BASE}${path}`,
                options: { ...opts, headers: { ...this.authHeaders(), ...(opts.headers || {}) } }
            }, (r) => {
                if (chrome.runtime.lastError) {
                    // Service worker adormeceu — tenta novamente uma vez
                    chrome.runtime.sendMessage({
                        type: 'FETCH_DATA',
                        url: `${this.API_BASE}${path}`,
                        options: { ...opts, headers: { ...this.authHeaders(), ...(opts.headers || {}) } }
                    }, (r2) => {
                        if (chrome.runtime.lastError || !r2?.success) reject(new Error(r2?.error || 'Service worker unavailable'));
                        else resolve(r2.data);
                    });
                    return;
                }
                if (r?.success) resolve(r.data);
                else reject(new Error(r?.error || 'API error'));
            });
        });
    },

    // ── Timeline ──────────────────────────────────────
    async handleTimeline(leadId) {
        try {
            const phone = this.currentPhone || '';
            const data = await this._apiFetch(`/timeline?lead_id=${leadId}&phone=${phone}`);
            UI.updateTimeline(data.events || []);
        } catch (e) {
            console.error('Manos CRM: Timeline erro ->', e.message);
            UI.updateTimeline([]);   // limpa spinner mesmo em erro
        }
    },

    // ── Follow-up ─────────────────────────────────────
    async handleFollowUp(leadId) {
        try {
            const data = await this._apiFetch(`/follow-ups?lead_id=${leadId}`);
            UI.updateFollowUps(data.followups || []);
        } catch (e) {
            console.error('Manos CRM: FollowUp erro ->', e.message);
            UI.updateFollowUps([]);
        }
    },

    // ── Arsenal ───────────────────────────────────────
    async handleArsenal() {
        try {
            const data = await this._apiFetch(`/arsenal`);
            UI.updateArsenal(data.scripts || data || []);
        } catch (e) {
            console.error('Manos CRM: Arsenal erro ->', e.message);
            UI.updateArsenal([]);
        }
    },

    // ── Adicionar Nota ────────────────────────────────
    async handleAddNote(leadId, note) {
        try {
            await this._apiFetch('/add-note', {
                method: 'POST',
                body: JSON.stringify({ lead_id: leadId, leadId, note })
            });
            this.handleTimeline(leadId); // Refresh timeline
        } catch (e) { console.error('Nota erro:', e); }
    },

    // ── Atualizar Campo do Lead ───────────────────────
    async handleUpdateField(leadId, field, value) {
        try {
            const data = await this._apiFetch('/update-lead-field', {
                method: 'POST',
                body: JSON.stringify({ lead_id: leadId, leadId, field, value })
            });
            if (!data.success) {
                console.warn(`Manos CRM: Campo ${field} não gravado no banco ->`, data.error);
                return;
            }
            console.log(`Manos CRM: Campo ${field} atualizado para ${value}`);
        } catch (e) {
            console.error('Update field erro:', e.message);
        }
    },

    // ── Busca FIPE ────────────────────────────────────
    async handleFipeSearch(brand, modelName, year) {
        return new Promise((resolve) => {
            const fullQuery = `${brand} ${modelName} ${year}`.trim();
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: `${this.baseUrl}/api/lead/fipe-search`,
                options: { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ brand, model: modelName, year, fullQuery }) }
            }, (r) => {
                if (r?.success) resolve(r.data);
                else resolve({ error: r?.error || 'Fipe search erro' });
            });
        });
    },

    // ── Criar Follow-up ───────────────────────────────
    async handleCreateFollowUp(leadId, fuData) {
        try {
            const data = await this._apiFetch('/create-followup', {
                method: 'POST',
                body: JSON.stringify({ lead_id: leadId, leadId, ...fuData })
            });
            if (data.success) this.handleFollowUp(leadId);
            return data;
        } catch (e) { console.error(e); return { success: false }; }
    },

    // ── Concluir Follow-up ────────────────────────────
    async handleCompleteFollowUp(followupId, leadId) {
        try {
            const data = await this._apiFetch('/follow-ups', {
                method: 'PATCH',
                body: JSON.stringify({ followup_id: followupId, result: 'completed' })
            });
            if (data.success) this.handleFollowUp(leadId);
            return data;
        } catch (e) { console.error(e); return { success: false }; }
    },

    // ── Encerrar Lead (Venda / Perda) ─────────────────
    async handleFinishLead(leadId, finishType, details) {
        try {
            let consultantName = '';
            let consultantId = '';
            try {
                const s = await chrome.storage.local.get(['consultantName', 'consultantId']);
                consultantName = s.consultantName || '';
                consultantId = s.consultantId || '';
            } catch (_) {}
            return await this._apiFetch('/finish-lead', {
                method: 'POST',
                body: JSON.stringify({ lead_id: leadId, leadId, finish_type: finishType, consultant_name: consultantName, assigned_consultant_id: consultantId, ...details })
            });
        } catch (e) { console.error(e); return { success: false }; }
    },

    // ── Excluir Lead Permanentemente ─────────────────
    async handleDeleteLead(leadId) {
        try {
            return await this._apiFetch('/delete-lead', {
                method: 'POST',
                body: JSON.stringify({ lead_id: leadId })
            });
        } catch (e) { console.error(e); return { success: false }; }
    },

    // ── Estoque / Simulação ───────────────────────────
    async handleInventory() {
        try {
            chrome.runtime.sendMessage(
                { type: 'FETCH_DATA', url: `${this.API_BASE}/inventory`, options: { headers: this.authHeaders() } },
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

    // ── Auto-refresh: polling silencioso do lead ──────
    _startLeadPolling(phone) {
        this._stopLeadPolling();
        // Refresh a cada 30s: atualiza header (score/status) e aba ativa (timeline/follow-ups)
        this._pollInterval = setInterval(() => this._silentLeadUpdate(phone), 30_000);
    },

    _stopLeadPolling() {
        if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
    },

    async _silentLeadUpdate(phone) {
        const panel = UI.shadow?.getElementById('panel');
        if (!panel?.classList.contains('active')) return;
        try {
            const data = await this._apiFetch(`/lead-info?phone=${phone}`);
            if (!data?.lead) return;
            UI.updateLeadHeader(data.lead);
            if (UI.activeTab === 'timeline' && this.currentLeadId)  this.handleTimeline(this.currentLeadId);
            else if (UI.activeTab === 'followup' && this.currentLeadId) this.handleFollowUp(this.currentLeadId);
        } catch (_) {}
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
            // Obter dados do consultor do storage
            let consultantName = '';
            let consultantId = '';
            try {
                const s = await chrome.storage.local.get(['consultantName', 'consultantId']);
                consultantName = s.consultantName || '';
                consultantId = s.consultantId || '';
            } catch (_) {}

            const data = await this._apiFetch('/create-lead', {
                method: 'POST',
                body: JSON.stringify({
                    name: name || 'Lead WhatsApp',
                    phone,
                    interesse,
                    valor_investimento: valor,
                    tipo,
                    consultor_name: consultantName,
                    assigned_consultant_id: consultantId,
                    source: 'WhatsApp Extension'
                })
            });

            if (!data.success) {
                setErr(data.error || 'Erro ao criar lead. Tente novamente.');
                return;
            }

            const lead = data.lead;
            this.currentLeadId = lead.id;

            // Sincronizar conversa via background proxy
            if (messages?.length && lead.id) {
                chrome.runtime.sendMessage({
                    type: 'FETCH_DATA',
                    url: `${this.API_BASE}/sync-messages`,
                    options: { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ lead_id: lead.id, leadId: lead.id, messages }) }
                }, () => {});
            }

            // Exibir o lead criado no painel
            UI.setLeadFound(true);
            UI.renderLead(lead, {
                onStatusChange: (s) => this.handleStatusChange(lead.id, s),
                onSync: () => this.handleSync(lead.id),
                onTimeline: () => this.handleTimeline(lead.id),
                onFollowUp: () => this.handleFollowUp(lead.id),
                onArsenal: () => this.handleArsenal(),
                onInventory: () => this.handleInventory(),
                onAddNote: (note) => this.handleAddNote(lead.id, note),
                onUpdateField: (field, val) => this.handleUpdateField(lead.id, field, val),
                onFipeSearch: (brand, model, year) => this.handleFipeSearch(brand, model, year),
                onScoreFeedback: (fb) => this.handleScoreFeedback(lead.id, fb),
                onCreateFollowUp: (id, data) => this.handleCreateFollowUp(id, data),
                onCompleteFollowUp: (fuId, id) => this.handleCompleteFollowUp(fuId, id),
                onFinishLead: (id, type, details) => this.handleFinishLead(id, type, details),
                onDeleteLead: (id) => this.handleDeleteLead(id),
                nextSteps: null,
                crmUrl: this.baseUrl
            });

        } catch (e) {
            console.error('handleCreate error:', e);
            setErr('Erro ao conectar ao CRM. Verifique o token nas configurações.');
        }
    }
};

App.init();
