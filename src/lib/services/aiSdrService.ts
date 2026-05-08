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

async function generateMessage(input: FirstContactInput): Promise<string> {
    // CAMINHO 1 — Cliente NÃO disse o que quer.
    // NUNCA empurrar carro aleatório. Sempre qualificar primeiro.
    if (!input.vehicleInterest || input.vehicleInterest.trim().length < 2) {
        return qualifyingMessage(input);
    }

    // CAMINHO 2 — flow=compra: cliente vai vender, não há "estoque" relevante.
    if (input.flow === 'compra') {
        const cons = firstName(input.consultantName) || 'time da Manos';
        const cli = firstName(input.leadName);
        const greet = cli ? `Olá ${cli}!` : 'Olá!';
        return `${greet} Aqui é ${cons} da Manos Veículos. Recebi seu interesse em vender o ${input.vehicleInterest}. Posso te chamar agora pra avaliar?`;
    }

    // CAMINHO 3 — flow=venda + cliente disse o que quer: busca estoque REAL.
    const altimusMatched = await findAltimusMatch(input.vehicleInterest).catch(() => null);

    // 3a — Não temos o veículo no estoque: mensagem honesta abrindo pra alternativas.
    if (!altimusMatched) {
        // Tenta banco local como segunda chance antes de desistir
        const localMatches = await matchInventoryForInterest(input.vehicleInterest, { limit: 1 }).catch(() => []);
        if (localMatches.length === 0) {
            return noMatchMessage(input);
        }
        // Achou no banco local mas não no Altimus → ainda monta GPT com esse match
        return await generateGptMessage(input, '', localMatches);
    }

    // 3b — Match no Altimus: monta GPT com o veículo travado no prompt.
    const altimusBlock = `\nVEÍCULO REAL DISPONÍVEL AGORA NO ESTOQUE (use ESSE — é o ÚNICO permitido mencionar):\n- ${formatAltimus(altimusMatched)}${altimusMatched.link ? ' · ' + altimusMatched.link : ''}`;
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

        const sys = `Você escreve a primeira mensagem de WhatsApp de um consultor pra um lead que acabou de chegar.
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
Origem do lead: ${input.source || 'não informada'}
Interesse declarado pelo cliente: ${veh}
Loja: Manos Veículos (Rio do Sul/SC)${inventoryBlock}

Gere apenas o texto final da mensagem, sem aspas.`;

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user },
            ],
            temperature: 0.4,
            max_tokens: 140,
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

    // Idempotência: checa se já houve primeiro contato
    try {
        const { data } = await admin
            .from(table)
            .select('first_contact_at')
            .eq('id', input.leadId)
            .maybeSingle();
        if (data?.first_contact_at) {
            return { sent: false, message: '', provider: 'skipped', error: 'already_contacted' };
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
 * Por que fila e não setTimeout? Em Next.js o route handler encerra o processo
 * quando retorna a Response — qualquer timer agendado vira fantasma. A fila
 * persiste em ai_sdr_queue e o runner (1min) drena. Sobrevive a deploy/restart.
 */
export async function scheduleFirstContact(
    input: FirstContactInput,
    table: 'leads_compra' | 'leads_manos_crm' | 'leads_master' | 'leads_distribuicao_crm_26',
    delayMs = 30_000
): Promise<void> {
    try {
        const admin = createClient();
        const scheduledAt = new Date(Date.now() + delayMs).toISOString();
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
