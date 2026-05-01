import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { sendFirstContact } from '@/lib/services/aiSdrService';
import { isSenderConfigured } from '@/lib/services/whatsappSender';

export const maxDuration = 300; // resgate pode ser pesado
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/rescue-stale
 *
 * Roda o AI SDR retroativamente em leads das últimas N dias que nunca
 * receberam primeiro contato. Varre as 3 tabelas (leads_manos_crm,
 * leads_compra, leads_distribuicao_crm_26) e despacha sequencialmente
 * para respeitar o rate limit do whatsappSender.
 *
 * Body / query params:
 *   days?     número de dias pra trás (default 7, max 30)
 *   limit?    máx leads por execução (default 50, max 200)
 *   dry_run?  true = apenas conta o que enviaria, sem disparar
 *
 * Auth: Bearer ${CRON_SECRET} no header Authorization.
 */

type SourceTable = 'leads_manos_crm' | 'leads_compra' | 'leads_distribuicao_crm_26';

interface RescueArgs {
    days: number;
    limit: number;
    dryRun: boolean;
    tables: SourceTable[]; // se vazio, considera todas
}

interface RescueResult {
    scanned: number;
    eligible: number;
    sent: number;
    skipped: number;
    failed: number;
    perTable: Record<string, { scanned: number; eligible: number; sent: number; skipped: number; failed: number }>;
    samples: Array<{ uid: string; name: string | null; phone: string | null; outcome: string }>;
}

function parseArgs(req: NextRequest, body: any): RescueArgs {
    const url = new URL(req.url);
    const num = (key: string, def: number, max: number) => {
        const v = body?.[key] ?? url.searchParams.get(key);
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return def;
        return Math.min(n, max);
    };
    const dryRunRaw = body?.dry_run ?? url.searchParams.get('dry_run');

    // Filtro de tabelas (opcional). Body: tables=['leads_compra']. Query: ?tables=leads_compra,leads_manos_crm
    const VALID: SourceTable[] = ['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26'];
    let tablesRaw = body?.tables;
    if (!tablesRaw) {
        const qp = url.searchParams.get('tables');
        if (qp) tablesRaw = qp.split(',');
    }
    let tables: SourceTable[] = [];
    if (Array.isArray(tablesRaw)) {
        tables = tablesRaw
            .map((t: any) => String(t).trim())
            .filter((t: string): t is SourceTable => VALID.includes(t as SourceTable));
    }

    return {
        days: num('days', 7, 30),
        limit: num('limit', 50, 200),
        dryRun: dryRunRaw === true || dryRunRaw === 'true',
        tables,
    };
}

function shouldQuery(table: SourceTable, args: RescueArgs): boolean {
    return args.tables.length === 0 || args.tables.includes(table);
}

async function processBatch(
    rows: any[],
    table: 'leads_manos_crm' | 'leads_compra' | 'leads_distribuicao_crm_26',
    fieldMap: { id: string; name: string; phone: string; vehicle: string; source: string; consultant: string },
    flow: 'venda' | 'compra',
    args: RescueArgs,
    consultantNameById: Map<string, string>,
    result: RescueResult
) {
    const stats = { scanned: 0, eligible: 0, sent: 0, skipped: 0, failed: 0 };

    for (const row of rows) {
        stats.scanned++;
        const phone = row[fieldMap.phone];
        if (!phone || String(phone).replace(/\D/g, '').length < 10) {
            stats.failed++;
            result.samples.push({
                uid: `${table}:${row[fieldMap.id]}`,
                name: row[fieldMap.name] || null,
                phone: phone || null,
                outcome: 'phone_invalid',
            });
            continue;
        }
        stats.eligible++;

        if (args.dryRun) {
            result.samples.push({
                uid: `${table}:${row[fieldMap.id]}`,
                name: row[fieldMap.name] || null,
                phone,
                outcome: 'would_send',
            });
            continue;
        }

        const consultantName = row[fieldMap.consultant] ? (consultantNameById.get(row[fieldMap.consultant]) || null) : null;

        const sdr = await sendFirstContact({
            leadId: row[fieldMap.id],
            leadName: row[fieldMap.name] || null,
            leadPhone: phone,
            vehicleInterest: row[fieldMap.vehicle] || null,
            source: row[fieldMap.source] || null,
            consultantName,
            flow,
        }, table).catch(e => ({ sent: false, message: '', provider: 'error' as const, error: e?.message || 'erro' }));

        if (sdr.sent) {
            stats.sent++;
            result.samples.push({
                uid: `${table}:${row[fieldMap.id]}`,
                name: row[fieldMap.name] || null,
                phone,
                outcome: `sent (${sdr.provider})`,
            });
        } else if (sdr.error === 'already_contacted' || sdr.error === 'dedup_hit') {
            stats.skipped++;
            result.samples.push({
                uid: `${table}:${row[fieldMap.id]}`,
                name: row[fieldMap.name] || null,
                phone,
                outcome: `skip:${sdr.error}`,
            });
        } else {
            stats.failed++;
            result.samples.push({
                uid: `${table}:${row[fieldMap.id]}`,
                name: row[fieldMap.name] || null,
                phone,
                outcome: `fail:${sdr.error || 'unknown'}`,
            });
        }

        // Rate limit interno: 5s entre leads — guardrail anti-ban do WhatsApp.
        // Padrão da indústria pra envio em massa via API/Evolution é 3-8s.
        // Mantemos 5s pra equilibrar velocidade vs risco de bloqueio do número.
        await new Promise(r => setTimeout(r, 5000));
    }

    result.perTable[table] = stats;
    result.scanned += stats.scanned;
    result.eligible += stats.eligible;
    result.sent += stats.sent;
    result.skipped += stats.skipped;
    result.failed += stats.failed;
}

export async function POST(req: NextRequest) {
    const auth = req.headers.get('authorization');
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const args = parseArgs(req, body);

    if (!args.dryRun && !isSenderConfigured()) {
        return NextResponse.json({
            error: 'whatsapp_sender_not_configured',
            hint: 'Configure WHATSAPP_CLOUD_TOKEN+WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_SEND_WEBHOOK_URL antes de rodar com dry_run=false.',
        }, { status: 400 });
    }

    const admin = createClient();
    const cutoff = new Date(Date.now() - args.days * 24 * 3600 * 1000).toISOString();
    const FINAL = ['vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity'];

    // Cache de nomes de consultor pra usar no prompt do SDR
    const { data: consultants } = await admin
        .from('consultants_manos_crm')
        .select('id, name');
    const consultantNameById = new Map<string, string>();
    for (const c of (consultants || []) as any[]) {
        if (c.id) consultantNameById.set(c.id, c.name || '');
    }

    // Se tabelas filtradas, dá limite total pra elas. Sem filtro, divide em 3.
    const activeTablesCount = args.tables.length === 0 ? 3 : args.tables.length;
    const perTableLimit = Math.ceil(args.limit / activeTablesCount);

    // 1. leads_manos_crm
    const lmcRows = shouldQuery('leads_manos_crm', args)
        ? (await admin
            .from('leads_manos_crm')
            .select('id, name, phone, vehicle_interest, source, assigned_consultant_id, status, created_at, first_contact_at')
            .is('first_contact_at', null)
            .is('archived_at', null)
            .gte('created_at', cutoff)
            .not('status', 'in', `(${FINAL.map(s => `"${s}"`).join(',')})`)
            .order('created_at', { ascending: false })
            .limit(perTableLimit)).data
        : null;

    // 2. leads_compra
    const compraRows = shouldQuery('leads_compra', args)
        ? (await admin
            .from('leads_compra')
            .select('id, nome, telefone, veiculo_original, origem, assigned_consultant_id, status, criado_em, first_contact_at')
            .is('first_contact_at', null)
            .is('archived_at', null)
            .gte('criado_em', cutoff)
            .not('status', 'in', `(${FINAL.map(s => `"${s}"`).join(',')})`)
            .order('criado_em', { ascending: false })
            .limit(perTableLimit)).data
        : null;

    // 3. leads_distribuicao_crm_26
    const distRows = shouldQuery('leads_distribuicao_crm_26', args)
        ? (await admin
            .from('leads_distribuicao_crm_26')
            .select('id, nome, telefone, origem, assigned_consultant_id, status, criado_em, first_contact_at')
            .is('first_contact_at', null)
            .is('archived_at', null)
            .gte('criado_em', cutoff)
            .not('status', 'in', `(${FINAL.map(s => `"${s}"`).join(',')})`)
            .order('criado_em', { ascending: false })
            .limit(perTableLimit)).data
        : null;

    const result: RescueResult = {
        scanned: 0, eligible: 0, sent: 0, skipped: 0, failed: 0,
        perTable: {},
        samples: [],
    };

    await processBatch(
        (lmcRows || []) as any[],
        'leads_manos_crm',
        { id: 'id', name: 'name', phone: 'phone', vehicle: 'vehicle_interest', source: 'source', consultant: 'assigned_consultant_id' },
        'venda',
        args, consultantNameById, result,
    );
    await processBatch(
        (compraRows || []) as any[],
        'leads_compra',
        { id: 'id', name: 'nome', phone: 'telefone', vehicle: 'veiculo_original', source: 'origem', consultant: 'assigned_consultant_id' },
        'compra',
        args, consultantNameById, result,
    );
    await processBatch(
        (distRows || []) as any[],
        'leads_distribuicao_crm_26',
        { id: 'id', name: 'nome', phone: 'telefone', vehicle: 'nome', source: 'origem', consultant: 'assigned_consultant_id' },
        'venda',
        args, consultantNameById, result,
    );

    return NextResponse.json({
        ok: true,
        args,
        result,
        cutoff,
    });
}
