import { NextRequest, NextResponse } from 'next/server';
import { autorizarLaura } from '../_auth';
import { estoqueAtual, filtrarEstoque } from '@/lib/estoque';

export const dynamic = 'force-dynamic';

/**
 * GET /api/laura/estoque?busca=&id=&limite= — ferramenta de estoque da Laura no n8n
 * (substitui a leitura da tabela `estoque`, obsoleta).
 *
 * Mesmo segredo das outras rotas /api/laura/*: Authorization: Bearer <LAURA_API_KEY>.
 * Devolve, por carro: id, descrição exata do feed, marca, modelo, versão, ano, km,
 * cor, preço, opcionais e fotos. Nada encontrado = lista vazia (nunca inventa).
 * `desatualizado: true` = a Altimus não respondeu e a lista é a última cópia boa.
 * Regra da loja: todos os veículos são completos; opcionais só os que vêm aqui.
 */
export async function GET(req: NextRequest) {
    const negado = autorizarLaura(req);
    if (negado) return negado;

    const u = new URL(req.url).searchParams;
    const estado = await estoqueAtual();
    const carros = filtrarEstoque(estado.carros, { busca: u.get('busca'), id: u.get('id'), limite: Number(u.get('limite')) || undefined });
    return NextResponse.json(
        {
            ok: true,
            total_no_estoque: estado.carros.length,
            encontrados: carros.length,
            desatualizado: estado.desatualizado,
            atualizado_em: estado.atualizadoEm,
            carros,
        },
        { headers: { 'Cache-Control': 'no-store' } },
    );
}
