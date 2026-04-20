import { NextRequest, NextResponse } from 'next/server';
import { notifyHotLeaksToAdmin } from '@/lib/services/vendorNotifyService';

export const dynamic = 'force-dynamic';

/**
 * Cron para alertar o Admin (CEO) sobre leads estratégicos (HOT)
 * que ainda não receberam contato após 15 minutos.
 * 
 * Chamada sugerida: a cada 15-30 minutos.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const { leaked } = await notifyHotLeaksToAdmin();
        return NextResponse.json({ 
            success: true, 
             message: `Cron 'Hot Leak Alert' executado. Leads em risco: ${leaked}`,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('[cron/hot-leak-alert] error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
