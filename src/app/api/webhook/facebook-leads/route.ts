import { NextRequest, NextResponse } from 'next/server';
import { getMetaAccessToken } from '@/lib/metaConfig';
import { createClient } from '@/lib/supabase/admin';
import { runEliteCloser } from '@/lib/services/ai-closer-service';
import { runGenerateProposal } from '@/lib/services/proposal-service';
import { distribuirLead } from '@/lib/services/slaEngine';
import { trackLeadCreated } from '@/lib/services/metaConversionService';

const supabaseAdmin = createClient();

/**
 * Facebook Lead Ads Webhook (CORRIGIDO: Auditoria Forense 2026-04-18)
 * - Usa supabaseAdmin para contornar RLS
 * - Grava na tabela leads_compra
 * - Retorna 500 em falha para forçar reenvio do Meta
 *
 * ┌─ QUEM CHAMA ESTA ROTA ────────────────────────────────────────────┐
 * │ O n8n, NÃO o Facebook direto. A cadeia é:                         │
 * │                                                                    │
 * │   Facebook (app ManosN8N, assinatura leadgen)                     │
 * │     → n8n  https://n8n.drivvoo.com/webhook/facebook-crm2026       │
 * │       → CRM  /api/webhook/facebook-leads   ← você está aqui       │
 * │                                                                    │
 * │ O n8n é intermediário PROPOSITAL (decisão do dono, 2026-08-19):   │
 * │ é onde o fluxo fica visível e editável sem deploy. Ele repassa o  │
 * │ corpo CRU do Facebook — é por isso que o parse abaixo espera o    │
 * │ formato nativo (object:"page" + entry[].changes[]).               │
 * │                                                                    │
 * │ Se alguém trocar a URL de callback no app do Facebook para apontar │
 * │ direto pra cá, continua funcionando. Mas se mexerem no n8n para   │
 * │ ele NORMALIZAR o payload antes de repassar, o formato deixa de    │
 * │ bater e o lead para de entrar — veja o log de payload não         │
 * │ reconhecido abaixo, que existe justamente pra isso não virar um   │
 * │ sumiço silencioso.                                                 │
 * │                                                                    │
 * │ Doc do fluxo: docs/integracao-meta-lead-ads.md                    │
 * └────────────────────────────────────────────────────────────────────┘
 */

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'manos_crm_leadgen_2026';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();

        // Payload fora do formato nativo do Facebook. Antes isto respondia 200
        // mudo — se o n8n passasse a normalizar o corpo, os leads sumiriam sem
        // deixar rastro nenhum. Agora fica registrado o que chegou.
        if (payload.object !== 'page') {
            console.warn(
                '[Webhook FB] Payload não reconhecido (esperado object:"page" vindo cru do Facebook via n8n). ' +
                'Chaves recebidas: ' + Object.keys(payload || {}).join(', ')
            );
            return NextResponse.json({
                received: true,
                ignored: true,
                reason: 'payload fora do formato nativo do Facebook (object != page)',
            });
        }

        const META_TOKEN = getMetaAccessToken();
        if (!META_TOKEN) {
            console.error('META_ACCESS_TOKEN not configured');
            return NextResponse.json({ error: 'Token missing' }, { status: 500 });
        }

        const entries = payload.entry || [];

        for (const entry of entries) {
            const changes = entry.changes || [];

            for (const change of changes) {
                if (change.field !== 'leadgen') continue;

                const leadgenId = change.value?.leadgen_id;
                if (!leadgenId) continue;

                // Idempotência: o Meta reenvia a notificação quando não recebe 200.
                // Sem esta checagem a reentrega criaria o mesmo lead de novo.
                const { data: jaExiste } = await supabaseAdmin
                    .from('leadsfacebook')
                    .select('id')
                    .eq('fb_lead_id', String(leadgenId))
                    .maybeSingle();
                if (jaExiste) {
                    console.log(`[Webhook] Lead ${leadgenId} já importado em leadsfacebook (id ${jaExiste.id}) — ignorando reentrega.`);
                    continue;
                }

                const leadUrl = `https://graph.facebook.com/v19.0/${leadgenId}?fields=id,created_time,field_data,campaign_id,adset_id,ad_id,form_id,platform&access_token=${META_TOKEN}`;
                const leadRes = await fetch(leadUrl).catch(() => null);
                
                if (!leadRes || !leadRes.ok) {
                    console.error(`[Webhook] Falha ao buscar lead ${leadgenId} no Meta Graph API`);
                    return NextResponse.json({ error: 'Falha no Graph API' }, { status: 500 });
                }

                const leadData = await leadRes.json();

                // Parse field_data de qualificação do formulário Meta
                let phone = '';
                let name = '';
                let city = '';
                let interest = '';
                let momento = '';
                let pagamento = '';

                if (leadData.field_data) {
                    leadData.field_data.forEach((field: any) => {
                        const n = (field.name || '').toLowerCase();
                        const v = field.values?.[0] || '';
                        if (n.includes('phone') || n.includes('tel') || n === 'phone_number') phone = v;
                        else if (n.includes('full_name') || n.includes('nome') || n === 'name') name = v;
                        else if (n.includes('city') || n.includes('cidade')) city = v;
                        else if (n.includes('vehicle') || n.includes('veiculo') || n.includes('interesse') || n.includes('model')) interest = v;
                        else if (n.includes('quando') || n.includes('pretende') || n.includes('tempo') || n.includes('momento')) momento = v;
                        else if (n.includes('pagar') || n.includes('pagamento') || n.includes('forma')) pagamento = v;
                    });
                }

                const cleanPhone = phone.replace(/\D/g, '');
                if (!cleanPhone || cleanPhone.length < 8) {
                    console.warn(`[Webhook] Lead ${leadgenId} ignorado: telefone inválido (${phone})`);
                    continue; // Pular leads sem telefone, mas não falhar o webhook inteiro
                }

                let campaignName = 'Facebook Leads';
                if (leadData.campaign_id) {
                    try {
                        const campRes = await fetch(`https://graph.facebook.com/v19.0/${leadData.campaign_id}?fields=name&access_token=${META_TOKEN}`);
                        if (campRes.ok) {
                            const campData = await campRes.json();
                            campaignName = campData.name || campaignName;
                        }
                    } catch { }
                }

                const platform = leadData.platform || 'facebook';
                const finalSource = platform.toLowerCase() === 'instagram' ? 'Instagram Ads' : campaignName;

                // Monta resumo amigável formatado das observações
                const obs = [
                    '📘 **Lead do Facebook Ads**',
                    city ? `📍 **Cidade:** ${city}` : null,
                    interest ? `🚘 **Interesse:** ${interest}` : null,
                    momento ? `⏱️ **Comprar:** ${momento}` : null,
                    pagamento ? `💳 **Pagamento:** ${pagamento}` : null,
                ].filter(Boolean).join('\n');

                // 1. Criar Lead na tabela public.leadsfacebook (sem vendedor pré-atribuído -> assigned_consultant_id = NULL)
                try {
                    const { data: newLead, error: insertError } = await supabaseAdmin
                        .from('leadsfacebook')
                        .insert({
                            fb_lead_id: String(leadgenId),
                            nome: name || 'Lead Meta Form',
                            phone: cleanPhone,
                            cidade: city || null,
                            momento_compra: momento || null,
                            vehicle_interest: interest || campaignName,
                            forma_pagamento: pagamento || null,
                            source: finalSource,
                            status: 'received',
                            assigned_consultant_id: null, // Lead entra na Fila Geral (Pesca) sem consultor pré-definido
                            observacoes: obs,
                            ai_summary: obs,
                            raw_payload: leadData,
                            created_at: leadData.created_time || new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        })
                        .select()
                        .single();

                    if (insertError) {
                        console.error('[Webhook] Erro ao inserir lead no Supabase (leadsfacebook):', insertError.message, insertError.details, insertError.code);
                        return NextResponse.json({ error: 'Erro no banco' }, { status: 500 });
                    }

                    if (newLead && newLead.id) {
                        const fullId = `leadsfacebook:` + newLead.id;
                        console.log(`[Webhook] Lead Facebook recebido com sucesso na Fila Geral (Pesca): ${fullId}`);

                        // DISPATCH META CAPI (Lead Event com fb_lead_id do Instant Form)
                        trackLeadCreated({
                            id: fullId,
                            fb_lead_id: leadgenId,
                            name: newLead.nome,
                            phone: newLead.phone,
                            city: newLead.cidade,
                            vehicle_interest: newLead.vehicle_interest,
                            source: newLead.source
                        }).catch(e => console.warn('[Webhook] Meta CAPI non-blocking error:', e));

                        // Elite Closer (IA de ANÁLISE/score — não fala com cliente)
                        const analysis = await runEliteCloser(fullId, [], 'SISTEMA').catch(async (e) => {
                            console.error('[Webhook] Elite Closer falhou:', e);
                            return null;
                        });

                        if (analysis && analysis.urgencyScore > 60) {
                            console.log(`[Webhook] Score alto detectado (${analysis.urgencyScore}). Gerando proposta automática...`);
                            await runGenerateProposal(fullId).catch(e => {
                                console.error('[Webhook] Erro na proposta automática:', e);
                            });
                        }
                    } else {
                        console.error('[Webhook] Lead inserido mas não retornou ID');
                        return NextResponse.json({ error: 'ID não gerado' }, { status: 500 });
                    }
                } catch (err: any) {
                    console.error('[Webhook] Exceção crítica ao processar lead:', err.message);
                    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
                }
            }
        }

        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error('Facebook Leads Webhook Error Global:', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
