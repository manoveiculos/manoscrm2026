import { NextRequest, NextResponse } from 'next/server';
import { runGenerateProposal } from '@/lib/services/proposal-service';

export const maxDuration = 30;

/**
 * POST /api/lead/generate-proposal
 * Gera 3 cenários de proposta de financiamento para o vendedor apresentar.
 */
export async function POST(req: NextRequest) {
    try {
        const { leadId } = await req.json();
        if (!leadId) return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 });

        const proposal = await runGenerateProposal(leadId);

        return NextResponse.json(proposal);
    } catch (err: any) {
        console.error('[generate-proposal]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
