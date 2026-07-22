import { createClient } from '@/lib/supabase/admin';

/**
 * Notificações da Agenda de Visitas → webhook n8n.
 * Eventos: agendamento_criado (na criação) e lembrete_visita
 * (24h_antes / no_dia / 2h_antes). Mesmo shape de payload em todos —
 * o n8n decide como avisar vendedor e cliente.
 */

const WEBHOOK = process.env.AGENDA_WEBHOOK_URL
    || 'https://n8n.drivvoo.com/webhook/b25e1146-a59b-45b2-ba3c-8a1872bff1ab';

const supabaseAdmin = createClient();

export function brtIso(d: Date): string {
    const b = new Date(d.getTime() - 3 * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}T${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}-03:00`;
}
const digits = (s?: string | null) => (s || '').replace(/\D/g, '') || null;

export type AgendaEvento =
    | { evento: 'agendamento_criado'; tipo_lembrete: 'criacao' }
    | { evento: 'lembrete_visita'; tipo_lembrete: '24h_antes' | 'no_dia' | '2h_antes' };

/**
 * Monta o payload contratado e faz o POST. Lança em não-2xx (caller decide
 * se grava flag / loga). `vendedor` pode vir pré-resolvido pra evitar query.
 */
export async function postAgendaWebhook(a: any, ev: AgendaEvento, vendedor?: { name?: string | null; email?: string | null } | null) {
    let v = vendedor;
    if (!v) {
        const { data } = await supabaseAdmin
            .from('consultants_manos_crm').select('name, email').eq('auth_id', a.vendedor_id).maybeSingle();
        v = data;
    }
    const payload = {
        evento: ev.evento,
        tipo_lembrete: ev.tipo_lembrete,
        enviado_em: brtIso(new Date()),
        agendamento: {
            id: a.id,
            data_hora: brtIso(new Date(a.data_hora)),
            tipo: a.tipo,
            endereco: a.endereco || null,
            veiculo_interesse: a.veiculo_interesse || null,
            status: a.status,
            observacoes: a.observacoes || null,
        },
        vendedor: {
            id: a.vendedor_id,
            nome: v?.name || null,
            email: v?.email || null,
            telefone: null,
            whatsapp: null,
        },
        cliente: {
            nome: a.cliente_nome,
            telefone: digits(a.cliente_telefone),
            whatsapp: digits(a.cliente_whatsapp) || digits(a.cliente_telefone),
            lead_id: a.lead_uid || null,
        },
    };
    const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
}
