/**
 * Diagnóstico de erro do Time de Marketing: transforma a mensagem crua de uma rotina
 * em "o que aconteceu, onde bloqueou e o que fazer". Função pura: roda no servidor e no navegador.
 */

export type TipoBloqueio =
    | 'limite_semanal' | 'permissao' | 'n8n' | 'metricool' | 'cota' | 'webmotors'
    | 'rede' | 'credencial' | 'supabase' | 'outro';

export interface Diagnostico {
    tipo: TipoBloqueio;
    /** O que aconteceu, em uma frase. */
    causa: string;
    /** Em que ponto do caminho bloqueou. */
    onde: string;
    /** O que fazer para destravar. */
    acao: string;
}

const REGRAS: Array<{ re: RegExp; d: Diagnostico }> = [
    {
        re: /weekly limit|usage[_ ]limit|limite semanal|limit reached/i,
        d: { tipo: 'limite_semanal', causa: 'O limite semanal de uso da conta foi atingido.', onde: 'Plataforma das rotinas na nuvem, antes de a rotina começar', acao: 'Esperar o limite renovar (o horário vem na mensagem) ou reduzir o consumo: menos rotinas e modelo menor nas simples.' },
    },
    {
        re: /undermining oversight|permission.*denied|denied by the .*classifier|auto mode/i,
        d: { tipo: 'permissao', causa: 'A gravação foi negada pelo bloqueio automático de permissão da rotina.', onde: 'Rotina → gravação no Supabase', acao: 'Gravar o veredito por outro caminho (painel do CRM com a sua decisão) ou liberar a escrita dessa rotina de forma controlada.' },
    },
    {
        re: /n8n|workflow execution failed/i,
        d: { tipo: 'n8n', causa: 'O workflow do n8n falhou.', onde: 'Tratamento de foto (n8n)', acao: 'O n8n saiu do fluxo: o tratamento de foto agora usa o Higgsfield (precisa das chaves HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET).' },
    },
    {
        re: /metricool/i,
        d: { tipo: 'metricool', causa: 'Falha ao falar com o Metricool.', onde: 'Publisher → Metricool → Instagram', acao: 'Abrir o Metricool, conferir se o Instagram @manoveiculoss está conectado e se o post está na fila.' },
    },
    {
        re: /cota|quota|adspirer/i,
        d: { tipo: 'cota', causa: 'A cota do conector de anúncios (Adspirer) esgotou.', onde: 'Vigilante Google Ads → Adspirer', acao: 'Esperar a cota renovar ou reconectar a conta em adspirer.ai/connections.' },
    },
    {
        re: /webmotors|coleta/i,
        d: { tipo: 'webmotors', causa: 'A coleta de preços no Webmotors falhou.', onde: 'Radar de Preços → Webmotors', acao: 'O site pode ter bloqueado a leitura ou mudado a página. Conferir manualmente e ajustar a coleta.' },
    },
    {
        re: /rede|network|econn|fetch failed|timeout|timed out|bloqueia manoscrm/i,
        d: { tipo: 'rede', causa: 'Falha de rede ou tempo esgotado.', onde: 'Rotina na nuvem → serviço externo', acao: 'Tentar de novo. Se repetir, a política de rede da nuvem pode estar bloqueando esse endereço.' },
    },
    {
        re: /\b401\b|unauthori[sz]ed|credencial|invalid.*(key|token)|authentication/i,
        d: { tipo: 'credencial', causa: 'A credencial foi recusada.', onde: 'Chamada autenticada a um serviço externo', acao: 'Conferir a chave no .env / na Vercel e gerar outra se preciso.' },
    },
    {
        re: /supabase|postgres|sql|row-level|rls/i,
        d: { tipo: 'supabase', causa: 'Erro ao ler ou gravar no banco.', onde: 'Rotina → Supabase', acao: 'Ver o erro completo no histórico do squad.' },
    },
];

export function diagnosticarErro(mensagem: string | null | undefined, bloqueioConhecido?: string | null): Diagnostico {
    const texto = mensagem || '';
    for (const r of REGRAS) if (r.re.test(texto)) return r.d;
    if (bloqueioConhecido) {
        const porTipo = REGRAS.find((r) => r.d.tipo === bloqueioConhecido);
        if (porTipo) return porTipo.d;
    }
    return {
        tipo: 'outro',
        causa: texto ? 'Erro não classificado.' : 'A última execução terminou com erro, sem mensagem registrada.',
        onde: 'Não identificado',
        acao: 'Abrir o histórico do squad e ler a execução com erro.',
    };
}
