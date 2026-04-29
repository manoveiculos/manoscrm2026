import { OpenAI } from 'openai';
import { createClient } from '@/lib/supabase/admin';
import { sendWhatsApp, isSenderConfigured } from './whatsappSender';
import { matchInventoryForInterest, formatInventoryLine, MatchedItem } from './inventoryMatcher';

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

function fallbackMessage(input: FirstContactInput, matches: MatchedItem[] = []): string {
    const cons = firstName(input.consultantName) || 'time da Manos';
    const cli = firstName(input.leadName);
    const greet = cli ? `Olá ${cli}!` : 'Olá!';
    if (input.flow === 'compra') {
        const veh = input.vehicleInterest ? ` o ${input.vehicleInterest}` : ' seu carro';
        return `${greet} Aqui é ${cons} da Manos Veículos. Recebi seu interesse em vender${veh}. Posso te chamar agora pra avaliar?`;
    }
    const top = matches[0];
    if (top) {
        const line = formatInventoryLine(top);
        return `${greet} Aqui é ${cons} da Manos Veículos. Tenho um ${line} disponível agora. Quer que eu te mande mais detalhes?`.slice(0, 280);
    }
    const veh = input.vehicleInterest ? ` no ${input.vehicleInterest}` : '';
    return `${greet} Aqui é ${cons} da Manos Veículos. Vi seu interesse${veh}. Posso te ajudar com mais informações agora?`;
}

async function generateMessage(input: FirstContactInput): Promise<string> {
    // Para fluxo de venda, traz top 3 do estoque que batem com o interesse.
    let matches: MatchedItem[] = [];
    if (input.flow === 'venda' && input.vehicleInterest) {
        matches = await matchInventoryForInterest(input.vehicleInterest, { limit: 3 }).catch(() => []);
    }

    if (!process.env.OPENAI_API_KEY) {
        return fallbackMessage(input, matches);
    }
    try {
        const cons = firstName(input.consultantName) || 'consultor da Manos';
        const cli = firstName(input.leadName) || '';
        const veh = input.vehicleInterest || '';
        const tipo = input.flow === 'compra' ? 'AVALIAR um carro pra vender' : 'COMPRAR um carro';

        const inventoryBlock = matches.length > 0
            ? `\nESTOQUE DISPONÍVEL agora que bate com o interesse (use UM se fizer sentido, sem listar todos):\n${matches.map(m => `- ${formatInventoryLine(m)}`).join('\n')}`
            : '';

        const sys = `Você escreve a primeira mensagem de WhatsApp de um consultor pra um lead que acabou de chegar.
Regras inegociáveis:
- 1 ou 2 frases curtas, máximo 240 caracteres
- Português do Brasil, tom humano e direto, ZERO emojis ou jargão de marketing
- Se houver estoque relevante, mencione UM veículo concreto (modelo + ano + preço se fizer sentido)
- Não invente carro nem preço — só use o que está no bloco de estoque
- Não promete desconto
- Termina com UMA pergunta direta (ex: "Quer que eu te mande mais detalhes?", "Posso te chamar agora?")
- Sem "tudo bem?". Sem "espero que esteja bem"`;

        const user = `Consultor: ${cons}
Cliente: ${cli || 'não informado'}
Origem do lead: ${input.source || 'não informada'}
Interesse: ${veh || 'não informado'}
Objetivo do lead: ${tipo}
Loja: Manos Veículos (Rio do Sul/SC)${inventoryBlock}

Gere apenas o texto final da mensagem, sem aspas.`;

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user },
            ],
            temperature: 0.5,
            max_tokens: 140,
        }, { timeout: 8000 });

        const out = (res.choices[0]?.message?.content || '').trim();
        if (!out || out.length < 20) return fallbackMessage(input, matches);
        return out.replace(/^["']|["']$/g, '').slice(0, 300);
    } catch {
        return fallbackMessage(input, matches);
    }
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

            // Audit trail na timeline (best-effort)
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
            const fb = fallbackMessage(input, matches);
            fallback = message === fb;
        } catch {
            message = fallbackMessage(input, matches);
            fallback = true;
        }
    } else {
        message = fallbackMessage(input, matches);
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
 * Versão fire-and-forget com delay de 30s.
 * Usar nos webhooks pra não bloquear o response e parecer mais humano.
 */
export function scheduleFirstContact(input: FirstContactInput, table: 'leads_compra' | 'leads_manos_crm' | 'leads_master' | 'leads_distribuicao_crm_26', delayMs = 30_000) {
    setTimeout(() => {
        sendFirstContact(input, table).catch(err => {
            console.error('[aiSdr] sendFirstContact falhou:', err?.message);
        });
    }, delayMs);
}
