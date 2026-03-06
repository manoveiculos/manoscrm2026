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
    const [{ data: consultants }, { data: inventory }, { data: dbLeads }] = await Promise.all([
      supabaseAdmin.from('consultants_manos_crm').select('*').eq('is_active', true),
      supabaseAdmin.from('inventory_manos_crm').select('*'),
      supabaseAdmin.from('leads_distribuicao_crm_26').select('*')
    ]);

    if (!consultants || !inventory || !dbLeads) throw new Error("Falha ao carregar dados do banco.");

    // Map leads to include the same metadata as dataService.getLeads
    const allLeads = dbLeads.map(l => {
      const firstName = l.vendedor?.trim().split(' ')[0].toLowerCase() || '';
      const consultant = consultants.find(c => c.name.toLowerCase().includes(firstName));
      return {
        ...l,
        assigned_consultant_id: consultant?.id,
        vehicle_interest: l.interesse || '',
        name: l.nome
      };
    });

    const inventorySummary = inventory.slice(0, 20).map(i => `- ${i.marca} ${i.modelo} (${i.ano}) - R$ ${i.preco}`).join('\n');

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

    // 2. Filter Leads (Exclude Lost/Total Loss and Sem Contato/New leads from tactical analysis)
    const activeLeads = allLeads.filter((l: any) =>
      l.status !== 'lost' &&
      (l.status as any) !== 'Perca Total' &&
      (l.status as any) !== 'sem_contato' &&
      (l.status as any) !== 'Sem Contato' &&
      (l as any).pipeline !== 'reativacao' &&
      l.name && l.name.trim() !== ''
    );

    // --- STEP 1: GLOBAL ANALYSIS (ADMIN) ---
    const globalPrompt = `Você é o Diretor Comercial Sênior da Manos Veículos, com 20 anos de experiência em gestão de alto desempenho.
Analise a operação completa abaixo e gere um relatório estratégico de alta precisão para o Administrador.
Foque na eficiência da equipe e no giro do estoque.

DADOS DA OPERAÇÃO:
${activeLeads.map((l: any) => `- Lead [ID: ${l.id}]: ${l.name} | Consultor: ${l.vendedor || 'Pendente'} | Status: ${statusMap[l.status] || l.status} | Carro de Interesse: ${l.vehicle_interest}`).join('\n')}

ESTOQUE DESTAQUE:
${inventorySummary}

IMPORTANTE: 
1. Responda INTEIRAMENTE em Português do Brasil.
2. Ao citar status de leads, use EXCLUSIVAMENTE os nomes amigáveis em português: ${Object.values(statusMap).join(', ')}. NUNCA use termos técnicos em inglês como 'received', 'post_sale' ou 'new'.

REQUISITOS DO JSON:
{
  "opportunities_of_the_day": "Texto executivo direto e impactante. Identifique padrões de demanda e sugira ações de marketing ou vendas para girar o estoque parado.",
  "recommended_actions": [
    { "task": "Ação específica e acionável", "reason": "Justificativa comercial baseada em dados", "lead_id": "ID do lead se a ação for para um lead específico, caso contrário use null" }
  ],
  "team_alerts": [
    "Alertas críticos sobre leads parados, falta de agressividade comercial ou oportunidades de ouro sendo perdidas."
  ],
  "closing_probabilities": [
    { "consultant_name": "Nome", "probability": number }
  ]
}`;

    const globalResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: 'Você é um Diretor Comercial experiente. Sua análise é ácida, direta e focada em resultados. Responda apenas com JSON.' }, { role: 'user', content: globalPrompt }],
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
    const individualAnalysesResults = await Promise.all(consultants.map(async (consultant) => {
      const consultantLeads = activeLeads.filter((l: any) =>
        l.assigned_consultant_id === consultant.id ||
        (l.vendedor && l.vendedor.toLowerCase().includes(consultant.name.split(' ')[0].toLowerCase()))
      );

      if (consultantLeads.length === 0) return null;

      const individualPrompt = `Você é o Mentor de Vendas e Gerente de ${consultant.name.split(' ')[0]}. 
Seu tom é motivador, mas extremamente exigente e focado em fechar negócio HOJE.
NÃO seja neutro. Dê ordens claras.

REGRAS DE OURO:
1. CHAME O CLIENTE PELO NOME.
2. MENCIONE O MODELO DO CARRO.
3. IDENTIFIQUE "OPORTUNIDADES REAIS DE FECHAMENTO" se o cliente:
   - Pediu financiamento
   - Pediu preço ou proposta
   - Pediu visita ou test drive
   - Demonstrou interesse específico em um modelo do estoque
   - Conversou mais de uma vez recentemente

SEUS LEADS PRIORITÁRIOS PARA HOJE (${consultantLeads.length}):
${consultantLeads.map((l: any) => `- Lead [ID: ${l.id}] ${l.name}: ${l.vehicle_interest} | Status: ${statusMap[l.status] || l.status} | Histórico: ${l.resumo_consultor || 'Novo'} | Último Passo: ${l.proxima_acao || 'Ag'}`).join('\n')}

ESTOQUE:
${inventorySummary}

DIRETRIZES:
- Responda apenas em PT-BR.
- Use apenas os nomes de status em português: ${Object.values(statusMap).join(', ')}.
- NUNCA use termos como 'received', 'post_sale', 'scheduled' nas análises textuais.

REQUISITOS DO JSON:
{
  "daily_guide": "Texto motivador de gerente. Ex: '${consultant.name.split(' ')[0]}, hoje o dia é de fechamento! Temos leads quentes querendo assinar. Foco total em [Nome] e [Nome].'",
  "recommended_actions": [
    { 
      "task": "Ligar para [Nome] agora sobre o [Carro]", 
      "reason": "Explique o gatilho comercial (ex: ele quer financiar e temos as melhores taxas).",
      "lead_id": "ID do lead extraído da lista acima"
    }
  ],
  "leads_analysis": [
    {
      "lead_id": "...",
      "is_closing_opportunity": boolean,
      "closing_reason": "Por que é uma oportunidade de fechamento hoje?",
      "closing_probability": number,
      "behavioral_analysis": "Análise tática do perfil de [Nome]...",
      "negotiation_strategy": "Script ou argumento matador para o [Carro]...",
      "next_step": "AÇÃO IMEDIATA: Ligar, Mandar Proposta, etc.",
      "ai_score": number
    }
  ]
}`;

      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: `Você orienta o consultor ${consultant.name.split(' ')[0]}. Seja tático e direto. Responda apenas com JSON.` }, { role: 'user', content: individualPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
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
