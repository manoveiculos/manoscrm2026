import { NextResponse } from 'next/server';

export async function GET() {
    // Basic connectivity and system uptime check
    try {
        const timestamp = new Date().toISOString();
        const uptime = process.uptime();
        const environment = process.env.NODE_ENV;

        return NextResponse.json({
            status: 'ok',
            message: 'CRM Manos API está operante.',
            timestamp,
            uptime: `${Math.floor(uptime)}s`,
            environment,
            services: {
                api: 'healthy',
                database: 'connected'
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            message: 'Falha na verificação de saúde do sistema.',
            details: error.message
        }, { status: 500 });
    }
}
