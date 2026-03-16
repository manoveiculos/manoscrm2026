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
    currentNextSteps: null, // Persiste os próximos passos da IA
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
            this.currentNextSteps = null; // Reset de IA ao refresh
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
                this.currentNextSteps = null; // Reset de IA ao trocar de chat
                UI.setLoading();
                await this.fetchLead(phone);
            }
        } else {
            this.currentPhone = null;
            this.currentLeadId = null;
            this.currentNextSteps = null; // Reset de IA ao não encontrar telefone
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
                    if (lead) {
                        this.currentLeadId = lead.id; // Salva o ID do banco

                        // Restaurar Próximos Passos se existirem no banco e não tivermos no estado atual da sessão
                        if (lead.diagnosis && lead.nextSteps && !this.currentNextSteps) {
                            this.currentNextSteps = {
                                diagnostico: lead.diagnosis,
                                proximos_passos: typeof lead.nextSteps === 'string' ? lead.nextSteps.split(' | ') : lead.nextSteps
                            };
                        }

                        UI.renderLead(
                            lead,
                            this.baseUrl,
                            (id, status) => this.updateStatus(id, status),
                            (id) => this.syncChat(id),
                            this.currentNextSteps // Passa o estado persistido (da sessão ou do banco)
                        );
                        UI.setAlert(true); // Piscar o botão para avisar o consultor
                    } else {
                        console.warn("Manos CRM: Lead não encontrado no retorno da API", phone);
                        UI.renderNotFound(phone, () => this.createLead(phone, name));
                    }
                } else {
                    console.warn("Manos CRM: Lead não encontrado ou erro no Proxy", phone);
                    UI.renderNotFound(phone, () => this.createLead(phone, name));
                }
            });
        } catch (err) {
            console.error("Manos CRM: Erro ao buscar lead via Proxy", err);
            const isContextInvalid = err.message?.includes('Extension context invalidated');
            const errorLabel = isContextInvalid ? "CONTEXTO INVÁLIDO (Recarregue a página)" : "Erro de Proxy";
            UI.renderNotFound(`${phone} (${errorLabel})`, () => { 
                if (isContextInvalid) window.location.reload();
            });
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
        const messages = await Scraper.getFullMessages(25);
        const leadName = Scraper.getName();

        console.log(`Manos CRM: [SYNC] Extraídas ${messages?.length || 0} mensagens.`);
        if (!messages || messages.length === 0) {
            console.error("Manos CRM: [ERROR] Nenhuma mensagem encontrada no DOM.");
            alert("Erro: Não foi possível extrair mensagens do chat. Se a conversa for nova, tente enviar um 'Oi' primeiro.");
            this.isSyncing = false;
            return;
        }

        // Hardening do ID: Prioridade ao ID numérico salvo do banco
        let rawId = this.currentLeadId || leadId;
        let cleanId = rawId.toString().replace(/crm26_|main_|dist_/, '');

        console.log("Manos CRM: [SYNC] Iniciando envio para o CRM...", { id: cleanId, phone: this.currentPhone, count: messages.length });
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
                        body: JSON.stringify({ 
                            leadId: cleanId, 
                            messages,
                            phone: this.currentPhone,
                            name: leadName 
                        })
                    }
                }, resolve);
            });

            if (syncRes && syncRes.success && syncRes.data?.success) {
                const aiResult = syncRes.data.aiAnalysis;
                if (aiResult) {
                    this.currentNextSteps = {
                        diagnostico: aiResult.resumo_estrategico,
                        proximos_passos: (aiResult.proxima_acao || aiResult.next_step || '').split(' | ')
                    };
                    UI.renderNextSteps(this.currentNextSteps);
                }
                
                alert(`Sincronizado! ${syncRes.data?.count || 0} novas mensagens.\nDados e análise atualizados com o CRM.`);
                this.fetchLead(this.currentPhone);
            } else {
                const error = syncRes?.data?.error || syncRes?.error || "Erro na API de Mensagens";
                throw new Error(error);
            }

        } catch (err) {
            console.error("Manos CRM: Erro ao sincronizar via Proxy", err);
            const errorMsg = err.message || "Erro desconhecido";
            alert(`Erro na sincronização: ${errorMsg}\n\nSe o erro persistir, verifique o console do desenvolvedor.`);
        } finally {
            this.isSyncing = false;
        }
    }
};



// Start
App.init();
