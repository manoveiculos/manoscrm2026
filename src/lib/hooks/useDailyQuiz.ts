'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Campaign {
    id: string;
    name: string;
    status: string;
}

interface ConsultantInfo {
    id: string;
    name: string;
    role: string;
}

interface QuizPayload {
    temperatura_vendas: 'quente' | 'medio' | 'frio';
    problema_credito: boolean;
    comentario_extra?: string;
    campanha_id?: string;
}

interface UseDailyQuizReturn {
    needsQuiz: boolean;
    isLoading: boolean;
    consultantName: string;
    consultantId: string | null;
    campaigns: Campaign[];
    isSubmitting: boolean;
    submitQuiz: (payload: QuizPayload) => Promise<boolean>;
    openQuiz: () => void;
    isOpen: boolean;
    closeQuiz: () => void;
}

// Removido TWELVE_HOURS_MS em favor da lógica do dia atual vindo às 09:00h

export function useDailyQuiz(): UseDailyQuizReturn {
    const [needsQuiz, setNeedsQuiz] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [consultant, setConsultant] = useState<ConsultantInfo | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isOpen = needsQuiz;

    const checkIfNeedsQuiz = useCallback(async (consultantId: string) => {
        // Horário de bloqueio configurado (05:00 AM)
        const now = new Date();
        const currentHour = now.getHours();
        
        // Se ainda não é 05:00h, não bloqueia
        if (currentHour < 5) return false;

        // Início do dia atual (00:00:00) em ISO
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        const { data, error } = await supabase
            .from('traffic_quality_feedback')
            .select('id')
            .eq('consultor_id', consultantId)
            .gte('data', startOfToday)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('[useDailyQuiz] Erro ao verificar feedback:', error);
            return false;
        }

        // Se não encontrou nenhum registro → precisa preencher
        return !data;
    }, []);

    const fetchCampaigns = useCallback(async () => {
        const { data, error } = await supabase
            .from('campaigns_manos_crm')
            .select('id, name, status')
            .in('status', ['ACTIVE', 'ativa', 'active', 'PAUSED'])
            .order('name', { ascending: true })
            .limit(20);

        if (error) {
            console.error('[useDailyQuiz] Erro ao buscar campanhas:', error);
            return [];
        }

        return (data ?? []) as Campaign[];
    }, []);

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setIsLoading(false);
                    return;
                }

                const { data: cons } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, name, role')
                    .eq('auth_id', user.id)
                    .maybeSingle();

                if (!cons) {
                    setIsLoading(false);
                    return;
                }

                // Admin não recebe cobrança de quiz
                if (cons.role === 'admin') {
                    setNeedsQuiz(false);
                    setIsLoading(false);
                    return;
                }

                setConsultant(cons);

                const [needs, fetchedCampaigns] = await Promise.all([
                    checkIfNeedsQuiz(cons.id),
                    fetchCampaigns(),
                ]);

                setNeedsQuiz(needs);
                setCampaigns(fetchedCampaigns);
            } catch (err) {
                console.error('[useDailyQuiz] Erro de inicialização:', err);
            } finally {
                setIsLoading(false);
            }
        };

        init();
    }, [checkIfNeedsQuiz, fetchCampaigns]);

    const submitQuiz = useCallback(async (payload: QuizPayload): Promise<boolean> => {
        if (!consultant) return false;

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('traffic_quality_feedback')
                .insert({
                    consultor_id: consultant.id,
                    data: new Date().toISOString(),
                    temperatura_vendas: payload.temperatura_vendas,
                    problema_credito: payload.problema_credito,
                    comentario_extra: payload.comentario_extra?.trim() || null,
                    campanha_id: payload.campanha_id || null
                });

            if (error) {
                console.error('[useDailyQuiz] Erro ao salvar feedback:', error);
                return false;
            }

            setNeedsQuiz(false);
            return true;
        } catch (err) {
            console.error('[useDailyQuiz] Erro inesperado no submit:', err);
            return false;
        } finally {
            setIsSubmitting(false);
        }
    }, [consultant]);

    const openQuiz = () => {};
    const closeQuiz = () => setNeedsQuiz(false);

    return {
        needsQuiz,
        isLoading,
        consultantName: consultant?.name ?? '',
        consultantId: consultant?.id ?? null,
        campaigns,
        isSubmitting,
        submitQuiz,
        openQuiz,
        isOpen,
        closeQuiz,
    };
}
