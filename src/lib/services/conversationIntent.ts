/**
 * Detecção semântica de desfecho/desistência ANTES de qualquer disparo da IA.
 *
 * Roda 100% em regex no histórico já recebido (sem custo de API).
 * Foco em pt-BR e gírias regionais que vendedores Manos veem todo dia.
 *
 * Por que regex e não LLM? Porque queremos:
 *   - Determinístico (mesma frase → mesma decisão)
 *   - Zero latência adicional ao cron de reversão
 *   - Auditável (vendedor consegue ver o trigger que disparou)
 *
 * Se no futuro precisar de nuance maior (ironia, sarcasmo), trocar por
 * GPT-4o-mini com prompt curto — interface fica a mesma.
 */
export type ClosingIntent =
    | 'comprou_outro'        // "já comprei", "fechei com outro"
    | 'sem_interesse'        // "não tenho mais interesse", "desisti"
    | 'pediu_pra_parar'      // "para de mandar msg", "tira meu número"
    | 'reclamacao_spam'      // "spam", "abuso", "denunciar"
    | null;
export interface IntentResult {
    intent: ClosingIntent;
    matchedText: string;     // trecho que disparou (pra log/audit)
    fromMessage: string;     // texto inteiro da msg do cliente
    fromDate: string | null; // created_at da msg que disparou
}
export interface IntentMessage {
    direction: 'inbound' | 'outbound' | string | null;
    message_text: string | null;
    created_at: string | null;
}

// Padrões ordenados por prioridade — primeiro hit ganha.
// Cada padrão é tolerante a acentos/cedilha/maiúsculas.
const PATTERNS: Array<{ intent: ClosingIntent; rx: RegExp; sample: string }> = [
    // comprou_outro — cliente já fechou negócio em outro lugar
    { intent: 'comprou_outro', sample: 'já comprei',
      rx: /\b(j[aá]\s+(comprei|fechei|peguei|adquiri|levei|escolhi|paguei|consegui))\b/i },
    { intent: 'comprou_outro', sample: 'comprei um carro',
      rx: /\b(comprei|fechei|peguei|adquiri)\s+(um|outro|o)\s+(carro|veiculo|veículo|ve[ií]culo|auto)\b/i },
    { intent: 'comprou_outro', sample: 'já estou com outro',
      rx: /\b(j[aá]\s+(estou|tou|to|t[oô])\s+com\s+(outro|um\s+(novo|outro)))\b/i },
    { intent: 'comprou_outro', sample: 'fechei com outra concessionária',
      rx: /\b(fechei|comprei)\s+(com|n[ao]|em)\s+(outr[ao]|outra)\b/i },
    { intent: 'comprou_outro', sample: 'já estou rodando',
      rx: /\b(j[aá]\s+(estou|to|tou)\s+rodando|rodando\s+(com\s+)?(o\s+)?novo)\b/i },

    // sem_interesse — desistência sem compra explícita
    { intent: 'sem_interesse', sample: 'não tenho mais interesse',
      rx: /\bn[aã]o\s+(tenho|tem|tinha)\s+(mais\s+)?interesse\b/i },
    { intent: 'sem_interesse', sample: 'desisti',
      rx: /\b(desisti|desisto|n[aã]o\s+(quero|vou|pretendo)\s+(mais\s+)?(comprar|trocar))\b/i },
    { intent: 'sem_interesse', sample: 'mudei de ideia',
      rx: /\bmudei\s+(de\s+)?(ide[ií]a|opini[aã]o|plano)\b/i },

    // pediu_pra_parar — opt-out explícito
    { intent: 'pediu_pra_parar', sample: 'para de mandar mensagem',
      rx: /\b(par[ae]|pode\s+parar)\s+(de\s+)?(mandar|enviar|me\s+mandar)\b/i },
    { intent: 'pediu_pra_parar', sample: 'tira meu número',
      rx: /\b(tir[ae]|retir[ae]|remov[ae]|exclu[ai]|apaga|delet[ae])\s+(meu\s+)?(numero|n[uú]mero|contato|cadastro)\b/i },
    { intent: 'pediu_pra_parar', sample: 'não me liga mais',
      rx: /\bn[aã]o\s+me\s+(liga|chama|manda|encha|incomoda)\s+mais\b/i },
    { intent: 'pediu_pra_parar', sample: 'me deixa em paz',
      rx: /\bme\s+deix[ae]\s+(em\s+)?paz\b/i },

    // reclamacao_spam — denúncia de spam
    { intent: 'reclamacao_spam', sample: 'spam',
      rx: /\b(spam|abuso|den[uú]ncia|procon|whats(app)?\s+(bloque[ae]|abusivo))\b/i },
];

/**
 * Analisa o histórico cronológico (qualquer ordem) e devolve a INTENÇÃO da
 * última mensagem do CLIENTE que casou com algum padrão de desfecho.
 *
 * Considera só mensagens inbound (do cliente) com texto não-vazio.
 * Janela: últimos 30 dias. Pega a mais recente que bater em algum padrão.
 */
export function detectClosingIntent(messages: IntentMessage[]): IntentResult {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    // Filtra inbound + texto + dentro da janela. Mais recente primeiro.
    const inbound = (messages || [])
        .filter(m => m && m.direction === 'inbound' && typeof m.message_text === 'string' && m.message_text.trim().length > 0)
        .filter(m => {
            if (!m.created_at) return true;
            const t = new Date(m.created_at).getTime();
            return isNaN(t) || t >= cutoff;
        })
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    for (const msg of inbound) {
        const text = String(msg.message_text || '').trim();
        for (const p of PATTERNS) {
            const m = text.match(p.rx);
            if (m) {
                return {
                    intent: p.intent,
                    matchedText: m[0],
                    fromMessage: text,
                    fromDate: msg.created_at || null,
                };
            }
        }
    }

    return { intent: null, matchedText: '', fromMessage: '', fromDate: null };
}

/**
 * Mensagens de encerramento educado por tipo de intenção.
 * Sempre começam pelo primeiro nome do cliente (callback do agente).
 */
export function closingMessageFor(intent: NonNullable<ClosingIntent>, firstName: string): string {
    const nome = firstName?.trim() || 'amigo';
    switch (intent) {
        case 'comprou_outro':
            return `Perfeito, ${nome}! Parabéns pela conquista do carro novo 🚗 Se um dia precisar de troca, revisão ou avaliação do usado, é só me chamar. Boa estrada!`;
        case 'sem_interesse':
            return `Tudo certo, ${nome}. Vou encerrar por aqui sem enviar mais mensagens. Se mudar de ideia ou quiser dar uma olhada no estoque, só me chamar.`;
        case 'pediu_pra_parar':
            return `Entendido, ${nome}. Já tirei seu contato do envio automático. Desculpa pelo incômodo — qualquer coisa, é só me mandar mensagem.`;
        case 'reclamacao_spam':
            return `Desculpa pelo transtorno, ${nome}. Já bloqueei envios automáticos pra esse número. Pode ficar tranquilo.`;
    }
}

/**
 * Motivo estruturado a gravar no lead pra alimentar dashboards.
 */
export function lossReasonFor(intent: NonNullable<ClosingIntent>): string {
    switch (intent) {
        case 'comprou_outro':   return 'comprou_em_outro_lugar';
        case 'sem_interesse':   return 'sem_interesse';
        case 'pediu_pra_parar': return 'pediu_pra_parar';
        case 'reclamacao_spam': return 'reclamacao_spam';
    }
}
