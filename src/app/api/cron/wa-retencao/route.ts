import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { BUCKET_MIDIA, corteRetencao, RETENCAO_DIAS } from '@/lib/whatsapp/midia';
import { processarMidia, retranscreverDoBucket, type LinhaMidia } from '@/lib/whatsapp/ingestao';
import { msgErro } from '@/lib/whatsapp/erro';
import { providerLoja } from '@/lib/whatsapp/evolutionProvider';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';

/**
 * GET /api/cron/wa-retencao — retenção de mídia do WhatsApp da loja (30 dias).
 *
 * Agendado no pg_cron (job wa-retencao-midia, 06:30 UTC) via call_cron_endpoint,
 * com Authorization: Bearer <CRON_SECRET>.
 *
 * Ordem, a cada execução:
 *   1. transcreve de novo o áudio que ficou sem transcrição (antes de expirar);
 *   2. tenta de novo baixar a mídia que falhou nos últimos 3 dias;
 *   3. apaga do bucket a mídia com mais de 30 dias e preenche midia_expirada_em.
 *      Texto, legenda, transcrição e o registro (tipo, tamanho, data) ficam.
 *
 * ?dryRun=true só conta, não apaga nada.
 */

export const maxDuration = 300;

const ORCAMENTO_MS = 50_000;     // pg_net corta a chamada em 60 s
const LOTE_REMOCAO = 100;
const MAX_TENTATIVAS_TRANSCRICAO = 5;
const MAX_TENTATIVAS_MIDIA = 3;

interface Metricas {
    ok: boolean;
    dryRun: boolean;
    corte: string;
    retranscritos: number;
    retranscricao_falhou: number;
    midias_rebaixadas: number;
    midias_ainda_falhando: number;
    expiradas: number;
    arquivos_removidos: number;
    a_expirar_restantes: number;
    erros: string[];
}

export async function GET(request: Request) {
    const segredo = process.env.CRON_SECRET;
    if (!segredo) return new NextResponse('CRON_SECRET não configurado', { status: 503 });
    if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';

    return withHeartbeat('wa-retencao', async () => {
        const m = await rodar(dryRun);
        return { result: NextResponse.json(m), metrics: m as unknown as Record<string, unknown> };
    });
}

async function rodar(dryRun: boolean): Promise<Metricas> {
    const inicio = Date.now();
    const tempoAcabou = () => Date.now() - inicio > ORCAMENTO_MS;
    const supabase = createClient();
    const corte = corteRetencao();
    const m: Metricas = {
        ok: true, dryRun, corte: corte.toISOString(),
        retranscritos: 0, retranscricao_falhou: 0, midias_rebaixadas: 0, midias_ainda_falhando: 0,
        expiradas: 0, arquivos_removidos: 0, a_expirar_restantes: 0, erros: [],
    };

    // 1. Áudio sem transcrição, arquivo ainda no bucket (mais antigos primeiro: expiram antes)
    {
        const { data, error } = await supabase.from('wa_mensagens')
            .select('id, midia_path, midia_mime, transcricao_tentativas, extra')
            .eq('tipo', 'audio')
            .is('transcricao', null)
            .not('midia_path', 'is', null)
            .is('midia_expirada_em', null)
            .lt('transcricao_tentativas', MAX_TENTATIVAS_TRANSCRICAO)
            .order('criada_em', { ascending: true })
            .limit(dryRun ? 1000 : 20);
        if (error) m.erros.push(`busca áudio: ${error.message}`);
        for (const linha of data || []) {
            if (dryRun) { m.retranscritos++; continue; }
            if (tempoAcabou()) break;
            if (await retranscreverDoBucket(supabase, linha)) m.retranscritos++;
            else m.retranscricao_falhou++;
        }
    }

    // 2. Mídia que não baixou (últimos 3 dias; depois disso o WhatsApp costuma não ter mais)
    {
        const desde = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
        const { data, error } = await supabase.from('wa_mensagens')
            .select('id, conversa_id, provider_message_id, tipo, midia_mime, midia_bytes, midia_nome, midia_tentativas, transcricao_tentativas, extra, criada_em, autor, wa_conversas(remote_jid)')
            .is('midia_path', null)
            .like('midia_erro', 'falha_download%')
            .lt('midia_tentativas', MAX_TENTATIVAS_MIDIA)
            .gte('criada_em', desde)
            .order('criada_em', { ascending: true })
            .limit(dryRun ? 1000 : 20);
        if (error) m.erros.push(`busca mídia: ${error.message}`);
        let provider: WhatsAppProvider | null = null;
        if (!dryRun && data?.length) {
            try { provider = providerLoja(); } catch (e) { m.erros.push(msgErro(e, 'provedor')); }
        }
        for (const linha of data || []) {
            if (dryRun) { m.midias_rebaixadas++; continue; }
            if (!provider || tempoAcabou()) break;
            const { wa_conversas: conv, ...resto } = linha as LinhaMidia & { wa_conversas?: { remote_jid: string | null } | { remote_jid: string | null }[] | null };
            const remoteJid = Array.isArray(conv) ? conv[0]?.remote_jid : conv?.remote_jid;
            const r = await processarMidia(supabase, provider, { ...resto, remote_jid: remoteJid ?? null });
            if (r === 'ok') m.midias_rebaixadas++; else m.midias_ainda_falhando++;
        }
    }

    // 3. Retenção: apaga do bucket o que tem mais de 30 dias
    while (!tempoAcabou()) {
        const { data, error } = await supabase.from('wa_mensagens')
            .select('id, midia_path')
            .not('midia_path', 'is', null)
            .is('midia_expirada_em', null)
            .lt('criada_em', corte.toISOString())
            .order('criada_em', { ascending: true })
            .limit(LOTE_REMOCAO);
        if (error) { m.erros.push(`busca retenção: ${error.message}`); break; }
        if (!data?.length) break;
        if (dryRun) { m.expiradas += data.length; break; }

        const caminhos = data.map(d => d.midia_path as string);
        const { data: removidos, error: rmErr } = await supabase.storage.from(BUCKET_MIDIA).remove(caminhos);
        if (rmErr) { m.erros.push(`remoção: ${rmErr.message}`); break; }
        m.arquivos_removidos += removidos?.length ?? 0;

        // Arquivo que já não existia também conta como expirado: o que vale é não ter mais mídia.
        const { error: upErr } = await supabase.from('wa_mensagens')
            .update({ midia_expirada_em: new Date().toISOString() })
            .in('id', data.map(d => d.id));
        if (upErr) { m.erros.push(`marcar expirada: ${upErr.message}`); break; }
        m.expiradas += data.length;
        if (data.length < LOTE_REMOCAO) break;
    }

    if (!dryRun) {
        const { count } = await supabase.from('wa_mensagens')
            .select('id', { count: 'exact', head: true })
            .not('midia_path', 'is', null)
            .is('midia_expirada_em', null)
            .lt('criada_em', corte.toISOString());
        m.a_expirar_restantes = count ?? 0;
    }

    m.ok = m.erros.length === 0;
    console.log(`[wa-retencao] ${RETENCAO_DIAS}d`, JSON.stringify(m));
    return m;
}
