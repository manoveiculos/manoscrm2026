import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireSocio } from '../../societario/_guard';
// Só LEITURA do parser que já existe: nada do módulo societário é alterado.
import { parseContratoTexto } from '@/lib/services/societarioPdfParser';
import { extrairLinhasPdf } from '@/lib/services/societarioPdfExtract';
import { lerDanfe } from '@/lib/manosv3Danfe';

export const runtime = 'nodejs';
const BUCKET = 'manosv3-contratos';
const LIMITE = 10 * 1024 * 1024;

/** Sobe o PDF para o arquivo privado e tenta ler os dados do contrato. */
export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;
    try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Envie o PDF do contrato.' }, { status: 400 });
        if (file.size > LIMITE) return NextResponse.json({ success: false, error: 'Arquivo maior que 10 MB.' }, { status: 413 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') return NextResponse.json({ success: false, error: 'O arquivo precisa ser um PDF.' }, { status: 400 });

        const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.pdf`;
        const up = await createAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
        if (up.error) return NextResponse.json({ success: false, error: `Falha ao arquivar o PDF: ${up.error.message}` }, { status: 500 });

        let parsed: any = null;
        let aviso: string | null = null;
        try {
            const texto = await extrairLinhasPdf(bytes);
            if (texto.trim()) {
                parsed = parseContratoTexto(texto);
                // Não é contrato? Pode ser NF-e (carro novo): tenta o leitor de DANFE.
                if (parsed?.tipo === 'desconhecido') {
                    const nfe = lerDanfe(texto);
                    if (nfe) parsed = { ...parsed, ...nfe, lojaDetectada: undefined, empresaCnpj: undefined, cpfCnpjParteInversa: undefined, cidadeParteInversa: undefined, lancamentos: [], origem: 'nfe' };
                }
            } else aviso = 'PDF sem texto (escaneado). Preencha os dados manualmente.';
        } catch {
            aviso = 'Não consegui ler o PDF automaticamente. Preencha os dados manualmente.';
        }
        return NextResponse.json({ success: true, path, nome: file.name, parsed, aviso });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Erro ao processar o contrato.' }, { status: 500 });
    }
}

/** Link temporário (10 min) para abrir um contrato arquivado. */
export async function GET(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;
    const path = req.nextUrl.searchParams.get('path') || '';
    if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.pdf$/.test(path)) return NextResponse.json({ success: false, error: 'Caminho inválido.' }, { status: 400 });
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !data) return NextResponse.json({ success: false, error: error?.message || 'Contrato não encontrado.' }, { status: 404 });
    return NextResponse.redirect(data.signedUrl);
}
