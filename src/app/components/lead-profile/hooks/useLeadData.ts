import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { leadService } from '@/lib/leadService';
import { Lead } from '../types';
import { normalizeStatus } from '@/constants/status';
import { updateLeadStatusAction } from '@/app/actions/leads'; // Adicionando Server Action

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

    // Refetch on-mount: o initialLead vem de uma lista cacheada (TTL 30s) que pode
    // estar obsoleta, especialmente se a extensão Chrome editou o lead em paralelo.
    // Aqui buscamos fresco da VIEW 'leads' (sem cache) e fazemos merge preservando
    // campos enriquecidos do initialLead que getLeadById pode não trazer.
    useEffect(() => {
        if (!initialLead?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const fresh = await leadService.getLeadById(supabase, initialLead.id);
                if (cancelled || !fresh) return;
                setLead(prev => ({ ...prev, ...fresh }));
                setEditedLead(prev => ({
                    name: fresh.name ?? prev.name,
                    phone: fresh.phone ?? prev.phone,
                    vehicle_interest: fresh.vehicle_interest || '',
                    valor_investimento: fresh.valor_investimento || '',
                    origem: fresh.origem || '',
                }));
            } catch (err) {
                console.warn('[useLeadData] refetch on-mount falhou — mantendo initialLead:', err);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialLead?.id]);

    const updateStatus = useCallback(async (newStatusId: string, reason?: string) => {
        const oldStatus = lead.status;
        
        // Chamando a Server Action para garantir paridade total com a V1
        // (Isso lida com Conversões do Meta e Redistribuição de Leads automaticamente)
        setLoading(true);
        try {
            await updateLeadStatusAction(
                lead.id, 
                newStatusId as any, 
                oldStatus,
                undefined, // notes
                reason    // motivo_perda
            );

            const cleanId = initialLead.id.toString().replace(/main_|crm26_|dist_|lead_|crm25_|master_/, '');
            const isNumeric = /^\d+$/.test(cleanId);
            
            if (cleanId) {
                const interactionPayload: any = {
                    type: 'status_change',
                    notes: `[${userName || 'SISTEMA'}] Status alterado de ${oldStatus} para ${newStatusId} (via Sidebar)`,
                    consultant_id: initialLead.assigned_consultant_id ? initialLead.assigned_consultant_id.toString().replace(/main_|crm26_|dist_|lead_|crm25_|master_/, '') : null,
                    created_at: new Date().toISOString()
                };

                if (isNumeric) {
                    interactionPayload.lead_id_v1 = cleanId;
                } else {
                    interactionPayload.lead_id = cleanId;
                }

                await supabase.from('interactions_manos_crm').insert(interactionPayload);
            }

            setLead(prev => ({ ...prev, status: newStatusId as any }));
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatusId } : l));
            
            // Disparar evento global para recarregar interações se necessário
            window.dispatchEvent(new CustomEvent('update-lead-timeline', { detail: lead.id }));
        } catch (err) {
            console.error("Erro ao atualizar status via Action:", err);
            alert("Erro ao sincronizar status com o servidor.");
        } finally {
            setLoading(false);
        }
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
