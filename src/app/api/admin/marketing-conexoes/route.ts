import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '../../marketing/_guard';
import { verificarLogins, type Reconectar, type ResultadoLogin } from '@/lib/conexoes/login';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/admin/marketing-conexoes
 * Checagem AO VIVO das conexões que o Time de Marketing usa, com o erro detalhado.
 * Não gasta crédito: só leituras gratuitas (Higgsfield só confere se as chaves existem).
 */

type Status = 'ok' | 'erro' | 'atencao' | 'nao_configurado';
interface Check { id: string; nome: string; status: Status; detalhe: string; acao?: string; latencia_ms?: number; reconectar?: Reconectar }

const ALTIMUS_URL = process.env.ALTIMUS_XML_URL || 'https://estoque.altimus.com.br/api/estoquexml?estoque=997c9e91-40d7-4bec-95cb-68e18a2668a3';
const TEMPO = 8000;

async function comTempo<T>(fn: () => Promise<T>): Promise<{ r?: T; erro?: string; ms: number }> {
    const t0 = Date.now();
    try { return { r: await fn(), ms: Date.now() - t0 }; }
    catch (e) { return { erro: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 }; }
}

async function checarSupabase(): Promise<Check> {
    const { r, erro, ms } = await comTempo(async () => {
        const { error, count } = await createAdminClient().from('marketing_agent_runs').select('id', { count: 'exact', head: true });
        if (error) throw new Error(error.message);
        return count ?? 0;
    });
    return erro
        ? { id: 'supabase', nome: 'Banco de dados (Supabase)', status: 'erro', detalhe: erro, acao: 'Conferir se o projeto está ativo e a chave de serviço da Vercel.', latencia_ms: ms }
        : { id: 'supabase', nome: 'Banco de dados (Supabase)', status: 'ok', detalhe: `Respondeu em ${ms} ms (${r} execuções registradas).`, latencia_ms: ms };
}

async function checarAltimus(): Promise<Check> {
    const { r, erro, ms } = await comTempo(async () => {
        const res = await fetch(ALTIMUS_URL, { signal: AbortSignal.timeout(TEMPO) });
        if (!res.ok) throw new Error(`Feed respondeu HTTP ${res.status}`);
        const xml = await res.text();
        return { carros: (xml.match(/<veiculo\b/gi) || []).length, fotos: (xml.match(/<imagem\b/gi) || []).length };
    });
    if (erro || !r) return { id: 'altimus', nome: 'Estoque (feed da Altimus)', status: 'erro', detalhe: erro || 'sem resposta', acao: 'Sem o feed não há carro nem foto para os vídeos. Conferir o endereço do feed.', latencia_ms: ms };
    if (r.carros < 25) return { id: 'altimus', nome: 'Estoque (feed da Altimus)', status: 'atencao', detalhe: `Só ${r.carros} carros no feed (esperado 30+): leitura possivelmente incompleta.`, latencia_ms: ms };
    return { id: 'altimus', nome: 'Estoque (feed da Altimus)', status: 'ok', detalhe: `${r.carros} carros e ${r.fotos} fotos, em ${ms} ms.`, latencia_ms: ms };
}

async function checarAnthropic(): Promise<Check> {
    const chave = process.env.ANTHROPIC_API_KEY?.trim();
    if (!chave) return { id: 'anthropic', nome: 'Claude (Anthropic)', status: 'nao_configurado', detalhe: 'ANTHROPIC_API_KEY não está nas variáveis do CRM.', acao: 'Sem ela, os agentes de roteiro e revisão não funcionam.' };
    const { r, erro, ms } = await comTempo(async () => fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(TEMPO),
    }));
    if (erro || !r) return { id: 'anthropic', nome: 'Claude (Anthropic)', status: 'erro', detalhe: erro || 'sem resposta', latencia_ms: ms };
    if (r.status === 401 || r.status === 403) return { id: 'anthropic', nome: 'Claude (Anthropic)', status: 'erro', detalhe: `Chave recusada (HTTP ${r.status}).`, acao: 'Gerar outra chave no console da Anthropic e atualizar a variável.', latencia_ms: ms };
    if (r.status === 429) return { id: 'anthropic', nome: 'Claude (Anthropic)', status: 'atencao', detalhe: 'Limite de uso da API atingido no momento (HTTP 429).', latencia_ms: ms };
    return r.ok
        ? { id: 'anthropic', nome: 'Claude (Anthropic)', status: 'ok', detalhe: `Chave válida, respondeu em ${ms} ms.`, latencia_ms: ms }
        : { id: 'anthropic', nome: 'Claude (Anthropic)', status: 'atencao', detalhe: `Resposta inesperada (HTTP ${r.status}).`, latencia_ms: ms };
}

async function checarElevenLabs(): Promise<Check> {
    const chave = process.env.ELEVENLABS_API_KEY?.trim();
    if (!chave) return { id: 'elevenlabs', nome: 'Voz (ElevenLabs)', status: 'nao_configurado', detalhe: 'ELEVENLABS_API_KEY não está nas variáveis do CRM.', acao: 'Sem ela não há locução nos vídeos.' };
    const { r, erro, ms } = await comTempo(async () => fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(TEMPO),
    }));
    if (erro || !r) return { id: 'elevenlabs', nome: 'Voz (ElevenLabs)', status: 'erro', detalhe: erro || 'sem resposta', latencia_ms: ms };
    if (r.ok) {
        const j = await r.json().catch(() => ({})) as { character_count?: number; character_limit?: number };
        const restante = (j.character_limit ?? 0) - (j.character_count ?? 0);
        return restante > 0 && restante < 5000
            ? { id: 'elevenlabs', nome: 'Voz (ElevenLabs)', status: 'atencao', detalhe: `Restam só ${restante.toLocaleString('pt-BR')} caracteres no plano.`, acao: 'Aumentar o plano ou esperar renovar.', latencia_ms: ms }
            : { id: 'elevenlabs', nome: 'Voz (ElevenLabs)', status: 'ok', detalhe: j.character_limit ? `${restante.toLocaleString('pt-BR')} caracteres restantes.` : 'Chave válida.', latencia_ms: ms };
    }
    if (r.status === 401) {
        const txt = await r.text().catch(() => '');
        return /permission/i.test(txt)
            ? { id: 'elevenlabs', nome: 'Voz (ElevenLabs)', status: 'atencao', detalhe: 'Chave válida, mas sem permissão para ler o saldo da conta. A geração de voz pode funcionar.', acao: 'Para ver o saldo aqui, dar a permissão de leitura de usuário à chave.', latencia_ms: ms }
            : { id: 'elevenlabs', nome: 'Voz (ElevenLabs)', status: 'erro', detalhe: 'Chave recusada (HTTP 401).', acao: 'Gerar outra chave e atualizar a variável.', latencia_ms: ms };
    }
    return { id: 'elevenlabs', nome: 'Voz (ElevenLabs)', status: 'atencao', detalhe: `Resposta inesperada (HTTP ${r.status}).`, latencia_ms: ms };
}

function checarHiggsfield(): Check {
    const ok = !!process.env.HIGGSFIELD_API_KEY?.trim() && !!process.env.HIGGSFIELD_API_SECRET?.trim();
    return ok
        ? { id: 'higgsfield', nome: 'Imagem e vídeo (Higgsfield)', status: 'ok', detalhe: 'Chaves presentes. Não testado ao vivo para não gastar crédito.' }
        : { id: 'higgsfield', nome: 'Imagem e vídeo (Higgsfield)', status: 'nao_configurado', detalhe: 'Faltam HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET nas variáveis do CRM.', acao: 'Sem elas o botão "Tratar foto" não funciona.' };
}

async function checarRegistradas(): Promise<Check[]> {
    const { data } = await createAdminClient().from('marketing_integrations').select('*');
    return (data || []).map((ig): Check => {
        const dias = Math.floor((Date.now() - new Date(ig.checked_at).getTime()) / 86_400_000);
        const nome = ig.provider === 'metricool' ? 'Metricool e Instagram @manoveiculoss' : ig.provider === 'google_ads' ? 'Google Ads' : String(ig.provider);
        if (ig.status !== 'connected') return { id: ig.id, nome, status: 'erro', detalhe: String(ig.details?.erro || `Status: ${ig.status}`), acao: 'Reconectar e rodar a verificação de novo.' };
        if (dias > 7) return { id: ig.id, nome, status: 'atencao', detalhe: `Última verificação há ${dias} dias: o status pode estar desatualizado.` };
        return { id: ig.id, nome, status: 'ok', detalhe: `Verificado há ${dias} dia(s).` };
    });
}

/** Login do Meta e do Google: "caiu" vira erro com o botão Reconectar. */
function deLogin(r: ResultadoLogin): Check {
    const status: Status = r.estado === 'caiu' ? 'erro' : r.estado;
    return {
        id: r.id, nome: r.nome, status, detalhe: r.motivo, reconectar: r.reconectar,
        acao: r.estado === 'caiu' ? 'Sem esse login o agente de Tráfego fica cego e as campanhas ficam sem vigia.' : undefined,
    };
}

export async function GET() {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.res;

    const [supabase, altimus, anthropic, eleven, registradas, logins] = await Promise.all([
        checarSupabase(), checarAltimus(), checarAnthropic(), checarElevenLabs(), checarRegistradas().catch(() => [] as Check[]),
        verificarLogins().catch(() => [] as ResultadoLogin[]),
    ]);
    const checks: Check[] = [...logins.map(deLogin), supabase, altimus, anthropic, eleven, checarHiggsfield(), ...registradas];
    return NextResponse.json({ checks, gerado_em: new Date().toISOString() });
}
