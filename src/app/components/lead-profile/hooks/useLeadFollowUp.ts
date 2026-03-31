import { useState, useCallback, useEffect } from 'react';
import { leadService } from '@/lib/leadService';
import { createClient } from '@/lib/supabase/client';

export function useLeadFollowUp(lead: any, activeTab: string, userName: string) {
    const supabase = createClient();
    const [proximoFollowUp, setProximoFollowUp] = useState<any>(null);
    const [historicoFollowUps, setHistoricoFollowUps] = useState<any[]>([]);
    const [loadingFollowUps, setLoadingFollowUps] = useState(false);
    const [showFollowUpForm, setShowFollowUpForm] = useState(false);
    const [showCompletionModal, setShowCompletionModal] = useState(false);
    const [completionNote, setCompletionNote] = useState('');
    const [selectedFollowUpId, setSelectedFollowUpId] = useState<string | null>(null);
    const [followUpForm, setFollowUpForm] = useState({
        type: 'whatsapp',
        scheduled_at: '',
        note: '',
        priority: 'normal'
    });

    const cleanUUID = (id: string | null | undefined): string | null => {
        if (!id) return null;
        const cleaned = id.toString().replace(/main_|crm26_|dist_|lead_|crm25_/, '');
        if (/^\d+$/.test(cleaned)) return cleaned;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(cleaned) ? cleaned : null;
    };

    const fetchFollowUps = useCallback(async () => {
        if (!lead?.id) return;
        setLoadingFollowUps(true);
        const cleanId = lead.id.replace(/main_|crm26_|dist_/, '');

        try {
            await leadService.followUp.markMissedFollowUps(undefined, cleanId);
            const { data: next } = await leadService.followUp.getNextFollowUp(undefined, cleanId);
            const { data: history } = await leadService.followUp.getFollowUps(undefined, cleanId);

            if (next) setProximoFollowUp(next);
            else setProximoFollowUp(null);

            if (history) setHistoricoFollowUps(history);
        } catch (err) {
            console.error('Erro ao buscar follow-ups:', err);
        } finally {
            setLoadingFollowUps(false);
        }
    }, [lead]);

    useEffect(() => {
        if (activeTab === 'followup') fetchFollowUps();
    }, [lead.id, activeTab, fetchFollowUps]);

    const handleCreateFollowUp = useCallback(async () => {
        if (!followUpForm.scheduled_at) return;
        setLoadingFollowUps(true);
        try {
            const cleanId = lead.id.replace(/main_|crm26_|dist_/, '');
            
            // Ajuste de Fuso Horário (Brasília -03:00)
            const scheduledAtWithTimezone = followUpForm.scheduled_at.includes('T') && !followUpForm.scheduled_at.includes('-') 
                ? `${followUpForm.scheduled_at}:00-03:00` 
                : followUpForm.scheduled_at;

            const { error } = await leadService.followUp.createFollowUp(undefined, {
                lead_id: cleanId,
                user_id: userName || 'Sistema',
                ...followUpForm,
                scheduled_at: scheduledAtWithTimezone
            });

            if (!error) {
                // SE FOR AGENDAMENTO, FORÇAR O STATUS PARA 'scheduled' NO BANCO
                await supabase
                    .from('leads_master')
                    .update({ status: 'scheduled' })
                    .eq('id', cleanId);

                setShowFollowUpForm(false);
                setFollowUpForm({ type: 'whatsapp', scheduled_at: '', note: '', priority: 'normal' });
                await fetchFollowUps();
                
                // Notificar o sistema que o lead mudou de status
                window.dispatchEvent(new CustomEvent('update-lead-status', { detail: { id: lead.id, status: 'scheduled' } }));
            }
        } catch (err) {
            console.error('Erro ao criar follow-up:', err);
        } finally {
            setLoadingFollowUps(false);
        }
    }, [lead, followUpForm, userName, fetchFollowUps]);

    const handleCompleteFollowUp = useCallback(async (result: 'positive' | 'neutral' | 'negative' = 'positive') => {
        if (!selectedFollowUpId) return;
        setLoadingFollowUps(true);
        try {
            const fu = historicoFollowUps.find(f => f.id === selectedFollowUpId) || proximoFollowUp;
            if (!fu) return;

            await leadService.followUp.completeFollowUp(undefined, selectedFollowUpId, result, completionNote);

            const cleanId = cleanUUID(lead.id);
            if (cleanId) {
                await supabase.from('interactions_manos_crm').insert({
                    lead_id: cleanId,
                    type: fu.type === 'whatsapp' ? 'whatsapp_out' : fu.type === 'call' ? 'call' : 'note',
                    notes: `[${userName || 'SISTEMA'}] FOLLOW-UP CONCLUÍDO: ${completionNote || 'Sem observações'}`,
                    consultant_id: cleanUUID(lead.assigned_consultant_id)
                });
            }

            if (fu.type === 'whatsapp' && lead.phone) {
                const cleanPhone = lead.phone.replace(/\D/g, '');
                window.open(`https://wa.me/55${cleanPhone}`, '_blank');
            }

            await fetchFollowUps();
            // Disparar evento para recarregar timeline
            window.dispatchEvent(new CustomEvent('update-lead-timeline', { detail: lead.id }));

            setShowCompletionModal(false);
            setCompletionNote('');
            setSelectedFollowUpId(null);
        } catch (err) {
            console.error('Erro ao concluir follow-up:', err);
        } finally {
            setLoadingFollowUps(false);
        }
    }, [lead, selectedFollowUpId, historicoFollowUps, proximoFollowUp, completionNote, userName, fetchFollowUps, supabase]);

    const handleSaveCallLog = useCallback(async (note: string): Promise<void> => {
        const cleanId = cleanUUID(lead.id);
        if (!cleanId) return;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        await supabase.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
            type: 'call',
            notes: `[${userName || 'CONSULTOR'}] LIGAÇÃO EFETUADA (${timestamp}):\n${note || 'Sem observações.'}`,
            created_at: new Date().toISOString(),
            user_name: userName || 'Consultor',
        });
        window.dispatchEvent(new CustomEvent('update-lead-timeline', { detail: lead.id }));
    }, [lead, userName, supabase]);

    return {
        proximoFollowUp,
        historicoFollowUps,
        loadingFollowUps,
        showFollowUpForm,
        setShowFollowUpForm,
        showCompletionModal,
        setShowCompletionModal,
        completionNote,
        setCompletionNote,
        selectedFollowUpId,
        setSelectedFollowUpId,
        followUpForm,
        setFollowUpForm,
        handleCreateFollowUp,
        handleCompleteFollowUp,
        handleSaveCallLog,
        refresh: fetchFollowUps
    };
}
