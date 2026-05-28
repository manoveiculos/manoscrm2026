import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { anthropic, AI_MODELS, openai, genAI } from '@/lib/aiProviders';

/**
 * IA de análise de cobrança.
 *
 * POST /api/billing/ai-analyze
 *   body: { recordId: string }
 *
 * Lê:
 *   - records_cobrancamanos26          (dados do cliente, dívida)
 *   - billing_whatsapp_messages        (últimas 50 msgs in/out)
 *   - billing_acordos                  (acordos prévios)
 *
 * Devolve e CACHEIA em billing_ai_analysis:
 *   - classification: PROMESSA_PAGAMENTO | NEGOCIACAO_ABERTA | RECUSA | SEM_CONTATO | CANDIDATO_JURIDICO | PERDIDO | RECUPERAVEL
 *   - risk_score: 0-100
 *   - next_action: texto curto sugerindo próximo passo
 *   - next_action_at: data sugerida (YYYY-MM-DD)
 *   - summary: 2-3 frases resumindo o caso
 *
 * Usa Claude Sonnet 4.6 com prompt caching no system block (anti-ban: barato em volume).
 */

const SYSTEM_PROMPT = `Você é o assistente IA do setor de cobrança da Manos Veículos.

Sua tarefa: ler o histórico de UM caso (dívida + conversas WhatsApp + acordos) e devolver UMA análise estruturada em JSON.

Regras críticas:
- A Manos é concessionária de veículos. Cobranças são sobre parcelas vencidas de financiamento ou contratos.
- Brasileiro coloquial é comum nas conversas. Interprete gírias e abreviações.
- "Tô sem grana", "to apertado", "mês que vem pago" → NEGOCIACAO_ABERTA, não RECUSA.
- "Não vou pagar", "vai ter que cobrar na justiça", "não devo nada" → RECUSA.
- "Pago dia X", "deposita hoje", "vou pagar amanhã" → PROMESSA_PAGAMENTO.
- Sem resposta há +14 dias com 90+ dias de atraso → CANDIDATO_JURIDICO.
- Sem qualquer contato in/out → SEM_CONTATO.
- Recusa explícita + atraso > 90 dias → PERDIDO.
- Demonstra intenção, negocia, parcela aceita → RECUPERAVEL.

Retorne SOMENTE um JSON válido neste formato (sem markdown, sem texto extra):
{
  "classification": "PROMESSA_PAGAMENTO|NEGOCIACAO_ABERTA|RECUSA|SEM_CONTATO|CANDIDATO_JURIDICO|PERDIDO|RECUPERAVEL",
  "risk_score": 0-100,
  "next_action": "frase curta com ação concreta",
  "next_action_at": "YYYY-MM-DD",
  "summary": "2-3 frases resumindo o caso para o operador"
}

risk_score: 0 = recuperado, 100 = perda total provável.
next_action: ex.: "Reenviar boleto e pedir confirmação até quinta", "Escalar p/ jurídico — recusa há 3 meses", "Aguardar pagamento prometido p/ 30/05".`;

export async function POST(req: NextRequest) {
    try {
        const { recordId } = await req.json();
        if (!recordId) {
            return NextResponse.json({ error: 'recordId obrigatório' }, { status: 400 });
        }

        const admin = createClient();

        // Busca o record
        const { data: record, error: recErr } = await admin
            .from('records_cobrancamanos26')
            .select('id, "clienteFornecedor", "cpfCnpj", telefone, veiculo, vencimento, valor, status, "dataPagamento", observacoes')
            .eq('id', recordId)
            .maybeSingle();

        if (recErr || !record) {
            return NextResponse.json({ error: 'Record não encontrado' }, { status: 404 });
        }

        // Mensagens WhatsApp recentes
        const { data: messages } = await admin
            .from('billing_whatsapp_messages')
            .select('direction, body, created_at')
            .eq('record_id', recordId)
            .order('created_at', { ascending: false })
            .limit(50);

        // Acordos prévios
        const { data: acordos } = await admin
            .from('billing_acordos')
            .select('tipo, valor_acordado, parcelas, status, observacao, created_at')
            .eq('record_id', recordId)
            .order('created_at', { ascending: false });

        const todayStr = new Date().toISOString().slice(0, 10);
        const venc = new Date(record.vencimento + 'T00:00:00');
        const hoje = new Date(todayStr + 'T00:00:00');
        const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / (24 * 3600 * 1000)));

        const msgsFmt = (messages || []).reverse().map(m =>
            `[${new Date(m.created_at).toLocaleString('pt-BR')}] ${m.direction === 'INBOUND' ? 'CLIENTE' : 'COBRANCA'}: ${m.body || '(mídia)'}`
        ).join('\n') || '(nenhuma mensagem registrada)';

        const acordosFmt = (acordos || []).map(a =>
            `- ${a.tipo} R$${a.valor_acordado} (${a.parcelas}x) status=${a.status}: ${a.observacao || ''}`
        ).join('\n') || '(nenhum acordo registrado)';

        const userPrompt = `## Dados do cliente
Nome: ${record.clienteFornecedor}
CPF/CNPJ: ${record.cpfCnpj}
Veículo: ${record.veiculo || 'N/A'}
Telefone: ${record.telefone || 'N/A'}

## Dívida
Valor: R$ ${Number(record.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Vencimento: ${record.vencimento}
Status: ${record.status}
Dias em atraso: ${diasAtraso}
Data pagamento (se houve): ${record.dataPagamento || '-'}

## Acordos prévios
${acordosFmt}

## Conversas WhatsApp (mais recentes no fim)
${msgsFmt}

## Tarefa
Analise o caso e devolva o JSON pedido. Hoje é ${todayStr}.`;

        let raw = '';
        let modelUsed = 'Claude Sonnet';
        let usage: any = undefined;
        try {
            const completion = await anthropic.messages.create({
                model: AI_MODELS.CLAUDE_SONNET,
                max_tokens: 600,
                system: [
                    {
                        type: 'text',
                        text: SYSTEM_PROMPT,
                        cache_control: { type: 'ephemeral' },
                    },
                ],
                messages: [{ role: 'user', content: userPrompt }],
            });
            raw = completion.content[0]?.type === 'text' ? completion.content[0].text : '';
            usage = completion.usage;
        } catch (anthropicError: any) {
            console.warn('[ai-analyze] Erro no Anthropic, tentando fallback para Gemini 2.5 Flash:', anthropicError.message);
            modelUsed = 'Gemini 2.5 Flash';
            try {
                const model = genAI.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    generationConfig: { responseMimeType: 'application/json' }
                });
                const prompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;
                const response = await model.generateContent(prompt);
                raw = response.response.text();
            } catch (geminiError: any) {
                console.warn('[ai-analyze] Erro no Gemini, tentando fallback secundário para OpenAI:', geminiError.message);
                modelUsed = 'OpenAI GPT-4o-mini';
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system' as const, content: SYSTEM_PROMPT },
                        { role: 'user' as const, content: userPrompt }
                    ],
                    response_format: { type: 'json_object' },
                });
                raw = completion.choices[0]?.message?.content || '';
                usage = completion.usage;
            }
        }

        let parsed: any;
        try {
            // Remove eventuais ```json wrappers
            const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
            parsed = JSON.parse(clean);
        } catch {
            return NextResponse.json({
                error: 'IA devolveu resposta inválida',
                raw,
            }, { status: 502 });
        }

        // Salva no cache
        await admin.from('billing_ai_analysis').upsert({
            record_id: recordId,
            risk_score: parsed.risk_score ?? null,
            classification: parsed.classification ?? null,
            next_action: parsed.next_action ?? null,
            next_action_at: parsed.next_action_at ?? null,
            summary: parsed.summary ?? null,
            model: modelUsed,
            analyzed_at: new Date().toISOString(),
        });

        return NextResponse.json({
            ok: true,
            analysis: parsed,
            cached: false,
            usage: usage,
        });
    } catch (e: any) {
        console.error('[ai-analyze] erro:', e);
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}

// GET /api/billing/ai-analyze?recordId=xxx → lê do cache
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const recordId = searchParams.get('recordId');
        if (!recordId) return NextResponse.json({ error: 'recordId obrigatório' }, { status: 400 });

        const admin = createClient();
        const { data } = await admin
            .from('billing_ai_analysis')
            .select('*')
            .eq('record_id', recordId)
            .maybeSingle();

        if (!data) return NextResponse.json({ analysis: null });
        return NextResponse.json({ analysis: data, cached: true });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}
