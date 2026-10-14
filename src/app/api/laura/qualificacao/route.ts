import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { classificarLead, normalizarPrazo, type QualificacaoCampos } from '@/lib/qualificacao';
import { buscarQualificacao, pisoEstoque, salvarQualificacao } from '@/lib/services/qualificacaoService';
import { cadastrarAlertaAbaixoDaFaixa } from '@/lib/services/alertaCarroAbaixoFaixa';
import { horarioLoja } from '@/lib/services/slaEngine';
import { horariosDeVisita, proximasPerguntas } from '@/lib/laura/playbook';
import { autorizarLaura, leadPorTelefone } from '../_auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/laura/qualificacao — ferramenta "salvar_qualificacao" da Laura.
 *
 * Corpo: { telefone, carro?, entrada?, troca?, prazo? }  (texto livre do cliente)
 * Grava nos campos do lead (vehicle_interest, valor_investimento, carro_troca,
 * prazo_compra) e devolve o que a IA precisa pra próxima mensagem.
 * Não devolve nome nem telefone do cliente.
 */
export async function POST(req: NextRequest) {
    const negado = autorizarLaura(req);
    if (negado) return negado;

    const body = await req.json().catch(() => ({}));
    const admin = createClient();
    const lead = await leadPorTelefone(admin, body?.telefone);
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado para este telefone' }, { status: 404 });

    const campos: QualificacaoCampos = {};
    const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    if (txt(body?.carro)) campos.vehicle_interest = txt(body.carro);
    if (txt(body?.entrada)) campos.valor_investimento = txt(body.entrada);
    if (txt(body?.troca)) campos.carro_troca = txt(body.troca);
    if (txt(body?.prazo)) {
        const p = normalizarPrazo(body.prazo);
        if (p) campos.prazo_compra = p;
    }

    const salvo = await salvarQualificacao(admin, lead.table, lead.id, campos);
    if (!salvo.ok) return NextResponse.json({ ok: false, error: salvo.error }, { status: 400 });

    const uid = `${lead.table}:${lead.id}`;
    const [piso, mapa, { horas, feriados }] = await Promise.all([
        pisoEstoque(admin), buscarQualificacao(admin, [uid]), horarioLoja(admin),
    ]);
    const atual = mapa.get(uid) || campos;
    const q = classificarLead(atual, piso);

    // Item 7: pediu carro abaixo do estoque → vira alerta da Central de Compras.
    const alertaCarro = await cadastrarAlertaAbaixoDaFaixa(admin, lead.table, lead.id);

    return NextResponse.json({
        ok: true,
        lead: `#${lead.id}`,
        selo: q.selo,
        completa: q.completa,
        faltando: q.faltando,
        proximas_perguntas: proximasPerguntas(q.faltando),
        horarios_visita: q.completa ? horariosDeVisita(horas, feriados) : [],
        prazo_nao_entendido: !!txt(body?.prazo) && !campos.prazo_compra,
        campos_ignorados: salvo.ignorados,
        alerta_carro: alertaCarro.status,
    });
}
