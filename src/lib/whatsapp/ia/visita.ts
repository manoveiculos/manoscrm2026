// src/lib/whatsapp/ia/visita.ts — visita marcada pela Laura → Agenda (PURO, testado)
//
// Bug de 18/11/2026: em 8 dias a Laura confirmou 11 visitas e NENHUMA chegou à Agenda. O insert não
// mandava `tipo` (obrigatório: 'loja' | 'externa'), falhava e o erro era engolido. Aqui ficam as regras:
// montar a linha certa, decidir entre criar / manter / mover (nunca duplicar) e escrever o aviso ao
// consultor. A gravação em si fica em visitaRodada.ts.

export const STATUS_ATIVOS = ['agendado', 'confirmado'] as const;

/** Tolerância para considerar "o mesmo horário" (ms). */
const MESMO_HORARIO_MS = 60_000;

export interface ConversaDaVisita {
    lead_uid: string | null;
    telefone_key: string | null;
    nome_cliente: string | null;
    nome_contato: string | null;
}

export interface LinhaVisita {
    vendedor_id: string;
    lead_uid: string | null;
    cliente_nome: string;
    cliente_telefone: string | null;
    cliente_whatsapp: string | null;
    veiculo_interesse: string | null;
    tipo: 'loja';
    data_hora: string;
    status: 'agendado';
    observacoes: string;
}

/** "47997676966" → "5547997676966" (as visitas antigas da Agenda guardam com o 55). */
export function telefoneComDdi(t: string | null | undefined): string | null {
    const d = (t || '').replace(/\D/g, '');
    if (!d) return null;
    return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}

export function montarLinhaVisita(p: {
    iso: string;
    conversa: ConversaDaVisita;
    nomeNaFicha?: string | null;
    carroInteresse?: string | null;
    vendedorAuthId: string;
    /** O lead ainda não tinha consultor: a visita fica com a gerência até alguém assumir. */
    semConsultor?: boolean;
}): LinhaVisita {
    const fone = telefoneComDdi(p.conversa.telefone_key);
    const nome = (p.nomeNaFicha || p.conversa.nome_cliente || p.conversa.nome_contato || '').trim() || 'Cliente do WhatsApp';
    return {
        vendedor_id: p.vendedorAuthId,
        lead_uid: p.conversa.lead_uid,
        cliente_nome: nome.slice(0, 80),
        cliente_telefone: fone,
        cliente_whatsapp: fone,
        veiculo_interesse: (p.carroInteresse || '').trim().slice(0, 120) || null,
        tipo: 'loja',
        data_hora: p.iso,
        status: 'agendado',
        observacoes: p.semConsultor
            ? 'Agendado pela Laura (WhatsApp). Cliente ainda sem consultor: assuma esta visita.'
            : 'Agendado pela Laura (WhatsApp)',
    };
}

export interface VisitaExistente { id: string; data_hora: string; status: string }

export type DecisaoVisita =
    | { acao: 'criar' }
    | { acao: 'manter'; id: string }
    | { acao: 'mover'; id: string; de: string };

/**
 * O cliente tem no máximo UMA visita ativa. Já existe uma futura no mesmo horário → mantém;
 * em outro horário → move a mesma linha (não duplica); nenhuma → cria.
 */
export function decidirVisita(existentes: VisitaExistente[], iso: string, agora: Date): DecisaoVisita {
    const alvo = new Date(iso).getTime();
    const ativas = existentes
        .filter(v => (STATUS_ATIVOS as readonly string[]).includes(v.status) && new Date(v.data_hora).getTime() > agora.getTime())
        .sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
    if (!ativas.length) return { acao: 'criar' };
    const igual = ativas.find(v => Math.abs(new Date(v.data_hora).getTime() - alvo) < MESMO_HORARIO_MS);
    if (igual) return { acao: 'manter', id: igual.id };
    return { acao: 'mover', id: ativas[0].id, de: ativas[0].data_hora };
}

const FUSO = 'America/Sao_Paulo';

/** "hoje às 14h", "amanhã às 10h", "sex, 20/11 às 10h30" (horário de Brasília). */
export function quandoPorExtenso(iso: string, agora: Date): string {
    const d = new Date(iso);
    const dia = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
    const dif = Math.round((Date.parse(dia(d)) - Date.parse(dia(agora))) / 86_400_000);
    const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const hora = hm.endsWith(':00') ? `${parseInt(hm, 10)}h` : `${parseInt(hm, 10)}h${hm.slice(3)}`;
    if (dif === 0) return `hoje às ${hora}`;
    if (dif === 1) return `amanhã às ${hora}`;
    const dm = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit' }).format(d).replace('.', '');
    return `${dm} às ${hora}`;
}

export interface AvisoVisita { titulo: string; corpo: string }

/** Texto do push ao consultor. Sem telefone do cliente (tela bloqueada). */
export function avisoDeVisita(p: {
    acao: 'criar' | 'mover';
    quando: string;
    quandoAntes?: string | null;
    cliente: string;
    carro?: string | null;
    semConsultor?: boolean;
}): AvisoVisita {
    const carro = p.carro ? ` · ${p.carro}` : '';
    if (p.acao === 'mover') {
        return {
            titulo: `Visita remarcada: ${p.quando}`,
            corpo: `${p.cliente}${carro}. Era ${p.quandoAntes || 'outro horário'}.`.slice(0, 140),
        };
    }
    return {
        titulo: `Visita marcada: ${p.quando}`,
        corpo: `${p.cliente}${carro}${p.semConsultor ? '. Sem consultor ainda: assuma.' : '. Já está na sua Agenda.'}`.slice(0, 140),
    };
}
