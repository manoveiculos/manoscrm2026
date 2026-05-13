import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { sendWhatsApp, isSenderConfigured } from '@/lib/services/whatsappSender';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { findMatch, getRecentForPrompt, formatVehicle, getInventory, AltimusVehicle } from '@/lib/services/altimusInventory';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GET /api/cron/followup-ai — AGENTE DE REVERSÃO
 *
 * MUDANÇA DE ESCOPO (2026-05-13): bot de triagem inicial (aiSdrService)
 * cuida do primeiro contato. Vendedor humano conduz negociação. Este cron
 * AGORA é especialista em REATIVAR leads marcados como Perdidos ou Arquivados.
 *
 * Fluxo:
 *   1. Busca leads com status perdido/lost ou archived_at preenchido.
 *   2. Filtra: descarte_financeiro=false, reversao_attempt_count<3,
 *      respondeu_follow_up=false, atendimento_manual_at=null,
 *      sem tentativa nas últimas 24h.
 *   3. Lê motivo_perda_estruturado + diagnostico_atendimento + histórico
 *      completo de whatsapp_messages.
 *   4. Decide estratégia de virada baseada no motivo:
 *      - preco/parcela → carro mais barato no estoque (cheaper)
 *      - modelo → últimos cadastrados (newer)
 *      - concorrente → reforça diferencial sem mencionar carro (reinforce_value)
 *      - sumiu/outro → reativação leve (gentle_pulse)
 *   5. Sanity check de preço (bloqueia >R$400k não-premium).
 *   6. Gera msg com GPT-4o-mini + histórico no prompt.
 *   7. Envia via whatsappSender (kind='ai_followup').
 *   8. Salva em whatsapp_messages + historico_followup + interactions.
 *   9. Incrementa reversao_attempt_count + reversao_last_attempt_at.
 *
 * Quando cliente responder, webhook/whatsapp marca flagged_reversao=true
 * e dispara notifyConsultant(level=3) — lead reaparece no Inbox com badge.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    return await withHeartbeat('followup-ai', async () => {
        const out = await runReversaoAgent();
        return { result: NextResponse.json(out), metrics: out };
    });
}

type Strategy = 'cheaper' | 'newer' | 'reinforce_value' | 'gentle_pulse';

interface LeadReversao {
    id: string | number;
    table: 'leads_manos_crm' | 'leads_distribuicao_crm_26' | 'leads_compra';
    name: string | null;
    phone: string | null;
    vehicle_interest: string | null;
    assigned_consultant_id: string | null;
    motivo_perda_estruturado: string | null;
    diagnostico_atendimento: string | null;
    reversao_attempt_count: number;
    valor_referencia: number | null;  // valor_investimento ou último preço cogitado
}

/** Mapeia motivo → estratégia de reversão. */
function strategyFor(motivo: string | null | undefined): Strategy {
    const m = (motivo || '').toLowerCase();
    if (m === 'preco' || m === 'parcela') return 'cheaper';
    if (m === 'modelo') return 'newer';
    if (m === 'concorrente') return 'reinforce_value';
    return 'gentle_pulse'; // sumiu, outro, vazio
}

/**
 * Seleciona o "carro da virada" baseado na estratégia.
 * Retorna null se não há candidato seguro (ex: cheaper sem preço de referência).
 */
async function selectCarroDaVirada(
    strategy: Strategy,
    originalInterest: string | null,
    valorReferencia: number | null
): Promise<AltimusVehicle | null> {
    if (strategy === 'reinforce_value' || strategy === 'gentle_pulse') {
        // Esses não dependem de carro específico — IA reforça valor da Manos.
        return null;
    }

    const inventory = await getInventory().catch(() => []);

    if (strategy === 'cheaper') {
        // Sem referência de preço → tenta findMatch e retorna mais barato similar
        const baseMatch = originalInterest ? await findMatch(originalInterest).catch(() => null) : null;
        const target = valorReferencia || baseMatch?.preco || null;
        if (!target) {
            // Sem alvo de preço — pega top barato do estoque
            const ordered = inventory
                .filter(v => v.preco && v.preco > 0)
                .sort((a, b) => (a.preco || 0) - (b.preco || 0));
            return ordered[0] || null;
        }
        const ceiling = target * 0.70; // -30%
        const cheaper = inventory
            .filter(v => v.preco && v.preco > 0 && v.preco <= ceiling)
            .sort((a, b) => (b.preco || 0) - (a.preco || 0)); // mais caro abaixo do teto = melhor
        return cheaper[0] || null;
    }

    if (strategy === 'newer') {
        const recent = await getRecentForPrompt(5).catch(() => []);
        return recent[0] || null;
    }

    return null;
}

/** Sanity check de preço — bloqueia >R$400k em não-premium. */
const PREMIUM_BRANDS = ['bmw', 'mercedes', 'audi', 'porsche', 'land rover', 'jaguar', 'lexus', 'volvo', 'maserati', 'ferrari', 'lamborghini'];
function isPriceSane(v: AltimusVehicle | null): boolean {
    if (!v || !v.preco) return true;
    if (v.preco <= 400_000) return true;
    const marca = (v.marca || '').toLowerCase();
    return PREMIUM_BRANDS.some(b => marca.includes(b));
}

/** Lê últimas N mensagens do lead pra dar contexto à IA. */
async function readChatHistory(
    admin: ReturnType<typeof createClient>,
    leadId: string | number,
    limit = 10
): Promise<string> {
    const leadIdParam: any = typeof leadId === 'number' ? leadId : (/^\d+$/.test(String(leadId)) ? parseInt(String(leadId), 10) : leadId);
    const { data: msgs } = await admin
        .from('whatsapp_messages')
        .select('direction, message_text, created_at')
        .eq('lead_id', leadIdParam)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (!msgs || msgs.length === 0) return '';

    return [...msgs].reverse().map(m => {
        const who = m.direction === 'inbound' ? 'CLIENTE' : 'NÓS';
        const text = (m.message_text || '').slice(0, 200).replace(/\s+/g, ' ').trim();
        return text ? `${who}: ${text}` : null;
    }).filter(Boolean).join('\n');
}

async function fetchEligibleLeads(admin: ReturnType<typeof createClient>): Promise<LeadReversao[]> {
    const cutoff24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const result: LeadReversao[] = [];

    // ── leads_manos_crm ──────────────────────────────────────────
    const { data: lmc } = await admin
        .from('leads_manos_crm')
        .select('id, name, phone, vehicle_interest, assigned_consultant_id, motivo_perda_estruturado, diagnostico_atendimento, reversao_attempt_count, reversao_last_attempt_at, valor_investimento, status, archived_at, descarte_financeiro, respondeu_follow_up, atendimento_manual_at, ai_silence_until')
        .or('status.in.(perdido,lost,lost_by_inactivity),archived_at.not.is.null')
        .eq('descarte_financeiro', false)
        .lt('reversao_attempt_count', 3)
        .or('respondeu_follow_up.is.null,respondeu_follow_up.eq.false')
        .is('atendimento_manual_at', null)
        .or(`reversao_last_attempt_at.is.null,reversao_last_attempt_at.lt.${cutoff24h}`)
        .limit(30);

    for (const l of lmc || []) {
        const lm: any = l;
        if (lm.ai_silence_until && new Date(lm.ai_silence_until).getTime() > Date.now()) continue;
        result.push({
            id: lm.id,
            table: 'leads_manos_crm',
            name: lm.name,
            phone: lm.phone,
            vehicle_interest: lm.vehicle_interest,
            assigned_consultant_id: lm.assigned_consultant_id,
            motivo_perda_estruturado: lm.motivo_perda_estruturado,
            diagnostico_atendimento: lm.diagnostico_atendimento,
            reversao_attempt_count: lm.reversao_attempt_count || 0,
            valor_referencia: typeof lm.valor_investimento === 'number' ? lm.valor_investimento : null,
        });
    }

    // ── leads_distribuicao_crm_26 ───────────────────────────────
    const { data: ldc } = await admin
        .from('leads_distribuicao_crm_26')
        .select('id, nome, telefone, interesse, assigned_consultant_id, motivo_perda_estruturado, diagnostico_atendimento, reversao_attempt_count, reversao_last_attempt_at, status, archived_at, descarte_financeiro, respondeu_follow_up, atendimento_manual_at, ai_silence_until')
        .or('status.in.(perdido,lost,lost_by_inactivity),archived_at.not.is.null')
        .eq('descarte_financeiro', false)
        .lt('reversao_attempt_count', 3)
        .or('respondeu_follow_up.is.null,respondeu_follow_up.eq.false')
        .is('atendimento_manual_at', null)
        .or(`reversao_last_attempt_at.is.null,reversao_last_attempt_at.lt.${cutoff24h}`)
        .limit(30);

    for (const l of ldc || []) {
        const lm: any = l;
        if (lm.ai_silence_until && new Date(lm.ai_silence_until).getTime() > Date.now()) continue;
        result.push({
            id: lm.id,
            table: 'leads_distribuicao_crm_26',
            name: lm.nome,
            phone: lm.telefone,
            vehicle_interest: lm.interesse,
            assigned_consultant_id: lm.assigned_consultant_id,
            motivo_perda_estruturado: lm.motivo_perda_estruturado,
            diagnostico_atendimento: lm.diagnostico_atendimento,
            reversao_attempt_count: lm.reversao_attempt_count || 0,
            valor_referencia: null,
        });
    }

    // ── leads_compra ────────────────────────────────────────────
    const { data: lcom } = await admin
        .from('leads_compra')
        .select('id, nome, telefone, veiculo_original, assigned_consultant_id, motivo_perda_estruturado, diagnostico_atendimento, reversao_attempt_count, reversao_last_attempt_at, status, archived_at, descarte_financeiro, respondeu_follow_up, atendimento_manual_at, ai_silence_until, valor_cliente')
        .or('status.in.(perdido,lost,lost_by_inactivity),archived_at.not.is.null')
        .eq('descarte_financeiro', false)
        .lt('reversao_attempt_count', 3)
        .or('respondeu_follow_up.is.null,respondeu_follow_up.eq.false')
        .is('atendimento_manual_at', null)
        .or(`reversao_last_attempt_at.is.null,reversao_last_attempt_at.lt.${cutoff24h}`)
        .limit(30);

    for (const l of lcom || []) {
        const lm: any = l;
        if (lm.ai_silence_until && new Date(lm.ai_silence_until).getTime() > Date.now()) continue;
        result.push({
            id: lm.id,
            table: 'leads_compra',
            name: lm.nome,
            phone: lm.telefone,
            vehicle_interest: lm.veiculo_original,
            assigned_consultant_id: lm.assigned_consultant_id,
            motivo_perda_estruturado: lm.motivo_perda_estruturado,
            diagnostico_atendimento: lm.diagnostico_atendimento,
            reversao_attempt_count: lm.reversao_attempt_count || 0,
            valor_referencia: typeof lm.valor_cliente === 'number' ? lm.valor_cliente : null,
        });
    }

    return result;
}

const STRATEGY_INSTRUCTIONS: Record<Strategy, string> = {
    cheaper: 'Cliente saiu por preço/parcela. Apresente o carro da virada (mais barato) como NOVA OPORTUNIDADE — sem mencionar que ele "achou caro". Faça parecer descoberta nova.',
    newer: 'Cliente queria outro modelo. Apresente UM veículo recém-chegado como novidade que combina com perfil dele. Não diga "vi que você queria outro".',
    reinforce_value: 'Cliente foi pro concorrente. NÃO mencione carro específico. Reforce 3 diferenciais Manos: avaliação gratuita do usado, garantia, documentação rápida. Pergunte se ainda dá pra reverter.',
    gentle_pulse: 'Cliente sumiu. Mensagem MUITO leve: "tudo bem?", "ainda procura carro?". Não vende, só reabre porta.',
};

async function runReversaoAgent() {
    const admin = createClient();
    const log: string[] = [];
    let candidates = 0, sent = 0, skipped = 0, failed = 0, pingedVendor = 0;

    if (!isSenderConfigured()) {
        log.push('⚠️ Sender não configurado — não envia, apenas processa.');
    }

    // Check global pause + horário
    const { data: settings } = await admin.from('system_settings').select('*');
    const globalPause = settings?.find(s => s.id === 'global')?.ai_paused ?? false;
    const aiConfig = settings?.find(s => s.id === 'ai_config')?.value ?? {};
    if (globalPause) {
        return { success: true, message: 'IA pausada globalmente.', log: ['IA pausada globalmente.'] };
    }
    const nowObj = new Date();
    const currentStr = nowObj.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const startHour = aiConfig.start_hour || '08:00';
    const endHour = aiConfig.end_hour || '20:00';
    if (currentStr < startHour || currentStr > endHour) {
        log.push(`💤 Fora do horário (${startHour}-${endHour}). Atual: ${currentStr}`);
        return { success: true, message: 'Fora do horário.', log };
    }

    const leads = await fetchEligibleLeads(admin);
    candidates = leads.length;
    log.push(`🎯 ${candidates} leads elegíveis pra reversão`);

    for (const lead of leads) {
        try {
            if (!lead.phone) { skipped++; continue; }

            const firstName = (lead.name || 'Cliente').split(' ')[0];
            const strategy = strategyFor(lead.motivo_perda_estruturado);
            const attemptNumber = lead.reversao_attempt_count + 1;

            // Lê histórico
            const history = await readChatHistory(admin, lead.id, 10);

            // Sem nada de contexto + sem diagnóstico → cobra vendedor antes de mandar
            const semContexto = !history && !lead.diagnostico_atendimento;
            if (semContexto && lead.assigned_consultant_id) {
                try {
                    const { notifyConsultant } = await import('@/lib/services/consultantNotifier');
                    await notifyConsultant({
                        consultantId: lead.assigned_consultant_id,
                        leadId: String(lead.id),
                        level: 1,
                        title: `🤔 Lead ${lead.name || ''} sem contexto pra reverter`,
                        message: `Esse lead foi perdido/arquivado mas não tem histórico nem diagnóstico. Quer escrever 1 linha sobre o que rolou ou descartar?`,
                    });
                    pingedVendor++;
                    log.push(`📞 Vendedor notificado (sem contexto): ${lead.name}`);
                } catch { /* notifier falhou — segue mesmo assim */ }
                skipped++;
                continue;
            }

            // Seleciona carro da virada
            const carroDaVirada = await selectCarroDaVirada(strategy, lead.vehicle_interest, lead.valor_referencia);

            // Sanity check
            if (!isPriceSane(carroDaVirada)) {
                log.push(`🚫 Sanity check bloqueou: ${carroDaVirada?.marca} ${carroDaVirada?.modelo} R$ ${carroDaVirada?.preco}`);
                skipped++;
                continue;
            }

            // Bloco de estoque pro prompt
            const estoqueBlock = carroDaVirada
                ? `\nVEÍCULO DA VIRADA (use APENAS este — NUNCA invente outro):\n- ${formatVehicle(carroDaVirada)}${carroDaVirada.link ? ' · ' + carroDaVirada.link : ''}`
                : '\n(sem veículo da virada — estratégia foca em valor da Manos, NÃO mencione carro)';

            const historicoBlock = history
                ? `\nHISTÓRICO DA CONVERSA (recente embaixo):\n${history}`
                : '';

            const diagnosticoBlock = lead.diagnostico_atendimento
                ? `\nDIAGNÓSTICO DO VENDEDOR: ${lead.diagnostico_atendimento}`
                : '';

            const sysPrompt = `Você é o Agente de Reversão da Manos Veículos (Rio do Sul/SC).
Cliente foi marcado como Perdido ou Arquivado pelo vendedor.
Seu objetivo: trazer esse cliente de volta com 1 mensagem certeira.

ESTRATÉGIA DESTA REVERSÃO: ${strategy.toUpperCase()}
${STRATEGY_INSTRUCTIONS[strategy]}

REGRAS INEGOCIÁVEIS:
1. PROIBIDO inventar marca, modelo, ano ou preço fora do bloco de estoque. Use TEXTUALMENTE o que está lá.
2. PROIBIDO mencionar que o cliente "desistiu", "achou caro", "sumiu" ou qualquer referência negativa.
3. PROIBIDO repetir o que já foi dito no histórico.
4. Português Brasil, sem emojis, máximo 240 caracteres.
5. Comece pelo primeiro nome. Termine com UMA pergunta direta.
6. Tom humano, direto, sem floreio comercial.`;

            const userPrompt = `Cliente: ${firstName}
Motivo da perda (não mencionar): ${lead.motivo_perda_estruturado || 'não informado'}
Tentativa de reversão: ${attemptNumber}/3
Interesse original: ${lead.vehicle_interest || 'não informado'}
${diagnosticoBlock}
${historicoBlock}
${estoqueBlock}

Gere a mensagem de reversão usando a estratégia ${strategy}. Resposta em JSON: { "mensagem": "..." }`;

            const llmRes = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.5,
                max_tokens: 160,
            }, { timeout: 10000 }).catch((e: any) => {
                log.push(`❌ OpenAI falhou ${lead.name}: ${e?.message}`);
                return null;
            });

            const parsed = llmRes ? JSON.parse(llmRes.choices[0]?.message?.content || '{}') : {};
            let msg: string = (parsed.mensagem || '').trim();
            if (!msg || msg.length < 20) {
                // Fallback seguro
                msg = `${firstName}, ainda posso te ajudar com seu carro? Tenho condição nova hoje.`;
            }

            // Envia
            let sendResult: { ok: boolean; provider: string; error?: string } = { ok: false, provider: 'none' };
            if (isSenderConfigured()) {
                sendResult = await sendWhatsApp({
                    toPhone: lead.phone,
                    message: msg,
                    kind: 'ai_followup',
                    leadId: String(lead.id),
                });
                if (sendResult.ok) sent++; else failed++;
            }

            const messageId = `ai_followup_reversao_${Date.now()}`;

            // Grava bolha em whatsapp_messages
            if (sendResult.ok) {
                await admin.from('whatsapp_messages').insert({
                    lead_id: lead.id,
                    direction: 'outbound',
                    message_text: msg,
                    message_id: messageId,
                }).then(null, () => {});
            }

            // Grava em historico_followup
            if (sendResult.ok) {
                await admin.from('historico_followup').insert({
                    lead_id: String(lead.id),
                    lead_table: lead.table,
                    attempt_number: attemptNumber,
                    mensagem_enviada: msg,
                    veiculo_ofertado: carroDaVirada ? formatVehicle(carroDaVirada) : null,
                    preco_real_estoque: carroDaVirada?.preco || null,
                    abordagem: `reversao_${strategy}`,
                    instance_used: process.env.EVOLUTION_FOLLOWUP_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'default',
                }).then(null, () => {});
            }

            // Audit trail
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(lead.id));
            await admin.from('interactions_manos_crm').insert({
                [isUUID ? 'lead_id' : 'lead_id_v1']: String(lead.id),
                type: 'ai_followup_reversao',
                notes: sendResult.ok
                    ? `🔁 REVERSÃO ${strategy.toUpperCase()} tentativa ${attemptNumber}/3 via ${sendResult.provider}: "${msg}"`
                    : `📝 REVERSÃO ${strategy.toUpperCase()} sem envio: ${sendResult.error || 'sem provider'}`,
                user_name: 'IA Reversão',
                created_at: new Date().toISOString(),
            }).then(null, () => {});

            // Atualiza lead — incrementa contador
            if (sendResult.ok) {
                const updates: Record<string, any> = {
                    reversao_attempt_count: attemptNumber,
                    reversao_last_attempt_at: new Date().toISOString(),
                };
                if (lead.table === 'leads_distribuicao_crm_26') {
                    updates.atualizado_em = new Date().toISOString();
                } else {
                    updates.updated_at = new Date().toISOString();
                }
                const realId = lead.table === 'leads_distribuicao_crm_26' ? lead.id : String(lead.id);
                await admin.from(lead.table).update(updates).eq('id', realId);
            }

            log.push(`${sendResult.ok ? '📤' : '📝'} ${lead.name} [${strategy} ${attemptNumber}/3] → "${msg.slice(0, 60)}..."`);
        } catch (e: any) {
            failed++;
            log.push(`❌ ${lead.name} → ${e?.message}`);
        }
    }

    return { success: true, candidates, sent, skipped, failed, pingedVendor, log };
}
