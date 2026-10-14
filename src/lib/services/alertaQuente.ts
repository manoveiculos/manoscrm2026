import { createClient } from '@/lib/supabase/admin';
import { classificarLead } from '@/lib/qualificacao';
import { pisoEstoque } from './qualificacaoService';
import { notifyConsultant } from './consultantNotifier';
import { businessSecondsBetween, horarioLoja, isOpenNow } from './slaEngine';
import { etapaDoStatus, triagemAtrasada } from '@/constants/funil';

/**
 * O ÚNICO alerta de SLA que sobra: "lead Quente sem resposta humana há 15 min".
 *
 * Antes eram 7 níveis (sla-watcher 1/2/5/6/7/8 + o log de 10min do motor de
 * distribuição): 1.494 registros em 60 dias, nenhum resolvido — o time aprendeu
 * a ignorar. Agora: só lead Quente (tem entrada ou troca e compra em até 30
 * dias), só em horário comercial, UMA vez por lead, para o dono e o gestor.
 *
 * LGPD: a mensagem não leva nome nem telefone do cliente — só o link do CRM.
 */

const SLA_QUENTE_SEGUNDOS = 15 * 60;
const JANELA_DIAS = 3;
const KIND = 'quente_15min';
const FINAIS = ['vendido', 'perdido', 'lost', 'lost_by_inactivity', 'comprado', 'finalizado', 'arquivado'];

const baseUrl = () => process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://manoscrm.com.br';

interface Candidato {
    uid: string;
    table: 'leads_distribuicao_crm_26' | 'leads_manos_crm';
    nativeId: string;
    consultantId: string | null;
    createdAt: string;
    firstContactAt: string | null;
    firstContactChannel: string | null;
}

async function carregarCandidatos(admin: ReturnType<typeof createClient>, piso: number | null): Promise<Candidato[]> {
    const desde = new Date(Date.now() - JANELA_DIAS * 86400_000).toISOString();
    const out: Candidato[] = [];

    const fontes = [
        { table: 'leads_distribuicao_crm_26' as const, created: 'criado_em', updated: 'atualizado_em' },
        { table: 'leads_manos_crm' as const, created: 'created_at', updated: 'updated_at' },
    ];
    for (const f of fontes) {
        const base = `id, status, assigned_consultant_id, ${f.created}, first_contact_at, first_contact_channel, vehicle_interest, valor_investimento, carro_troca, archived_at`
            + (f.table === 'leads_distribuicao_crm_26' ? ', interesse' : '');
        const query = (cols: string) => admin.from(f.table).select(cols)
            .gte(f.updated, desde)
            .is('archived_at', null)
            .not('status', 'in', `(${FINAIS.map(s => `"${s}"`).join(',')})`)
            .limit(300);
        let { data, error } = await query(`${base}, prazo_compra`);
        if (error) ({ data, error } = await query(base)); // antes da migration do prazo
        if (error) { console.warn('[alertaQuente]', f.table, error.message); continue; }

        for (const r of (data || []) as any[]) {
            const q = classificarLead({
                vehicle_interest: r.vehicle_interest || r.interesse || null,
                valor_investimento: r.valor_investimento,
                carro_troca: r.carro_troca,
                prazo_compra: r.prazo_compra ?? null,
            }, piso);
            if (q.selo !== 'quente') continue;
            out.push({
                uid: `${f.table}:${r.id}`,
                table: f.table,
                nativeId: String(r.id),
                consultantId: r.assigned_consultant_id || null,
                createdAt: r[f.created],
                firstContactAt: r.first_contact_at || null,
                firstContactChannel: r.first_contact_channel || null,
            });
        }
    }
    return out;
}

/**
 * Desde quando o cliente espera um humano, ou null se já foi respondido.
 * Com histórico de WhatsApp: última msg do cliente sem resposta humana depois.
 * Sem histórico: nenhum contato humano registrado (a IA não conta).
 */
async function esperandoDesde(admin: ReturnType<typeof createClient>, c: Candidato): Promise<Date | null> {
    const { data: msgs } = await admin
        .from('whatsapp_messages')
        .select('direction, message_id, created_at')
        .eq('lead_id', c.nativeId)
        .order('created_at', { ascending: false })
        .limit(30);

    if (msgs && msgs.length > 0) {
        const ultimaDoCliente = msgs.find((m: any) => m.direction === 'inbound');
        if (!ultimaDoCliente) return null;
        const humanaDepois = msgs.find((m: any) =>
            m.direction === 'outbound'
            && !String(m.message_id || '').startsWith('ai_')
            && new Date(m.created_at) > new Date(ultimaDoCliente.created_at));
        return humanaDepois ? null : new Date(ultimaDoCliente.created_at);
    }

    const humanoJaFalou = !!c.firstContactAt && c.firstContactChannel !== 'ai_sdr';
    return humanoJaFalou ? null : new Date(c.createdAt);
}

export async function alertarQuentesSemResposta(): Promise<{ candidatos: number; alertados: number; fechado?: boolean }> {
    const admin = createClient();
    const { horas, feriados } = await horarioLoja(admin);
    const agora = new Date();
    if (!isOpenNow(agora, horas, feriados)) return { candidatos: 0, alertados: 0, fechado: true };

    const piso = await pisoEstoque(admin);
    const candidatos = await carregarCandidatos(admin, piso);
    if (candidatos.length === 0) return { candidatos: 0, alertados: 0 };

    const { data: gestores } = await admin
        .from('consultants_manos_crm')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true);

    let alertados = 0;
    for (const c of candidatos) {
        const desde = await esperandoDesde(admin, c);
        if (!desde) continue;
        if (businessSecondsBetween(desde, agora, horas, feriados) < SLA_QUENTE_SEGUNDOS) continue;

        // Uma vez por lead: a UNIQUE(lead_uid, kind) decide quem alerta.
        const { data: novo } = await admin
            .from('inactivity_alerts')
            .upsert({ lead_uid: c.uid, lead_table: c.table, lead_id: c.nativeId, consultor_id: c.consultantId, kind: KIND },
                { onConflict: 'lead_uid,kind', ignoreDuplicates: true })
            .select('id');
        if (!novo || novo.length === 0) continue;

        const link = `${baseUrl()}/lead/${encodeURIComponent(c.uid)}`;
        const titulo = `🔥 Lead QUENTE #${c.nativeId} sem resposta há 15 min`;
        const destinos = new Set<string>([
            ...(c.consultantId ? [c.consultantId] : []),
            ...((gestores || []) as any[]).map(g => g.id as string),
        ]);
        for (const consultantId of destinos) {
            await notifyConsultant({
                consultantId,
                leadId: c.uid,
                level: 2,
                type: 'lead_quente',
                title: titulo,
                message: `Cliente com entrada/troca e compra em até 30 dias esperando um humano. Abra: ${link}`,
                blocking: consultantId === c.consultantId,
            });
        }
        alertados++;
    }
    return { candidatos: candidatos.length, alertados };
}

/**
 * Resumo diário do funil (vai no briefing matinal do gestor). Substitui os
 * avisos de 2h/4h/8h/24h que disparavam um por um.
 */
export async function resumoFunilDiario(): Promise<string> {
    const admin = createClient();
    const { data } = await admin
        .from('leads_unified_active')
        .select('uid, status, created_at, assigned_consultant_id, table_name')
        .eq('flow_type', 'venda')
        .limit(1000);
    const leads = (data || []) as any[];

    const porEtapa = new Map<string, number>();
    const triagemVencidaPorVendedor = new Map<string, number>();
    for (const l of leads) {
        const e = etapaDoStatus(l.status);
        porEtapa.set(e, (porEtapa.get(e) || 0) + 1);
        if (triagemAtrasada(l).atrasada) {
            const k = l.assigned_consultant_id || 'sem_dono';
            triagemVencidaPorVendedor.set(k, (triagemVencidaPorVendedor.get(k) || 0) + 1);
        }
    }

    const ids = [...triagemVencidaPorVendedor.keys()].filter(k => k !== 'sem_dono');
    const nomes = new Map<string, string>();
    if (ids.length) {
        const { data: cons } = await admin.from('consultants_manos_crm').select('id, name').in('id', ids);
        for (const c of (cons || []) as any[]) nomes.set(c.id, (c.name || '').split(' ')[0]);
    }

    const ontem = new Date(Date.now() - 86400_000).toISOString();
    const { count: quentesOntem } = await admin
        .from('inactivity_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('kind', KIND)
        .gte('created_at', ontem);

    const total = [...triagemVencidaPorVendedor.values()].reduce((a, b) => a + b, 0);
    const linhasVendedor = [...triagemVencidaPorVendedor.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `• ${k === 'sem_dono' ? 'Sem dono' : (nomes.get(k) || 'Vendedor')}: ${n}`)
        .join('\n');

    return `\n\n*Funil agora:*\n` +
        `🔍 Triagem ${porEtapa.get('triagem') || 0} · 💬 Atendimento ${porEtapa.get('em_atendimento') || 0} · ` +
        `📅 Visita ${porEtapa.get('visita_agendada') || 0} · 🚗 Visitou ${porEtapa.get('visitou') || 0} · 💼 Proposta ${porEtapa.get('proposta') || 0}\n` +
        `🔥 Leads quentes que esperaram +15min ontem: *${quentesOntem || 0}*\n` +
        (total > 0 ? `⏰ *${total}* em triagem há +24h:\n${linhasVendedor}` : '✅ Ninguém em triagem há +24h');
}
