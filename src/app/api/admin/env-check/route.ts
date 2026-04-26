import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/env-check
 * Debug-only: retorna apenas BOOLEAN se cada env crítica está disponível no
 * runtime. Não vaza nenhum valor. Auth via x-admin-secret == CRON_SECRET.
 *
 * Usado pra diagnosticar o caso "configurei no Vercel mas o runtime não vê".
 */
export async function GET(req: NextRequest) {
    const secret = req.headers.get('x-admin-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const has = (name: string) => Boolean(process.env[name] && process.env[name]!.length > 0);
    const length = (name: string) => process.env[name]?.length ?? 0;

    return NextResponse.json({
        ok: true,
        runtime: 'nodejs',
        node_version: process.version,
        timestamp: new Date().toISOString(),
        envs: {
            EVOLUTION_BASE_URL: { present: has('EVOLUTION_BASE_URL'), length: length('EVOLUTION_BASE_URL') },
            EVOLUTION_INSTANCE_NAME: { present: has('EVOLUTION_INSTANCE_NAME'), length: length('EVOLUTION_INSTANCE_NAME') },
            EVOLUTION_INSTANCE_TOKEN: { present: has('EVOLUTION_INSTANCE_TOKEN'), length: length('EVOLUTION_INSTANCE_TOKEN') },
            WHATSAPP_CLOUD_TOKEN: { present: has('WHATSAPP_CLOUD_TOKEN'), length: length('WHATSAPP_CLOUD_TOKEN') },
            WHATSAPP_PHONE_NUMBER_ID: { present: has('WHATSAPP_PHONE_NUMBER_ID'), length: length('WHATSAPP_PHONE_NUMBER_ID') },
            WHATSAPP_SEND_WEBHOOK_URL: { present: has('WHATSAPP_SEND_WEBHOOK_URL'), length: length('WHATSAPP_SEND_WEBHOOK_URL') },
            CRON_SECRET: { present: has('CRON_SECRET'), length: length('CRON_SECRET') },
            OPENAI_API_KEY: { present: has('OPENAI_API_KEY'), length: length('OPENAI_API_KEY') },
            NEXT_PUBLIC_SUPABASE_URL: { present: has('NEXT_PUBLIC_SUPABASE_URL'), length: length('NEXT_PUBLIC_SUPABASE_URL') },
            SUPABASE_SERVICE_ROLE_KEY: { present: has('SUPABASE_SERVICE_ROLE_KEY'), length: length('SUPABASE_SERVICE_ROLE_KEY') },
        },
    });
}
