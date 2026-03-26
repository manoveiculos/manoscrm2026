import { dataService } from '@/lib/services';
import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { recordSale } from '@/lib/services/salesService';

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { lead_id, finish_type, vehicle_name, sale_value, loss_reason, consultant_name } = await req.json();

        if (!lead_id || !finish_type) {
            return NextResponse.json({ error: 'lead_id e finish_type são obrigatórios' }, { status: 400 });
        }

        const adminClient = createClient();
        dataService.setClient(adminClient);

        const newStatus = finish_type === 'venda' ? 'vendido'
            : finish_type === 'compra' ? 'vendido'
            : 'perdido';

        const note = finish_type === 'perda'
            ? `[Extensão] Encerrado como PERDA: ${loss_reason || 'Motivo não informado'}`
            : `[Extensão] Encerrado como VENDA: ${vehicle_name || 'Veículo não informado'}${sale_value ? ` — R$ ${sale_value}` : ''}`;

        await dataService.updateLeadStatus(lead_id, newStatus, undefined, note);

        if (finish_type !== 'perda' && sale_value) {
            await recordSale({
                lead_id,
                sale_value: parseFloat(String(sale_value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
                vehicle_name: vehicle_name || 'Venda via Extensão',
                consultant_name: consultant_name || 'Extensão WhatsApp'
            });
        }

        return NextResponse.json({ success: true, status: newStatus });

    } catch (err: any) {
        console.error('Extension Finish-Lead API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
