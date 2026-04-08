/**
 * Manos CRM v2.1 – UI Module
 * 4 botões no menu lateral esquerdo do WhatsApp + painel Shadow DOM
 *
 *  BTN 1: [M]  Lead CRM        – pulso vermelho neon quando lead encontrado
 *  BTN 2: [▦]  Kanban          – painel lateral com funil de vendas
 *  BTN 3: [⚙]  Configurações   – modal de login/URL do CRM
 *  BTN 4: [🔔]  Novos Leads    – badge + shake quando há pendentes
 */

// ─────────────────────────────────────────────────────
// 1. ESTILOS GLOBAIS (injetados no <head> do WhatsApp)
// ─────────────────────────────────────────────────────
const UI = {
    shadow: null,
    sidebar: null,
    activeTab: 'dashboard',

    // Referências dos botões do nav
    btnLead: null,
    btnKanban: null,
    btnConfig: null,
    btnLeads: null,
    _aiAlerts: [],

    // ── Init ──────────────────────────────────────────
    init() {
        if (document.getElementById('manos-crm-root')) return;

        // Shadow DOM para o painel de lead
        const host = document.createElement('div');
        host.id = 'manos-crm-root';
        document.body.appendChild(host);
        this.shadow = host.attachShadow({ mode: 'open' });
        this._injectPanelCSS();

        this.sidebar = document.createElement('div');
        this.sidebar.id = 'panel';
        this.sidebar.innerHTML = `
            <div class="hdr">
                <div class="hdr-row">
                    <div class="logo">MANOS <span>CRM</span></div>
                    <div class="hdr-right">
                        <div class="ver">V2</div>
                        <button class="refresh-btn" id="refresh-btn" title="Atualizar contato">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                                <path d="M21 3v5h-5"/>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                                <path d="M3 21v-5h5"/>
                            </svg>
                        </button>
                        <div class="close-btn" id="close-btn">&times;</div>
                    </div>
                </div>
            </div>
            <div id="content" class="content">
                <div class="placeholder">Selecione um chat para ver informações do CRM.</div>
            </div>
        `;
        this.shadow.appendChild(this.sidebar);
        this.shadow.getElementById('close-btn').onclick = () => this.togglePanel(false);

        // Botão de atualizar — força re-detecção do chat atual
        this.shadow.getElementById('refresh-btn').onclick = () => {
            const btn = this.shadow.getElementById('refresh-btn');
            btn.classList.add('spinning');
            setTimeout(() => btn.classList.remove('spinning'), 1000);
            window.dispatchEvent(new CustomEvent('manos-crm-refresh'));
        };

        // Injetar estilos e botões no nav do WhatsApp
        this._injectNavStyles();
        this._injectNavButtons();
    },

    setLeadFound(found) {
        if (this.btnLead) {
            this.btnLead.classList.toggle('lead-found', found);
        }
    },

    // ── Injetar CSS do painel (Shadow DOM) ────────────
    _injectPanelCSS() {
        const el = document.createElement('style');
        el.textContent = this._panelCSS();
        this.shadow.appendChild(el);
    },

    // ── Injetar CSS dos botões do nav (DOM global) ────
    _injectNavStyles() {
        if (document.getElementById('manos-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'manos-nav-styles';
        style.textContent = `
/* ── Container dos botões Manos no nav do WhatsApp ── */
#manos-nav-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 0;
    border-top: 1px solid rgba(128,128,128,.2);
    margin-top: 4px;
    width: 100%;
}

.manos-nav-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    cursor: pointer;
    transition: background .15s;
    color: #54656f;
    flex-shrink: 0;
}
.manos-nav-btn:hover { background: rgba(84,101,111,.15); color: #1c1c1c; }
.manos-nav-btn svg { width: 24px; height: 24px; }

/* Badge de notificação (Btn 4) */
.manos-badge {
    display: none;
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #E53E3E;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    align-items: center;
    justify-content: center;
    font-family: Inter, sans-serif;
    border: 2px solid #f0f2f5;
}
.manos-badge.visible { display: flex; }

/* ── Pulse Neon – Btn 1 quando lead encontrado ── */
.manos-nav-btn.lead-found {
    color: #E53E3E;
    animation: manos-neon-pulse 1.1s ease-in-out infinite;
}
.manos-nav-btn.lead-found::before,
.manos-nav-btn.lead-found::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid #E53E3E;
    animation: manos-ring-out 1.1s ease-out infinite;
    pointer-events: none;
}
.manos-nav-btn.lead-found::after { animation-delay: .5s; }

@keyframes manos-neon-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(229,62,62,.0), 0 0 6px rgba(229,62,62,.4); }
    50%      { box-shadow: 0 0 0 0 rgba(229,62,62,.0), 0 0 16px rgba(229,62,62,.9); }
}
@keyframes manos-ring-out {
    0%   { transform: scale(1);   opacity: .7; }
    100% { transform: scale(1.9); opacity: 0;  }
}

/* ── Shake + heartbeat – Btn 4 quando há novos leads ── */
.manos-nav-btn.has-leads {
    color: #E53E3E;
    animation: manos-heartbeat .9s ease-in-out infinite;
}
@keyframes manos-heartbeat {
    0%,100% { transform: scale(1); }
    14%     { transform: scale(1.25); }
    28%     { transform: scale(1); }
    42%     { transform: scale(1.18); }
    70%     { transform: scale(1); }
}

/* ── Kanban Panel ── */
#manos-kanban-panel {
    display: none;
    position: fixed;
    top: 0; right: 0;
    width: 540px; height: 100vh;
    background: #0C0C0F;
    border-left: 1px solid rgba(255,255,255,.07);
    z-index: 99990;
    flex-direction: column;
    font-family: Inter, -apple-system, sans-serif;
    box-shadow: -8px 0 40px rgba(0,0,0,.7);
}
#manos-kanban-panel.open { display: flex; }
.manos-panel-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 18px;
    background: #111115;
    border-bottom: 1px solid rgba(255,255,255,.06);
    flex-shrink: 0;
}
.manos-panel-title { font-weight: 700; font-size: 13px; color: #fff; letter-spacing: .2px; }
.manos-panel-close {
    cursor: pointer; font-size: 18px; color: rgba(255,255,255,.25); padding: 2px 7px;
    border-radius: 4px; transition: all .15s; line-height: 1;
}
.manos-panel-close:hover { color: rgba(255,255,255,.7); }
.manos-kanban-board {
    flex: 1; overflow-x: auto; overflow-y: hidden;
    display: flex; gap: 10px; padding: 14px;
}
.manos-kanban-col {
    min-width: 160px; max-width: 160px;
    background: #111115; border: 1px solid rgba(255,255,255,.07); border-radius: 10px;
    display: flex; flex-direction: column; overflow: hidden;
}
.manos-kanban-col-hdr {
    padding: 8px 10px; font-size: 8px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.35);
    border-bottom: 1px solid rgba(255,255,255,.05); display: flex;
    justify-content: space-between; align-items: center; flex-shrink: 0;
}
.manos-kanban-col-hdr span.cnt {
    background: rgba(255,255,255,.06); border-radius: 8px;
    padding: 1px 6px; font-size: 9px; color: rgba(255,255,255,.4);
}
.manos-kanban-cards { overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
.manos-kanban-card {
    background: #141418; border: 1px solid rgba(255,255,255,.07); border-radius: 7px;
    padding: 8px 10px; cursor: pointer; transition: border-color .15s;
}
.manos-kanban-card:hover { border-color: rgba(255,255,255,.2); }
.manos-kanban-card .kc-name { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.8); margin-bottom: 3px; }
.manos-kanban-card .kc-vehicle { font-size: 9px; color: rgba(255,255,255,.3); }
.manos-kanban-card .kc-source {
    display: inline-block; margin-top: 4px; font-size: 8px; font-weight: 700;
    padding: 1px 5px; border-radius: 3px;
    background: rgba(59,130,246,.12); color: #60A5FA; text-transform: uppercase;
}

/* ── Auth Modal ── */
#manos-auth-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.7); backdrop-filter: blur(4px); z-index: 99995;
    align-items: center; justify-content: center;
}
#manos-auth-overlay.open { display: flex; }
#manos-auth-modal {
    background: #141418; border: 1px solid rgba(255,255,255,.09); border-radius: 16px;
    padding: 24px; width: 320px;
    box-shadow: 0 24px 60px rgba(0,0,0,.7);
    font-family: Inter, -apple-system, sans-serif;
}
#manos-auth-modal .am-logo { font-weight: 900; font-size: 15px; color: #fff; margin-bottom: 3px; }
#manos-auth-modal .am-logo span { color: #dc2626; }
#manos-auth-modal .am-sub { font-size: 11px; color: rgba(255,255,255,.3); margin-bottom: 20px; }
#manos-auth-modal .am-label { font-size: 9px; font-weight: 600; color: rgba(255,255,255,.3); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 5px; }
#manos-auth-modal input {
    width: 100%; padding: 9px 11px; background: #0E0E12; border: 1px solid rgba(255,255,255,.08);
    border-radius: 8px; color: #fff; font-size: 12px; outline: none; box-sizing: border-box;
    margin-bottom: 12px; font-family: inherit; transition: border-color .15s;
}
#manos-auth-modal input:focus { border-color: rgba(255,255,255,.2); }
#manos-auth-modal .am-section { margin-bottom: 16px; border-top: 1px solid rgba(255,255,255,.05); padding-top: 16px; }
#manos-auth-modal .am-section-title { font-size: 9px; font-weight: 600; color: rgba(255,255,255,.25); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 12px; }
.am-btn {
    width: 100%; padding: 10px; background: #dc2626; border: none; border-radius: 8px;
    color: #fff; font-size: 11px; font-weight: 700; cursor: pointer;
    transition: background .15s; font-family: inherit;
}
.am-btn:hover { background: #b91c1c; }
.am-btn.secondary { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); margin-top: 7px; color: rgba(255,255,255,.5); }
.am-btn.secondary:hover { background: rgba(255,255,255,.09); color: rgba(255,255,255,.8); }
#manos-auth-modal .am-status { font-size: 10px; text-align: center; margin-top: 10px; height: 14px; }
#manos-auth-modal .am-status.ok { color: #10B981; }
#manos-auth-modal .am-status.err { color: #dc2626; }

/* ── New Leads Panel ── */
#manos-leads-panel {
    display: none; position: fixed;
    top: 0; right: 0;
    width: 360px; height: 100vh;
    background: #0C0C0F; border-left: 1px solid rgba(255,255,255,.07);
    z-index: 99990; flex-direction: column;
    font-family: Inter, -apple-system, sans-serif;
    box-shadow: -8px 0 40px rgba(0,0,0,.7);
}
#manos-leads-panel.open { display: flex; }
.manos-lead-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 16px; border-bottom: 1px solid rgba(255,255,255,.04);
    cursor: pointer; transition: background .15s;
}
.manos-lead-item:hover { background: rgba(255,255,255,.03); }
.manos-lead-item .li-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.8); }
.manos-lead-item .li-vehicle { font-size: 10px; color: rgba(255,255,255,.3); margin-top: 2px; }
.manos-lead-item .li-btn {
    padding: 5px 11px; background: rgba(16,185,129,.15); border: 1px solid rgba(16,185,129,.25); border-radius: 6px;
    color: #10B981; font-size: 9px; font-weight: 700; cursor: pointer;
    letter-spacing: .3px; flex-shrink: 0; transition: all .15s;
}
.manos-lead-item .li-btn:hover { background: #10B981; color: #fff; }
        `;
        document.head.appendChild(style);
    },

    // ── Injetar 4 botões no nav lateral ───────────────
    _injectNavButtons() {
        const group = document.createElement('div');
        group.id = 'manos-nav-group';

        // BTN 1 — CRM Lead
        this.btnLead = this._makeNavBtn('manos-btn-lead', 'Manos CRM – Lead', `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.67 0 8 1.34 8 4v2H4v-2c0-2.66 5.33-4 8-4zm0-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
            </svg>`, () => this.togglePanel());

        // BTN 2 — Kanban
        this.btnKanban = this._makeNavBtn('manos-btn-kanban', 'Kanban de Vendas', `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3h5v13H3V3zm7 0h4v8h-4V3zm6 0h5v5h-5V3z"/>
            </svg>`, () => this.toggleKanban());

        // BTN 3 — Config/Auth
        this.btnConfig = this._makeNavBtn('manos-btn-config', 'Configurações', `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.47.47 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.22 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>`, () => this.openAuth());

        // BTN 4 — Novos Leads (com badge)
        this.btnLeads = this._makeNavBtn('manos-btn-leads', 'Novos Leads', `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>`, () => this.toggleLeadsPanel());

        const badge = document.createElement('div');
        badge.className = 'manos-badge';
        badge.id = 'manos-leads-badge';
        this.btnLeads.appendChild(badge);

        group.appendChild(this.btnLead);
        group.appendChild(this.btnKanban);
        group.appendChild(this.btnConfig);
        group.appendChild(this.btnLeads);

        // Tentar injetar no nav do WhatsApp
        const tryInsert = () => {
            const anchor =
                document.querySelector('[data-testid="settings"]') ||
                document.querySelector('[aria-label="Configurações"]') ||
                document.querySelector('[title="Configurações"]');

            if (anchor) {
                // Sobe até encontrar o container pai com múltiplos filhos (o nav)
                let parent = anchor.parentElement;
                while (parent && parent.children.length <= 1) parent = parent.parentElement;

                if (parent) {
                    parent.appendChild(group);
                    return true;
                }
            }
            // Fallback via #pane-side
            const side = document.getElementById('side') || document.getElementById('pane-side');
            if (side) {
                const nav = side.closest('#app')?.querySelector('nav') ||
                            side.parentElement?.previousElementSibling;
                if (nav) { nav.appendChild(group); return true; }
            }
            return false;
        };

        if (!tryInsert()) {
            const obs = new MutationObserver(() => { if (tryInsert()) obs.disconnect(); });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    },

    _makeNavBtn(id, title, svgHTML, onClick) {
        const btn = document.createElement('div');
        btn.id = id;
        btn.className = 'manos-nav-btn';
        btn.title = title;
        btn.innerHTML = svgHTML;
        btn.onclick = onClick;
        return btn;
    },

    // ── Painel de Lead (Shadow DOM) ───────────────────
    togglePanel(force) {
        const panel = this.shadow.getElementById('panel');
        if (typeof force === 'boolean') {
            force ? panel.classList.add('active') : panel.classList.remove('active');
        } else {
            panel.classList.toggle('active');
        }
        // Se abriu, limpa o pulse
        if (panel.classList.contains('active')) {
            this.btnLead?.classList.remove('lead-found');
        }
    },

    setLeadFound(found) {
        if (found) {
            this.btnLead?.classList.add('lead-found');
        } else {
            this.btnLead?.classList.remove('lead-found');
        }
    },

    setLoading() {
        this.shadow.getElementById('content').innerHTML = `
            <div class="center-state"><div class="spinner"></div><div class="sub-text">Buscando lead...</div></div>
        `;
    },

    // ── Kanban Panel ──────────────────────────────────
    toggleKanban(force) {
        let panel = document.getElementById('manos-kanban-panel');
        if (!panel) { panel = this._buildKanbanPanel(); document.body.appendChild(panel); }
        const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        if (open) panel.dataset.loaded !== 'true' && this._triggerKanbanLoad();
    },

    _buildKanbanPanel() {
        const panel = document.createElement('div');
        panel.id = 'manos-kanban-panel';
        panel.innerHTML = `
            <div class="manos-panel-hdr">
                <div class="manos-panel-title">KANBAN – FUNIL DE VENDAS</div>
                <div class="manos-panel-close" id="manos-kanban-close">&times;</div>
            </div>
            <div id="manos-kanban-board" class="manos-kanban-board">
                <div style="margin:auto;color:#555;font-size:12px;font-family:Inter,sans-serif">Carregando...</div>
            </div>
        `;
        panel.querySelector('#manos-kanban-close').onclick = () => this.toggleKanban(false);
        return panel;
    },

    renderKanban(kanban) {
        const board = document.getElementById('manos-kanban-board');
        if (!board) return;

        const stages = [
            { key: 'received',    label: 'Aguardando',    color: '#3B82F6' },
            { key: 'contacted',   label: 'Em Atendimento',color: '#F59E0B' },
            { key: 'scheduled',   label: 'Agendamento',   color: '#EC4899' },
            { key: 'visited',     label: 'Visita',        color: '#A855F7' },
            { key: 'negotiation', label: 'Negociação',    color: '#EF4444' },
            { key: 'closed',      label: 'Vendido',       color: '#10B981' },
            { key: 'lost',        label: 'Perda',         color: '#6B7280' },
        ];

        board.innerHTML = stages.map(stage => {
            const leads = kanban[stage.key] || [];
            const cards = leads.map(l => `
                <div class="manos-kanban-card">
                    <div class="kc-name">${this._esc(l.name || 'Sem nome')}</div>
                    <div class="kc-vehicle">${this._esc(l.vehicle || '—')}</div>
                    <div class="kc-source">${this._esc(l.source || '')}</div>
                </div>`).join('') || '<div style="color:#333;font-size:10px;text-align:center;padding:8px">Vazio</div>';
            return `
                <div class="manos-kanban-col">
                    <div class="manos-kanban-col-hdr" style="border-top:2px solid ${stage.color}">
                        ${stage.label}<span class="cnt">${leads.length}</span>
                    </div>
                    <div class="manos-kanban-cards">${cards}</div>
                </div>`;
        }).join('');

        const panel = document.getElementById('manos-kanban-panel');
        if (panel) panel.dataset.loaded = 'true';
    },

    _triggerKanbanLoad() {
        document.dispatchEvent(new CustomEvent('manos-load-kanban'));
    },

    // ── Auth Modal ────────────────────────────────────
    async openAuth() {
        let overlay = document.getElementById('manos-auth-overlay');
        if (!overlay) { overlay = this._buildAuthModal(); document.body.appendChild(overlay); }
        
        overlay.classList.add('open');
        overlay.querySelector('#am-status').textContent = 'Carregando consultores...';

        try {
            document.dispatchEvent(new CustomEvent('manos-load-consultants', { detail: { overlay } }));

            const s = await chrome.storage.local.get(['consultantId', 'consultantName']);
            // Validar se consultantId é UUID válido (versão antiga salvava nome como texto)
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validId = s.consultantId && UUID_RE.test(s.consultantId) ? s.consultantId : null;
            if (!validId && s.consultantId) {
                // Limpar storage antigo com nome em vez de UUID
                console.warn('Manos CRM: consultantId inválido (nome antigo), limpando...');
                await chrome.storage.local.remove(['consultantId', 'pendingLeads', 'pendingLeadsCount']);
            }
            this._populateConsultants(overlay, validId);
        } catch (e) {
            console.error('Erro ao abrir auth:', e);
        }
    },

    _populateConsultants(overlay, selectedId) {
        const select = overlay.querySelector('#am-consultant-select');
        if (!select) return;

        chrome.runtime.sendMessage({
            type: 'FETCH_DATA',
            url: `https://manoscrm.com.br/api/extension/consultants`, // Ajustado para produção
            options: { headers: { 'Authorization': `Bearer ${App.apiToken}` } }
        }, (r) => {
            const status = overlay.querySelector('#am-status');
            if (r?.success && r.data?.success) {
                const list = r.data.consultants || [];
                select.innerHTML = '<option value="">Selecione seu perfil...</option>' + 
                    list.map(c => `<option value="${c.id}" data-role="${c.role || 'consultant'}" ${c.id === selectedId ? 'selected' : ''}>${c.name}</option>`).join('');
                status.textContent = '';
            } else {
                status.textContent = 'Erro ao carregar consultores.';
                status.className = 'am-status err';
            }
        });
    },

    _buildAuthModal() {
        const overlay = document.createElement('div');
        overlay.id = 'manos-auth-overlay';
        overlay.innerHTML = `
            <div id="manos-auth-modal">
                <div class="am-logo">MANOS <span>CRM</span></div>
                <div class="am-sub">Configurações da Extensão</div>

                <div class="am-section">
                    <div class="am-section-title">Identificação do Vendedor</div>
                    <div class="am-label">Selecione seu Nome</div>
                    <select id="am-consultant-select" style="width:100%;padding:9px;background:#0E0E12;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:12px;margin-bottom:12px;outline:none;">
                        <option value="">Carregando...</option>
                    </select>
                </div>

                <button class="am-btn" id="am-save">Salvar Configuração</button>
                <button class="am-btn secondary" id="am-close">Fechar</button>
                <div class="am-status" id="am-status"></div>
            </div>
        `;

        overlay.querySelector('#am-close').onclick = () => overlay.classList.remove('open');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('open'); };

        overlay.querySelector('#am-save').onclick = () => {
            const select = overlay.querySelector('#am-consultant-select');
            const consultantId = select.value;
            const consultantName = select.options[select.selectedIndex]?.text || '';
            const role = select.options[select.selectedIndex]?.dataset.role || 'consultant';
            const status = overlay.querySelector('#am-status');

            if (!consultantId) {
                status.textContent = 'Selecione um consultor!';
                status.className = 'am-status err';
                return;
            }

            chrome.storage.local.set({ consultantId, consultantName, role }, () => {
                status.textContent = '✓ Configurado com sucesso!';
                status.className = 'am-status ok';
                setTimeout(() => overlay.classList.remove('open'), 1200);
                chrome.runtime.sendMessage({ type: 'POLL_NOW' });
            });
        };

        return overlay;
    },

    // ── Painel de Novos Leads ─────────────────────────
    toggleLeadsPanel(force) {
        let panel = document.getElementById('manos-leads-panel');
        if (!panel) { panel = this._buildLeadsPanel(); document.body.appendChild(panel); }
        const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        if (open) {
            this.btnLeads?.classList.remove('has-leads');
        }
    },

    _buildLeadsPanel() {
        const panel = document.createElement('div');
        panel.id = 'manos-leads-panel';
        panel.innerHTML = `
            <div class="manos-panel-hdr">
                <div class="manos-panel-title">NOVOS LEADS – SEM ATENDIMENTO</div>
                <div class="manos-panel-close" id="manos-leads-close">&times;</div>
            </div>
            <div id="manos-leads-list" style="flex:1;overflow-y:auto">
                <div style="padding:40px 16px;text-align:center;color:#555;font-size:12px;font-family:Inter,sans-serif">
                    Nenhum lead pendente.
                </div>
            </div>
        `;
        panel.querySelector('#manos-leads-close').onclick = () => this.toggleLeadsPanel(false);
        return panel;
    },

    renderPendingLeads(leads) {
        const list = document.getElementById('manos-leads-list');
        if (!list) return;

        const badge = document.getElementById('manos-leads-badge');
        if (badge) {
            if (leads.length > 0) {
                badge.textContent = leads.length > 99 ? '99+' : leads.length;
                badge.classList.add('visible');
                this.btnLeads?.classList.add('has-leads');
            } else {
                badge.classList.remove('visible');
                this.btnLeads?.classList.remove('has-leads');
            }
        }

        if (!leads.length) {
            list.innerHTML = `<div style="padding:40px 16px;text-align:center;color:#555;font-size:12px;font-family:Inter,sans-serif">Nenhum lead pendente.</div>`;
            return;
        }

        list.innerHTML = leads.map(l => `
            <div class="manos-lead-item" data-phone="${this._esc(l.phone || '')}">
                <div>
                    <div class="li-name">${this._esc(l.name || 'Sem nome')}</div>
                    <div class="li-vehicle">${this._esc(l.vehicle || l.interesse || '—')}</div>
                </div>
                <button class="li-btn" data-phone="${this._esc(l.phone || '')}">
                    Contatar
                </button>
            </div>
        `).join('');

        // Clicar em "Contatar" abre conversa no WhatsApp
        list.querySelectorAll('.li-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const phone = btn.dataset.phone;
                if (phone) {
                    window.open(`https://web.whatsapp.com/send?phone=${phone}`, '_self');
                    this.toggleLeadsPanel(false);
                }
            };
        });
    },

    // ── Lead Panel (renders) ──────────────────────────
    renderLead(lead, handlers) {
        this._lead = lead;
        this._handlers = handlers;
        const crmUrl = handlers.crmUrl || '';
        this._crmUrl = crmUrl;
        
        // Buscar papel do usuário para habilitar exclusão
        chrome.storage.local.get(['role'], (s) => {
            this._userRole = s.role || 'consultant';
            this._renderLeadInternal(lead, handlers);
        });
    },

    _renderLeadInternal(lead, handlers) {
        const crmUrl = handlers.crmUrl || '';
        const c = this.shadow.getElementById('content');
        if (!c) return;
        const stageColor = this._stageColor(lead.status);
        const stageLabel = this._stageLabel(lead.status);
        const crmLink = `${crmUrl}/v2/leads?id=${lead.raw_id || lead.id}`;
        const score = lead.score || 0;
        const sl = this._scoreInfo(score);
        const phone = lead.phone || '';
        const phoneClean = phone.replace(/\D/g, '');
        const phoneFmt = phone.replace(/^55(\d{2})(\d{4,5})(\d{4}).*/, '($1) $2-$3') || phone;
        const initial = (lead.name || '?')[0].toUpperCase();
        
        const ALL_STAGES = [
            { val: 'entrada',     label: 'ENTRADA',       color: '#3B82F6', icon: '⚡' },
            { val: 'triagem',     label: 'TRIAGEM',       color: '#EAB308', icon: '📋' },
            { val: 'ataque',      label: 'ATAQUE',        color: '#DC2626', icon: '🎯' },
            { val: 'fechamento',  label: 'FECHAMENTO',    color: '#22C55E', icon: '🤝' },
            { val: 'vendido',     label: 'VENDIDO',       color: '#F59E0B', icon: '🏆' },
            { val: 'perdido',     label: 'PERDIDO',       color: '#6B7280', icon: '💀' },
        ];

        c.innerHTML = `
            <!-- ── Lead Header v2 (Dropdown & Score Badge) ── -->
            <div class="lh-wrap">
                <div class="lh-top">
                    <div class="lh-avatar">${initial}</div>
                    <div class="lh-info">
                        <div class="lh-name-row">
                            <span class="lh-name">${this._esc(lead.name || 'Sem nome')}</span>
                            <a href="${crmLink}" target="_blank" class="crm-link" title="Abrir no CRM">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                        </div>
                        <div class="lh-phone-row">
                            <span class="lh-phone">${phoneFmt}</span>
                            ${phoneClean.length >= 10 ? `<button class="lh-wa-btn" id="lh-wa-btn" title="Abrir no WhatsApp">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.067 2.877 1.215 3.076.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                WhatsApp
                            </button>` : ''}
                        </div>
                    </div>
                </div>

                <!-- ── Score row + Status Dropdown ── -->
                <div class="lh-score-row">
                    <!-- Dropdown de Status -->
                    <div class="status-dropdown-wrap">
                        <button class="status-dropdown-btn" id="status-btn" style="--sc:${stageColor}">
                            <span id="status-label-icon">${this._stageIcon(lead.status)}</span>
                            <span id="status-label-txt">${stageLabel}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left:2px;opacity:0.6"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                        <div class="status-menu" id="status-menu">
                            ${ALL_STAGES.map(s => `
                                <div class="status-opt${lead.status === s.val ? ' active' : ''}" data-val="${s.val}" style="--sc:${s.color}">
                                    <span>${s.icon} ${s.label}</span>
                                    ${lead.status === s.val ? '✓' : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Score Badge -->
                    <div style="position:relative;margin-left:auto;display:flex;align-items:center;gap:8px">
                        <div class="score-badge" id="score-badge" style="background:${sl.color}15;border-color:${sl.color}40">
                            <span class="score-badge-val" style="color:${sl.color}">${score}%</span>
                            <span class="score-badge-label" style="color:${sl.color}99">${sl.label}</span>
                        </div>
                        
                        <!-- Popover de Feedback -->
                        <div class="fb-popover" id="fb-popover">
                            <div id="fb-content">
                                <!-- Preenchido via _renderFeedbackOptions -->
                            </div>
                        </div>

                        ${lead.vendedor && lead.vendedor !== 'Não atribuído' ? `
                        <div class="lh-cons-badge" title="${this._esc(lead.vendedor)}">
                            ${lead.vendedor.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}
                        </div>` : ''}
                    </div>
                </div>
            </div>

            <!-- ── Tabs ── -->
            <div class="tabs" id="tabs">
                <div class="tab ${this.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">Geral</div>
                <div class="tab ${this.activeTab === 'timeline'  ? 'active' : ''}" data-tab="timeline">Timeline</div>
                <div class="tab ${this.activeTab === 'followup'  ? 'active' : ''}" data-tab="followup">Ações</div>
                <div class="tab ${this.activeTab === 'arsenal'   ? 'active' : ''}" data-tab="arsenal">Arsenal</div>
                <div class="tab ${this.activeTab === 'troca'     ? 'active' : ''}" data-tab="troca">Troca</div>
                <div class="tab ${this.activeTab === 'credito'   ? 'active' : ''}" data-tab="credito">Crédito</div>
            </div>
            <div id="tab-content" class="tab-content"></div>
        `;

        // Lógica do Dropdown de Status
        const statusBtn = this.shadow.getElementById('status-btn');
        const statusMenu = this.shadow.getElementById('status-menu');
        if (statusBtn && statusMenu) {
            statusBtn.onclick = (e) => {
                e.stopPropagation();
                statusMenu.classList.toggle('visible');
            };
            statusMenu.querySelectorAll('.status-opt').forEach(opt => {
                opt.onclick = () => {
                    const newVal = opt.dataset.val;
                    const stage = ALL_STAGES.find(s => s.val === newVal);
                    statusMenu.classList.remove('visible');
                    this._handlers.onStatusChange(newVal);
                    // Update visual imediato
                    statusBtn.style.setProperty('--sc', stage.color);
                    this.shadow.getElementById('status-label-icon').textContent = stage.icon;
                    this.shadow.getElementById('status-label-txt').textContent = stage.label.toUpperCase();
                };
            });
        }

        // Lógica do Score Badge / Feedback
        const scoreBadge = this.shadow.getElementById('score-badge');
        const fbPopover = this.shadow.getElementById('fb-popover');
        if (scoreBadge && fbPopover) {
            scoreBadge.onclick = (e) => {
                e.stopPropagation();
                fbPopover.classList.toggle('visible');
                if (fbPopover.classList.contains('visible')) {
                    this._renderFeedbackOptions();
                }
            };
        }

        // Fechar menus ao clicar fora
        this.sidebar.addEventListener('click', () => {
            statusMenu?.classList.remove('visible');
            fbPopover?.classList.remove('visible');
        });

        // WhatsApp button
        this.shadow.getElementById('lh-wa-btn')?.addEventListener('click', () => {
            const script = lead.nextSteps || `Olá ${(lead.name||'').split(' ')[0]}, tudo bem?`;
            window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(script)}`, '_blank');
        });

        this.shadow.getElementById('tabs').onclick = (e) => {
            const tab = e.target.dataset?.tab;
            if (!tab) return;
            this.activeTab = tab;
            this.shadow.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
            this._renderTab();
        };
        this.activeTab = 'dashboard';
        this._aiAlerts = [];
        this._renderTab();
        // Pre-load follow-ups para exibir alertas IA no dashboard
        setTimeout(() => this._handlers.onFollowUp?.(), 300);
    },

    _stageIcon(s) {
        const m = { received: '📥', new: '📥', contacted: '💬', attempt: '💬', confirmed: '💬', scheduled: '📅', visited: '🚗', test_drive: '🚗', negotiation: '💰', proposed: '💰', closed: '🏆', lost: '❌' };
        return m[s] || '⚡';
    },

    _renderFeedbackOptions() {
        const fbContent = this.shadow.getElementById('fb-content');
        const score = this._lead.score || 0;
        const sl = this._scoreInfo(score);
        const options = [
            { id: 'score_alto_demais', label: 'Score alto demais', desc: 'Lead frio mas sistema diz quente', icon: '📉', color: '#f59e0b' },
            { id: 'score_baixo_demais', label: 'Score baixo demais', desc: 'Lead quente mas sistema diz frio', icon: '📈', color: '#dc2626' },
            { id: 'lead_morto', label: 'Lead não é real', desc: 'Número errado, spam ou sem interesse', icon: '💀', color: '#6b7280' },
            { id: 'lead_quente_ignorado', label: 'Pronto para fechar', desc: 'Cliente quer agora, IA não priorizou', icon: '🔥', color: '#ef4444' }
        ];

        fbContent.innerHTML = `
            <div class="fb-hdr">
                <div class="fb-hdr-info">
                    <div class="fb-title">Ajustar Score</div>
                    <div class="fb-sub">Centro de treinamento IA</div>
                </div>
                <div class="fb-hdr-score">${score}%</div>
            </div>
            <div class="fb-body">
                ${options.map(opt => `
                    <div class="fb-opt" data-id="${opt.id}">
                        <div class="fb-opt-icon" style="background:${opt.color}15;color:${opt.color};border-color:${opt.color}25">
                            ${opt.icon}
                        </div>
                        <div class="fb-opt-info">
                            <div class="fb-opt-label">${opt.label}</div>
                            <div class="fb-opt-desc">${opt.desc}</div>
                        </div>
                    </div>
                `).join('')}
                <div style="padding:10px 6px;text-align:center">
                    <button class="ta-recalc" id="fb-recalc-btn">✨ Solicitar Recálculo</button>
                </div>
            </div>
        `;

        fbContent.querySelectorAll('.fb-opt').forEach(el => {
            el.onclick = () => this._renderFeedbackDetails(el.dataset.id);
        });

        fbContent.querySelector('#fb-recalc-btn').onclick = async () => {
            const btn = fbContent.querySelector('#fb-recalc-btn');
            btn.disabled = true; btn.textContent = 'Solicitando...';
            // Chama o handler de recálculo (pode ser o mesmo de nextSteps ou específico)
            if (this._handlers.onRecalculate) await this._handlers.onRecalculate(this._lead.id);
            btn.textContent = '✨ Recalculado!';
            setTimeout(() => {
                this.shadow.getElementById('fb-popover').classList.remove('visible');
            }, 1000);
        };
    },

    _renderFeedbackDetails(categoryId) {
        const fbContent = this.shadow.getElementById('fb-content');
        const opt = { 
            score_alto_demais: 'Score alto demais', 
            score_baixo_demais: 'Score baixo demais',
            lead_morto: 'Lead não é real',
            lead_quente_ignorado: 'Pronto para fechar'
        }[categoryId];

        fbContent.innerHTML = `
            <div class="fb-hdr">
                <div class="fb-hdr-info">
                    <div class="fb-title">Justificar</div>
                    <div class="fb-sub">${opt}</div>
                </div>
            </div>
            <div class="fb-details">
                <label class="fb-label">Detalhamento do especialista</label>
                <textarea class="fb-textarea" id="fb-reason" placeholder="Por que a IA errou desta vez?"></textarea>
                <div class="fb-actions">
                    <button class="fb-btn fb-btn-back" id="fb-btn-back">Voltar</button>
                    <button class="fb-btn fb-btn-submit" id="fb-btn-submit" disabled>Calibrar IA</button>
                </div>
            </div>
        `;

        const txt = fbContent.querySelector('#fb-reason');
        const sub = fbContent.querySelector('#fb-btn-submit');
        txt.oninput = () => { sub.disabled = txt.value.trim().length < 5; };
        
        fbContent.querySelector('#fb-btn-back').onclick = () => this._renderFeedbackOptions();
        fbContent.querySelector('#fb-btn-submit').onclick = async () => {
            const reason = txt.value.trim();
            sub.disabled = true; sub.textContent = 'Enviando...';
            
            const { onScoreFeedback } = this._handlers;
            if (onScoreFeedback) {
                const ok = await onScoreFeedback(this._lead.id, {
                    category: categoryId,
                    reason: reason,
                    score: this._lead.score,
                    score_label: this._scoreInfo(this._lead.score).label,
                    lead_name: this._lead.name,
                    lead_phone: this._lead.phone,
                    lead_status: this._lead.status
                });
                
                if (ok) {
                    fbContent.innerHTML = `
                        <div class="fb-success">
                            <div class="fb-success-icon">✓</div>
                            <div class="fb-success-title">Feedback Processado</div>
                            <div class="fb-success-desc">A IA memorizou sua orientação para calibrar os pesos neurais deste lead.</div>
                        </div>
                    `;
                    setTimeout(() => {
                        this.shadow.getElementById('fb-popover')?.classList.remove('visible');
                    }, 2500);
                } else {
                    sub.disabled = false; sub.textContent = 'Tentar novamente';
                }
            }
        };
    },

    _renderTab() {
        const tc = this.shadow.getElementById('tab-content');
        if (!tc) return;
        const { onStatusChange, onSync, onTimeline, onFollowUp, onArsenal, onInventory, nextSteps, onUpdateField, onFipeSearch } = this._handlers;
        const lead = this._lead;
        switch (this.activeTab) {
            case 'dashboard': this._renderDashboard(tc, lead, onStatusChange, onSync, nextSteps); break;
            case 'timeline':  this._renderTimeline(tc, onTimeline, lead); break;
            case 'followup':  this._renderFollowUp(tc, onFollowUp, lead); break;
            case 'arsenal':   this._renderArsenal(tc, onArsenal, lead); break;
            case 'troca':     this._renderTroca(tc, lead, onUpdateField, onFipeSearch); break;
            case 'credito':   this._renderCrédito(tc, onInventory); break;
        }
    },

    _renderDashboard(tc, lead, onStatusChange, onSync, nextSteps) {
        const actionText = lead.nextSteps || (nextSteps?.proximos_passos?.[0]) || lead.diagnosis || 'Analisar perfil e histórico do lead.';
        const tempoFunil = this._calcTempoFunil(lead.created_at);
        const tempoHoras = lead.created_at ? (Date.now() - new Date(lead.created_at).getTime()) / 36e5 : 0;
        const timeColor = tempoHoras < 24 ? '#10b981' : tempoHoras < 72 ? '#f59e0b' : '#ef4444';

        const aiAlert = this._aiAlerts[0];
        tc.innerHTML = `
            <!-- ── AI Alert Banner (ai_alert_compra) ── -->
            <div class="ai-alert-banner" id="ai-alert-banner" style="display:${aiAlert ? 'flex' : 'none'}">
                <div class="ai-alert-icon">🔔</div>
                <div class="ai-alert-body">
                    <div class="ai-alert-title">Alerta IA — Oportunidade de Compra</div>
                    <div class="ai-alert-msg">${this._esc(aiAlert?.note || 'Lead com alta probabilidade de compra detectada pela IA.')}</div>
                </div>
                <button class="ai-alert-dismiss" id="btn-dismiss-alert">✕</button>
            </div>

            <!-- ── InfoGrid (idêntico ao CRM) ── -->
            <div class="ig-card">
                <div class="ig-row ig-editable" id="ig-edit-interesse">
                    <div class="ig-icon">🚗</div>
                    <div class="ig-body">
                        <div class="ig-label">Interesse</div>
                        <div class="ig-val" id="val-interesse">${this._esc(lead.vehicle || '—')}</div>
                    </div>
                    <div class="ig-edit-icon">✏️</div>
                </div>
                <div class="ig-row ig-editable" id="ig-edit-valor">
                    <div class="ig-icon">💰</div>
                    <div class="ig-body">
                        <div class="ig-label">Valor de Investimento</div>
                        <div class="ig-val" id="val-valor">${this._esc(this._formatPreco(lead.valor))}</div>
                    </div>
                    <div class="ig-edit-icon">✏️</div>
                </div>
                <div class="ig-row">
                    <div class="ig-icon">📍</div>
                    <div class="ig-body"><div class="ig-label">Origem</div><div class="ig-val">${this._esc(lead.origem || lead.source || 'Social')}</div></div>
                </div>
                <div class="ig-row">
                    <div class="ig-icon">📍</div>
                    <div class="ig-body"><div class="ig-label">Cidade</div><div class="ig-val">${this._esc(lead.cidade || lead.region || 'Não informado')}</div></div>
                </div>
                <div class="ig-row">
                    <div class="ig-icon">🧑‍💼</div>
                    <div class="ig-body"><div class="ig-label">Consultor</div><div class="ig-val">${this._esc(lead.vendedor || 'Pendente')}</div></div>
                </div>
                <div class="ig-row">
                    <div class="ig-icon">🔁</div>
                    <div class="ig-body"><div class="ig-label">Troca</div><div class="ig-val">${this._esc(lead.carro_troca || lead.trade_vehicle || lead.troca || 'Não informado')}</div></div>
                </div>
                <div class="ig-row ig-row-last">
                    <div class="ig-icon">⏱</div>
                    <div class="ig-body"><div class="ig-label">Tempo no CRM</div><div class="ig-val" style="color:${timeColor}">${tempoFunil}</div></div>
                </div>
            </div>

            <!-- ── TacticalAction (PRÓXIMA AÇÃO IA) ── -->
            <div class="ta-card">
                <div class="ta-header">
                    <div class="ta-header-left">🤖 <span class="ta-title">Próxima ação IA</span></div>
                    <button class="ta-recalc" id="btn-recalc">✨ Recalcular</button>
                </div>
                <div class="ta-text">${this._esc(actionText)}</div>
                <button class="ta-row" id="btn-execute">
                    <div class="ta-row-icon ta-row-icon-red">⚡</div>
                    <div class="ta-row-body"><div class="ta-row-title">Executar ação</div><div class="ta-row-sub">Abrir scripts de follow-up</div></div>
                    <span class="ta-chevron">›</span>
                </button>
                <button class="ta-row" id="btn-go-arsenal">
                    <div class="ta-row-icon">💬</div>
                    <div class="ta-row-body"><div class="ta-row-title">Script WhatsApp</div><div class="ta-row-sub">Ver templates da etapa atual</div></div>
                    <span class="ta-chevron">›</span>
                </button>
                <button class="ta-row ta-row-last" id="btn-go-timeline">
                    <div class="ta-row-icon">📋</div>
                    <div class="ta-row-body"><div class="ta-row-title">Ver histórico</div><div class="ta-row-sub">Timeline de interações</div></div>
                    <span class="ta-chevron">›</span>
                </button>
            </div>

            <!-- ── Actions ── -->
            <div class="dash-actions">
                <button class="btn-action" id="btn-sync">↻ Sincronizar conversa</button>
            </div>
            <div class="finish-section">
                <button class="btn-finish" id="btn-finish">🏁 Encerrar Missão</button>
            </div>
        `;

        // Dismiss AI alert banner
        this.shadow.getElementById('btn-dismiss-alert')?.addEventListener('click', () => {
            this._aiAlerts = [];
            const banner = this.shadow.getElementById('ai-alert-banner');
            if (banner) banner.style.display = 'none';
        });

        this.shadow.getElementById('btn-recalc').onclick = async (e) => {
            const btn = e.currentTarget; btn.textContent = '✨ Analisando...'; btn.disabled = true;
            setTimeout(() => { btn.textContent = '✨ Recalcular'; btn.disabled = false; }, 2000);
        };
        const goTab = (tab) => {
            this.activeTab = tab;
            this.shadow.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
            this._renderTab();
        };
        this.shadow.getElementById('btn-execute').onclick = () => goTab('arsenal');
        this.shadow.getElementById('btn-go-arsenal').onclick = () => goTab('arsenal');
        this.shadow.getElementById('btn-go-timeline').onclick = () => goTab('timeline');
        this.shadow.getElementById('btn-sync').onclick = async (e) => {
            const btn = e.currentTarget; const orig = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '↻ Sincronizando...';
            try {
                const result = await onSync(lead.id);
                if (result?.success) {
                    const n = result.count || '';
                    btn.innerHTML = `✅ ${n} msgs sincronizadas`;
                    // Ativa filtro WhatsApp e abre timeline para exibir as mensagens
                    this._tlFilter = 'whatsapp';
                    goTab('timeline');
                } else {
                    btn.innerHTML = '❌ Erro ao sincronizar';
                }
            } catch (_) {
                btn.innerHTML = '❌ Erro ao sincronizar';
            } finally {
                setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 3000);
            }
        };
        this.shadow.getElementById('btn-finish').onclick = () => this._renderFinishModal(lead);

        // Listeners para edição inline
        const setupEdit = (id, field, title) => {
            const el = this.shadow.getElementById(id);
            if (!el) return;
            el.onclick = () => {
                const currentVal = this.shadow.getElementById(`val-${field === 'vehicle_interest' ? 'interesse' : 'valor'}`).textContent;
                const newVal = prompt(`Alterar ${title}:`, currentVal === '—' || currentVal === 'Pendente' ? '' : currentVal);
                if (newVal !== null && newVal !== currentVal) {
                    this._handlers.onUpdateField(field, newVal);
                    this.shadow.getElementById(`val-${field === 'vehicle_interest' ? 'interesse' : 'valor'}`).textContent = newVal || '—';
                    if (field === 'vehicle_interest') this._lead.vehicle = newVal;
                    else this._lead.valor = newVal;
                }
            };
        };
        setupEdit('ig-edit-interesse', 'vehicle_interest', 'Interesse');
        setupEdit('ig-edit-valor', 'valor_investimento', 'Valor de Investimento');
    },

    _renderTimeline(tc, onTimeline, lead) {
        const { onAddNote } = this._handlers;
        if (!this._tlFilter) this._tlFilter = 'all';
        const filters = [
            { id: 'all',         label: 'Tudo' },
            { id: 'whatsapp',    label: 'WhatsApp' },
            { id: 'note',        label: 'Notas' },
            { id: 'ai_analysis', label: 'Orientação IA' },
            { id: 'followup',    label: 'Agendas' },
        ];
        tc.innerHTML = `
            <!-- ── NOVA NOTA (idêntico ao CRM) ── -->
            <div class="tl-note-card">
                <div class="tl-note-hdr">
                    <span style="color:#dc2626;font-size:11px">✏</span>
                    <span class="tl-note-hdr-txt">Nova nota</span>
                </div>
                <div class="tl-note-body">
                    <textarea id="note-input" class="note-input" placeholder="O que aconteceu no atendimento?" rows="2"></textarea>
                    <div style="display:flex;justify-content:flex-end;margin-top:8px">
                        <button class="btn-note-save" id="btn-add-note">Registrar</button>
                    </div>
                </div>
            </div>
            <!-- ── Filtros ── -->
            <div class="tl-filters" id="tl-filters">
                ${filters.map(f => `<button class="tl-filter-btn${this._tlFilter === f.id ? ' active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
            </div>
            <!-- ── Lista ── -->
            <div id="tl-list">
                <div class="center-state"><div class="spinner"></div><div class="sub-text">Carregando timeline...</div></div>
            </div>
        `;

        this.shadow.getElementById('btn-add-note').onclick = async () => {
            const inp = this.shadow.getElementById('note-input');
            const note = inp?.value?.trim();
            if (!note) return;
            const btn = this.shadow.getElementById('btn-add-note');
            btn.disabled = true; btn.textContent = 'Salvando...';
            const r = await onAddNote(lead.id, note);
            if (r?.success !== false) { inp.value = ''; btn.textContent = '✅ Salvo!'; }
            else { btn.textContent = '❌ Erro'; }
            setTimeout(() => { btn.disabled = false; btn.textContent = 'Registrar'; }, 1500);
        };

        this.shadow.getElementById('tl-filters').onclick = (e) => {
            const btn = e.target.closest('.tl-filter-btn');
            if (!btn) return;
            this._tlFilter = btn.dataset.filter;
            this.shadow.querySelectorAll('.tl-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === this._tlFilter));
            this._applyTlFilter();
        };

        if (onTimeline) onTimeline(lead.id);
    },

    _renderFollowUp(tc, onFollowUp, lead) {
        const { onCreateFollowUp } = this._handlers;
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30);
        const defaultDt = now.toISOString().slice(0, 16);
        tc.innerHTML = `
            <div class="fu-form">
                <div class="fu-form-title">Novo Follow-up</div>
                <select id="fu-type" class="select" style="margin-bottom:7px">
                    <option value="ligacao">📞 Ligação</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="visita">🚗 Visita</option>
                    <option value="email">📧 E-mail</option>
                </select>
                <input id="fu-datetime" type="datetime-local" class="cf-input" value="${defaultDt}" style="margin-bottom:7px">
                <textarea id="fu-note" class="note-input" placeholder="Observação..." style="height:52px;margin-bottom:7px"></textarea>
                <div class="fu-priority-row" id="fu-priority-row">
                    <button class="fu-pri-btn" data-pri="low">Baixa</button>
                    <button class="fu-pri-btn active" data-pri="medium">Média</button>
                    <button class="fu-pri-btn" data-pri="high">Alta</button>
                </div>
                <button class="btn-action btn-green btn-small" id="btn-create-fu" style="width:100%;margin-top:6px">+ Agendar Follow-up</button>
            </div>
            <div id="fu-list">
                <div class="center-state"><div class="spinner"></div><div class="sub-text">Carregando...</div></div>
            </div>
        `;

        let selectedPriority = 'medium';
        this.shadow.getElementById('fu-priority-row').onclick = (e) => {
            const btn = e.target.closest('.fu-pri-btn');
            if (!btn) return;
            selectedPriority = btn.dataset.pri;
            this.shadow.querySelectorAll('.fu-pri-btn').forEach(b => b.classList.toggle('active', b.dataset.pri === selectedPriority));
        };

        this.shadow.getElementById('btn-create-fu').onclick = async () => {
            const type = this.shadow.getElementById('fu-type').value;
            const scheduled_at = this.shadow.getElementById('fu-datetime').value;
            const note = this.shadow.getElementById('fu-note').value.trim();
            if (!scheduled_at) return;
            const btn = this.shadow.getElementById('btn-create-fu');
            btn.disabled = true; btn.textContent = 'Agendando...';
            const r = await onCreateFollowUp(lead.id, { type, scheduled_at: new Date(scheduled_at).toISOString(), note, priority: selectedPriority });
            if (r?.success !== false) { btn.textContent = '✅ Agendado!'; this.shadow.getElementById('fu-note').value = ''; }
            else { btn.textContent = '❌ Erro'; }
            setTimeout(() => { btn.disabled = false; btn.textContent = '+ Agendar Follow-up'; }, 1500);
        };

        if (onFollowUp) onFollowUp(lead.id);
    },

    _renderArsenal(tc, onArsenal, lead) {
        tc.innerHTML = '<div class="center-state"><div class="spinner"></div><div class="sub-text">Carregando arsenal...</div></div>';
        if (onArsenal) onArsenal(lead.id);
    },

    // ── Finish Mission Modal (inline) ─────────────────
    _renderFinishModal(lead) {
        const { onFinishLead } = this._handlers;
        const tc = this.shadow.getElementById('tab-content');
        if (!tc) return;
        // Switch to dashboard tab visually
        this.shadow.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'dashboard'));
        this.activeTab = 'dashboard';

        const isManagement = this._userRole === 'admin' || this._userRole === 'manager' || this._userRole === 'owner';

        tc.innerHTML = `
            <div class="finish-modal">
                <div class="finish-modal-title">🏁 Encerrar Missão</div>
                <div class="finish-type-group" id="finish-type-group">
                    <button class="finish-type-btn" data-type="venda" style="border-color:#10B98130;color:#10B981">✅ Venda</button>
                    <button class="finish-type-btn" data-type="perda" style="border-color:#ef444430;color:#ef4444">❌ Perda</button>
                </div>
                <div id="finish-venda-fields" style="display:none">
                    <input id="finish-vehicle" class="cf-input" placeholder="Veículo vendido (ex: Onix 2023)" style="margin-bottom:7px">
                    <input id="finish-value" class="cf-input" placeholder="Valor da venda (ex: 85000)" inputmode="numeric" style="margin-bottom:7px">
                </div>
                <div id="finish-perda-fields" style="display:none">
                    <input id="finish-loss" class="cf-input" placeholder="Motivo da perda..." style="margin-bottom:7px">
                </div>
                <button class="btn-finish-confirm" id="btn-finish-confirm" disabled>Confirmar encerramento</button>
                
                ${isManagement ? `
                <div style="margin-top:20px;padding-top:15px;border-top:1px solid rgba(255,255,255,0.05)">
                    <button class="btn-delete-lead" id="btn-delete-lead">🗑️ Excluir Lead Permanentemente</button>
                </div>
                ` : ''}

                <button class="btn-action btn-secondary btn-small" id="btn-finish-cancel" style="width:100%;margin-top:12px">Cancelar</button>
            </div>
        `;

        if (isManagement) {
            this.shadow.getElementById('btn-delete-lead').onclick = async () => {
                if (!confirm("⚠️ ATENÇÃO: Deseja realmente EXCLUIR este lead permanentemente?\n\nEsta ação não poderá ser desfeita.")) return;
                const btn = this.shadow.getElementById('btn-delete-lead');
                btn.disabled = true; btn.textContent = 'Excluindo...';
                
                const r = await this._handlers.onDeleteLead(lead.id);
                if (r?.success) {
                    tc.innerHTML = `<div class="center-state"><div style="font-size:32px;margin-bottom:12px">🗑️</div><div class="nf-title">Lead Excluído</div><div class="sub-text">O registro foi removido do CRM.</div></div>`;
                    setTimeout(() => this.togglePanel(false), 2000);
                } else {
                    btn.disabled = false; btn.textContent = '❌ Erro ao excluir';
                }
            };
        }

        let selectedType = null;
        this.shadow.getElementById('finish-type-group').onclick = (e) => {
            const btn = e.target.closest('.finish-type-btn');
            if (!btn) return;
            selectedType = btn.dataset.type;
            this.shadow.querySelectorAll('.finish-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.shadow.getElementById('finish-venda-fields').style.display = selectedType === 'venda' ? 'block' : 'none';
            this.shadow.getElementById('finish-perda-fields').style.display = selectedType === 'perda' ? 'block' : 'none';
            this.shadow.getElementById('btn-finish-confirm').disabled = false;
        };

        this.shadow.getElementById('btn-finish-cancel').onclick = () => this._renderTab();

        this.shadow.getElementById('btn-finish-confirm').onclick = async () => {
            if (!selectedType) return;
            const btn = this.shadow.getElementById('btn-finish-confirm');
            btn.disabled = true; btn.textContent = 'Encerrando...';
            let details = {};
            if (selectedType === 'venda') {
                details.vehicle_name = this.shadow.getElementById('finish-vehicle').value.trim();
                details.sale_value = this.shadow.getElementById('finish-value').value.trim();
            } else {
                details.loss_reason = this.shadow.getElementById('finish-loss').value.trim();
            }
            const r = await onFinishLead(lead.id, selectedType, details);
            if (r?.success !== false) {
                tc.innerHTML = `<div class="center-state"><div style="font-size:28px;margin-bottom:8px">${selectedType === 'venda' ? '🏆' : '📋'}</div><div class="nf-title">${selectedType === 'venda' ? 'Venda registrada!' : 'Lead encerrado'}</div><div class="sub-text">Lead atualizado no CRM</div></div>`;
            } else {
                btn.disabled = false; btn.textContent = '❌ Erro — Tentar novamente';
            }
        };
    },

    updateTimeline(items) {
        // Verifica pelo DOM — não depende de activeTab (evita spinner eterno)
        const listEl = this.shadow?.getElementById('tl-list');
        if (!listEl) return;
        this._tlEvents = items || [];
        this._applyTlFilter();
    },

    _applyTlFilter() {
        const listEl = this.shadow?.getElementById('tl-list');
        if (!listEl) return;
        const filter = this._tlFilter || 'all';
        let items = this._tlEvents || [];

        if (filter !== 'all') {
            items = items.filter(i => {
                const t = i.type || '';
                if (filter === 'whatsapp')    return t === 'message' || t === 'whatsapp_in' || t === 'whatsapp_out';
                if (filter === 'note')        return t === 'interaction' || t === 'note';
                if (filter === 'ai_analysis') return t === 'ai_system'  || t === 'ai_analysis';
                if (filter === 'followup')    return t === 'followup'   || t.startsWith('followup');
                return true;
            });
        }

        if (!items.length) {
            listEl.innerHTML = '<div class="placeholder">Nenhum registro encontrado.</div>';
            return;
        }

        const EVENT_CFG = {
            status_change:      { color: '#3b82f6', label: 'Status' },
            note:               { color: '#a855f7', label: 'Nota' },
            interaction:        { color: '#a855f7', label: 'Nota' },
            call:               { color: '#22c55e', label: 'Ligação' },
            whatsapp_in:        { color: '#25d366', label: 'Cliente' },
            whatsapp_out:       { color: '#3b82f6', label: 'Vendedor' },
            message:            { color: '#25d366', label: 'WhatsApp' },
            ai_system:          { color: '#f59e0b', label: 'Orientação IA' },
            ai_analysis:        { color: '#f59e0b', label: 'Orientação IA' },
            followup:           { color: '#06b6d4', label: 'Agendado' },
            followup_created:   { color: '#06b6d4', label: 'Agendado' },
            followup_completed: { color: '#22c55e', label: 'Concluído' },
            followup_missed:    { color: '#ef4444', label: 'Perdido' },
            visit:              { color: '#8b5cf6', label: 'Agenda' },
            sale:               { color: '#22c55e', label: 'Venda' },
        };
        const fmt = (ts) => {
            if (!ts) return '';
            try { return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(ts)); } catch (_) { return ts; }
        };

        const fmtTime = (ts) => {
            if (!ts) return '';
            try { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); } catch (_) { return ''; }
        };
        const isWAFilter = filter === 'whatsapp';
        const wrapClass  = isWAFilter ? 'wa-chat-area' : 'tl-event-list';

        listEl.innerHTML = `<div class="${wrapClass}">` + items.map((i, idx) => {
            const ts  = i.timestamp || i.created_at;
            const isWA = i.type === 'whatsapp_in' || i.type === 'whatsapp_out';

            if (isWA) {
                const isOut = i.type === 'whatsapp_out';
                return `
                <div class="wa-row ${isOut ? 'wa-row-out' : 'wa-row-in'}">
                    <div class="wa-bubble ${isOut ? 'wa-bbl-out' : 'wa-bbl-in'}">
                        <div class="wa-txt">${this._esc(i.content || '')}</div>
                        <div class="wa-meta">
                            <span class="wa-time">${fmtTime(ts)}</span>
                            ${isOut ? '<span class="wa-tick">✓✓</span>' : ''}
                        </div>
                    </div>
                </div>`;
            }

            const cfg = EVENT_CFG[i.type] || { color: '#6b7280', label: 'Sistema' };
            return `
            <div class="tl-event-row">
                <div class="tl-dot-wrap">
                    <div class="tl-dot-circle" style="background:${cfg.color}"></div>
                    ${idx < items.length - 1 ? '<div class="tl-dot-line"></div>' : ''}
                </div>
                <div class="tl-event-body">
                    <div class="tl-event-top">
                        <div class="tl-event-tags">
                            <span class="tl-event-type" style="color:${cfg.color};background:${cfg.color}15">${cfg.label}</span>
                            <span class="tl-event-title">${this._esc(i.title || '')}</span>
                        </div>
                        <span class="tl-event-time">${fmt(ts)}</span>
                    </div>
                    ${(i.content || i.description) ? `<div class="tl-event-desc">${this._esc(i.content || i.description || '')}</div>` : ''}
                </div>
            </div>`;
        }).join('') + `</div>`;
    },

    updateFollowUps(items) {
        // Cache AI purchase alerts for dashboard banner
        const newAlerts = (items || []).filter(i => i.type === 'ai_alert_compra' && i.status === 'pending');
        this._aiAlerts = newAlerts;
        // Update banner if dashboard is visible
        const banner = this.shadow?.getElementById('ai-alert-banner');
        if (banner) {
            if (newAlerts.length > 0) {
                banner.style.display = 'flex';
                const msg = banner.querySelector('.ai-alert-msg');
                if (msg) msg.textContent = newAlerts[0].note || 'Lead com alta probabilidade de compra detectada pela IA.';
            } else {
                banner.style.display = 'none';
            }
        }

        const listEl = this.shadow?.getElementById('fu-list');
        if (!listEl) return;  // Não está na aba Ações — não bloqueia com activeTab
        const target = listEl;
        const { onCompleteFollowUp } = this._handlers;
        const leadId = this._lead?.id;

        const typeIcon = { ligacao: '📞', whatsapp: '💬', visita: '🚗', email: '📧' };
        const priColor = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };

        const fmt = (ts) => {
            if (!ts) return '';
            try { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); } catch (_) { return ts; }
        };

        if (!items?.length) { target.innerHTML = '<div class="placeholder">Nenhum follow-up agendado.</div>'; return; }

        target.innerHTML = `<div class="fu-list-title">Follow-ups agendados</div>` + items.map(i => {
            const icon = typeIcon[i.type] || '📋';
            const isDone = i.status === 'completed' || i.status === 'missed';
            const pColor = priColor[i.priority] || '#555';
            return `
            <div class="fu-item ${isDone ? 'fu-done' : ''}">
                <div class="fu-item-hdr">
                    <span class="fu-type-icon">${icon}</span>
                    <span class="fu-date">${fmt(i.scheduled_at)}</span>
                    <span class="fu-pri-dot" style="background:${pColor}" title="${i.priority || ''}"></span>
                    ${!isDone ? `<button class="fu-done-btn" data-id="${this._esc(i.id)}">✓ Concluir</button>` : `<span class="fu-status-tag">${i.status === 'completed' ? '✅' : '⚠️'}</span>`}
                </div>
                ${i.note ? `<div class="fu-desc">${this._esc(i.note)}</div>` : ''}
            </div>`;
        }).join('');

        target.querySelectorAll('.fu-done-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const fuId = btn.dataset.id;
                btn.textContent = '...'; btn.disabled = true;
                await onCompleteFollowUp(fuId, leadId);
            };
        });
    },

    updateArsenal(scripts) {
        const tc = this.shadow?.getElementById('tab-content');
        // Verifica pelo DOM — só atualiza se o tab-content existir e for a aba arsenal
        if (!tc || !tc.querySelector('.center-state')) return;
        if (!scripts?.length) { tc.innerHTML = '<div class="placeholder">Nenhum script disponível.</div>'; return; }
        tc.innerHTML = scripts.map((s, i) => `
            <div class="script-card">
                <div class="script-title">${this._esc(s.title || s.name || `Script ${i + 1}`)}</div>
                <div class="script-text">${this._esc(s.content || s.text || '')}</div>
                <button class="script-send-btn" data-text="${this._esc(s.content || s.text || '')}">📤 Usar no WhatsApp</button>
            </div>`).join('');
        tc.querySelectorAll('.script-send-btn').forEach(btn => {
            btn.onclick = () => {
                const ok = this._injectWAMessage(btn.dataset.text);
                btn.textContent = ok ? '✅ Injetado!' : '📋 Copiado!';
                if (!ok) navigator.clipboard.writeText(btn.dataset.text).catch(() => {});
                setTimeout(() => { btn.textContent = '📤 Usar no WhatsApp'; }, 2000);
            };
        });
    },

    // ── Atualiza header sem re-renderizar o painel ────
    updateLeadHeader(lead) {
        if (!this.shadow) return;
        this._lead = { ...this._lead, ...lead };

        const score = lead.score || 0;
        const sl = this._scoreInfo(score);

        // Atualizar Badge de Score
        const badgeVal = this.shadow.querySelector('.score-badge-val');
        const badgeLbl = this.shadow.querySelector('.score-badge-label');
        const badge = this.shadow.querySelector('.score-badge');
        
        if (badgeVal) { badgeVal.textContent = `${score}%`; badgeVal.style.color = sl.color; }
        if (badgeLbl) { badgeLbl.textContent = sl.label; badgeLbl.style.color = `${sl.color}99`; }
        if (badge) {
            badge.style.background = `${sl.color}15`;
            badge.style.borderColor = `${sl.color}40`;
        }

        // Atualizar Dropdown de Status
        const statusBtn = this.shadow.querySelector('#status-btn');
        const statusIcon = this.shadow.querySelector('#status-label-icon');
        const statusTxt = this.shadow.querySelector('#status-label-txt');
        
        if (statusBtn && lead.status) {
            const color = this._stageColor(lead.status);
            statusBtn.style.setProperty('--sc', color);
            if (statusIcon) statusIcon.textContent = this._stageIcon(lead.status);
            if (statusTxt) statusTxt.textContent = this._stageLabel(lead.status);
        }
    },

    renderNextSteps(data) {
        const sec = this.shadow?.getElementById('ai-section');
        if (!sec || !data) return;
        sec.style.display = 'block';
        this._fillAISteps(data);
    },

    _fillAISteps(data) {
        const diag = this.shadow?.getElementById('ai-diag');
        const list = this.shadow?.getElementById('ai-steps');
        if (diag) diag.innerText = data.diagnostico || '';
        if (list) {
            let steps = data.proximos_passos || [];
            if (typeof steps === 'string') steps = steps.split(' | ').filter(Boolean);
            list.innerHTML = steps.map(s => `<div class="ai-step">${this._esc(s)}</div>`).join('');
        }
    },

    _renderTroca(tc, lead, onUpdateField) {
        let vehicle = lead.carro_troca || lead.trade_vehicle || lead.troca || '';
        let saving = false;
        let saved = false;

        const render = () => {
            tc.innerHTML = `
                <div class="ig-card" style="padding:16px;margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
                        <div class="ig-icon" style="color:#60A5FA;background:rgba(59,130,246,.1)">🚗</div>
                        <div>
                            <div class="ig-label">Veículo de Troca</div>
                            <div style="font-size:11px;color:rgba(255,255,255,.3)">Informações para o CRM</div>
                        </div>
                    </div>

                    <div style="margin-bottom:16px">
                        <label class="cf-label">Modelo / Ano / Placa</label>
                        <textarea class="cf-input" id="tr-vehicle" placeholder="Ex: Onix 2021 Preto Placa ABC-123" style="height:80px;resize:none">${this._esc(vehicle)}</textarea>
                    </div>

                    <button class="cf-submit" id="tr-save" ${saving ? 'disabled' : ''} style="background:${saved ? '#10B981' : '#dc2626'}">
                        ${saving ? 'Salvando...' : saved ? '✓ Veículo Salvo' : 'Salvar Veículo de Troca'}
                    </button>
                    
                    ${saved ? `
                    <div style="margin-top:12px;padding:10px;background:rgba(16,185,129,.1);border-radius:8px;border:1px solid rgba(16,185,129,.2);display:flex;align-items:center;gap:8px">
                        <span style="color:#10B981;font-size:14px">✓</span>
                        <div style="font-size:10px;color:#10B981;font-weight:600">Atualizado na Visão Geral do Lead</div>
                    </div>
                    ` : ''}
                </div>

                <div style="margin-top:12px;padding:12px;background:rgba(245,158,11,.05);border-radius:10px;border:1px solid rgba(245,158,11,.1);display:flex;gap:10px">
                    <span style="font-size:14px">🛡️</span>
                    <div style="font-size:10px;color:rgba(245,158,11,.6);line-height:1.4">
                        Apenas salve as informações do veículo aqui. 
                        O CRM usará esses dados para a análise técnica do avaliador.
                    </div>
                </div>
            `;

            const input = tc.querySelector('#tr-vehicle');
            input.oninput = e => { 
                vehicle = e.target.value; 
                if (saved) { saved = false; render(); }
            };

            tc.querySelector('#tr-save').onclick = async () => {
                if (!vehicle.trim()) return;
                saving = true;
                render();
                
                try {
                    await onUpdateField('carro_troca', vehicle.trim());
                    // Também atualizar localmente o lead para o dashboard
                    this._lead.carro_troca = vehicle.trim();
                    saved = true;
                } catch (err) {
                    console.error('Erro ao salvar troca:', err);
                } finally {
                    saving = false;
                    render();
                }
            };
        };

        render();
    },

    // ── Aba Crédito (Financiamento) ──────────────────
    _renderCrédito(tc) {
        tc.innerHTML = `
            <div style="height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;gap:20px">
                <div style="height:64px;width:64px;border-radius:18px;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.15);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(220,38,38,.05)">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6">
                        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                </div>
                <div>
                    <h3 style="color:#fff;font-weight:800;font-size:18px;margin:0 0 8px;letter-spacing:-0.01em">Módulo de Financiamento</h3>
                    <p style="color:rgba(255,255,255,0.3);font-size:13px;max-width:260px;margin:0 auto;line-height:1.5">
                        Estamos preparando um simulador avançado com aprovação direta via IA.
                    </p>
                </div>
                <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:6px 14px;background:rgba(255,255,255,0.04);border-radius:100px;border:1px solid rgba(255,255,255,0.08);margin-top:4px">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#FBBF24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    <span style="font-size:9px;font-weight:900;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1.5px">Próxima Atualização</span>
                </div>
            </div>
        `;
    },

    // ── Simulação de Financiamento ────────────────────
    _renderSimular(tc, onInventory) {
        tc.innerHTML = `
            <div class="sim-header">
                <div class="sim-title">Simulação de Financiamento</div>
                <div class="sim-sub">Selecione um veículo do estoque</div>
            </div>
            <div class="sim-search-wrap">
                <input id="sim-search" class="sim-search" placeholder="Buscar marca, modelo..." autocomplete="off">
            </div>
            <div id="sim-list" class="sim-list">
                <div class="center-state"><div class="spinner"></div><div class="sub-text">Carregando estoque...</div></div>
            </div>
            <div id="sim-calc" class="sim-calc" style="display:none"></div>
        `;

        this.shadow.getElementById('sim-search').oninput = (e) => {
            this._filterSimList(e.target.value);
        };

        if (onInventory) onInventory();
    },

    _filterSimList(q) {
        const items = this.shadow.querySelectorAll('.sim-car-item');
        const term = (q || '').toLowerCase();
        items.forEach(el => {
            const text = (el.dataset.search || '').toLowerCase();
            el.style.display = !term || text.includes(term) ? 'flex' : 'none';
        });
    },

    updateInventory(items) {
        const list = this.shadow?.getElementById('sim-list');
        if (!list || this.activeTab !== 'simular') return;

        if (!items?.length) {
            list.innerHTML = '<div class="placeholder">Estoque não disponível.</div>';
            return;
        }

        list.innerHTML = items.map((car, i) => {
            const nome = `${car.marca || ''} ${car.modelo || ''}`.trim();
            const preco = this._formatPrice(car.preco);
            const km = car.km ? `${Number(String(car.km).replace(/\D/g,'')).toLocaleString('pt-BR')} km` : '';
            const search = `${car.marca} ${car.modelo} ${car.ano} ${car.combustivel}`.toLowerCase();
            return `
                <div class="sim-car-item" data-idx="${i}" data-search="${this._esc(search)}"
                    data-preco="${car.preco || 0}" data-nome="${this._esc(nome)}" data-ano="${this._esc(car.ano || '')}">
                    <div class="sim-car-info">
                        <div class="sim-car-name">${this._esc(nome)}</div>
                        <div class="sim-car-detail">${car.ano ? this._esc(String(car.ano)) : ''}${km ? ' · ' + km : ''}${car.combustivel ? ' · ' + this._esc(car.combustivel) : ''}</div>
                    </div>
                    <div class="sim-car-price">${preco}</div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.sim-car-item').forEach(el => {
            el.onclick = () => {
                list.querySelectorAll('.sim-car-item').forEach(x => x.classList.remove('selected'));
                el.classList.add('selected');
                const preco = parseFloat(String(el.dataset.preco).replace(/[^\d.]/g, '')) || 0;
                this._showSimCalc(el.dataset.nome, el.dataset.ano, preco);
            };
        });
    },

    _showSimCalc(nome, ano, preco) {
        const calc = this.shadow?.getElementById('sim-calc');
        if (!calc) return;
        calc.style.display = 'block';

        // Estado local da calculadora
        let entry = Math.round(preco * 0.3);
        const RATES = [12, 24, 36, 48, 60];

        const calcInstall = (m) => {
            const amt = preco - entry;
            if (amt <= 0) return 0;
            const r = 0.0199;
            return amt * (r * Math.pow(1 + r, m)) / (Math.pow(1 + r, m) - 1);
        };

        const render = () => {
            const pct = preco > 0 ? Math.round((entry / preco) * 100) : 0;
            const financiado = Math.max(0, preco - entry);
            calc.innerHTML = `
                <div class="sim-calc-header">
                    <div class="sim-calc-car">${this._esc(nome)} ${ano ? this._esc(String(ano)) : ''}</div>
                    <div class="sim-calc-price">${this._formatPrice(preco)}</div>
                </div>
                <div class="sim-entry-row">
                    <div>
                        <div class="sim-entry-label">ENTRADA (${pct}%)</div>
                        <input id="sim-entry-input" class="sim-entry-input" value="${this._fmtNum(entry)}" inputmode="numeric">
                    </div>
                    <div class="sim-fin-val">
                        <div class="sim-entry-label">FINANCIADO</div>
                        <div class="sim-fin-num">${this._formatPrice(financiado)}</div>
                    </div>
                </div>
                <div class="sim-slider-wrap">
                    <input type="range" id="sim-slider" class="sim-slider"
                        min="0" max="${preco}" step="500" value="${entry}">
                </div>
                <div class="sim-parcelas">
                    ${RATES.map(m => {
                        const inst = calcInstall(m);
                        const pop = m === 48;
                        return `
                        <div class="sim-parcela${pop ? ' sim-pop' : ''}">
                            <div class="sim-parcela-m">${m}x${pop ? ' <span class="sim-pop-tag">Popular</span>' : ''}</div>
                            <div class="sim-parcela-val">${this._formatPrice(inst)}</div>
                            <button class="sim-send-btn" data-parcelas="${m}" data-inst="${inst.toFixed(2)}" title="Enviar no WhatsApp">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.067 2.877 1.215 3.076.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                Enviar
                            </button>
                        </div>`;
                    }).join('')}
                </div>
                <div class="sim-disclaimer">Taxa ~2% a.m. · Sujeito a aprovação de crédito</div>
            `;

            // Slider
            calc.querySelector('#sim-slider').oninput = (e) => {
                entry = Number(e.target.value);
                render();
            };

            // Input de entrada manual
            calc.querySelector('#sim-entry-input').onblur = (e) => {
                const v = Number(e.target.value.replace(/\D/g, ''));
                entry = Math.min(v, preco);
                render();
            };
            calc.querySelector('#sim-entry-input').onkeydown = (e) => {
                if (e.key === 'Enter') { e.target.blur(); }
            };

            // Botões de envio
            calc.querySelectorAll('.sim-send-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const parcelas = btn.dataset.parcelas;
                    const inst = parseFloat(btn.dataset.inst);
                    const msg = this._buildSimMsg(nome, ano, preco, entry, parcelas, inst);
                    const ok = this._injectWAMessage(msg);
                    if (!ok) {
                        navigator.clipboard.writeText(msg).catch(() => {});
                        btn.innerHTML = '✅ Copiado!';
                        setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.067 2.877 1.215 3.076.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> Enviar'; }, 2000);
                    } else {
                        btn.innerHTML = '✅ Enviado!';
                        setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.067 2.877 1.215 3.076.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> Enviar'; }, 2000);
                    }
                };
            });
        };

        render();
    },

    _buildSimMsg(nome, ano, preco, entrada, parcelas, inst) {
        const financiado = Math.max(0, preco - entrada);
        const pct = preco > 0 ? Math.round((entrada / preco) * 100) : 0;
        return `🚗 *Simulação de Financiamento — Manos Veículos*\n\n` +
            `*Veículo:* ${nome}${ano ? ' ' + ano : ''}\n` +
            `*Valor:* ${this._formatPrice(preco)}\n` +
            `*Entrada:* ${this._formatPrice(entrada)} (${pct}%)\n` +
            `*Financiado:* ${this._formatPrice(financiado)}\n` +
            `*Parcelas:* ${parcelas}x de ${this._formatPrice(inst)}\n\n` +
            `⚠️ _Simulação sujeita a aprovação de crédito. Taxa: ~2% a.m._\n\n` +
            `Posso te ajudar com mais detalhes? 😊`;
    },

    // Injeta mensagem na caixa de texto do WhatsApp Web
    _injectWAMessage(text) {
        const selectors = [
            '[data-testid="conversation-compose-box-input"]',
            '[contenteditable="true"][data-tab="10"]',
            '[contenteditable="true"][role="textbox"]',
            '#main [contenteditable="true"]',
            'footer [contenteditable="true"]',
        ];
        let box = null;
        for (const sel of selectors) {
            box = document.querySelector(sel);
            if (box) break;
        }
        if (!box) return false;

        try {
            box.focus();
            // Limpa o conteúdo atual
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            // Insere o texto (mantém quebras de linha como \n)
            document.execCommand('insertText', false, text);
            // Garante que o box permaneça focado e o scroll mude
            box.focus(); 
            return true;
        } catch (e) {
            // Fallback: manipulação direta do DOM (Apenas se execCommand falhar/não existir)
            try {
                box.focus();
                box.innerHTML = '';
                // Quebras de linha precisam virar <br> no contenteditable
                const lines = text.split('\n');
                lines.forEach((line, i) => {
                    box.appendChild(document.createTextNode(line));
                    if (i < lines.length - 1) box.appendChild(document.createElement('br'));
                });
                box.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            } catch (_) {
                return false;
            }
        }
    },

    _formatPrice(v) {
        if (!v || v === '0' || v === 0) return 'R$ 0';
        let n = typeof v === 'number' ? v : parseFloat(String(v).replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.')) || 0;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
    },

    _fmtNum(n) {
        return Math.round(n).toLocaleString('pt-BR');
    },

    renderNotFound(phone, contactName, onSubmit) {
        const c = this.shadow.getElementById('content');
        const form = { name: contactName || '', phone, interesse: '', valor: '', tipo: '' };

        const renderInitial = () => {
            c.innerHTML = `
                <div class="center-state">
                    <div class="nf-icon">🔍</div>
                    <div class="nf-title">Lead não encontrado</div>
                    <div class="sub-text" style="margin-bottom:20px">Este contato ainda não está no CRM.</div>
                    <button class="cf-submit" id="btn-start-cad">Deseja cadastrar agora?</button>
                </div>
            `;
            this.shadow.getElementById('btn-start-cad').onclick = renderStep1;
        };

        const renderStep1 = () => {
            c.innerHTML = `
                <div class="cf-header">
                    <div class="cf-title">Novo Cadastro</div>
                    <span class="cf-step">Passo 1 de 2</span>
                </div>
                <div class="cf-field">
                    <label class="cf-label">Telefone</label>
                    <input class="cf-input" id="cf-phone" value="${this._esc(phone)}" readonly>
                </div>

                <div class="cf-field">
                    <label class="cf-label">Nome do contato</label>
                    <input class="cf-input" id="cf-name" placeholder="Nome do cliente" value="${this._esc(form.name)}">
                </div>

                <div class="cf-field">
                    <label class="cf-label">Veículo / Interesse</label>
                    <input class="cf-input" id="cf-interesse" placeholder="Ex: Chevrolet Onix, SUV..." value="${this._esc(form.interesse)}">
                </div>

                <div class="cf-field">
                    <label class="cf-label">Valor de investimento</label>
                    <input class="cf-input" id="cf-valor" placeholder="Ex: R$ 45.000" value="${this._esc(form.valor)}">
                </div>

                <div class="cf-field">
                    <label class="cf-label">Tipo de interesse</label>
                    <div class="cf-tipo-group">
                        <button class="cf-tipo-btn ${form.tipo === 'compra' ? 'selected-compra' : ''}" id="btn-compra">
                            <span class="tipo-icon">🚗</span>
                            Compra
                        </button>
                        <button class="cf-tipo-btn ${form.tipo === 'financiamento' ? 'selected-fin' : ''}" id="btn-fin">
                            <span class="tipo-icon">💳</span>
                            Financiamento
                        </button>
                        <button class="cf-tipo-btn ${form.tipo === 'venda' ? 'selected-venda' : ''}" id="btn-venda">
                            <span class="tipo-icon">🤝</span>
                            Venda
                        </button>
                    </div>
                </div>

                <hr class="cf-divider">
                <button class="cf-submit" id="cf-next" ${!form.tipo ? 'disabled' : ''}>Próximo — Exportar conversa →</button>
            `;

            // Sync inputs back to form object
            this.shadow.getElementById('cf-name').oninput = e => { form.name = e.target.value; };
            this.shadow.getElementById('cf-interesse').oninput = e => { form.interesse = e.target.value; };
            this.shadow.getElementById('cf-valor').oninput = e => { form.valor = e.target.value; };

            const btnCompra = this.shadow.getElementById('btn-compra');
            const btnFin    = this.shadow.getElementById('btn-fin');
            const btnVenda  = this.shadow.getElementById('btn-venda');
            const btnNext   = this.shadow.getElementById('cf-next');

            const selectTipo = (tipo) => {
                form.tipo = tipo;
                btnCompra.className = `cf-tipo-btn ${tipo === 'compra'         ? 'selected-compra' : ''}`;
                btnFin.className    = `cf-tipo-btn ${tipo === 'financiamento'  ? 'selected-fin'    : ''}`;
                btnVenda.className  = `cf-tipo-btn ${tipo === 'venda'          ? 'selected-venda'  : ''}`;
                btnNext.disabled = false;
            };

            btnCompra.onclick = () => selectTipo('compra');
            btnFin.onclick    = () => selectTipo('financiamento');
            btnVenda.onclick  = () => selectTipo('venda');

            btnNext.onclick = () => {
                form.name      = this.shadow.getElementById('cf-name').value.trim() || 'Lead WhatsApp';
                form.interesse = this.shadow.getElementById('cf-interesse').value.trim();
                form.valor     = this.shadow.getElementById('cf-valor').value.trim();
                if (!form.tipo) return;
                renderStep2();
            };
        };

        const renderStep2 = () => {
            // Extrair mensagens do chat atual
            const msgs = typeof Scraper !== 'undefined' ? Scraper.extractMessages() : [];
            const convText = msgs.length
                ? msgs.map(m => `${m.direction === 'inbound' ? '👤 Cliente' : '🧑 Você'}: ${m.text}`).join('\n')
                : '(Nenhuma mensagem detectada nesta conversa)';

            c.innerHTML = `
                <div class="cf-header">
                    <button class="cf-back" id="cf-back">← Voltar</button>
                    <span class="cf-step">Passo 2 de 2</span>
                </div>

                <div style="margin-bottom:12px">
                    <div class="cf-title" style="margin-bottom:3px">Exportar conversa</div>
                    <div style="font-size:11px;color:rgba(255,255,255,.3)">Copie as mensagens antes de finalizar</div>
                </div>

                <div class="cf-conv-preview" id="cf-conv">${this._esc(convText)}</div>

                <button class="cf-copy-btn" id="cf-copy">📋 Copiar conversa</button>

                <div class="info-list" style="margin-bottom:12px">
                    <div class="info-row"><span class="info-label">Nome</span><span class="info-value">${this._esc(form.name)}</span></div>
                    <div class="info-row"><span class="info-label">Telefone</span><span class="info-value">${this._esc(form.phone)}</span></div>
                    <div class="info-row"><span class="info-label">Interesse</span><span class="info-value">${this._esc(form.interesse || '—')}</span></div>
                    <div class="info-row"><span class="info-label">Investimento</span><span class="info-value">${this._esc(form.valor || '—')}</span></div>
                    <div class="info-row"><span class="info-label">Tipo</span><span class="info-value" style="color:${form.tipo === 'venda' ? '#f59e0b' : form.tipo === 'financiamento' ? '#a78bfa' : '#60a5fa'}">${form.tipo === 'venda' ? '🤝 Venda' : form.tipo === 'financiamento' ? '💳 Financiamento' : '🚗 Compra'}</span></div>
                </div>

                <button class="cf-submit" id="cf-finish">Cadastrar no CRM</button>
            `;

            this.shadow.getElementById('cf-back').onclick = renderStep1;

            this.shadow.getElementById('cf-copy').onclick = () => {
                navigator.clipboard.writeText(convText).then(() => {
                    const btn = this.shadow.getElementById('cf-copy');
                    if (btn) { btn.textContent = '✅ Copiado!'; btn.className = 'cf-copy-btn copied'; }
                }).catch(() => {});
            };

            this.shadow.getElementById('cf-finish').onclick = () => {
                const btn = this.shadow.getElementById('cf-finish');
                btn.disabled = true;
                btn.textContent = 'Cadastrando...';
                onSubmit({ ...form, messages: msgs });
            };
        };

        renderInitial();
    },

    // ── Helpers ───────────────────────────────────────
    _esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; },
    // Espelha exatamente formatPreco() de src/lib/shared_utils/helpers.ts:65 + a normalização
    // de centavos legados de InfoGrid.tsx:110-117. Sem isso, valores antigos armazenados em
    // centavos (ex: 3990000) apareceriam diferentes na extensão e no CRM web.
    _formatPreco(value) {
        if (value === null || value === undefined || value === '' || value === '0' || value === 0) return 'Pendente';
        let num;
        if (typeof value === 'number') {
            num = value;
        } else {
            const clean = String(value).replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.');
            num = parseFloat(clean);
        }
        if (isNaN(num) || num === 0) return 'Pendente';
        // Heurística do CRM web: valores legados em centavos vêm como > 1M (ex: 3990000 = R$ 39.900).
        if (num > 1_000_000) num = num / 100;
        return 'R$ ' + Math.round(num).toLocaleString('pt-BR');
    },
    _scoreInfo(score) {
        if (score >= 90) return { label: 'CRÍTICO', color: '#dc2626' };
        if (score >= 70) return { label: 'QUENTE',  color: '#ef4444' };
        if (score >= 50) return { label: 'MORNO',   color: '#f59e0b' };
        if (score >= 30) return { label: 'FRIO',    color: '#6b7280' };
        return { label: 'GELADO', color: '#374151' };
    },

    renderError(msg) {
        const c = this.shadow.getElementById('content');
        if (!c) return;
        c.innerHTML = `
            <div class="center-state">
                <div class="nf-icon">⚠️</div>
                <div class="nf-title">Erro</div>
                <div class="sub-text">${this._esc(msg)}</div>
                <button class="btn-action btn-small" style="margin: 20px auto" onclick="location.reload()">Recarregar Extensão</button>
            </div>
        `;
    },
    _calcTempoFunil(date) {
        if (!date) return '—';
        const h = Math.floor((Date.now() - new Date(date).getTime()) / 36e5);
        if (h < 1)  return 'Menos de 1h';
        if (h < 24) return `${h}h`;
        const d = Math.floor(h / 24);
        if (d < 30) return `${d} dia${d !== 1 ? 's' : ''}`;
        const m = Math.floor(d / 30);
        return `${m} m${m !== 1 ? 'eses' : 'ês'}`;
    },
    _stageLabel(s) {
        const m = { 
            entrada: 'ENTRADA', received: 'ENTRADA', new: 'ENTRADA',
            triagem: 'TRIAGEM', contacted: 'TRIAGEM', attempt: 'TRIAGEM', confirmed: 'TRIAGEM',
            ataque: 'ATAQUE', scheduled: 'ATAQUE', visited: 'ATAQUE', test_drive: 'ATAQUE', visita: 'ATAQUE',
            fechamento: 'FECHAMENTO', negotiation: 'FECHAMENTO', proposed: 'FECHAMENTO',
            vendido: 'VENDIDO', closed: 'VENDIDO',
            perdido: 'PERDIDO', lost: 'PERDIDO'
        };
        return m[s] || s?.toUpperCase() || 'ENTRADA';
    },
    _stageColor(s) {
        const colorMap = {
            entrada: '#3B82F6', received: '#3B82F6', new: '#3B82F6',
            triagem: '#EAB308', contacted: '#EAB308', attempt: '#EAB308',
            ataque: '#DC2626', scheduled: '#DC2626', visited: '#DC2626', test_drive: '#DC2626',
            fechamento: '#22C55E', negotiation: '#22C55E', proposed: '#22C55E',
            vendido: '#F59E0B', closed: '#F59E0B',
            perdido: '#6B7280', lost: '#6B7280'
        };
        return colorMap[s] || '#3B82F6';
    },

    _stageIcon(s) {
        const iconMap = {
            entrada: '⚡', received: '⚡', new: '⚡',
            triagem: '📋', contacted: '📋', attempt: '📋',
            ataque: '🎯', scheduled: '🎯', visited: '🎯', test_drive: '🎯',
            fechamento: '🤝', negotiation: '🤝', proposed: '🤝',
            vendido: '🏆', closed: '🏆',
            perdido: '💀', lost: '💀'
        };
        return iconMap[s] || '⚡';
    },

    // ── CSS do painel (Shadow DOM) ────────────────────
    _panelCSS() {
        return `
/* ── Panel shell ── */
#panel{position:fixed;top:0;right:-440px;width:420px;height:100vh;background:#0C0C0F;border-left:1px solid rgba(255,255,255,.07);z-index:99999;transition:right .3s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 40px rgba(0,0,0,.7);display:flex;flex-direction:column;font-family:Inter,-apple-system,sans-serif;color:#fff;overflow:hidden}
#panel.active{right:0}

/* ── Header ── */
.hdr{padding:12px 16px;background:#111115;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
.hdr-row{display:flex;justify-content:space-between;align-items:center}
.logo{font-weight:900;font-size:14px;letter-spacing:-.3px;color:#fff}.logo span{color:#dc2626}
.hdr-right{display:flex;align-items:center;gap:8px}
.ver{font-size:8px;font-weight:700;color:#dc2626;background:rgba(220,38,38,.12);padding:2px 5px;border-radius:4px;letter-spacing:.8px}
.refresh-btn{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.25);padding:3px;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1}
.refresh-btn svg{width:13px;height:13px}
.refresh-btn:hover{color:rgba(255,255,255,.7);background:rgba(255,255,255,.07)}
.refresh-btn.spinning svg{animation:spin-once .8s linear;color:#dc2626}
@keyframes spin-once{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.close-btn{cursor:pointer;font-size:16px;color:rgba(255,255,255,.25);padding:2px 6px;border-radius:4px;transition:all .15s;line-height:1}.close-btn:hover{color:rgba(255,255,255,.7)}

/* ── Scroll area ── */
.content{flex:1;overflow-y:auto;padding:12px 14px 20px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent}

/* ── Lead header ── */
.lead-section{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.05)}
.lead-avatar{width:38px;height:38px;border-radius:10px;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.15);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;color:#dc2626;flex-shrink:0}
.lead-info{flex:1;min-width:0}
.lead-name-row{display:flex;justify-content:space-between;align-items:center;gap:6px}
.lead-name{font-weight:700;font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crm-link{color:rgba(255,255,255,.2);padding:4px;border-radius:4px;transition:all .15s;display:flex;flex-shrink:0}.crm-link:hover{color:rgba(255,255,255,.6)}
.lead-meta{display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap}
.lead-phone{font-size:11px;color:rgba(255,255,255,.4)}
.lead-perm{font-size:10px;color:#dc2626;font-weight:600}

/* ── Badges ── */
.badges{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
.badge{padding:3px 8px;border-radius:5px;font-size:9px;font-weight:700;letter-spacing:.4px}
.temp-badge{background:rgba(245,158,11,.15);color:#F59E0B}
.origin-badge{background:rgba(59,130,246,.12);color:#60A5FA}

/* ── Tabs ── */
.tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:12px}
.tab{flex:1;text-align:center;padding:9px 4px;font-size:9px;font-weight:700;color:rgba(255,255,255,.3);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;letter-spacing:.4px;text-transform:uppercase}
.tab:hover{color:rgba(255,255,255,.6)}.tab.active{color:#fff;border-bottom-color:#dc2626}

/* ── Info list (replaces cards-grid) ── */
.info-list{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:10px;overflow:hidden;margin-bottom:12px}
.info-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04)}
.info-row:last-child{border-bottom:none}
.info-label{font-size:9px;font-weight:600;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.6px}
.info-value{font-size:12px;font-weight:600;color:rgba(255,255,255,.85);text-align:right;max-width:60%}
.info-value.accent{color:#dc2626}

/* ── Status select ── */
.status-section{margin-bottom:10px}
.section-label{font-size:9px;font-weight:600;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px}
.select{width:100%;padding:9px 10px;background:#141418;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#fff;font-size:11px;font-weight:600;outline:none;cursor:pointer;-webkit-appearance:none;appearance:none;font-family:inherit}
.select:focus{border-color:rgba(255,255,255,.2)}

/* ── Buttons ── */
.btn-action{width:100%;padding:9px;background:#141418;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:rgba(255,255,255,.7);font-size:10px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px;transition:all .15s;font-family:inherit}
.btn-action:hover{background:rgba(255,255,255,.06);color:#fff;border-color:rgba(255,255,255,.15)}
.btn-action:disabled{opacity:.4;cursor:not-allowed}
.btn-secondary{border-style:dashed}
.btn-green{background:#10B981;border-color:#10B981;color:#fff}.btn-green:hover{background:#059669;border-color:#059669}
.btn-small{padding:6px 12px;font-size:9px;width:auto;margin-top:6px}

/* ── AI Section ── */
.ai-section{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px;margin-top:10px}
.ai-header{font-size:9px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;display:flex;align-items:center;gap:5px}
.ai-text{font-size:11px;color:rgba(255,255,255,.6);line-height:1.5;font-style:italic;margin-bottom:8px}
.ai-steps{display:flex;flex-direction:column;gap:4px}
.ai-step{background:rgba(255,255,255,.03);border-left:2px solid rgba(220,38,38,.5);padding:7px 10px;font-size:10px;border-radius:0 6px 6px 0;color:rgba(255,255,255,.65);line-height:1.4}

/* ── Timeline ── */
.tl-item{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.tl-item:last-child{border-bottom:none}
.tl-dot{width:7px;height:7px;border-radius:50%;margin-top:4px;flex-shrink:0}
.tl-body{flex:1;min-width:0}
.tl-text{font-size:11px;color:rgba(255,255,255,.65);line-height:1.4}
.tl-time{font-size:9px;color:rgba(255,255,255,.25);margin-top:2px}

/* ── Follow-ups ── */
.fu-item{padding:10px 12px;background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:8px;margin-bottom:6px}
.fu-date{font-size:10px;color:#dc2626;font-weight:600;margin-bottom:3px}
.fu-desc{font-size:11px;color:rgba(255,255,255,.6);line-height:1.4}
.fu-status{font-size:9px;color:#F59E0B;margin-top:4px;font-weight:600}
.fu-status.done{color:#10B981}

/* ── Scripts/Arsenal ── */
.script-card{padding:12px;background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:8px;margin-bottom:6px}
.script-title{font-size:10px;font-weight:700;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}
.script-text{font-size:11px;color:rgba(255,255,255,.6);line-height:1.4}

/* ── States ── */
.center-state{text-align:center;padding:40px 16px}
.placeholder{text-align:center;padding:40px 16px;font-size:12px;color:rgba(255,255,255,.2)}
.sub-text{font-size:11px;color:rgba(255,255,255,.25);margin-top:8px}
.nf-icon{font-size:32px;margin-bottom:8px}
.nf-title{font-weight:700;font-size:13px;margin-bottom:4px;color:rgba(255,255,255,.7)}
.spinner{width:22px;height:22px;border:2px solid rgba(255,255,255,.08);border-top-color:#dc2626;border-radius:50%;animation:sp .8s linear infinite;margin:0 auto}
@keyframes sp{to{transform:rotate(360deg)}}

/* ── Simulação tab highlight ── */
.sim-tab{color:rgba(255,255,255,.5) !important}
.sim-tab.active{border-bottom-color:#dc2626 !important;color:#fff !important}

/* ── Simulação header ── */
.sim-header{margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)}
.sim-title{font-size:12px;font-weight:700;color:rgba(255,255,255,.85);letter-spacing:.1px}
.sim-sub{font-size:9px;color:rgba(255,255,255,.25);margin-top:3px;font-weight:500;text-transform:uppercase;letter-spacing:.4px}

/* ── Simulação search ── */
.sim-search-wrap{margin-bottom:8px}
.sim-search{width:100%;padding:8px 11px;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#fff;font-size:11px;outline:none;box-sizing:border-box;font-family:Inter,-apple-system,sans-serif;transition:border-color .15s}
.sim-search::placeholder{color:rgba(255,255,255,.2)}
.sim-search:focus{border-color:rgba(255,255,255,.18)}

/* ── Simulação lista ── */
.sim-list{max-height:190px;overflow-y:auto;border:1px solid rgba(255,255,255,.07);border-radius:8px;margin-bottom:10px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.06) transparent}
.sim-car-item{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:background .12s}
.sim-car-item:last-child{border-bottom:none}
.sim-car-item:hover{background:rgba(255,255,255,.03)}
.sim-car-item.selected{background:rgba(220,38,38,.06);border-left:2px solid rgba(220,38,38,.6);padding-left:9px}
.sim-car-info{flex:1;min-width:0}
.sim-car-name{font-size:11px;font-weight:600;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sim-car-detail{font-size:9px;color:rgba(255,255,255,.28);margin-top:1px}
.sim-car-price{font-size:11px;font-weight:700;color:#dc2626;flex-shrink:0;margin-left:10px}

/* ── Calculadora ── */
.sim-calc{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:11px;margin-top:2px}
.sim-calc-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid rgba(255,255,255,.05)}
.sim-calc-car{font-size:10px;font-weight:600;color:rgba(255,255,255,.6);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.3px}
.sim-calc-price{font-size:14px;font-weight:800;color:#dc2626;flex-shrink:0;margin-left:8px}

/* Entrada */
.sim-entry-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.sim-entry-label{font-size:8px;font-weight:700;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.sim-entry-input{background:#0E0E12;border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#fff;font-size:13px;font-weight:700;padding:5px 8px;width:100%;box-sizing:border-box;outline:none;font-family:Inter,-apple-system,sans-serif}
.sim-entry-input:focus{border-color:rgba(255,255,255,.22)}
.sim-fin-val{text-align:right}
.sim-fin-num{font-size:13px;font-weight:700;color:rgba(255,255,255,.5)}

/* Slider */
.sim-slider-wrap{margin-bottom:10px}
.sim-slider{width:100%;height:4px;-webkit-appearance:none;appearance:none;background:linear-gradient(to right,#dc2626 var(--pct,50%),rgba(255,255,255,.1) var(--pct,50%));border-radius:4px;outline:none;cursor:pointer}
.sim-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#dc2626;border:2px solid #fff;cursor:pointer;box-shadow:0 0 6px rgba(220,38,38,.5)}

/* Parcelas */
.sim-parcelas{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.sim-parcela{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:7px}
.sim-parcela.sim-pop{background:rgba(220,38,38,.06);border-color:rgba(220,38,38,.2)}
.sim-parcela-m{font-size:10px;font-weight:700;color:rgba(255,255,255,.4);display:flex;align-items:center;gap:5px}
.sim-pop .sim-parcela-m{color:#dc2626}
.sim-pop-tag{font-size:7px;background:rgba(220,38,38,.2);color:#dc2626;padding:1px 5px;border-radius:4px;font-weight:700}
.sim-parcela-val{font-size:12px;font-weight:700;color:#fff;flex:1;text-align:center}
.sim-pop .sim-parcela-val{color:#dc2626}
.sim-send-btn{display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.25);border-radius:6px;color:#25D366;font-size:9px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:Inter,-apple-system,sans-serif}
.sim-send-btn:hover{background:#25D366;color:#fff}
.sim-disclaimer{font-size:8px;color:rgba(255,255,255,.2);text-align:center;line-height:1.4}

/* ── Score bar (v2) ── */
.score-bar-v2{height:4px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;flex:1;min-width:40px}
.score-bar-v2-fill{height:100%;border-radius:4px;transition:width .5s ease}

/* ── Status Dropdown ── */
.status-dropdown-wrap{position:relative;display:inline-block}
.status-dropdown-btn{display:flex;align-items:center;gap:6px;padding:4.5px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:20px;font-size:9px;font-weight:800;cursor:pointer;color:var(--sc,#fff);transition:all .15s;text-transform:uppercase;letter-spacing:.4px;box-shadow:0 2px 5px rgba(0,0,0,.2)}
.status-dropdown-btn:hover{background:rgba(255,255,255,.07);border-color:var(--sc)}
.status-menu{position:absolute;top:calc(100% + 6px);left:0;width:190px;background:#141418;border:1px solid rgba(255,255,255,.1);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.7);z-index:100100;display:none;flex-direction:column;overflow:hidden;backdrop-filter:blur(10px)}
.status-menu.visible{display:flex}
.status-opt{padding:11px 16px;font-size:10px;font-weight:700;color:rgba(255,255,255,.4);cursor:pointer;transition:all .15s;border-bottom:1px solid rgba(255,255,255,.04);text-transform:uppercase;letter-spacing:.4px;display:flex;align-items:center;justify-content:space-between;text-align:left}
.status-opt:last-child{border-bottom:none}
.status-opt:hover{background:rgba(255,255,255,0.04);color:#fff}
.status-opt.active{color:var(--sc);background:rgba(255,255,255,0.02)}

/* ── Score Badge (Clickable) ── */
.score-badge{display:inline-flex;align-items:center;gap:6px;padding:4.5px 12px;border-radius:20px;background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.25);cursor:pointer;transition:all .2s;flex-shrink:0}
.score-badge:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(220,38,38,.25);background:rgba(220,38,38,.16)}
.score-badge-val{font-size:11px;font-weight:900;color:#dc2626;letter-spacing:.02em}
.score-badge-label{font-size:8px;font-weight:800;color:rgba(220,38,38,.6);text-transform:uppercase;letter-spacing:.05em}

/* ── Feedback Popover (Premium) ── */
.fb-popover{position:absolute;top:calc(100% + 10px);right:0;width:300px;background:rgba(18,18,22,.98);border:1px solid rgba(255,255,255,.12);border-radius:20px;box-shadow:0 25px 80px rgba(0,0,0,.9);z-index:100200;display:none;flex-direction:column;overflow:hidden;backdrop-filter:blur(20px);animation:fb-slide .2s ease-out}
@keyframes fb-slide{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.fb-popover.visible{display:flex}
.fb-hdr{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);background:linear-gradient(135deg,rgba(255,255,255,.04),transparent);display:flex;justify-content:space-between;align-items:center}
.fb-hdr-info{display:flex;flex-direction:column}
.fb-title{font-size:12px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em}
.fb-sub{font-size:8px;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.15em;margin-top:2px}
.fb-hdr-score{width:36px;height:36px;border-radius:10px;background:rgba(0,0,0,.4);border:1px solid rgba(220,38,38,.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#dc2626}
.fb-body{padding:10px;max-height:360px;overflow-y:auto}
.fb-opt{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;cursor:pointer;transition:all .15s;margin-bottom:4px;border:1px solid transparent}
.fb-opt:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08);transform:translateX(4px)}
.fb-opt-icon{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid rgba(255,255,255,.05)}
.fb-opt-info{flex:1;min-width:0}
.fb-opt-label{font-size:11px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.02em}
.fb-opt-desc{font-size:9px;color:rgba(255,255,255,.3);margin-top:3px;line-height:1.4}
.fb-details{padding:16px}
.fb-textarea{width:100%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;color:#fff;font-size:12px;height:100px;resize:none;outline:none;line-height:1.5;margin-bottom:16px;font-family:inherit;transition:border-color .15s}
.fb-textarea:focus{border-color:rgba(59,130,246,.4)}
.fb-actions{display:flex;gap:10px}
.fb-btn{flex:1;height:42px;border-radius:10px;font-size:10px;font-weight:900;text-transform:uppercase;cursor:pointer;transition:all .2s;border:none;font-family:inherit;display:flex;align-items:center;justify-content:center}
.fb-btn-back{background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.08)}
.fb-btn-back:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.7)}
.fb-btn-submit{background:#fff;color:#000;box-shadow:0 8px 16px rgba(0,0,0,.3)}
.fb-btn-submit:hover{transform:translateY(-1px);box-shadow:0 10px 20px rgba(255,255,255,.1)}
.fb-btn-submit:disabled{opacity:.3;cursor:not-allowed;transform:none}
.fb-success{padding:40px 24px;text-align:center}
.fb-success-icon{width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 20px;color:#22c55e}
.fb-success-title{font-size:14px;font-weight:900;color:#fff;text-transform:uppercase;margin-bottom:8px;letter-spacing:.02em}
.fb-success-desc{font-size:11px;color:rgba(255,255,255,.4);line-height:1.6}

/* ── Finish section ── */
.finish-section{margin-top:10px}
.btn-finish{width:100%;padding:10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:8px;color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.btn-finish:hover{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.4)}

/* ── Finish Modal ── */
.finish-modal{padding:4px 0}
.finish-modal-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:12px}
.finish-type-group{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px}
.finish-type-btn{padding:12px 8px;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:Inter,-apple-system,sans-serif}
.finish-type-btn.active{background:rgba(255,255,255,.07)}
.btn-finish-confirm{width:100%;padding:11px;background:#dc2626;border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s;font-family:inherit}
.btn-finish-confirm:hover:not(:disabled){background:#b91c1c}
.btn-finish-confirm:disabled{opacity:.35;cursor:not-allowed}

/* ── Timeline v2 ── */
.note-form{margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06)}
.note-input{width:100%;padding:9px 11px;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:rgba(255,255,255,.8);font-size:11px;outline:none;box-sizing:border-box;font-family:Inter,-apple-system,sans-serif;resize:none;height:64px;line-height:1.4;transition:border-color .15s}
.note-input:focus{border-color:rgba(255,255,255,.2)}
.note-input::placeholder{color:rgba(255,255,255,.2)}
.tl-icon{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;margin-top:2px}
.tl-title{font-size:10px;font-weight:600;color:rgba(255,255,255,.5);margin-bottom:2px}

/* ── Follow-up form ── */
.fu-form{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px;margin-bottom:12px}
.fu-form-title{font-size:9px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}
.fu-priority-row{display:flex;gap:6px}
.fu-pri-btn{flex:1;padding:6px;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:6px;font-size:9px;font-weight:700;color:rgba(255,255,255,.4);cursor:pointer;transition:all .15s;font-family:inherit}
.fu-pri-btn.active{border-color:rgba(220,38,38,.4);color:#dc2626;background:rgba(220,38,38,.08)}
.fu-list-title{font-size:9px;font-weight:700;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}
.fu-item-hdr{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.fu-type-icon{font-size:12px;flex-shrink:0}
.fu-pri-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
.fu-done-btn{margin-left:auto;padding:3px 8px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:5px;color:#10B981;font-size:8px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.fu-done-btn:hover{background:#10B981;color:#fff}
.fu-status-tag{margin-left:auto;font-size:11px}
.fu-done{opacity:.55}
.dash-actions{display:flex;flex-direction:column;gap:0}

/* ── Arsenal send btn ── */
.script-send-btn{margin-top:7px;padding:6px 11px;background:rgba(37,211,102,.08);border:1px solid rgba(37,211,102,.2);border-radius:6px;color:#25D366;font-size:9px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.script-send-btn:hover{background:#25D366;color:#fff}

/* ── Create Lead Form ── */
.cf-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.cf-title{font-size:14px;font-weight:700;color:#fff}
.cf-step{font-size:9px;font-weight:600;color:rgba(255,255,255,.25);background:rgba(255,255,255,.05);padding:2px 8px;border-radius:10px}
.cf-field{margin-bottom:12px}
.cf-label{font-size:9px;font-weight:600;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;display:block}
.cf-input{width:100%;padding:9px 11px;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#fff;font-size:12px;outline:none;box-sizing:border-box;font-family:Inter,-apple-system,sans-serif;transition:border-color .15s}
.cf-input:focus{border-color:rgba(255,255,255,.2)}
.cf-input:read-only{color:rgba(255,255,255,.35);background:rgba(255,255,255,.02);cursor:default}
.cf-tipo-group{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
.cf-tipo-btn{padding:10px 6px;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:rgba(255,255,255,.4);font-size:10px;font-weight:600;cursor:pointer;text-align:center;transition:all .15s;display:flex;flex-direction:column;align-items:center;gap:4px}
.cf-tipo-btn .tipo-icon{font-size:15px}
.cf-tipo-btn.selected-compra{border-color:#3b82f6;background:rgba(59,130,246,.1);color:#60a5fa}
.cf-tipo-btn.selected-fin{border-color:#a78bfa;background:rgba(167,139,250,.1);color:#c4b5fd}
.cf-tipo-btn.selected-venda{border-color:#f59e0b;background:rgba(245,158,11,.1);color:#fbbf24}
.cf-tipo-btn:hover{border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.7)}
.cf-divider{border:none;border-top:1px solid rgba(255,255,255,.05);margin:14px 0}
.cf-submit{width:100%;padding:11px;background:#dc2626;border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s;font-family:inherit}
.cf-submit:hover{background:#b91c1c}
.cf-submit:disabled{opacity:.4;cursor:not-allowed}
.cf-back{background:none;border:none;color:rgba(255,255,255,.3);font-size:11px;cursor:pointer;padding:0;font-family:inherit;transition:color .15s}
.cf-back:hover{color:rgba(255,255,255,.6)}
.cf-conv-preview{background:#0E0E12;border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:10px;max-height:160px;overflow-y:auto;margin-bottom:12px;font-size:10px;color:rgba(255,255,255,.45);line-height:1.5;white-space:pre-wrap;font-family:monospace}
.cf-copy-btn{width:100%;padding:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:rgba(255,255,255,.6);font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px;transition:all .15s;font-family:inherit}
.cf-copy-btn:hover{background:rgba(255,255,255,.09);color:#fff}
.cf-copy-btn.copied{border-color:rgba(34,197,94,.4);color:#4ade80;background:rgba(34,197,94,.06)}

/* ── Lead Header v2 (lh-*) ── */
.lh-wrap{padding:10px 0 0;margin-bottom:0}
.lh-top{display:flex;align-items:flex-start;gap:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)}
.lh-avatar{width:44px;height:44px;border-radius:12px;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.15);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#dc2626;flex-shrink:0}
.lh-info{flex:1;min-width:0}
.lh-name-row{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.lh-name{font-weight:700;font-size:16px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.lh-phone-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lh-phone{font-size:12px;color:rgba(255,255,255,.45)}
.lh-wa-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.2);border-radius:6px;color:#25D366;font-size:9px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;line-height:1}
.lh-wa-btn:hover{background:#25D366;color:#fff}
.lh-score-row{display:flex;align-items:center;gap:7px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap}
.lh-stage-pill{font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:.3px;flex-shrink:0;white-space:nowrap}
.lh-score-wrap{display:flex;align-items:center;gap:5px;flex:1;min-width:0}
.lh-score-bar-track{flex:1;height:4px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;min-width:40px}
.lh-score-bar-fill{height:100%;border-radius:4px;transition:width .5s ease}
.lh-score-txt{font-size:10px;font-weight:700;flex-shrink:0}
.lh-score-label{font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;flex-shrink:0}
.lh-cons-badge{width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:rgba(255,255,255,.5);flex-shrink:0}
.lh-stages{display:flex;gap:5px;padding:8px 0;overflow-x:auto;scrollbar-width:none;margin-bottom:2px}
.lh-stages::-webkit-scrollbar{display:none}
.lh-stage-btn{padding:5px 10px;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:6px;font-size:9px;font-weight:700;cursor:pointer;color:var(--sc,rgba(255,255,255,.4));white-space:nowrap;transition:all .15s;font-family:Inter,-apple-system,sans-serif;letter-spacing:.2px;flex-shrink:0}
.lh-stage-btn:hover{background:rgba(255,255,255,.06);border-color:var(--sc)}
.lh-stage-btn.active{background:rgba(255,255,255,.06);border-color:var(--sc);color:var(--sc)}

/* ── InfoGrid (ig-*) ── */
.ig-card{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden;margin-bottom:12px}
.ig-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.04)}
.ig-row-last{border-bottom:none}
.ig-icon{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.ig-body{flex:1;min-width:0}
.ig-label{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:rgba(255,255,255,.28);font-weight:600;margin-bottom:2px}
.ig-val{font-size:13px;font-weight:600;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ig-editable{cursor:pointer;transition:all .15s;position:relative}
.ig-editable:hover{background:rgba(255,255,255,.03)}
.ig-edit-icon{font-size:10px;opacity:0;transition:opacity .15s;color:rgba(255,255,255,.2);margin-left:auto}
.ig-editable:hover .ig-edit-icon{opacity:1}
.btn-delete-lead{width:100%;padding:9px;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.15);border-radius:8px;color:#ef4444;font-size:10px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.btn-delete-lead:hover{background:rgba(220,38,38,.15);border-color:#ef4444}

/* ── AI Alert Banner (ai_alert_compra) ── */
.ai-alert-banner{align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px;margin-bottom:12px}
.ai-alert-icon{font-size:16px;flex-shrink:0;line-height:1.4}
.ai-alert-body{flex:1;min-width:0}
.ai-alert-title{font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.ai-alert-msg{font-size:11px;color:rgba(255,255,255,.6);line-height:1.5}
.ai-alert-dismiss{flex-shrink:0;background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:13px;padding:0;line-height:1;margin-top:1px;transition:color .15s;font-family:inherit}
.ai-alert-dismiss:hover{color:rgba(255,255,255,.6)}

/* ── TacticalAction (ta-*) ── */
.ta-card{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden;margin-bottom:12px}
.ta-header{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.05)}
.ta-header-left{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:rgba(255,255,255,.5)}
.ta-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.ta-recalc{font-size:9px;color:rgba(255,255,255,.25);background:none;border:none;cursor:pointer;transition:color .15s;font-family:inherit}
.ta-recalc:hover{color:rgba(255,255,255,.6)}.ta-recalc:disabled{opacity:.4;cursor:not-allowed}
.ta-text{padding:12px 14px;font-size:12px;color:rgba(255,255,255,.65);line-height:1.5;border-bottom:1px solid rgba(255,255,255,.05)}
.ta-row{width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.04);background:none;border-left:none;border-right:none;border-top:none;cursor:pointer;transition:background .15s;text-align:left;font-family:inherit}
.ta-row-last{border-bottom:none}
.ta-row:hover{background:rgba(255,255,255,.03)}
.ta-row-icon{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.ta-row-icon-red{background:rgba(220,38,38,.1);border-color:rgba(220,38,38,.2)}
.ta-row-body{flex:1;min-width:0}
.ta-row-title{font-size:12px;font-weight:600;color:rgba(255,255,255,.8)}
.ta-row-sub{font-size:10px;color:rgba(255,255,255,.3);margin-top:1px}
.ta-chevron{font-size:16px;color:rgba(255,255,255,.2);flex-shrink:0}
.ta-row:hover .ta-chevron{color:rgba(255,255,255,.5)}

/* ── Timeline v2 (tl-*) ── */
.tl-note-card{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden;margin-bottom:12px}
.tl-note-hdr{display:flex;align-items:center;gap:7px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.05)}
.tl-note-hdr-txt{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.38)}
.tl-note-body{padding:12px 14px}
.btn-note-save{padding:6px 16px;background:#dc2626;border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;transition:background .15s;font-family:inherit}
.btn-note-save:hover{background:#b91c1c}.btn-note-save:disabled{opacity:.35;cursor:not-allowed}
.tl-filters{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:12px}
.tl-filters::-webkit-scrollbar{display:none}
.tl-filter-btn{padding:6px 12px;border-radius:8px;font-size:10px;font-weight:700;white-space:nowrap;cursor:pointer;transition:all .15s;border:1px solid rgba(255,255,255,.07);background:#141418;color:rgba(255,255,255,.35);font-family:inherit;flex-shrink:0}
.tl-filter-btn:hover{color:rgba(255,255,255,.6)}
.tl-filter-btn.active{background:#dc2626;border-color:rgba(220,38,38,.5);color:#fff}
.tl-event-list{background:#141418;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden}
.tl-event-row{display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.04)}
.tl-event-row:last-child{border-bottom:none}
.tl-dot-wrap{display:flex;flex-direction:column;align-items:center;padding-top:5px;flex-shrink:0;width:8px}
.tl-dot-circle{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.tl-dot-line{width:1px;flex:1;background:rgba(255,255,255,.05);margin-top:4px;min-height:12px}
.tl-event-body{flex:1;min-width:0}
.tl-event-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:3px}
.tl-event-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;min-width:0}
.tl-event-type{font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;white-space:nowrap;flex-shrink:0}
.tl-event-title{font-size:12px;font-weight:600;color:rgba(255,255,255,.75);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-event-time{font-size:9px;color:rgba(255,255,255,.2);white-space:nowrap;flex-shrink:0}
.tl-event-desc{font-size:11px;color:rgba(255,255,255,.5);line-height:1.5;margin-top:4px}

/* ── WhatsApp Chat Bubbles ── */
.wa-chat-area{background:#0B141A;border-radius:12px;padding:10px 8px;display:flex;flex-direction:column;gap:2px}
.wa-row{display:flex;width:100%;padding:1px 0}
.wa-row-out{justify-content:flex-end}
.wa-row-in{justify-content:flex-start}
.wa-bubble{max-width:78%;padding:6px 9px 2px;border-radius:7.5px;font-size:12.5px;line-height:1.45;word-break:break-word}
.wa-bbl-out{background:#005C4B;color:#E9EDEF;border-top-right-radius:2px}
.wa-bbl-in{background:#1F2C34;color:#E9EDEF;border-top-left-radius:2px}
.wa-txt{padding-right:42px}
.wa-meta{display:flex;align-items:center;gap:3px;float:right;margin-left:6px;margin-top:2px;margin-bottom:-2px;clear:right}
.wa-time{font-size:10px;color:rgba(233,237,239,.55);white-space:nowrap}
.wa-tick{font-size:11px;color:#53BDEB;letter-spacing:-1px}
        `;
    }
};
