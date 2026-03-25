'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LayoutDashboard, History, Edit3, Car } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import { useLeadData } from './hooks/useLeadData';
import { useLeadTimeline } from './hooks/useLeadTimeline';
import { useLeadFollowUp } from './hooks/useLeadFollowUp';
import { useLeadScore } from './hooks/useLeadScore';

import { DashboardTab } from './tabs/DashboardTab';
import { TimelineTab } from './tabs/TimelineTab';
import { FollowUpTab } from './tabs/FollowUpTab';
import { ArsenalTab } from './tabs/ArsenalTab';

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
    const [activeTab, setActiveTab] = useState<'dashboard' | 'timeline' | 'followup' | 'arsenal'>('dashboard');
    const [isManagement, setIsManagement] = useState(propIsManagement || false);
    
    // Core Data Hooks
    const { lead, setLead, updateStatus, handleUpdateLead, isEditing, setIsEditing, editedLead, setEditedLead } = useLeadData(initialLead, setLeads, userName);

    // specialized Hooks
    const timeline = useLeadTimeline(lead.id, lead.phone);
    const followup = useLeadFollowUp(lead, activeTab, userName);
    const score = useLeadScore(lead, timeline.totalCount, timeline.allEvents[0]?.created_at);

    // Local State for Tabs
    const [searchTerm, setSearchTerm] = useState('');
    const [showAllArsenal, setShowAllArsenal] = useState(false);
    const [inventory, setInventory] = useState<any[]>([]);
    const [newNote, setNewNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [timelineFilter, setTimelineFilter] = useState('all');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showFinishing, setShowFinishing] = useState(false);
    const [finishType, setFinishType] = useState<'venda' | 'compra' | 'perda' | null>(null);
    const [vehicleDetails, setVehicleDetails] = useState('');
    const [lossReason, setLossReason] = useState('');
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [editedTemplates, setEditedTemplates] = useState<Record<string, string>>({});

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
                    .single();
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

    // Note Action
    const handleAddNote = useCallback(async (customNote?: string) => {
        const noteToSave = customNote || newNote;
        if (!noteToSave.trim()) return;
        setIsSavingNote(true);
        try {
            const cleanId = lead.id.toString().replace(/main_|crm26_|dist_|lead_|crm25_/, '');
            
            // Determinar se o ID é UUID para selecionar a tabela correta (opcional, interactions_manos_crm aceita ambos)
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
            
            const insertData: any = {
                type: 'note',
                notes: `[${userName}] ${noteToSave}`,
                consultant_id: lead.assigned_consultant_id?.replace(/main_|crm26_|dist_|lead_|crm25_/, ''),
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
                .single();

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

    // IA Action (Elite Closer v3)
    const recalculateStrategy = async () => {
        setIsAnalyzing(true);
        try {
            const { data: messages } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('lead_id', lead.id.replace(/main_|crm26_|dist_/, ''))
                .order('created_at', { ascending: true });

            const res = await fetch('/api/lead/next-steps', {
                method: 'POST',
                body: JSON.stringify({
                    leadId: lead.id,
                    messages: messages || [],
                    consultantName: userName
                })
            });

            if (res.ok) {
                const data = await res.json();
                // O backend já persiste no banco, basta dar refresh local
                setLead((prev: any) => ({ 
                    ...prev, 
                    ai_score: data.urgency_score,
                    ai_classification: data.temperature === 'quente' ? 'hot' : data.temperature === 'morno' ? 'warm' : 'cold',
                    next_step: data.proximos_passos[0],
                    status: data.status
                }));
                await timeline.refresh();
            }
        } catch (err) {
            console.error('Falha na mentoría IA:', err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleExecuteAIDirective = async () => {
        setActiveTab('followup');
    };

    // ══════════════════════════════════════
    // CORREÇÃO 4: SALVAR EDIÇÕES (mismatch de colunas e schemas)
    // ══════════════════════════════════════
    async function handleSaveField(field: string, value: string) {
        const cleanId = lead.id.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_)/, '');

        // Mapeamento: campo do frontend → possíveis colunas no banco (V2 e V1)
        const fieldMappings: Record<string, string[]> = {
            'interesse':          ['vehicle_interest', 'interest', 'interesse'],
            'ticket':             ['valor_investimento', 'estimated_ticket', 'budget', 'investment_value'],
            'valor_investimento': ['valor_investimento', 'estimated_ticket', 'budget', 'investment_value'],
            'origem':             ['origem', 'source', 'origin'],
            'nome':               ['nome', 'name', 'full_name'],
            'telefone':           ['phone', 'telefone', 'contact_phone'],
        };

        const possibleColumns = fieldMappings[field.toLowerCase()] || [field];
        
        // Detectar se o ID é UUID para priorizar leads_master
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        const tables = isUUID 
            ? ['leads_master', 'leads_manos_crm', 'leads_distribuicao_crm_26'] 
            : ['leads_manos_crm', 'leads_distribuicao_crm_26', 'leads_master'];

        let saved = false;
        let cleanValue: any = value;

        // Limpeza de valores financeiros - CORREÇÃO 1: Tratar escala de valores
        if (field.toLowerCase().includes('valor') || field.toLowerCase().includes('ticket')) {
            // Se o usuário digitou "25.900", transformamos em "25900"
            cleanValue = value.replace(/\D/g, '');
        }

        for (const table of tables) {
            let tableSaved = false;
            
            // ══════════════════════════════════════
            // CORREÇÃO: TRATAR IDs E CASTS POR TABELA
            // ══════════════════════════════════════
            let targetId: any = cleanId;
            if (table === 'leads_distribuicao_crm_26' || table === 'leads_manos_crm') {
                // Se o ID atual não for numérico, precisamos buscar o ID correspondente
                if (!/^\d+$/.test(cleanId)) {
                    const { data } = await supabase.from(table).select('id').or(`id_meta.eq.${cleanId},lead_id.eq.${cleanId}`).limit(1);
                    if (data?.[0]?.id) targetId = data[0].id; else continue; // Pula se não achar correspondente numérico
                } else {
                    targetId = parseInt(cleanId);
                }
            }

            for (const column of possibleColumns) {
                let colValue: any = cleanValue;
                
                // Conversão para colunas numéricas
                if (['estimated_ticket', 'budget', 'ai_score'].includes(column)) {
                    colValue = parseInt(cleanValue) || 0;
                }
                
                // UPDATE — Tenta atualizar na tabela atual
                const { error } = await supabase
                    .from(table)
                    .update({ [column]: colValue })
                    .eq('id', targetId);

                if (!error) {
                    tableSaved = true;
                    
                    // Atualizar estado local para refletir a mudança imediatamente
                    setLead((prev: any) => ({ ...prev, [field === 'interesse' ? 'vehicle_interest' : (field === 'origem' ? 'origem' : column)]: value }));
                    if (setLeads) setLeads((prev: any[]) => prev.map(l => l.id === lead.id ? { ...l, [field === 'interesse' ? 'vehicle_interest' : (field === 'origem' ? 'origem' : column)]: value } : l));
                }
            }

            if (tableSaved) {
                saved = true;
                // Registrar na timeline
                await supabase.from('interactions_manos_crm').insert({
                    [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
                    type: 'note',
                    notes: `🔧 Campo "${field.toUpperCase()}" alterado para "${value}"`,
                    consultant_id: lead.assigned_consultant_id?.replace(/^(main_|crm26_|dist_|lead_|crm25_)/, ''),
                    user_name: userName,
                    created_at: new Date().toISOString(),
                });
                break; 
            }
        }

        if (saved) {
            await timeline.refresh();
        } else {
            console.error(`[Save] FALHA: nenhuma tabela aceitou o campo "${field}"`);
            alert('Não foi possível salvar esta alteração no banco de dados.');
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
            alert(`✅ Veículo "${nomeVeiculo}" vinculado com sucesso!`);
            setActiveTab('dashboard'); // Volta para o cockpit para ver a mudança
        } else {
            alert('Erro ao vincular veículo no banco de dados.');
        }
        
        await timeline.refresh();
    }


    if (!isOpen || !lead) return null;

    const TABS = [
        { id: 'dashboard', label: 'Visão Geral' },
        { id: 'timeline',  label: 'Timeline'    },
        { id: 'followup',  label: 'Ações'        },
        { id: 'arsenal',   label: 'Arsenal'      },
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
                                            ultimaInteracao={timeline.allEvents[0]}
                                            showFinishing={showFinishing}
                                            setShowFinishing={setShowFinishing}
                                            finishType={finishType}
                                            setFinishType={setFinishType}
                                            vehicleDetails={vehicleDetails}
                                            setVehicleDetails={setVehicleDetails}
                                            lossReason={lossReason}
                                            setLossReason={setLossReason}
                                            handleSaveFinish={() => {
                                                setShowFinishing(false);
                                            }}
                                            isAnalyzing={isAnalyzing}
                                            recalculateStrategy={recalculateStrategy}
                                            handleExecuteAIDirective={handleExecuteAIDirective}
                                            onTabChange={setActiveTab}
                                            getAcaoTaticaFallback={getAcaoTaticaFallback}
                                            calcularTempoFunil={calcularTempoFunil}
                                            calcularDiffHoras={calcularDiffHoras}
                                            onSaveField={handleSaveField}
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
                                            isAnalyzing={isAnalyzing}
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
