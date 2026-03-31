import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { dataService } from '@/lib/dataService';
import { createClient } from '@supabase/supabase-js';

// Server-side Service Role client to bypass RLS and see all consultants/leads
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export const maxDuration = 60; // Allow more time for multiple analyses

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API Key não configurada.' }, { status: 500 });
    }
    // 1. Get Consultants, Inventory and FRESH Leads using Admin client
    // CRITICAL: use consultants_manos_crm (V1 table) — assigned_consultant_id in leads_manos_crm references these IDs
    // use 'leads' unified VIEW to capture all leads (leads_manos_crm + leads_distribuicao_crm_26 + leads_master)
    const [{ data: consultants }, { data: inventory }, { data: dbLeads }] = await Promise.all([
      supabaseAdmin.from('consultants_manos_crm').select('*').eq('is_active', true),
      supabaseAdmin.from('estoque').select('id, marca, modelo, ano, preco, status').neq('status', 'sold').limit(30),
      supabaseAdmin.from('leads').select('id, name, status, source, vehicle_interest, assigned_consultant_id, ai_score, created_at, response_time_seconds').order('created_at', { ascending: false }).limit(800)
    ]);

    if (!consultants || !inventory || !dbLeads) throw new Error("Falha ao carregar dados do banco.");

    const allLeads = dbLeads.map(l => ({
      ...l,
      vehicle_interest: l.vehicle_interest || '',
    }));

    const inventorySummary = (inventory || []).slice(0, 20).map(i => `- ${i.marca} ${i.modelo} (${i.ano}) - R$ ${i.preco}`).join('\n');

    // Status mapping for localized AI output
    const statusMap: Record<string, string> = {
      'new': 'Novo Lead',
      'received': 'Recebido',
      'attempt': 'Em Atendimento',
      'contacted': 'Contatado',
      'confirmed': 'Confirmado',
      'scheduled': 'Agendado',
      'visited': 'Visita Realizada',
      'test_drive': 'Test Drive',
      'proposed': 'Proposta',
      'negotiation': 'Negociação',
      'closed': 'Venda Finalizada',
      'post_sale': 'Pós-Venda',
      'lost': 'Perda Total'
    };

    // 2. Filter Leads — exclude definitively closed/lost for tactical analysis
    const activeLeads = allLeads.filter((l: any) =>
      l.status !== 'lost' &&
      l.status !== 'lixo' &&
      l.status !== 'duplicado' &&
      l.status !== 'desqualificado' &&
      l.name && l.name.trim() !== ''
    );

    // Aggregates for grounding the analysis and preventing hallucination
    const now = new Date();
    const last24h = activeLeads.filter((l: any) => {
      const created = new Date(l.created_at);
      return (now.getTime() - created.getTime()) < 24 * 60 * 60 * 1000;
    });
    const byStatus: Record<string, number> = {};
    activeLeads.forEach((l: any) => { byStatus[statusMap[l.status] || l.status] = (byStatus[statusMap[l.status] || l.status] || 0) + 1; });
    const statusSummary = Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(', ');

    const consultantSummary = (consultants as any[]).map(c => {
      const cLeads = activeLeads.filter((l: any) => l.assigned_consultant_id === c.id);
      const hotLeads = cLeads.filter((l: any) => (l.ai_score || 0) >= 70);
      return `${c.name}: ${cLeads.length} leads ativos, ${hotLeads.length} quentes`;
    }).join('\n');

    // --- STEP 1: GLOBAL ANALYSIS (ADMIN) ---
    const globalPrompt = `Você é o Diretor Comercial Sênior da Manos Veículos.
Analise os dados REAIS abaixo e gere um relatório estratégico preciso para o Administrador.
REGRA CRÍTICA: Use APENAS os dados fornecidos. Não invente nomes de clientes, IDs ou fatos que não estão nos dados. Se não tiver informação suficiente, diga "dados insuficientes no período".

RESUMO DA OPERAÇÃO (${activeLeads.length} leads ativos):
- Distribuição por status: ${statusSummary}
- Novos nas últimas 24h: ${last24h.length}
- Data da análise: ${new Date().toLocaleDateString('pt-BR')}

DESEMPENHO POR CONSULTOR:
${consultantSummary}

ESTOQUE DISPONÍVEL:
${inventorySummary}

LEADS PRIORITÁRIOS (score >= 70):
${activeLeads.filter((l: any) => (l.ai_score || 0) >= 70).slice(0, 15).map((l: any) => {
  const consultant = (consultants as any[]).find(c => c.id === l.assigned_consultant_id);
  return `- [${l.id}] ${l.name} | Score: ${l.ai_score} | Status: ${statusMap[l.status] || l.status} | Interesse: ${l.vehicle_interest || 'N/D'} | Consultor: ${consultant?.name || 'Sem consultor'}`;
}).join('\n') || '- Nenhum lead com score alto no momento'}

INSTRUÇÕES:
1. Responda INTEIRAMENTE em Português do Brasil.
2. Base suas análises EXCLUSIVAMENTE nos dados acima. Zero alucinações.
3. Para recommended_actions, use APENAS lead_ids que aparecem nos dados acima.
4. Status em português: ${Object.values(statusMap).join(', ')}.

RETORNE EXATAMENTE ESTE JSON:
{
  "opportunities_of_the_day": "Análise executiva direta baseada nos dados: gargalos, oportunidades e estado da operação.",
  "recommended_actions": [
    { "task": "Ação específica e imediata", "reason": "Justificativa baseada em dado concreto do relatório", "lead_id": "ID real do lead ou null" }
  ],
  "team_alerts": [
    "Alerta específico baseado nos dados reais (ex: consultor X tem N leads quentes sem evolução)"
  ],
  "closing_probabilities": [
    { "consultant_name": "Nome exato do consultor", "probability": 0 }
  ]
}`;


    const globalResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: 'Você é um Diretor Comercial Implacável. Sua análise é cirúrgica, focada em alto giro de estoque e lucro máximo. Você não aceita desculpas, apenas resultados. Responda apenas com JSON.' }, { role: 'user', content: globalPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const globalResult = JSON.parse(globalResponse.choices[0]?.message?.content || '{}');

    // Save Global Result using Admin client
    await supabaseAdmin.from('intelligent_analysis_results').insert([{
      opportunities_of_the_day: globalResult.opportunities_of_the_day,
      recommended_actions: globalResult.recommended_actions,
      stats: {
        team_alerts: globalResult.team_alerts,
        closing_probabilities: globalResult.closing_probabilities,
        leads_analyzed: activeLeads.length
      },
      analyses: [],
      created_at: new Date().toISOString()
    }]);

    // --- STEP 2: INDIVIDUAL ANALYSIS (PER CONSULTANT) ---
    const individualAnalysesResults = await Promise.all((consultants as any[]).map(async (consultant) => {
      // FILTRAGEM ESTRITA: Wilson só analisa leads do Wilson. Sergio só analisa leads do Sergio.
      const consultantLeads = activeLeads.filter((l: any) => 
        l.assigned_consultant_id && (
          l.assigned_consultant_id === consultant.id || 
          l.assigned_consultant_id.toString().includes(consultant.id)
        )
      );

      if (consultantLeads.length === 0) return null;

      const hotLeads = consultantLeads.filter((l: any) => (l.ai_score || 0) >= 70);
      const warmLeads = consultantLeads.filter((l: any) => (l.ai_score || 0) >= 40 && (l.ai_score || 0) < 70);
      const firstName = consultant.name.split(' ')[0];

      const individualPrompt = `Você é o Mentor de Vendas de ${firstName} na Manos Veículos.
REGRA CRÍTICA: Use APENAS os dados fornecidos. Não invente nomes, IDs ou fatos. Se um campo for "N/D", não especule.

DADOS DO CONSULTOR ${firstName.toUpperCase()}:
- Total de leads ativos: ${consultantLeads.length}
- Leads quentes (score >= 70): ${hotLeads.length}
- Leads mornos (score 40-69): ${warmLeads.length}

LEADS PARA ANÁLISE:
${consultantLeads.slice(0, 30).map((l: any) => `- [UUID: ${l.id}] ${l.name} | Score: ${l.ai_score || 0} | Status: ${statusMap[l.status] || l.status} | Interesse: ${l.vehicle_interest || 'N/D'}`).join('\n')}

ESTOQUE DISPONÍVEL:
${inventorySummary}

REGRAS:
1. Responda apenas em PT-BR.
2. Use APENAS o UUID COMPLETO (36 caracteres) do lead em lead_id. NUNCA resuma o ID.
3. SEMPRE inclua o lead_name exato da lista acima.
4. Score (ai_score) só acima de 70 se o lead está em negociação/proposta com interesse explícito. Dados insuficientes = score máximo 50.
5. Status em português: ${Object.values(statusMap).join(', ')}.
6. Para leads com poucos dados, seja honesto: "histórico insuficiente para análise aprofundada".

RETORNE EXATAMENTE ESTE JSON:
{
  "daily_guide": "Mensagem direta para ${firstName} baseada nos dados reais: quantos leads quentes, quais são as prioridades do dia.",
  "recommended_actions": [
    { "task": "Ação concreta e imediata", "reason": "Baseada em dado real do lead", "lead_id": "UUID REAL de 36 caracteres", "lead_name": "Nome Completo" }
  ],
  "leads_analysis": [
    {
      "lead_id": "UUID REAL de 36 caracteres",
      "lead_name": "Nome Completo",
      "is_closing_opportunity": false,
      "closing_reason": "Justificativa baseada em dados reais ou 'dados insuficientes'",
      "closing_probability": 0,
      "behavioral_analysis": "Análise baseada no score e status reais",
      "negotiation_strategy": "Estratégia concreta para o veículo de interesse real",
      "next_step": "Próxima ação específica",
      "ai_score": 0
    }
  ]
}`;

      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: `Você é o Mentor Elite do consultor ${firstName}. Analise com precisão cirúrgica usando APENAS os dados fornecidos. Zero alucinações — se não tem dado, admita. Responda apenas com JSON válido.` },
          { role: 'user', content: individualPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const data = JSON.parse(res.choices[0]?.message?.content || '{}');

      // Persist Individual Analysis using Admin client
      await supabaseAdmin.from('crm_daily_analysis').insert([{
        consultor_id: consultant.id,
        analysis_text: data.daily_guide,
        analysis_json: {
          recommended_actions: data.recommended_actions,
          analyses: data.leads_analysis,
          base_count: consultantLeads.length
        },
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }]);

      return {
        consultantId: consultant.id,
        consultantName: consultant.name,
        leadsAnalyzed: consultantLeads.length
      };
    }));

    return NextResponse.json({
      success: true,
      global: globalResult,
      individuals: individualAnalysesResults.filter(Boolean)
    });

  } catch (error: any) {
    console.error('Dual Intelligent Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
