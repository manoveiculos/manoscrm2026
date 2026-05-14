import { OpenAI } from 'openai';
import { createClient } from '@/lib/supabase/admin';
import { sendWhatsApp, isSenderConfigured } from './whatsappSender';
import { matchInventoryForInterest, formatInventoryLine, MatchedItem } from './inventoryMatcher';
import { findMatch as findAltimusMatch, getRecentForPrompt as getAltimusRecent, formatVehicle as formatAltimus } from './altimusInventory';

/**
 * AI SDR — primeiro contato automático com o lead em <60s.
 *
 * Único objetivo: o cliente NÃO ficar esperando.
 * Mensagem curta, humana, qualificadora. Não tenta vender — só engaja.
 *
 * Usado por: webhook/facebook-leads (após criar lead no leads_compra).
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface FirstContactInput {
    leadId: string;
    leadName?: string | null;
    leadPhone: string;
    vehicleInterest?: string | null;
    source?: string | null;
    consultantName?: string | null;
    /** 'compra' = lead que quer VENDER carro pra nós; 'venda' = lead querendo COMPRAR. */
    flow: 'compra' | 'venda';
    /** Lead foi arquivado pelo vendedor e está sendo reengajado pela IA. */
    from_archive?: boolean;
    /** V3: Lead em processo de reversão (perdido -> retomado). */
    isReversal?: boolean;
    /** V3: Contexto do porquê o lead foi perdido/arquivado. */
    diagnostico?: string | null;
    /** V3: Status atual do lead no banco. */
    currentStatus?: string | null;
    /** UUID do consultor responsável (usado pra cobrar antes de IA enviar sem contexto). */
    assigned_consultant_id?: string | null;
}

export interface FirstContactResult {
    sent: boolean;
    message: string;
    provider: string;
    error?: string;
}

function firstName(name?: string | null): string {
    if (!name) return '';
    const trimmed = name.trim().split(/\s+/)[0];
    if (!trimmed) return '';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Mensagem qualificadora — usada quando NÃO sabemos o que o cliente quer.
 * Nunca menciona carro específico. Pergunta direta pra abrir conversa.
 */
function qualifyingMessage(input: FirstContactInput): string {
    const cons = firstName(input.consultantName) || 'time da Manos';
    const cli = firstName(input.leadName);
    const greet = cli ? `Olá ${cli}!` : 'Olá!';
    if (input.flow === 'compra') {
        return `${greet} Aqui é ${cons} da Manos Veículos. Recebi seu contato sobre vender seu carro. Pode me dizer qual carro é (modelo e ano) pra eu te passar uma avaliação?`;
    }
    return `${greet} Aqui é ${cons} da Manos Veículos. Vi que você entrou em contato. Qual carro você está procurando hoje? (modelo, ano, ou faixa de preço)`;
}

/**
 * Mensagem quando cliente disse o que quer mas não temos no estoque.
 * Honesto: avisa que não tem aquele exato e abre pra alternativas.
 */
function noMatchMessage(input: FirstContactInput): string {
    const cons = firstName(input.consultantName) || 'time da Manos';
    const cli = firstName(input.leadName);
    const greet = cli ? `Olá ${cli}!` : 'Olá!';
    const veh = input.vehicleInterest || 'esse modelo';
    return `${greet} Aqui é ${cons} da Manos Veículos. Vi seu interesse em ${veh}. Não tenho exatamente esse no estoque agora, mas posso buscar algo parecido — qual o orçamento e qual ano você considera?`;
}

/**
 * Padrões de "interesse lixo" que o n8n / formulário gravam no campo
 * vehicleInterest mas NÃO são veículo real. Tratamos como null pra cair
 * direto na mensagem qualificadora ("qual carro você procura?").
 *
 * Regra: se NÃO contém marca/modelo de carro real, é lixo.
 */
const INTEREST_GARBAGE_PATTERNS = [
    /^lead\s+(google|whatsapp|facebook|meta|instagram)/i,
    /^analisar\s+perfil/i,
    /^n[aã]o\s+especificad/i,
    /^lead\s+(novo|sem)/i,
    /^sem\s+(interesse|info|especifica)/i,
    /^teste/i,
    /^entrada\s+manual/i,
    /^contato\s+(novo|inicial)/i,
];

function normalizeInterest(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.length < 2) return null;
    for (const pattern of INTEREST_GARBAGE_PATTERNS) {
        if (pattern.test(trimmed)) return null;
    }
    return trimmed;
}

/**
 * Lê últimas mensagens da conversa do lead (whatsapp_messages).
 * IA SDR usa pra NUNCA falar offtopic se cliente já disse algo.
 * Ex: cliente já mandou "tem o Corolla 2020?" — IA tem que responder
 * SOBRE o Corolla, não mandar "qual carro você procura?".
 *
 * Retorna texto pronto pra injetar no prompt OU '' se sem histórico.
 */
async function getConversationContext(leadId: string): Promise<string> {
    try {
        const admin = createClient();
        const { data: msgs } = await admin
            .from('whatsapp_messages')
            .select('direction, message_text, created_at')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(6);

        if (!msgs || msgs.length === 0) return '';

        const ordered = [...msgs].reverse();
        const lines = ordered
            .map(m => {
                const who = m.direction === 'inbound' ? 'CLIENTE' : 'NÓS';
                const text = (m.message_text || '').slice(0, 200).replace(/\s+/g, ' ').trim();
                if (!text) return null;
                return `${who}: ${text}`;
            })
            .filter(Boolean)
            .join('\n');

        if (!lines) return '';

        return `\n\nHISTÓRICO DA CONVERSA (mais recentes primeiro embaixo):\n${lines}\n\nRESPONDA O QUE O CLIENTE PEDIU. Não ignore o que ele já disse. Se ele já mencionou modelo/ano/preço, use essa info — nunca pergunte de novo.`;
    } catch {
        return '';
    }
}

async function generateMessage(input: FirstContactInput): Promise<string> {
    // Normaliza interest: tags internas do n8n viram null pra cair em qualifying.
    const cleanInterest = normalizeInterest(input.vehicleInterest);
    const normalized: FirstContactInput = { ...input, vehicleInterest: cleanInterest };

    // Lê histórico ANTES de decidir caminho — se cliente já falou algo,
    // priorizamos contextualizar em vez de mandar mensagem genérica.
    const history = await getConversationContext(input.leadId);
    const hasHistory = history.length > 0;

    // CAMINHO 1 — Cliente NÃO disse o que quer E não há histórico de conversa.
    // NUNCA empurrar carro aleatório. Sempre qualificar primeiro.
    if (!cleanInterest && !hasHistory) {
        return qualifyingMessage(normalized);
    }
    // Substitui input pelo normalizado nos próximos caminhos.
    input = normalized;

    // CAMINHO 2 — flow=compra: cliente vai vender, não há "estoque" relevante.
    if (input.flow === 'compra') {
        // Se há histórico, ainda passa pelo GPT pra responder no contexto.
        if (hasHistory) {
            return await generateGptMessage(input, history, []);
        }
        const cons = firstName(input.consultantName) || 'time da Manos';
        const cli = firstName(input.leadName);
        const greet = cli ? `Olá ${cli}!` : 'Olá!';
        return `${greet} Aqui é ${cons} da Manos Veículos. Recebi seu interesse em vender o ${input.vehicleInterest}. Posso te chamar agora pra avaliar?`;
    }

    // CAMINHO 3 — flow=venda. Busca estoque e injeta histórico.
    let altimusMatched = null;
    if (cleanInterest) {
        altimusMatched = await findAltimusMatch(cleanInterest).catch(() => null);
    }

    // 3a — Sem estoque match: se há histórico, ainda passa pelo GPT pra ler o que cliente disse.
    if (!altimusMatched) {
        const localMatches = cleanInterest
            ? await matchInventoryForInterest(cleanInterest, { limit: 1 }).catch(() => [])
            : [];

        if (localMatches.length === 0) {
            // Se há histórico mas sem estoque, ainda manda GPT só pra reagir ao histórico.
            if (hasHistory) {
                return await generateGptMessage(input, history, []);
            }
            return noMatchMessage(input);
        }
        return await generateGptMessage(input, history, localMatches);
    }

    // 3b — Match no Altimus: combina histórico + bloco de estoque travado.
    const altimusBlock = `${history}\n\nVEÍCULO REAL DISPONÍVEL AGORA NO ESTOQUE (use ESSE — é o ÚNICO permitido mencionar):\n- ${formatAltimus(altimusMatched)}${altimusMatched.link ? ' · ' + altimusMatched.link : ''}`;
    return await generateGptMessage(input, altimusBlock, []);
}

/**
 * Chamada GPT travada: só pode mencionar veículos do bloco de estoque.
 * Retorna fallback se GPT alucinar/falhar.
 */
async function generateGptMessage(
    input: FirstContactInput,
    altimusBlock: string,
    matches: MatchedItem[]
): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        return fallbackWithMatch(input, matches);
    }

    try {
        const cons = firstName(input.consultantName) || 'consultor da Manos';
        const cli = firstName(input.leadName) || '';
        const veh = input.vehicleInterest || '';

        const inventoryBlock = altimusBlock
            || (matches.length > 0
                ? `\nESTOQUE DISPONÍVEL agora que bate com o interesse (use UM se fizer sentido):\n${matches.map(m => `- ${formatInventoryLine(m)}`).join('\n')}`
                : '');

        const isRev = input.isReversal || input.from_archive;
        const diag = input.diagnostico ? `\nDiagnóstico do atendimento anterior: ${input.diagnostico}` : '';

        const sys = isRev
            ? `Você é o Agente de Reversão da Manos Veículos. O cliente parou de responder ou foi arquivado.
Seu objetivo é reengajar o cliente de forma empática e leve, sem pressão.
Regras:
- 1 ou 2 frases curtas, máximo 240 caracteres. Tom humano e direto.
- Se houver diagnóstico, use-o para ser pertinente (ex: se achou caro, sugira ver outras opções).
- PROIBIDO prometer descontos ou ser invasivo.
- Termine com uma pergunta aberta e gentil.`
            : `Você escreve a primeira mensagem de WhatsApp de um consultor pra um lead que acabou de chegar.
Regras inegociáveis:
- 1 ou 2 frases curtas, máximo 240 caracteres
- Português do Brasil, tom humano e direto, ZERO emojis ou jargão de marketing
- Mencione UM veículo concreto APENAS se estiver listado no bloco de estoque (modelo + ano)
- PROIBIDO inventar marca, modelo, ano ou preço fora do bloco de estoque. Se o bloco estiver vazio, NÃO mencione nenhum veículo.
- Não promete desconto
- Termina com UMA pergunta direta (ex: "Quer que eu te mande mais detalhes?", "Posso te chamar agora?")
- Sem "tudo bem?". Sem "espero que esteja bem"`;

        const user = `Consultor: ${cons}
Cliente: ${cli || 'não informado'}
Origem: ${input.source || 'não informada'}
Interesse: ${veh}${diag}
Loja: Manos Veículos (Rio do Sul/SC)${inventoryBlock}

Gere apenas o texto final da mensagem, sem aspas.`;

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user },
            ],
            temperature: isRev ? 0.7 : 0.4,
            max_tokens: 200,
        }, { timeout: 8000 });

        const out = (res.choices[0]?.message?.content || '').trim();
        if (!out || out.length < 20) return fallbackWithMatch(input, matches);
        return out.replace(/^["']|["']$/g, '').slice(0, 300);
    } catch {
        return fallbackWithMatch(input, matches);
    }
}

/**
 * Fallback usado quando OpenAI não responde / falha.
 * Sempre conservador: ou menciona o match real ou abre conversa qualificadora.
 */
function fallbackWithMatch(input: FirstContactInput, matches: MatchedItem[]): string {
    const cons = firstName(input.consultantName) || 'time da Manos';
    const cli = firstName(input.leadName);
    const greet = cli ? `Olá ${cli}!` : 'Olá!';
    const top = matches[0];
    if (top) {
        const line = formatInventoryLine(top);
        return `${greet} Aqui é ${cons} da Manos Veículos. Tenho um ${line} disponível agora. Quer que eu te mande mais detalhes?`.slice(0, 280);
    }
    return qualifyingMessage(input);
}

/**
 * Gera e envia a primeira mensagem ao lead.
 * - Idempotente: se `first_contact_at` já preenchido na tabela do lead, não reenvia.
 * - Marca `first_contact_at` e `first_contact_channel='ai_sdr'` em sucesso.
 */
export async function sendFirstContact(input: FirstContactInput, table: 'leads_compra' | 'leads_manos_crm' | 'leads_master' | 'leads_distribuicao_crm_26'): Promise<FirstContactResult> {
    const admin = createClient();

    // Idempotência e Bloqueio de Status V3
    try {
        const { data } = await admin
            .from(table)
            .select('first_contact_at, status, archived_at, diagnostico_atendimento')
            .eq('id', input.leadId)
            .maybeSingle();

        if (data?.first_contact_at && !input.isReversal) {
            return { sent: false, message: '', provider: 'skipped', error: 'already_contacted' };
        }

        const status = (data?.status || '').toLowerCase();
        const isArchived = !!data?.archived_at;
        const diagnostico = data?.diagnostico_atendimento || input.diagnostico || '';

        // 1. Bloqueio de Leads Novos (IA SDR não faz atendimento inicial na V3)
        if (['novo', 'received', 'received_triagem'].includes(status)) {
            return { sent: false, message: '', provider: 'none', error: 'ai_prohibited_initial_contact' };
        }

        // 2. Bloqueio de Arquivados
        if (isArchived || ['arquivado', 'arquivados'].includes(status)) {
            return { sent: false, message: '', provider: 'none', error: 'ai_prohibited_archived' };
        }

        // 3. Foco em PERDIDOS (V3 Reversão)
        // Se não for reversão e não estiver perdido, pula.
        if (!['perdido', 'lost', 'lost_by_inactivity'].includes(status) && !input.isReversal) {
            return { sent: false, message: '', provider: 'none', error: 'ai_focus_reversal_only' };
        }

        // 4. Filtro de Qualidade Financeira (Rigoroso V3)
        const creditKeywords = ['cpf ruim', 'sem margem', 'score baixo', 'reprovado', 'restrição', 'financeiro'];
        const hasCreditIssue = creditKeywords.some(k => diagnostico.toLowerCase().includes(k));
        if (hasCreditIssue) {
            return { sent: false, message: '', provider: 'none', error: 'credit_issue_detected' };
        }
    } catch {}

    // 1. Check Global Settings
    const { data: settings } = await admin
        .from('system_settings')
        .select('*');
    
    const globalPause = settings?.find(s => s.id === 'global')?.ai_paused ?? false;
    const aiConfig = settings?.find(s => s.id === 'ai_config')?.value ?? {};

    if (globalPause) {
        return { sent: false, message: '', provider: 'none', error: 'ai_paused_globally' };
    }

    // 2. Horário de funcionamento check
    const nowObj = new Date();
    const currentStr = nowObj.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const startHour = aiConfig.start_hour || '08:00';
    const endHour = aiConfig.end_hour || '20:00';

    if (currentStr < startHour || currentStr > endHour) {
        return { sent: false, message: '', provider: 'none', error: 'outside_operating_hours' };
    }

    if (!isSenderConfigured()) {
        return { sent: false, message: '', provider: 'none', error: 'no_provider_configured' };
    }

    // 🔁 REENGAJAMENTO PÓS-ARQUIVO: lead arquivado pelo vendedor.
    // Antes de mandar msg pro cliente, IA verifica se há contexto suficiente.
    // Sem histórico de conversa → NÃO envia (seria msg fria/inadequada).
    // Em vez disso, cobra o vendedor responsável pra decidir.
    if (input.from_archive) {
        const { count: msgCount } = await admin
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('lead_id', input.leadId);

        const hasContext = (msgCount || 0) >= 2; // pelo menos 1 nossa + 1 dele (ou ida+volta)

        if (!hasContext && input.assigned_consultant_id) {
            // Cobra vendedor antes de IA mandar nada
            try {
                const { notifyConsultant } = await import('./consultantNotifier');
                await notifyConsultant({
                    consultantId: input.assigned_consultant_id,
                    leadId: input.leadId,
                    level: 1,
                    title: `🤔 Lead ${input.leadName || 'arquivado'} sem contexto`,
                    message: `Você arquivou esse lead mas nunca houve conversa. Quer reativar manualmente (responder direto) ou descartar de vez? Se ficar parado, IA não vai mandar msg às cegas.`,
                });
            } catch (e) {
                console.warn('[aiSdr] notifyConsultant falhou:', e);
            }
            return { sent: false, message: '', provider: 'none', error: 'no_context_pinged_vendor' };
        }
    }

    const message = await generateMessage(input);
    const result = await sendWhatsApp({
        toPhone: input.leadPhone,
        message,
        kind: 'ai_first_contact',
        leadId: input.leadId,
    });

    if (result.ok) {
        try {
            // Atualiza first_contact_at + faz BOIA (updated_at/atualizado_em) pra
            // o lead subir pra "Urgente" no /inbox via Realtime
            const now = new Date().toISOString();
            const updates: Record<string, any> = {
                first_contact_at: now,
                first_contact_channel: 'ai_sdr',
            };
            if (table === 'leads_distribuicao_crm_26') {
                updates.atualizado_em = now;
            } else {
                updates.updated_at = now;
            }

            if (input.isReversal || input.from_archive) {
                updates.flagged_reversao = true;
            }

            await admin.from(table).update(updates).eq('id', input.leadId);

            // Insere a mensagem enviada como bolha 'outbound' no chat do /lead/[id]
            // Pra vendedor ver em tempo real o que a IA mandou pro cliente.
            await admin.from('whatsapp_messages').insert({
                lead_id: input.leadId,
                direction: 'outbound',
                message_text: message,
                message_id: `ai_sdr_${Date.now()}`,
            }).then(null, () => {}); // best-effort, não falha o fluxo

            // Audit trail na timeline
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(input.leadId);
            await admin.from('interactions_manos_crm').insert({
                [isUUID ? 'lead_id' : 'lead_id_v1']: input.leadId,
                type: 'ai_first_contact',
                notes: `🤖 IA SDR enviou primeira mensagem:\n${message}`,
                user_name: 'IA SDR',
                created_at: now,
            });
        } catch {}
    }

    return {
        sent: result.ok,
        message,
        provider: result.provider,
        error: result.error,
    };
}

export interface FirstContactPreview {
    message: string;
    matches: Array<{ marca: string | null; modelo: string | null; ano: number | null; preco: number | null; line: string }>;
    usedLLM: boolean;
    fallback: boolean;
    chars: number;
    senderConfigured: boolean;
}

/**
 * Gera (sem enviar, sem gravar) a mensagem que sairia para um lead hipotético.
 * Usado pelo /admin/sdr-bench pra iterar prompts sem queimar lead real.
 */
export async function previewFirstContact(input: FirstContactInput): Promise<FirstContactPreview> {
    let matches: MatchedItem[] = [];
    if (input.flow === 'venda' && input.vehicleInterest) {
        matches = await matchInventoryForInterest(input.vehicleInterest, { limit: 3 }).catch(() => []);
    }

    const hasLLM = !!process.env.OPENAI_API_KEY;
    let message = '';
    let fallback = false;

    if (hasLLM) {
        try {
            message = await generateMessage(input);
            // generateMessage cai pro fallback internamente em caso de erro;
            // detectar isso requer comparar — mais simples: regenerar fallback e comparar
            const fb = fallbackWithMatch(input, matches);
            fallback = message === fb;
        } catch {
            message = fallbackWithMatch(input, matches);
            fallback = true;
        }
    } else {
        message = fallbackWithMatch(input, matches);
        fallback = true;
    }

    return {
        message,
        matches: matches.map(m => ({
            marca: m.marca, modelo: m.modelo, ano: m.ano, preco: m.preco,
            line: formatInventoryLine(m),
        })),
        usedLLM: hasLLM && !fallback,
        fallback,
        chars: message.length,
        senderConfigured: isSenderConfigured(),
    };
}

/**
 * Enfileira o primeiro contato pra ser processado pelo cron /api/cron/ai-sdr-runner.
 *
 * Anti-spam: novo job é agendado pra MAX(scheduled_at pendente) + 2-5min random.
 * Garante que mensagens nunca saem em rajada (WhatsApp bane por padrão de bot).
 * Janela 2-5min = 12-30 msgs/hora máximo por instância = humano.
 *
 * Por que fila e não setTimeout? Em Next.js o route handler encerra quando
 * retorna a Response — qualquer timer agendado vira fantasma. A fila persiste
 * em ai_sdr_queue e o runner (1min) drena. Sobrevive a deploy/restart.
 */
export async function scheduleFirstContact(
    input: FirstContactInput,
    table: 'leads_compra' | 'leads_manos_crm' | 'leads_master' | 'leads_distribuicao_crm_26',
    delayMs = 30_000
): Promise<void> {
    try {
        const admin = createClient();

        // Anti-ban: pega o último scheduled_at pendente. Próximo envio sai 2-5min depois.
        const { data: lastPending } = await admin
            .from('ai_sdr_queue')
            .select('scheduled_at')
            .is('processed_at', null)
            .order('scheduled_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const baseTime = Date.now() + delayMs;
        const lastPendingTime = lastPending?.scheduled_at ? new Date(lastPending.scheduled_at).getTime() : 0;
        // Janela 2-5min random pra parecer humano
        const jitter = 120_000 + Math.floor(Math.random() * 180_000);
        const finalTime = Math.max(baseTime, lastPendingTime + jitter);
        const scheduledAt = new Date(finalTime).toISOString();

        const { error } = await admin.from('ai_sdr_queue').insert({
            lead_id: input.leadId,
            lead_table: table,
            payload: input as any,
            scheduled_at: scheduledAt,
        });
        if (error && !String(error.message || '').includes('duplicate key')) {
            console.error('[aiSdr] enqueue falhou:', error.message);
        }
    } catch (e: any) {
        console.error('[aiSdr] enqueue exception:', e?.message);
    }
}
