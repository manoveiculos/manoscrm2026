import { createClient } from '@/lib/supabase/admin';

const N8N_WEBHOOK_URL =
    process.env.N8N_VENDOR_WEBHOOK_URL ||
    'https://n8n.drivvoo.com/webhook/chamadavendedorcrm';

export type NotifyType = 'lead_arrival' | 'morning_brief' | 'sla_warning' | 'hot_leak_alert';

interface NotifyPayload {
    consultant_name: string;
    consultant_phone: string;
    type: NotifyType;
    message: string;
    meta?: Record<string, any>;
}

function onlyDigits(s?: string | null): string {
    return (s || '').replace(/\D/g, '');
}

function normalizeBRPhone(raw?: string | null): string {
    const d = onlyDigits(raw);
    if (!d) return '';
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
}

function buildWhatsAppLink(leadPhone?: string | null, presetText?: string): string {
    const phone = normalizeBRPhone(leadPhone);
    if (!phone) return '';
    const text = presetText ? `?text=${encodeURIComponent(presetText)}` : '';
    return `https://wa.me/${phone}${text}`;
}

function classificationEmoji(c?: string): string {
    if (c === 'hot') return '🔥';
    if (c === 'warm') return '🌡️';
    return '❄️';
}

async function sendToWebhook(payload: NotifyPayload): Promise<void> {
    try {
        const res = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            console.warn(`[vendorNotify] webhook ${res.status}`, errorText);
            
            // Log de falha no banco (Auditoria Forense)
            try {
                const admin = createClient();
                await admin.from('notification_failures').insert({
                    lead_id: payload.meta?.lead_id,
                    channel: `n8n_${payload.type}`,
                    payload: payload,
                    error_message: `HTTP ${res.status}: ${errorText}`,
                    resolved: false
                });
            } catch (dbErr) {
                console.error('[vendorNotify] Erro ao gravar falha no banco:', dbErr);
            }
        }
    } catch (err: any) {
        const msg = err?.message || 'Erro de conexão/timeout';
        console.warn('[vendorNotify] webhook error:', msg);

        // Log de falha no banco (Auditoria Forense)
        try {
            const admin = createClient();
            await admin.from('notification_failures').insert({
                lead_id: payload.meta?.lead_id,
                channel: `n8n_${payload.type}`,
                payload: payload,
                error_message: msg,
                resolved: false
            });
        } catch (dbErr) {
            console.error('[vendorNotify] Erro ao gravar falha no banco:', dbErr);
        }
    }
}

/**
 * Helper para buscar lead em qualquer vertical e normalizar campos para notificação.
 * Tenta leads_manos_crm (Venda) primeiro, depois leads_compra (Compra).
 */
async function fetchLeadForNotify(cleanId: string) {
    const admin = createClient();
    
    // 1. Tentar Venda
    const { data: vLead } = await admin
        .from('leads_manos_crm')
        .select('id, name, phone, vehicle_interest, source, ai_score, ai_classification, proxima_acao, assigned_consultant_id, valor_investimento')
        .eq('id', cleanId)
        .maybeSingle();

    if (vLead) {
        return {
            ...vLead,
            isCompra: false,
            valor: vLead.valor_investimento
        };
    }

    // 2. Tentar Compra
    const { data: cLead } = await admin
        .from('leads_compra')
        .select('id, nome, telefone, veiculo_original, origem, ai_score, ai_classification, proxima_acao, assigned_consultant_id, valor_cliente')
        .eq('id', cleanId)
        .maybeSingle();

    if (cLead) {
        return {
            id: cLead.id,
            name: cLead.nome,
            phone: cLead.telefone,
            vehicle_interest: cLead.veiculo_original,
            source: cLead.origem,
            ai_score: cLead.ai_score,
            ai_classification: cLead.ai_classification,
            proxima_acao: cLead.proxima_acao,
            assigned_consultant_id: cLead.assigned_consultant_id,
            valor: cLead.valor_cliente?.toString(),
            isCompra: true
        };
    }

    return null;
}

/**
 * Dispara WhatsApp para o vendedor responsável quando um lead novo
 * recebe score IA. Speed-to-lead: vendedor recebe no celular pessoal
 * antes de abrir o CRM.
 */
export async function notifyLeadArrival(leadId: string): Promise<void> {
    const admin = createClient();
    const cleanId = leadId.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_|compra_)/, '');

    const lead = await fetchLeadForNotify(cleanId);
    if (!lead || !lead.assigned_consultant_id) return;

    const { data: consultant } = await admin
        .from('consultants_manos_crm')
        .select('id, name, phone, is_active')
        .eq('id', lead.assigned_consultant_id)
        .maybeSingle();

    if (!consultant || !consultant.is_active || !consultant.phone) return;

    const score = Number(lead.ai_score) || 0;
    const cls = lead.ai_classification || 'cold';
    const firstName = (consultant.name || '').split(' ')[0];
    const leadFirstName = (lead.name || 'cliente').split(' ')[0];

    // Script personalizado
    const script = (lead.proxima_acao && lead.proxima_acao.length > 20)
        ? lead.proxima_acao
        : `Olá ${leadFirstName}! Aqui é o ${firstName} da Manos Veículos. Vi seu interesse em ${lead.isCompra ? 'vender seu' : 'comprar um'} ${lead.vehicle_interest || 'veículo'}. Posso te ajudar?`;

    const wa = buildWhatsAppLink(lead.phone, script);
    const label = lead.isCompra ? '💰 OFERTA DE COMPRA' : '🚗 INTERESSE DE VENDA';
    const valorLabel = lead.isCompra ? 'Preço cliente' : 'Investimento';
    const valorStr = lead.valor ? `\n${valorLabel}: R$ ${lead.valor}` : '';
    const interest = lead.vehicle_interest ? `\n📦 ${lead.vehicle_interest}` : '';

    const message =
        `${classificationEmoji(cls)} *LEAD NOVO • ${lead.name || 'Sem nome'}* (score ${score})\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `${label}` +
        interest +
        valorStr +
        `\n📡 ${lead.source || 'Direto'}` +
        `\n\n📋 *SCRIPT SUGERIDO:*` +
        `\n${script}\n` +
        `\n━━━━━━━━━━━━━━━━━━` +
        (wa ? `\n🚀 *Abrir WhatsApp:*\n${wa}` : '') +
        `\n\n_⏱️ Speed-to-lead é tudo!_`;

    await sendToWebhook({
        consultant_name: consultant.name,
        consultant_phone: normalizeBRPhone(consultant.phone),
        type: 'lead_arrival',
        message: message,
        meta: {
            lead_id: cleanId,
            lead_name: lead.name,
            lead_phone: normalizeBRPhone(lead.phone),
            lead_score: score,
            lead_type: lead.isCompra ? 'compra' : 'venda',
            wa_link: wa
        },
    });
}

interface MorningLead {
    id: string;
    name: string;
    phone: string;
    ai_score: number;
    ai_classification: string;
    proxima_acao: string;
    vehicle_interest: string;
}

/**
 * Briefing matinal: TOP leads quentes + SLA vencendo, enviado às 08h
 * para o WhatsApp pessoal de cada vendedor ativo.
 */
export async function notifyMorningBrief(): Promise<{ sent: number; skipped: number }> {
    const admin = createClient();
    let sent = 0;
    let skipped = 0;

    const { data: consultants } = await admin
        .from('consultants_manos_crm')
        .select('id, name, phone')
        .eq('is_active', true)
        .neq('role', 'admin');

    if (!consultants || consultants.length === 0) return { sent: 0, skipped: 0 };

    for (const c of consultants) {
        if (!c.phone) {
            skipped++;
            continue;
        }

        const { data: leads } = await admin
            .from('leads_manos_crm')
            .select('id, name, phone, ai_score, ai_classification, proxima_acao, vehicle_interest')
            .eq('assigned_consultant_id', c.id)
            .not('status', 'in', '("vendido","perdido","comprado")')
            .gte('ai_score', 60)
            .order('ai_score', { ascending: false })
            .limit(3);

        const top = (leads || []) as MorningLead[];
        if (top.length === 0) {
            skipped++;
            continue;
        }

        const consFirst = (c.name || '').split(' ')[0];
        const lines = top.map((l, i) => {
            const leadFirst = (l.name || 'cliente').split(' ')[0];
            const script = (l.proxima_acao && l.proxima_acao.length > 10)
                ? l.proxima_acao
                : `Olá ${leadFirst}! Aqui é o ${consFirst} da Manos. Posso retomar nosso contato?`;
            const wa = buildWhatsAppLink(l.phone, script);
            return (
                `\n${i + 1}. ${classificationEmoji(l.ai_classification)} *${l.name || 'Sem nome'}* (score ${l.ai_score})` +
                `\n   🚗 ${l.vehicle_interest || '—'}` +
                (wa ? `\n   🚀 ${wa}` : '')
            );
        }).join('\n');

        const message =
            `☀️ *Bom dia ${consFirst}!*\n` +
            `\n${top.length} ${top.length === 1 ? 'lead quente' : 'leads quentes'} para atacar hoje:\n` +
            lines +
            `\n\n_Cada link já abre a conversa com mensagem pronta. Bora vender._`;

        await sendToWebhook({
            consultant_name: c.name,
            consultant_phone: normalizeBRPhone(c.phone),
            type: 'morning_brief',
            message,
            meta: { lead_count: top.length },
        });
        sent++;
    }

    return { sent, skipped };
}

/**
 * Alerta de "vazamento" de leads estratégicos.
 * Busca leads HOT (≥80) sem contato há mais de 15 minutos.
 * Envia um alerta consolidado para o Alexandre (Admin/CEO).
 */
export async function notifyHotLeaksToAdmin(): Promise<{ leaked: number }> {
    const admin = createClient();
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // 1. Buscar no CRM (Venda)
    const { data: vLeads } = await admin
        .from('leads_manos_crm')
        .select('id, name, ai_score, vehicle_interest, assigned_consultant_id')
        .eq('status', 'novo')
        .is('first_contact_at', null)
        .gte('ai_score', 80)
        .lt('created_at', fifteenMinsAgo)
        .limit(10);

    // 2. Buscar no Compra
    const { data: cLeads } = await admin
        .from('leads_compra')
        .select('id, nome, ai_score, veiculo_original, assigned_consultant_id')
        .eq('status', 'novo')
        .is('first_contact_at', null)
        .gte('ai_score', 80)
        .lt('created_at', fifteenMinsAgo)
        .limit(10);

    const vList = (vLeads || []).map(l => ({ ...l, type: 'Venda' }));
    const cList = (cLeads || []).map(l => ({ id: l.id, name: l.nome, ai_score: l.ai_score, vehicle_interest: l.veiculo_original, type: 'Compra', assigned_consultant_id: l.assigned_consultant_id }));
    const allLeaked = [...vList, ...cList];

    if (allLeaked.length === 0) return { leaked: 0 };

    // Buscar nomes dos vendedores para o relatório
    const consultantIds = [...new Set(allLeaked.map(l => l.assigned_consultant_id).filter(Boolean))];
    const { data: consultants } = await admin
        .from('consultants_manos_crm')
        .select('id, name')
        .in('id', consultantIds);

    const consultantMap = (consultants || []).reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {} as Record<string, string>);

    const lines = allLeaked.map((l, i) => {
        const vName = consultantMap[l.assigned_consultant_id || ''] || 'Sem vendedor';
        return `⚠️ *${l.name}* (Score ${l.ai_score})\n   Vertical: ${l.type} | Carro: ${l.vehicle_interest || '—'}\n   Atribuído a: ${vName}`;
    }).join('\n\n');

    // Alexandre (CEO) - Se não tiver telefone no banco, o N8N deve ter o dele fixo para o tipo 'hot_leak_alert'
    // Mas vamos tentar buscar o admin.
    const { data: boss } = await admin
        .from('consultants_manos_crm')
        .select('name, phone')
        .eq('role', 'admin')
        .not('phone', 'is', null)
        .limit(1);

    const message = 
        `🚨 *ALERTA CEO: LEADS HOT EM RISCO* 🚨\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Detectamos ${allLeaked.length} leads estratégicos (score ≥80) sem nenhum contato há mais de 15 minutos!\n\n` +
        lines +
        `\n\n━━━━━━━━━━━━━━━━━━\n` +
        `📢 *Ação recomendada:* Cobrar os vendedores ou redistribuir os leads agora. Dinheiro está vazando!`;

    await sendToWebhook({
        consultant_name: boss?.[0]?.name || 'Alexandre Gorges',
        consultant_phone: normalizeBRPhone(process.env.CEO_PHONE || process.env.ADMIN_PHONE || boss?.[0]?.phone || ''), 
        type: 'hot_leak_alert',
        message,
        meta: { leaked_count: allLeaked.length }
    });

    return { leaked: allLeaked.length };
}
