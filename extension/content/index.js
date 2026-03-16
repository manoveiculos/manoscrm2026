/**
 * Manos CRM - Main Controller
 */

import { UI } from './ui.js';
import { Observers } from './observers.js';
import { Scraper } from './scraper.js';

const App = {
    API_BASE: "http://localhost:3000/api/extension",
    currentPhone: null,
    currentLeadId: null, // ID numérico do banco
    currentMode: 'chat', // 'chat' or 'kanban'
    isSyncing: false,
    isFetching: false,


    async init() {
        console.log("Manos CRM: Iniciando App...");

        // 1. Carregar Configurações
        const settings = await chrome.storage.local.get(['crmUrl']);
        let baseUrl = settings.crmUrl || "https://manoscrm.com.br";

        // Remover trailing slash e garantir /api/extension
        baseUrl = baseUrl.replace(/\/$/, "");
        this.baseUrl = baseUrl;
        this.API_BASE = `${baseUrl}/api/extension`;

        console.log("Manos CRM: API Base configurada para ->", this.API_BASE);

        // 2. Injetar UI
        UI.init();

        // 3. Iniciar Observadores
        Observers.watchChatChange(() => {
            if (this.currentMode === 'chat') {
                this.handleChatChange();
            }
        });

        // 4. Lógica de Hover (Abrir/Fechar Sidebar)
        this.initHoverLogic();

        // Evento manual
        window.addEventListener('manos-crm-refresh', () => {
            this.currentPhone = null;
            this.handleChatChange();
        });

        // Execução inicial
        this.handleChatChange();
    },

    initHoverLogic() {
        let closeTimeout;

        // Borda direita para abrir (40px)
        document.addEventListener('mousemove', (e) => {
            const edgeWidth = 40;
            if (window.innerWidth - e.clientX <= edgeWidth) {
                UI.toggleSidebar(true);
            }
        });

        // Monitorar Shadow Root Host
        const host = document.getElementById('manos-crm-root');
        if (host) {
            host.onmouseenter = () => {
                clearTimeout(closeTimeout);
            };
            host.onmouseleave = () => {
                closeTimeout = setTimeout(() => {
                    UI.toggleSidebar(false);
                }, 500);
            };
        }
    },

    async fetchKanban() {
        // Removido a pedido do usuário
    },

    async handleChatChange() {
        console.log("Manos CRM: handleChatChange trigger 🔄");
        const phone = Scraper.getPhone();
        console.log("Manos CRM: [DEBUG] Scraper retornou ->", phone);

        if (phone) {
            // Filtro de Segurança
            if (phone.length > 13 || !phone.startsWith('55')) return;

            if (phone !== this.currentPhone && !this.isFetching) {
                this.currentPhone = phone;
                this.currentLeadId = null;
                UI.setLoading();
                await this.fetchLead(phone);
            }
        } else {
            this.currentPhone = null;
            this.currentLeadId = null;
        }

    },

    async fetchLead(phone) {
        if (this.isFetching) return;
        this.isFetching = true;

        try {
            console.log("Manos CRM: Chamando Proxy para ->", phone);
            const name = Scraper.getName();
            const url = `${this.API_BASE}/lead-info?phone=${phone}`;

            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: url
            }, (response) => {
                this.isFetching = false;
                console.log("Manos CRM Proxy Response:", response);


                if (response && response.success && response.data.success) {
                    const lead = response.data.lead;
                    this.currentLeadId = lead.id; // Salva o ID do banco

                    UI.renderLead(lead, this.baseUrl,
                        (id, status) => this.updateStatus(id, status),
                        (id) => this.syncChat(id)
                    );
                    UI.setAlert(true); // Piscar o botão para avisar o consultor
                } else {
                    console.warn("Manos CRM: Lead não encontrado ou erro no Proxy", phone);
                    UI.renderNotFound(phone, () => this.createLead(phone, name));
                }
            });
        } catch (err) {
            console.error("Manos CRM: Erro ao buscar lead via Proxy", err);
            UI.renderNotFound(phone + " (Erro de Proxy)", () => { });
        }
    },

    async createLead(phone, name) {
        UI.setLoading();
        try {
            const url = `${this.API_BASE}/create-lead`;
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: url,
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, name })
                }
            }, (response) => {
                if (response && response.success && response.data.success) {
                    alert("Lead criado com sucesso!");
                    this.fetchLead(phone);
                } else {
                    const error = response?.data?.error || "Erro desconhecido";
                    alert(`Falha ao criar lead: ${error}`);
                    this.fetchLead(phone);
                }
            });
        } catch (err) {
            console.error("Manos CRM: Erro ao criar lead via Proxy", err);
        }
    },

    async updateStatus(leadId, status) {
        if (!status) return;
        try {
            const url = `${this.API_BASE}/update-status`;
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: url,
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId, status })
                }
            }, (response) => {
                if (response && response.success && response.data.success) {
                    alert("Status atualizado!");
                    this.fetchLead(this.currentPhone);
                }
            });
        } catch (err) {
            console.error("Manos CRM: Erro ao atualizar status via Proxy", err);
        }
    },

    async syncChat(leadId) {
        if (this.isSyncing) return;
        
        if (!this.currentLeadId && !this.currentPhone) {
            alert("Erro: Lead não identificado. Tente atualizar a página.");
            return;
        }

        this.isSyncing = true;
        const messages = await Scraper.getFullMessages(20);
        const leadName = Scraper.getName();

        const chatText = messages.map(m => `[${m.direction === 'outbound' ? 'Vendedor' : 'Cliente'}]: ${m.text}`).join('\n');

        // Hardening do ID: Prioridade ao ID numérico salvo do banco
        let rawId = this.currentLeadId || leadId;
        let cleanId = rawId.toString().replace(/crm26_|main_|dist_/, '');

        // Se o cleanId ainda contém letras ou traços (UUID), usamos o telefone como ID numérico (BigInt seguro)
        if (/[a-zA-Z-]/.test(cleanId)) {
            console.warn("Manos CRM: ID é UUID. Usando telefone limpo para compatibilidade BigInt.");
            cleanId = this.currentPhone.replace(/\D/g, '');
        }

        console.log("Manos CRM: ID enviado para Sync ->", cleanId);

        try {
            // 1. Sincronizar mensagens brutas
            const syncUrl = `${this.API_BASE}/sync-messages`;
            const syncRes = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'FETCH_DATA',
                    url: syncUrl,
                    options: {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ leadId: cleanId, messages })
                    }
                }, resolve);
            });

            if (!syncRes || !syncRes.success || !syncRes.data?.success) {
                const error = syncRes?.data?.error || syncRes?.error || "Erro na API de Mensagens";
                throw new Error(error);
            }


            // 2. Buscar Próximos Passos
            const nextStepsUrl = `${this.baseUrl}/api/lead/next-steps`;
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: nextStepsUrl,
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId: cleanId, messages })
                }
            }, (res) => {
                if (res && res.success && res.data?.success) {
                    UI.renderNextSteps(res.data);
                }
            });

            alert("Conversa importada com sucesso para o Laboratório de IA!");
            this.fetchLead(this.currentPhone);

        } catch (err) {
            console.error("Manos CRM: Erro ao sincronizar via Proxy", err);
            alert("Erro na sincronização: " + err.message);
        } finally {
            this.isSyncing = false;
        }
    }
};



// Start
App.init();
