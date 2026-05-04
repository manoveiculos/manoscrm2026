import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { sendWhatsApp, isSenderConfigured } from '@/lib/services/whatsappSender';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { findMatch, getRecentForPrompt, formatVehicle, AltimusVehicle } from '@/lib/services/altimusInventory';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_FOLLOWUP_SLA: Record<string, number> = {
    ataque: 6,
    triagem: 6,
    fechamento: 3,
    confirmed: 6,
    scheduled: 6,
    negotiation: 3,
    proposed: 3,
};

type SlaRow = { origem: string; stage: string; followup_hours: number | null };
type FollowupMap = Map<string, number>;

async function loadFollowupMap(admin: ReturnType<typeof createClient>): Promise<FollowupMap> {
    const { data } = await admin
        .from('sla_config')
        .select('origem, stage, followup_hours')
        .not('followup_hours', 'is', null);
    const map: FollowupMap = new Map();
    for (const row of (data as SlaRow[] || [])) {
        if (row.followup_hours !== null) {
            map.set(`${row.origem}|${row.stage}`, row.followup_hours);
        }
    }
    return map;
}

function getFollowupHours(origem: string | null | undefined, status: string, map: FollowupMap): number {
    const stageMap: Record<string, string> = {
        confirmed: 'ataque', scheduled: 'ataque',
        negotiation: 'fechamento', proposed: 'fechamento',
    };
    const stage = stageMap[status] || status;
    const key = `${origem || ''}|${stage}`;
    if (map.has(key)) return map.get(key)!;
    const defKey = `default|${stage}`;
    if (map.has(defKey)) return map.get(defKey)!;
    return DEFAULT_FOLLOWUP_SLA[status] ?? 6;
}

/**
 * GET /api/cron/followup-ai
 *
 * Roda a cada 1h via daily-batch. Para leads parados além do SLA da origem,
 * gera mensagem com GPT-4o-mini e ENVIA direto ao cliente via whatsappSender.
 * Registra em follow_ups (status='sent' se enviou, 'pending' se falhou),
 * e em interactions_manos_crm (audit trail).
 *
 * Idempotência: pula leads com follow-up ai_auto pendente OU enviado nas
 * últimas 24h, e respeita flag ai_followup_enabled (default true).
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    return await withHeartbeat('followup-ai', async () => {
        const out = await runFollowupAi();
        return { result: NextResponse.json(out), metrics: out };
    });
}

async function runFollowupAi() {
    const admin = createClient();
    const now = Date.now();
    const log: string[] = [];
    let generated = 0, sent = 0, skipped = 0, failed = 0;

    if (!isSenderConfigured()) {
        log.push('⚠️ Sender não configurado — gerando msgs mas sem enviar.');
    }

    const followupMap = await loadFollowupMap(admin);
    const activeStatuses = Object.keys(DEFAULT_FOLLOWUP_SLA);

    // --- CHECK GLOBAL SETTINGS ---
    const { data: settings } = await admin
        .from('system_settings')
        .select('*');
    
    const globalPause = settings?.find(s => s.id === 'global')?.ai_paused ?? false;
    const aiConfig = settings?.find(s => s.id === 'ai_config')?.value ?? {};
    const followupEnabled = aiConfig.followup_enabled ?? true;

    if (globalPause) {
        return { success: true, message: 'IA pausada globalmente.', log: ['IA pausada globalmente.'] };
    }
    if (!followupEnabled) {
        return { success: true, message: 'Follow-up automático desabilitado.', log: ['Follow-up automático desabilitado nas configurações.'] };
    }

    // Horário de funcionamento check
    const nowObj = new Date();
    const currentStr = nowObj.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const startHour = aiConfig.start_hour || '08:00';
    const endHour = aiConfig.end_hour || '20:00';

    if (currentStr < startHour || currentStr > endHour) {
        log.push(`💤 Fora do horário de funcionamento (${startHour} - ${endHour}). Atual: ${currentStr}`);
        return { success: true, message: 'Fora do horário de funcionamento.', log };
    }

    const { data: leads, error } = await admin
        .from('leads_manos_crm')
        .select('id, name, phone, vehicle_interest, proxima_acao, next_step, status, updated_at, assigned_consultant_id, valor_investimento, carro_troca, source, ai_followup_enabled, ai_classification, behavioral_profile, ai_summary, follow_up_count, respondeu_follow_up, atendimento_manual_at, ai_silence_until')
        .in('status', activeStatuses)
        .is('archived_at', null)
        .lt('follow_up_count', 3)                         // V3: máximo 3 tentativas
        .or('respondeu_follow_up.is.null,respondeu_follow_up.eq.false')  // V3: só quem não respondeu
        .is('atendimento_manual_at', null)                // V3: vendedor já assumiu? não interfere
        .order('updated_at', { ascending: true })
        .limit(30);

    if (error) {
        return { success: false, error: error.message };
    }

    const eligible = (leads || []).filter((l: any) => {
        if (l.ai_followup_enabled === false) return false;
        // V3: respeita ai_silence_until (cooldown 24h após perda)
        if (l.ai_silence_until && new Date(l.ai_silence_until).getTime() > now) return false;

        // SLA dinâmico por temperatura
        let slaH = getFollowupHours(l.source, l.status, followupMap);
        if (l.ai_classification === 'hot') slaH = Math.max(1, Math.floor(slaH * 0.5));
        if (l.ai_classification === 'cold') slaH = slaH * 2;

        const hoursInactive = (now - new Date(l.updated_at || 0).getTime()) / 3_600_000;
        return hoursInactive >= slaH;
    });

    log.push(`🎯 ${eligible.length} leads elegíveis (de ${leads?.length ?? 0} ativos)`);

    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();

    for (const lead of eligible) {
        try {
            // ... (check existing followups) ...
            const { data: existing } = await admin
                .from('follow_ups')
                .select('id, status, scheduled_at')
                .eq('lead_id', lead.id)
                .eq('type', 'ai_auto')
                .gte('scheduled_at', dayAgo)
                .order('scheduled_at', { ascending: false })
                .limit(1);

            if (existing && existing.length > 0) {
                skipped++;
                continue;
            }

            const firstName = (lead.name || 'Cliente').split(' ')[0];
            const behavior = (lead.behavioral_profile as any) || {};
            const sentiment = behavior.sentiment || 'Curioso';

            // V3: ANTI-REPETIÇÃO — consulta últimos 2 follow-ups deste lead
            const { data: lastFollowups } = await admin
                .from('historico_followup')
                .select('mensagem_enviada, veiculo_ofertado, abordagem')
                .eq('lead_id', String(lead.id))
                .order('enviado_em', { ascending: false })
                .limit(2);
            const previousMessages = (lastFollowups || []).map((f: any) => f.mensagem_enviada || '').filter(Boolean);
            const previousVehicles = (lastFollowups || []).map((f: any) => f.veiculo_ofertado || '').filter(Boolean);
            const previousApproaches = (lastFollowups || []).map((f: any) => f.abordagem || '').filter(Boolean);
            const attemptNumber = (lead.follow_up_count || 0) + 1; // 1, 2 ou 3

            // ── ANTI-ALUCINAÇÃO: estoque REAL da Altimus ──────────────────
            let matchedVehicle = await findMatch(lead.vehicle_interest);
            // V3: se já ofertamos esse veículo na última tentativa, troca
            if (matchedVehicle && previousVehicles.some((pv: string) =>
                pv.toLowerCase().includes((matchedVehicle!.modelo || '').toLowerCase()))) {
                matchedVehicle = null;
            }
            const recentInventory = (await getRecentForPrompt(10))
                // V3: filtra veículos já ofertados em tentativas anteriores
                .filter(v => !previousVehicles.some((pv: string) =>
                    pv.toLowerCase().includes((v.modelo || '').toLowerCase()) &&
                    pv.toLowerCase().includes((v.marca || '').toLowerCase())));
            const altimusOk = recentInventory.length > 0 || matchedVehicle !== null;

            // V3: SANITY CHECK — preço acima de R$ 400k em veículo não-premium = suspeito
            const PREMIUM_BRANDS = ['bmw', 'mercedes', 'audi', 'porsche', 'land rover', 'jaguar', 'lexus', 'volvo', 'maserati', 'ferrari', 'lamborghini'];
            const isPremium = (v: AltimusVehicle | null) => v && PREMIUM_BRANDS.some(b =>
                (v.marca || '').toLowerCase().includes(b));
            const candidateVehicle = matchedVehicle || recentInventory[0] || null;
            if (candidateVehicle && candidateVehicle.preco && candidateVehicle.preco > 400_000 && !isPremium(candidateVehicle)) {
                console.error(`[followup-ai] SANITY CHECK BLOQUEOU: ${candidateVehicle.marca} ${candidateVehicle.modelo} R$ ${candidateVehicle.preco} (não-premium acima de 400k — provável bug de parser)`);
                log.push(`🚫 BLOQUEADO sanity check: ${candidateVehicle.marca} ${candidateVehicle.modelo} R$ ${candidateVehicle.preco}`);
                skipped++;
                continue;
            }

            let msg: string;
            let mode: 'matched' | 'similar' | 'generic_safe' = 'generic_safe';
            let abordagem: string = 'soft';
            let veiculoOfertado: string | null = null;
            let precoReal: number | null = null;

            if (!altimusOk) {
                msg = `${firstName}, vi que você se interessou por um dos nossos veículos. Ele ainda faz sentido pra você?`;
                mode = 'generic_safe';
                abordagem = 'soft';
            } else {
                const targetVehicle = matchedVehicle || recentInventory[0];
                veiculoOfertado = targetVehicle ? formatVehicle(targetVehicle) : null;
                precoReal = targetVehicle?.preco || null;

                const inventoryBlock = matchedVehicle
                    ? `VEÍCULO DE INTERESSE QUE AINDA ESTÁ NO ESTOQUE:\n- ${formatVehicle(matchedVehicle)}${matchedVehicle.link ? ' · ' + matchedVehicle.link : ''}`
                    : `VEÍCULO DO LEAD NÃO ESTÁ MAIS NO ESTOQUE.\nUse APENAS UM destes (não repetir os já ofertados antes):\n${recentInventory.slice(0, 5).map(v => `- ${formatVehicle(v)}`).join('\n')}`;

                // V3: variar abordagem por tentativa
                const ABORDAGENS_POR_TENTATIVA: Record<number, string> = {
                    1: 'soft',         // 1ª: lembrete leve
                    2: 'agendar',      // 2ª: convite pra visita/test drive
                    3: 'closing',      // 3ª: última chance, escassez real
                };
                const novaAbordagem = ABORDAGENS_POR_TENTATIVA[attemptNumber] || 'closing';
                abordagem = novaAbordagem;

                const ABORDAGEM_INSTRUCTIONS: Record<string, string> = {
                    soft: 'Tom leve. Pergunte se ainda tem interesse. Sem pressão.',
                    agendar: 'Convide pra visita ou test drive. Proponha 2 horários.',
                    closing: 'Última chance. Mencione que outros estão olhando. Direto e curto.',
                };

                const sysPrompt = `Você gera mensagem de WhatsApp de reengajamento pra Manos Veículos (Rio do Sul/SC).

REGRAS INEGOCIÁVEIS:
1. PROIBIDO inventar marca, modelo, ano ou preço fora da lista fornecida. Use textualmente o que está na lista.
2. PROIBIDO repetir abordagem ou veículo já mencionado em mensagens anteriores deste lead.
3. PROIBIDO sugerir preço acima do que está na lista.
4. Português Brasil, sem emojis, máximo 220 caracteres.
5. Comece pelo primeiro nome. Termine com pergunta direta.

ABORDAGEM DESTA TENTATIVA (${attemptNumber}/3): ${novaAbordagem.toUpperCase()}
${ABORDAGEM_INSTRUCTIONS[novaAbordagem]}`;

                const previousBlock = previousMessages.length > 0
                    ? `\nMENSAGENS JÁ ENVIADAS A ESTE LEAD (NÃO REPITA):\n${previousMessages.map((m: string, i: number) => `${i + 1}. "${m.slice(0, 100)}"`).join('\n')}`
                    : '';

                const userPrompt = `Cliente: ${firstName}
Temperatura: ${lead.ai_classification || 'warm'}
Tentativa atual: ${attemptNumber} de 3
Interesse: ${lead.vehicle_interest || 'não informado'}

${inventoryBlock}
${previousBlock}

Gere a mensagem usando a abordagem ${novaAbordagem}. JSON: { "mensagem": "..." }`;

                const res = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: sysPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.55,                 // V3: mais variedade entre tentativas
                    max_tokens: 150,
                });

                const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
                msg = (parsed.mensagem || '').trim();
                mode = matchedVehicle ? 'matched' : 'similar';

                // V3: bloqueio extra de similaridade — se LLM repetir frase, força fallback
                const tooSimilar = previousMessages.some((pm: string) => {
                    const a = pm.toLowerCase().slice(0, 60);
                    const b = msg.toLowerCase().slice(0, 60);
                    return a && b && (a === b);
                });
                if (tooSimilar || msg.length < 20) {
                    msg = `${firstName}, ainda posso te ajudar com o ${lead.vehicle_interest || 'carro que você procurava'}? Tenho condição nova hoje.`;
                    mode = 'generic_safe';
                }
            }

            const priority = ['fechamento', 'negotiation', 'proposed'].includes(lead.status) ? 'high' : 'medium';
            generated++;

            // Tenta enviar de fato ao cliente
            let sendResult: { ok: boolean; provider: string; error?: string } = { ok: false, provider: 'none' };
            if (lead.phone && isSenderConfigured()) {
                sendResult = await sendWhatsApp({
                    toPhone: lead.phone,
                    message: msg,
                    kind: 'ai_followup',
                    leadId: lead.id,
                });
                if (sendResult.ok) sent++;
                else failed++;
            }

            await admin.from('follow_ups').insert({
                lead_id: lead.id,
                user_id: lead.assigned_consultant_id || 'system',
                scheduled_at: new Date().toISOString(),
                type: 'ai_auto',
                note: msg,
                priority,
                status: sendResult.ok ? 'sent' : 'pending',
            });

            // Audit trail (best-effort) — registra modo da geração pra debug
            void admin.from('interactions_manos_crm').insert({
                lead_id: lead.id,
                notes: sendResult.ok
                    ? `[IA AUTO ${mode.toUpperCase()} via ${sendResult.provider}] "${msg}"`
                    : `[IA AUTO ${mode.toUpperCase()} sem envio: ${sendResult.error || 'sem provider'}] "${msg}"`,
                new_status: lead.status,
                type: 'ai_followup',
                created_at: new Date().toISOString(),
            }).then(null, () => {});

            // V3: GRAVA EM historico_followup pro dashboard do vendedor
            if (sendResult.ok) {
                await admin.from('historico_followup').insert({
                    lead_id: String(lead.id),
                    lead_table: 'leads_manos_crm',
                    attempt_number: attemptNumber,
                    mensagem_enviada: msg,
                    veiculo_ofertado: veiculoOfertado,
                    preco_real_estoque: precoReal,
                    abordagem,
                    instance_used: process.env.EVOLUTION_FOLLOWUP_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'default',
                }).then(null, () => {});
            }

            // V3: incrementa follow_up_count + se atingiu 3, marca lead como "frio"
            if (sendResult.ok) {
                const newCount = attemptNumber;
                const isLastAttempt = newCount >= 3;
                await admin.from('leads_manos_crm')
                    .update({
                        updated_at: new Date().toISOString(),
                        follow_up_count: newCount,
                        ...(isLastAttempt ? { status: 'frio' } : {}),
                    })
                    .eq('id', lead.id);

                if (isLastAttempt) {
                    log.push(`❄️ ${lead.name} marcado como FRIO (3ª tentativa sem resposta)`);
                }
            }

            // Atualiza lead pra evitar reenvio em loop (legado)
            if (sendResult.ok) {

                // Bolha 'outbound' no chat — vendedor vê em tempo real
                await admin.from('whatsapp_messages').insert({
                    lead_id: lead.id,
                    direction: 'outbound',
                    message_text: msg,
                    message_id: `ai_followup_${Date.now()}`,
                }).then(null, () => {});
            }

            log.push(`${sendResult.ok ? '📤' : '📝'} ${lead.name} (${lead.status}) → "${msg.slice(0, 60)}..."`);
        } catch (e: any) {
            failed++;
            log.push(`❌ ${lead.name} → ${e?.message}`);
        }
    }

    return { success: true, generated, sent, skipped, failed, log };
}
