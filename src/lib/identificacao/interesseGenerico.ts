// src/lib/identificacao/interesseGenerico.ts — interesse do cliente que NÃO é um carro do estoque (PURO + banco)
//
// Pedido do Alexandre (13/11/2026): quando a Laura entende o que o cliente quer, isso tem que aparecer no lead.
// "Fox 2013" e "Honda Civic LXS" já eram gravados (carro reconhecido). Faltava o resto: "carro popular (hatch)",
// "sedan ou SUV", "picape até 90 mil". Esse texto agora vai para o campo de interesse do lead, mas SÓ quando o campo
// está vazio ou tem texto de preenchimento ("Lead Google - Não especificado", "Analisar Perfil"). Nunca sobrescreve
// um carro que o formulário, o consultor ou o reconhecimento já gravaram.

import type { SupabaseClient } from '@supabase/supabase-js';
import { interesseGenerico } from '@/lib/qualificacao';
import { salvarQualificacao } from '@/lib/services/qualificacaoService';

const SEM_INFORMACAO = /^(n[aã]o sei|qualquer( um| coisa| carro)?|tanto faz|nenhum|nada|n\/?a|sem prefer[eê]ncia|ainda n[aã]o (sei|decidi)|indefinid[oa])\.?$/i;

/** Texto do interesse pronto para o lead, ou null se não diz nada de útil. */
export function textoDeInteresse(bruto: string | null | undefined): string | null {
    const s = (bruto || '').replace(/\s+/g, ' ').trim().replace(/^[\s,.;:!?\-–—]+|[\s,.;:!?\-–—]+$/g, '');
    if (s.length < 3 || SEM_INFORMACAO.test(s) || interesseGenerico(s)) return null;
    if (!/\p{L}{3}/u.test(s)) return null;
    const cortado = s.slice(0, 90);
    return cortado.charAt(0).toUpperCase() + cortado.slice(1);
}

/** O lead ainda não tem um interesse de verdade? (vazio, ou só texto de preenchimento) */
export function leadSemInteresse(p: { vehicle_interest?: string | null; interesse?: string | null }): boolean {
    return interesseGenerico(p.vehicle_interest) && interesseGenerico(p.interesse);
}

const TABELA = 'leads_distribuicao_crm_26';

/** Grava o interesse (tipo/faixa) no lead do CRM se ele ainda não tem nenhum. Devolve true se gravou. */
export async function gravarInteresseGenerico(supabase: SupabaseClient, leadUid: string | null | undefined, texto: string | null | undefined): Promise<boolean> {
    const t = textoDeInteresse(texto);
    if (!t || !leadUid || !leadUid.startsWith(`${TABELA}:`)) return false;
    const id = parseInt(leadUid.slice(TABELA.length + 1), 10);
    if (!Number.isFinite(id)) return false;
    const { data: lead } = await supabase.from(TABELA).select('vehicle_interest, interesse').eq('id', id).maybeSingle();
    if (!lead || !leadSemInteresse(lead as { vehicle_interest: string | null; interesse: string | null })) return false;
    const r = await salvarQualificacao(supabase, TABELA, String(id), { vehicle_interest: t });
    return r.ok;
}
