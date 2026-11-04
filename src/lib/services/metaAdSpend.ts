import type { SupabaseClient } from '@supabase/supabase-js';
import { getMetaApiVersion } from '@/lib/metaConfig';

/**
 * Gasto diário por anúncio da conta Meta → meta_ad_spend_daily.
 *
 * É a ponte entre o anúncio que trouxe o lead (utm_params.source_id do
 * Click-to-WhatsApp é o ID do ANÚNCIO) e a campanha/gasto. Alimenta
 * fn_custo_por_resultado. O squad de Tráfego também pode gravar direto nessa
 * tabela (source = 'squad_trafego'); a chave primária evita duplicar.
 *
 * Env: META_AD_ACCOUNT_ID (só números) e META_ADS_ACCESS_TOKEN (ads_read) —
 * cai em META_ACCESS_TOKEN se não houver um token só de leitura de anúncios.
 */

interface LinhaInsight {
    date_start: string;
    account_id?: string;
    account_currency?: string;
    campaign_id: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
    ad_id?: string;
    ad_name?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
}

function isoDia(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export async function sincronizarGastoMeta(admin: SupabaseClient, dias = 7) {
    const conta = (process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '').trim();
    const token = (process.env.META_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '').trim();
    if (!conta || !token) {
        throw new Error('META_AD_ACCOUNT_ID ou META_ADS_ACCESS_TOKEN ausente no ambiente');
    }

    const ate = new Date();
    const desde = new Date(Date.now() - Math.max(1, Math.min(dias, 90)) * 86_400_000);
    const params = new URLSearchParams({
        level: 'ad',
        time_increment: '1',
        time_range: JSON.stringify({ since: isoDia(desde), until: isoDia(ate) }),
        fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,account_id,account_currency',
        limit: '500',
    });

    let url: string | null = `https://graph.facebook.com/${getMetaApiVersion()}/act_${conta}/insights?${params}`;
    const linhas: LinhaInsight[] = [];
    let paginas = 0;

    while (url && paginas < 50) {
        const res: Response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(30_000),
        });
        const json: any = await res.json().catch(() => null);
        if (!res.ok || json?.error) {
            throw new Error(`Graph insights (${res.status}): ${json?.error?.message || 'resposta inválida'}`);
        }
        linhas.push(...(json?.data || []));
        url = json?.paging?.next || null;
        paginas++;
    }

    const registros = linhas
        .filter(l => l.campaign_id && l.date_start)
        .map(l => ({
            platform: 'meta',
            spend_date: l.date_start,
            account_id: l.account_id || conta,
            campaign_id: l.campaign_id,
            campaign_name: l.campaign_name || null,
            adset_id: l.adset_id || null,
            adset_name: l.adset_name || null,
            ad_id: l.ad_id || '',
            ad_name: l.ad_name || null,
            spend: Number(l.spend) || 0,
            impressions: l.impressions ? Number(l.impressions) : null,
            clicks: l.clicks ? Number(l.clicks) : null,
            currency: l.account_currency || 'BRL',
            source: 'crm_sync',
            updated_at: new Date().toISOString(),
        }));

    for (let i = 0; i < registros.length; i += 500) {
        const { error } = await admin
            .from('meta_ad_spend_daily')
            .upsert(registros.slice(i, i + 500), { onConflict: 'platform,spend_date,campaign_id,ad_id' });
        if (error) throw new Error(`meta_ad_spend_daily: ${error.message}`);
    }

    return {
        desde: isoDia(desde),
        ate: isoDia(ate),
        linhas: registros.length,
        gasto_total: Math.round(registros.reduce((s, r) => s + r.spend, 0) * 100) / 100,
    };
}
