import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { dataService } from '@/lib/dataService';
import { runEliteCloser } from '@/lib/services/ai-closer-service';
import { runGenerateProposal } from '@/lib/services/proposal-service';

/**
 * Facebook Lead Ads Webhook
 * Automado com Elite Closer & Proposta Automática (V3)
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
                
                if (!leadRes || !leadRes.ok) continue;

                const leadData = await leadRes.json();

                // Parse field_data
                let phone = '';
                let name = '';
                let email = '';
                let city = '';
                let interest = '';

                if (leadData.field_data) {
                    leadData.field_data.forEach((field: any) => {
                        const n = (field.name || '').toLowerCase();
                        const v = field.values?.[0] || '';
                        if (n.includes('phone') || n.includes('tel') || n === 'phone_number') phone = v;
                        else if (n.includes('full_name') || n.includes('nome') || n === 'name') name = v;
                        else if (n.includes('email')) email = v;
                        else if (n.includes('city') || n.includes('cidade')) city = v;
                        else if (n.includes('vehicle') || n.includes('veiculo') || n.includes('interesse') || n.includes('model')) interest = v;
                    });
                }

                const cleanPhone = phone.replace(/\D/g, '');
                if (!cleanPhone || cleanPhone.length < 8) continue;

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

                // 1. Criar Lead no CRM
                try {
                    const newLead = await dataService.createLead({
                        name: name || 'Lead Meta Form',
                        phone: cleanPhone,
                        source: finalSource,
                        vehicle_interest: interest || campaignName,
                        region: city || '',
                        status: 'received',
                        created_at: leadData.created_time || new Date().toISOString(),
                    });

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
                    }
                } catch (err) {
                    console.error('Error processing Facebook lead in webhook:', err);
                }
            }
        }

        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error('Facebook Leads Webhook Error:', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
