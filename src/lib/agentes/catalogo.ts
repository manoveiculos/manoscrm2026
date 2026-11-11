// src/lib/agentes/catalogo.ts — QUEM SÃO OS AGENTES DA CENTRAL (/agentes)
//
// Catálogo em código (não precisa de tabela). Cada agente diz de onde vem o
// estado dele; a função estadoDosAgentes() só usa registros reais dessas
// fontes — nada é simulado.

export type Arco = 'atendimento' | 'marketing' | 'direcao';

export type FonteAgente =
    | 'laura'          // wa_ia_execucoes (Laura no CRM) + wa_mensagens autor=laura (Laura do n8n)
    | 'distribuidor'   // lead_distribuicao (roleta)
    | 'reengajamento'  // historico_followup + follow_ups ai_auto
    | 'supervisor'     // cron_heartbeats (sla-watcher, faxina, resumo) + sla_escalations + alertas de lead quente
    | 'copiloto'       // ai_last_run_at dos leads (análise da conversa / próximo passo)
    | 'consultor'      // consultant_active_chats, wa_mensagens autor=vendedor, interações no CRM, atendimentos
    | 'marketing';     // marketing_agent_runs do squad

export interface AgenteCatalogo {
    id: string;
    nome: string;
    arco: Arco;
    /** O que ele faz, em uma linha (aparece na gaveta). */
    funcao: string;
    /** Nome do ícone lucide-react (resolvido na tela). */
    icone: string;
    fonte: FonteAgente;
    /** É IA (obedece ao interruptor geral "IA ligada/desligada"). */
    ia: boolean;
    /** marketing_agent_runs.squad */
    squad?: string;
    /** Primeiro nome em consultants_manos_crm (sem acento, minúsculo). */
    consultor?: string;
}

export const ARCOS: { id: Arco; nome: string }[] = [
    { id: 'atendimento', nome: 'Atendimento' },
    { id: 'marketing', nome: 'Marketing' },
    { id: 'direcao', nome: 'Direção' },
];

export const AGENTES: AgenteCatalogo[] = [
    // ── Atendimento ────────────────────────────────────────────────────────
    { id: 'laura', nome: 'Laura', arco: 'atendimento', icone: 'Bot', fonte: 'laura', ia: true,
        funcao: 'Atende o WhatsApp da loja: qualifica e agenda (nunca fecha, avalia nem dá preço).' },
    { id: 'distribuidor', nome: 'Distribuidor', arco: 'atendimento', icone: 'Shuffle', fonte: 'distribuidor', ia: false,
        funcao: 'Roleta: entrega cada lead novo para um vendedor.' },
    { id: 'reengajamento', nome: 'Reengajamento', arco: 'atendimento', icone: 'RefreshCcw', fonte: 'reengajamento', ia: true,
        funcao: 'Retoma o contato com leads parados e perdidos recuperáveis.' },
    { id: 'supervisor', nome: 'Supervisor', arco: 'atendimento', icone: 'ShieldCheck', fonte: 'supervisor', ia: false,
        funcao: 'Vigia o SLA: lead quente sem resposta, leads parados, resumo da manhã.' },
    { id: 'copiloto', nome: 'Copiloto', arco: 'atendimento', icone: 'Sparkles', fonte: 'copiloto', ia: true,
        funcao: 'Lê a conversa e sugere o próximo passo para o vendedor.' },
    { id: 'consultor_wilson', nome: 'Wilson', arco: 'atendimento', icone: 'UserRound', fonte: 'consultor', ia: false, consultor: 'wilson',
        funcao: 'Consultor de vendas.' },
    { id: 'consultor_victor', nome: 'Victor', arco: 'atendimento', icone: 'UserRound', fonte: 'consultor', ia: false, consultor: 'victor',
        funcao: 'Consultor de vendas.' },
    { id: 'consultor_sergio', nome: 'Sérgio', arco: 'atendimento', icone: 'UserRound', fonte: 'consultor', ia: false, consultor: 'sergio',
        funcao: 'Consultor de vendas.' },

    // ── Marketing (marketing_agent_runs) ───────────────────────────────────
    { id: 'vitrine', nome: 'Vitrine', arco: 'marketing', icone: 'Images', fonte: 'marketing', ia: true, squad: 'vitrine',
        funcao: 'Monta os posts dos carros do estoque.' },
    { id: 'diretor_arte', nome: 'Diretor de Arte', arco: 'marketing', icone: 'Palette', fonte: 'marketing', ia: true, squad: 'diretor_arte',
        funcao: 'Revisa e corrige as artes antes de publicar.' },
    { id: 'publisher', nome: 'Publisher', arco: 'marketing', icone: 'Send', fonte: 'marketing', ia: true, squad: 'publisher',
        funcao: 'Agenda e publica nas redes.' },
    { id: 'trafego', nome: 'Tráfego', arco: 'marketing', icone: 'TrendingUp', fonte: 'marketing', ia: true, squad: 'trafego',
        funcao: 'Acompanha as campanhas pagas e propõe ajustes (com aprovação).' },
    { id: 'sentinela', nome: 'Sentinela', arco: 'marketing', icone: 'Radar', fonte: 'marketing', ia: true, squad: 'sentinela',
        funcao: 'Vigia preços do mercado e a saúde dos outros squads.' },
    { id: 'perito', nome: 'Perito', arco: 'marketing', icone: 'ScanSearch', fonte: 'marketing', ia: true, squad: 'perito',
        funcao: 'Analisa os carros e propõe ações (com aprovação).' },
    { id: 'recepcao', nome: 'Recepção', arco: 'marketing', icone: 'ClipboardList', fonte: 'marketing', ia: true, squad: 'recepcao',
        funcao: 'Fichas e números de entrada de leads (o que chegou, quem voltou).' },

    // ── Direção ────────────────────────────────────────────────────────────
    { id: 'growth', nome: 'Growth Intelligence', arco: 'direcao', icone: 'BrainCircuit', fonte: 'marketing', ia: true, squad: 'growth',
        funcao: 'Lê os números da loja e recomenda as próximas jogadas.' },
];

export const agentePorId = (id: string) => AGENTES.find(a => a.id === id) || null;
export const agentePorSquad = (squad: string) => AGENTES.find(a => a.squad === squad) || null;

/** Interruptor geral do maestro (linha especial em agentes_config). */
export const ID_IA_GERAL = 'ia_geral';
