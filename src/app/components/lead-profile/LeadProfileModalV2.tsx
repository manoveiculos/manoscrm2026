'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LayoutDashboard, History, Edit3, Car, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import { useLeadData } from './hooks/useLeadData';
import { useLeadTimeline } from './hooks/useLeadTimeline';
import { useLeadFollowUp } from './hooks/useLeadFollowUp';
import { useLeadScore } from './hooks/useLeadScore';
import { TabId } from './types';
import { leadService } from '@/lib/leadService';

import { DashboardTab } from './tabs/DashboardTab';
import { TimelineTab } from './tabs/TimelineTab';
import { FollowUpTab } from './tabs/FollowUpTab';
import { ArsenalTab } from './tabs/ArsenalTab';
import { TradeInTab } from './tabs/TradeInTab';
import { FinancingTab } from './tabs/FinancingTab';

import { StatusSelector } from './sections/StatusSelector';
import { LeadHeader } from './sections/LeadHeader';
import { ConsultantBadge } from './sections/ConsultantBadge';

import { 
    getTemplatesForStage, 
    fillTemplate, 
    getAcaoTaticaFallback, 
    calcularTempoFunil, 
    calcularDiffHoras,
    parsePrice 
} from './utils';

export interface LeadProfileModalV2Props {
    isOpen?: boolean;
    onClose: () => void;
    lead: any;
    setLeads: React.Dispatch<React.SetStateAction<any[]>>;
    userName?: string;
    isManagement?: boolean;
}

export const LeadProfileModalV2: React.FC<LeadProfileModalV2Props> = ({ 
    isOpen = true, 
    onClose, 
    lead: initialLead, 
    setLeads,
    userName: propUserName,
    isManagement: propIsManagement
}) => {
    const supabase = createClient();
    const [userName, setUserName] = useState(propUserName || '');
    const [activeTab, setActiveTab] = useState<TabId>('dashboard');
    const [isManagement, setIsManagement] = useState(propIsManagement || false);
    
    // Core Data Hooks
    const { lead, setLead, updateStatus, handleUpdateLead, isEditing, setIsEditing, editedLead, setEditedLead } = useLeadData(initialLead, setLeads, userName);

    // specialized Hooks
    const timeline = useLeadTimeline(lead.id, lead.phone);
    const followup = useLeadFollowUp(lead, activeTab, userName);
    const score = useLeadScore(lead, timeline.totalCount, timeline.allEvents[0]?.created_at);

    // Seleciona o evento mais recente com conteúdo real para "Último contato"
    const ultimaInteracao = React.useMemo(() => {
        const SKIP_TYPES = ['followup_created', 'followup_missed', 'system', 'vehicle_linked'];
        const withContent = timeline.allEvents.find(e =>
            !SKIP_TYPES.includes(e.type) &&
            ((e.description && e.description.trim().length > 3) ||
             (e as any).notes?.trim()?.length > 3 ||
             e.type === 'call' || e.type === 'visit')
        );
        return withContent || timeline.allEvents[0] || null;
    }, [timeline.allEvents]);

    // Local State for Tabs
    const [searchTerm, setSearchTerm] = useState('');
    const [showAllArsenal, setShowAllArsenal] = useState(false);
    const [inventory, setInventory] = useState<any[]>([]);
    const [newNote, setNewNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [timelineFilter, setTimelineFilter] = useState('all');
    const [loadingStatus, setLoadingStatus] = useState<'idle' | 'analyzing' | 'matching' | 'finalizing'>('idle');
    const isAnalyzing = loadingStatus !== 'idle';
    const [scriptOptions, setScriptOptions] = useState<{ tipo: string; label: string; mensagem: string }[]>(() => {
        // Carrega scripts salvos no banco ao abrir o modal
        if (Array.isArray(lead?.last_scripts_json) && lead.last_scripts_json.length > 0) {
            return lead.last_scripts_json;
        }
        return [];
    });
    const [diagnostico, setDiagnostico] = useState(() => {
        const parts = (lead?.ai_reason || '').split('| ORIENTAÇÃO:');
        return parts[0]?.trim() || '';
    });
    const [orientacao, setOrientacao] = useState(() => {
        const parts = (lead?.ai_reason || '').split('| ORIENTAÇÃO:');
        return parts[1]?.trim() || '';
    });
    const [showFinishing, setShowFinishing] = useState(false);
    const [finishType, setFinishType] = useState<'venda' | 'compra' | 'perda' | null>(null);
    const [vehicleDetails, setVehicleDetails] = useState('');
    const [lossReason, setLossReason] = useState('');
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [editedTemplates, setEditedTemplates] = useState<Record<string, string>>({});
    const [isDeleting, setIsDeleting] = useState(false);
    // Controla auto-trigger único por sessão do modal
    const hasAutoTriggered = useRef(false);

    // Client-side rendering check for Portal
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Fetch Auth Context
    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserName(user.user_metadata?.name || user.email?.split('@')[0] || 'CONSULTOR');
                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('role')
                    .eq('email', user.email)
                    .maybeSingle(); // Troquei .single() por .maybeSingle() para evitar erro se não achar
                if (consultant) setIsManagement(['admin', 'manager', 'owner'].includes(consultant.role));
            }
        };
        fetchUser();
    }, [supabase]);

    // Fetch inventory for Arsenal
    useEffect(() => {
        const fetchInventory = async () => {
            const { data } = await supabase.from('estoque').select('*');
            if (data) setInventory(data);
        };
        if (activeTab === 'arsenal') fetchInventory();
    }, [activeTab, supabase]);

    // Cache-first: exibe análise salva imediatamente.
    // IA roda automaticamente APENAS em 2 casos:
    //   1. Lead nunca analisado (primeira vez)
    //   2. Lead teve alteração desde a última análise (updated_at > last_scripts_at)
    // Fora desses casos, zero chamadas de API — sempre cache.
    const [aiStale, setAiStale] = useState(false);

    useEffect(() => {
        if (
            activeTab !== 'dashboard' ||
            hasAutoTriggered.current ||
            loadingStatus !== 'idle' ||
            !lead.phone
        ) return;

        const nuncaAnalisado = !lead.next_step && !lead.ai_reason;

        if (nuncaAnalisado) {
            // Primeira vez no CRM: dispara IA automaticamente
            hasAutoTriggered.current = true;
            const timer = setTimeout(() => recalculateStrategy(), 1200);
            return () => clearTimeout(timer);
        }

        // Lead já analisado: verifica se houve alteração desde a última análise
        const lastAnalysis = lead.last_scripts_at ? new Date(lead.last_scripts_at).getTime() : 0;
        const lastUpdate = new Date(lead.updated_at || lead.created_at).getTime();
        if (lastAnalysis > 0 && lastUpdate > lastAnalysis) {
            // Houve alteração no lead → recalcula scripts automaticamente
            setAiStale(true);
            hasAutoTriggered.current = true;
            const timer = setTimeout(() => recalculateStrategy(), 1500);
            return () => clearTimeout(timer);
        }
        // Sem alteração → exibe cache, zero chamadas
        hasAutoTriggered.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Note Action
    const handleAddNote = useCallback(async (customNote?: string) => {
        const noteToSave = customNote || newNote;
        if (!noteToSave.trim()) return;
        setIsSavingNote(true);
        try {
            const cleanId = lead.id.toString().replace(/main_|crm26_|dist_|lead_|crm25_|master_/, '');
            
            // Determinar se o ID é UUID para selecionar a tabela correta (opcional, interactions_manos_crm aceita ambos)
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
            
            const insertData: any = {
                type: 'note',
                notes: `[${userName}] ${noteToSave}`,
                consultant_id: lead.assigned_consultant_id?.replace(/main_|crm26_|dist_|lead_|crm25_|master_/, ''),
                created_at: new Date().toISOString()
            };

            if (isUUID) {
                insertData.lead_id = cleanId;
            } else {
                insertData.lead_id_v1 = cleanId;
            }

            const { data, error } = await supabase
                .from('interactions_manos_crm')
                .insert(insertData)
                .select()
                .maybeSingle();

            if (error) throw error;

            setNewNote('');
            // Força o refresh da timeline e da DashboardTab (que mostra a última interação)
            await timeline.refresh();
            
            // Opcional: atualização otimista local se necessário
        } catch (err: any) {
            console.error('Erro ao adicionar nota:', err);
            alert('Erro ao salvar nota: ' + (err.message || 'Erro desconhecido'));
        } finally {
            setIsSavingNote(false);
        }
    }, [lead, newNote, userName, supabase, timeline]);

    const handleDeleteLead = async () => {
        if (!window.confirm('🚨 TEM CERTEZA? Esta ação irá deletar permanentemente o lead e todo o seu histórico. Não há como desfazer!')) {
            return;
        }

        setIsDeleting(true);
        try {
            await leadService.deleteLead(supabase, lead.id);
            if (setLeads) {
                setLeads(prev => prev.filter(l => l.id !== lead.id));
            }
            onClose();
        } catch (err: any) {
            console.error('Erro ao deletar lead:', err);
            alert('Erro ao deletar lead: ' + (err.message || 'Erro de permissão'));
        } finally {
            setIsDeleting(false);
        }
    };

    // IA Action (Elite Closer v3)
    const recalculateStrategy = async () => {
        setLoadingStatus('analyzing');
        try {
            // Pequeno delay artificial para o usuário ler o status se a rede estiver rápida demais
            // No caso do GPT-4o-mini (2s), isso garante que o vendedor veja a "mágica" acontecendo
            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            
            // Busca mensagens WhatsApp — lead_id em whatsapp_messages é bigint, só funciona com IDs numéricos
            const rawId = lead.id.toString();
            const cleanLeadId = rawId.replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');
            const isNumericId = /^\d+$/.test(cleanLeadId);

            let messages: any[] = [];
            if (isNumericId) {
                const { data } = await supabase
                    .from('whatsapp_messages')
                    .select('*')
                    .eq('lead_id', parseInt(cleanLeadId))
                    .order('created_at', { ascending: true });
                messages = data || [];
            }

            await sleep(800);
            setLoadingStatus('matching');

            const res = await fetch('/api/lead/next-steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId: lead.id,
                    messages: messages || [],
                    consultantName: userName
                })
            });

            setLoadingStatus('finalizing');
            await sleep(500);

            if (res.ok) {
                const data = await res.json();
                // Atualiza estado local com todos os campos retornados pela análise
                setLead((prev: any) => ({
                    ...prev,
                    ai_score: data.urgency_score,
                    ai_classification: data.temperature === 'quente' ? 'hot' : data.temperature === 'morno' ? 'warm' : 'cold',
                    next_step: data.proximos_passos?.[0] || prev.next_step,
                    proxima_acao: data.proximos_passos?.[0] || prev.proxima_acao,
                    ai_reason: data.diagnostico && data.orientacao
                        ? `${data.diagnostico} | ORIENTAÇÃO: ${data.orientacao}`
                        : prev.ai_reason,
                    ...(data.detected_name ? { name: data.detected_name, nome: data.detected_name } : {}),
                }));
                if (Array.isArray(data.script_options) && data.script_options.length > 0) {
                    setScriptOptions(data.script_options);
                }
                if (data.diagnostico) setDiagnostico(data.diagnostico);
                if (data.orientacao)  setOrientacao(data.orientacao);
                await timeline.refresh();
            } else {
                const text = await res.text().catch(() => '');
                let errMsg = 'Erro desconhecido';
                try { errMsg = JSON.parse(text)?.error || text.slice(0, 200); } catch { errMsg = text.slice(0, 200); }
                console.error('[IA] Análise falhou:', res.status, errMsg);
            }
        } catch (err) {
            console.error('Falha na mentoría IA:', err);
        } finally {
            setLoadingStatus('idle');
        }
    };

    const handleExecuteAIDirective = async () => {
        setActiveTab('followup');
    };

    const handleSaveFinish = async () => {
        if (!finishType) return;
        setLoadingStatus('finalizing'); // Usando loading genérico do modal
        try {
            const { recordSaleAction, recordPurchaseAction, updateLeadStatusAction } = await import('@/app/actions/leads');

            let result;
            if (finishType === 'venda') {
                result = await recordSaleAction(
                    { ...lead, status: 'closed', vehicle_interest: vehicleDetails || lead.vehicle_interest },
                    { consultant_id: lead.assigned_consultant_id, vehicle_name: vehicleDetails, sale_value: 0 }
                );
            } else if (finishType === 'compra') {
                result = await recordPurchaseAction(
                    { ...lead, status: 'comprado', vehicle_interest: vehicleDetails || lead.vehicle_interest },
                    { consultant_id: lead.assigned_consultant_id, vehicle_details: vehicleDetails, purchase_value: 0 }
                );
            } else {
                // Perda
                result = await updateLeadStatusAction(
                    lead.id, 
                    'lost' as any, 
                    lead.status, 
                    `🏁 ATENDIMENTO FINALIZADO: PERDIDO / DESCARTE. Motivo: ${lossReason}`,
                    lossReason
                );
            }

            if (result && !result.success) {
                throw new Error((result as any).error || "Falha ao processar finalização");
            }

            // Atualiza estado local otimistically/after action
            const finalStatus = finishType === 'venda' ? 'closed' : finishType === 'compra' ? 'comprado' : 'lost';
            
            setLead((prev: any) => ({ ...prev, status: finalStatus }));
            if (setLeads) {
                setLeads((prev: any[]) =>
                    prev.map(l => l.id === lead.id ? { ...l, status: finalStatus } : l)
                );
            }

            setShowFinishing(false);
            setFinishType(null);
            setVehicleDetails('');
            setLossReason('');

            await timeline.refresh();
            onClose();
            alert('✅ Atendimento finalizado com sucesso!');
        } catch (err: any) {
            console.error('[handleSaveFinish]', err);
            alert('Erro ao salvar conclusão: ' + (err.message || 'Tente novamente.'));
        } finally {
            setLoadingStatus('idle');
        }
    };

    // ══════════════════════════════════════
    // CORREÇÃO 4: SALVAR EDIÇÕES (mismatch de colunas e schemas)
    // ══════════════════════════════════════
    async function handleSaveField(field: string, value: string) {
        const fieldLower = field.toLowerCase();
        
        // Mapeamento: campo do frontend -> objeto de atualização para o leadService
        const fieldMappings: Record<string, string[]> = {
            'interesse':          ['vehicle_interest', 'interesse'],
            'ticket':             ['valor_investimento', 'estimated_ticket'],
            'valor_investimento': ['valor_investimento', 'estimated_ticket'],
            'origem':             ['origem', 'source'],
            'carro_troca':        ['carro_troca', 'troca', 'observacoes', 'resumo'],
            'nome':               ['name', 'nome'],
            'telefone':           ['phone', 'telefone'],
        };

        const targetColumns = fieldMappings[fieldLower] || [field];
        let cleanValue: any = value;

        // Limpeza de valores financeiros
        if (fieldLower.includes('valor') || fieldLower.includes('ticket')) {
            cleanValue = value.replace(/\D/g, '');
        }

        let saved = false;
        let lastError = null;

        // Tentar salvar em cada coluna possível até ter sucesso (resiliência para schemas mistos V1/V2)
        for (const col of targetColumns) {
            try {
                let colValue = (col === 'estimated_ticket' || col === 'ai_score') ? (parseInt(cleanValue) || 0) : cleanValue;
                
                // Se estivermos salvando no fallback de observações, não sobrescreva, anexe
                if ((col === 'observacoes' || col === 'resumo') && fieldLower === 'carro_troca') {
                    const currentObs = lead.observacoes || lead.resumo || '';
                    colValue = `${currentObs}\n🚗 CARRO DE TROCA: ${cleanValue}`.trim();
                }

                await leadService.updateLeadDetails(supabase, lead.id, { [col]: colValue });
                
                // Atualizar estado local
                setLead((prev: any) => ({ ...prev, [col]: colValue, [fieldLower]: value }));
                if (setLeads) {
                    setLeads((prev: any[]) => prev.map(l => l.id === lead.id ? { ...l, [col]: colValue, [fieldLower]: value } : l));
                }
                break;
            } catch (err) {
                lastError = err;
                continue; // Tenta a próxima coluna
            }
        }

        if (saved) {
            try {
                // Registrar na timeline (Interação genérica de log)
                const cleanId = lead.id.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
                
                await supabase.from('interactions_manos_crm').insert({
                    [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
                    type: 'note',
                    notes: `🔧 Campo "${field.toUpperCase()}" alterado para "${value}"`,
                    consultant_id: lead.assigned_consultant_id?.replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, ''),
                    user_name: userName,
                    created_at: new Date().toISOString(),
                });

                await timeline.refresh();
            } catch (timelineErr) {
                console.warn("Erro ao registrar log na timeline:", timelineErr);
            }
        } else {
            console.error(`[Save] FALHA definitiva ao salvar campo "${field}":`, lastError);
            alert('Não foi possível salvar esta alteração no banco de dados. Verifique o esquema das tabelas.');
        }
    }

    // ══════════════════════════════════════
    // CORREÇÃO 5: ARSENAL — VINCULAR VEÍCULO
    // ══════════════════════════════════════
    async function handleVincularVeiculo(veiculo: any) {
        const cleanId = lead.id.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_)/, '');
        const nomeVeiculo = veiculo.marca_modelo || `${veiculo.marca} ${veiculo.modelo}` || '';
        const precoStr = veiculo.preco || '0';
        const precoNumerico = typeof precoStr === 'string' ? precoStr.replace(/\D/g, '') : precoStr.toString();

        // 1. ATUALIZAR O LEAD (Interesse e Valor)
        const updates: any = { vehicle_interest: nomeVeiculo };
        
        // Só atualiza valor se for 0 ou Pendente
        const currentPrice = parseFloat(String(lead.valor_investimento || '0').replace(/\D/g, '')) || 0;
        if (currentPrice === 0) {
            updates.valor_investimento = precoNumerico;
            updates.estimated_ticket = parseFloat(precoNumerico);
        }

        let saved = false;
        const tables = ['leads_master', 'leads_manos_crm', 'leads_distribuicao_crm_26'];

        for (const table of tables) {
            try {
                // Tenta atualizar colunas V2 e V1 simultaneamente se possível ou iterativamente
                const { error } = await supabase
                    .from(table)
                    .update(updates)
                    .or(`id.eq.${cleanId},id.eq.${lead.id}`)
                    .select()
                    .single();
                
                if (!error) {
                    saved = true;
                    break;
                } else if (error.message.includes('column')) {
                    // Fallback para colunas legadas se a principal falhar
                    const legacyUpdates: any = { interesse: nomeVeiculo, valor_investimento: precoNumerico };
                    const { error: err2 } = await supabase
                        .from(table)
                        .update(legacyUpdates)
                        .or(`id.eq.${cleanId},id.eq.${lead.id}`);
                    if (!err2) { saved = true; break; }
                }
            } catch (e) {}
        }

        // 2. REGISTRAR NA TIMELINE
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        const { error: timelineError } = await supabase.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
            type: 'vehicle_linked',
            notes: `🎯 Veículo vinculado: ${nomeVeiculo} (R$ ${precoStr})`,
            consultant_id: lead.assigned_consultant_id?.replace(/^(main_|crm26_|dist_|lead_|crm25_)/, ''),
            user_name: userName,
            created_at: new Date().toISOString(),
        });
        if (timelineError) console.error('[Timeline] Erro ao registrar:', timelineError);

        // 3. ATUALIZAR ESTADOS
        if (saved) {
            setLead((prev: any) => ({ 
                ...prev, 
                vehicle_interest: nomeVeiculo,
                interesse: nomeVeiculo,
                valor_investimento: updates.valor_investimento || prev.valor_investimento
            }));
            if (setLeads) {
                setLeads((prev: any[]) => prev.map(l => l.id === lead.id ? { 
                    ...l, 
                    vehicle_interest: nomeVeiculo,
                    interesse: nomeVeiculo,
                    valor_investimento: updates.valor_investimento || l.valor_investimento
                } : l));
            }
            alert(`✅ Veículo "${nomeVeiculo}" vinculado com sucesso!`);
            setActiveTab('dashboard'); // Volta para o cockpit para ver a mudança
        } else {
            alert('Erro ao vincular veículo no banco de dados.');
        }
        
        await timeline.refresh();
    }


    if (!isOpen || !lead) return null;

    const TABS = [
        { id: 'dashboard',    label: 'Geral' },
        { id: 'timeline',     label: 'Timeline'    },
        { id: 'followup',     label: 'Ações'        },
        { id: 'arsenal',      label: 'Arsenal'      },
        { id: 'troca',        label: 'Troca'        },
        { id: 'financiamento', label: 'Crédito'     },
    ] as const;

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9998] flex justify-end">
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/65 backdrop-blur-sm cursor-pointer"
                    />

                    {/* Painel lateral */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                        className="fixed top-0 right-0 h-screen w-[480px] max-w-[95vw] bg-[#111114] border-l border-white/[0.07] shadow-2xl z-[9999] flex flex-col overflow-hidden"
                    >
                        {/* ── HEADER FIXO ── */}
                        <div className="shrink-0 bg-[#111114] border-b border-white/[0.07] px-5 pt-4 pb-0">

                            {/* Linha 1: Status + Consultor + fechar */}
                            <div className="flex items-center justify-between mb-4">
                                <StatusSelector
                                    lead={lead}
                                    currentStatus={lead.status}
                                    onChange={updateStatus}
                                    scoreInfo={score.scoreInfo}
                                    displayScore={score.finalScore}
                                    userName={userName}
                                    onScoreUpdated={recalculateStrategy}
                                />
                                <div className="flex items-center gap-2">
                                    <ConsultantBadge
                                        lead={lead}
                                        isAdmin={isManagement}
                                        onUpdate={(consultantId, consultantName) => {
                                            setLead((prev: any) => ({ ...prev, assigned_consultant_id: consultantId }));
                                            if (setLeads) setLeads((prev: any[]) => prev.map(l => l.id === lead.id ? { ...l, assigned_consultant_id: consultantId } : l));
                                        }}
                                    />
                                    {isManagement && (
                                        <button
                                            onClick={handleDeleteLead}
                                            disabled={isDeleting}
                                            className="h-8 w-8 flex items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-500/40 hover:text-red-500 hover:bg-red-500/20 transition-all ml-1"
                                            title="Deletar Lead (Admin)"
                                        >
                                            {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                        </button>
                                    )}
                                    <button
                                        onClick={onClose}
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-white/[0.05] border border-white/[0.07] text-white/40 hover:text-white hover:bg-white/10 transition-all"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            </div>

                            {/* Linha 2: Avatar + Nome + Telefone + Score bar */}
                            <LeadHeader
                                lead={lead}
                                isAdmin={isManagement}
                                onSave={handleSaveField}
                                score={score.finalScore}
                                scoreInfo={score.scoreInfo}
                            />

                            {/* Linha 3: Abas estilo clean */}
                            <nav className="flex mt-4 -mx-0.5">
                                {TABS.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex-1 py-3 text-[11px] font-semibold tracking-wide transition-all border-b-2 ${
                                            activeTab === tab.id
                                                ? 'text-white border-red-500'
                                                : 'text-white/35 border-transparent hover:text-white/60'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        {/* ── CONTEÚDO SCROLLÁVEL ── */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#0E0E11] custom-scrollbar">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.15 }}
                                    className="p-5"
                                >
                                    {activeTab === 'dashboard' && (
                                        <DashboardTab
                                            lead={lead}
                                            isEditing={isEditing}
                                            editedLead={editedLead}
                                            setEditedLead={setEditedLead}
                                            isManagement={isManagement}
                                            setIsEditing={setIsEditing}
                                            handleUpdateLead={handleUpdateLead}
                                            ultimaInteracao={ultimaInteracao}
                                            showFinishing={showFinishing}
                                            setShowFinishing={setShowFinishing}
                                            finishType={finishType}
                                            setFinishType={setFinishType}
                                            vehicleDetails={vehicleDetails}
                                            setVehicleDetails={setVehicleDetails}
                                            lossReason={lossReason}
                                            setLossReason={setLossReason}
                                            handleSaveFinish={handleSaveFinish}
                                            loadingStatus={loadingStatus}
                                            recalculateStrategy={recalculateStrategy}
                                            handleExecuteAIDirective={handleExecuteAIDirective}
                                            onTabChange={setActiveTab}
                                            getAcaoTaticaFallback={getAcaoTaticaFallback}
                                            calcularTempoFunil={calcularTempoFunil}
                                            calcularDiffHoras={calcularDiffHoras}
                                            onSaveField={handleSaveField}
                                            scriptOptions={scriptOptions}
                                            aiStale={aiStale}
                                        />
                                    )}
                                    {activeTab === 'timeline' && (
                                        <TimelineTab
                                            events={timeline.events}
                                            loading={timeline.loading}
                                            filter={timeline.filter}
                                            setFilter={timeline.setFilter}
                                            newNote={newNote}
                                            setNewNote={setNewNote}
                                            isSavingNote={isSavingNote}
                                            handleAddNote={() => handleAddNote()}
                                            loadingStatus={loadingStatus}
                                            recalculateStrategy={recalculateStrategy}
                                        />
                                    )}
                                    {activeTab === 'followup' && (
                                        <FollowUpTab
                                            lead={lead}
                                            proximoFollowUp={followup.proximoFollowUp}
                                            historicoFollowUps={followup.historicoFollowUps}
                                            loadingFollowUps={followup.loadingFollowUps}
                                            showFollowUpForm={followup.showFollowUpForm}
                                            setShowFollowUpForm={followup.setShowFollowUpForm}
                                            showCompletionModal={followup.showCompletionModal}
                                            setShowCompletionModal={followup.setShowCompletionModal}
                                            completionNote={followup.completionNote}
                                            setCompletionNote={followup.setCompletionNote}
                                            selectedFollowUpId={followup.selectedFollowUpId}
                                            setSelectedFollowUpId={followup.setSelectedFollowUpId}
                                            followUpForm={followup.followUpForm}
                                            setFollowUpForm={followup.setFollowUpForm}
                                            handleCreateFollowUp={followup.handleCreateFollowUp}
                                            handleCompleteFollowUp={followup.handleCompleteFollowUp}
                                            getTemplatesForStage={getTemplatesForStage}
                                            fillTemplate={fillTemplate}
                                            editingTemplateId={editingTemplateId}
                                            setEditingTemplateId={setEditingTemplateId}
                                            editedTemplates={editedTemplates}
                                            setEditedTemplates={setEditedTemplates}
                                            handleSendTemplate={(template, text) => {
                                                const cleanPhone = lead.phone.replace(/\D/g, '');
                                                window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
                                            }}
                                            recalculateStrategy={recalculateStrategy}
                                            loadingStatus={loadingStatus}
                                            scriptOptions={scriptOptions}
                                            diagnostico={diagnostico}
                                            orientacao={orientacao}
                                            onTabChange={setActiveTab}
                                            handleSaveCallLog={followup.handleSaveCallLog}
                                        />
                                    )}
                                    {activeTab === 'arsenal' && (
                                        <ArsenalTab
                                            lead={lead}
                                            inventory={inventory}
                                            searchTerm={searchTerm}
                                            setSearchTerm={setSearchTerm}
                                            showAllArsenal={showAllArsenal}
                                            setShowAllArsenal={setShowAllArsenal}
                                            handleVincularVeiculo={handleVincularVeiculo}
                                            parsePrice={parsePrice}
                                        />
                                    )}
                                    {activeTab === 'troca' && (
                                        <TradeInTab 
                                            lead={lead} 
                                            onSaveField={handleSaveField} 
                                        />
                                    )}
                                    {activeTab === 'financiamento' && (
                                        <FinancingTab 
                                            lead={lead} 
                                            onSaveField={handleSaveField} 
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    if (mounted) {
        return createPortal(modalContent, document.body);
    }
    return null;
};
