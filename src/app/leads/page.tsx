'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import JSZip from 'jszip';
import {
    Search,
    MessageSquare,
    Phone,
    Calendar,
    AlertCircle,
    BadgeCheck,
    Sparkles,
    ArrowRight,
    Users,
    CreditCard,
    Car,
    Plus,
    FileText,
    Upload,
    Zap,
    TrendingUp,
    Target,
    ArrowUpRight,
    Facebook,
    Instagram,
    MessageCircle,
    Globe,
    RefreshCcw,
    ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { dataService } from '@/lib/dataService';
import { updateLeadStatusAction, recordSaleAction, recordPurchaseAction } from '@/app/actions/leads';
import { supabase } from '@/lib/supabase';
import { Lead, LeadStatus, Consultant, InventoryItem, AIClassification, Sale, Purchase } from '@/lib/types';

// New Components & Utilities
import { SourceIcon } from './components/SourceIcon';
import { KanbanCard } from './components/KanbanCard';
import { ListRow } from './components/ListRow';
import { formatPhoneBR, getStatusColor, getStatusLabel } from './utils/helpers';
import { useIsMobile } from './hooks/useIsMobile';

function LeadsContent() {
    const searchParams = useSearchParams();
    const leadIdFromUrl = searchParams.get('id');
    const viewFromUrl = searchParams.get('view');
    const stageFromUrl = searchParams.get('stage');
    const tabFromUrl = searchParams.get('tab');


    const [searchTerm, setSearchTerm] = useState('');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [actionLead, setActionLead] = useState<Lead | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>(viewFromUrl === 'kanban' ? 'kanban' : 'list');
    
    // Pagination State
    const [visibleCount, setVisibleCount] = useState(20);
    const observerTarget = useRef<HTMLDivElement>(null);

    // Filters State
    const [filterDate, setFilterDate] = useState<string>('all');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [filterConsultant, setFilterConsultant] = useState<string>('all');
    const [filterStage, setFilterStage] = useState<string>(stageFromUrl || 'all');
    const [filterInterest, setFilterInterest] = useState<string>('all');
    const [filterScore, setFilterScore] = useState<string>('all');
    const [filterOrigin, setFilterOrigin] = useState<string>('all');
    const [urlFilter, setUrlFilter] = useState<string | null>(searchParams.get('filter'));

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [pendingAutoAnalysis, setPendingAutoAnalysis] = useState<string | null>(null);
    const [chatText, setChatText] = useState('');
    const [activeMoveMenu, setActiveMoveMenu] = useState<string | null>(null);
    const [scrollProgress, setScrollProgress] = useState(0);
    const [dragOverColId, setDragOverColId] = useState<string | null>(null);
    const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
    const [consultants, setConsultants] = useState<Consultant[]>([]);
    const [userRole, setUserRole] = useState<string>('consultant');
    const [userName, setUserName] = useState<string>('');
    const [currentConsultantId, setCurrentConsultantId] = useState<string | null>(null);
    const [editDetails, setEditDetails] = useState<Partial<Lead>>({});
    const [isFinishing, setIsFinishing] = useState(false);
    const [lossReason, setLossReason] = useState('');
    const [lossSummary, setLossSummary] = useState('');
    const [isAddingLead, setIsAddingLead] = useState(false);
    const [isRecordingSale, setIsRecordingSale] = useState(false);
    const [saleData, setSaleData] = useState({
        vehicle_details: ''
    });
    const [isRecordingPurchase, setIsRecordingPurchase] = useState(false);
    const [purchaseData, setPurchaseData] = useState({
        vehicle_details: '',
        purchase_value: ''
    });
    const [isSubmittingCallSummary, setIsSubmittingCallSummary] = useState(false);
    const [callSummary, setCallSummary] = useState('');
    const [newLeadData, setNewLeadData] = useState({
        name: '',
        phone: '',
        vehicle_interest: '',
        valor_investimento: '',
        carro_troca: ''
    });
    const [newNoteText, setNewNoteText] = useState('');
    const [modalTab, setModalTab] = useState<'details' | 'karbam' | 'analysis' | 'timeline' | 'next_steps' | 'flow-up' | 'forms'>('details');
    const [followupContext, setFollowupContext] = useState('');
    const [isGeneratingFollowup, setIsGeneratingFollowup] = useState(false);
    const [generatedFollowup, setGeneratedFollowup] = useState('');
    const [pastedImage, setPastedImage] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<{ name: string; data: string; mimeType: string }[]>([]);
    const [structuredAnalysis, setStructuredAnalysis] = useState<{
        intencao_compra?: string;
        estagio_negociacao?: string;
        objecoes?: string;
        recomendacao_abordagem?: string;
    } | null>(null);

    const [reactivationDiagnosis, setReactivationDiagnosis] = useState<{
        resumo_estrategico?: string;
        intencao_compra?: string;
        motivo_perda?: string;
        oportunidade?: string;
    } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const whatsappFolderInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
    const analysisLockRef = useRef<string | null>(null); // Prevents circular IA analysis loops

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
        message: '',
        type: 'info',
        visible: false
    });
    const [moveMenuDirection, setMoveMenuDirection] = useState<'up' | 'down'>('down');
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [showVehicleResults, setShowVehicleResults] = useState(false);
    const [tick, setTick] = useState(0);

    const isMobile = useIsMobile();
    const lastScrollTime = useRef(0);

    // Update 'tick' every minute to refresh time counters
    useEffect(() => {
        const interval = setInterval(() => {
            setTick(t => t + 1);
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type, visible: true });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
    };

    const handleLeadSmartClick = (lead: Lead) => {
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
            // Double Click: Action Center (Centro de Gestão)
            setActionLead(lead);
            setSelectedLead(null);
            setIsFinishing(false);
        } else {
            clickTimerRef.current = setTimeout(() => {
                // Single Click: Simple Info (Painel de Atendimento)
                setSelectedLead(lead);
                setActionLead(null);
                clickTimerRef.current = null;
            }, 300);
        }
    };

    // Initialize edit details when action lead changes
    useEffect(() => {
        if (actionLead) {
            setEditDetails({
                name: actionLead.name || '',
                phone: actionLead.phone || '',
                vehicle_interest: actionLead.vehicle_interest || '',
                carro_troca: actionLead.carro_troca || '',
                valor_investimento: actionLead.valor_investimento || '',
                scheduled_at: actionLead.scheduled_at || '',
                ai_summary: actionLead.ai_summary || '',
                ai_reason: actionLead.ai_reason || ''
            });

            // Auto-load synced WhatsApp messages for AI Lab
            if (actionLead.id) {
                dataService.getLeadMessages(actionLead.id).then(messages => {
                    if (messages && messages.length > 0) {
                        const chatLog = messages.map((m: any) =>
                            `[${m.direction === 'outbound' ? 'Vendedor' : 'Cliente'}]: ${m.message_text}`
                        ).join('\n');
                        setChatText(chatLog);

                        // Trigger auto-analysis only if lead is "virgin" AND not already being analyzed
                        if ((!actionLead.ai_summary || actionLead.ai_summary.trim() === '') && analysisLockRef.current !== actionLead.id) {
                            console.log("Auto-initiating AI Analysis for freshly synced chat...");
                            setPendingAutoAnalysis(chatLog);
                        }
                    } else {
                        setChatText('');
                    }
                }).catch(err => {
                    console.error("Erro ao carregar mensagens sincronizadas", err);
                    setChatText('');
                });
            }
        }
    }, [actionLead?.id]); // Depend only on actionLead.id to avoid loops when other fields change

    // Executa a auto-análise quando a flag é ativada
    useEffect(() => {
        if (pendingAutoAnalysis) {
            analyzeConversation(pendingAutoAnalysis);
            setPendingAutoAnalysis(null);
        }
    }, [pendingAutoAnalysis]);

    const handleSaveDetails = async () => {
        if (!actionLead) return;
        setIsSavingDetails(true);
        try {
            // Clean up details before saving
            const detailsToSave: Partial<Lead> = { ...editDetails };

            // Only admins can change name/phone
            if (userRole !== 'admin') {
                delete (detailsToSave as any).name;
                delete (detailsToSave as any).phone;
            }

            // If we are scheduling or rescheduling, update status and log it
            if (detailsToSave.scheduled_at && detailsToSave.scheduled_at !== actionLead.scheduled_at) {
                detailsToSave.status = 'scheduled' as LeadStatus;

                const schedDate = new Date(detailsToSave.scheduled_at);
                const formattedSched = schedDate.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });

                const schedNote = `📅 AGENDAMENTO REALIZADO PARA: ${formattedSched}`;
                detailsToSave.ai_summary = detailsToSave.ai_summary
                    ? `${schedNote}\n\n${detailsToSave.ai_summary}`
                    : schedNote;
            }

            // Remove empty date strings to prevent DB errors
            if (!detailsToSave.scheduled_at) {
                delete (detailsToSave as any).scheduled_at;
            }

            // If we are saving a new note, append it to the history with timestamp
            if (newNoteText.trim()) {
                const now = new Date();
                const timestamp = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const consultantPrefix = userName ? `[${userName}] ` : '';
                const newNote = newNoteText.trim();

                detailsToSave.ai_summary = detailsToSave.ai_summary
                    ? `${detailsToSave.ai_summary}\n\n${consultantPrefix}${timestamp}: ${newNote}`
                    : `${consultantPrefix}${timestamp}: ${newNote}`;
            }

            // Save lead details to database
            await dataService.updateLeadDetails(actionLead.id, detailsToSave);

            const finalUpdatedLead = { ...actionLead, ...detailsToSave };
            setLeads(prev => prev.map(l => l.id === actionLead.id ? finalUpdatedLead : l));
            setActionLead(finalUpdatedLead);
            if (selectedLead?.id === actionLead.id) setSelectedLead(finalUpdatedLead);

            setNewNoteText('');
            showToast("Dados atualizados com sucesso!", "success");
        } catch (err: any) {
            console.error("Error saving lead details:", err);
            showToast(`Erro ao salvar alterações: ${err.message || 'Erro desconhecido'}`, "error");
        } finally {
            setIsSavingDetails(false);
        }
    };

    const handleCallSummary = async () => {
        if (!actionLead || !callSummary) return;

        try {
            const now = new Date();
            const timestamp = now.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const newHistoryItem = `📞 LIGAÇÃO FEITA EM ${timestamp}\nRESUMO: ${callSummary}`;

            const updatedSummary = actionLead.ai_summary
                ? `${newHistoryItem}\n\n${actionLead.ai_summary}`
                : newHistoryItem;

            await dataService.updateLeadDetails(actionLead.id, { ai_summary: updatedSummary });

            // Update local state
            setActionLead(prev => prev ? { ...prev, ai_summary: updatedSummary } : null);
            setLeads(prev => prev.map(l => l.id === actionLead.id ? { ...l, ai_summary: updatedSummary } : l));

            setCallSummary('');
            setIsSubmittingCallSummary(false);
        } catch (err) {
            console.error("Error saving call summary:", err);
            showToast("Erro ao salvar resumo da ligação.", "error");
        }
    };

    const handleGenerateFollowup = async () => {
        if (!actionLead) return;

        setIsGeneratingFollowup(true);
        try {
            const response = await fetch('/api/generate-followup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadName: actionLead.name,
                    context: followupContext,
                    lastInteractions: actionLead.ai_summary,
                    vehicle: actionLead.vehicle_interest,
                    image: pastedImage
                })
            });

            const data = await response.json();
            if (data.success) {
                setGeneratedFollowup(data.mensagem || data.message);
                setReactivationDiagnosis({
                    resumo_estrategico: data.resumo_estrategico,
                    intencao_compra: data.intencao_compra,
                    motivo_perda: data.motivo_perda,
                    oportunidade: data.oportunidade
                });
                showToast("Dossiê de reativação gerado com sucesso!", "success");
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            console.error("Follow-up error:", err);
            showToast("Erro ao gerar reativação automática.", "error");
            // Set a dummy value to prevent automatic re-triggering this session
            setGeneratedFollowup("FAILED_TO_GENERATE");
        } finally {
            setIsGeneratingFollowup(false);
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (!blob) continue;

                const reader = new FileReader();
                reader.onload = (event: any) => {
                    setPastedImage(event.target.result);
                    showToast("Print colado com sucesso!", "success");
                };
                reader.readAsDataURL(blob);
            }
        }
    };

    const getWhatsAppMessage = (lead: Lead, type: 'initial' | 'stage' | 'flowup' = 'stage') => {
        const firstName = lead.name.split(' ')[0];
        const consultantFirstName = (userName || 'Consultor').trim().split(' ')[0];
        const vehicle = lead.vehicle_interest || 'um veículo do nosso estoque';

        let message = '';

        if (type === 'initial') {
            message = `Olá ${firstName}! Tudo bem? Sou ${consultantFirstName} da Manos Veículos. Vimos seu interesse no ${vehicle} e gostaria de saber: como posso te ajudar hoje?`;
        } else {
            switch (lead.status) {
                case 'new':
                case 'received':
                    message = `Olá ${firstName}! Tudo bem? Sou ${consultantFirstName} da Manos Veículos. Vimos seu interesse no ${vehicle} e gostaria de saber: como posso te ajudar hoje?`;
                    break;
                case 'scheduled':
                    const dateStr = lead.scheduled_at ? new Date(lead.scheduled_at).toLocaleDateString('pt-BR') : '';
                    const hourStr = lead.scheduled_at ? new Date(lead.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                    message = `Olá ${firstName}! Sou ${consultantFirstName}. Confirmando nosso agendamento para ver o ${vehicle} no dia ${dateStr} às ${hourStr}. Esperamos você!`;
                    break;
                case 'negotiation':
                case 'proposed':
                    message = `Olá ${firstName}! Sou ${consultantFirstName} da Manos Veículos. Estava revendo nossa negociação sobre o ${vehicle} e consegui uma condição melhor para fecharmos hoje. O que você acha?`;
                    break;
                default:
                    message = `Olá ${firstName}! Tudo bem? Sou ${consultantFirstName} da Manos Veículos. Gostaria de dar continuidade ao nosso atendimento sobre o ${vehicle}.`;
            }
        }

        // SANITIZE: Remove emojis and hyphens
        return message
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .replace(/-/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const handleClearNotes = async () => {
        if (!actionLead) return;
        if (!confirm("Tem certeza que deseja apagar todo o histórico de notas deste lead?")) return;

        try {
            await dataService.updateLeadDetails(actionLead.id, { ai_summary: '' });

            setLeads(prev => prev.map(l => l.id === actionLead.id ? { ...l, ai_summary: '' } : l));
            if (selectedLead?.id === actionLead.id) {
                setSelectedLead(prev => prev ? { ...prev, ai_summary: '' } : null);
            }
            setActionLead(prev => prev ? { ...prev, ai_summary: '' } : null);
            setEditDetails({ ...editDetails, ai_summary: '' });

            alert("Histórico de notas removido.");
        } catch (err: any) {
            alert(`Erro ao apagar notas: ${err.message}`);
        }
    };

    const handleCloseLead = async (desfecho: LeadStatus) => {
        if (!actionLead) return;
        try {
            const desfechoLabels: Record<string, string> = {
                'lost': 'PERDIDO / DESCARTE',
                'closed': 'VENDA REALIZADA',
                'comprado': 'COMPRA REALIZADA'
            };
            const logNote = `🏁 ATENDIMENTO FINALIZADO: ${desfechoLabels[desfecho] || desfecho.toUpperCase()}
${lossReason ? `Motivo: ${lossReason}` : ''}
${lossSummary ? `Resumo/Contexto: ${lossSummary}` : ''}`.trim();

            const updatedSummary = actionLead.ai_summary
                ? `${logNote}\n\n${actionLead.ai_summary}`
                : logNote;

            await dataService.updateLeadStatus(actionLead.id, desfecho, actionLead.status, logNote, lossReason, lossSummary);
            await dataService.updateLeadDetails(actionLead.id, { ai_summary: updatedSummary });

            setLeads(prev => prev.map(l => l.id === actionLead.id ? { ...l, status: desfecho, ai_summary: updatedSummary } : l));
            setActionLead(null);
            setIsFinishing(false);
            setLossReason('');
            setLossSummary('');

            alert(`Atendimento finalizado com sucesso!`);
        } catch (err: any) {
            console.error("Error closing lead:", err);
            alert(`Erro ao finalizar atendimento: ${err.message}`);
        }
    };

    const handleRecordSale = async () => {
        if (!actionLead) return;
        if (!saleData.vehicle_details || saleData.vehicle_details.trim() === '') {
            alert("Por favor, preencha os detalhes do veículo.");
            return;
        }

        try {
            console.log("DEBUG handleRecordSale (UI): ", {
                actionLeadId: actionLead.id,
                actionLeadConsultantId: actionLead.assigned_consultant_id,
                currentConsultantId: currentConsultantId,
                saleDataVehicle: saleData.vehicle_details
            });

            // Call Server Action to handle promotion and sale recording in one robust step
            const result = await recordSaleAction(
                {
                    ...actionLead,
                    vehicle_interest: saleData.vehicle_details || actionLead.vehicle_interest,
                    status: 'closed'
                },
                {
                    consultant_id: currentConsultantId || actionLead.assigned_consultant_id,
                    sale_value: 0,
                    profit_margin: 0
                }
            );

            if (!result.success) throw new Error(result.error || "Falha ao registrar venda no servidor.");

            // Update local state with the promoted lead data if needed
            if (result.lead) {
                setLeads(prev => prev.map(l => l.id === actionLead.id ? result.lead! : l));
            }

            await handleCloseLead('closed');
            setIsRecordingSale(false);
            setSaleData({ vehicle_details: '' });
            showToast("Venda registrada com sucesso!", "success");
        } catch (err: any) {
            console.error("Error recording sale:", err);
            alert(`Erro ao registrar venda: ${err.message}`);
        }
    };

    const handleRecordPurchase = async () => {
        if (!actionLead) return;
        if (!purchaseData.purchase_value || !purchaseData.vehicle_details) {
            alert("Por favor, preencha o veículo e o valor da compra.");
            return;
        }

        try {
            const purchase_value_num = parseFloat(purchaseData.purchase_value.replace(/\D/g, '')) / 100;

            // Call Server Action to handle promotion and purchase recording
            const result = await recordPurchaseAction(
                {
                    ...actionLead,
                    vehicle_interest: purchaseData.vehicle_details || actionLead.vehicle_interest,
                    status: 'comprado'
                },
                {
                    consultant_id: currentConsultantId || actionLead.assigned_consultant_id,
                    vehicle_details: purchaseData.vehicle_details,
                    purchase_value: purchase_value_num
                }
            );

            if (!result.success) throw new Error(result.error || "Falha ao registrar compra no servidor.");

            // Update local state
            if (result.lead) {
                setLeads(prev => prev.map(l => l.id === actionLead.id ? result.lead! : l));
            }

            await handleCloseLead('comprado');
            setIsRecordingPurchase(false);
            setPurchaseData({ vehicle_details: '', purchase_value: '' });
            showToast("Compra registrada com sucesso!", "success");
        } catch (err: any) {
            console.error("Error recording purchase:", err);
            alert(`Erro ao registrar compra: ${err.message}`);
        }
    };

    const handleDeleteLead = async () => {
        if (!actionLead) return;
        if (userRole !== 'admin') {
            alert("Apenas administradores podem excluir leads.");
            return;
        }

        if (!confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE o lead ${actionLead.name}? Esta ação não pode ser desfeita.`)) {
            return;
        }

        try {
            await dataService.deleteLead(actionLead.id);
            setLeads(prev => prev.filter(l => l.id !== actionLead.id));
            if (selectedLead?.id === actionLead.id) setSelectedLead(null);
            setActionLead(null);
            showToast("Lead removido com sucesso!", "success");
        } catch (err: any) {
            console.error("Error deleting lead:", err);
            alert(`Erro ao excluir lead: ${err.message || 'Erro desconhecido'}`);
        }
    };




    const formatCurrencyInput = (val: string) => {
        const digits = val.replace(/\D/g, '');
        if (!digits) return '';
        const number = parseInt(digits) / 100;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(number);
    };


    // Update view mode if URL changes
    useEffect(() => {
        if (viewFromUrl === 'kanban') setViewMode('kanban');
        else if (viewFromUrl === 'list') setViewMode('list');

        if (stageFromUrl) setFilterStage(stageFromUrl);
    }, [viewFromUrl, stageFromUrl]);


    useEffect(() => {
        async function loadLeads() {
            setLoading(true);
            try {
                // Get current user session
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                // Get consultant profile to check role and database ID
                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, role, name')
                    .eq('auth_id', session.user.id)
                    .single();

                let consultantFilter = undefined;
                const isAdmin = consultant?.role === 'admin' || session.user.email === 'alexandre_gorges@hotmail.com';

                if (consultant) {
                    setUserRole(isAdmin ? 'admin' : (consultant.role || 'consultant'));
                    setUserName(consultant.name?.split(' ')[0] || '');
                    setCurrentConsultantId(consultant.id);
                    if (!isAdmin && consultant.role === 'consultant') {
                        consultantFilter = consultant.id;
                    }
                } else {
                    setUserRole('consultant');
                    setUserName('');
                    setCurrentConsultantId(null);
                }

                // PERF: Fetch leads, consultants & inventory in PARALLEL
                const [data, consultantsData, inventoryData] = await Promise.all([
                    dataService.getLeads(consultantFilter, leadIdFromUrl || undefined),
                    isAdmin ? dataService.getConsultants() : Promise.resolve(null),
                    dataService.getInventory()
                ]);

                setLeads(data || []);
                if (consultantsData) setConsultants(consultantsData);
                setInventory(inventoryData || []);

                if (leadIdFromUrl && data) {
                    // Try to find by prefixed ID first, then by raw ID
                    const lead = data.find((l: Lead) => 
                        l.id === leadIdFromUrl || 
                        l.id === `main_${leadIdFromUrl}` || 
                        l.id === `crm26_${leadIdFromUrl}`
                    );
                    if (lead) {
                        if (tabFromUrl) {
                            // Ensure it's a valid tab
                            const validTabs = ['details', 'karbam', 'analysis', 'timeline', 'next_steps', 'flow-up', 'forms'];
                            if (validTabs.includes(tabFromUrl)) {
                                setModalTab(tabFromUrl as any);
                            } else {
                                setModalTab('details');
                            }
                        } else {
                            setModalTab('details');
                        }
                        setActionLead(lead);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }
            } catch (err) {
                console.error("Error loading leads:", err);
            } finally {
                setLoading(false);
            }
        }
        loadLeads();
    }, [leadIdFromUrl, tabFromUrl]);

    // Auto-trigger analysis for re-activation
    useEffect(() => {
        if (modalTab === 'flow-up' && actionLead && !generatedFollowup && !isGeneratingFollowup) {
            handleGenerateFollowup();
        }
    }, [modalTab, actionLead]);


    // URL based actions
    useEffect(() => {
        const addMode = searchParams.get('add');
        if (addMode === 'true') {
            setIsAddingLead(true);
        }
    }, [searchParams.get('add')]); // Depende apenas do parâmetro 'add'

    const handleAssignConsultant = async (leadId: string, consultantId: string) => {
        try {
            await dataService.assignConsultant(leadId, consultantId);
            const consultantName = consultants.find(c => c.id === consultantId)?.name || 'Consultor';
            setLeads(prev => prev.map(l => l.id === leadId ? {
                ...l,
                assigned_consultant_id: consultantId,
                consultants_manos_crm: { name: consultantName }
            } : l));

            if (actionLead?.id === leadId) {
                setActionLead(prev => prev ? {
                    ...prev,
                    assigned_consultant_id: consultantId,
                    consultants_manos_crm: { name: consultantName }
                } : null);
            }
            alert(`Lead atribuído para ${consultantName} com sucesso!`);
        } catch (err) {
            console.error("Error assigning consultant:", err);
            alert("Erro ao atribuir consultor.");
        }
    };

    const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
        const lead = leads.find(l => l.id === leadId);
        if (!lead) return;

        // If moving to closed, comprado or lost, trigger the finishing flow
        if (newStatus === 'closed') {
            setActionLead(lead);
            setIsRecordingSale(true);
            setSaleData({ vehicle_details: lead.vehicle_interest || '' });
            return;
        }

        if (newStatus === 'comprado') {
            setActionLead(lead);
            setIsRecordingPurchase(true);
            setPurchaseData({ vehicle_details: lead.vehicle_interest || '', purchase_value: lead.valor_investimento || '' });
            return;
        }

        if (newStatus === 'lost') {
            setActionLead(lead);
            setIsFinishing(true);
            setLossReason('');
            setLossSummary('');
            return;
        }

        try {
            // Optimistic UI update
            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
            if (selectedLead?.id === leadId) setSelectedLead({ ...lead, status: newStatus });

            // Call Server Action for terminal logging and Meta conversion
            await updateLeadStatusAction(leadId, newStatus, lead.status);

            // Still update locally just in case dataService cache needs invalidation (if used elsewhere)
            // await dataService.updateLeadStatus(leadId, newStatus, lead.status); 
        } catch (err) {
            console.error("Error updating status:", err);
            alert("Erro ao atualizar status do lead.");

            // Rollback optimistic update
            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: lead.status } : l));
        }
    };

    const handleScroll = () => {
        const now = Date.now();
        if (now - lastScrollTime.current < 32) return; // ~30fps throttle
        lastScrollTime.current = now;

        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
            const progress = (scrollLeft / (scrollWidth - clientWidth)) * 100;
            setScrollProgress(progress || 0);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsAnalyzing(true);
        const filesArray = Array.from(files);
        const newAttachments: { name: string; data: string; mimeType: string }[] = [];

        try {
            let localChatText = '';
            for (const file of filesArray) {
                // Se for ZIP, extraímos os conteúdos
                if (file.name.toLowerCase().endsWith('.zip')) {
                    showToast("Extraindo arquivos do ZIP...", "info");
                    const zip = new JSZip();
                    const content = await zip.loadAsync(file);

                    const sortedFiles = Object.entries(content.files).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
                    for (const [filename, zipEntry] of sortedFiles) {
                        if (zipEntry.dir) continue;

                        // Ignorar arquivos de sistema
                        if (filename.startsWith('__MACOSX/') || filename.includes('.DS_Store')) continue;

                        const blob = await zipEntry.async('blob');
                        const base64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });

                        newAttachments.push({
                            name: filename,
                            data: base64,
                            mimeType: blob.type || getMimeTypeFromFilename(filename)
                        });

                        // Tentar carregar como texto se não for um arquivo obviamente binário
                        const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.rar', '.exe', '.dll', '.bin'];
                        const isBinary = binaryExtensions.some(ext => filename.toLowerCase().endsWith(ext));

                        if (!isBinary) {
                            try {
                                const text = await zipEntry.async('text');
                                if (text.trim().length > 2) {
                                    setChatText(prev => prev ? prev + "\n\n--- ARQUIVO: " + filename + " ---\n" + text : text);
                                    localChatText = localChatText ? localChatText + "\n\n--- ARQUIVO: " + filename + " ---\n" + text : text;
                                }
                            } catch (e) {
                                console.log(`Skipping potential binary file ${filename}`);
                            }
                        }
                    }
                } else {
                    // Arquivo individual
                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });

                    newAttachments.push({
                        name: file.name,
                        data: base64,
                        mimeType: file.type || getMimeTypeFromFilename(file.name)
                    });

                    // Se for formato de texto (não binário)
                    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.rar', '.exe', '.dll', '.bin'];
                    const isBinary = binaryExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
                    const isTextFile = !isBinary || (file.size < 100000 && file.type.startsWith('text/'));

                    if (isTextFile) {
                        const text = await file.text();
                        if (text.trim().length > 5) {
                            setChatText(text);
                            localChatText = text;
                        }
                    }
                }
            }

            setAttachments(prev => [...prev, ...newAttachments]);
            showToast(`${newAttachments.length} arquivos carregados!`, "success");

            // Automatizar análise se houver texto
            if (localChatText || chatText) {
                showToast("Iniciando análise automática...", "info");
                setTimeout(() => {
                    analyzeConversation(localChatText || chatText, newAttachments);
                }, 500);
            }

        } catch (err: any) {
            console.error("Upload Error:", err);
            showToast(`Erro ao carregar arquivos: ${err.message || 'Erro desconhecido'}`, "error");
        } finally {
            setIsAnalyzing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const getMimeTypeFromFilename = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'txt': return 'text/plain';
            case 'jpg':
            case 'jpeg': return 'image/jpeg';
            case 'png': return 'image/png';
            case 'mp3': return 'audio/mpeg';
            case 'wav': return 'audio/wav';
            case 'm4a': return 'audio/mp4';
            case 'mp4': return 'video/mp4';
            default: return 'application/octet-stream';
        }
    };

    const handleWhatsAppFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || userRole !== 'admin') return;

        setIsAnalyzing(true);
        showToast("Iniciando processamento da pasta WhatsApp...", "info");

        try {
            const filesArray = Array.from(files);
            let chatFile: File | Blob | undefined = filesArray.find(f => f.name.toLowerCase().includes('chat.txt') || f.name.toLowerCase().includes('_chat.txt'));
            let virtualFolderName = "";
            let zipAttachments: { name: string; data: string; mimeType: string }[] = [];
            let extractedChatText = "";

            if (filesArray.some(f => f.name.toLowerCase().endsWith('.zip'))) {
                const zipFile = filesArray.find(f => f.name.toLowerCase().endsWith('.zip'))!;
                showToast("Extraindo ZIP...", "info");
                const zip = new JSZip();
                const content = await zip.loadAsync(zipFile);

                const sortedFiles = Object.entries(content.files).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
                for (const [filename, zipEntry] of sortedFiles) {
                    if (zipEntry.dir) continue;

                    // Ignorar arquivos de sistema
                    if (filename.startsWith('__MACOSX/') || filename.includes('.DS_Store')) continue;

                    const blob = await zipEntry.async('blob');
                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });

                    zipAttachments.push({
                        name: filename,
                        data: base64,
                        mimeType: blob.type || getMimeTypeFromFilename(filename)
                    });

                    // Tentar carregar como texto se não for um arquivo obviamente binário
                    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.rar', '.exe', '.dll', '.bin'];
                    const isBinary = binaryExtensions.some(ext => filename.toLowerCase().endsWith(ext));

                    if (!isBinary) {
                        try {
                            const text = await zipEntry.async('text');
                            if (text.trim().length > 2) {
                                extractedChatText = extractedChatText ? extractedChatText + "\n\n--- ARQUIVO: " + filename + " ---\n" + text : text;
                            }
                        } catch (e) {
                            console.log(`Skipping potential binary file ${filename}`);
                        }
                    }
                }
                virtualFolderName = zipFile.name.replace('.zip', '');
            } else {
                // Se não for ZIP, extrair arquivos individuais da pasta selecionada
                for (const file of filesArray) {
                    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.rar', '.exe', '.dll', '.bin'];
                    const isBinary = binaryExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });

                    zipAttachments.push({
                        name: file.name,
                        data: base64,
                        mimeType: file.type || getMimeTypeFromFilename(file.name)
                    });

                    if (!isBinary || (file.size < 100000 && file.type.startsWith('text/'))) {
                        try {
                            const text = await file.text();
                            if (text.trim().length > 5) {
                                extractedChatText = extractedChatText ? extractedChatText + "\n\n--- ARQUIVO: " + file.name + " ---\n" + text : text;
                            }
                        } catch (e) {
                            console.log(`Error reading file ${file.name} as text`);
                        }
                    }
                }
            }

            if (!extractedChatText) {
                showToast("Nenhum conteúdo de texto encontrado para análise.", "error");
                setIsAnalyzing(false);
                return;
            }

            // Extrair contato do nome da pasta
            // filesArray[0] costuma ter o webkitRelativePath se for pasta
            const folderPath = filesArray[0]?.webkitRelativePath || '';
            const folderName = folderPath ? folderPath.split('/')[0] : virtualFolderName;

            // Limpar nome e telefone
            let contactName = "Lead WhatsApp";
            let contactPhone = "";

            const phoneMatch = folderName.match(/\+?(\d[\s\-\(\).]{0,2}){8,}\d/);
            if (phoneMatch) {
                contactPhone = phoneMatch[0].replace(/[\s\-\(\).]/g, '');
                contactName = folderName.replace(phoneMatch[0], '').replace(/[-_]/g, ' ').trim() || "Lead WhatsApp";
            } else {
                contactName = folderName.replace(/[-_]/g, ' ').trim() || "Lead WhatsApp";
            }

            const chatTextToUse = extractedChatText;

            if (!chatTextToUse) throw new Error("O arquivo de conversa está vazio.");

            // Create lead with WA source
            const newLead = await dataService.createLead({
                name: contactName,
                phone: contactPhone || '999999999',
                source: 'WhatsApp',
                status: 'new',
                ai_classification: 'warm',
                ai_score: 0
            });

            if (newLead) {
                // Trigger AI Analysis for the new lead
                let aiResult: any = { classificacao: 'WARM', score: 0, success: false };
                try {
                    const aiResponse = await fetch('/api/analyze-chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            leadId: newLead.id,
                            chatText: chatTextToUse,
                            leadName: contactName,
                            attachments: zipAttachments
                        })
                    });

                    if (aiResponse.ok) {
                        const res = await aiResponse.json();
                        aiResult = res;
                    }
                } catch (aiErr) {
                    console.warn("Auto-analysis failed during folder import:", aiErr);
                }

                // Append to historical summary with timestamp
                const timestamp = new Date().toLocaleString('pt-BR');
                const historicalNote = `[${timestamp}] ANÁLISE DE ENTRADA (IA):\n` +
                    `🎯 Intenção: ${aiResult.intencao_compra || 'Não avaliada'}\n` +
                    `📊 Estágio: ${aiResult.estagio_negociacao || 'Não avaliado'}\n` +
                    `⚠️ Objeções: ${aiResult.objecoes || 'Nenhuma detectada'}\n` +
                    `⚡ Ação (Script): ${aiResult.recomendacao_abordagem || 'Continuar atendimento'}\n` +
                    `📌 Resumo Executivo: ${aiResult.resumo_estrategico || aiResult.ai_reason || 'N/A'}\n` +
                    `🔎 Detalhes: ${aiResult.resumo_detalhado || 'N/A'}\n\n`;

                const finalLead: Lead = {
                    ...(newLead as Lead),
                    name: aiResult.extracted_name || (newLead as Lead).name,
                    ai_summary: `${(newLead as Lead).ai_summary || ''}\n\n${historicalNote}`.trim(),
                    ai_score: aiResult.score !== undefined ? aiResult.score : 0,
                    ai_classification: (aiResult.classificacao?.toLowerCase() || 'warm') as AIClassification,
                    ai_reason: aiResult.resumo_estrategico || aiResult.ai_reason,
                    next_step: aiResult.proxima_acao || aiResult.next_step,
                    behavioral_profile: {
                        ...(aiResult.behavioral_profile || {}),
                        funnel_stage: aiResult.estagio_funil,
                        closing_probability: aiResult.probabilidade_fechamento
                    } as any,
                    vehicle_interest: aiResult.vehicle_interest || (newLead as Lead).vehicle_interest,
                    valor_investimento: aiResult.valor_investimento || (newLead as Lead).valor_investimento,
                    carro_troca: aiResult.carro_troca || (newLead as Lead).carro_troca,
                    metodo_compra: aiResult.metodo_compra || (newLead as Lead).metodo_compra,
                    prazo_troca: aiResult.prazo_troca || (newLead as Lead).prazo_troca
                };

                // Update details with AI result (only if we have meaningful data)
                if (aiResult.success) {
                    await dataService.updateLeadDetails(finalLead.id, {
                        name: finalLead.name,
                        ai_summary: finalLead.ai_summary,
                        ai_score: finalLead.ai_score,
                        ai_classification: finalLead.ai_classification,
                        ai_reason: finalLead.ai_reason,
                        behavioral_profile: finalLead.behavioral_profile as any,
                        vehicle_interest: finalLead.vehicle_interest,
                        valor_investimento: finalLead.valor_investimento,
                        carro_troca: finalLead.carro_troca,
                        metodo_compra: finalLead.metodo_compra,
                        prazo_troca: finalLead.prazo_troca,
                        next_step: finalLead.next_step
                    });
                }

                setLeads(prev => [finalLead, ...prev]);
                setIsAddingLead(false);
                setActionLead(finalLead);
                showToast("Dossier WhatsApp importado e analisado!", "success");
            }
        } catch (err: any) {
            console.error("WA Folder Import Error Details:", {
                message: err.message,
                code: err.code,
                details: err.details,
                hint: err.hint,
                err: err
            });
            showToast(`Erro ao importar pasta: ${err.message || "Erro desconhecido"}`, "error");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const analyzeConversation = async (overrideText?: string, overrideAttachments?: any[]) => {
        const textToUse = overrideText || chatText;
        const attachmentsToUse = overrideAttachments || attachments;

        if (!textToUse || textToUse.length < 10) return;

        const leadToAnalyze = actionLead || selectedLead;
        if (!leadToAnalyze) {
            alert("Nenhum lead selecionado para análise.");
            return;
        }

        setIsAnalyzing(true);
        analysisLockRef.current = leadToAnalyze.id; // Lock this lead to prevent re-triggering analysis

        try {
            const response = await fetch('/api/analyze-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId: leadToAnalyze.id,
                    chatText: textToUse,
                    leadName: leadToAnalyze.name,
                    attachments: attachmentsToUse
                })
            });

            const aiResult = await response.json();

            if (response.ok) {
                // Append to historical summary with timestamp
                const timestamp = new Date().toLocaleString('pt-BR');
                const currentHistory = leadToAnalyze.ai_summary || '';

                const newNote = `[${timestamp}] ANÁLISE CIRÚRGICA DE IA:\n` +
                    `🎯 Intenção: ${aiResult.intencao_compra || 'Não avaliada'}\n` +
                    `📊 Estágio: ${aiResult.estagio_negociacao || 'Não avaliado'}\n` +
                    `⚠️ Objeções: ${aiResult.objecoes || 'Nenhuma detectada'}\n` +
                    `⚡ Ação (Script): ${aiResult.recomendacao_abordagem || 'Continuar atendimento'}\n` +
                    `📌 Resumo Executivo: ${aiResult.resumo_estrategico || aiResult.ai_reason || 'N/A'}\n` +
                    `🔎 Detalhes: ${aiResult.resumo_detalhado || 'N/A'}\n\n`;

                // Prepare details with behavioral data and auto-filled fields
                const updatedFields = {
                    ai_score: aiResult.score !== undefined ? aiResult.score : 0,
                    ai_classification: (aiResult.classificacao?.toLowerCase() || 'warm'),
                    ai_reason: aiResult.resumo_estrategico || aiResult.ai_reason,
                    ai_summary: newNote + currentHistory, // Prepend latest
                    behavioral_profile: {
                        ...(aiResult.behavioral_profile || {}),
                        funnel_stage: aiResult.estagio_funil,
                        closing_probability: aiResult.probabilidade_fechamento
                    },
                    next_step: aiResult.proxima_acao || aiResult.next_step,
                    // New fields for persistence in CRM26 table
                    nivel_interesse: aiResult.classificacao || 'WARM',
                    momento_compra: aiResult.estagio_funil || 'Qualificação',
                    resumo_consultor: aiResult.resumo_estrategico || aiResult.ai_reason,
                    proxima_acao: aiResult.proxima_acao || aiResult.next_step,

                    // Auto-fill extracted info if not already present
                    vehicle_interest: leadToAnalyze.vehicle_interest || aiResult.vehicle_interest,
                    valor_investimento: leadToAnalyze.valor_investimento || aiResult.valor_investimento,
                    carro_troca: leadToAnalyze.carro_troca || aiResult.carro_troca,
                    metodo_compra: leadToAnalyze.metodo_compra || aiResult.metodo_compra,
                    prazo_troca: leadToAnalyze.prazo_troca || aiResult.prazo_troca,
                    name: aiResult.extracted_name || leadToAnalyze.name
                };

                await dataService.updateLeadDetails(leadToAnalyze.id, updatedFields);

                const updatedLead: Lead = {
                    ...leadToAnalyze,
                    ...updatedFields
                };

                setLeads(prev => prev.map(l => l.id === leadToAnalyze.id ? updatedLead : l));
                if (actionLead?.id === leadToAnalyze.id) setActionLead(updatedLead);
                if (selectedLead?.id === leadToAnalyze.id) setSelectedLead(updatedLead);

                // Structured analysis UI display
                setStructuredAnalysis({
                    intencao_compra: aiResult.intencao_compra,
                    estagio_negociacao: aiResult.estagio_negociacao,
                    objecoes: aiResult.objecoes,
                    recomendacao_abordagem: aiResult.recomendacao_abordagem
                });

                setChatText('');
                alert("Análise concluída com sucesso! Comportamento e Próximo Passo atualizados.");
            } else {
                alert(`${aiResult.error || "Erro ao analisar conversa."}\n\nDetalhes: ${aiResult.details || aiResult.message || 'Sem detalhes'}`);
            }
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Analysis error:", error);
            alert(`Falha na conexão com o servidor de IA.\n\nDetalhes: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
            analysisLockRef.current = null;
        }
    };

    // Use useMemo for filtering leads - critical for performance on mobile
    const filteredLeads = React.useMemo(() => {
        return leads.filter(lead => {
            // 1. Text Search Filter
            const matchesSearch = lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                lead.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                lead.vehicle_interest?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                lead.source?.toLowerCase().includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            // 2. Date Filter
            if (filterDate !== 'all') {
                const leadDate = new Date(lead.created_at);

                if (filterDate === 'custom') {
                    if (customStartDate) {
                        const start = new Date(customStartDate);
                        start.setHours(0, 0, 0, 0);
                        if (leadDate < start) return false;
                    }
                    if (customEndDate) {
                        const end = new Date(customEndDate);
                        end.setHours(23, 59, 59, 999);
                        if (leadDate > end) return false;
                    }
                } else {
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - leadDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (filterDate === 'today' && diffDays > 1) return false;
                    if (filterDate === '7d' && diffDays > 7) return false;
                    if (filterDate === '30d' && diffDays > 30) return false;
                }
            }

            // 3. Consultant Filter
            if (filterConsultant !== 'all') {
                if (filterConsultant === 'unassigned') {
                    if (lead.assigned_consultant_id) return false;
                } else if (lead.assigned_consultant_id !== filterConsultant) {
                    return false;
                }
            }

            // 4. Kanban Stage Filter
            if (filterStage !== 'all') {
                if (filterStage === 'lost' && lead.status === 'lost_redistributed') {
                    // Keep it
                } else if (lead.status !== filterStage) {
                    return false;
                }
            }

            // 5. Interest Filter (AI Classification)
            if (filterInterest !== 'all') {
                if (lead.ai_classification !== filterInterest) return false;
            }

            // 6. Score Filter
            if (filterScore !== 'all') {
                const score = lead.ai_score || 0;
                if (filterScore === 'high' && score < 80) return false;
                if (filterScore === 'medium' && (score < 50 || score >= 80)) return false;
                if (filterScore === 'low' && score >= 50) return false;
            }

            // 7. Origin Filter
            if (filterOrigin !== 'all') {
                if (lead.origem !== filterOrigin) return false;
            }

            // 8. Brain URL Shortcuts
            if (urlFilter) {
                const diffHours = (new Date().getTime() - new Date(lead.updated_at || lead.created_at).getTime()) / (1000 * 60 * 60);

                if (urlFilter === 'hot') {
                    if (!((lead.behavioral_profile?.closing_probability || 0) > 70 || (lead.ai_score || 0) > 80)) return false;
                }
                if (urlFilter === 'neglected') {
                    if (diffHours <= 48) return false;
                }
                if (urlFilter === 'trade-in') {
                    if (!lead.carro_troca || lead.carro_troca.toLowerCase() === 'não' || lead.carro_troca.toLowerCase() === 'não informado') return false;
                }
                if (urlFilter === 'financing') {
                    if (!((lead.ai_summary || '').toLowerCase().includes('financia') || (lead.resumo_consultor || '').toLowerCase().includes('financia'))) return false;
                }
                if (urlFilter === 'recent') {
                    if (diffHours > 24) return false;
                }
            }

            return true;
        });
    }, [leads, searchTerm, filterDate, customStartDate, customEndDate, filterConsultant, filterStage, filterInterest, filterScore, filterOrigin, urlFilter]);

    // Intersection Observer for Infinite Scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => prev + 20);
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [filteredLeads.length]);

    // Reset visible count when filters change
    useEffect(() => {
        setVisibleCount(20);
    }, [searchTerm, filterDate, customStartDate, customEndDate, filterConsultant, filterStage, filterInterest, filterScore, filterOrigin, urlFilter]);

    // Slice to visible elements
    const visibleLeads = React.useMemo(() => {
        return filteredLeads.slice(0, visibleCount);
    }, [filteredLeads, visibleCount]);

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-20">
            {/* Header with Search and Stats */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                    <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white font-outfit">
                        Central de <span className="text-red-600">Leads</span>
                    </h1>
                    <p className="text-sm md:text-base text-white/40 font-medium italic">Gestão de funil comercial e integração direta com Meta Ads.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por nome, telefone, carro ou canal..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:bg-white/10 transition-all w-full md:w-80 font-medium"
                        />
                    </div>
                </div>
            </header>

            {/* Leads Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3 animate-in fade-in slide-in-from-top-4 duration-700">
                <div className={`flex items-center gap-2 transition-all ${filterDate === 'custom' ? 'bg-white/5 border border-white/10 rounded-xl px-2 h-[38px] hover:bg-white/10 focus-within:ring-1 focus-within:ring-red-500/50' : ''}`}>
                    <select
                        value={filterDate}
                        onChange={e => {
                            setFilterDate(e.target.value);
                            if (e.target.value !== 'custom') {
                                setCustomStartDate('');
                                setCustomEndDate('');
                            }
                        }}
                        className={`bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 text-[10px] md:text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-red-500/50 hover:bg-white/10 transition-colors cursor-pointer appearance-none pr-7 md:pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff40%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat w-full sm:w-auto ${filterDate === 'custom' ? 'border-none h-full bg-transparent pr-6 px-2 py-0 hover:bg-transparent rounded-none focus:ring-0' : ''}`}
                    >
                        <option value="all" className="bg-[#0a0a0a]">Todas as Datas</option>
                        <option value="today" className="bg-[#0a0a0a]">Hoje</option>
                        <option value="7d" className="bg-[#0a0a0a]">Últimos 7 dias</option>
                        <option value="30d" className="bg-[#0a0a0a]">Últimos 30 dias</option>
                        <option value="custom" className="bg-[#0a0a0a]">Personalizado...</option>
                    </select>

                    {filterDate === 'custom' && (
                        <div className="flex items-center gap-1 md:gap-2 pl-2 border-l border-white/10 h-full">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={e => setCustomStartDate(e.target.value)}
                                className="bg-transparent text-[10px] md:text-xs text-white/70 focus:outline-none cursor-pointer w-[90px] md:w-[110px]"
                            />
                            <span className="text-white/20 text-[10px]">/</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={e => setCustomEndDate(e.target.value)}
                                className="bg-transparent text-[10px] md:text-xs text-white/70 focus:outline-none cursor-pointer w-[90px] md:w-[110px]"
                            />
                        </div>
                    )}
                </div>

                {userRole === 'admin' && (
                    <select
                        value={filterConsultant}
                        onChange={e => setFilterConsultant(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 text-[10px] md:text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-red-500/50 hover:bg-white/10 transition-colors cursor-pointer appearance-none pr-7 md:pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff40%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat w-[calc(50%-0.5rem)] sm:w-auto"
                    >
                        <option value="all" className="bg-[#0a0a0a]">Vendedores</option>
                        <option value="unassigned" className="bg-[#0a0a0a] text-red-400">Sem Vendedor</option>
                        {consultants.map(c => (
                            <option key={c.id} value={c.id} className="bg-[#0a0a0a]">{c.name}</option>
                        ))}
                    </select>
                )}

                <select
                    value={filterStage}
                    onChange={e => setFilterStage(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 text-[10px] md:text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-red-500/50 hover:bg-white/10 transition-colors cursor-pointer appearance-none pr-7 md:pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff40%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat w-[calc(50%-0.5rem)] sm:w-auto"
                >
                    <option value="all" className="bg-[#0a0a0a]">Estágio (Todos)</option>
                    <option value="new" className="bg-[#0a0a0a]">Aguardando</option>
                    <option value="contacted" className="bg-[#0a0a0a]">Em Atendimento</option>
                    <option value="scheduled" className="bg-[#0a0a0a]">Agendamento</option>
                    <option value="visited" className="bg-[#0a0a0a]">Visita e Test Drive</option>
                    <option value="proposed" className="bg-[#0a0a0a]">Negociação</option>
                    <option value="closed" className="bg-[#0a0a0a]">Vendido</option>
                    <option value="lost" className="bg-[#0a0a0a]">Perda / Sem Contato</option>
                </select>

                <select
                    value={filterInterest}
                    onChange={e => setFilterInterest(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 text-[10px] md:text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-amber-500/50 hover:bg-white/10 transition-colors cursor-pointer appearance-none pr-7 md:pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff40%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat w-[calc(50%-0.5rem)] sm:w-auto"
                >
                    <option value="all" className="bg-[#0a0a0a]">Desejo (Qualquer)</option>
                    <option value="hot" className="bg-[#0a0a0a]">🔥 Altíssimo (Quente)</option>
                    <option value="warm" className="bg-[#0a0a0a]">⚡ Médio (Morno)</option>
                    <option value="cold" className="bg-[#0a0a0a]">❄️ Baixo (Frio)</option>
                </select>

                <select
                    value={filterOrigin}
                    onChange={e => setFilterOrigin(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 text-[10px] md:text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-blue-500/50 hover:bg-white/10 transition-colors cursor-pointer appearance-none pr-7 md:pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff40%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat w-[calc(50%-0.5rem)] sm:w-auto"
                >
                    <option value="all" className="bg-[#0a0a0a]">Origem (Todas)</option>
                    <option value="Facebook" className="bg-[#0a0a0a]">Facebook</option>
                    <option value="Instagram" className="bg-[#0a0a0a]">Instagram</option>
                    <option value="WhatsApp" className="bg-[#0a0a0a]">WhatsApp</option>
                    <option value="Google" className="bg-[#0a0a0a]">Google</option>
                </select>

                <select
                    value={filterScore}
                    onChange={e => setFilterScore(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 text-[10px] md:text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 hover:bg-white/10 transition-colors cursor-pointer appearance-none pr-7 md:pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff40%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat w-[calc(50%-0.5rem)] sm:w-auto"
                >
                    <option value="all" className="bg-[#0a0a0a]">Score (IA)</option>
                    <option value="high" className="bg-[#0a0a0a]">⭐ {'>'} 80</option>
                    <option value="medium" className="bg-[#0a0a0a]">⭐ 50-79</option>
                    <option value="low" className="bg-[#0a0a0a]"> {'<'} 50</option>
                </select>

                {/* Clear Filters Button */}
                {(filterDate !== 'all' || filterConsultant !== 'all' || filterStage !== 'all' || filterInterest !== 'all' || filterScore !== 'all' || filterOrigin !== 'all' || searchTerm !== '' || urlFilter !== null) && (
                    <button
                        onClick={() => {
                            setFilterDate('all');
                            setCustomStartDate('');
                            setCustomEndDate('');
                            setFilterConsultant('all');
                            setFilterStage('all');
                            setFilterInterest('all');
                            setFilterScore('all');
                            setFilterOrigin('all');
                            setSearchTerm('');
                            setUrlFilter(null);
                            // Clear URL params without reload
                            window.history.replaceState({}, '', window.location.pathname);
                        }}
                        className="text-xs font-bold text-red-500 hover:text-red-400 transition-colors px-2 ml-2 tracking-wide uppercase flex items-center gap-1"
                    >
                        Limpar<span className="hidden sm:inline"> Filtros</span>
                    </button>
                )}
            </div>


            {/* Unified Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 py-3 bg-white/5 px-6 rounded-3xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-inner">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'list'
                                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                                : 'text-white/20 hover:text-white/40'
                                }`}
                        >
                            Lista
                        </button>
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'kanban'
                                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                                : 'text-white/20 hover:text-white/40'
                                }`}
                        >
                            Kanban
                        </button>
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-2" />

                    <button
                        onClick={() => setIsAddingLead(true)}
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white hover:bg-red-600 hover:border-red-600 hover:shadow-[0_0_20px_rgba(227,30,36,0.3)] transition-all flex items-center gap-2 group relative overflow-hidden"
                    >
                        <Plus size={14} className="text-red-500 group-hover:text-white transition-colors" />
                        <span>NOVO LEAD MANUAL</span>
                    </button>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        <span className="text-white/40">Total:</span>
                        <span className="text-white">{filteredLeads.length} Leads</span>
                    </div>

                    <div className="h-4 w-px bg-white/10" />

                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">IA Monitorando Ativamente</span>
                    </div>
                </div>
            </div>

            {/* Scroll Progress Bar (Only for Kanban) */}
            {
            }


            <style jsx global>{`
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(220, 38, 38, 0.3) rgba(255, 255, 255, 0.05);
                }
                .hide-scrollbar::-webkit-scrollbar {
                    height: 8px;
                }
                .hide-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .hide-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(220, 38, 38, 0.3);
                    border-radius: 10px;
                    border: 2px solid rgba(255, 255, 255, 0.05);
                }
                .hide-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(220, 38, 38, 0.5);
                }
            `}</style>

            <AnimatePresence mode="wait">
                {viewMode === 'kanban' ? (
                    <motion.div
                        key="kanban"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col gap-4 w-full"
                    >
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="overflow-x-auto hide-scrollbar w-full"
                        >
                            <div className="flex flex-col gap-4 min-w-max pb-10">
                                {/* Kanban Header Row */}
                                <div className="flex gap-6 px-4">
                                    {([
                                        { id: 'aguardando', title: 'Aguardando', statuses: ['new', 'received'], color: 'bg-blue-500' },
                                        { id: 'atendimento', title: 'Em Atendimento', statuses: ['attempt', 'contacted', 'confirmed'], color: 'bg-amber-500' },
                                        { id: 'agendamento', title: 'Agendamento', statuses: ['scheduled'], color: 'bg-red-500' },
                                        { id: 'visita', title: 'Visita e Test Drive', statuses: ['visited', 'test_drive'], color: 'bg-red-600' },
                                        { id: 'negociacao', title: 'Negociação', statuses: ['proposed', 'negotiation'], color: 'bg-red-700' },
                                        { id: 'venda', title: 'Vendido', statuses: ['closed', 'comprado'], color: 'bg-emerald-500' },
                                        { id: 'perda', title: 'Perda / Sem Contato', statuses: ['lost', 'lost_redistributed', 'post_sale', 'trash'], color: 'bg-white/10' }
                                    ] as const).map((col) => {
                                        const colLeads = filteredLeads.filter(l => (col.statuses as unknown as LeadStatus[]).includes(l.status));
                                        return (
                                            <div key={`header-${col.id}`} className="w-80 flex-shrink-0">
                                                <div className="flex items-center justify-between px-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                                                        <h3 className="text-xs font-black uppercase tracking-widest text-white/60">{col.title}</h3>
                                                        <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] font-bold text-white/30">{colLeads.length}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Custom Scrollbar - Sticky BETWEEN Header and Cards */}
                                <div className="sticky left-0 w-full px-4 z-[60] flex items-center gap-4">
                                    <div
                                        className="h-1.5 bg-white/5 rounded-full overflow-hidden cursor-pointer group/scroll border border-white/5 shadow-inner flex-1 max-w-full"
                                        onPointerDown={(e) => {
                                            if (!scrollContainerRef.current) return;
                                            const bar = e.currentTarget;
                                            const rect = bar.getBoundingClientRect();

                                            const updateScroll = (clientX: number) => {
                                                const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
                                                const percentage = x / rect.width;
                                                const container = scrollContainerRef.current!;
                                                container.scrollLeft = percentage * (container.scrollWidth - container.clientWidth);
                                            };

                                            updateScroll(e.clientX);

                                            const onPointerMove = (moveEvent: PointerEvent) => {
                                                updateScroll(moveEvent.clientX);
                                            };

                                            const onPointerUp = () => {
                                                window.removeEventListener('pointermove', onPointerMove);
                                                window.removeEventListener('pointerup', onPointerUp);
                                            };

                                            window.addEventListener('pointermove', onPointerMove);
                                            window.addEventListener('pointerup', onPointerUp);
                                        }}
                                    >
                                        <motion.div
                                            className="h-full bg-red-600 shadow-[0_0_15px_rgba(227,30,36,0.8)] group-hover/scroll:bg-red-500 transition-colors relative"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${scrollProgress}%` }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                                        </motion.div>
                                    </div>
                                    <div className="flex items-center gap-1 animate-pulse">
                                        <div className="h-4 w-4 rounded-full bg-red-600 flex items-center justify-center">
                                            <ArrowRight size={10} className="text-white" />
                                        </div>
                                        <span className="text-[8px] font-black text-red-500 uppercase tracking-widest whitespace-nowrap">Role para ver mais</span>
                                    </div>
                                </div>

                                {/* Kanban Cards Row */}
                                <div className="flex gap-6 px-4 min-h-[70vh]">
                                    {([
                                        { id: 'aguardando', title: 'Aguardando', statuses: ['new', 'received'], color: 'bg-blue-500' },
                                        { id: 'atendimento', title: 'Em Atendimento', statuses: ['attempt', 'contacted', 'confirmed'], color: 'bg-amber-500' },
                                        { id: 'agendamento', title: 'Agendamento', statuses: ['scheduled'], color: 'bg-red-500' },
                                        { id: 'visita', title: 'Visita e Test Drive', statuses: ['visited', 'test_drive'], color: 'bg-red-600' },
                                        { id: 'negociacao', title: 'Negociação', statuses: ['proposed', 'negotiation'], color: 'bg-red-700' },
                                        { id: 'venda', title: 'Vendido', statuses: ['closed', 'comprado'], color: 'bg-emerald-500' },
                                        { id: 'perda', title: 'Perda / Sem Contato', statuses: ['lost', 'lost_redistributed', 'post_sale', 'trash'], color: 'bg-white/10' }
                                    ] as const).map((col) => {
                                        const allColLeads = filteredLeads.filter(l => (col.statuses as unknown as LeadStatus[]).includes(l.status));
                                        const visibleColLeads = allColLeads.slice(0, visibleCount);
                                        return (
                                            <div
                                                key={`cards-${col.id}`}
                                                className={`flex-shrink-0 w-80 flex flex-col gap-3 p-2 -mx-2 rounded-[2rem] transition-all duration-300 ${dragOverColId === col.id ? 'bg-white/5 border-2 border-dashed border-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.1)]' : 'border-2 border-transparent'}`}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    if (dragOverColId !== col.id) setDragOverColId(col.id);
                                                }}
                                                onDragLeave={(e) => {
                                                    const relatedTarget = e.relatedTarget as Node | null;
                                                    if (relatedTarget && !e.currentTarget.contains(relatedTarget)) {
                                                        setDragOverColId(null);
                                                    }
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setDragOverColId(null);
                                                    const leadId = e.dataTransfer.getData('leadId');
                                                    if (leadId) {
                                                        handleStatusChange(leadId, col.statuses[0] as LeadStatus);
                                                    }
                                                    setDraggingLeadId(null);
                                                }}
                                            >
                                                {visibleColLeads.map((lead) => (
                                                    <KanbanCard
                                                        key={lead.id}
                                                        lead={lead}
                                                        isMobile={!!isMobile}
                                                        draggingLeadId={draggingLeadId}
                                                        activeMoveMenu={activeMoveMenu}
                                                        setActiveMoveMenu={setActiveMoveMenu}
                                                        handleLeadSmartClick={handleLeadSmartClick}
                                                        handleStatusChange={handleStatusChange}
                                                        setActionLead={setActionLead}
                                                        setDraggingLeadId={setDraggingLeadId}
                                                    />
                                                ))}

                                                {allColLeads.length > visibleCount && (
                                                    <div className="py-2 flex items-center justify-center">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-white/20 animate-pulse" />
                                                    </div>
                                                )}

                                                {allColLeads.length === 0 && (
                                                    <div className="h-32 rounded-2xl border-2 border-dashed border-white/5 flex items-center justify-center">
                                                        <p className="text-[10px] font-black text-white/10 uppercase tracking-widest">Vazio</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="list"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col gap-4 w-full"
                    >
                        {/* Headers Estratégicos */}
                        <div className="flex items-center gap-6 px-12 text-[10px] uppercase tracking-[0.25em] text-white/20 font-black">
                            <div className="flex-1 min-w-[250px]">Identificação do Lead</div>
                            <div className="hidden md:block w-48">Interesse Principal</div>
                            <div className="hidden lg:block w-40">Consultor</div>
                            <div className="w-40">Status Atual</div>
                            <div className="w-24 text-right">Ações</div>
                        </div>

                        <div className="flex flex-col gap-3 pb-20">
                            {visibleLeads.map((lead, index) => (
                                <ListRow
                                    key={lead.id}
                                    lead={lead}
                                    index={index}
                                    activeMoveMenu={activeMoveMenu}
                                    setActiveMoveMenu={setActiveMoveMenu}
                                    handleLeadSmartClick={handleLeadSmartClick}
                                    handleStatusChange={handleStatusChange}
                                    setActionLead={setActionLead}
                                />
                            ))}
                            
                            {/* Observer Target */}
                            {visibleCount < filteredLeads.length && (
                                <div ref={observerTarget} className="w-full py-8 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="h-8 w-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest animate-pulse">
                                            Carregando mais leads...
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Slide-over Detail Panel (Painel de Atendimento) - For Single Click */}
            <AnimatePresence>
                {selectedLead && (
                    <div className="fixed inset-0 z-[100] flex justify-end pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedLead(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                        />
                        <motion.div
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
                            className="w-full max-w-sm h-screen bg-[#03060b] border-l border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col p-8 custom-scrollbar relative pointer-events-auto z-[110] overflow-y-auto"
                        >
                            <header className="flex items-center justify-between mb-10">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-600/20 border border-red-500/20">
                                        <Zap size={16} className="text-red-500" />
                                    </div>
                                    <h2 className="text-sm font-black tracking-widest text-white uppercase font-outfit">Painel de Atendimento</h2>
                                </div>
                                <button onClick={() => setSelectedLead(null)} className="h-8 w-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                                    <ArrowRight size={18} className="text-white/40" />
                                </button>
                            </header>

                            <div className="flex-1 space-y-8">
                                {/* Lead Main Info */}
                                <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 flex items-center gap-4 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-red-600/10 transition-all" />
                                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-red-600/20 uppercase">
                                        {selectedLead.name[0]}
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Em Atendimento</span>
                                        </div>
                                        <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none mb-2">{selectedLead.name}</h3>
                                        <p className="text-xs font-bold text-white/30 tracking-widest bg-white/5 w-fit px-2 py-1 rounded-lg border border-white/5">{formatPhoneBR(selectedLead.phone)}</p>
                                    </div>
                                </div>

                                {/* Previous Consultant Alert */}
                                {selectedLead.dados_brutos && (selectedLead.dados_brutos as any).previous_consultant_id && (
                                    <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-3xl flex items-center gap-4 animate-in slide-in-from-top-2">
                                        <ShieldAlert size={20} className="text-amber-500 shrink-0" />
                                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/80 leading-tight">
                                            Este lead já teve atendimento anterior pelo consultor: <span className="text-amber-500">{
                                                consultants.find(c => c.id === (selectedLead.dados_brutos as any).previous_consultant_id || c.name === (selectedLead.dados_brutos as any).previous_consultant_id)?.name || 'Outro Consultor'
                                            }</span>
                                        </p>
                                    </div>
                                )}

                                {/* Executive Summary */}
                                <div className="space-y-3">
                                    <p className="text-[10px] font-black uppercase text-red-500/60 tracking-widest pl-2">Resumo Executivo</p>
                                    <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6">
                                        <p className="text-sm text-white/60 leading-relaxed font-medium italic">
                                            {selectedLead.resumo_consultor || selectedLead.ai_summary || 'Inicie o contato para qualificar o interesse.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Interest & Swap Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-2">
                                        <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">Interesse</p>
                                        <p className="text-[10px] font-black text-white uppercase truncate">{selectedLead.vehicle_interest || 'Não Definido'}</p>
                                    </div>
                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-2">
                                        <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">Possui Troca</p>
                                        <p className="text-[10px] font-black text-white uppercase">{selectedLead.carro_troca || 'NÃO'}</p>
                                    </div>
                                </div>

                                {/* Analysis Insights */}
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] flex items-center gap-2">
                                        <Sparkles size={12} className="text-purple-500" /> Insights da Análise
                                    </p>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Interesse</span>
                                            <span className="text-[10px] font-black text-white uppercase">{selectedLead.nivel_interesse?.toUpperCase() || 'INDEFINIDO'}</span>
                                        </div>
                                        <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Momento</span>
                                            <span className="text-[10px] font-black text-white uppercase">{selectedLead.momento_compra?.toUpperCase() || 'PESQUISA'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <footer className="mt-auto pt-8 border-t border-white/10 flex flex-col gap-4">
                                <button
                                    onClick={() => {
                                        setActionLead(selectedLead);
                                        setSelectedLead(null);
                                    }}
                                    className="w-full py-5 rounded-[2rem] bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-red-600/20 hover:bg-red-500 transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                    <Zap size={18} fill="currentColor" /> ACESSAR CENTRO DE GESTÃO
                                </button>
                                <div className="grid grid-cols-2 gap-4">
                                    <a
                                        href={`tel:${selectedLead.phone}`}
                                        className="py-4 rounded-[2rem] bg-white/5 border border-white/10 text-[10px] font-black text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Phone size={16} /> LIGAR
                                    </a>
                                    <a
                                        href={`https://wa.me/${selectedLead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(getWhatsAppMessage(selectedLead, 'initial'))}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="py-4 rounded-[2rem] bg-emerald-600 text-white text-[10px] font-black shadow-xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare size={16} /> WHATSAPP
                                    </a>
                                </div>
                            </footer>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Slide-over Detail Panel (Centro de Gestão) - Restored Layout */}
            <AnimatePresence>
                {
                    actionLead && (
                        <div className="fixed inset-0 z-[100] flex justify-end pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => {
                                    setActionLead(null);
                                    setIsFinishing(false);
                                }}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                            />
                            <motion.div
                                initial={isMobile ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 }}
                                animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
                                exit={isMobile ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 }}
                                transition={isMobile ? { duration: 0.3 } : { type: 'spring', damping: 30, stiffness: 200 }}
                                className="w-[95vw] lg:w-[90vw] max-w-[1600px] h-screen bg-[#03060b] border-l border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col p-6 md:p-10 lg:p-16 custom-scrollbar relative pointer-events-auto z-[110] overflow-y-auto"
                            >
                                <header className="flex flex-col gap-6 mb-10">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-600 shadow-lg shadow-red-600/20">
                                                <Zap size={20} className="text-white" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-4">
                                                    <h2 className="text-3xl font-black tracking-tighter text-white font-outfit uppercase">Centro de Gestão</h2>
                                                    {actionLead && ((actionLead.ai_score ?? 0) || 0) > 0 && (
                                                        <div className="px-3 py-1.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black flex items-center gap-2 shadow-lg shadow-emerald-500/5 animate-in zoom-in duration-500">
                                                            <Sparkles size={12} className="animate-pulse" />
                                                            SCORE IA: {(actionLead.ai_score ?? 0)}%
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Previous Consultant Alert */}
                                                {actionLead.dados_brutos && (actionLead.dados_brutos as any).previous_consultant_id && (
                                                    <div className="mt-4 bg-amber-500/10 border border-amber-500/20 px-6 py-4 rounded-3xl flex items-center gap-4 animate-in slide-in-from-left-4 max-w-2xl">
                                                        <ShieldAlert size={22} className="text-amber-500 shrink-0" />
                                                        <p className="text-xs font-black uppercase tracking-[0.1em] text-amber-500/80 leading-none">
                                                            Este lead já teve atendimento anterior pelo consultor: <span className="text-amber-500 font-black">{
                                                                consultants.find(c => c.id === (actionLead.dados_brutos as any).previous_consultant_id || c.name === (actionLead.dados_brutos as any).previous_consultant_id)?.name || 'Outro Consultor'
                                                            }</span>
                                                        </p>
                                                    </div>
                                                )}

                                                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Operação Direta: {actionLead?.name}</p>
                                                {actionLead?.primeiro_vendedor && (
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Atendedor Original: {actionLead.primeiro_vendedor}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest mr-2">Estágio:</span>
                                                <select
                                                    value={actionLead.status}
                                                    onChange={(e) => handleStatusChange(actionLead.id, e.target.value as any)}
                                                    className="bg-[#0d1117] border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-white tracking-widest focus:outline-none focus:border-red-500 transition-colors cursor-pointer shadow-lg"
                                                >
                                                    <option value="new">Aguardando</option>
                                                    <option value="contacted">Em Atendimento</option>
                                                    <option value="scheduled">Agendamento</option>
                                                    <option value="visited">Visita e Test Drive</option>
                                                    <option value="proposed">Negociação</option>
                                                    <option value="closed">Vendido</option>
                                                    <option value="lost">Perda / Sem Contato</option>
                                                </select>
                                            </div>
                                            <button onClick={() => {
                                                setActionLead(null);
                                                setIsFinishing(false);
                                            }} className="h-12 w-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                                                <Plus size={24} className="text-white/40 rotate-45" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tab Switcher */}
                                    <div className="flex flex-wrap items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 w-fit">
                                        <button
                                            onClick={() => setModalTab('details')}
                                            className={`px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'details' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Cockpit Geral
                                        </button>
                                        <button
                                            onClick={() => setModalTab('timeline')}
                                            className={`px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'timeline' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Linha do Tempo
                                        </button>
                                        <button
                                            onClick={() => setModalTab('karbam')}
                                            className={`px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'karbam' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Karbam
                                        </button>
                                        <button
                                            onClick={() => setModalTab('analysis')}
                                            className={`px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'analysis' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Análise IA
                                        </button>
                                        <button
                                            onClick={() => setModalTab('next_steps')}
                                            className={`px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'next_steps' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Próximos Passos
                                        </button>
                                        <button
                                            onClick={() => setModalTab('flow-up')}
                                            className={`px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'flow-up' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Flow-up (IA)
                                        </button>
                                        <button
                                            onClick={() => setModalTab('forms')}
                                            className={`px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'forms' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <FileText size={14} />
                                                Formulários
                                            </div>
                                        </button>
                                    </div>
                                </header>

                                {modalTab === 'timeline' ? (
                                    <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar pr-4 pb-10">
                                        <div className="max-w-4xl mx-auto w-full space-y-6">
                                            <div className="flex items-center gap-2 mb-6">
                                                <Calendar size={18} className="text-blue-500" />
                                                <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Histórico Completo de Interações</h4>
                                            </div>
                                            <div className="relative border-l-2 border-white/10 pl-8 space-y-10 py-4">
                                                {actionLead.ai_summary ? (
                                                    actionLead.ai_summary.split(/\n\n+/).filter(Boolean).map((eventData, idx) => (
                                                        <div key={idx} className="relative group">
                                                            <div className="absolute -left-[41px] top-1 h-5 w-5 rounded-full border-4 border-[#0a0f1d] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] group-hover:scale-125 transition-transform" />
                                                            <div className="glass-card p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors shadow-lg">
                                                                <p className="text-sm font-medium leading-relaxed text-white/80 whitespace-pre-wrap">{eventData.trim()}</p>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="p-10 text-center rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.01]">
                                                        <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Nenhuma interação registrada na linha do tempo ainda.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : modalTab === 'analysis' ? (
                                    <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar pr-4 pb-10">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                            {/* Temperatura do Lead */}
                                            <div className="glass-card rounded-3xl p-6 bg-purple-500/5 border-purple-500/10 hover:border-purple-500/30 transition-all flex flex-col justify-between group">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
                                                        <Zap size={18} />
                                                    </div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Interesse</h4>
                                                </div>
                                                <div className="text-2xl font-black text-white uppercase italic tracking-tighter">
                                                    {actionLead.nivel_interesse || actionLead.ai_classification?.toUpperCase() || 'WARM'}
                                                </div>
                                            </div>

                                            {/* Momento de Compra */}
                                            <div className="glass-card rounded-3xl p-6 bg-blue-500/5 border-blue-500/10 hover:border-blue-500/30 transition-all flex flex-col justify-between group">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
                                                        <Calendar size={18} />
                                                    </div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Momento</h4>
                                                </div>
                                                <div className="text-xl font-black text-white uppercase italic tracking-tighter">
                                                    {actionLead.momento_compra || 'Pesquisa Inicial'}
                                                </div>
                                            </div>

                                            {/* Probabilidade */}
                                            <div className="glass-card rounded-3xl p-6 bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30 transition-all flex flex-col justify-between group">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                                                        <TrendingUp size={18} />
                                                    </div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Probabilidade</h4>
                                                </div>
                                                <div className="text-2xl font-black text-emerald-500 italic tracking-tighter">
                                                    {actionLead.behavioral_profile?.closing_probability || (actionLead.ai_score ?? 0) || 0}%
                                                </div>
                                            </div>

                                            {/* Sentimento */}
                                            <div className="glass-card rounded-3xl p-6 bg-rose-500/5 border-rose-500/10 hover:border-rose-500/30 transition-all flex flex-col justify-between group">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 group-hover:scale-110 transition-transform">
                                                        <Sparkles size={18} />
                                                    </div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Sentimento</h4>
                                                </div>
                                                <div className="text-xl font-black text-white uppercase italic tracking-tighter">
                                                    {actionLead.behavioral_profile?.sentiment || 'Neutro'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Painel Behavioral (agora na aba de Análise IA) */}
                                        <div className="max-w-3xl w-full mx-auto space-y-6">
                                            <div className="glass-card rounded-[2.5rem] p-8 md:p-10 border-white/5 space-y-8 h-full bg-white/[0.01]">
                                                <div className="space-y-1 text-center md:text-left">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20">Perfil Comportamental</h4>
                                                    <p className="text-sm font-black text-white uppercase tracking-tighter">Mapeamento de Personalidade</p>
                                                </div>

                                                <div className="space-y-6 w-full lg:max-w-none">
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest px-1">
                                                            <span className="text-white/40">Urgência</span>
                                                            <span className={actionLead.behavioral_profile?.urgency === 'high' ? 'text-red-500' : 'text-amber-500'}>
                                                                {actionLead.behavioral_profile?.urgency === 'high' ? 'Alta' : 'Média'}
                                                            </span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: actionLead.behavioral_profile?.urgency === 'high' ? '90%' : '60%' }}
                                                                className={`h-full ${actionLead.behavioral_profile?.urgency === 'high' ? 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-amber-600'}`}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest px-1">
                                                            <span className="text-white/40">Fidelidade</span>
                                                            <span className="text-emerald-500">Alta</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: '85%' }}
                                                                className="h-full bg-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest px-1">
                                                            <span className="text-white/40">Nível Decisor</span>
                                                            <span className="text-blue-500">Direto</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: '100%' }}
                                                                className="h-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-6 border-t border-white/5">
                                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                                        {actionLead.behavioral_profile?.intentions?.map((tag, idx) => (
                                                            <span key={idx} className="px-3 md:px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest hover:bg-white/10 transition-colors">
                                                                {tag}
                                                            </span>
                                                        )) || (
                                                                <>
                                                                    <span className="px-3 md:px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">Troca Avaliada</span>
                                                                    <span className="px-3 md:px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">Aprovação Direta</span>
                                                                </>
                                                            )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : modalTab === 'next_steps' ? (
                                    <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar pr-4 pb-10">
                                        {/* Análise Estratégica e Próximos Passos */}
                                        <div className="w-full space-y-6">
                                            <div className="glass-card rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 bg-gradient-to-br from-purple-500/10 via-red-600/5 to-transparent border-white/5 space-y-10 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 bg-purple-600/5 rounded-full blur-[80px] -mr-32 -mt-32" />
                                                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
                                                    <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl md:rounded-3xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-2xl shadow-red-600/20 group-hover:rotate-6 group-hover:scale-110 transition-all shrink-0">
                                                        <Sparkles size={32} />
                                                    </div>
                                                    <div className="flex-1 space-y-4 pt-2">
                                                        <h4 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-red-500">Diagnóstico Estratégico IA</h4>
                                                        <p className="text-xl md:text-2xl font-bold text-white leading-relaxed italic md:pr-10">
                                                            "{actionLead.resumo_consultor || actionLead.ai_summary || 'Realize o contato inicial ou cole uma conversa no Laboratório de IA para que o sistema gere um diagnóstico estratégico completo para este lead.'}"
                                                        </p>
                                                    </div>
                                                </div>

                                                {(actionLead.ai_reason || actionLead.next_step) && (
                                                    <div className="pt-10 border-t border-white/10 grid md:grid-cols-2 gap-8 relative z-10">
                                                        <div className="space-y-4 bg-white/[0.02] p-6 rounded-3xl border border-white/5 hover:bg-white/[0.04] transition-colors">
                                                            <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center justify-center md:justify-start gap-2 mb-2">
                                                                <Target size={14} className="text-red-500" /> Gatilhos de Fechamento
                                                            </p>
                                                            <p className="text-sm text-white/80 leading-relaxed font-medium text-center md:text-left">
                                                                {actionLead.ai_reason || 'Aguardando interação para identificar gatilhos comportamentais.'}
                                                            </p>
                                                        </div>
                                                        <div className="space-y-4 bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors">
                                                            <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center justify-center md:justify-start gap-2 mb-2">
                                                                <Zap size={14} className="text-emerald-500" /> Próxima Ação Decisiva
                                                            </p>
                                                            <p className="text-sm text-emerald-500 font-black uppercase tracking-widest flex items-center justify-center md:justify-start gap-3 mt-2">
                                                                <ArrowUpRight size={20} /> {actionLead.proxima_acao || actionLead.next_step || 'Iniciar Abordagem Consultiva'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : modalTab === 'flow-up' ? (
                                    <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 overflow-y-auto custom-scrollbar pr-4 pb-10">
                                        <div className="w-full max-w-2xl mx-auto">
                                            <div className="glass-card rounded-[2.5rem] p-8 bg-indigo-500/5 border-indigo-500/10 space-y-8">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
                                                        <MessageSquare size={28} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-black uppercase tracking-widest text-indigo-500 mb-1">Canais de Flow-up</h4>
                                                        <p className="text-sm font-bold text-white tracking-tight">Abordagem Direta via WhatsApp</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="p-8 rounded-[2rem] bg-black/40 border border-white/5 space-y-6">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Sugestão de Contato</p>
                                                        </div>

                                                        <div className="text-sm text-white/80 leading-relaxed italic whitespace-pre-wrap py-2">
                                                            {getWhatsAppMessage(actionLead, 'flowup')}
                                                        </div>

                                                        <div className="flex gap-4 pt-4 border-t border-white/5">
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(getWhatsAppMessage(actionLead, 'flowup'));
                                                                    showToast("Mensagem copiada!", "success");
                                                                }}
                                                                className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black text-white hover:bg-white/10 transition-all uppercase tracking-widest"
                                                            >
                                                                Copiar Texto
                                                            </button>
                                                            <a
                                                                href={`https://wa.me/${actionLead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(getWhatsAppMessage(actionLead, 'flowup'))}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex-[2] py-4 rounded-2xl bg-emerald-600 text-white text-[9px] font-black hover:bg-emerald-500 transition-all uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                                                            >
                                                                <MessageSquare size={14} /> Enviar WhatsApp
                                                            </a>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : modalTab === 'karbam' ? (
                                    <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar pr-4 pb-10">
                                        <section className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <BadgeCheck size={18} className="text-amber-500" />
                                                <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Avaliação Karbam</h4>
                                            </div>
                                            <div className="glass-card rounded-[2.5rem] p-6 md:p-10 bg-amber-500/[0.02] border-amber-500/10 flex flex-col items-center text-center space-y-6">
                                                <div className="h-16 w-16 md:h-20 md:w-20 rounded-3xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                                                    <Search size={32} className="text-amber-500" />
                                                </div>
                                                <div className="space-y-2">
                                                    <h3 className="text-xl md:text-2xl font-black text-white tracking-tighter uppercase">Análise Karbam</h3>
                                                    <p className="text-xs md:text-sm text-white/40 max-w-sm mx-auto leading-relaxed">
                                                        Avaliação técnica e simulação de margem para o veículo {actionLead.carro_troca || 'da troca'}.
                                                    </p>
                                                </div>

                                                {actionLead.status === 'scheduled' && (
                                                    <div className="w-full p-4 md:p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between animate-pulse">
                                                        <div className="flex items-center gap-3 md:gap-4">
                                                            <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl md:rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                                                                <Calendar size={20} className="text-amber-500" />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase tracking-widest">Vistoria Agendada</p>
                                                                <p className="text-xs md:text-sm font-black text-white">Próxima Visita</p>
                                                            </div>
                                                        </div>
                                                        <BadgeCheck size={20} className="text-amber-500" />
                                                    </div>
                                                )}

                                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                                    <div className="p-4 md:p-6 rounded-3xl bg-white/5 border border-white/5 text-left group hover:bg-amber-500/5 transition-all relative">
                                                        <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Veículo Selecionado</p>
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                placeholder="Selecionar veículo..."
                                                                value={vehicleSearch}
                                                                onChange={(e) => {
                                                                    setVehicleSearch(e.target.value);
                                                                    setShowVehicleResults(true);
                                                                }}
                                                                className="w-full bg-transparent border-none p-0 text-sm font-black text-white placeholder:text-white/10 focus:ring-0"
                                                            />
                                                            <AnimatePresence>
                                                                {showVehicleResults && vehicleSearch.length > 1 && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: -10 }}
                                                                        animate={{ opacity: 1, y: 0 }}
                                                                        exit={{ opacity: 0, y: -10 }}
                                                                        className="absolute left-0 right-0 top-full mt-4 bg-[#0a0f1d] border border-white/10 rounded-2xl shadow-2xl z-50 max-h-48 overflow-y-auto custom-scrollbar p-2"
                                                                    >
                                                                        {inventory
                                                                            .filter(i =>
                                                                                (i.marca + ' ' + i.modelo).toLowerCase().includes(vehicleSearch.toLowerCase())
                                                                            )
                                                                            .slice(0, 5)
                                                                            .map(v => (
                                                                                <button
                                                                                    key={v.id}
                                                                                    onClick={() => {
                                                                                        setVehicleSearch(`${v.marca} ${v.modelo}`);
                                                                                        setShowVehicleResults(false);
                                                                                        setEditDetails({ ...editDetails, vehicle_interest: `${v.marca} ${v.modelo}` });
                                                                                    }}
                                                                                    className="w-full text-left p-3 rounded-xl hover:bg-white/5 text-[10px] font-bold text-white/60 hover:text-white transition-all border border-transparent hover:border-amber-500/20"
                                                                                >
                                                                                    {v.marca} {v.modelo} - {v.ano}
                                                                                </button>
                                                                            ))
                                                                        }
                                                                        {inventory.filter(i => (i.marca + ' ' + i.modelo).toLowerCase().includes(vehicleSearch.toLowerCase())).length === 0 && (
                                                                            <p className="p-3 text-[10px] text-white/20 text-center">Nenhum veículo encontrado</p>
                                                                        )}
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    </div>
                                                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5 text-left group hover:bg-amber-500/5 transition-all">
                                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Score de Revenda</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                                                <div className="h-full bg-amber-500 w-[70%]" />
                                                            </div>
                                                            <span className="text-xs font-black text-amber-500">7.2</span>
                                                        </div>
                                                    </div>
                                                </div>


                                                <button
                                                    onClick={() => {
                                                        showToast("Integração Karbam iniciada. Sincronizando dados de vistoria...", "info");
                                                        setTimeout(() => showToast("Veículo identificado e mapeado no Karbam.", "success"), 2000);
                                                    }}
                                                    className="w-full py-5 rounded-[2rem] bg-amber-600 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-amber-600/20 hover:scale-[1.02] active:scale-95 transition-all"
                                                >
                                                    Integrar com Karbam
                                                </button>
                                            </div>
                                        </section>
                                    </div>
                                ) : modalTab === 'forms' ? (
                                    <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar pr-4 pb-10">
                                        <div className="max-w-5xl mx-auto w-full space-y-8">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-500">
                                                        <FileText size={20} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30">Documentação e Processos</h4>
                                                        <h3 className="text-lg font-black text-white uppercase tracking-tighter">Central de Formulários</h3>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {/* Form Item 1 */}
                                                <div className="glass-card rounded-[2rem] p-6 bg-white/[0.02] border-white/5 hover:border-rose-500/30 hover:bg-white/[0.04] transition-all group">
                                                    <div className="flex flex-col h-full justify-between gap-6">
                                                        <div className="space-y-4">
                                                            <div className="w-12 h-12 rounded-2xl bg-red-600/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                                                                <Car size={24} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <h5 className="font-black text-white text-sm uppercase tracking-tight">Avaliação Técnica</h5>
                                                                <p className="text-[10px] text-white/40 leading-relaxed uppercase font-bold tracking-widest">Veículo na Troca</p>
                                                            </div>
                                                        </div>
                                                        <button className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black text-white uppercase hover:bg-red-600 hover:border-red-500 transition-all shadow-lg active:scale-95">
                                                            Abrir Formulário
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Form Item 2 */}
                                                <div className="glass-card rounded-[2rem] p-6 bg-white/[0.02] border-white/5 hover:border-emerald-500/30 hover:bg-white/[0.04] transition-all group">
                                                    <div className="flex flex-col h-full justify-between gap-6">
                                                        <div className="space-y-4">
                                                            <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                                                                <CreditCard size={24} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <h5 className="font-black text-white text-sm uppercase tracking-tight">Ficha de Cadastro</h5>
                                                                <p className="text-[10px] text-white/40 leading-relaxed uppercase font-bold tracking-widest">Financiamento Bancário</p>
                                                            </div>
                                                        </div>
                                                        <button className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black text-white uppercase hover:bg-emerald-600 hover:border-emerald-500 transition-all shadow-lg active:scale-95">
                                                            Abrir Formulário
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Form Item 3 */}
                                                <div className="glass-card rounded-[2rem] p-6 bg-white/[0.02] border-white/5 hover:border-blue-500/30 hover:bg-white/[0.04] transition-all group">
                                                    <div className="flex flex-col h-full justify-between gap-6">
                                                        <div className="space-y-4">
                                                            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                                                                <BadgeCheck size={24} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <h5 className="font-black text-white text-sm uppercase tracking-tight">Checklist de Entrega</h5>
                                                                <p className="text-[10px] text-white/40 leading-relaxed uppercase font-bold tracking-widest">Entrega Técnica</p>
                                                            </div>
                                                        </div>
                                                        <button className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black text-white uppercase hover:bg-blue-600 hover:border-blue-500 transition-all shadow-lg active:scale-95">
                                                            Abrir Formulário
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Informação adicional */}
                                            <div className="p-8 rounded-[2.5rem] bg-gradient-to-r from-red-600/10 to-transparent border border-white/5 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 rounded-full blur-3xl -mr-32 -mt-32" />
                                                <div className="relative z-10 flex items-center gap-6">
                                                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-red-500 border border-white/10">
                                                        <Zap size={28} className="animate-pulse" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">Dica de Performance</p>
                                                        <p className="text-white text-sm font-medium leading-relaxed max-w-2xl">
                                                            Certifique-se de que todos os dados do lead foram preenchidos corretamente nos formulários para garantir a precisão no faturamento e na entrega do veículo.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
                                        <div className="lg:col-span-4 space-y-8">
                                            <section className="space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <Users size={18} className="text-red-500" />
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Gestão de Encaminhamento</h4>
                                                </div>
                                                <div className="glass-card rounded-3xl p-6 space-y-4">
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-500/10 to-transparent border border-red-500/20 rounded-3xl">
                                                            <div className="flex items-center gap-4">
                                                                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-red-600/20">
                                                                    {actionLead.name[0]}
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-black text-white uppercase tracking-tight">{actionLead.name}</p>
                                                                    <p className="text-xs text-white/50 font-bold tracking-wide leading-none mt-1">{formatPhoneBR(actionLead.phone)}</p>
                                                                </div>
                                                            </div>
                                                            <div className={`px-4 py-2 rounded-2xl border flex flex-col items-center justify-center ${(actionLead.ai_score ?? 0) >= 70 ? 'bg-emerald-500/10 border-emerald-500/20' : (actionLead.ai_score ?? 0) >= 40 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                                                <p className="text-[7px] font-black opacity-40 uppercase tracking-[0.2em] leading-none mb-1">Score</p>
                                                                <p className={`text-xl font-black leading-none ${(actionLead.ai_score ?? 0) >= 70 ? 'text-emerald-500' : (actionLead.ai_score ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{(actionLead.ai_score ?? 0) || 0}</p>
                                                            </div>
                                                        </div>

                                                        {userRole === 'admin' ? (
                                                            <div className="space-y-2">
                                                                <label className="text-[9px] font-black uppercase text-white/20 tracking-widest pl-2">Encaminhar para Consultor</label>
                                                                <select
                                                                    value={actionLead.assigned_consultant_id || ''}
                                                                    onChange={(e) => handleAssignConsultant(actionLead.id, e.target.value)}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-500/20 [color-scheme:dark] transition-all"
                                                                >
                                                                    <option value="" className="bg-[#080c18]">Não Atribuído (Aguardando)</option>
                                                                    {consultants.map(c => (
                                                                        <option key={c.id} value={c.id} className="bg-[#080c18] font-bold">{c.name}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                                                <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mb-1">Consultor Atual</p>
                                                                <p className="text-xs font-bold text-white/60">
                                                                    {consultants.find(c => c.id === actionLead.assigned_consultant_id)?.name || 'Nenhum consultor atribuído'}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <Car size={18} className="text-red-500" />
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Veículo & Negócio</h4>
                                                </div>
                                                <div className="glass-card rounded-3xl p-6 space-y-6">
                                                    {userRole === 'admin' && (
                                                        <div className="grid grid-cols-1 gap-4 pb-4 border-b border-white/5">
                                                            <div className="space-y-2">
                                                                <label className="text-[9px] font-black uppercase text-white/20 tracking-widest pl-2">Nome do Lead</label>
                                                                <input
                                                                    type="text"
                                                                    value={editDetails.name || ''}
                                                                    onChange={(e) => setEditDetails({ ...editDetails, name: e.target.value })}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[9px] font-black uppercase text-white/20 tracking-widest pl-2">Telefone</label>
                                                                <input
                                                                    type="text"
                                                                    value={editDetails.phone || ''}
                                                                    onChange={(e) => setEditDetails({ ...editDetails, phone: e.target.value })}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase text-white/20 tracking-widest pl-2">Veículo de Interesse</label>
                                                        <div className="relative">
                                                            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                                                            <input
                                                                type="text"
                                                                value={editDetails.vehicle_interest || ''}
                                                                onChange={(e) => setEditDetails({ ...editDetails, vehicle_interest: e.target.value })}
                                                                placeholder="Buscar no estoque..."
                                                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-black uppercase text-white/20 tracking-widest pl-2">Veículo de Troca</label>
                                                            <input
                                                                type="text"
                                                                disabled={userRole !== 'admin'}
                                                                value={editDetails.carro_troca || ''}
                                                                onChange={(e) => setEditDetails({ ...editDetails, carro_troca: e.target.value })}
                                                                className={`w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 ${userRole !== 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            />
                                                        </div>
                                                        {actionLead.source !== 'WhatsApp' && (
                                                            <div className="space-y-2">
                                                                <label className="text-[9px] font-black uppercase text-white/20 tracking-widest pl-2">Valor Estimado</label>
                                                                <input
                                                                    type="text"
                                                                    disabled={userRole !== 'admin'}
                                                                    value={editDetails.valor_investimento || ''}
                                                                    onChange={(e) => {
                                                                        const formatted = formatCurrencyInput(e.target.value);
                                                                        setEditDetails({ ...editDetails, valor_investimento: formatted });
                                                                    }}
                                                                    placeholder="R$ 0,00"
                                                                    className={`w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 ${userRole !== 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {userRole === 'admin' && (
                                                        <button
                                                            onClick={handleSaveDetails}
                                                            className="w-full py-4 rounded-2xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-500 transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <BadgeCheck size={16} /> Confirmar Alterações
                                                        </button>
                                                    )}
                                                </div>
                                            </section>

                                            <section className="space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={18} className="text-amber-500" />
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Agendamento e Visita</h4>
                                                </div>
                                                <div className="glass-card rounded-3xl p-6 space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase text-white/20 tracking-widest pl-2">Data e Hora Sugerida</label>
                                                        <input
                                                            type="datetime-local"
                                                            value={editDetails.scheduled_at ? editDetails.scheduled_at.substring(0, 16) : ''}
                                                            onChange={(e) => setEditDetails({ ...editDetails, scheduled_at: e.target.value })}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 [color-scheme:dark]"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={handleSaveDetails}
                                                        className="w-full py-4 rounded-2xl bg-amber-600/10 border border-amber-600/20 text-[10px] font-black text-amber-500 uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all"
                                                    >
                                                        Confirmar Agendamento
                                                    </button>
                                                </div>
                                            </section>
                                        </div>

                                        <div className="lg:col-span-8 space-y-8">
                                            {/* AI Strategic Analysis - High Visibility */}
                                            <section className="space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles size={18} className="text-purple-500" />
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Análise Estratégica & Diagnóstico</h4>
                                                </div>
                                                <div className="glass-card rounded-[2.5rem] p-8 bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20 space-y-5">
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-3">
                                                            <MessageSquare size={20} className="text-red-500" />
                                                            <p className="text-sm text-white font-bold leading-relaxed italic">
                                                                "{actionLead.resumo_consultor || actionLead.ai_summary || 'Realize o contato para que a IA analise o perfil.'}"
                                                            </p>
                                                        </div>
                                                        <div className="pt-4 border-t border-white/5 flex flex-col gap-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                                                    <ArrowRight size={16} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-emerald-500/50 uppercase tracking-widest leading-none mb-1">Caminho Sugerido</p>
                                                                    <p className="text-xs font-black text-white uppercase">{actionLead.proxima_acao || 'Iniciar Abordagem Consultiva'}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={18} className="text-red-500" />
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60">Historico de Notas Operacionais</h4>
                                                    </div>
                                                </div>
                                                <div className="glass-card rounded-3xl p-6 bg-red-600/[0.02] border-white/5 flex flex-col gap-4">
                                                    {actionLead.ai_summary ? (
                                                        <div className="bg-black/40 rounded-2xl p-5 text-[12px] leading-relaxed text-white/80 max-h-[300px] overflow-y-auto custom-scrollbar italic whitespace-pre-wrap border border-white/10 shadow-inner font-medium">
                                                            {actionLead.ai_summary}
                                                        </div>
                                                    ) : (
                                                        <div className="py-10 text-center">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-white/20 italic">Sem histórico registrado...</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </section>

                                            <section className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles size={18} className="text-red-500" />
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60">Laboratório de IA</h4>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <button
                                                            onClick={() => fileInputRef.current?.click()}
                                                            className="text-[9px] font-black text-white/30 hover:text-red-500 transition-colors uppercase flex items-center gap-2"
                                                        >
                                                            <Upload size={14} /> Subir Script
                                                        </button>
                                                        <input
                                                            type="file"
                                                            ref={fileInputRef}
                                                            onChange={handleFileUpload}
                                                            className="hidden"
                                                            multiple
                                                        />
                                                    </div>
                                                </div>

                                                <div className="glass-card rounded-3xl p-6 space-y-4 bg-red-600/[0.02] border-white/5">
                                                    <textarea
                                                        placeholder="Cole a conversa para analise estrategica..."
                                                        value={chatText}
                                                        onChange={(e) => setChatText(e.target.value)}
                                                        className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-xs text-white/60 min-h-[120px] focus:outline-none focus:ring-1 focus:ring-red-500/30 resize-none italic"
                                                    />
                                                    <button
                                                        onClick={() => analyzeConversation()}
                                                        disabled={isAnalyzing || chatText.length < 10}
                                                        className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isAnalyzing || chatText.length < 10 ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-red-600 text-white shadow-xl shadow-red-600/20 hover:scale-[1.02]'}`}
                                                    >
                                                        {isAnalyzing ? <><Plus size={16} className="animate-spin" /> Analisando...</> : <><Zap size={16} /> Analisar e Sugerir</>}
                                                    </button>

                                                    {structuredAnalysis && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            className="space-y-4 pt-4 border-t border-white/5"
                                                        >
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 shadow-inner">
                                                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Intenção</p>
                                                                    <p className="text-[10px] font-bold text-white/80 leading-tight">{structuredAnalysis.intencao_compra}</p>
                                                                </div>
                                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 shadow-inner">
                                                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Estágio</p>
                                                                    <p className="text-[10px] font-bold text-white/80 leading-tight">{structuredAnalysis.estagio_negociacao}</p>
                                                                </div>
                                                            </div>

                                                            <div className="p-4 rounded-2xl bg-rose-500/[0.03] border border-rose-500/10 backdrop-blur-sm">
                                                                <p className="text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                                                                    <AlertCircle size={10} /> Objeções Principais
                                                                </p>
                                                                <p className="text-[10px] font-bold text-white/70 leading-relaxed italic">"{structuredAnalysis.objecoes}"</p>
                                                            </div>

                                                            <div className="p-5 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/10 backdrop-blur-sm relative overflow-hidden group">
                                                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full -mr-12 -mt-12" />
                                                                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2 relative z-10">
                                                                    <Zap size={10} fill="currentColor" /> Recomendação Estratégica
                                                                </p>
                                                                <p className="text-[11px] font-black text-white leading-relaxed relative z-10">{structuredAnalysis.recomendacao_abordagem}</p>
                                                            </div>
                                                        </motion.div>
                                                    )}

                                                    {actionLead.ai_reason && (
                                                        <div className="space-y-4">
                                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                                                <p className="text-[11px] text-white/50 leading-relaxed italic">{actionLead.ai_reason}</p>
                                                            </div>

                                                            {actionLead.behavioral_profile && (
                                                                <div className="space-y-4">
                                                                    <div className="p-6 rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent border border-white/10 flex items-center justify-between group overflow-hidden relative">
                                                                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-red-600/10" />
                                                                        <div className="flex items-center gap-5 relative z-10">
                                                                            <div className={`w-16 h-16 rounded-[1.5rem] border-2 flex items-center justify-center shadow-2xl ${(actionLead.ai_score ?? 0) >= 70 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500 shadow-emerald-500/10' : (actionLead.ai_score ?? 0) >= 40 ? 'border-amber-500/30 bg-amber-500/5 text-amber-500 shadow-amber-500/10' : 'border-red-500/30 bg-red-500/5 text-red-500 shadow-red-500/10'}`}>
                                                                                <span className="text-2xl font-black">{(actionLead.ai_score ?? 0) || 0}</span>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] leading-none mb-1.5">Temperatura</p>
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`w-2 h-2 rounded-full animate-pulse ${actionLead.ai_classification === 'hot' ? 'bg-rose-500' : actionLead.ai_classification === 'warm' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                                                                                    <p className={`text-sm font-black uppercase tracking-widest ${actionLead.ai_classification === 'hot' ? 'text-rose-500' : actionLead.ai_classification === 'warm' ? 'text-amber-500' : 'text-sky-500'}`}>
                                                                                        {actionLead.ai_classification?.toUpperCase() || 'WARM'}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div className="p-5 rounded-[2rem] bg-white/5 border border-white/5">
                                                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5 pl-1">Probabilidade</p>
                                                                            <p className="text-xs font-black text-emerald-500 uppercase pl-1">{actionLead.behavioral_profile.closing_probability || 0}%</p>
                                                                        </div>
                                                                        <div className="p-5 rounded-[2rem] bg-white/5 border border-white/5">
                                                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5 pl-1">Urgência</p>
                                                                            <p className={`text-xs font-black uppercase pl-1 ${actionLead.behavioral_profile.urgency === 'high' ? 'text-rose-500' : 'text-amber-500'}`}>
                                                                                {actionLead.behavioral_profile.urgency === 'high' ? 'Alta' : 'Média'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </section>
                                        </div>

                                    </div>
                                )
                                }

                                <footer className="mt-8 pt-8 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <a
                                        href={`tel:${actionLead.phone}`}
                                        className="py-3.5 rounded-[2rem] bg-white/5 border border-white/10 text-[10px] font-black text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Phone size={16} /> LIGAR
                                    </a>
                                    <a
                                        href={`https://wa.me/${actionLead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(getWhatsAppMessage(actionLead, 'stage'))}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="py-3.5 rounded-[2rem] bg-emerald-600 text-white text-[10px] font-black shadow-xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 transition-all active:scale-95"
                                    >
                                        <MessageSquare size={16} /> WHATSAPP
                                    </a>
                                    <button
                                        onClick={() => setIsFinishing(true)}
                                        className="py-3.5 rounded-[2rem] bg-red-600/10 border border-red-600/20 text-red-500 text-[10px] font-black hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 uppercase"
                                    >
                                        Finalizar
                                    </button>
                                    {userRole === 'admin' && (
                                        <button
                                            onClick={handleDeleteLead}
                                            className="py-3.5 rounded-[2rem] bg-rose-950/20 border border-rose-500/20 text-rose-500 text-[10px] font-black hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-2 uppercase"
                                        >
                                            <AlertCircle size={16} /> Excluir
                                        </button>
                                    )}
                                </footer>
                            </motion.div >

                            {/* Render the Finshing Modals OUTSIDE the sliding scrollable div to avoid overflow clipping and trapped z-index */}
                            <AnimatePresence>
                                {
                                    isFinishing && (
                                        <motion.div
                                            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
                                            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 pointer-events-auto"
                                        >
                                            <div className="glass-card w-full max-w-md p-10 space-y-8 bg-[#0a0f1d] border-red-500/20 relative shadow-2xl rounded-[3rem]">
                                                <button
                                                    onClick={() => setIsFinishing(false)}
                                                    className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors"
                                                >
                                                    <Plus size={24} className="rotate-45" />
                                                </button>

                                                <div className="text-center space-y-2">
                                                    <div className="h-16 w-16 rounded-3xl bg-red-600/20 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
                                                        <Zap size={32} className="text-red-500" />
                                                    </div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Finalizar Atendimento</h3>
                                                    <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Qual foi o desfecho para {actionLead.name}?</p>
                                                </div>

                                                <div className="grid gap-4">
                                                    <button
                                                        onClick={() => {
                                                            setIsRecordingSale(true);
                                                            setIsFinishing(false);
                                                        }}
                                                        className="w-full py-6 rounded-3xl bg-emerald-600 text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                                                    >
                                                        <BadgeCheck size={20} /> VENDA REALIZADA
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            setIsRecordingPurchase(true);
                                                            setIsFinishing(false);
                                                        }}
                                                        className="w-full py-6 rounded-3xl bg-indigo-600 text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                                                    >
                                                        <Zap size={20} /> COMPRA REALIZADA
                                                    </button>

                                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] text-center">Ou motivo da perda</p>
                                                        <select
                                                            value={lossReason}
                                                            onChange={(e) => setLossReason(e.target.value)}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium [color-scheme:dark]"
                                                        >
                                                            <option value="" className="bg-[#080c18]">Selecione um motivo...</option>
                                                            <option value="Preço alto" className="bg-[#080c18]">Preço alto / Sem margem</option>
                                                            <option value="Comprou em outro lugar" className="bg-[#080c18]">Comprou em outro lugar</option>
                                                            <option value="Desistiu da compra" className="bg-[#080c18]">Desistiu da compra</option>
                                                            <option value="Sem crédito" className="bg-[#080c18]">Sem crédito aprovado</option>
                                                            <option value="Veículo vendido" className="bg-[#080c18]">Veículo de interesse vendido</option>
                                                            <option value="Sem contato/Frio" className="bg-[#080c18]">Sem resposta / Muito Frio</option>
                                                        </select>

                                                        {lossReason && (
                                                            <div className="space-y-2 mt-4 animate-in fade-in slide-in-from-top-4">
                                                                <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] text-center mb-2">Descreva exatamente por que a venda não aconteceu</p>
                                                                <textarea
                                                                    value={lossSummary}
                                                                    onChange={(e) => setLossSummary(e.target.value)}
                                                                    placeholder="Cole aqui a exportação do WhatsApp ou digite o resumo claro do desfecho..."
                                                                    className="w-full h-32 bg-white/5 border border-red-500/20 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all resize-none custom-scrollbar"
                                                                />
                                                                <p className="text-[9px] text-white/30 text-center">*Obrigatório para registrar a perda.</p>
                                                            </div>
                                                        )}

                                                        <button
                                                            disabled={!lossReason || !lossSummary.trim()}
                                                            onClick={() => handleCloseLead('lost')}
                                                            className={`w-full py-5 mt-4 rounded-3xl border text-xs font-black uppercase tracking-[0.2em] transition-all ${lossReason && lossSummary.trim() ? 'border-red-500/40 text-red-500 hover:bg-red-600 hover:text-white shadow-xl shadow-red-600/20' : 'border-white/5 text-white/10 cursor-not-allowed'}`}
                                                        >
                                                            CONFIRMAR PERDA
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                }

                                {
                                    isRecordingSale && (
                                        <motion.div
                                            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
                                            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 pointer-events-auto"
                                        >
                                            <div className="glass-card w-full max-w-md p-10 space-y-8 bg-[#0a0f1d] border-emerald-500/20 relative shadow-2xl rounded-[3rem]">
                                                <button
                                                    onClick={() => setIsRecordingSale(false)}
                                                    className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors"
                                                >
                                                    <Plus size={24} className="rotate-45" />
                                                </button>

                                                <div className="text-center space-y-2">
                                                    <div className="h-16 w-16 rounded-3xl bg-emerald-600/20 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                                                        <CreditCard size={32} className="text-emerald-500" />
                                                    </div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Registrar Venda</h3>
                                                    <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Parabéns pela venda para {actionLead.name}!</p>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Detalhes do Veículo Vendido</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Ex: Honda Civic 2020 LXR"
                                                            value={saleData.vehicle_details}
                                                            onChange={(e) => setSaleData({ ...saleData, vehicle_details: e.target.value })}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                                                        />
                                                    </div>

                                                    <button
                                                        onClick={handleRecordSale}
                                                        className="w-full py-6 mt-4 rounded-3xl bg-emerald-600 text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                                                    >
                                                        CONFIRMAR E FINALIZAR
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                }

                                {
                                    isRecordingPurchase && (
                                        <motion.div
                                            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
                                            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 pointer-events-auto"
                                        >
                                            <div className="glass-card w-full max-w-md p-10 space-y-8 bg-[#0a0f1d] border-indigo-500/20 relative shadow-2xl rounded-[3rem]">
                                                <button
                                                    onClick={() => setIsRecordingPurchase(false)}
                                                    className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors"
                                                >
                                                    <Plus size={24} className="rotate-45" />
                                                </button>

                                                <div className="text-center space-y-2">
                                                    <div className="h-16 w-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6">
                                                        <Zap size={32} className="text-indigo-500" />
                                                    </div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Registrar Compra</h3>
                                                    <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Parabéns pela compra de {actionLead.name}!</p>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Detalhes do Veículo</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Ex: Honda Civic 2020 LXR"
                                                            value={purchaseData.vehicle_details}
                                                            onChange={(e) => setPurchaseData({ ...purchaseData, vehicle_details: e.target.value })}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Valor da Compra</label>
                                                        <input
                                                            type="text"
                                                            placeholder="R$ 0,00"
                                                            value={purchaseData.purchase_value}
                                                            onChange={(e) => setPurchaseData({ ...purchaseData, purchase_value: formatCurrencyInput(e.target.value) })}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                                        />
                                                    </div>

                                                    <button
                                                        onClick={handleRecordPurchase}
                                                        className="w-full py-6 mt-4 rounded-3xl bg-indigo-600 text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                                                    >
                                                        CONFIRMAR E FINALIZAR
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                }
                            </AnimatePresence >
                        </div>
                    )
                }
            </AnimatePresence >
            {/* Manual Lead Registration Modal */}
            <AnimatePresence>
                {
                    isAddingLead && (
                        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsAddingLead(false)}
                                className="absolute inset-0 bg-black/80 backdrop-blur-md pointer-events-auto"
                            />
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="w-full max-w-lg bg-[#080c18] border border-white/10 rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] pointer-events-auto z-[160] overflow-hidden"
                            >
                                <div className="p-10 space-y-8">
                                    <header className="flex flex-col gap-6 mb-10">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-600/20 border border-red-500/20">
                                                    <Zap size={20} className="text-red-500" />
                                                </div>
                                                <div>
                                                    <h3 className="font-outfit font-black text-xl tracking-tighter uppercase text-white">Novo Lead</h3>
                                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-tighter">Registro Manual</p>
                                                </div>
                                            </div>
                                            {userRole === 'admin' && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => whatsappFolderInputRef.current?.click()}
                                                        disabled={isAnalyzing}
                                                        className="h-10 px-4 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/10"
                                                    >
                                                        {isAnalyzing ? <RefreshCcw size={14} className="animate-spin" /> : <Upload size={14} />}
                                                        Importar Pasta WhatsApp
                                                    </button>
                                                    <input
                                                        type="file"
                                                        ref={whatsappFolderInputRef}
                                                        onChange={handleWhatsAppFolderUpload}
                                                        className="hidden"
                                                        {...({ webkitdirectory: "", directory: "" } as any)}
                                                        multiple
                                                    />
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setIsAddingLead(false)}
                                                className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 hover:text-white transition-all"
                                            >
                                                <Plus size={24} className="rotate-45" />
                                            </button>
                                        </div>
                                    </header>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Nome do Cliente</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Alexandre Gorges"
                                                value={newLeadData.name}
                                                onChange={(e) => setNewLeadData({ ...newLeadData, name: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">WhatsApp / Telefone</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: (47) 99999-9999"
                                                value={newLeadData.phone}
                                                onChange={(e) => {
                                                    const masked = formatPhoneBR(e.target.value);
                                                    setNewLeadData({ ...newLeadData, phone: masked });
                                                }}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Interesse Principal (Carro)</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Toyota Corolla"
                                                value={newLeadData.vehicle_interest}
                                                onChange={(e) => setNewLeadData({ ...newLeadData, vehicle_interest: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Valor de Investimento</label>
                                                <input
                                                    type="text"
                                                    placeholder="R$ 0,00"
                                                    value={newLeadData.valor_investimento}
                                                    onChange={(e) => {
                                                        const masked = formatCurrencyInput(e.target.value);
                                                        setNewLeadData({ ...newLeadData, valor_investimento: masked });
                                                    }}
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Possui Troca?</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ex: Palio 2015"
                                                    value={newLeadData.carro_troca}
                                                    onChange={(e) => setNewLeadData({ ...newLeadData, carro_troca: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            onClick={async () => {
                                                if (!newLeadData.name || !newLeadData.phone) {
                                                    showToast("Por favor, preencha nome e telefone.", "error");
                                                    return;
                                                }
                                                try {
                                                    const newLead = await dataService.createLead({
                                                        ...newLeadData,
                                                        source: userName ? `Registro ${userName}` : 'Registro Manual',
                                                        ai_classification: 'warm',
                                                        ai_score: 0,
                                                        status: 'attempt',
                                                        assigned_consultant_id: currentConsultantId || undefined,
                                                        valor_investimento: newLeadData.valor_investimento,
                                                        carro_troca: newLeadData.carro_troca
                                                    });
                                                    if (newLead) {
                                                        setLeads(prev => [newLead as Lead, ...prev]);
                                                        setIsAddingLead(false);
                                                        setNewLeadData({ name: '', phone: '', vehicle_interest: '', valor_investimento: '', carro_troca: '' });
                                                        showToast("Novo lead registrado com sucesso!", "success");

                                                        // Abre automaticamente as ações para o novo lead
                                                        setTimeout(() => {
                                                            setActionLead(newLead as Lead);
                                                        }, 300);
                                                    }
                                                } catch (err: any) {
                                                    console.error("Error creating lead:", err);
                                                    showToast(`Erro ao criar lead: ${err.message || 'Falha desconhecida'}`, "error");
                                                }
                                            }}
                                            className="w-full py-5 rounded-3xl bg-red-600 text-white text-xs font-black uppercase tracking-[0.3em] hover:bg-red-500 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-red-600/20"
                                        >
                                            Confirmar Registro
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Toast Notification */}
            <AnimatePresence>
                {
                    toast.visible && (
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-4 px-8 py-5 rounded-[2.5rem] bg-[#0a0f1d] border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                        >
                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-500' :
                                toast.type === 'error' ? 'bg-red-500/20 text-red-500' :
                                    'bg-blue-500/20 text-blue-500'
                                }`}>
                                {toast.type === 'success' ? <BadgeCheck size={28} /> :
                                    toast.type === 'error' ? <AlertCircle size={28} /> :
                                        <Sparkles size={28} />}
                            </div>
                            <div className="pr-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-0.5">Notificação Manos</p>
                                <p className="text-base font-black text-white tracking-tight">{toast.message}</p>
                            </div>
                        </motion.div>
                    )
                }
            </AnimatePresence >
        </div >
    );
}

export default function LeadsPage() {
    return (
        <Suspense key="leads-page-suspense" fallback={
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <LeadsContent />
        </Suspense>
    );
}


