// src/lib/whatsapp/ia/fonteLead.ts — de onde vem o lead que a Laura está triando (Google/WhatsApp ou Facebook)
//
// A triagem nasceu só com a tabela do CRM (leads_distribuicao_crm_26, id numérico). O Facebook (Lead Ads) cai em
// outra tabela, leadsfacebook (id uuid, colunas com outros nomes). Aqui fica a diferença: quem lê/grava o lead pelo
// uid não precisa saber em que tabela ele está.

import type { SupabaseClient } from '@supabase/supabase-js';

export const TABELA_CRM = 'leads_distribuicao_crm_26';
export const TABELA_FACEBOOK = 'leadsfacebook';

export type TabelaTriagem = typeof TABELA_CRM | typeof TABELA_FACEBOOK;

export interface FonteLead { tabela: TabelaTriagem; id: string | number }

/** "leads_distribuicao_crm_26:4182" ou "leadsfacebook:<uuid>" → tabela e id. Outra coisa → null. */
export function fonteDoUid(uid: string | null | undefined): FonteLead | null {
    const s = uid || '';
    const i = s.indexOf(':');
    if (i <= 0) return null;
    const tabela = s.slice(0, i), resto = s.slice(i + 1);
    if (tabela === TABELA_CRM) { const n = parseInt(resto, 10); return Number.isFinite(n) ? { tabela, id: n } : null; }
    if (tabela === TABELA_FACEBOOK && /^[0-9a-f-]{36}$/i.test(resto)) return { tabela, id: resto };
    return null;
}

export interface LeadDaTriagem {
    nome: string | null;
    telefone: string | null;
    /** Texto bruto do interesse (o chamador decide se é útil). */
    interesse: string | null;
    cidade: string | null;
    /** "google", "whatsapp", "facebook"… em minúsculas. */
    origem: string;
}

/** Facebook: o formulário guarda o NOME DA CAMPANHA como interesse quando o cliente não escreveu nenhum — isso não é carro. */
export function interesseDoFacebook(vehicleInterest: string | null | undefined, source: string | null | undefined): string | null {
    const v = (vehicleInterest || '').trim();
    if (!v || v.toLowerCase() === (source || '').trim().toLowerCase()) return null;
    return v;
}

export async function lerLeadDaTriagem(supabase: SupabaseClient, uid: string): Promise<LeadDaTriagem | null> {
    const f = fonteDoUid(uid);
    if (!f) return null;
    if (f.tabela === TABELA_CRM) {
        const { data: l } = await supabase.from(TABELA_CRM).select('nome, telefone, interesse, vehicle_interest, cidade, origem').eq('id', f.id).maybeSingle();
        if (!l) return null;
        return {
            nome: (l.nome as string | null) ?? null, telefone: (l.telefone as string | null) ?? null,
            interesse: ((l.vehicle_interest as string | null) || (l.interesse as string | null)) ?? null,
            cidade: (l.cidade as string | null) ?? null, origem: String((l.origem as string | null) || '').toLowerCase(),
        };
    }
    const { data: l } = await supabase.from(TABELA_FACEBOOK).select('nome, phone, vehicle_interest, cidade, source').eq('id', f.id).maybeSingle();
    if (!l) return null;
    return {
        nome: (l.nome as string | null) ?? null, telefone: (l.phone as string | null) ?? null,
        interesse: interesseDoFacebook(l.vehicle_interest as string | null, l.source as string | null),
        cidade: (l.cidade as string | null) ?? null, origem: 'facebook',
    };
}

/** Resumo da passagem no topo da ficha do lead (CRM: handoff_summary; Facebook: observações). */
export async function gravarResumoNoLead(supabase: SupabaseClient, uid: string, resumo: string, agora: Date): Promise<void> {
    const f = fonteDoUid(uid);
    if (!f) return;
    if (f.tabela === TABELA_CRM) {
        const { data: l } = await supabase.from(TABELA_CRM).select('handoff_summary').eq('id', f.id).maybeSingle();
        const antes = (l?.handoff_summary as string | null) || '';
        await supabase.from(TABELA_CRM).update({ handoff_summary: `${resumo}${antes ? `\n\n${antes}` : ''}`.slice(0, 2000), handoff_at: agora.toISOString() }).eq('id', f.id);
        return;
    }
    const { data: l } = await supabase.from(TABELA_FACEBOOK).select('observacoes').eq('id', f.id).maybeSingle();
    const antes = (l?.observacoes as string | null) || '';
    await supabase.from(TABELA_FACEBOOK).update({ observacoes: `${resumo}${antes ? `\n\n${antes}` : ''}`.slice(0, 2500) }).eq('id', f.id);
}

/** Arquiva o lead (reversível: aba Arquivadas). */
export async function arquivarLeadDaTriagem(supabase: SupabaseClient, uid: string, motivo: string, agora: Date): Promise<void> {
    const f = fonteDoUid(uid);
    if (!f) return;
    await supabase.from(f.tabela).update({ archived_at: agora.toISOString(), archived_reason: motivo.slice(0, 120) }).eq('id', f.id).is('archived_at', null);
}
