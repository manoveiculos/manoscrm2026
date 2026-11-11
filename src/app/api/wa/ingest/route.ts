import { NextRequest, NextResponse, after } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/admin';
import { ingerirWebhook, processarMidiasPendentes, registrarErro } from '@/lib/whatsapp/ingestao';
import { msgErro } from '@/lib/whatsapp/erro';
import { rodarLauraDepoisDaIngestao } from '@/lib/whatsapp/ia/motor';
import { identificarNomeECarro } from '@/lib/identificacao/processar';

/**
 * POST /api/wa/ingest — ingestão do WhatsApp da loja (Fase 2). PERMANENTE:
 * a tela Conversas e a Laura do CRM dependem dela; não desligar no fim do
 * modo sombra (decisão do Alexandre, 06/11/2026).
 *
 * Quem chama: nó HTTP do n8n, em paralelo ao fluxo da Laura, com o corpo cru
 * do webhook da Evolution. Passo a passo: docs/whatsapp-n8n-passos.md.
 *
 * Segurança: header `x-ingest-secret` (ou `Authorization: Bearer`) igual a
 * WHATSAPP_INGEST_SECRET. Sem o segredo configurado a rota fica fechada (503).
 *
 * Chaves de operação (env):
 *   WA_INGEST_ATIVO=true   liga a gravação. Sem isso responde 200 e não grava,
 *                          para o n8n não acusar erro antes da hora.
 *   WA_LOJA_INSTANCIA      só eventos desta instância são gravados.
 *
 * Resposta rápida: grava o texto e responde; mídia e transcrição rodam depois
 * da resposta (after), para não atrasar o n8n nem a Laura.
 */

export const maxDuration = 120;

function segredoConfere(recebido: string | null, esperado: string): boolean {
    if (!recebido) return false;
    // hash dos dois lados: compara em tempo constante mesmo com tamanhos diferentes
    const a = createHash('sha256').update(recebido).digest();
    const b = createHash('sha256').update(esperado).digest();
    return timingSafeEqual(a, b);
}

const SEM_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' };

export async function POST(req: NextRequest) {
    const esperado = process.env.WHATSAPP_INGEST_SECRET?.trim();
    if (!esperado) {
        return NextResponse.json({ ok: false, erro: 'ingestao_nao_configurada' }, { status: 503, headers: SEM_CACHE });
    }
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
    const recebido = req.headers.get('x-ingest-secret') || bearer;
    if (!segredoConfere(recebido, esperado)) {
        return NextResponse.json({ ok: false, erro: 'nao_autorizado' }, { status: 401, headers: SEM_CACHE });
    }

    if (process.env.WA_INGEST_ATIVO !== 'true') {
        return NextResponse.json({ ok: true, gravado: false, motivo: 'ingestao_desligada' }, { headers: SEM_CACHE });
    }

    const instancia = process.env.WA_LOJA_INSTANCIA?.replace(/"/g, '').trim();
    if (!instancia) {
        return NextResponse.json({ ok: false, erro: 'WA_LOJA_INSTANCIA_nao_configurada' }, { status: 503, headers: SEM_CACHE });
    }

    let payload: unknown;
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({ ok: false, erro: 'json_invalido' }, { status: 400, headers: SEM_CACHE });
    }

    try {
        const r = await ingerirWebhook(payload, { instancia, autorFromMe: 'laura' });
        const pendentes = r.midiasPendentes;
        // Nome e carro do cliente (spec nome-e-interesse-automaticos): áudio espera a transcrição.
        const audiosDoCliente = r.novasDoCliente.filter(g => g.tipo === 'audio');
        const outrasDoCliente = r.novasDoCliente.filter(g => g.tipo !== 'audio');
        if (pendentes.length) {
            after(async () => {
                try {
                    await processarMidiasPendentes(pendentes);
                } catch (e) {
                    await registrarErro(createClient(), `pós-resposta (mídia): ${msgErro(e)}`, payload, 'wa_midia');
                }
                await identificarNomeECarro(audiosDoCliente);
            });
        }
        if (outrasDoCliente.length) {
            after(() => identificarNomeECarro(outrasDoCliente));
        }
        // Laura do CRM (etapa B = ensaio: escreve o rascunho, não envia). Desligada
        // por padrão: só roda com WA_IA_ATIVA=true e o botão do admin em "ensaio".
        const gatilhos = r.novasDoCliente;
        if (gatilhos.length && process.env.WA_IA_ATIVA?.trim() === 'true') {
            after(async () => {
                try {
                    await rodarLauraDepoisDaIngestao(gatilhos);
                } catch (e) {
                    await registrarErro(createClient(), `pós-resposta (laura-crm): ${msgErro(e)}`, null, 'wa_ia');
                }
            });
        }
        const resumo = {
            eventos: r.eventos, gravadas: r.gravadas, repetidas: r.repetidas, edicoes: r.edicoes,
            apagadas: r.apagadas, status: r.status, ignorados: r.ignorados, erros: r.erros,
        };
        return NextResponse.json(
            { ok: r.erros.length === 0, ...resumo, midias_na_fila: pendentes.length },
            { status: r.erros.length ? 500 : 200, headers: SEM_CACHE },
        );
    } catch (e) {
        await registrarErro(createClient(), `falha geral: ${msgErro(e)}`, payload);
        return NextResponse.json({ ok: false, erro: 'erro_interno' }, { status: 500, headers: SEM_CACHE });
    }
}
