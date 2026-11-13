// src/lib/agentes/acessos.ts — ACESSO REAL DOS VENDEDORES AO CRM (PURO)
//
// Só usa registros reais: login/logout/renovação de sessão (Supabase Auth), batimentos de
// presença (acessos_presenca) e ações gravadas pelo CRM. Nunca estima: sem batimento, o tempo
// online é "não consta" (null) e a tela diz isso.

const MIN = 60_000;
/** Dois batimentos com mais de 3 min entre si quebram o bloco de presença (batida a cada ~60 s). */
export const LACUNA_PRESENCA_MS = 3 * MIN;
/** Cada batimento vale ~1 min de presença. */
export const PASSO_PRESENCA_MS = MIN;
/** Sem batimento há mais que isso = não está online agora. */
export const ONLINE_ATE_MS = 2.5 * MIN;
/** Ausência a destacar (entre dois sinais do mesmo dia): 90 min. */
export const AUSENCIA_LONGA_MS = 90 * MIN;

export type SinalTipo = 'login' | 'logout' | 'renovou' | 'batimento' | 'navegacao' | 'acao';
export interface Sinal { em: string; tipo: SinalTipo; texto?: string }

export interface BlocoPresenca { inicio: string; fim: string; minutos: number }

/** Agrupa batimentos (ISO) em blocos de presença contínua. */
export function blocosDePresenca(batimentos: string[]): BlocoPresenca[] {
    const ts = batimentos.map(b => new Date(b).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
    const blocos: BlocoPresenca[] = [];
    let ini: number | null = null;
    let ult = 0;
    const fecha = () => {
        if (ini == null) return;
        blocos.push({ inicio: new Date(ini).toISOString(), fim: new Date(ult + PASSO_PRESENCA_MS).toISOString(), minutos: Math.round((ult - ini + PASSO_PRESENCA_MS) / MIN) });
    };
    for (const t of ts) {
        if (ini != null && t - ult > LACUNA_PRESENCA_MS) { fecha(); ini = null; }
        if (ini == null) ini = t;
        ult = t;
    }
    fecha();
    return blocos;
}

/** Dia (AAAA-MM-DD) no horário de Brasília. */
export function diaBRT(iso: string | number): string {
    const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
    return d.toISOString().slice(0, 10);
}

export interface DiaAcesso {
    dia: string;
    /** Primeiro login do dia (ou, sem login, o 1º sinal de qualquer fonte). */
    entrou: string | null;
    /** Último logout do dia (ou, sem logout, o último sinal de qualquer fonte). */
    saiu: string | null;
    logins: number;
    logouts: number;
    /** Minutos com o CRM aberto e visível (a partir dos batimentos). null = não consta (sem batimento). */
    minutosOnline: number | null;
    blocos: BlocoPresenca[];
    acoes: number;
    /** Intervalos sem nenhum sinal dentro do dia (>= 90 min). */
    ausencias: { de: string; ate: string; minutos: number }[];
}

export interface ResumoAcesso {
    ultimoSinalEm: string | null;
    online: boolean;
    /** ms desde o último sinal (null = nunca). */
    semAcessarMs: number | null;
    ultimoLoginEm: string | null;
    dias: DiaAcesso[];
    minutosSemana: number | null;
    /** Desde quando há batimento (tempo online só vale a partir daqui). */
    batimentoDesde: string | null;
}

export function resumirAcesso(sinais: Sinal[], agora: number, dias: number): ResumoAcesso {
    const ord = [...sinais].filter(s => Number.isFinite(new Date(s.em).getTime())).sort((a, b) => a.em.localeCompare(b.em));
    const batimentos = ord.filter(s => s.tipo === 'batimento').map(s => s.em);
    const ultimo = ord.length ? ord[ord.length - 1] : null;
    const ultimoBat = batimentos.length ? new Date(batimentos[batimentos.length - 1]).getTime() : null;
    const ultimoLogin = [...ord].reverse().find(s => s.tipo === 'login') || null;

    const porDia = new Map<string, Sinal[]>();
    for (const s of ord) {
        const d = diaBRT(s.em);
        if (!porDia.has(d)) porDia.set(d, []);
        porDia.get(d)!.push(s);
    }
    const hoje = diaBRT(agora);
    const lista: string[] = [];
    for (let i = 0; i < dias; i++) lista.push(diaBRT(new Date(`${hoje}T12:00:00-03:00`).getTime() - i * 86_400_000));

    const resultado: DiaAcesso[] = lista.map(dia => {
        const ss = porDia.get(dia) || [];
        const bats = ss.filter(s => s.tipo === 'batimento').map(s => s.em);
        const blocos = blocosDePresenca(bats);
        const ausencias: DiaAcesso['ausencias'] = [];
        for (let i = 1; i < ss.length; i++) {
            const gap = new Date(ss[i].em).getTime() - new Date(ss[i - 1].em).getTime();
            if (gap >= AUSENCIA_LONGA_MS) ausencias.push({ de: ss[i - 1].em, ate: ss[i].em, minutos: Math.round(gap / MIN) });
        }
        const primeiroLogin = ss.find(s => s.tipo === 'login');
        const ultimoLogout = [...ss].reverse().find(s => s.tipo === 'logout');
        return {
            dia,
            entrou: primeiroLogin?.em ?? ss[0]?.em ?? null,
            saiu: ultimoLogout?.em ?? (ss.length ? ss[ss.length - 1].em : null),
            logins: ss.filter(s => s.tipo === 'login').length,
            logouts: ss.filter(s => s.tipo === 'logout').length,
            minutosOnline: bats.length ? blocos.reduce((t, b) => t + b.minutos, 0) : null,
            blocos,
            acoes: ss.filter(s => s.tipo === 'acao').length,
            ausencias,
        };
    });

    const comBat = resultado.filter(d => d.minutosOnline != null);
    return {
        ultimoSinalEm: ultimo?.em ?? null,
        online: ultimoBat != null && agora - ultimoBat <= ONLINE_ATE_MS,
        semAcessarMs: ultimo ? Math.max(0, agora - new Date(ultimo.em).getTime()) : null,
        ultimoLoginEm: ultimoLogin?.em ?? null,
        dias: resultado,
        minutosSemana: comBat.length ? comBat.slice(0, 7).reduce((t, d) => t + (d.minutosOnline || 0), 0) : null,
        batimentoDesde: batimentos[0] ?? null,
    };
}

/** "2 h 15 min" / "45 min" / "3 dias". */
export function duracaoTexto(ms: number): string {
    const min = Math.round(ms / MIN);
    if (min < 1) return 'menos de 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
    const d = Math.floor(h / 24);
    return d === 1 ? '1 dia' : `${d} dias`;
}

/** Rota -> frase curta, sem dado de cliente. */
export function fraseDaRota(rota: string | null | undefined): string {
    const r = String(rota || '').split('?')[0];
    const mapa: [RegExp, string][] = [
        [/^\/fila/, 'abriu a Minha Fila'], [/^\/conversas/, 'abriu as Conversas'], [/^\/lead\//, 'abriu um lead'],
        [/^\/pipeline/, 'abriu o Pipeline'], [/^\/agenda/, 'abriu a Agenda'], [/^\/leads/, 'abriu a lista de Leads'],
        [/^\/inbox/, 'abriu o Inbox'], [/^\/atendimento/, 'abriu o Atendimento'], [/^\/precificar/, 'abriu o Precificar'],
        [/^\/compras/, 'abriu Compras'], [/^\/estoque/, 'abriu o Estoque'], [/^\/$/, 'abriu o painel inicial'],
    ];
    for (const [re, t] of mapa) if (re.test(r)) return t;
    return `abriu ${r || 'uma tela'}`;
}
