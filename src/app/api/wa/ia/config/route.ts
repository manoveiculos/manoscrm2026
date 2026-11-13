import { NextResponse } from 'next/server';
import { contextoWa } from '@/lib/whatsapp/leituraServidor';
import { gravarModoIa, lerConfigIa } from '@/lib/whatsapp/ia/config';
import { resumoDoDia } from '@/lib/whatsapp/ia/leituraEnsaio';
import { msgErro } from '@/lib/whatsapp/erro';

/**
 * /api/wa/ia/config — botão "Laura do CRM" na tela Conversas.
 *   GET   gestor/admin: modo efetivo, modo gravado e números do dia
 *   POST  só admin: { modo: 'ensaio' | 'desligada' | 'envia' }
 * "envia" só é aceito com WA_IA_ENVIO_LIBERADO=true no servidor (etapa C, depois do "aprovado").
 */
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };

export async function GET() {
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });
    if (ctx.eu.perfil !== 'admin' && ctx.eu.perfil !== 'gestor') {
        return NextResponse.json({ success: false, error: 'só gestor ou admin' }, { status: 403, headers: SEM_CACHE });
    }
    try {
        const [config, resumo] = await Promise.all([lerConfigIa(ctx.admin), resumoDoDia(ctx.sessao)]);
        return NextResponse.json({ success: true, podeMudar: ctx.eu.perfil === 'admin', config, resumo }, { headers: SEM_CACHE });
    } catch (e) {
        console.error('[wa/ia/config]', msgErro(e));
        return NextResponse.json({ success: false, error: 'não foi possível ler a configuração da IA' }, { status: 500, headers: SEM_CACHE });
    }
}

export async function POST(req: Request) {
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });
    if (ctx.eu.perfil !== 'admin') {
        return NextResponse.json({ success: false, error: 'só o admin liga ou desliga a IA' }, { status: 403, headers: SEM_CACHE });
    }
    const corpo = await req.json().catch(() => ({}));
    const modo = corpo?.modo;
    if (modo !== 'ensaio' && modo !== 'desligada' && modo !== 'envia') {
        return NextResponse.json({ success: false, error: 'modo inválido (use ensaio, desligada ou envia)' }, { status: 400, headers: SEM_CACHE });
    }
    // "envia" manda mensagem de verdade ao cliente: só com a chave de ambiente liberada (etapa C, com o "aprovado")
    if (modo === 'envia' && (process.env.WA_IA_ENVIO_LIBERADO || '').trim() !== 'true') {
        return NextResponse.json({ success: false, error: 'envio ao cliente ainda não liberado no servidor (WA_IA_ENVIO_LIBERADO)' }, { status: 409, headers: SEM_CACHE });
    }
    try {
        await gravarModoIa(ctx.admin, modo, ctx.eu.authId);
        const config = await lerConfigIa(ctx.admin);
        console.info(`[wa/ia/config] ${ctx.eu.email} mudou a Laura do CRM para "${modo}" (efetivo: ${config.modo})`);
        return NextResponse.json({ success: true, config }, { headers: SEM_CACHE });
    } catch (e) {
        console.error('[wa/ia/config] POST', msgErro(e));
        return NextResponse.json({ success: false, error: 'não foi possível gravar (a migration da IA já foi aplicada?)' }, { status: 500, headers: SEM_CACHE });
    }
}
