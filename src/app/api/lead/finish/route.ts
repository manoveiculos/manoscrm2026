import { createClient } from '@/lib/supabase/admin';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMotivoPerda, MIN_TEXTO_OUTRO, comporMotivoAuditoria } from '@/constants/lossReasons';

export const maxDuration = 30;

type LeadTable = 'leads_manos_crm' | 'leads_compra' | 'leads_distribuicao_crm_26' | 'leads_master' | 'leadsfacebook';

/**
 * Colunas que EXISTEM em cada tabela (conferido no banco em 14/10/2026).
 *
 * A versão anterior gravava won_at/lost_at em tabelas que não têm essas
 * colunas. O PostgREST rejeita o UPDATE inteiro quando uma coluna não existe,
 * então a venda/perda simplesmente não era salva — e a tela comemorava assim
 * mesmo, porque não olhava a resposta.
 */
interface TableSchema {
    statusSold: string;
    statusLost: string;
    updatedAtCol: string;
    nameCol: string;
    phoneCol: string;
    interestCol: string;
    wonAtCol: string | null;
    lossTextCol: string | null;          // texto legado do motivo
    hasStructured: boolean;              // motivo_perda_estruturado + descarte_financeiro + reversao_attempt_count
    hasDiagnostico: boolean;             // diagnostico_atendimento
    hasUltimaInteracao: boolean;         // ultima_interacao_humana
}

const SCHEMA: Record<LeadTable, TableSchema> = {
    leads_distribuicao_crm_26: {
        statusSold: 'vendido', statusLost: 'perdido', updatedAtCol: 'atualizado_em',
        nameCol: 'nome', phoneCol: 'telefone', interestCol: 'interesse',
        wonAtCol: null, lossTextCol: 'motivo_perda',
        hasStructured: true, hasDiagnostico: true, hasUltimaInteracao: true,
    },
    leads_manos_crm: {
        statusSold: 'vendido', statusLost: 'perdido', updatedAtCol: 'updated_at',
        nameCol: 'name', phoneCol: 'phone', interestCol: 'vehicle_interest',
        wonAtCol: 'won_at', lossTextCol: 'motivo_perda',
        hasStructured: true, hasDiagnostico: true, hasUltimaInteracao: true,
    },
    leads_compra: {
        statusSold: 'comprado', statusLost: 'perdido', updatedAtCol: 'updated_at',
        nameCol: 'nome', phoneCol: 'telefone', interestCol: 'veiculo_original',
        wonAtCol: 'won_at', lossTextCol: 'lost_reason',
        hasStructured: true, hasDiagnostico: true, hasUltimaInteracao: true,
    },
    leads_master: {
        statusSold: 'vendido', statusLost: 'perdido', updatedAtCol: 'updated_at',
        nameCol: 'name', phoneCol: 'phone', interestCol: 'vehicle_interest',
        wonAtCol: null, lossTextCol: 'motivo_perda',
        hasStructured: false, hasDiagnostico: false, hasUltimaInteracao: false,
    },
    leadsfacebook: {
        statusSold: 'vendido', statusLost: 'perdido', updatedAtCol: 'updated_at',
        nameCol: 'nome', phoneCol: 'phone', interestCol: 'vehicle_interest',
        wonAtCol: null, lossTextCol: null,
        hasStructured: false, hasDiagnostico: true, hasUltimaInteracao: true,
    },
};

const VALID_TABLES = new Set<LeadTable>(Object.keys(SCHEMA) as LeadTable[]);

const isAdminEmail = (email?: string | null) => (email || '').toLowerCase() === 'alexandre_gorges@hotmail.com';

/** Aceita "85.900", "85900,00", "R$ 85.900,50", 85900. */
function parseValor(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
    const s = String(v ?? '').replace(/[^\d,.]/g, '');
    if (!s) return 0;
    // Formato BR: ponto = milhar, vírgula = decimal.
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            lead_id, lead_table, finish_type,
            motivo_perda_estruturado, diagnostico_atendimento,
            vehicle_name, sale_value, payment_method,
            vehicle_details, loss_reason, // legado (clientes antigos)
        } = body || {};

        if (!lead_id || !['venda', 'perda', 'compra'].includes(finish_type)) {
            return NextResponse.json({ error: 'lead_id e finish_type (venda|perda|compra) são obrigatórios' }, { status: 400 });
        }
        if (!VALID_TABLES.has(lead_table)) {
            return NextResponse.json({ error: `lead_table inválida: ${lead_table}` }, { status: 400 });
        }
        const table = lead_table as LeadTable;
        const schema = SCHEMA[table];

        // ── Quem está finalizando ────────────────────────────────────────────
        const auth = await createAuthClient();
        const { data: { user } } = await auth.auth.getUser();
        if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

        const admin = createClient();
        const { data: me } = await admin
            .from('consultants_manos_crm')
            .select('id, name, role')
            .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
            .maybeSingle();
        const isAdmin = me?.role === 'admin' || isAdminEmail(user.email);

        const cleanId = String(lead_id).replace(/^(main_|crm26_|dist_|lead_|crm25_|master_|compra_|fb_)/, '');
        const realId: string | number = table === 'leads_distribuicao_crm_26' ? parseInt(cleanId, 10) : cleanId;
        if (table === 'leads_distribuicao_crm_26' && !Number.isFinite(realId as number)) {
            return NextResponse.json({ error: 'lead_id inválido' }, { status: 400 });
        }

        // ── Snapshot do lead (antes do update) ──────────────────────────────
        const { data: lead, error: leadErr } = await admin
            .from(table)
            .select('*')
            .eq('id', realId)
            .maybeSingle();
        if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
        if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

        if (!isAdmin && lead.assigned_consultant_id && me?.id && lead.assigned_consultant_id !== me.id) {
            return NextResponse.json({ error: 'Este lead pertence a outro vendedor.' }, { status: 403 });
        }

        const now = new Date().toISOString();
        const isPerda = finish_type === 'perda';

        // ── Validação da perda: lista fechada ───────────────────────────────
        const motivo = isPerda ? getMotivoPerda(motivo_perda_estruturado) : null;
        const diagnostico = typeof diagnostico_atendimento === 'string' ? diagnostico_atendimento.trim().slice(0, 2000) : '';
        if (isPerda) {
            if (!motivo) {
                return NextResponse.json({ error: 'Escolha o motivo da perda na lista.' }, { status: 400 });
            }
            if (motivo.exigeTexto && diagnostico.length < MIN_TEXTO_OUTRO) {
                return NextResponse.json({ error: `Motivo "Outro": descreva o que aconteceu (mín. ${MIN_TEXTO_OUTRO} caracteres).` }, { status: 400 });
            }
        }

        // ── Validação da venda: veículo ─────────────────────────────────────
        const valorVenda = parseValor(sale_value);
        const veiculoVenda = String(vehicle_name || vehicle_details || lead[schema.interestCol] || '').trim().slice(0, 300);
        if (finish_type === 'venda' && !veiculoVenda) {
            return NextResponse.json({ error: 'Informe o veículo vendido.' }, { status: 400 });
        }

        // ── 1. Status do lead ───────────────────────────────────────────────
        const oldStatus: string | null = lead.status || null;
        const textoPerda = isPerda && motivo ? comporMotivoAuditoria(motivo.v, diagnostico) : null;
        const updatePayload: Record<string, any> = {
            status: isPerda ? schema.statusLost : schema.statusSold,
            [schema.updatedAtCol]: now,
        };
        if (schema.hasUltimaInteracao) updatePayload.ultima_interacao_humana = now;

        if (isPerda && motivo) {
            if (schema.lossTextCol) updatePayload[schema.lossTextCol] = (textoPerda || motivo.l).slice(0, 250);
            if (schema.hasStructured) {
                updatePayload.motivo_perda_estruturado = motivo.v;
                if (motivo.descarteFinanceiro) updatePayload.descarte_financeiro = true;
                // Mesmo sinal que o detector de intenção usa: 99 = reversão travada.
                if (motivo.travaReversao) updatePayload.reversao_attempt_count = 99;
            }
            if (schema.hasDiagnostico) updatePayload.diagnostico_atendimento = textoPerda;
            if (table === 'leads_manos_crm') updatePayload.ai_score_at_loss = Number(lead.ai_score) || 0;
        } else if (!isPerda && schema.wonAtCol) {
            updatePayload[schema.wonAtCol] = now;
        }

        const { error: statusError } = await admin.from(table).update(updatePayload).eq('id', realId);
        if (statusError) {
            console.error(`[finish] Erro ao atualizar status em ${table}:`, statusError);
            return NextResponse.json({ error: statusError.message }, { status: 500 });
        }

        // Dono da venda/perda: quem tem o lead; se não tem dono, quem finalizou.
        const ownerId: string | null = lead.assigned_consultant_id || me?.id || null;
        let ownerName: string | null = ownerId && ownerId === me?.id ? (me?.name || null) : null;
        if (ownerId && !ownerName) {
            const { data: c } = await admin.from('consultants_manos_crm').select('name').eq('id', ownerId).maybeSingle();
            ownerName = c?.name || null;
        }

        // ── 2. Venda → sales_manos_crm (idempotente) ────────────────────────
        // Só grava na TABELA. `sales` é uma view simples sobre ela: inserir nas
        // duas duplicava cada venda (todas as linhas de julho estão em dobro).
        let saleId: string | null = null;
        if (finish_type === 'venda') {
            const nomeVeiculo = payment_method ? `${veiculoVenda} | ${String(payment_method).slice(0, 40)}` : veiculoVenda;
            const { data: existing } = await admin
                .from('sales_manos_crm')
                .select('id, sale_value')
                .eq('lead_id', String(realId))
                .limit(1);
            if (existing && existing.length > 0) {
                // Linha já criada (trigger de status ou clique duplo): completa
                // valor e veículo em vez de gravar a venda de novo.
                saleId = existing[0].id;
                const patch: Record<string, any> = { vehicle_name: nomeVeiculo };
                if (!Number(existing[0].sale_value) && valorVenda) patch.sale_value = valorVenda;
                await admin.from('sales_manos_crm').update(patch).eq('id', existing[0].id);
            } else {
                const { data: sale, error: saleErr } = await admin
                    .from('sales_manos_crm')
                    .insert({
                        lead_id: String(realId),
                        consultant_id: ownerId,
                        consultant_name: ownerName || 'Equipe',
                        sale_value: valorVenda,
                        sale_date: now,
                        created_at: now,
                        vehicle_name: nomeVeiculo,
                        client_name: lead[schema.nameCol] || null,
                        phone: lead[schema.phoneCol] || null,
                    })
                    .select('id')
                    .single();
                if (saleErr) {
                    // O lead já foi marcado vendido; sem a linha a venda some dos
                    // relatórios. Devolve erro pra tela avisar em vez de comemorar.
                    console.error('[finish] Erro ao gravar sales_manos_crm:', saleErr);
                    return NextResponse.json({ error: `Lead marcado como vendido, mas a venda não foi registrada: ${saleErr.message}` }, { status: 500 });
                }
                saleId = sale?.id || null;
            }
        }

        // ── 3. Perda → perdidos_auditoria na hora ───────────────────────────
        // Antes a fila só era populada quando o admin abria /admin/perdidos;
        // ninguém abriu depois de 31/07 e as perdas pararam de aparecer.
        // Só os campos de snapshot: o upsert não toca no que o admin auditou.
        if (isPerda && motivo) {
            const { error: auditErr } = await admin.from('perdidos_auditoria').upsert({
                lead_uid: `${table}:${realId}`,
                categoria: 'perdido',
                cliente_nome: lead[schema.nameCol] || null,
                cliente_telefone: lead[schema.phoneCol] || null,
                veiculo_interesse: lead[schema.interestCol] || lead.vehicle_interest || null,
                vendedor_consultant_id: ownerId,
                vendedor_nome: ownerName,
                motivo: textoPerda,
                perdido_em: now,
            }, { onConflict: 'lead_uid' });
            if (auditErr) console.error('[finish] perdidos_auditoria:', auditErr.message);
        }

        // ── 4. Timeline (best-effort) ───────────────────────────────────────
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(realId));
        const notes = isPerda
            ? `🚫 ENCERRADO COMO PERDA: ${textoPerda || loss_reason || 'Não informado'}`
            : finish_type === 'compra'
                ? `🔄 COMPRA / TROCA REGISTRADA: ${veiculoVenda || 'Veículo não informado'}`
                : `🏆 VENDA REALIZADA: ${veiculoVenda}${valorVenda ? ` — R$ ${valorVenda.toLocaleString('pt-BR')}` : ''}`;
        const { error: tlErr } = await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: String(realId),
            type: isPerda ? 'loss' : 'sale',
            notes,
            old_status: oldStatus,
            new_status: updatePayload.status,
            consultant_id: me?.id || ownerId,
            user_name: me?.name || 'Sistema',
            created_at: now,
        });
        if (tlErr) console.warn('[finish] timeline:', tlErr.message);

        // Classificação da categoria (só leads_manos_crm tem loss_category)
        if (isPerda && textoPerda && table === 'leads_manos_crm') {
            classifyLossReasonAsync(String(realId), textoPerda, admin).catch(
                (e) => console.error('[finish] classifyLoss falhou:', e)
            );
        }

        return NextResponse.json({
            success: true,
            status: updatePayload.status,
            table,
            sale_id: saleId,
        });
    } catch (err: any) {
        console.error('[finish-lead CRM]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function classifyLossReasonAsync(leadId: string, reason: string, admin: ReturnType<typeof createClient>) {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
            role: 'user',
            content: `Classifique o motivo de perda de venda de veículo em EXATAMENTE UMA das categorias:\npreco | concorrente | sem_interesse | sem_resposta | credito_negado | outro\n\nMotivo informado: "${reason}"\n\nResponda APENAS com a categoria, nada mais.`,
        }],
        max_tokens: 10,
        temperature: 0,
    });

    const raw = res.choices[0]?.message?.content?.trim().toLowerCase() || 'outro';
    const valid = ['preco', 'concorrente', 'sem_interesse', 'sem_resposta', 'credito_negado', 'outro'];
    const category = valid.includes(raw) ? raw : 'outro';

    await admin
        .from('leads_manos_crm')
        .update({ loss_category: category })
        .eq('id', leadId);
}
