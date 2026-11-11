// src/lib/whatsapp/passagens.ts — "passagens" do cliente pelo WhatsApp da loja (PURO)
//
// Passagem = um período de contato. Mensagens separadas por mais de 12 h de silêncio
// começam uma nova passagem. Para cada uma: quando foi, quem atendeu (Laura / consultor),
// o que o cliente disse primeiro e como terminou (cliente sem resposta da loja, loja sem
// resposta do cliente...). Lê só wa_mensagens: nada de n8n.

export interface MsgPassagem {
    autor: 'cliente' | 'laura' | 'vendedor' | string;
    tipo?: string | null;
    texto?: string | null;
    legenda?: string | null;
    transcricao?: string | null;
    criadaEm: string;
    apagadaEm?: string | null;
}

export type FimPassagem =
    | 'cliente_sem_resposta'   // o cliente falou por último e a loja não respondeu
    | 'loja_sem_resposta';     // a loja falou por último e o cliente não voltou

export interface Passagem {
    inicio: string;
    fim: string;
    mensagensCliente: number;
    mensagensLaura: number;
    mensagensVendedor: number;
    quemAtendeu: 'laura' | 'vendedor' | 'laura_e_vendedor' | 'ninguem';
    primeiraDoCliente: string | null;
    ultimaDoCliente: string | null;
    fimTipo: FimPassagem;
    /** Horas de silêncio do cliente até agora (só na passagem mais recente, quando a loja falou por último). */
    horasSemResposta: number | null;
}

export const SILENCIO_NOVA_PASSAGEM_H = 12;

const ROTULO_TIPO: Record<string, string> = { imagem: '📷 foto', audio: '🎤 áudio', video: '🎬 vídeo', documento: '📄 documento', sticker: 'figurinha', localizacao: '📍 localização', contato: 'contato' };

export function textoCurto(m: MsgPassagem, max = 140): string | null {
    const base = (m.transcricao || m.texto || m.legenda || '').replace(/\s+/g, ' ').trim()
        || (m.tipo ? ROTULO_TIPO[m.tipo] || null : null);
    if (!base) return null;
    return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}

export function montarPassagens(msgs: MsgPassagem[], agora: Date = new Date()): Passagem[] {
    const ordenadas = msgs
        .filter(m => !m.apagadaEm && m.autor !== 'sistema')
        .slice()
        .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    const grupos: MsgPassagem[][] = [];
    for (const m of ordenadas) {
        const atual = grupos[grupos.length - 1];
        const ult = atual?.[atual.length - 1];
        const gapH = ult ? (Date.parse(m.criadaEm) - Date.parse(ult.criadaEm)) / 3_600_000 : Infinity;
        if (!atual || gapH > SILENCIO_NOVA_PASSAGEM_H) grupos.push([m]);
        else atual.push(m);
    }
    const out = grupos.map((g, idx): Passagem => {
        const cli = g.filter(m => m.autor === 'cliente');
        const laura = g.filter(m => m.autor === 'laura').length;
        const vend = g.filter(m => m.autor === 'vendedor').length;
        const ult = g[g.length - 1];
        // quem falou por último: se foi o cliente, ele ficou sem resposta; se foi a loja, o cliente não voltou
        const fimTipo: FimPassagem = ult.autor === 'cliente' ? 'cliente_sem_resposta' : 'loja_sem_resposta';
        const ehUltimaPassagem = idx === grupos.length - 1;
        return {
            inicio: g[0].criadaEm,
            fim: ult.criadaEm,
            mensagensCliente: cli.length,
            mensagensLaura: laura,
            mensagensVendedor: vend,
            quemAtendeu: laura && vend ? 'laura_e_vendedor' : laura ? 'laura' : vend ? 'vendedor' : 'ninguem',
            primeiraDoCliente: cli.length ? textoCurto(cli[0]) : null,
            ultimaDoCliente: cli.length > 1 ? textoCurto(cli[cli.length - 1]) : null,
            fimTipo,
            horasSemResposta: ehUltimaPassagem && fimTipo === 'loja_sem_resposta'
                ? Math.max(0, Math.round((agora.getTime() - Date.parse(ult.criadaEm)) / 3_600_000))
                : null,
        };
    });
    return out.reverse(); // mais recente primeiro
}

/** Frase de uma linha para a lista: "Laura atendeu · 8 mensagens". */
export function resumoDaPassagem(p: Passagem): string {
    const quem = p.quemAtendeu === 'laura' ? 'Laura atendeu'
        : p.quemAtendeu === 'vendedor' ? 'Consultor atendeu'
        : p.quemAtendeu === 'laura_e_vendedor' ? 'Laura e consultor atenderam'
        : 'Sem resposta da loja';
    const n = p.mensagensCliente + p.mensagensLaura + p.mensagensVendedor;
    return `${quem} · ${n} mensagem${n === 1 ? '' : 'ns'}`;
}

export const ROTULO_FIM: Record<FimPassagem, string> = {
    cliente_sem_resposta: 'Cliente ficou sem resposta',
    loja_sem_resposta: 'Cliente não respondeu',
};
