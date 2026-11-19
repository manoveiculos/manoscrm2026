import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { parseUid } from '@/lib/services/unifiedLead';
import { telefoneKey } from '@/lib/whatsapp/evolutionParser';
import type { FichaLaura } from '@/lib/whatsapp/ia/regras';
import { faltaPerguntar, fichaEmLinhas, mensagensRecentes, situacaoDoBanco, uidDoIdDaLista, type MsgBanco } from '@/lib/leads/resumo';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'no-store' };
const erro = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });

const COLS = 'uid, table_name, native_id, name, phone, vehicle_interest, source, status, assigned_consultant_id, created_at';

/**
 * GET /api/leads/resumo?id=<id da lista ou uid> — o resumo que a gaveta da aba Leads mostra:
 * quem é, onde está (analista de IA), o que já disse (ficha da Laura) e as últimas mensagens.
 * Só leitura. Vendedor não vê lead de outro consultor.
 */
export async function GET(request: Request) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;

    const bruto = new URL(request.url).searchParams.get('id') || '';
    const uidPedido = uidDoIdDaLista(bruto);
    let parsed = uidPedido ? parseUid(uidPedido) : null;
    if (!parsed) {
        // id sem prefixo conhecido: procura pelo id nativo na view
        const { data: achado } = await admin.from('leads_unified').select('table_name, native_id').eq('native_id', bruto).limit(1).maybeSingle();
        if (achado) parsed = { table: achado.table_name, nativeId: String(achado.native_id) } as never;
    }
    if (!parsed) return erro(400, 'lead não reconhecido');

    const { data: lead, error: eLead } = await admin.from('leads_unified').select(COLS)
        .eq('table_name', parsed.table).eq('native_id', parsed.nativeId).maybeSingle();
    if (eLead) return erro(500, eLead.message);
    if (!lead) return erro(404, 'lead não encontrado');

    if (eu.perfil !== 'admin' && lead.assigned_consultant_id && lead.assigned_consultant_id !== eu.consultorId) {
        return erro(403, 'este lead está com outro consultor');
    }

    let consultorNome: string | null = null;
    if (lead.assigned_consultant_id) {
        const { data: c } = await admin.from('consultants_manos_crm').select('name').eq('id', lead.assigned_consultant_id).maybeSingle();
        consultorNome = (c?.name as string | undefined) ?? null;
    }

    // conversa do WhatsApp: pelo lead e, se não achar, pelo telefone
    const CONV = 'id, status, ficha, situacao, ultima_mensagem_em';
    let { data: conv } = await admin.from('wa_conversas').select(CONV).eq('lead_uid', lead.uid)
        .order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle();
    if (!conv) {
        const tel = telefoneKey(lead.phone as string | null);
        if (tel) ({ data: conv } = await admin.from('wa_conversas').select(CONV).eq('telefone_key', tel).limit(1).maybeSingle());
    }

    let mensagens: ReturnType<typeof mensagensRecentes> = [];
    if (conv) {
        const { data: linhas } = await admin.from('wa_mensagens')
            .select('autor, tipo, texto, legenda, transcricao, midia_nome, apagada_em, criada_em')
            .eq('conversa_id', conv.id).order('criada_em', { ascending: false }).limit(12);
        mensagens = mensagensRecentes((linhas || []) as MsgBanco[], 5);
    }
    const ficha = (conv?.ficha && typeof conv.ficha === 'object' ? conv.ficha : null) as FichaLaura | null;

    return NextResponse.json({
        success: true,
        lead: {
            uid: lead.uid, nome: lead.name, telefone: lead.phone, interesse: lead.vehicle_interest, origem: lead.source,
            status: lead.status, criadoEm: lead.created_at, consultorId: lead.assigned_consultant_id, consultorNome,
        },
        conversa: conv ? { id: conv.id, status: conv.status, ultimaMensagemEm: conv.ultima_mensagem_em } : null,
        situacao: conv ? situacaoDoBanco(conv.situacao) : null,
        ficha: fichaEmLinhas(ficha),
        falta: conv ? faltaPerguntar(ficha) : [],
        mensagens,
    }, { headers });
}
