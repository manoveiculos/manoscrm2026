/**
 * Manos CRM - Main Controller
 */

import { UI } from './ui.js';
import { Observers } from './observers.js';
import { Scraper } from './scraper.js';

const App = {
    API_BASE: "http://localhost:3000/api/extension",
    currentPhone: null,
    currentMode: 'chat', // 'chat' or 'kanban'

    async init() {
        console.log("Manos CRM: Iniciando App...");

        // 1. Carregar Configurações
        const settings = await chrome.storage.local.get(['crmUrl']);
        let baseUrl = settings.crmUrl || "https://manoscrm.com.br";

        // Remover trailing slash e garantir /api/extension
        baseUrl = baseUrl.replace(/\/$/, "");
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

        // Evento manual (pode ser ativado pelo FAB pulse ou outro gatilho)
        window.addEventListener('manos-crm-refresh', () => {
            this.currentPhone = null; // Reset para forçar re-fetch
            this.handleChatChange();
        });

        // Execução inicial
        this.handleChatChange();
    },

    async fetchKanban() {
        // Removido a pedido do usuário
    },

    async handleChatChange() {
        console.log("Manos CRM: handleChatChange trigger 🔄");
        const phone = Scraper.getPhone();
        console.log("Manos CRM: Telefone detectado no DOM ->", phone);

        if (phone && phone !== this.currentPhone) {
            this.currentPhone = phone;
            console.log("Manos CRM: Mudança de chat confirmada ->", phone);

            UI.setLoading();
            await this.fetchLead(phone);
        }
    },

    async fetchLead(phone) {
        try {
            console.log("Manos CRM: Chamando Proxy para ->", phone);
            const url = `${this.API_BASE}/lead-info?phone=${phone}`;

            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: url
            }, (response) => {
                console.log("Manos CRM Proxy Response:", response);

                if (response && response.success && response.data.success) {
                    UI.renderLead(response.data.lead,
                        (id, status) => this.updateStatus(id, status),
                        (id) => this.syncChat(id)
                    );
                    UI.setAlert(true); // Piscar o botão para avisar o consultor
                } else {
                    console.warn("Manos CRM: Lead não encontrado ou erro no Proxy", phone);
                    UI.renderNotFound(phone);
                }
            });
        } catch (err) {
            console.error("Manos CRM: Erro ao buscar lead via Proxy", err);
            UI.renderNotFound(phone + " (Erro de Proxy)");
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
        const messages = Scraper.getMessages();
        try {
            const url = `${this.API_BASE}/sync-messages`;
            chrome.runtime.sendMessage({
                type: 'FETCH_DATA',
                url: url,
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId, messages })
                }
            }, (response) => {
                if (response && response.success && response.data.success) {
                    alert("Conversa sincronizada com sucesso!");
                }
            });
        } catch (err) {
            console.error("Manos CRM: Erro ao sincronizar via Proxy", err);
        }
    }
};

// Start
App.init();
