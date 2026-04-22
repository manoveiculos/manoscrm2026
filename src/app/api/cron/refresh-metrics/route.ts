import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Endpoint para atualizar a Materialized View de métricas de conversão.
 * Chamado pelo scheduler a cada 15-30 minutos.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const supabase = createClient();
        
        // Chama a função definidora de segurança que faz o refresh concorrente
        const { error } = await supabase.rpc('refresh_conversion_funnel');

        if (error) {
            console.error('[cron/refresh-metrics] error calling rpc:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Conversion funnel materialized view refreshed successfully',
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('[cron/refresh-metrics] catch error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
