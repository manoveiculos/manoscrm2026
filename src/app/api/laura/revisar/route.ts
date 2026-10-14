import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { revisarResposta } from '@/lib/laura/guardrails';
import { entradaEmReais, faixaMaximaDoInteresse } from '@/lib/qualificacao';
import { buscarQualificacao } from '@/lib/services/qualificacaoService';
import { autorizarLaura, leadPorTelefone, precosAnunciados } from '../_auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/laura/revisar — ferramenta "revisar_resposta" da Laura.
 *
 * Corpo: { texto, telefone? }
 * Devolve { ok, violacoes, texto_seguro }. A IA SEMPRE envia texto_seguro:
 * se a mensagem avaliar carro, simular parcela, fechar negócio ou citar preço
 * fora do anúncio, ela é trocada por uma resposta que convida pra visita.
 */
export async function POST(req: NextRequest) {
    const negado = autorizarLaura(req);
    if (negado) return negado;

    const body = await req.json().catch(() => ({}));
    const texto = typeof body?.texto === 'string' ? body.texto : '';
    if (!texto.trim()) return NextResponse.json({ ok: false, error: 'texto vazio' }, { status: 400 });

    const admin = createClient();
    const precos = await precosAnunciados(admin);

    // Números que o próprio cliente disse podem ser repetidos ("até 60 mil").
    const valoresDoCliente: number[] = [];
    if (body?.telefone) {
        const lead = await leadPorTelefone(admin, body.telefone);
        if (lead) {
            const campos = (await buscarQualificacao(admin, [`${lead.table}:${lead.id}`])).get(`${lead.table}:${lead.id}`);
            const faixa = faixaMaximaDoInteresse(campos?.vehicle_interest);
            const entrada = entradaEmReais(campos?.valor_investimento);
            if (faixa) valoresDoCliente.push(faixa);
            if (entrada) valoresDoCliente.push(entrada);
        }
    }

    const r = revisarResposta(texto, precos, valoresDoCliente);
    if (!r.ok) console.warn('[laura/revisar] bloqueado:', r.violacoes.join(','));
    return NextResponse.json(r);
}
