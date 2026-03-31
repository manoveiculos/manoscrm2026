import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { getTableForLead, stripPrefix } from '@/lib/services/leadRouter';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Configuração fixa de financiamento ────────────────────────────────────────
const TAXA_MENSAL = 0.02;   // 2% ao mês
const PRAZO = 48;           // 48x padrão
const ENTRADAS_PCT = [0.20, 0.30, 0.40]; // 20%, 30%, 40% do valor do veículo

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcParcela(valorFinanciado: number, taxa: number, prazo: number): number {
    // Fórmula Price: PMT = PV * [r(1+r)^n] / [(1+r)^n - 1]
    if (valorFinanciado <= 0) return 0;
    const r = taxa;
    const n = prazo;
    const fator = Math.pow(1 + r, n);
    return valorFinanciado * (r * fator) / (fator - 1);
}

function fmtBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parsePrice(val?: string | number | null): number | null {
    if (val == null || val === '') return null;
    if (typeof val === 'number') return val > 0 ? val : null;
    const clean = String(val).replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
    const n = parseFloat(clean);
    return isNaN(n) || n <= 0 ? null : n;
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ProposalScenario {
    label: string;             // "Entrada 20%" | "Entrada 30%" | "Entrada 40%"
    prazo: string;             // "48x"
    entrada_valor: number;     // valor numérico
    entrada: string;           // "R$ 18.000"
    financiado: string;        // "R$ 72.000"
    parcela_valor: number;     // valor numérico
    parcela: string;           // "R$ 2.380/mês"
    total: string;             // "R$ 114.240"
    taxa: string;              // "2,00% a.m."
    obs: string;               // frase curta de vantagem
    mensagem_whatsapp: string; // mensagem completa pronta para copiar/enviar
}

export interface ProposalResult {
    titulo: string;
    pitch: string;
    veiculo_preco: string;
    cenarios: ProposalScenario[];
    cta: string;
    gerado_em: string;
}

// ── Serviço principal ─────────────────────────────────────────────────────────

export async function runGenerateProposal(leadId: string): Promise<ProposalResult> {
    // Roteamento correto de tabela
    const primaryTable = getTableForLead(leadId);
    const cleanId = stripPrefix(leadId) || leadId;
    const ALL_TABLES = ['leads_master', 'leads_manos_crm', 'leads_distribuicao_crm_26'];
    const tablePriority = [primaryTable, ...ALL_TABLES.filter(t => t !== primaryTable)];

    let lead: any = null;
    for (const t of tablePriority) {
        const { data } = await supabaseAdmin.from(t)
            .select('name, phone, vehicle_interest, valor_investimento, carro_troca, ai_reason, behavioral_profile')
            .eq('id', cleanId)
            .maybeSingle();
        if (data) { lead = data; break; }
    }
    if (!lead) throw new Error(`Lead não encontrado para proposta (ID: ${cleanId})`);

    const nome = (lead.name || 'Cliente').split(' ')[0];
    const nomeCompleto = lead.name || 'Cliente';
    const veiculo = lead.vehicle_interest || 'veículo';
    const troca = lead.carro_troca || '';

    // ── 1. Busca preço real do veículo no estoque ─────────────────────────────
    let precoVeiculo: number | null = null;
    let veiculoNomeReal = veiculo;

    const keywords = veiculo.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    if (keywords.length > 0) {
        const { data: inv } = await supabaseAdmin
            .from('inventory_manos_crm')
            .select('marca, modelo, ano, preco')
            .not('status', 'eq', 'vendido')
            .limit(30);

        if (inv) {
            const match = inv.find((v: any) => {
                const label = `${v.marca || ''} ${v.modelo || ''}`.toLowerCase();
                return keywords.some((kw: string) => label.includes(kw));
            });
            if (match) {
                precoVeiculo = parsePrice(match.preco);
                veiculoNomeReal = `${match.marca} ${match.modelo}${match.ano ? ' ' + match.ano : ''}`.trim();
            }
        }
    }

    // Fallback: usa valor_investimento declarado
    if (!precoVeiculo) {
        precoVeiculo = parsePrice(lead.valor_investimento);
    }

    // Se ainda não tiver preço, usa R$ 90.000 como estimativa
    if (!precoVeiculo || precoVeiculo < 5000) {
        precoVeiculo = 90000;
    }

    // ── 2. Calcula valor da troca (estimativa) ────────────────────────────────
    let valorTroca = 0;
    if (troca && troca.toLowerCase() !== 'sem troca' && troca.length > 2) {
        // Estimativa conservadora: 15% do preço do veículo desejado
        valorTroca = Math.round(precoVeiculo * 0.15 / 1000) * 1000;
    }

    // ── 3. Calcula os 3 cenários matematicamente ──────────────────────────────
    const cenariosCalc = ENTRADAS_PCT.map((pct, i) => {
        const entradaBase = Math.round(precoVeiculo! * pct / 500) * 500;
        const entradaTotal = entradaBase + valorTroca; // troca soma na entrada
        const financiado = precoVeiculo! - entradaTotal;
        const parcelaVal = calcParcela(Math.max(financiado, 0), TAXA_MENSAL, PRAZO);
        const totalPago = entradaTotal + parcelaVal * PRAZO;

        return {
            pct,
            index: i,
            entradaBase,
            entradaTotal,
            financiado: Math.max(financiado, 0),
            parcelaVal,
            totalPago,
        };
    });

    // ── 4. GPT gera textos humanizados com os números já calculados ───────────
    const cenariosParaGPT = cenariosCalc.map((c, i) => ({
        index: i,
        entrada: fmtBRL(c.entradaTotal),
        financiado: fmtBRL(c.financiado),
        parcela: `${fmtBRL(c.parcelaVal)}/mês`,
        total: fmtBRL(c.totalPago),
        pct_entrada: `${Math.round(c.pct * 100)}%`,
    }));

    const aiReason = (lead.ai_reason || '').split('| ORIENTAÇÃO:')[0].trim();

    const promptGPT = `Você é consultor de vendas sênior da Manos Veículos (multimarcas, Rio do Sul/SC).

DADOS FIXOS DO FINANCIAMENTO:
- Veículo: ${veiculoNomeReal} — ${fmtBRL(precoVeiculo)}
- Taxa: 2,00% a.m. — Prazo: ${PRAZO}x
${troca ? `- Troca do cliente: ${troca} (valor estimado ${fmtBRL(valorTroca)} incluído na entrada)` : ''}
- Contexto IA: ${aiReason || 'sem análise anterior'}

CENÁRIOS CALCULADOS (NÃO ALTERE OS VALORES NUMÉRICOS):
${cenariosParaGPT.map(c => `
Cenário ${c.index + 1} (Entrada ${c.pct_entrada}):
  Entrada: ${c.entrada} | Financiado: ${c.financiado} | Parcela: ${c.parcela} | Total: ${c.total}`).join('')}

TAREFA:
Gere para cada cenário:
1. "obs": frase curta (máx 8 palavras) destacando a vantagem deste plano
2. "mensagem_whatsapp": mensagem COMPLETA, humanizada e pronta para enviar a ${nome}
   - Use emojis com moderação
   - Inclua nome do cliente (${nome}), veículo, entrada, parcela e prazo
   - Tom: amigável, profissional, sem pressão
   - Termine com pergunta de fechamento suave
   - Máx 200 palavras por mensagem

Também gere:
- "pitch": frase de abertura para o consultor dizer ao apresentar (máx 2 linhas)
- "cta": frase de fechamento para o consultor usar no final da conversa

JSON estrito (sem markdown):
{
  "pitch": "...",
  "cta": "...",
  "cenarios": [
    { "obs": "...", "mensagem_whatsapp": "..." },
    { "obs": "...", "mensagem_whatsapp": "..." },
    { "obs": "...", "mensagem_whatsapp": "..." }
  ]
}`;

    const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: 'Responda APENAS com JSON válido, sem markdown.' },
            { role: 'user', content: promptGPT }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 1500,
    });

    const gptResult = JSON.parse(res.choices[0]?.message?.content || '{}');
    const gptCenarios = Array.isArray(gptResult.cenarios) ? gptResult.cenarios : [];

    // ── 5. Monta resultado final combinando cálculos + textos GPT ─────────────
    const LABELS = ['Entrada 20%', 'Entrada 30%', 'Entrada 40%'];

    const cenarios: ProposalScenario[] = cenariosCalc.map((c, i) => ({
        label: LABELS[i],
        prazo: `${PRAZO}x`,
        entrada_valor: c.entradaTotal,
        entrada: fmtBRL(c.entradaTotal),
        financiado: fmtBRL(c.financiado),
        parcela_valor: c.parcelaVal,
        parcela: `${fmtBRL(c.parcelaVal)}/mês`,
        total: fmtBRL(c.totalPago),
        taxa: '2,00% a.m.',
        obs: gptCenarios[i]?.obs || '',
        mensagem_whatsapp: gptCenarios[i]?.mensagem_whatsapp || '',
    }));

    const proposal: ProposalResult = {
        titulo: `Proposta ${nomeCompleto} — ${veiculoNomeReal.split(' ').slice(0, 3).join(' ')}`,
        pitch: gptResult.pitch || '',
        veiculo_preco: fmtBRL(precoVeiculo),
        cenarios,
        cta: gptResult.cta || '',
        gerado_em: new Date().toISOString(),
    };

    // ── 6. Persiste no lead e na timeline ─────────────────────────────────────
    for (const t of tablePriority) {
        const { error } = await supabaseAdmin.from(t).update({
            last_proposal_json: proposal,
            last_proposal_at: new Date().toISOString(),
        }).eq('id', cleanId);
        if (!error) break;
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
    const resumo = cenarios.map(c => `${c.label}: ${c.parcela} (${c.entrada})`).join(' | ');
    await supabaseAdmin.from('interactions_manos_crm').insert({
        [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
        type: 'proposal',
        notes: `📄 PROPOSTA ${PRAZO}x @ 2% a.m. — ${veiculoNomeReal} (${fmtBRL(precoVeiculo)})\n${resumo}`,
        created_at: new Date().toISOString(),
        user_name: 'SISTEMA (IA)',
    });

    return proposal;
}
