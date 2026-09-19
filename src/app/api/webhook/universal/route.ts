import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { distribuirLead } from '@/lib/services/slaEngine';
import { trackVehicleAddToCart } from '@/lib/services/metaCatalogEvents';

/**
 * WEBHOOK UNIVERSAL (Fase E)
 * Recebe leads de OLX, Webmotors, iCarros, etc via Zapier/n8n.
 * 
 * Campos esperados (JSON):
 * - name / nome
 * - phone / telefone / celular
 * - email
 * - vehicle / veiculo / interesse
 * - source / origem
 * - message / mensagem / resumo
 * - vehicle_id / retailer_id  → dispara AddToCart no catálogo (opcional)
 *
 * AddToCart (Meta CAPI): quando o payload traz o ID do veículo, este webhook é o
 * ponto server-side do clique em "Tenho interesse" / WhatsApp na página daquele
 * veículo. Dispara tanto em lead novo quanto em re-entrada (o clique aconteceu
 * de novo), e nunca bloqueia a entrada do lead.
 */

/**
 * Dispara AddToCart sem travar o webhook.
 *
 * SÓ dispara quando o payload traz o ID do veículo. Lead de portal (OLX,
 * Webmotors) que só tem o texto do interesse NÃO é clique na página de um
 * veículo nosso — dispararia AddToCart à toa e inflaria o evento.
 */
function dispararAddToCart(req: NextRequest, body: any, vehicle: string, externalId?: string | number) {
    const vehicleId = body.vehicle_id ?? body.vehicleId ?? body.retailer_id ?? body.content_id ?? null;
    if (!vehicleId) return;

    const ud = body.user_data || {};
    const xff = req.headers.get('x-forwarded-for');

    trackVehicleAddToCart({
        vehicleId,
        vehicleInterest: vehicle || null,
        value: body.value !== undefined && body.value !== null ? Number(body.value) : null,
        currency: body.currency || 'BRL',
        eventSourceUrl: body.event_source_url || body.url || undefined,
        eventId: body.event_id || undefined,
        testEventCode: body.test_event_code || undefined,
        web: {
            client_ip_address: ud.client_ip_address || body.client_ip_address ||
                (xff ? xff.split(',')[0].trim() : undefined) || req.headers.get('x-real-ip') || undefined,
            client_user_agent: ud.client_user_agent || body.client_user_agent || req.headers.get('user-agent') || undefined,
            fbp: ud.fbp || body.fbp,
            fbc: ud.fbc || body.fbc,
            email: body.email || body.user_data?.email,
            phone: body.phone || body.telefone || body.celular,
            name: body.name || body.nome,
            externalId,
        },
    }).catch(e => console.warn('[Webhook Universal] AddToCart CAPI falhou:', e?.message));
}

export async function POST(req: NextRequest) {
    const admin = createClient();
    let body: any = null;
    try {
        body = await req.json();

        // Normalização de campos
        const name = body.name || body.nome || 'Lead Integrado';
        const rawPhone = body.phone || body.telefone || body.celular || '';
        const email = body.email || '';
        const vehicle = body.vehicle || body.veiculo || body.interesse || '';
        const source = body.source || body.origem || 'Integração';
        const message = body.message || body.mensagem || body.resumo || '';

        const cleanPhone = String(rawPhone).replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 8) {
            return NextResponse.json({ error: 'Telefone inválido ou ausente' }, { status: 400 });
        }

        // 1. DEDUPLICAÇÃO UNIFICADA — varre as 3 tabelas de lead (dist + manos +
        // compra) via RPC, não só a leads_manos_crm. Evita duplicata cross-tabela
        // (ex.: lead que já veio pelo WhatsApp e agora entra por um portal).
        const { data: matchRaw } = await admin
            .rpc('find_lead_by_phone', { p_phone: cleanPhone })
            .maybeSingle();
        const match = matchRaw as any;

        if (match?.native_id) {
            const table = String(match.table_name);
            const isDist = table === 'leads_distribuicao_crm_26';
            const nativeId: any = isDist ? parseInt(String(match.native_id), 10) : match.native_id;
            const nowIso = new Date().toISOString();

            // Preserva o resumo existente, prepende a nota de re-entrada.
            const { data: cur } = await admin.from(table).select('resumo').eq('id', nativeId).maybeSingle();
            const novoResumo = `[RE-ENTRADA via ${source} — ${nowIso}]: ${message}\n\n${(cur as any)?.resumo || ''}`.slice(0, 8000);

            // Re-entrada NÃO reatribui: se o lead estava sem dono, segue na pesca.
            const upd: Record<string, any> = { resumo: novoResumo };
            if (isDist) upd.atualizado_em = nowIso; else upd.updated_at = nowIso;

            await admin.from(table).update(upd).eq('id', nativeId);

            dispararAddToCart(req, body, vehicle, match.native_id);

            return NextResponse.json({
                success: true,
                duplicated: true,
                lead_id: match.native_id,
                table,
                message: 'Lead já existente (dedup 3 tabelas). Histórico atualizado, pesca preservada.'
            });
        }

        // 2. CRIAÇÃO DE NOVO LEAD — PESCA PURA: entra SEM dono. Sem atribuição
        // automática e sem AI SDR (zero IA falando com cliente).
        const { data: newLead, error: insertError } = await admin
            .from('leads_manos_crm')
            .insert({
                name,
                phone: cleanPhone,
                email,
                vehicle_interest: vehicle,
                source: `${source} (API)`,
                status: 'new',
                assigned_consultant_id: null,
                dados_brutos: body,
                observacoes: message
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 3. Motor de distribuição: round-robin + SLA 10min (ou standby fora do horário).
        distribuirLead('leads_manos_crm', newLead.id).catch(e =>
            console.warn('[Webhook Universal] distribuirLead falhou:', e?.message)
        );

        // 4. AddToCart no catálogo (só quando o payload identifica o veículo).
        dispararAddToCart(req, body, vehicle, newLead.id);

        return NextResponse.json({
            success: true,
            lead_id: newLead.id,
            distribuido: true
        });

    } catch (err: any) {
        console.error('[Universal Webhook] Erro:', err.message);
        // Dead-letter auditável: nunca perde um lead sem rastro.
        try {
            await admin.from('webhook_errors').insert({
                source: 'universal',
                error_message: err?.message || 'erro desconhecido',
                payload: body ?? null,
            });
        } catch (e) {
            console.error('[Universal Webhook] Falha ao gravar em webhook_errors:', (e as any)?.message);
        }
        return NextResponse.json({ error: 'Erro interno', details: err.message }, { status: 500 });
    }
}

// Handler para GET (Verificação/Teste)
export async function GET() {
    return NextResponse.json({ 
        status: 'online', 
        message: 'Manos CRM Universal Webhook Hub v1.0',
        usage: 'POST JSON with {name, phone, email, vehicle, source, message}' 
    });
}
