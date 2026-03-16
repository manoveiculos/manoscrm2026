import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { OpenAI } from 'openai';
import { dataService } from '@/lib/dataService';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Facebook Lead Ads Webhook
 * Receives real-time lead notifications from Facebook Lead Ads.
 * 
 * Setup:
 * 1. Go to Meta Developers → Your App → Webhooks
 * 2. Subscribe to "leadgen" notifications
 * 3. Set callback URL to: https://your-domain.com/api/webhook/facebook-leads
 * 4. Set verify token to the value in FACEBOOK_VERIFY_TOKEN env var
 * 
 * When a lead submits a form on Facebook, Meta sends a notification here.
 * We then fetch the lead data from the Graph API and save it to the CRM.
 */

// GET: Webhook verification (required by Meta)
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

// POST: Receive lead notification
export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();

        // Meta sends notifications with object: "page" and entry array
        if (payload.object !== 'page') {
            return NextResponse.json({ received: true });
        }

        const META_TOKEN = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
        if (!META_TOKEN) {
            console.error('META_ACCESS_TOKEN not configured for lead webhook');
            return NextResponse.json({ error: 'Token missing' }, { status: 500 });
        }

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get: () => undefined,
                    set: () => { },
                    remove: () => { }
                }
            }
        );

        const entries = payload.entry || [];

        for (const entry of entries) {
            const changes = entry.changes || [];

            for (const change of changes) {
                if (change.field !== 'leadgen') continue;

                const leadgenId = change.value?.leadgen_id;
                if (!leadgenId) continue;

                // Fetch lead details from Graph API
                const leadUrl = `https://graph.facebook.com/v19.0/${leadgenId}?fields=id,created_time,field_data,campaign_id,ad_id,form_id,platform&access_token=${META_TOKEN}`;
                const leadRes = await fetch(leadUrl).catch(err => {
                    console.error('Network error fetching lead from Meta:', err);
                    return null;
                });
                if (!leadRes || !leadRes.ok) {
                    if (leadRes) console.error('Failed to fetch lead from Meta:', await leadRes.text());
                    continue;
                }

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

                // Get campaign name if possible
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

                // Determine platform correctly
                const platform = leadData.platform || 'facebook';
                const finalSource = platform.toLowerCase() === 'instagram' ? 'Instagram' : campaignName;

                // Enriquecer com IA se possível
                let aiClassification = 'warm';
                let aiResumo = `[LEAD ${platform.toUpperCase()}] Real-time | Campanha: ${campaignName}`;
                let summarizedInterest = interest || campaignName;

                if (process.env.OPENAI_API_KEY) {
                    try {
                        const aiResponse = await openai.chat.completions.create({
                            model: 'gpt-4o',
                            messages: [{
                                role: 'system',
                                content: 'Você é um Analista comercial da Manos Veículos. Analise os dados do lead e retorne um JSON: { "classification": "hot" | "warm" | "cold", "summarized_interest": "1-2 palavras do carro", "short_strategy": "frase curta de como abordar" }'
                            }, {
                                role: 'user',
                                content: `Lead: ${name}, Interesse: ${interest}, Origem: ${campaignName}, Cidade: ${city}`
                            }],
                            response_format: { type: 'json_object' }
                        });
                        const aiData = JSON.parse(aiResponse.choices[0]?.message?.content || '{}');
                        if (aiData.classification) aiClassification = aiData.classification;
                        if (aiData.summarized_interest) summarizedInterest = aiData.summarized_interest;
                        if (aiData.short_strategy) aiResumo = aiData.short_strategy;
                    } catch (e) {
                        console.error("AI Enrichment error in webhook:", e);
                    }
                }

                // Insert into CRM using unified logic (Deduplication & Reactivation)
                try {
                    await dataService.createLead({
                        name: name || 'Lead Meta Form',
                        phone: cleanPhone,
                        source: finalSource,
                        vehicle_interest: summarizedInterest,
                        region: city || '',
                        status: 'received',
                        created_at: leadData.created_time || new Date().toISOString(),
                        id_meta: leadData.id,
                        id_formulario: leadData.form_id,
                        plataforma_meta: platform,
                        ai_summary: aiResumo,
                        ai_classification: aiClassification as any,
                        ai_reason: aiResumo
                    });
                } catch (insertError: any) {
                    console.error('Error processing Facebook lead:', insertError.message);
                }
            }
        }

        // Must return 200 quickly to avoid Meta retries
        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error('Facebook Leads Webhook Error:', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
