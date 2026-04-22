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

    async updateLead(leadId: string, updates: Partial<LeadCompra>, supabase?: SupabaseClient) {
        const client = supabase || defaultSupabase;
        const { data, error } = await client
            .from('leads_compra')
            .update({ 
                ...updates, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', leadId)
            .select()
            .single();
        
        if (error) throw error;
        return data as LeadCompra;
    },

    async addInteraction(leadId: string, notes: string, consultantId?: string, supabase?: SupabaseClient) {
        const client = supabase || defaultSupabase;
        const { error } = await client
            .from('interactions_manos_crm')
            .insert({
                lead_id: leadId,
                notes,
                type: 'atendimento_compra',
                consultant_id: consultantId,
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
        return true;
    },

    async getInteractions(leadId: string, supabase?: SupabaseClient) {
        const client = supabase || defaultSupabase;
        const { data, error } = await client
            .from('interactions_manos_crm')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Erro ao buscar interações:', error);
            return [];
        }
        return data;
    },

    async deleteLead(leadId: string, supabase?: SupabaseClient) {
        const client = supabase || defaultSupabase;
        const { error } = await client
            .from('leads_compra')
            .delete()
            .eq('id', leadId);
        
        if (error) throw error;
        return true;
    },

    async uploadPhoto(file: File) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `photos/${fileName}`;

        const { error: uploadError } = await defaultSupabase.storage
            .from('leads_compra_fotos')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = defaultSupabase.storage
            .from('leads_compra_fotos')
            .getPublicUrl(filePath);

        return publicUrl;
    }
};
