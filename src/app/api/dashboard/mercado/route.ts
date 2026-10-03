import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

// Dado de mercado só vale por 36h: se o agente falhar, a tela some em vez de mostrar preço velho.
const MAX_AGE_MS = 36 * 3600_000;

const DICA: Record<string, string> = {
    na_media: 'Disputa direta: responda em minutos e marque a visita — não entre em guerra de preço.',
    acima: 'Mostre o diferencial do carro e leve o cliente para a visita; a gerência está avaliando o preço.',
    abaixo: 'O preço é o seu trunfo: use o comparativo com os concorrentes na conversa.',
    sem_concorrente: 'Sem concorrente direto na região: segure o preço e foque na visita.',
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const authId = searchParams.get('authId');

        // Papel autoritativo pelo banco: gerência vê a ação de preço; vendedor vê só os argumentos.
        let isAdmin = false;
        if (authId) {
            const { data: me } = await supabaseAdmin
                .from('consultants_manos_crm').select('role').eq('auth_id', authId).maybeSingle();
            isAdmin = me?.role === 'admin';
        }

        const since = new Date(Date.now() - MAX_AGE_MS).toISOString();
        const { data, error } = await supabaseAdmin
            .from('mercado_comparativo')
            .select('veiculo_id, nome, ano, km, preco_nosso, n_concorrentes, n_lojas, preco_mediano, menor_preco, gap_mediana_pct, posicao, em_disputa, concorrentes, argumentos, acao_recomendada, atualizado_em')
            .gte('atualizado_em', since);
        if (error) throw error;

        const rows = data || [];
        const comDados = rows.filter((r: any) => r.posicao !== 'sem_dados');
        const ordem: Record<string, number> = { acima: 0, na_media: 1, abaixo: 2, sem_concorrente: 3 };
        const itens = comDados
            .filter((r: any) => r.n_concorrentes > 0)
            .sort((a: any, b: any) => (Number(b.em_disputa) - Number(a.em_disputa)) || (ordem[a.posicao] - ordem[b.posicao]) || (b.gap_mediana_pct ?? 0) - (a.gap_mediana_pct ?? 0))
            .map((r: any) => ({
                id: r.veiculo_id,
                nome: r.nome,
                ano: r.ano,
                km: r.km,
                preco: r.preco_nosso,
                n_concorrentes: r.n_concorrentes,
                n_lojas: r.n_lojas,
                mediana: r.preco_mediano,
                menor: r.menor_preco,
                gap_pct: r.gap_mediana_pct,
                posicao: r.posicao,
                em_disputa: r.em_disputa,
                argumentos: r.argumentos || [],
                dica: DICA[r.posicao] || '',
                concorrentes: (r.concorrentes || []).slice(0, 3),
                ...(isAdmin ? { acao: r.acao_recomendada } : {}),
            }));

        const resumo = {
            analisados: comDados.length,
            em_disputa: comDados.filter((r: any) => r.em_disputa).length,
            acima: comDados.filter((r: any) => r.posicao === 'acima').length,
            na_media: comDados.filter((r: any) => r.posicao === 'na_media').length,
            abaixo: comDados.filter((r: any) => r.posicao === 'abaixo').length,
            exclusivos: comDados.filter((r: any) => r.posicao === 'sem_concorrente').length,
        };
        const atualizado_em = rows.reduce((m: string | null, r: any) => (!m || r.atualizado_em > m ? r.atualizado_em : m), null);

        return NextResponse.json({ success: true, view: isAdmin ? 'gerencia' : 'consultor', atualizado_em, resumo, itens });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 });
    }
}
