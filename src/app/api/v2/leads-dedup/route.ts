import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/v2/leads-dedup
 * Detecta grupos de leads com mesmo telefone normalizado.
 * Retorna grupos de duplicatas para o admin revisar.
 */
export async function GET() {
    try {
        const { data: leads, error } = await supabase
            .from('leads_manos_crm')
            .select('id, name, phone, source, status, created_at, assigned_consultant_id')
            .not('status', 'in', '("lixo","duplicado")')
            .not('phone', 'is', null)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Normaliza telefone: mantém só dígitos, remove DDI 55
        const normalizePhone = (raw: string): string => {
            const digits = (raw || '').replace(/\D/g, '');
            return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
        };

        // Agrupa por telefone normalizado
        const groups = new Map<string, typeof leads>();
        for (const lead of (leads || [])) {
            const phone = normalizePhone(lead.phone);
            if (phone.length < 8) continue; // ignora telefones inválidos
            if (!groups.has(phone)) groups.set(phone, []);
            groups.get(phone)!.push(lead);
        }

        // Retorna apenas grupos com 2+ leads (duplicatas reais)
        const duplicates = Array.from(groups.entries())
            .filter(([, g]) => g.length >= 2)
            .map(([phone, group]) => ({
                phone,
                count: group.length,
                leads: group,
                // Sugere o master: lead mais antigo com status mais avançado
                suggestedMaster: group.reduce((best, cur) => {
                    const order = ['fechamento','ataque','triagem','entrada','new','received'];
                    const bestOrder = order.indexOf(best.status) === -1 ? 99 : order.indexOf(best.status);
                    const curOrder  = order.indexOf(cur.status)  === -1 ? 99 : order.indexOf(cur.status);
                    return curOrder < bestOrder ? cur : best;
                }),
            }))
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({ success: true, duplicates, total: duplicates.length });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

/**
 * POST /api/v2/leads-dedup
 * Mescla um grupo de duplicatas: mantém o master, marca os outros como "duplicado".
 * Body: { masterId: string, duplicateIds: string[] }
 */
export async function POST(req: NextRequest) {
    try {
        const { masterId, duplicateIds } = await req.json();

        if (!masterId || !duplicateIds?.length) {
            return NextResponse.json({ error: 'masterId e duplicateIds são obrigatórios' }, { status: 400 });
        }

        // Busca o lead master para pegar os dados mais completos
        const { data: master } = await supabase
            .from('leads_manos_crm')
            .select('*')
            .eq('id', masterId)
            .single();

        if (!master) return NextResponse.json({ error: 'Lead master não encontrado' }, { status: 404 });

        // Para cada duplicata, copia dados faltantes para o master e marca como duplicado
        for (const dupId of duplicateIds) {
            const { data: dup } = await supabase
                .from('leads_manos_crm')
                .select('*')
                .eq('id', dupId)
                .single();

            if (!dup) continue;

            // Enriquece o master com dados que estão faltando
            const updates: Record<string, any> = {};
            if (!master.email && dup.email)               updates.email = dup.email;
            if (!master.vehicle_interest && dup.vehicle_interest) updates.vehicle_interest = dup.vehicle_interest;
            if (!master.campaign_id && dup.campaign_id)   updates.campaign_id = dup.campaign_id;

            if (Object.keys(updates).length > 0) {
                await supabase.from('leads_manos_crm').update(updates).eq('id', masterId);
            }

            // Marca a duplicata como descartada
            await supabase.from('leads_manos_crm').update({
                status: 'duplicado',
                duplicate_id: masterId,
                ai_reason: `Duplicata mesclada com o lead principal #${masterId}`,
            }).eq('id', dupId);
        }

        return NextResponse.json({ success: true, merged: duplicateIds.length });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * DELETE /api/v2/leads-dedup
 * Marca um lead individual como lixo/duplicado sem merge completo.
 */
export async function DELETE(req: NextRequest) {
    try {
        const { leadId, masterId } = await req.json();
        await supabase.from('leads_manos_crm').update({
            status: 'duplicado',
            duplicate_id: masterId || null,
        }).eq('id', leadId);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
