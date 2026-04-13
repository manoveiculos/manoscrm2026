import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { LeadCompra } from '../types/compra';

export const compraService = {
    async getLeads(supabase?: SupabaseClient) {
        const client = supabase || defaultSupabase;
        const { data, error } = await client
            .from('leads_compra')
            .select('*')
            .order('criado_em', { ascending: false });
        
        if (error) {
            console.error('Erro ao buscar leads de compra:', error);
            return [];
        }
        return data as LeadCompra[];
    },

    async updateStatus(leadId: string, status: string, supabase?: SupabaseClient) {
        const client = supabase || defaultSupabase;
        const { error } = await client
            .from('leads_compra')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', leadId);
        
        if (error) throw error;
        return true;
    },

    async deleteLead(leadId: string, supabase?: SupabaseClient) {
        const client = supabase || defaultSupabase;
        const { error } = await client
            .from('leads_compra')
            .delete()
            .eq('id', leadId);
        
        if (error) throw error;
        return true;
    }
};
