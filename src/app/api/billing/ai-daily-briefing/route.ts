import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { anthropic, AI_MODELS } from '@/lib/aiProviders';

/**
 * Briefing diário da IA para o setor de Cobrança.
 *
 * GET  /api/billing/ai-daily-briefing  → lê do cache do dia
 * POST /api/billing/ai-daily-briefing  → gera novo briefing (Claude Sonnet)
 *
 * Resultado pensado para Camila (leiga): instruções claras, linguagem simples,
 * lista do que fazer HOJE, com quem, e quando agendar follow-up.
 *
 * Cache: usa billing_observacoes_gerais com categoria='ALERTA' e titulo='ai-daily-briefing-{YYYY-MM-DD}'
 * para guardar a saída do dia. Se já existe pra hoje, retorna do cache.
 */

const SYSTEM_PROMPT = `Você é um assistente IA do setor de cobrança da Manos Veículos (concessionária).

Sua tarefa: olhar a lista de cobranças do dia + últimas conversas WhatsApp e produzir um BRIEFING PRÁTICO para a Camila, que é responsável pela cobrança.

IMPORTANTE: a Camila tem pouca experiência com finanças. Você deve falar como se estivesse explicando para uma pessoa nova no trabalho. Sem jargão. Frases curtas. Tudo prático.

Sua saída DEVE ser um JSON válido com este formato exato (sem markdown wrapper, sem texto fora do JSON):

{
  "resumo_dia": "1 parágrafo (3-4 linhas) explicando como está a cobrança hoje. Tom amigável, tipo: 'Bom dia! Hoje temos X cobranças urgentes...'",
  "prioridades": [
    {
      "cliente": "Nome do cliente",
      "telefone": "47988xxx",
      "record_id": "id-do-record",
      "valor": 1234.56,
      "dias_atraso": 30,
      "categoria": "URGENTE_HOJE|FALAR_AGORA|FOLLOWUP_HOJE|MARCAR_AMANHA|ESCALAR_JURIDICO",
      "porque": "Frase curta explicando POR QUE este caso é prioridade hoje. Camila precisa entender.",
      "o_que_fazer": "Instrução PASSO A PASSO do que fazer agora. Ex: 'Mande mensagem WhatsApp pedindo confirmação do pagamento prometido para hoje'.",
      "script_sugerido": "Texto pronto que a Camila pode COPIAR E COLAR no WhatsApp. Tom cordial, firme mas educado. Use o primeiro nome do cliente. NUNCA seja agressiva.",
      "quando_fazer": "HOJE_MANHA|HOJE_TARDE|AMANHA|EM_3_DIAS|EM_7_DIAS",
      "se_nao_responder": "Próximo passo caso o cliente não responda. Ex: 'Se não responder até quinta, marque uma segunda tentativa para sexta.'"
    }
  ],
  "alertas": [
    "Mensagens curtas com avisos importantes do dia. Ex: 'Cliente X está há 95 dias atrasado — considere conversar com Alexandre sobre escalar para jurídico.'"
  ],
  "dica_do_dia": "1 dica prática de cobrança que ajude a Camila a melhorar. Ex: 'Ao receber um \"vou pagar amanhã\", sempre confirme o horário e a forma de pagamento — isso amarra o compromisso.'"
}

REGRAS DE OURO:
- Máximo 10 prioridades — escolha as mais críticas.
- "URGENTE_HOJE" = atraso 1-3 dias, fácil de recuperar agora.
- "FALAR_AGORA" = cliente respondeu mas a Camila ainda não respondeu de volta.
- "FOLLOWUP_HOJE" = prometeu pagar e chegou o dia prometido.
- "MARCAR_AMANHA" = atraso 60-89 dias, precisa de uma abordagem hoje.
- "ESCALAR_JURIDICO" = 90+ dias, sem resposta há +14 dias OU recusa explícita.
- Scripts WhatsApp: NUNCA usar maiúsculas todas, nunca ameaçar, sempre oferecer ajuda/negociação.
- Se valor > R$ 5.000, mencione no script que pode parcelar.
- Brasileiro coloquial é OK — não soe robótico.`;

const TODAY = () => new Date().toISOString().slice(0, 10);

async function readCache(): Promise<any | null> {
    const admin = createClient();
    const titulo = `ai-daily-briefing-${TODAY()}`;
    const { data } = await admin
        .from('billing_observacoes_gerais')
        .select('id, conteudo, created_at')
        .eq('titulo', titulo)
        .eq('categoria', 'ALERTA')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data) return null;
    try {
        return { ...JSON.parse(data.conteudo), _cached: true, _cached_at: data.created_at };
    } catch {
        return null;
    }
}

async function writeCache(payload: any) {
    const admin = createClient();
    const titulo = `ai-daily-briefing-${TODAY()}`;
    // remove cache anterior do mesmo dia
    await admin.from('billing_observacoes_gerais').delete().eq('titulo', titulo).eq('categoria', 'ALERTA');
    await admin.from('billing_observacoes_gerais').insert({
        titulo,
        conteudo: JSON.stringify(payload),
        categoria: 'ALERTA',
        autor: 'IA Camila',
    });
}

export async function GET() {
    const cached = await readCache();
    return NextResponse.json({ briefing: cached });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const force = body?.force === true;

        if (!force) {
            const cached = await readCache();
            if (cached) return NextResponse.json({ briefing: cached, cached: true });
        }

        const admin = createClient();
        const todayStr = TODAY();

        // Pega TODAS as cobranças não-pagas
        const { data: records } = await admin
            .from('records_cobrancamanos26')
            .select('id, "clienteFornecedor", telefone, vencimento, valor, status, observacoes')
            .neq('status', 'PAGO')
            .limit(200);

        if (!records || records.length === 0) {
            const payload = {
                resumo_dia: 'Hoje não há cobranças em aberto no sistema. Aproveite para revisar a base de clientes.',
                prioridades: [],
                alertas: [],
                dica_do_dia: 'Mantenha a planilha de cobranças sempre atualizada — quando vence uma parcela, atualizar o status logo evita re-cobranças desnecessárias.',
            };
            await writeCache(payload);
            return NextResponse.json({ briefing: payload, cached: false });
        }

        // Conversas WhatsApp dos últimos 7 dias por telefone
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const { data: recentMsgs } = await admin
            .from('billing_whatsapp_messages')
            .select('telefone, direction, body, created_at')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(300);

        // Agrupa msgs por telefone para o prompt
        const msgsByPhone: Record<string, string[]> = {};
        for (const m of (recentMsgs || [])) {
            const t = m.telefone || '';
            if (!msgsByPhone[t]) msgsByPhone[t] = [];
            if (msgsByPhone[t].length < 6) {
                msgsByPhone[t].push(`[${new Date(m.created_at).toLocaleString('pt-BR')}] ${m.direction === 'INBOUND' ? 'CLIENTE' : 'COBRANCA'}: ${(m.body || '(mídia)').slice(0, 200)}`);
            }
        }

        // Acordos abertos
        const { data: acordosAtivos } = await admin
            .from('billing_acordos')
            .select('record_id, tipo, valor_acordado, parcelas, primeira_parcela, status')
            .eq('status', 'ATIVO');

        const acordosByRecord: Record<string, any[]> = {};
        for (const a of (acordosAtivos || [])) {
            if (!acordosByRecord[a.record_id]) acordosByRecord[a.record_id] = [];
            acordosByRecord[a.record_id].push(a);
        }

        // Monta linhas resumidas (limita a 100 records para não estourar tokens)
        const linhas = records.slice(0, 100).map(r => {
            const venc = new Date(r.vencimento + 'T00:00:00');
            const today = new Date(todayStr + 'T00:00:00');
            const dias = Math.floor((today.getTime() - venc.getTime()) / (24 * 3600 * 1000));
            const telDigits = (r.telefone || '').replace(/\D/g, '').slice(-11);
            const msgs = msgsByPhone[telDigits] || [];
            const acordos = acordosByRecord[r.id] || [];

            return `
RECORD_ID=${r.id}
Cliente: ${r.clienteFornecedor}
Tel: ${r.telefone || 'sem'}
Valor: R$ ${Number(r.valor).toFixed(2)}
Vencimento: ${r.vencimento} (${dias > 0 ? `${dias} dias de atraso` : 'no prazo'})
Status: ${r.status}
${acordos.length > 0 ? `Acordos ativos: ${acordos.length}` : 'Sem acordo'}
${msgs.length > 0 ? `Conversa recente:\n${msgs.slice(0, 4).join('\n')}` : 'Sem msgs WhatsApp recentes'}
`.trim();
        }).join('\n\n---\n\n');

        const completion = await anthropic.messages.create({
            model: AI_MODELS.CLAUDE_SONNET,
            max_tokens: 4000,
            system: [
                { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            ],
            messages: [
                {
                    role: 'user',
                    content: `Hoje é ${todayStr}.\n\nLista de cobranças em aberto (${records.length} no total, ${Math.min(100, records.length)} amostradas):\n\n${linhas}\n\nProduza o briefing JSON conforme as instruções do system prompt. Foque nas 10 prioridades mais críticas.`,
                },
            ],
        });

        const raw = completion.content[0]?.type === 'text' ? completion.content[0].text : '';
        let parsed: any;
        try {
            const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
            parsed = JSON.parse(clean);
        } catch {
            return NextResponse.json({
                error: 'IA devolveu resposta inválida',
                raw: raw.slice(0, 500),
            }, { status: 502 });
        }

        await writeCache(parsed);

        return NextResponse.json({
            briefing: parsed,
            cached: false,
            usage: completion.usage,
        });
    } catch (e: any) {
        console.error('[ai-daily-briefing] erro:', e);
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}
