import { NextRequest, NextResponse } from 'next/server';
import { parseContratoTexto } from '@/lib/services/societarioPdfParser';
import { extrairLinhasPdf } from '@/lib/services/societarioPdfExtract';
import { requireSocio } from '../_guard';

export const runtime = 'nodejs';

const LIMITE_BYTES = 10 * 1024 * 1024;

function ehPdf(file: File, bytes: Uint8Array): boolean {
    const assinatura = String.fromCharCode(...bytes.slice(0, 4));
    return assinatura === '%PDF' || file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    try {
        let texto = '';
        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await req.json();
            texto = body.texto || '';
        } else if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const file = formData.get('file');
            if (file instanceof File) {
                if (file.size > LIMITE_BYTES) {
                    return NextResponse.json({ success: false, error: 'Arquivo maior que 10 MB.' }, { status: 413 });
                }
                const bytes = new Uint8Array(await file.arrayBuffer());
                texto = ehPdf(file, bytes) ? await extrairLinhasPdf(bytes) : new TextDecoder().decode(bytes);
            }
        }

        if (!texto || texto.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Não encontrei texto no arquivo. Se o PDF for escaneado (foto), use "Colar Texto do Contrato".' },
                { status: 400 }
            );
        }

        const parsed = parseContratoTexto(texto);

        return NextResponse.json({
            success: true,
            data: parsed,
            textoExtraido: texto
        });
    } catch (error: any) {
        console.error('Erro no parser de PDF:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao processar contrato.' },
            { status: 500 }
        );
    }
}
