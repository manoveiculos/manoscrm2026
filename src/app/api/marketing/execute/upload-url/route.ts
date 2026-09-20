import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '../../_guard';

const BUCKET = 'marketing-squad-uploads';

/**
 * POST /api/marketing/execute/upload-url
 *
 * Passo 1 da caixa "Executar": devolve uma signed URL de upload pro browser
 * mandar o arquivo DIRETO pro Supabase Storage (sem passar pelo corpo da
 * function — importante pra PDF grande e vídeo). Guardado por sessão admin,
 * igual ao resto do painel.
 *
 * Body: { squad: string, filename: string }
 */
export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.res;

    const { squad, filename } = await req.json().catch(() => ({}));
    if (!squad || !filename) {
        return NextResponse.json({ success: false, error: 'squad e filename obrigatórios' }, { status: 400 });
    }

    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const path = `${squad}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
        return NextResponse.json({ success: false, error: error?.message || 'falha ao gerar signed URL' }, { status: 500 });
    }

    return NextResponse.json({ success: true, path: data.path, token: data.token, bucket: BUCKET });
}
