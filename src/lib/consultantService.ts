import { supabase } from './supabase';
import { Consultant } from './types';

export const consultantService = {
    _client: null as any,

    setClient(client: any) {
        this._client = client;
    },

    getClient() {
        return this._client || supabase;
    },

    async getConsultants(): Promise<Consultant[]> {
        const { data, error } = await this.getClient()
            .from('consultants_manos_crm')
            .select('*')
            .order('name');
        
        if (error) throw error;
        return data as Consultant[];
    },

    async getConsultantByAuthId(authId: string): Promise<Consultant | null> {
        const { data, error } = await this.getClient()
            .from('consultants_manos_crm')
            .select('*')
            .eq('auth_id', authId)
            .maybeSingle();

        if (error) return null;
        return data as Consultant;
    }
};
