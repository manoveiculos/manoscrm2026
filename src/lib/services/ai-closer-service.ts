import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { getAIContext } from '@/lib/services/aiFeedbackService';
import { generateLeadStrategy, LeadAnalysisPayload } from '@/lib/services/leadStrategyService';
import { getTableForLead, stripPrefix } from '@/lib/services/leadRouter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ScriptOption {
    tipo: 'cobrança' | 'agendamento' | 'contorno';
    label: string;
    mensagem: string;
}

export interface AnalysisResult {
    success: boolean;
    diagnostico: string;
    orientacao: string;
    scriptWhatsApp: string;
    scriptOptions: ScriptOption[];
    urgencyScore: number;
    temperature: string;
    modelUsed: string;
    detectedName?: string | null;
}

export async function runEliteCloser(leadId: string, messages: any[] = [], consultantName?: string): Promise<AnalysisResult> {
    // Usa o router oficial para determinar tabela e ID limpo
    const primaryTable = getTableForLead(leadId);
    const cleanId = stripPrefix(leadId) || leadId;

    // Tenta a tabela primária; se não encontrar, percorre as demais
    const ALL_TABLES = ['leads_master', 'leads_manos_crm', 'leads_distribuicao_crm_26'];
    const tablePriority = [primaryTable, ...ALL_TABLES.filter(t => t !== primaryTable)];

    let lead: any = null;
    let usedTable = primaryTable;
    for (const t of tablePriority) {
        const { data } = await supabaseAdmin.from(t).select('*').eq('id', cleanId).maybeSingle();
        if (data) { lead = data; usedTable = t; break; }
    }

    const { data: inventory } = await supabaseAdmin.from('inventory_manos_crm')
        .select('id, marca, modelo, ano, preco, km, cambio, combustivel, status')
        .not('status', 'eq', 'vendido')
        .limit(50);

    if (!lead) throw new Error(`Lead não encontrado (ID: ${cleanId}, testado em: ${tablePriority.join(', ')})`);

    // ── DETECÇÃO AUTOMÁTICA DE NOME ─────────────────────────────────────────────
    const GENERIC_NAMES = /^(lead\s*whatsapp|lead\s*wb|lead|cliente|novo lead|whatsapp lead|sem nome|unknown|#|[-_\d]+)$/i;
    const currentName: string = lead.nome || lead.name || '';
    let detectedName: string | null = null;
    if (GENERIC_NAMES.test(currentName.trim())) {
        try {
            // Monta amostra de conversa: usa mensagens passadas OU busca de fontes V1
            let convSample = messages.slice(0, 15).map((m: any) => {
                const dir = m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR';
                return `${dir}: ${m.content || m.message_text || ''}`;
            }).filter((l: string) => l.length > 8);

            // Se sem mensagens do frontend, tenta buscar via telefone em dados_cliente / concessionaria_mensagens (V1)
            if (convSample.length === 0 && lead.phone) {
                const phoneSuffix = (lead.phone || '').replace(/\D/g, '').slice(-8);
                if (phoneSuffix.length >= 8) {
                    let sessionId: string | null = null;
                    let directName: string | null = null;

                    // Primeiro tenta dados_cliente — pode ter nome diretamente
                    const { data: cli } = await supabaseAdmin
                        .from('dados_cliente')
                        .select('sessionid, nome, name')
                        .ilike('telefone', `%${phoneSuffix}%`)
                        .limit(1);
                    if (cli?.[0]) {
                        sessionId = cli[0].sessionid || null;
                        const rawName = cli[0].nome || cli[0].name || '';
                        if (rawName && rawName.length >= 2 && !GENERIC_NAMES.test(rawName.trim())) {
                            directName = rawName.trim().split(/\s+/)[0]; // Só primeiro nome
                        }
                    }

                    // Fallback: tracking_leads pelo whatsapp
                    if (!sessionId && !directName) {
                        const { data: trackers } = await supabaseAdmin
                            .from('tracking_leads')
                            .select('details, nome, name')
                            .ilike('whatsapp', `%${phoneSuffix}%`)
                            .limit(1);
                        if (trackers?.[0]) {
                            sessionId = trackers[0].details ? (trackers[0].details as any).session_id : null;
                            const tName = trackers[0].nome || trackers[0].name || '';
                            if (tName && tName.length >= 2 && !GENERIC_NAMES.test(tName.trim())) {
                                directName = tName.trim().split(/\s+/)[0];
                            }
                        }
                    }

                    // Se achou nome direto, usa sem precisar analisar conversa
                    if (directName) {
                        const capitalized = directName.charAt(0).toUpperCase() + directName.slice(1).toLowerCase();
                        await supabaseAdmin.from(usedTable).update({ name: capitalized, nome: capitalized }).eq('id', cleanId);
                        lead.name = capitalized;
                        lead.nome = capitalized;
                        detectedName = capitalized;
                    } else if (sessionId) {
                        // Busca mensagens para GPT detectar o nome
                        const { data: msgs } = await supabaseAdmin
                            .from('concessionaria_mensagens')
                            .select('message, remetente')
                            .eq('session_id', sessionId)
                            .limit(20);
                        if (msgs) {
                            convSample = msgs.map((m: any) => {
                                const text = m.message?.content || m.message?.text || m.message?.body || (typeof m.message === 'string' ? m.message : '') || '';
                                const dir = (m.remetente || '').toLowerCase().includes('cliente') ? 'CLIENTE' : 'VENDEDOR';
                                return text.trim() ? `${dir}: ${text.trim()}` : '';
                            }).filter((l: string) => l.length > 8);
                        }
                    }
                }
            }

            // Também tenta interactions_manos_crm como fallback
            if (convSample.length === 0) {
                const isUUIDCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
                const { data: interactions } = await supabaseAdmin
                    .from('interactions_manos_crm')
                    .select('notes, type')
                    .eq(isUUIDCheck ? 'lead_id' : 'lead_id_v1', cleanId)
                    .in('type', ['whatsapp_in', 'whatsapp_out', 'call', 'note'])
                    .order('created_at', { ascending: true })
                    .limit(15);
                if (interactions) {
                    convSample = interactions.map((i: any) => i.notes || '').filter((n: string) => n.length > 5);
                }
            }

            if (convSample.length > 0) {
                const nameRes = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: `Analise esta conversa de WhatsApp e responda APENAS com o primeiro nome do CLIENTE (pessoa que quer comprar).
Se não conseguir identificar com certeza, responda exatamente: null

Conversa:
${convSample.slice(0, 15).join('\n')}

Responda SOMENTE o primeiro nome (ex: "Carlos") ou null:`
                    }],
                    max_tokens: 20,
                    temperature: 0,
                });

                const gptDetectedName = nameRes.choices[0]?.message?.content?.trim().replace(/['".,!?\s]/g, '') || '';
                const isValidName = gptDetectedName &&
                    gptDetectedName.toLowerCase() !== 'null' &&
                    /^[a-záéíóúàâêôãõçA-ZÁÉÍÓÚÀÂÊÔÃÕÇ]{2,30}$/.test(gptDetectedName);

                if (isValidName) {
                    const capitalized = gptDetectedName.charAt(0).toUpperCase() + gptDetectedName.slice(1).toLowerCase();
                    await supabaseAdmin.from(usedTable).update({ name: capitalized, nome: capitalized }).eq('id', cleanId);
                    lead.name = capitalized;
                    lead.nome = capitalized;
                    detectedName = capitalized;
                }
            }
        } catch (e) {
            console.warn('[AI] Detecção de nome falhou:', e);
        }
    }
    // ────────────────────────────────────────────────────────────────────────────

    const consultor = consultantName || 'Consultor Especialista';
    const feedbackContext = await getAIContext(cleanId).catch(() => '');
    const leadScore = lead.ai_score || 0;
    const isHot = leadScore >= 50 || leadScore === 0;

    const hoursInactive = Math.round(
        (Date.now() - new Date(lead.updated_at || lead.created_at).getTime()) / 3_600_000
    );

    // MEMÓRIA DE AÇÕES — busca análises anteriores para NÃO repetir
    let memoriaAcoes = '';
    try {
        const isUUIDCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        const { data: prevAnalyses } = await supabaseAdmin
            .from('interactions_manos_crm')
            .select('notes, created_at')
            .eq(isUUIDCheck ? 'lead_id' : 'lead_id_v1', cleanId)
            .eq('type', 'ai_analysis')
            .order('created_at', { ascending: false })
            .limit(5);

        if (prevAnalyses && prevAnalyses.length > 0) {
            const acoes = prevAnalyses.map((a: any) => {
                const dateStr = new Date(a.created_at).toLocaleDateString('pt-BR');
                // Extrai apenas a linha de orientação de cada análise anterior
                const match = (a.notes || '').match(/→ ORIENTAÇÃO:\s*(.+)/);
                const ori = match?.[1]?.trim() || '';
                if (!ori) return null;
                return `[${dateStr}] ${ori.slice(0, 150)}`;
            }).filter(Boolean);

            if (acoes.length > 0) {
                memoriaAcoes = `\n\nHISTÓRICO DE AÇÕES JÁ RECOMENDADAS (NÃO REPITA — proponha abordagem DIFERENTE):\n${acoes.join('\n')}`;
            }
        }
    } catch { /* silencioso */ }

    let diagnostico = '';
    let orientacao = '';
    let scriptWhatsApp = '';
    let urgencyScore = 0;
    let temperature = 'morno';
    let modelUsed = 'gpt-4o-mini';

    // CAMINHO A: Claude (leads quentes com histórico)
    if (messages.length > 0 && isHot) {
        try {
            const payload: LeadAnalysisPayload = {
                lead_id: cleanId,
                lead_name: lead.nome || lead.name || 'Cliente',
                interesse: lead.interesse || lead.vehicle_interest || '',
                investimento: lead.valor_investimento || null,
                troca: lead.carro_troca || null,
                historico_whatsapp: messages.map((m: any) => ({
                    direction: m.direction as 'inbound' | 'outbound',
                    content: m.content || m.message_text || '',
                    created_at: m.created_at,
                })),
                notas_consultor: [feedbackContext, memoriaAcoes].filter(Boolean).join('\n\n') || '',
                ultimo_contato: lead.updated_at || null,
                estoque_disponivel: inventory || [],
                consultant_name: consultor,
                lead_status: lead.status || '',
                behavioral_profile: lead.behavioral_profile || null,
            };

            const claudeResult = await generateLeadStrategy(payload);
            diagnostico = claudeResult.analise_perfil;
            orientacao = claudeResult.proxima_acao_imediata;
            scriptWhatsApp = claudeResult.script_whatsapp;
            urgencyScore = Math.min(99, Math.max(1, claudeResult.probabilidade_fechamento || 50));
            temperature = urgencyScore >= 70 ? 'hot' : urgencyScore >= 40 ? 'warm' : 'cold';
            modelUsed = 'claude';
        } catch (e) {
            console.warn('[AI Service] Claude falhou, tentando GPT-4o:', e);
        }
    }

    // CAMINHO B: GPT-4o (Backup ou Frio)
    if (!diagnostico) {
        const inventorySummary = (inventory || [])
            .slice(0, 20)
            .map((i: any) => `- ${i.marca} ${i.modelo} ${i.ano} | R$ ${Number(i.preco).toLocaleString('pt-BR')} | ${i.km ? i.km + 'km' : 'km n/d'} | ${i.cambio || ''} ${i.combustivel || ''}`)
            .join('\n');

        // Contexto comportamental (behavioral_profile é JSONB)
        let behavioralCtx = '';
        if (lead.behavioral_profile) {
            try {
                const bp = typeof lead.behavioral_profile === 'string'
                    ? JSON.parse(lead.behavioral_profile)
                    : lead.behavioral_profile;
                if (bp && typeof bp === 'object') {
                    behavioralCtx = `
PERFIL COMPORTAMENTAL:
- Sentimento: ${bp.sentiment || 'neutro'}
- Urgência: ${bp.urgency || 'baixa'}
- Intenções detectadas: ${Array.isArray(bp.intentions) ? bp.intentions.slice(0,3).join(', ') : bp.intentions || 'não mapeado'}
- Probabilidade de fechamento (IA): ${bp.closing_probability || 0}%`;
                }
            } catch { /* behavioral_profile inválido — ignora */ }
        }

        // Buscar últimas interações quando sem mensagens WhatsApp
        let recentInteractions = '';
        if (messages.length === 0) {
            try {
                const { data: interactions } = await supabaseAdmin
                    .from('interactions_manos_crm')
                    .select('type, notes, created_at')
                    .eq('lead_id', cleanId)
                    .order('created_at', { ascending: false })
                    .limit(4);
                if (interactions && interactions.length > 0) {
                    recentInteractions = '\nÚLTIMAS INTERAÇÕES NO CRM:\n' + interactions.map((i: any) =>
                        `[${new Date(i.created_at).toLocaleDateString('pt-BR')}] ${i.type}: ${(i.notes || '').replace(/\[.*?\]\s*/g, '').slice(0, 150)}`
                    ).join('\n');
                }
            } catch { /* silencioso */ }
        }

        const chatText = messages.length > 0
            ? messages.slice(-30).map((m: any) =>
                `[${m.created_at ? new Date(m.created_at).toLocaleString('pt-BR') : 'Agora'}] ${m.direction === 'inbound' ? '👤 CLIENTE' : '🟢 VENDEDOR'}: ${m.content || m.message_text || ''}`
              ).join('\n')
            : 'Nenhuma mensagem WhatsApp sincronizada.';

        const isCompra = usedTable === 'leads_compra';
        const sistemaPromptText = isCompra
            ? 'Você é um Negociador de Compras de veículos especialista. Avalie agressivamente o lead. Faça-o trazer o carro pra loja. Responda APENAS com JSON válido.'
            : 'Você é um closer implacável de veículos. Analise friamente os dados e dê ordens cirúrgicas. Sem rodeios, sem passividade. Responda APENAS com JSON válido.';
        
        let promptBaseDesc = isCompra 
            ? 'Você é o Analista de Compras da Manos Veículos (Rio do Sul/SC). Seu objetivo é AVALIAR O VEÍCULO DO CLIENTE e gerar URGÊNCIA PARA ELE TRAZER O CARRO NA LOJA. Faça uma análise implacável deste lead e responda em JSON.'
            : 'Você é o Closer Elite da Manos Veículos (Rio do Sul/SC). Seu objetivo é FORÇAR O FECHAMENTO usando gatilhos mentais (Urgência e Escassez). Faça uma análise implacável deste lead e responda em JSON.';
            
        let originVehicleDesc = isCompra
            ? `- Veículo Ofertado: ${lead.veiculo_original || lead.modelo || 'não informado'}\n- Ano: ${lead.ano || 'não informado'}\n- Km: ${lead.km || 'não informado'}\n- Tabela FIPE esperada: ${lead.valor_fipe || 'não informado'}\n- Aceita abaixo da FIPE: ${lead.aceita_abaixo_fipe ? 'SIM' : 'NÃO'}`
            : `- Interesse: ${lead.interesse || lead.vehicle_interest || 'não informado'}\n- Investimento: ${lead.valor_investimento || 'não informado'}\n- Troca: ${lead.carro_troca || 'não informado'}`;

        let missionP2 = isCompra 
            ? '2. Dê uma ORDEM TÁTICA ESPECÍFICA para o avaliador (ações como pedir fotos, docs ou chamar na loja).'
            : '2. Dê uma ORDEM TÁTICA ESPECÍFICA para o consultor fechar HOJE (Ação incisiva e argumento de Cialdini)';

        const prompt = `${promptBaseDesc}

DADOS DO LEAD:
- Nome: ${lead.nome || lead.name}
${originVehicleDesc}
- Status atual: ${lead.status || 'não informado'}
- Origem: ${lead.origem || lead.source || 'não informado'}
- Score IA atual: ${lead.ai_score || 0}%
- Risco de abandono (churn): ${lead.churn_probability || 0}%
- Inativo há: ${hoursInactive}h
${behavioralCtx}

HISTÓRICO DE CONVERSA:
${chatText}
${recentInteractions}

ESTOQUE DISPONÍVEL (Caso haja troca com troco ou algo assim):
${inventorySummary || 'Nenhum veículo no estoque no momento.'}
${memoriaAcoes}

MISSÃO:
1. Diagnostique a situação REAL (quais dados faltam para a avaliação do carro? O cliente está quente para vender?)
${missionP2}
3. Escreva um script WhatsApp de 2 frases CURTAS, DIRETAS, abusando de gatilhos mentais para puxar o cliente para a loja.
4. Se ação anterior falhou, ESCALE.
5. Calcule score de 0-100 baseado na temperatura comportamental.

Retorne JSON: { "diagnostico": "texto preciso em 2-3 frases", "orientacao": "ação específica com horário/canal e gatilho", "script": "mensagem WhatsApp matadora", "score": 0-100 }`;

        const response = await openai.chat.completions.create({
            model: isHot ? 'gpt-4o' : 'gpt-4o-mini',
            messages: [
                { role: 'system', content: sistemaPromptText },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.25,
            max_tokens: 600,
        });

        const iaResult = JSON.parse(response.choices[0]?.message?.content || '{}');
        diagnostico = iaResult.diagnostico || '';
        orientacao = iaResult.orientacao || '';
        scriptWhatsApp = iaResult.script || '';
        urgencyScore = Math.min(99, Math.max(1, Number(iaResult.score) || 50));
        temperature = urgencyScore >= 70 ? 'hot' : urgencyScore >= 40 ? 'warm' : 'cold';
        modelUsed = isHot ? 'gpt-4o' : 'gpt-4o-mini';
    }

    // GERAR 3 OPÇÕES DE SCRIPT (cobrança, agendamento, contorno)
    const leadFirstName = (lead.nome || lead.name || 'Cliente').split(' ')[0];
    const vehicleInterest = lead.interesse || lead.vehicle_interest || 'veículo de interesse';
    let scriptOptions: ScriptOption[] = [];

    try {
        const isCompraSub = usedTable === 'leads_compra';
        const scriptRes = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [{
                role: 'system',
                content: isCompraSub 
                   ? 'Você é um Analista de Compras da Manos Veículos. Gere scripts de WhatsApp (2 frases curtas) para avaliação de carros e puxar cliente para agendamento presencial. JSON Válido apenas.'
                   : 'Você é um Closer agressivo da Manos Veículos. Gere scripts de WhatsApp curtos (2 frases), focados em gerar Micro-comprometimentos e usando Escassez e Urgência. Zero gentilezas tipo "tudo bem?". Retorne APENAS JSON válido.'
            }, {
                role: 'user',
                content: `Cliente: ${leadFirstName} | Veículo / Interesse: ${vehicleInterest} | Diagnóstico: ${diagnostico || 'Lead sem histórico'} | Score: ${urgencyScore}%

Gere 3 mensagens prontas para o consultor copiar e enviar agora. Cada uma com no máximo 2 frases. Comece sempre pelo primeiro nome.

JSON: {
  "cobranca": "mensagem para retomar contato sem soar desesperado",
  "agendamento": "mensagem para propor uma visita ou ligação específica",
  "contorno": "mensagem para contornar a principal objeção e criar urgência"
}`
            }],
            max_tokens: 300,
        }, { timeout: 12000 });

        const parsed = JSON.parse(scriptRes.choices[0]?.message?.content || '{}');
        scriptOptions = ([
            { tipo: 'cobrança' as const,    label: 'Retomar contato',  mensagem: String(parsed.cobranca   || '').slice(0, 200) },
            { tipo: 'agendamento' as const, label: 'Propor visita',     mensagem: String(parsed.agendamento || '').slice(0, 200) },
            { tipo: 'contorno' as const,    label: 'Contornar objeção', mensagem: String(parsed.contorno   || '').slice(0, 200) },
        ] as ScriptOption[]).filter(s => s.mensagem.length > 5);
    } catch {
        // Fallback: scripts genéricos baseados nos dados do lead
        scriptOptions = [
            { tipo: 'cobrança' as const,    label: 'Retomar contato',  mensagem: `${leadFirstName}, ainda tenho aquele ${vehicleInterest} reservado. Posso te mostrar as condições agora?` },
            { tipo: 'agendamento' as const, label: 'Propor visita',     mensagem: `${leadFirstName}, que tal vir amanhã dar uma olhada no ${vehicleInterest}? Tenho horário pela manhã.` },
            { tipo: 'contorno' as const,    label: 'Contornar objeção', mensagem: `${leadFirstName}, entendo a dúvida. Mas essa oportunidade no ${vehicleInterest} não vai durar — te ligo agora para explicar.` },
        ];
    }

    // PERSISTÊNCIA & ANTI-OVERLOAD
    let finalUrgency = urgencyScore;
    let finalTemperature = temperature;
    let churnProb = lead.churn_probability || 0;
    let oldStatus = lead.status || 'novo';
    let newStatus = oldStatus;
    let autopilotTriggered = false;
    let ghostTriggered = false;

    // Penalidade por Inatividade (Anti-Overload)
    if (hoursInactive > 48) {
        const penalty = Math.floor(hoursInactive / 24) * 5;
        finalUrgency = Math.max(1, finalUrgency - penalty);
        finalTemperature = finalUrgency >= 70 ? 'hot' : finalUrgency >= 40 ? 'warm' : 'cold';
        churnProb = Math.min(99, churnProb + penalty * 2);
    }

    // Marca como Abandonado se passar do limite de Churn
    if (churnProb > 85 && !['fechado', 'perdido', 'abandonado', 'ganho', 'vendido'].some(s => oldStatus.toLowerCase().includes(s))) {
        newStatus = 'perdido';
        ghostTriggered = true;
    }

    // Piloto Automático (Auto Pilot) de Movimentação Positiva
    if (finalUrgency >= 90 && !ghostTriggered) {
        if (usedTable === 'leads_compra' && oldStatus === 'novo') {
            newStatus = 'em_analise';
            autopilotTriggered = true;
        } else if (usedTable !== 'leads_compra' && ['novo', 'contato_iniciado'].includes(oldStatus)) {
            newStatus = 'proposta';
            autopilotTriggered = true;
        }
    }

    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const timelineNote = `[${timestamp}] 🤖 ANÁLISE ${modelUsed.toUpperCase()}:\n${diagnostico}\n\nORIENTAÇÃO: ${orientacao}`;

    const updateData: any = {
        [usedTable === 'leads_distribuicao_crm_26' ? 'resumo_consultor' : 'ai_reason']: `${diagnostico} | ORIENTAÇÃO: ${orientacao}`,
        [usedTable === 'leads_distribuicao_crm_26' ? 'resumo' : 'ai_summary']: timelineNote, // Fim do append infinito
        ai_score: finalUrgency,
        ai_classification: finalTemperature as any,
        churn_probability: churnProb,
        next_step: scriptWhatsApp,
        proxima_acao: scriptWhatsApp,
        last_scripts_json: scriptOptions,
        last_scripts_at: new Date().toISOString(),
        ai_last_run_at: new Date().toISOString(),
    };

    if (autopilotTriggered || ghostTriggered) {
        updateData.status = newStatus;
    }

    await supabaseAdmin.from(usedTable).update(updateData).eq('id', cleanId);

    // ── Registro Físico na Timeline (para a nova aba de Histórico) ──
    try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        
        // Se mudou de status devido ao Autopilot ou Ghost, gera um tracker customizado
        if (autopilotTriggered || ghostTriggered) {
            await supabaseAdmin.from('interactions_manos_crm').insert({
                [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
                type: 'ai_analysis',
                notes: `🤖 Sistema Autônomo:\nStatus movido de "${oldStatus}" para "${newStatus}" devido a ${autopilotTriggered ? 'alta intenção detectada (>90 score)' : 'esfriamento / risco de abandono (>85 churn)'}.`,
                user_name: 'IA Autopilot',
                created_at: new Date().toISOString(),
            });
        }

        await supabaseAdmin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
            type: 'ai_analysis',
            notes: timelineNote,
            user_name: 'IA Mentor',
            created_at: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[AI-Closer] Falha ao registrar interação na timeline:', err);
    }


    return {
        success: true,
        diagnostico,
        orientacao,
        scriptWhatsApp,
        scriptOptions,
        urgencyScore,
        detectedName,
        temperature,
        modelUsed
    };
}
