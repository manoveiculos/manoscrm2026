import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { anthropic, AI_MODELS } from '@/lib/aiProviders';
import { requireAdmin } from '../_guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'marketing-squad-uploads';
const VITRINE_WEBHOOK = process.env.N8N_VITRINE_TRATA_FOTO_WEBHOOK_URL || 'https://n8n.drivvoo.com/webhook/vitrine-trata-foto';

const PERITO_SYSTEM_PROMPT = `Você é o Perito, agente de aquisição da Manos Veículos (Rio do Sul/SC). Analisa laudo de
vistoria cautelar (PDF, foto ou texto) de veículo usado e devolve apontamentos + proposta
de compra pronta pro WhatsApp.

REGRAS DE RESPOSTA:
- Resposta MUITO curta — só o que tem apontamento.
- Se não houver observação em um item, não fale nada sobre ele.
- Nunca devolva o laudo inteiro.
- Nunca suponha ou estime — use "não consta" quando a informação não estiver no laudo.
- Sempre separe estrutural × estético.
- Se houver repintura: diga qual peça.
- Se houver reparo: diga qual peça + qual reparo.
- Sinalize presença de massa e indício de leilão.

PINTURA:
- Cite peça + classificação: verde = original, amarelo = repintura, vermelho = repintura com massa/reparo.
- Se não houver medição em µm, escreva "µm não consta".
- Avise quando o laudo marcar só no diagrama sem nomear a peça.

AVISOS OBRIGATÓRIOS:
- Avise quando o laudo não tiver módulo de estrutura ou de espessura de pintura (item não verificado).
- No final, sempre informe se houve colisão/batida e o nível da batida.
- Alienação fiduciária nas restrições de base nacional NÃO é apontamento — é normal persistir
  no laudo mesmo com o veículo já quitado. Não inclua em "Outros apontamentos" nem trate como pendência.

PROPOSTA DE COMPRA (obrigatória em toda análise):
- Se a FIPE ou o valor pedido não foram informados na mensagem do usuário, NÃO calcule a
  proposta — em vez disso, devolva só os apontamentos do laudo e peça objetivamente a FIPE
  e o valor pedido antes de montar a proposta.
- Abatimento considera: pneus, rodas, peças com avaria, repintura, débitos em aberto, número
  de proprietários e KM.
- Proposta sempre em R$ — nunca em porcentagem.
- Sempre cite a FIPE e a marca/modelo/ano do veículo no bloco de proposta.
- Se o veículo for 2026/2027, considere que o valor do 0km e promoções de fábrica devem ser
  checados à parte — avise isso na justificativa se for o caso.
- IPVA: sempre siga o que está na descrição/anúncio do veículo (se informado), nunca o que
  consta no laudo.

NOTA DE COMPRA: encerre toda análise com uma nota de 0 a 10.

FORMATO DE SAÍDA (fixo, pronto pro WhatsApp, responda só isso, sem preâmbulo nem markdown extra):

[Modelo/Ano – Placa – KM]

🔩 Estrutural
[apontamentos ou omita a seção se não houver]

🎨 Repintura
[peça + classificação ou omita a seção]

🔧 Reparo/troca
[peça + reparo ou omita a seção]

⚠ Outros apontamentos
[se houver]

💥 BATIDA: [sim/não] + nível + 1 linha

⭐ NOTA: X/10 — [1 linha]

💰 PROPOSTA
Abrir em: R$ [valor]
Teto: R$ [valor]
FIPE: R$ [valor] — [marca/modelo/ano]
Justificativa: [curta]

[texto pronto pra mandar na concessionária]

Nunca feche, avalie publicamente ou negocie por WhatsApp automatizado — você só entrega a
proposta pronta; quem manda é a pessoa.`;

function extToMediaType(name: string): string {
    const ext = name.toLowerCase().split('.').pop() || '';
    const map: Record<string, string> = {
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        webp: 'image/webp', heic: 'image/heic',
    };
    return map[ext] || 'application/octet-stream';
}

function extractNumber(text: string, re: RegExp): number | null {
    const m = text.match(re);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
}

async function runPerito(admin: ReturnType<typeof createAdminClient>, body: any) {
    const { storagePath, fipe, valorPedido, notas } = body;
    if (!storagePath) throw new Error('storagePath obrigatório');

    const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
    if (dlErr || !fileBlob) throw new Error(dlErr?.message || 'falha ao baixar o arquivo enviado');

    const mediaType = fileBlob.type || extToMediaType(storagePath);
    const buf = Buffer.from(await fileBlob.arrayBuffer());
    const base64 = buf.toString('base64');

    const contextLines: string[] = [];
    if (fipe) contextLines.push(`FIPE informada: R$ ${fipe}`);
    if (valorPedido) contextLines.push(`Valor pedido pelo vendedor: R$ ${valorPedido}`);
    if (notas) contextLines.push(`Observações do avaliador: ${notas}`);
    const userText = contextLines.length > 0
        ? contextLines.join('\n')
        : 'FIPE e valor pedido não informados — se precisar deles pra montar a proposta, peça antes de calcular.';

    const fileBlock: any = mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const response = await anthropic.messages.create({
        model: AI_MODELS.CLAUDE_SONNET,
        max_tokens: 1500,
        system: PERITO_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: userText }] }],
    });

    const block = response.content[0];
    const resultText = block && block.type === 'text' ? block.text : '';

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 30);

    const notaCompra = extractNumber(resultText, /NOTA:\s*(\d+(?:[.,]\d+)?)\s*\/\s*10/i);
    const valorAbrir = extractNumber(resultText, /Abrir em:\s*R\$\s*([\d.,]+)/i);
    const valorTeto = extractNumber(resultText, /Teto:\s*R\$\s*([\d.,]+)/i);
    const fipeExtraida = fipe ? Number(fipe) : extractNumber(resultText, /FIPE:\s*R\$\s*([\d.,]+)/i);
    const firstLine = (resultText.split('\n').find(l => l.trim().length > 0) || 'Laudo analisado').trim();
    const pendenteDado = /peça.*(FIPE|valor pedido)|não consegui montar a proposta|informe a FIPE/i.test(resultText);

    const { data: run, error: insErr } = await admin.from('marketing_agent_runs').insert({
        squad: 'perito',
        skill_name: 'laudo-relampago',
        run_type: 'laudo_proposta',
        status: pendenteDado ? 'error' : 'pending_approval',
        title: firstLine.replace(/[\[\]]/g, '').slice(0, 200),
        summary: resultText,
        input_ref: signed?.signedUrl || null,
        metrics: {
            ...(notaCompra !== null ? { nota_compra: notaCompra } : {}),
            ...(valorAbrir !== null ? { valor_proposta: valorAbrir } : {}),
            ...(valorTeto !== null ? { valor_proposta_teto: valorTeto } : {}),
            ...(fipeExtraida !== null ? { fipe: fipeExtraida } : {}),
        },
        requires_approval: !pendenteDado,
        error_message: pendenteDado ? 'Faltou FIPE/valor pedido — laudo lido, proposta não calculada.' : null,
        source: 'crm_execute',
    }).select('id').single();
    if (insErr) throw new Error(insErr.message);

    return { resultText, runId: run.id, pendenteDado };
}

async function runVitrine(admin: ReturnType<typeof createAdminClient>, body: any) {
    const { storagePath, instrucao } = body;
    if (!storagePath) throw new Error('storagePath obrigatório');

    const { data: signedIn, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 600);
    if (signErr || !signedIn) throw new Error(signErr?.message || 'falha ao gerar URL do arquivo enviado');

    const finalInstrucao = instrucao?.trim() ||
        'Uniformize o fundo e a iluminacao da foto, mantendo o carro real exatamente como esta, sem adicionar nem remover nada do veiculo.';

    const n8nRes = await fetch(VITRINE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: signedIn.signedUrl, instrucao: finalInstrucao }),
    });
    const rawText = await n8nRes.text();
    let n8nJson: any = null;
    try { n8nJson = JSON.parse(rawText); } catch { /* corpo não-JSON, tratado abaixo */ }
    // n8n às vezes devolve o item cru ({...}), às vezes envolto em array ([{...}])
    // dependendo de como o node "Respond to Webhook" serializa — aceita os dois.
    const item = Array.isArray(n8nJson) ? n8nJson[0] : n8nJson;
    const fotoBase64: string | undefined = item?.foto_tratada_base64 || item?.data?.foto_tratada_base64;

    if (!n8nRes.ok || !fotoBase64) {
        const errMsg = item?.message
            || (rawText ? `n8n (${n8nRes.status}): ${rawText.slice(0, 300)}` : `webhook n8n respondeu ${n8nRes.status} sem corpo`);
        await admin.from('marketing_agent_runs').insert({
            squad: 'vitrine', skill_name: 'vitrine-trata-foto', run_type: 'tratamento_foto',
            status: 'error', title: 'Falha ao tratar foto', error_message: errMsg,
            input_ref: signedIn.signedUrl, source: 'crm_execute',
        });
        throw new Error(errMsg);
    }

    const outBuf = Buffer.from(fotoBase64, 'base64');
    const outPath = storagePath.replace(/^vitrine\//, 'vitrine/outputs/').replace(/(\.[a-zA-Z0-9]+)?$/, '-tratada.jpg');
    const { error: upErr } = await admin.storage.from(BUCKET).upload(outPath, outBuf, { contentType: 'image/jpeg', upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: signedOut } = await admin.storage.from(BUCKET).createSignedUrl(outPath, 60 * 60 * 24 * 30);

    const { data: run, error: insErr } = await admin.from('marketing_agent_runs').insert({
        squad: 'vitrine',
        skill_name: 'vitrine-trata-foto',
        run_type: 'tratamento_foto',
        status: 'success',
        title: 'Foto tratada — fundo e iluminação uniformizados',
        summary: finalInstrucao,
        input_ref: signedIn.signedUrl,
        output_ref: signedOut?.signedUrl || null,
        metrics: {},
        requires_approval: false,
        source: 'crm_execute',
    }).select('id').single();
    if (insErr) throw new Error(insErr.message);

    return { outputUrl: signedOut?.signedUrl || null, runId: run.id };
}

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.res;

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
    }

    const { squad, skill } = body || {};
    const admin = createAdminClient();

    try {
        if (squad === 'perito' && skill === 'laudo-relampago') {
            const result = await runPerito(admin, body);
            return NextResponse.json({ success: true, ...result });
        }
        if (squad === 'vitrine' && skill === 'vitrine-trata-foto') {
            const result = await runVitrine(admin, body);
            return NextResponse.json({ success: true, ...result });
        }
        return NextResponse.json({ success: false, error: 'squad/skill não suportado ainda por aqui' }, { status: 400 });
    } catch (e: any) {
        console.error('Erro em /api/marketing/execute:', e);
        return NextResponse.json({ success: false, error: e?.message || 'erro ao executar' }, { status: 500 });
    }
}
