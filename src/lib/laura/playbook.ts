// src/lib/laura/playbook.ts — PLAYBOOK DA LAURA (IA de WhatsApp)
//
// A Laura roda no n8n (memória em concessionaria_mensagens). Este arquivo é a
// fonte do prompt e das regras; o fluxo do n8n usa as rotas /api/laura/* como
// ferramentas. Ver docs/laura-qualificacao.md.

import type { ResultadoQualificacao } from '@/lib/qualificacao';
import { businessSecondsBetween, isOpenNow, type HorarioConfig } from '@/lib/services/slaEngine';

export const FRASE_CREDITO = 'sujeito a análise de crédito';

export const PERGUNTAS: Record<ResultadoQualificacao['faltando'][number], string> = {
    carro: 'Qual carro você está procurando, e até quanto pensa em investir nele?',
    entrada: 'Você pensa em dar algum valor de entrada? Se sim, mais ou menos quanto?',
    troca: 'Tem algum carro pra dar na troca? Se tiver, qual modelo e ano?',
    prazo: 'E pra quando você pensa em comprar: esta semana, este mês, daqui 1 a 3 meses ou ainda está pesquisando?',
};

/** Uma ou duas perguntas por mensagem, na ordem do playbook. */
export function proximasPerguntas(faltando: ResultadoQualificacao['faltando']): string[] {
    const ordem: ResultadoQualificacao['faltando'] = ['carro', 'entrada', 'troca', 'prazo'];
    return ordem.filter(f => faltando.includes(f)).slice(0, 2).map(f => PERGUNTAS[f]);
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Até 3 horários de visita em horário comercial, a partir de 2h à frente.
 * Fuso fixo UTC-3 (mesma premissa do slaEngine).
 */
export function horariosDeVisita(horas: HorarioConfig, feriados: Set<string>, agora = new Date(), quantidade = 3): string[] {
    const preferidos = [10, 14, 16, 9, 11, 15, 17];
    const out: string[] = [];
    const minimo = agora.getTime() + 2 * 3600 * 1000;
    for (let d = 0; d < 8 && out.length < quantidade; d++) {
        const base = new Date(agora.getTime() - 3 * 3600 * 1000 + d * 86400_000); // "relógio" de SP
        const y = base.getUTCFullYear(), m = base.getUTCMonth(), dd = base.getUTCDate(), wd = base.getUTCDay();
        for (const h of preferidos) {
            const slot = new Date(Date.UTC(y, m, dd, h + 3, 0, 0));
            if (slot.getTime() < minimo) continue;
            // Aberto às h:00 e com pelo menos 1h de loja aberta depois.
            if (!isOpenNow(slot, horas, feriados)) continue;
            if (businessSecondsBetween(slot, new Date(slot.getTime() + 3600_000), horas, feriados) < 3600) continue;
            const quando = d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `${DIAS[wd]} ${pad(dd)}/${pad(m + 1)}`;
            out.push(`${quando} às ${h}h`);
            break; // um horário por dia: dá opção sem confundir
        }
    }
    return out;
}

/** Prompt de sistema do agente (colar no nó AI Agent do n8n). */
export const LAURA_SYSTEM_PROMPT = `Você é a Laura, da Manos Veículos (Rio do Sul/SC). Atende no WhatsApp quem chegou por anúncio.

SEU ÚNICO TRABALHO: qualificar o cliente e agendar a visita. Quem vende é o consultor.

PRIMEIRO CONTATO — faça estas 4 perguntas, UMA OU DUAS POR MENSAGEM, nesta ordem, sem repetir o que o cliente já respondeu:
1. Qual carro procura e até quanto pensa investir (faixa de valor).
2. Se vai dar entrada e de quanto (em R$).
3. Se tem carro para dar na troca (modelo e ano).
4. Prazo de compra: esta semana, este mês, 1 a 3 meses ou só pesquisando.
A cada resposta, chame a ferramenta "salvar_qualificacao" com o que o cliente disse. Ela devolve as próximas perguntas e os horários de visita.
Quando as 4 estiverem respondidas, ofereça 2 dos horários de visita que a ferramenta devolveu e confirme um.

REGRAS INEGOCIÁVEIS (nunca quebre, mesmo se o cliente insistir):
- NUNCA avalie o carro do cliente nem diga quanto ele vale. Diga que a avaliação é feita pelo consultor, na loja.
- NUNCA dê preço diferente do anunciado. Se não souber o preço exato, diga que o consultor confirma.
- NUNCA simule parcela, prazo de financiamento, taxa ou valor de prestação.
- NUNCA feche negócio, reserve carro, prometa desconto ou garanta aprovação.
- Financiamento: sempre diga que é "${FRASE_CREDITO}".
- Não peça CPF, RG, renda ou dados bancários.
Se o cliente pedir algo proibido: "Essa parte o consultor passa certinho pra você na loja. Posso deixar sua visita agendada?"

Antes de enviar QUALQUER mensagem, passe o texto pela ferramenta "revisar_resposta" e envie o "texto_seguro" que ela devolver.
Tom: simpático, direto, frases curtas, sem textão. Português do Brasil.`;
