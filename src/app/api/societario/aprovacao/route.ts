import { NextRequest, NextResponse } from 'next/server';
import { aprovarOperacao } from '@/lib/services/societarioService';
import { requireSocio } from '../_guard';

// O sócio aprova só o próprio lado: quem é sai da sessão, nunca do body.
export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;
    if (!guard.nome) {
        return NextResponse.json({ success: false, error: 'Login sem sócio identificado (Alexandre ou Ivo).' }, { status: 403 });
    }

    try {
        const { veiculo_id, acao } = await req.json();
        if (!veiculo_id || (acao !== 'aprovar' && acao !== 'desfazer')) {
            return NextResponse.json({ success: false, error: 'Informe veiculo_id e acao ("aprovar" ou "desfazer").' }, { status: 400 });
        }

        const result = await aprovarOperacao({ veiculo_id, socio: guard.nome, acao });
        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('Erro na API /api/societario/aprovacao:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao registrar aprovação.' },
            { status: 500 }
        );
    }
}
