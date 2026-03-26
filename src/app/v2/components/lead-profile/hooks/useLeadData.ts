import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { leadService } from '@/lib/leadService';
import { Lead } from '../types';
import { normalizeStatus } from '@/constants/status';

export function useLeadData(initialLead: Lead, setLeads: React.Dispatch<React.SetStateAction<any[]>>, userName: string) {
    const supabase = createClient();
    const [lead, setLead] = useState<Lead>(initialLead);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedLead, setEditedLead] = useState({
        name: initialLead.name,
        phone: initialLead.phone,
        vehicle_interest: initialLead.vehicle_interest || '',
        valor_investimento: initialLead.valor_investimento || '',
        origem: initialLead.origem || ''
    });

    const updateStatus = useCallback(async (newStatusId: string) => {
        const oldStatus = lead.status;
        await leadService.updateLeadStatus(supabase, lead.id, newStatusId as any, oldStatus);

        const cleanUUID = (id: string | null | undefined): string | null => {
            if (!id) return null;
            const cleaned = id.toString().replace(/main_|crm26_|dist_|lead_|crm25_/, '');
            if (/^\d+$/.test(cleaned)) return cleaned;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return uuidRegex.test(cleaned) ? cleaned : null;
        };

        const cleanId = cleanUUID(lead.id);
        if (cleanId) {
            await supabase.from('interactions_manos_crm').insert({
                lead_id: cleanId,
                type: 'status_change',
                notes: `[${userName || 'SISTEMA'}] Status alterado de ${oldStatus} para ${newStatusId}`,
                consultant_id: cleanUUID(lead.assigned_consultant_id)
            });
        }

        setLead(prev => ({ ...prev, status: newStatusId as any }));
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatusId } : l));
        
        // Disparar evento global para recarregar interações se necessário
        window.dispatchEvent(new CustomEvent('update-lead-timeline', { detail: lead.id }));
    }, [lead, supabase, userName, setLeads]);

    const handleUpdateLead = useCallback(async () => {
        setLoading(true);
        try {
            await leadService.updateLeadDetails(supabase, lead.id, editedLead);
            const updated = { ...lead, ...editedLead };
            setLead(updated);
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...editedLead } : l));
            setIsEditing(false);
        } catch (err: any) {
            console.error('Erro ao atualizar lead:', err.message || err);
        } finally {
            setLoading(false);
        }
    }, [lead, editedLead, supabase, setLeads]);

    return {
        lead,
        setLead,
        loading,
        isEditing,
        setIsEditing,
        editedLead,
        setEditedLead,
        updateStatus,
        handleUpdateLead
    };
}
