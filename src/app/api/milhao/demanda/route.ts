import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { canonVehicle, canonFundVehicle } from '@/lib/milhao/normalize';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

const num = (v: any) => (v == null || isNaN(Number(v)) ? 0 : Number(v));

// Status que representam demanda "morta" — ainda contam como procura, mas não como quente.
const LOST = new Set(['lost', 'perdido', 'lost_by_inactivity', 'frio', 'arquivado', 'descartado']);
const SOLD = new Set(['vendido', 'comprado', 'finalizado']);

interface DemandAgg {
    key: string; label: string; brand: string | null; model: string | null;
    total: number; quentes: number; vendidos_lead: number;
}

/**
 * Inteligência de compra do Milhão.
 * Cruza a DEMANDA (o que os leads pedem) com a OFERTA (o que o fundo tem/vendeu)
 * para dizer o que comprar sem errar.
 *
 * GET /api/milhao/demanda?dias=90
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dias = Math.min(365, Math.max(7, Number(searchParams.get('dias')) || 90));
        const desde = new Date(Date.now() - dias * 86400_000).toISOString();

        // ── 1. Demanda: 2 tabelas de lead (defensivo — se uma falhar, segue) ──
        const [distRes, manosRes, veiculosRes] = await Promise.all([
            supabaseAdmin
                .from('leads_distribuicao_crm_26')
                .select('interesse, status, criado_em')
                .gte('criado_em', desde)
                .limit(5000),
            supabaseAdmin
                .from('leads_manos_crm')
                .select('vehicle_interest, status, created_at')
                .gte('created_at', desde)
                .limit(5000),
            supabaseAdmin
                .from('milhao_veiculos')
                .select('marca, modelo, status, valor_compra, custos_reconto, valor_venda, data_compra, data_venda'),
        ]);

        const rawDemand: { texto: string; status: string }[] = [];
        for (const r of distRes.data || []) rawDemand.push({ texto: r.interesse, status: (r.status || '').toLowerCase() });
        for (const r of manosRes.data || []) rawDemand.push({ texto: r.vehicle_interest, status: (r.status || '').toLowerCase() });

        const totalLeadsJanela = rawDemand.length;

        // Agrega demanda por modelo canônico
        const demandMap = new Map<string, DemandAgg>();
        let reconhecidos = 0;
        for (const d of rawDemand) {
            const c = canonVehicle(d.texto);
            if (!c.key) continue;
            reconhecidos++;
            let a = demandMap.get(c.key);
            if (!a) {
                a = { key: c.key, label: c.label, brand: c.brand, model: c.model, total: 0, quentes: 0, vendidos_lead: 0 };
                demandMap.set(c.key, a);
            }
            a.total++;
            if (!LOST.has(d.status)) a.quentes++;
            if (SOLD.has(d.status)) a.vendidos_lead++;
        }

        // ── 2. Oferta: estoque e histórico de venda do fundo, por modelo ──
        const estoqueMap = new Map<string, { count: number; custo: number }>();
        const vendaMap = new Map<string, { count: number; lucro: number; dias: number; margem: number }>();
        const daysBetween = (a: string, b: string) =>
            Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400_000);

        for (const v of veiculosRes.data || []) {
            const c = canonFundVehicle(v.marca, v.modelo);
            if (!c.key) continue;
            const custo = num(v.valor_compra) + num(v.custos_reconto);
            if (v.status === 'vendido') {
                const lucro = num(v.valor_venda) - custo;
                const dias = v.data_compra && v.data_venda ? Math.max(0, daysBetween(v.data_compra, v.data_venda)) : 0;
                const margem = custo > 0 ? lucro / custo : 0;
                const m = vendaMap.get(c.key) || { count: 0, lucro: 0, dias: 0, margem: 0 };
                m.count++; m.lucro += lucro; m.dias += dias; m.margem += margem;
                vendaMap.set(c.key, m);
            } else if (v.status === 'estoque' || v.status === 'reservado') {
                const e = estoqueMap.get(c.key) || { count: 0, custo: 0 };
                e.count++; e.custo += custo;
                estoqueMap.set(c.key, e);
            }
        }

        // ── 3. Ranking de procurados (com cruzamento oferta) ──
        const enrich = (a: DemandAgg) => {
            const est = estoqueMap.get(a.key);
            const ven = vendaMap.get(a.key);
            return {
                ...a,
                em_estoque: est?.count || 0,
                ja_vendemos: ven?.count || 0,
                giro_medio_dias: ven && ven.count ? Math.round(ven.dias / ven.count) : null,
                margem_media: ven && ven.count ? ven.margem / ven.count : null,
                lucro_total_historico: ven?.lucro || 0,
            };
        };

        const procurados = [...demandMap.values()]
            .sort((x, y) => y.total - x.total)
            .slice(0, 20)
            .map(enrich);

        // ── 4. Dicas de compra: procurado e SEM estoque (gap), priorizando ──
        //     modelos que já giraram rápido/bem no fundo.
        const gaps = procurados
            .filter((p) => p.em_estoque === 0 && p.total >= 3)
            .map((p) => {
                let score = p.total + p.quentes * 1.5;
                const motivos: string[] = [`${p.total} leads pediram nos últimos ${dias}d`];
                if (p.quentes >= 3) motivos.push(`${p.quentes} ainda quentes`);
                if (p.ja_vendemos > 0 && p.giro_medio_dias != null) {
                    score += 20;
                    motivos.push(`já vendemos ${p.ja_vendemos}× (giro ${p.giro_medio_dias}d, margem ${((p.margem_media || 0) * 100).toFixed(0)}%)`);
                }
                return { ...p, score, motivo: motivos.join(' · ') };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        // ── 5. Estoque parado sem demanda (aviso de compra errada) ──
        const semProcura = [...estoqueMap.entries()]
            .map(([key, e]) => {
                const dem = demandMap.get(key);
                return { key, count: e.count, custo: e.custo, demanda: dem?.total || 0 };
            })
            .filter((x) => x.demanda <= 1)
            .sort((a, b) => b.custo - a.custo);

        // ── 6. Mais vendidos do fundo ──
        const maisVendidos = [...vendaMap.entries()]
            .map(([key, v]) => {
                const dem = demandMap.get(key);
                const any = procurados.find((p) => p.key === key);
                return {
                    key,
                    label: any?.label || key,
                    count: v.count,
                    lucro_total: v.lucro,
                    giro_medio_dias: v.count ? Math.round(v.dias / v.count) : null,
                    margem_media: v.count ? v.margem / v.count : null,
                    demanda: dem?.total || 0,
                };
            })
            .sort((a, b) => b.count - a.count || b.lucro_total - a.lucro_total);

        return NextResponse.json({
            success: true,
            janela_dias: dias,
            total_leads_janela: totalLeadsJanela,
            leads_reconhecidos: reconhecidos,
            procurados,
            dicas_compra: gaps,
            estoque_sem_procura: semProcura,
            mais_vendidos: maisVendidos,
        });
    } catch (err: any) {
        console.error('[API Milhão demanda] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
