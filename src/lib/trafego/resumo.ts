// src/lib/trafego/resumo.ts — agrega os eventos do site novo (trafego_eventos) para a aba "Tráfego Pago".
// Funções puras: sem banco, sem rede. O site grava; o CRM só lê.

export interface EventoTrafego {
    id: string;
    created_at: string;
    visitor_id: string;
    origem_macro: string | null;
    sub_origem: string | null;
    campanha_id: string | null;
    utm_campaign: string | null;
    acao: string;
    veiculo_id: string | null;
    veiculo_nome: string | null;
    valor_veiculo: number | null;
    dispositivo_detalhe: string | null;
    cidade: string | null;
    uf: string | null;
    tempo_segundos: number | null;
    fotos_vistas: number | null;
    abriu_galeria: boolean | null;
}

export interface VisitanteTrafego {
    visitor_id: string;
    nome: string | null;
    telefone: string | null;
    crm_lead_id: string | null;
    crm_status: string | null;
}

export type Temperatura = 'frio' | 'morno' | 'quente' | 'muito_quente';
export const TEMPERATURA_ROTULO: Record<Temperatura, string> = { frio: 'Frio', morno: 'Morno', quente: 'Quente', muito_quente: 'Muito quente' };

/** Ações de contato: quem clica em WhatsApp/telefone ou vira lead já é "muito quente". */
const ACOES_CONTATO = /whatsapp|telefone|phone|lead|financ|simula|proposta|venda/i;

export function temperaturaDoVisitante(eventos: Pick<EventoTrafego, 'acao' | 'veiculo_id' | 'veiculo_nome' | 'tempo_segundos' | 'fotos_vistas' | 'abriu_galeria'>[]): Temperatura {
    if (eventos.some(e => ACOES_CONTATO.test(e.acao))) return 'muito_quente';
    const porCarro = new Map<string, { views: number; tempo: number }>();
    for (const e of eventos) {
        const k = e.veiculo_id || e.veiculo_nome;
        if (!k) continue;
        const c = porCarro.get(k) || { views: 0, tempo: 0 };
        if (e.acao === 'view_vehicle') c.views += 1;
        c.tempo += Number(e.tempo_segundos) || 0;
        porCarro.set(k, c);
    }
    const maiorTempo = Math.max(0, ...[...porCarro.values()].map(c => c.tempo));
    const voltou = [...porCarro.values()].some(c => c.views >= 2);
    const galeria = eventos.some(e => e.abriu_galeria) || Math.max(0, ...eventos.map(e => Number(e.fotos_vistas) || 0)) >= 5;
    if (maiorTempo >= 120 || (voltou && maiorTempo >= 45)) return 'quente';
    if (maiorTempo >= 20 || voltou || galeria || porCarro.size >= 3) return 'morno';
    return 'frio';
}

const PESO: Record<Temperatura, number> = { frio: 0, morno: 1, quente: 2, muito_quente: 3 };

export interface LinhaCampanha {
    chave: string;                 // campanha_id, ou utm_campaign, ou "sem-campanha"
    nome: string;                  // nome real (cache da Meta) ou o que houver
    origem: string;                // facebook_ads | google_ads | openai_ads | organico
    visitantes: number;
    eventos: number;
    quentes: number;               // quente + muito_quente
    identificados: number;         // viraram lead com nome/telefone
    noCrm: number;                 // já têm lead no CRM
    tempoMedioSeg: number;         // tempo ativo médio por visitante
    ultimoEm: string | null;
    topCarros: { nome: string; visitantes: number }[];
    topCidades: { nome: string; visitantes: number }[];
}

export interface ResumoTrafego {
    totais: { visitantes: number; eventos: number; quentes: number; identificados: number; noCrm: number };
    porOrigem: { origem: string; visitantes: number }[];
    campanhas: LinhaCampanha[];
    carros: { nome: string; visitantes: number; tempoMedioSeg: number; valor: number | null }[];
    visitantesQuentes: {
        visitorId: string; nome: string | null; telefone: string | null; temperatura: Temperatura;
        campanha: string; cidade: string | null; aparelho: string | null; carro: string | null;
        tempoSeg: number; ultimoEm: string; crmLeadId: string | null; crmStatus: string | null;
    }[];
}

const top = (m: Map<string, Set<string>>, n: number) =>
    [...m.entries()].map(([nome, v]) => ({ nome, visitantes: v.size })).sort((a, b) => b.visitantes - a.visitantes).slice(0, n);

/**
 * @param nomesCampanha mapa object_id → nome real (trafego_meta_cache)
 */
export function resumirTrafego(
    eventos: EventoTrafego[],
    visitantes: VisitanteTrafego[],
    nomesCampanha: Record<string, string> = {},
): ResumoTrafego {
    const idPorVisitante = new Map(visitantes.map(v => [v.visitor_id, v]));
    const porVisitante = new Map<string, EventoTrafego[]>();
    for (const e of eventos) {
        const l = porVisitante.get(e.visitor_id);
        if (l) l.push(e); else porVisitante.set(e.visitor_id, [e]);
    }

    interface Acc { nome: string; origem: string; vis: Set<string>; eventos: number; quentes: Set<string>; ident: Set<string>; crm: Set<string>; tempo: number; ultimo: string | null; carros: Map<string, Set<string>>; cidades: Map<string, Set<string>> }
    const camp = new Map<string, Acc>();
    const carrosGlobal = new Map<string, { vis: Set<string>; tempo: number; valor: number | null }>();
    const origens = new Map<string, Set<string>>();
    const quentesLista: ResumoTrafego['visitantesQuentes'] = [];
    let totQuentes = 0, totIdent = 0, totCrm = 0;

    for (const [vid, evs] of porVisitante) {
        evs.sort((a, b) => a.created_at.localeCompare(b.created_at));
        const temp = temperaturaDoVisitante(evs);
        const quente = PESO[temp] >= 2;
        const ident = idPorVisitante.get(vid);
        const identificado = Boolean(ident?.nome || ident?.telefone);
        const noCrm = Boolean(ident?.crm_lead_id);
        const primeiraCamp = evs.find(e => e.campanha_id || e.utm_campaign) || evs[0];
        const chave = primeiraCamp.campanha_id || primeiraCamp.utm_campaign || 'sem-campanha';
        const origem = primeiraCamp.origem_macro || 'organico';
        const tempoTotal = evs.reduce((s, e) => s + (Number(e.tempo_segundos) || 0), 0);
        const ultimo = evs[evs.length - 1];

        if (quente) totQuentes++;
        if (identificado) totIdent++;
        if (noCrm) totCrm++;
        (origens.get(origem) || origens.set(origem, new Set()).get(origem)!).add(vid);

        const a = camp.get(chave) || {
            nome: nomesCampanha[chave] || (chave === 'sem-campanha' ? 'Sem campanha (orgânico/direto)' : primeiraCamp.utm_campaign || `Campanha ${chave}`),
            origem, vis: new Set(), eventos: 0, quentes: new Set(), ident: new Set(), crm: new Set(), tempo: 0, ultimo: null,
            carros: new Map(), cidades: new Map(),
        };
        a.vis.add(vid); a.eventos += evs.length; a.tempo += tempoTotal;
        if (quente) a.quentes.add(vid);
        if (identificado) a.ident.add(vid);
        if (noCrm) a.crm.add(vid);
        if (!a.ultimo || ultimo.created_at > a.ultimo) a.ultimo = ultimo.created_at;
        camp.set(chave, a);

        const carrosDoVisitante = new Map<string, number>();
        for (const e of evs) {
            if (e.cidade) (a.cidades.get(e.cidade) || a.cidades.set(e.cidade, new Set()).get(e.cidade)!).add(vid);
            const nomeCarro = e.veiculo_nome;
            if (!nomeCarro) continue;
            (a.carros.get(nomeCarro) || a.carros.set(nomeCarro, new Set()).get(nomeCarro)!).add(vid);
            const g = carrosGlobal.get(nomeCarro) || { vis: new Set<string>(), tempo: 0, valor: null };
            g.vis.add(vid); g.tempo += Number(e.tempo_segundos) || 0;
            if (e.valor_veiculo) g.valor = Number(e.valor_veiculo);
            carrosGlobal.set(nomeCarro, g);
            carrosDoVisitante.set(nomeCarro, (carrosDoVisitante.get(nomeCarro) || 0) + (Number(e.tempo_segundos) || 0));
        }

        if (quente) {
            const carroTop = [...carrosDoVisitante.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
            quentesLista.push({
                visitorId: vid, nome: ident?.nome ?? null, telefone: ident?.telefone ?? null, temperatura: temp,
                campanha: a.nome, cidade: ultimo.cidade ? `${ultimo.cidade}${ultimo.uf ? ` - ${ultimo.uf}` : ''}` : null,
                aparelho: ultimo.dispositivo_detalhe, carro: carroTop, tempoSeg: tempoTotal, ultimoEm: ultimo.created_at,
                crmLeadId: ident?.crm_lead_id ?? null, crmStatus: ident?.crm_status ?? null,
            });
        }
    }

    const campanhas: LinhaCampanha[] = [...camp.entries()].map(([chave, a]) => ({
        chave, nome: a.nome, origem: a.origem, visitantes: a.vis.size, eventos: a.eventos, quentes: a.quentes.size,
        identificados: a.ident.size, noCrm: a.crm.size, tempoMedioSeg: Math.round(a.tempo / Math.max(1, a.vis.size)),
        ultimoEm: a.ultimo, topCarros: top(a.carros, 3), topCidades: top(a.cidades, 3),
    })).sort((x, y) => y.quentes - x.quentes || y.visitantes - x.visitantes);

    return {
        totais: { visitantes: porVisitante.size, eventos: eventos.length, quentes: totQuentes, identificados: totIdent, noCrm: totCrm },
        porOrigem: [...origens.entries()].map(([origem, v]) => ({ origem, visitantes: v.size })).sort((a, b) => b.visitantes - a.visitantes),
        campanhas,
        carros: [...carrosGlobal.entries()].map(([nome, g]) => ({ nome, visitantes: g.vis.size, tempoMedioSeg: Math.round(g.tempo / Math.max(1, g.vis.size)), valor: g.valor }))
            .sort((a, b) => b.visitantes - a.visitantes).slice(0, 15),
        visitantesQuentes: quentesLista.sort((a, b) => PESO[b.temperatura] - PESO[a.temperatura] || b.ultimoEm.localeCompare(a.ultimoEm)).slice(0, 30),
    };
}

export const ORIGEM_ROTULO: Record<string, string> = {
    facebook_ads: 'Instagram / Facebook Ads', google_ads: 'Google Ads', openai_ads: 'ChatGPT Ads', organico: 'Orgânico / direto',
};
