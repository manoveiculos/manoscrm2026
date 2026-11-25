// src/lib/avisos/compradorRodada.ts — cliente que quer VENDER o carro dele vai direto ao Felipe Ledra (SÓ SERVIDOR)
//
// Pedido do Alexandre (25/11/2026): quando o sistema identifica cliente que quer vender veículo para a loja
// (categoria 'vendedor_de_carro' do Classificador), depois que a Laura recolheu as informações do carro,
// o lead NÃO entra na fila dos vendedores do pátio: vai direto ao Felipe Ledra (o comprador da loja) e só ele é avisado.
// Sem Felipe disponível (inativo, sem WhatsApp confirmado), devolve false e o lead segue o fluxo normal da fila.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fonteDoUid, TABELA_CRM } from '@/lib/whatsapp/ia/fonteLead';
import { enviarAvisoVendedor } from './webhookVendedor';
import { escolherComprador, textoCompra } from './comprador';

/**
 * Entrega o lead ao Felipe: dono na tabela do lead, linha na roleta como 'distribuido' e aviso só para ele.
 * Devolve true se encaminhou (o chamador NÃO deve colocar o lead na fila dos vendedores).
 */
export async function encaminharParaComprador(
    supabase: SupabaseClient, leadUid: string, info: { nome?: string | null; carro?: string | null; resumo?: string | null; agora?: Date } = {},
): Promise<boolean> {
    const agora = info.agora ?? new Date();
    const { data } = await supabase.from('consultants_manos_crm').select('id, name, phone, phone_verified_at, is_active');
    const felipe = escolherComprador((data || []).map(c => ({
        id: c.id as string, name: String(c.name || ''), phone: (c.phone as string | null) ?? null,
        ativo: c.is_active !== false, phoneVerificado: Boolean(c.phone_verified_at),
    })));
    if (!felipe) { console.warn('[comprador] Felipe indisponível: lead segue para a fila normal', leadUid); return false; }

    const f = fonteDoUid(leadUid);
    if (!f) return false;
    if (f.tabela === TABELA_CRM) {
        await supabase.from(TABELA_CRM).update({ assigned_consultant_id: felipe.id, vendedor: felipe.name }).eq('id', f.id);
    }
    const { data: lib } = await supabase.from('lead_distribuicao').update({
        status: 'distribuido', assigned_consultant_id: felipe.id, distribuido_em: agora.toISOString(), atualizado_em: agora.toISOString(),
    }).eq('lead_uid', leadUid).in('status', ['triagem_laura', 'fila_espera', 'aguardando', 'standby']).select('lead_uid');
    if (!lib?.length) return false;   // outra rodada já tratou
    await supabase.from('consultants_manos_crm').update({ last_lead_assigned_at: agora.toISOString() }).eq('id', felipe.id);

    const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://manoscrm.com.br').replace(/\/$/, '');
    await enviarAvisoVendedor({
        nome: felipe.name, telefone: felipe.phone, tipo: 'lead_compra', consultorId: felipe.id, leadRef: leadUid, origem: 'compradorRodada',
        mensagem: textoCompra({ cliente: info.nome ?? null, carro: info.carro ?? null, resumo: info.resumo ?? null, link: `${base}/lead/${encodeURIComponent(leadUid)}` }),
        meta: { categoria: 'vendedor_de_carro' },
    });
    return true;
}
