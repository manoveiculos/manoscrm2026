import { analyzeWithClaude } from '@/lib/claude';
import { AI_MODELS } from '@/lib/aiProviders';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface WhatsAppMessage {
    direction: 'inbound' | 'outbound';
    content: string;
    created_at?: string;
}

interface InventoryRow {
    id?: string;
    marca?: string;
    modelo?: string;
    ano?: number | string;
    preco?: string | number | null;
    km?: number | null;
    cambio?: string | null;
    combustivel?: string | null;
    status?: string | null;
}

export interface LeadAnalysisPayload {
    lead_id: string;
    lead_name: string;
    interesse?: string;
    investimento?: string | number | null;
    troca?: string | null;
    historico_whatsapp: WhatsAppMessage[];
    notas_consultor?: string;
    ultimo_contato?: string | null;
    estoque_disponivel: InventoryRow[];
    consultant_name?: string;
    lead_status?: string;
    behavioral_profile?: string | object | null;
}

export interface MatchedVehicle {
    id?: string | null;
    veiculo: string;
    preco_formatado: string;
    fit_score: number;
    motivo: string;
}

export interface LeadStrategyOutput {
    analise_perfil: string;
    probabilidade_fechamento: number;
    proxima_acao_imediata: string;
    matchmaking: MatchedVehicle[];
    script_whatsapp: string;
    resumo_3_segundos: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePrice(val?: string | number | null): number | null {
    if (val == null || val === '') return null;
    if (typeof val === 'number') return val;
    const clean = String(val)
        .replace(/R\$\s*/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
}

function formatPrice(val?: string | number | null): string {
    const n = parsePrice(val);
    if (n == null) return 'Sob consulta';
    return `R$ ${n.toLocaleString('pt-BR')}`;
}

interface ScoredVehicle extends InventoryRow {
    _score: number;
    veiculo: string;
    preco_formatado: string;
}

function filterTopVehicles(
    inventory: InventoryRow[],
    interesse?: string,
    investimento?: string | number | null
): ScoredVehicle[] {
    const budget = parsePrice(investimento);
    const keywords = (interesse || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2);

    const score = (item: InventoryRow, ignorePriceFilter: boolean): number | null => {
        if (item.status === 'vendido') return null;

        const label = `${item.marca ?? ''} ${item.modelo ?? ''}`.toLowerCase();
        let pts = 0;

        // Score por keywords do interesse
        for (const kw of keywords) {
            if (label.includes(kw)) pts += 30;
        }

        // Score por preço
        const itemPrice = parsePrice(item.preco);
        if (budget != null && itemPrice != null) {
            const lo = budget * 0.75;
            const hi = budget * 1.25;
            if (!ignorePriceFilter && (itemPrice < lo || itemPrice > hi)) return null;
            if (itemPrice <= budget) pts += 20;
        }

        return pts;
    };

    const build = (ignorePriceFilter: boolean): ScoredVehicle[] =>
        inventory
            .map(item => {
                const pts = score(item, ignorePriceFilter);
                if (pts === null) return null;
                return {
                    ...item,
                    _score: pts,
                    veiculo: `${item.marca ?? ''} ${item.modelo ?? ''} ${item.ano ?? ''}`.trim(),
                    preco_formatado: formatPrice(item.preco),
                };
            })
            .filter((x): x is ScoredVehicle => x !== null)
            .sort((a, b) => b._score - a._score)
            .slice(0, 5);

    const withPrice = build(false);
    return withPrice.length > 0 ? withPrice : build(true);
}

function truncateConversation(msgs: WhatsAppMessage[]): string {
    // Filtro agressivo para remover "sujeira" de sistema e logs que não são conversas reais
    const cleanMsgs = msgs.filter(m => {
        const text = (m.content || '').toLowerCase();
        const isAISummary = text.includes('🤖 análise') || text.includes('orientação:') || text.includes('diagnóstico:');
        const isSystemNote = text.startsWith('[sistema]') || text.includes('🔧 campo') || text.includes('🎯 veículo vinculado');
        const isShortLog = text.length < 2 && !text.includes('?'); // Remove pontuações soltas ou msgs vazias
        
        return !isAISummary && !isSystemNote && !isShortLog;
    });

    // Garante que as mensagens estejam em ordem CRONOLÓGICA (Antigo -> Novo) para o raciocínio da IA
    const sortedCleanMsgs = [...cleanMsgs].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateA - dateB;
    });

    const fmt = (m: WhatsAppMessage) =>
        `[${m.created_at ? new Date(m.created_at).toLocaleString('pt-BR') : 'Agora'}] ${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}: ${m.content}`;

    const all = sortedCleanMsgs.map(fmt);
    const full = all.join('\n');

    if (full.length < 8000) return full;

    // Se ainda for muito grande, prioriza as últimas 20 mensagens (janela de contexto humana)
    const head = all.slice(0, 5);
    const tail = all.slice(-20);
    return [...head, '\n... [histórico antigo suprimido para foco no fechamento atual] ...\n', ...tail].join('\n');
}

function postProcess(raw: string, leadName: string): string {
    return raw
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .replace(/\{NOME_LEAD\}/g, leadName)
        .replace(/Manos Multimarcas/gi, 'Manos Veículos')
        .trim();
}

// ── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o Diretor Comercial Elite da Manos Veículos — concessionária multimarcas premium em Rio do Sul/SC. Você é um fechador implacável (Closer). Seu papel não é ser "amigável" ou "atendente", mas sim conduzir a venda com autoridade, gerando urgência extrema e micro-comprometimentos.

Sua missão é ENTREGAR UM COMANDO TÁTICO DIRETO ao consultor para fechar essa venda nas próximas 2-4 horas. CHEGA DE PASSIVIDADE.

═══ REGRAS ABSOLUTAS DE FECHAMENTO ═══
1. Sempre "Manos Veículos" — JAMAIS "Manos Multimarcas".
2. TÉCNICAS DE CIALDINI OBRIGATÓRIAS:
   - Escassez: O carro tem altíssima rotatividade (ex: "tem outro cliente vindo ver à tarde").
   - Urgência: Condição de preço ou taxa expira hoje ou amanhã cedo.
   - Micro-comprometimento: NUNCA sugira "ficar à disposição". Exija o próximo passo: "Me mande a CNH", "Me confirme sua visita às 15h".
3. URGÊNCIA TEMPORAL (Venda sob Pressão):
   - 0-2 dias sem contato → "Lead FERVENDO: Fechamento IMEDIATO. Empurre a visita ou CPF."
   - 3-7 dias → "Lead ESFRIANDO: Crie evento de escassez irrecusável hoje."
   - +8 dias → "Desfibrilador: Tudo ou nada. Última oferta agressiva para forçar o SIM ou NÃO."
4. proxima_acao_imediata DEVE SER UMA ORDEM DIRETA AO CONSULTOR: [Verbo de imposição] + [Ação Exata] + [Argumento de Gatilho]. Ex: "LIGUE AGORA. Diga que outro cliente teve a ficha negada e o carro voltou pro pátio, mas só segura até as 18h se ele mandar o CPF". Mínimo de conselhos vagos.
5. script_whatsapp: 2 frases CURTAS E DIRETAS. Use Gatilhos Mentais. NENHUMA GENTILEZA EXCESSIVA ("Bom dia tudo bem espero que sim"). DIRETO AO PONTO. Provoque a resposta. Ex: "Carlos, o Polo liberou. Tenho outro cliente agendado pras 16h, mas a preferência é sua se me mandar o OK agora. Fechamos?"
6. matchmaking: ordene por fit_score DESC.
7. Retorne APENAS JSON válido. Zero markdown. Zero texto fora do JSON.

═══ FRAMEWORK DE DIAGNÓSTICO ═══
Antes de preencher o JSON, responda mentalmente:
Q1: Qual é a objeção REAL do lead? (preço / prazo / medo de comprometer / comparando concorrência / cônjuge não aprovou / sem urgência percebida)
Q2: O que o consultor fez ERRADO ou deixou de fazer?
Q3: Qual veículo do estoque tem o melhor encaixe para este perfil e este budget?
Q4: Qual é a janela de tempo ideal para fechar (hoje / amanhã / essa semana)?

═══ SCHEMA OBRIGATÓRIO ═══
{
  "analise_perfil": "Perfil psicológico do comprador: tipo de decisor (racional/emocional/comparador/impulsivo), estágio real no funil, objeção principal detectada, ponto de dor que motiva a compra.",
  "probabilidade_fechamento": number entre 0 e 100,
  "proxima_acao_imediata": "1 ação específica com canal + prazo + argumentação. Ex: 'WhatsApp em até 1h com foto do Polo Track 2024 (R$ 79.900) — dizer que recebeu uma entrada de outro cliente e pode guardar até amanhã 18h'",
  "matchmaking": [
    {
      "id": "uuid do veículo ou null",
      "veiculo": "Marca Modelo Ano",
      "preco_formatado": "R$ X.XXX",
      "fit_score": number 0-100,
      "motivo": "Por que este veículo é a escolha certa: budget OK/X% acima + compatível com interesse declarado + câmbio/combustível preferido + km adequado"
    }
  ],
  "script_whatsapp": "Mensagem pronta para o consultor copiar e colar. Máx 3 frases. Natural. Sem saudações genéricas.",
  "resumo_3_segundos": "Máx 15 palavras. O que o consultor precisa saber antes de ligar."
}`;

// ── Função principal ──────────────────────────────────────────────────────────

export async function generateLeadStrategy(
    payload: LeadAnalysisPayload
): Promise<LeadStrategyOutput> {
    const topVehicles = filterTopVehicles(
        payload.estoque_disponivel,
        payload.interesse,
        payload.investimento
    );

    const chatText = truncateConversation(payload.historico_whatsapp);

    const diasSemContato = payload.ultimo_contato
        ? Math.floor((Date.now() - new Date(payload.ultimo_contato).getTime()) / 86_400_000)
        : null;

    const estoqueLines = topVehicles.length > 0
        ? topVehicles.map(v => `- ${v.veiculo} | ${v.preco_formatado} | km: ${v.km ?? '?'} | câmbio: ${v.cambio ?? '?'}`).join('\n')
        : 'Nenhum veículo pré-filtrado — use qualquer disponível no estoque';

    const userPrompt = `LEAD: ${payload.lead_name}
STATUS: ${payload.lead_status || 'desconhecido'}
INTERESSE: ${payload.interesse || 'não informado'}
BUDGET: ${payload.investimento || 'não informado'}
TROCA: ${payload.troca || 'sem troca'}
DIAS SEM CONTATO: ${diasSemContato != null ? diasSemContato : 'desconhecido'}
CONSULTOR: ${payload.consultant_name || 'não informado'}
PERFIL COMPORTAMENTAL: ${typeof payload.behavioral_profile === 'object' ? JSON.stringify(payload.behavioral_profile) : (payload.behavioral_profile || 'não informado')}

CONVERSA WHATSAPP:
${chatText || 'Nenhuma mensagem disponível.'}

NOTAS DO CONSULTOR: ${payload.notas_consultor || 'nenhuma'}

TOP VEÍCULOS DO ESTOQUE (pré-filtrados por interesse e budget):
${estoqueLines}`;

    const raw = await analyzeWithClaude(userPrompt, AI_MODELS.CLAUDE_SONNET, SYSTEM_PROMPT);
    const cleaned = postProcess(raw, payload.lead_name);
    const result: LeadStrategyOutput = JSON.parse(cleaned);

    // Injeta IDs do estoque local nas sugestões
    result.matchmaking = (result.matchmaking || []).slice(0, 5).map(m => {
        const found = topVehicles.find(v => v.veiculo === m.veiculo);
        return { ...m, id: found?.id ?? m.id ?? null };
    });

    return result;
}
