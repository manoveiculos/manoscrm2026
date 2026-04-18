import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/services/supabaseClients';
import { runEliteCloser } from '@/lib/services/ai-closer-service';
import { runGenerateProposal } from '@/lib/services/proposal-service';

/**
 * Facebook Lead Ads Webhook (CORRIGIDO: Auditoria Forense 2026-04-18)
 * - Usa supabaseAdmin para contornar RLS
 * - Grava na tabela leads_compra
 * - Retorna 500 em falha para forçar reenvio do Meta
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

        if (payload.object !== 'page') {
            return NextResponse.json({ received: true });
        }

        const META_TOKEN = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
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

                const leadUrl = `https://graph.facebook.com/v19.0/${leadgenId}?fields=id,created_time,field_data,campaign_id,ad_id,form_id,platform&access_token=${META_TOKEN}`;
                const leadRes = await fetch(leadUrl).catch(() => null);
                
                if (!leadRes || !leadRes.ok) {
                    console.error(`[Webhook] Falha ao buscar lead ${leadgenId} no Meta Graph API`);
                    return NextResponse.json({ error: 'Falha no Graph API' }, { status: 500 });
                }

                const leadData = await leadRes.json();

                // Parse field_data
                let phone = '';
                let name = '';
                let city = '';
                let interest = '';

                if (leadData.field_data) {
                    leadData.field_data.forEach((field: any) => {
                        const n = (field.name || '').toLowerCase();
                        const v = field.values?.[0] || '';
                        if (n.includes('phone') || n.includes('tel') || n === 'phone_number') phone = v;
                        else if (n.includes('full_name') || n.includes('nome') || n === 'name') name = v;
                        else if (n.includes('city') || n.includes('cidade')) city = v;
                        else if (n.includes('vehicle') || n.includes('veiculo') || n.includes('interesse') || n.includes('model')) interest = v;
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
                const finalSource = platform.toLowerCase() === 'instagram' ? 'Instagram' : campaignName;

                // 1. Criar Lead no CRM (Tabela leads_compra via Admin para furar RLS)
                try {
                    const { data: newLead, error: insertError } = await supabaseAdmin
                        .from('leads_compra')
                        .insert({
                            nome: name || 'Lead Meta Form',
                            telefone: cleanPhone,
                            origem: finalSource,
                            veiculo_original: interest || campaignName,
                            status: 'novo',
                            criado_em: leadData.created_time || new Date().toISOString(),
                        })
                        .select()
                        .single();

                    if (insertError) {
                        console.error('[Webhook] Erro ao inserir lead no Supabase (leads_compra):', insertError.message, insertError.details, insertError.code);
                        return NextResponse.json({ error: 'Erro no banco' }, { status: 500 });
                    }

                    if (newLead && newLead.id) {
                        const fullId = `main_` + newLead.id;
                        
                        // 2. Disparar Elite Closer Automático (IA Proativa)
                        console.log(`[Webhook] Iniciando análise Elite Closer para lead: ${fullId}`);
                        const analysis = await runEliteCloser(fullId, [], 'SISTEMA').catch(e => {
                            console.error('[Webhook] Erro na análise automática:', e);
                            return null;
                        });

                        // 3. Gerar Proposta Automática se o Score for > 60
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
