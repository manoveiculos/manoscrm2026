'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
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
    RefreshCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { dataService } from '@/lib/dataService';
import { supabase } from '@/lib/supabase';
import { Lead, LeadStatus, Consultant, InventoryItem, AIClassification } from '@/lib/types';

function LeadsContent() {
    const searchParams = useSearchParams();
    const leadIdFromUrl = searchParams.get('id');
    const viewFromUrl = searchParams.get('view');

    const [searchTerm, setSearchTerm] = useState('');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [actionLead, setActionLead] = useState<Lead | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>(viewFromUrl === 'kanban' ? 'kanban' : 'list');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [chatText, setChatText] = useState('');
    const [activeMoveMenu, setActiveMoveMenu] = useState<string | null>(null);
    const [scrollProgress, setScrollProgress] = useState(0);
    const [consultants, setConsultants] = useState<Consultant[]>([]);
    const [userRole, setUserRole] = useState<string>('consultant');
    const [userName, setUserName] = useState<string>('');
    const [currentConsultantId, setCurrentConsultantId] = useState<string | null>(null);
    const [editDetails, setEditDetails] = useState<Partial<Lead>>({});
    const [isFinishing, setIsFinishing] = useState(false);
    const [lossReason, setLossReason] = useState('');
    const [isAddingLead, setIsAddingLead] = useState(false);
    const [isRecordingSale, setIsRecordingSale] = useState(false);
    const [saleData, setSaleData] = useState({
        sale_value: '',
        profit_margin: ''
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
    const [modalTab, setModalTab] = useState<'details' | 'karbam'>('details');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const whatsappFolderInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
        message: '',
        type: 'info',
        visible: false
    });
    const [moveMenuDirection, setMoveMenuDirection] = useState<'up' | 'down'>('down');
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [showVehicleResults, setShowVehicleResults] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type, visible: true });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
    };

    const handleLeadSmartClick = (lead: Lead) => {
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;

            // Double click: Open action modal
            setActionLead(lead);
            setSelectedLead(null);
            setIsFinishing(false);
        } else {
            // First click: Start detection timer
            clickTimerRef.current = setTimeout(() => {
                // Single click: Open side panel
                setSelectedLead(lead);
                clickTimerRef.current = null;
            }, 300); // 300ms window is more comfortable
        }
    };

    // Initialize edit details when action lead changes
    useEffect(() => {
        if (actionLead) {
            setEditDetails({
                vehicle_interest: actionLead.vehicle_interest || '',
                carro_troca: actionLead.carro_troca || '',
                valor_investimento: actionLead.valor_investimento || '',
                scheduled_at: actionLead.scheduled_at || '',
                ai_summary: actionLead.ai_summary || '',
                ai_reason: actionLead.ai_reason || ''
            });
        }
    }, [actionLead]);

    const handleSaveDetails = async () => {
        if (!actionLead) return;
        try {
            // Clean up details before saving
            const detailsToSave = { ...editDetails };

            // If we are scheduling or rescheduling, update status and log it
            if (detailsToSave.scheduled_at && detailsToSave.scheduled_at !== actionLead.scheduled_at) {
                detailsToSave.status = 'scheduled' as LeadStatus;

                const schedDate = new Date(detailsToSave.scheduled_at);
                const formattedSched = schedDate.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });

                const schedNote = `📅 AGENDAMENTO REALIZADO PARA: ${formattedSched}`;
                detailsToSave.ai_summary = actionLead.ai_summary
                    ? `${schedNote}\n\n${actionLead.ai_summary}`
                    : schedNote;
            } else {
                detailsToSave.ai_summary = actionLead.ai_summary; // Keep existing summary if not scheduling
            }

            // Remove empty date strings to prevent DB errors
            if (!detailsToSave.scheduled_at) {
                delete detailsToSave.scheduled_at;
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

            console.log("Saving lead details:", detailsToSave);
            await dataService.updateLeadDetails(actionLead.id, detailsToSave);

            setLeads(prev => prev.map(l => l.id === actionLead.id ? { ...l, ...detailsToSave } : l));

            if (selectedLead?.id === actionLead.id) {
                setSelectedLead(prev => prev ? { ...prev, ...detailsToSave } : null);
            }

            setActionLead(prev => prev ? { ...prev, ...detailsToSave } : null);

            // Clear ONLY the new note input area
            setNewNoteText('');

            showToast("Dados atualizados com sucesso!", "success");
        } catch (err: any) {
            console.error("Error saving lead details:", err);
            showToast(`Erro ao salvar alterações: ${err.message || 'Erro desconhecido'}`, "error");
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
                'closed': 'VENDA REALIZADA'
            };

            const logNote = `🏁 ATENDIMENTO FINALIZADO: ${desfechoLabels[desfecho] || desfecho.toUpperCase()}${lossReason ? `\nMotivo: ${lossReason}` : ''}`;

            const updatedSummary = actionLead.ai_summary
                ? `${logNote}\n\n${actionLead.ai_summary}`
                : logNote;

            await dataService.updateLeadStatus(actionLead.id, desfecho, actionLead.status, logNote);
            await dataService.updateLeadDetails(actionLead.id, { ai_summary: updatedSummary });

            setLeads(prev => prev.map(l => l.id === actionLead.id ? { ...l, status: desfecho, ai_summary: updatedSummary } : l));
            setActionLead(null);
            setIsFinishing(false);
            setLossReason('');

            alert(`Atendimento finalizado com sucesso!`);
        } catch (err: any) {
            console.error("Error closing lead:", err);
            alert(`Erro ao finalizar atendimento: ${err.message}`);
        }
    };

    const handleRecordSale = async () => {
        if (!actionLead) return;
        if (!saleData.sale_value || !saleData.profit_margin) {
            alert("Por favor, preencha o valor da venda e a margem.");
            return;
        }

        try {
            await dataService.recordSale({
                lead_id: actionLead.id,
                consultant_id: currentConsultantId || actionLead.assigned_consultant_id,
                sale_value: parseFloat(saleData.sale_value.replace(/\D/g, '')) / 100,
                profit_margin: parseFloat(saleData.profit_margin.replace(/\D/g, '')) / 100,
                sale_date: new Date().toISOString()
            });

            await handleCloseLead('closed');
            setIsRecordingSale(false);
            setSaleData({ sale_value: '', profit_margin: '' });
        } catch (err: any) {
            console.error("Error recording sale:", err);
            alert(`Erro ao registrar venda: ${err.message}`);
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

    const formatPhoneBR = (val: string) => {
        const digits = val.replace(/\D/g, '');
        if (!digits) return '';
        if (digits.length <= 2) return `(${digits}`;
        if (digits.length <= 6) return `(${digits.substring(0, 2)}) ${digits.substring(2)}`;
        if (digits.length <= 10) return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7, 11)}`;
    };

    // Update view mode if URL changes
    useEffect(() => {
        if (viewFromUrl === 'kanban') setViewMode('kanban');
        else if (viewFromUrl === 'list') setViewMode('list');
    }, [viewFromUrl]);

    const getStatusLabel = (status: string) => {
        const labels: { [key: string]: string } = {
            'new': 'AGUARDANDO',
            'received': 'AGUARDANDO',
            'attempt': 'EM ATENDIMENTO',
            'contacted': 'CONTATADO',
            'confirmed': 'CONFIRMADO',
            'scheduled': 'AGENDAMENTO',
            'visited': 'VISITA REALIZADA',
            'test_drive': 'TEST DRIVE',
            'proposed': 'PROPOSTA',
            'negotiation': 'NEGOCIAÇÃO',
            'closed': 'VENDIDO',
            'post_sale': 'SEM CONTATO',
            'lost': 'PERDA TOTAL'
        };
        return labels[status] || status.toUpperCase();
    };

    const getStatusColor = (status: string) => {
        if (['received', 'new'].includes(status)) return 'bg-blue-500';
        if (['attempt', 'contacted', 'confirmed'].includes(status)) return 'bg-amber-500';
        if (['scheduled', 'visited', 'test_drive', 'proposed', 'negotiation'].includes(status)) return 'bg-red-500';
        if (status === 'closed') return 'bg-emerald-500';
        if (status === 'post_sale' || status === 'lost') return 'bg-white/20';
        return 'bg-white/20';
    };

    const getAIClassLabel = (classification: string) => {
        const labels: { [key: string]: string } = {
            'hot': 'Qualificado',
            'warm': 'Potencial',
            'cold': 'Frio'
        };
        return labels[classification] || classification;
    };

    const formatValue = (val: string) => {
        if (!val) return '';
        return val.replace(/_/g, ' ').trim();
    };

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
                if (consultant) {
                    setUserRole(consultant.role || 'consultant');
                    setUserName(consultant.name || '');
                    setCurrentConsultantId(consultant.id);
                    if (consultant.role === 'consultant') {
                        consultantFilter = consultant.id;
                    }
                } else {
                    setUserRole('consultant');
                    setUserName('');
                    setCurrentConsultantId(null);
                }

                const data = await dataService.getLeads(consultantFilter);
                setLeads(data || []);

                // Load all consultants for admin assignment
                if (consultant?.role === 'admin' || session.user.email === 'alexandre_gorges@hotmail.com') {
                    setUserRole('admin');
                    const consultantsData = await dataService.getConsultants();
                    setConsultants(consultantsData || []);
                } else {
                    setUserRole('consultant');
                }

                // Load inventory for vehicle selection
                const inventoryData = await dataService.getInventory();
                setInventory(inventoryData || []);

                if (leadIdFromUrl && data) {
                    const lead = data.find((l: Lead) => l.id === leadIdFromUrl);
                    if (lead) setSelectedLead(lead);
                }
            } catch (err) {
                console.error("Error loading leads:", err);
            } finally {
                setLoading(false);
            }
        }
        loadLeads();
    }, [leadIdFromUrl]);

    // URL based actions
    useEffect(() => {
        const addMode = searchParams.get('add');
        if (addMode === 'true') {
            setIsAddingLead(true);
        }
    }, [searchParams]);

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

        // If moving to closed or lost, trigger the finishing flow instead of silent update
        if (newStatus === 'closed') {
            setActionLead(lead);
            setIsFinishing(true);
            setIsRecordingSale(true);
            const defaultVal = lead.valor_investimento || '';
            setSaleData({ sale_value: defaultVal, profit_margin: '' });
            return;
        }

        if (newStatus === 'lost') {
            setActionLead(lead);
            setIsFinishing(true);
            setLossReason('waiting');
            return;
        }

        try {
            await dataService.updateLeadStatus(leadId, newStatus, lead.status);
            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
            if (selectedLead?.id === leadId) setSelectedLead({ ...lead, status: newStatus });
        } catch (err) {
            console.error("Error updating status:", err);
            alert("Erro ao atualizar status do lead.");
        }
    };

    const handleScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
            const progress = (scrollLeft / (scrollWidth - clientWidth)) * 100;
            setScrollProgress(progress || 0);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const filesArray = Array.from(files);
        const chatFile = filesArray.find(f =>
            f.name.toLowerCase().includes('_chat.txt') ||
            f.name.toLowerCase().includes('chat.txt') ||
            (files.length === 1 && f.type === 'text/plain')
        );

        if (chatFile) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                if (text && text.length > 10) {
                    setChatText(text);
                    const path = chatFile.webkitRelativePath || chatFile.name;
                    const phoneMatch = path.match(/\+?\d{2}\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);

                    if (phoneMatch) {
                        showToast(`Conversa carregada! Telefone detectado: ${phoneMatch[0]}`, 'success');
                    } else {
                        showToast("Conversa carregada com sucesso!", 'success');
                    }
                }
            };
            reader.readAsText(chatFile);
        } else {
            showToast("Não foi possível encontrar um arquivo de chat (.txt) válido.", 'error');
        }
    };

    const handleWhatsAppFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || userRole !== 'admin') return;

        setIsAnalyzing(true);
        showToast("Iniciando processamento da pasta WhatsApp...", "info");

        try {
            const filesArray = Array.from(files);
            const chatFile = filesArray.find(f => f.name.toLowerCase().includes('chat.txt') || f.name.toLowerCase().includes('_chat.txt'));

            if (!chatFile) {
                showToast("Arquivo de chat não encontrado na pasta selecionada.", "error");
                setIsAnalyzing(false);
                return;
            }

            // Extract contact from folder name
            const folderPath = chatFile.webkitRelativePath || '';
            const folderName = folderPath.split('/')[0] || '';

            // Clean name and phone
            let contactName = "Lead WhatsApp";
            let contactPhone = "";

            // Better regex for phone numbers in folder names (e.g. +55 47 9999-9999)
            const phoneMatch = folderName.match(/\+?(\d[\s\-\(\).]{0,2}){8,}\d/);
            if (phoneMatch) {
                contactPhone = phoneMatch[0].replace(/[\s\-\(\).]/g, '');
                contactName = folderName.replace(phoneMatch[0], '').replace(/[-_]/g, ' ').trim() || "Lead WhatsApp";
            } else {
                contactName = folderName.replace(/[-_]/g, ' ').trim() || "Lead WhatsApp";
            }

            console.log("WA Import Extraction:", { folderName, contactName, contactPhone });

            const chatText = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target?.result as string);
                reader.onerror = (err) => reject(err);
                reader.readAsText(chatFile);
            });

            if (!chatText) throw new Error("O arquivo de conversa está vazio ou não pôde ser lido.");

            // Create lead with WA source
            const newLead = await dataService.createLead({
                name: contactName,
                phone: contactPhone || '999999999',
                source: 'WhatsApp',
                status: 'new',
                ai_classification: 'warm',
                ai_score: 50
            });

            if (newLead) {
                // Trigger AI Analysis for the new lead
                let aiResult: any = { ai_classification: 'warm', ai_score: 50 };
                try {
                    const aiResponse = await fetch('/api/analyze-chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            leadId: (newLead as Lead).id,
                            chatText: chatText,
                            leadName: contactName
                        })
                    });

                    if (aiResponse.ok) {
                        const res = await aiResponse.json();
                        if (res.success) aiResult = res;
                    }
                } catch (aiErr) {
                    console.warn("Auto-analysis failed during folder import:", aiErr);
                }

                const finalLead: Lead = {
                    ...(newLead as Lead),
                    name: aiResult.extracted_name || (newLead as Lead).name,
                    ai_summary: aiResult.resumo_estrategico || aiResult.ai_reason || aiResult.ai_summary || 'Análise automática de pasta concluída.',
                    ai_score: aiResult.score || aiResult.ai_score || 50,
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

    const analyzeConversation = async () => {
        if (!chatText || chatText.length < 10) return;

        const leadToAnalyze = actionLead || selectedLead;
        if (!leadToAnalyze) {
            alert("Nenhum lead selecionado para análise.");
            return;
        }

        setIsAnalyzing(true);
        try {
            const response = await fetch('/api/analyze-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId: leadToAnalyze.id,
                    chatText: chatText,
                    leadName: leadToAnalyze.name
                })
            });

            const aiResult = await response.json();

            if (response.ok) {
                // Prepare details with behavioral data and auto-filled fields
                const updatedFields = {
                    ai_score: aiResult.score || aiResult.ai_score,
                    ai_classification: (aiResult.classificacao?.toLowerCase() || 'warm'),
                    ai_reason: aiResult.resumo_estrategico || aiResult.ai_reason,
                    ai_summary: aiResult.resumo_estrategico || aiResult.ai_reason,
                    behavioral_profile: {
                        ...(aiResult.behavioral_profile || {}),
                        funnel_stage: aiResult.estagio_funil,
                        closing_probability: aiResult.probabilidade_fechamento
                    },
                    next_step: aiResult.proxima_acao || aiResult.next_step,
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
        }
    };

    const filteredLeads = leads.filter(lead =>
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.vehicle_interest?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.source?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20">
            {/* Header with Search and Stats */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black tracking-tighter text-white font-outfit">
                        Central de <span className="text-red-600">Leads</span>
                    </h1>
                    <p className="text-white/40 font-medium italic">Gestão de funil comercial e integração direta com Meta Ads.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por nome, carro ou canal..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:bg-white/10 transition-all w-full md:w-80 font-medium"
                        />
                    </div>
                </div>
            </header>

            {/* View Mode Switcher */}
            <div className="flex items-center justify-between relative">
                <div className="flex items-center bg-white/5 border border-white/10 p-1.5 rounded-2xl shadow-2xl">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 ${viewMode === 'list' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
                    >
                        Lista de Leads
                    </button>
                    <button
                        onClick={() => setViewMode('kanban')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 ${viewMode === 'kanban' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
                    >
                        Pipeline Comercial
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsAddingLead(true)}
                        className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-600 hover:border-red-600 hover:shadow-[0_0_20px_rgba(227,30,36,0.3)] transition-all flex items-center gap-2 group relative overflow-hidden"
                    >
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-red-600 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                        <Plus size={16} className="text-red-500 group-hover:text-white transition-colors animate-pulse" />
                        NOVO LEAD MANUAL
                    </button>
                    <div className="hidden lg:flex flex-col text-right">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Acesso Rápido</span>
                        <span className="text-[9px] font-bold text-red-500 uppercase tracking-tighter italic">Registro de Balcão</span>
                    </div>
                </div>
                <div className="hidden md:flex items-center gap-4 text-[10px] font-black text-white/20 uppercase tracking-widest">
                    <span>Total: {filteredLeads.length} Leads</span>
                    <div className="h-4 w-px bg-white/10" />
                    <span className="text-emerald-500">IA Monitorando Ativamente</span>
                </div>

                {/* Scroll Progress Bar (Only for Kanban) */}
                {viewMode === 'kanban' && (
                    <div
                        className="absolute -bottom-6 left-0 right-0 h-2 bg-white/5 rounded-full overflow-hidden cursor-pointer group/scroll"
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
                            className="h-full bg-red-600 shadow-[0_0_15px_rgba(227,30,36,0.6)] group-hover/scroll:bg-red-500 transition-colors"
                            initial={{ width: 0 }}
                            animate={{ width: `${scrollProgress}%` }}
                            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                        />
                    </div>
                )}
            </div>

            <style jsx global>{`
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
            `}</style>

            <AnimatePresence mode="wait">
                {viewMode === 'kanban' ? (
                    <motion.div
                        key="kanban"
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex gap-6 overflow-x-auto pb-10 min-h-[70vh] px-2 hide-scrollbar"
                    >
                        {([
                            { id: 'aguardando', title: 'Aguardando', statuses: ['new', 'received'], color: 'bg-blue-500' },
                            { id: 'atendimento', title: 'Em Atendimento', statuses: ['attempt', 'contacted', 'confirmed'], color: 'bg-amber-500' },
                            { id: 'agendamento', title: 'Agendamento', statuses: ['scheduled'], color: 'bg-red-500' },
                            { id: 'visita', title: 'Visita e Test Drive', statuses: ['visited', 'test_drive'], color: 'bg-red-600' },
                            { id: 'negociacao', title: 'Negociação', statuses: ['proposed', 'negotiation'], color: 'bg-red-700' },
                            { id: 'venda', title: 'Vendido', statuses: ['closed'], color: 'bg-emerald-500' },
                            { id: 'sem_contato', title: 'Sem Contato', statuses: ['post_sale'], color: 'bg-white/10' },
                            { id: 'perda', title: 'Perda Total', statuses: ['lost'], color: 'bg-white/5' }
                        ] as { id: string; title: string; statuses: LeadStatus[]; color: string }[]).map((col) => {
                            const colLeads = filteredLeads.filter(l => col.statuses.includes(l.status));
                            return (
                                <div key={col.id} className="flex-shrink-0 w-80 flex flex-col gap-4">
                                    <div className="flex items-center justify-between px-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                                            <h3 className="text-xs font-black uppercase tracking-widest text-white/60">{col.title}</h3>
                                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] font-bold text-white/30">{colLeads.length}</span>
                                        </div>
                                    </div>

                                    <div
                                        className="flex flex-col gap-3 min-h-[500px]"
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const leadId = e.dataTransfer.getData('leadId');
                                            handleStatusChange(leadId, col.statuses[0] as LeadStatus);
                                        }}
                                    >
                                        {colLeads.map((lead) => (
                                            <motion.div
                                                key={lead.id}
                                                layoutId={lead.id}
                                                draggable
                                                onDragStart={(e) => {
                                                    const dragEvent = e as unknown as React.DragEvent;
                                                    if (dragEvent.dataTransfer) dragEvent.dataTransfer.setData('leadId', lead.id);
                                                }}
                                                onClick={() => handleLeadSmartClick(lead)}
                                                className={`glass-card rounded-2xl p-4 cursor-grab active:cursor-grabbing hover:border-red-500/30 transition-all border border-white/5 group relative select-none ${activeMoveMenu === lead.id ? 'z-[200] border-red-500/50 shadow-[0_0_50px_rgba(220,38,38,0.2)]' : 'z-10'}`}
                                            >
                                                <div className="flex justify-between items-start mb-3 relative z-10">
                                                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                                        {lead.name[0]}
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="relative z-[100]"
                                                        >
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    const dropdownHeight = 350;
                                                                    const spaceBelow = window.innerHeight - rect.bottom;
                                                                    setMoveMenuDirection(spaceBelow < dropdownHeight ? 'up' : 'down');
                                                                    setActiveMoveMenu(activeMoveMenu === lead.id ? null : lead.id);
                                                                }}
                                                                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all border shadow-lg ${activeMoveMenu === lead.id ? 'bg-red-600 border-red-500 text-white shadow-red-600/20' : 'bg-white/10 border-white/10 text-white/60 hover:text-red-500 hover:bg-white/20'}`}
                                                            >
                                                                <ArrowRight size={18} className={activeMoveMenu === lead.id ? 'rotate-90 transition-transform' : 'transition-transform'} />
                                                            </button>

                                                            <AnimatePresence>
                                                                {activeMoveMenu === lead.id && (
                                                                    <>
                                                                        {/* Click Outside Backdrop */}
                                                                        <div
                                                                            className="fixed inset-0 z-[105]"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveMoveMenu(null);
                                                                            }}
                                                                        />
                                                                        <motion.div
                                                                            initial={{ opacity: 0, scale: 0.95, y: moveMenuDirection === 'up' ? 10 : -10 }}
                                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                            exit={{ opacity: 0, scale: 0.95, y: moveMenuDirection === 'up' ? 10 : -10 }}
                                                                            style={{
                                                                                bottom: moveMenuDirection === 'up' ? 'calc(100% + 15px)' : 'auto',
                                                                                top: moveMenuDirection === 'down' ? 'calc(100% + 15px)' : 'auto',
                                                                            }}
                                                                            className={`absolute right-0 w-64 bg-[#0a0a0a] border border-white/20 rounded-2xl shadow-[0_40px_120px_rgba(0,0,0,1),0_0_20px_rgba(220,38,38,0.15)] z-[210] py-4 overflow-hidden backdrop-blur-3xl border-red-500/50 ${moveMenuDirection === 'up' ? 'origin-bottom-right' : 'origin-top-right'}`}
                                                                        >
                                                                            <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 to-transparent pointer-events-none" />
                                                                            <div className="relative z-10">
                                                                                <div className="px-6 pb-4 mb-2 border-b border-white/10">
                                                                                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500 flex items-center gap-2">
                                                                                        <Zap size={10} fill="currentColor" /> Mover Lead para...
                                                                                    </p>
                                                                                </div>
                                                                                <div className="max-h-[300px] overflow-y-auto px-2 space-y-1.5 custom-scrollbar">
                                                                                    {[
                                                                                        { id: 'received' as LeadStatus, label: 'Aguardando', icon: <Users size={14} /> },
                                                                                        { id: 'attempt' as LeadStatus, label: 'Em Atendimento', icon: <Zap size={14} /> },
                                                                                        { id: 'scheduled' as LeadStatus, label: 'Agendamento', icon: <Calendar size={14} /> },
                                                                                        { id: 'visited' as LeadStatus, label: 'Visita e Test Drive', icon: <Car size={14} /> },
                                                                                        { id: 'proposed' as LeadStatus, label: 'Negociação', icon: <CreditCard size={14} /> },
                                                                                        { id: 'closed' as LeadStatus, label: 'Vendido', icon: <BadgeCheck size={14} className="text-emerald-500" /> },
                                                                                        { id: 'post_sale' as LeadStatus, label: 'Sem Contato', icon: <BadgeCheck size={14} className="text-white/40" /> },
                                                                                        { id: 'lost' as LeadStatus, label: 'Perda Total', icon: <AlertCircle size={14} className="text-white/20" /> }
                                                                                    ].filter(st => st.id !== lead.status).map((st) => (
                                                                                        <button
                                                                                            key={st.id}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                handleStatusChange(lead.id, st.id);
                                                                                                setActiveMoveMenu(null);
                                                                                            }}
                                                                                            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[12px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all group/item text-left"
                                                                                        >
                                                                                            <div className="p-2 rounded-lg bg-white/5 group-hover/item:bg-red-600/30 group-hover/item:text-red-500 transition-all">
                                                                                                {st.icon}
                                                                                            </div>
                                                                                            <span className="flex-1">{st.label}</span>
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    </>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>

                                                        <div className="text-right">
                                                            <div className="text-xl font-black text-white leading-none">
                                                                {lead.ai_score || 0}<span className="text-[10px] text-red-500 ml-0.5">%</span>
                                                            </div>
                                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-tighter">Score IA</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <h4 className="text-sm font-black text-white tracking-tight mb-1 truncate">{lead.name}</h4>
                                                <p className="text-[10px] font-bold text-white/40 mb-3 truncate italic">
                                                    {lead.vehicle_interest || 'Interesse em Compra'}
                                                </p>

                                                <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10">
                                                    <span className="px-2 py-0.5 rounded-lg bg-red-600/10 text-[9px] font-black text-red-500 border border-red-500/10">
                                                        {lead.source === 'Facebook Leads' ? 'Meta Ads' : lead.source}
                                                    </span>

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActionLead(lead);
                                                        }}
                                                        className="h-7 px-3 glass-card rounded-lg flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-red-400 hover:border-red-500/30 transition-all group/btn"
                                                    >
                                                        <Zap size={10} className="group-hover/btn:text-red-500 transition-colors" /> Ações
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))}

                                        {colLeads.length === 0 && (
                                            <div className="h-32 rounded-2xl border-2 border-dashed border-white/5 flex items-center justify-center">
                                                <p className="text-[10px] font-black text-white/10 uppercase tracking-widest">Vazio</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </motion.div>
                ) : (
                    <motion.div
                        key="list"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="glass-card rounded-[2.5rem] overflow-hidden"
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">
                                        <th className="px-10 py-6">Lead e Perfil Comercial</th>
                                        <th className="px-6 py-6">Interesse e Canal</th>
                                        <th className="px-6 py-6 font-outfit text-white">Consultor</th>
                                        <th className="px-6 py-6">Status Comercial</th>
                                        <th className="px-6 py-6 text-center">Score IA</th>
                                        <th className="px-10 py-6 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredLeads.map((lead, index) => (
                                        <motion.tr
                                            key={lead.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            onClick={() => handleLeadSmartClick(lead)}
                                            className="group border-b border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer select-none"
                                        >
                                            <td className="px-10 py-8">
                                                <div className="flex items-center gap-5">
                                                    <div className={`relative h-14 w-14 rounded-2xl flex items-center justify-center font-bold text-xl border ${lead.ai_classification === 'hot' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                        lead.ai_classification === 'warm' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                            'bg-white/5 text-white/40 border-white/10'
                                                        }`}>
                                                        {lead.name[0]}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-lg text-white group-hover:text-red-400 transition-colors tracking-tight">{lead.name}</p>
                                                        <p className="text-xs font-semibold text-white/30 mt-1 uppercase tracking-widest">{lead.phone}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-8">
                                                <p className="text-sm font-bold text-white/80">{lead.vehicle_interest || 'Interesse em Compra'}</p>
                                                <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-1">
                                                    {lead.source === 'Facebook Leads' ? 'Meta Ads' : lead.source}
                                                </p>
                                            </td>
                                            <td className="px-6 py-8">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-white/70">{lead.consultants_manos_crm?.name || 'Não Atribuído'}</span>
                                                    <span className="text-[10px] text-white/20 uppercase font-black tracking-widest mt-1">Designado</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-8">
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-2 w-2 rounded-full ${getStatusColor(lead.status)}`} />
                                                    <span className="text-xs font-black uppercase text-white/50 tracking-wider">
                                                        {getStatusLabel(lead.status)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-8 text-center">
                                                <div className="text-2xl font-black text-white">
                                                    {lead.ai_score || 0}<span className="text-[10px] text-white/20 ml-0.5">%</span>
                                                </div>
                                            </td>
                                            <td className="px-10 py-8 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActionLead(lead);
                                                    }}
                                                    className="h-10 px-4 glass-card rounded-xl inline-flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-red-400 hover:border-red-500/30 transition-all group/btn"
                                                >
                                                    <Zap size={14} className="group-hover/btn:text-red-500 transition-colors" /> Ações
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Slide-over Detail Panel (IA Analysis) */}
            <AnimatePresence>
                {selectedLead && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedLead(null)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60]"
                        />
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed right-0 top-0 h-screen w-full max-w-[480px] bg-[#080c18] border-l border-white/5 shadow-2xl z-[70] flex flex-col overflow-hidden"
                        >
                            <div className="p-6 md:p-8 flex flex-col h-full overflow-hidden">
                                <header className="flex items-center justify-between mb-6 shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
                                            <Sparkles size={18} />
                                        </div>
                                        <h3 className="font-outfit font-black text-lg tracking-tighter uppercase">Painel de Atendimento</h3>
                                    </div>
                                    <button onClick={() => setSelectedLead(null)} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors">
                                        <ArrowRight size={22} className="text-white/40" />
                                    </button>
                                </header>

                                <div className="flex-1 flex flex-col justify-between overflow-hidden gap-6">
                                    {/* Lead Info Card */}
                                    <div className="flex items-center gap-5 p-6 glass-card rounded-[2rem] border-white/5 bg-white/[0.02] shrink-0">
                                        <div className="h-20 w-20 rounded-[1.5rem] bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-4xl font-black text-white shadow-2xl relative overflow-hidden group shrink-0">
                                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            {selectedLead.name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className={`h-2 w-2 rounded-full ${getStatusColor(selectedLead.status)} animate-pulse shadow-[0_0_10px_rgba(255,0,0,0.5)]`} />
                                                <span className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">
                                                    {getStatusLabel(selectedLead.status)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <h2 className="text-3xl font-black tracking-tighter text-white font-outfit leading-tight truncate">{selectedLead.name}</h2>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActionLead(selectedLead);
                                                    }}
                                                    className="p-1.5 rounded-lg bg-red-600/10 border border-red-500/20 text-red-500 hover:bg-red-600 hover:text-white transition-all shadow-lg active:scale-95 shrink-0"
                                                    title="Ações Rápidas"
                                                >
                                                    <Zap size={16} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                                                    <Phone size={12} className="text-red-500" />
                                                    <span className="text-[11px] font-bold text-white/60">{selectedLead.phone}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Form Summary Card */}
                                    <div className="glass-card rounded-[2rem] p-7 space-y-5 bg-white/[0.01] border-white/5 flex-1 flex flex-col min-h-0 overflow-hidden">
                                        <div className="flex items-center gap-3 shrink-0">
                                            <FileText size={16} className="text-red-500" />
                                            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Resumo do Formulario</h4>
                                        </div>

                                        <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1 flex-1">
                                            <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                                                <span className="text-[9px] font-black uppercase text-white/20 tracking-wider">Interesse Principal</span>
                                                <span className="text-xs font-black text-white">{selectedLead.vehicle_interest || 'Geral'}</span>
                                            </div>

                                            {selectedLead.source === 'WhatsApp' ? (
                                                <div className="flex flex-col gap-3 bg-emerald-500/5 p-5 rounded-2xl border border-emerald-500/10 h-full min-h-0">
                                                    <span className="text-[9px] font-black uppercase text-emerald-500/40 tracking-wider">Resumo do Atendimento (IA)</span>
                                                    <div className="text-[11px] leading-relaxed text-white/70 italic overflow-y-auto custom-scrollbar pr-2 whitespace-pre-wrap">
                                                        {selectedLead.ai_summary || 'Sem resumo disponível.'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                                                        <span className="text-[9px] font-black uppercase text-white/20 tracking-wider">Investimento</span>
                                                        <span className="text-xs font-black text-white text-emerald-500">{selectedLead.valor_investimento || 'Nao informado'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                                                        <span className="text-[9px] font-black uppercase text-white/20 tracking-wider">Possui Troca</span>
                                                        <span className="text-xs font-black text-white">{selectedLead.carro_troca || 'Nao informado'}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons Footer */}
                                <div className="mt-8 grid grid-cols-2 gap-4 shrink-0 border-t border-white/5 pt-6">
                                    <a
                                        href={`tel:${selectedLead.phone}`}
                                        className="py-5 rounded-[2rem] bg-white/5 border border-white/10 text-[10px] font-black text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 group shadow-xl uppercase"
                                    >
                                        <Phone size={18} className="group-hover:text-amber-500 transition-colors" /> LIGAR
                                    </a>
                                    <a
                                        href={`https://wa.me/${selectedLead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                            `Olá ${selectedLead.name.split(' ')[0]}, tudo bem? Sou ${userName.toLowerCase().includes('camila') ? 'a consultora' : 'o consultor'} ${userName.split(' ')[0]} da Manos Veículos. Vi seu interesse no ${selectedLead.vehicle_interest || 'nosso estoque'} e gostaria de te ajudar!`
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="py-5 rounded-[2rem] bg-emerald-600 text-white text-[10px] font-black shadow-[0_15px_30px_rgba(16,185,129,0.2)] hover:bg-emerald-500 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 group uppercase"
                                    >
                                        <MessageSquare size={18} className="group-hover:translate-x-1 transition-transform" /> WHATSAPP
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Action Center Modal (Centro de Gestão) */}
            <AnimatePresence>
                {
                    actionLead && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => {
                                    setActionLead(null);
                                    setIsFinishing(false);
                                }}
                                className="absolute inset-0 bg-black/80 backdrop-blur-md pointer-events-auto"
                            />
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#0a0f1d] border border-white/10 rounded-[3.5rem] shadow-[0_50px_150px_rgba(0,0,0,0.9)] flex flex-col p-8 md:p-14 custom-scrollbar relative pointer-events-auto z-[110]"
                            >
                                <AnimatePresence>
                                    {isFinishing && (
                                        <motion.div
                                            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
                                            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            className="absolute inset-0 z-[100] bg-black/60 flex items-center justify-center p-10 rounded-[3rem]"
                                        >
                                            <div className="glass-card w-full max-w-md p-10 space-y-8 bg-[#0a0f1d] border-red-500/20 relative shadow-2xl">
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
                                                        </select>

                                                        <button
                                                            disabled={!lossReason}
                                                            onClick={() => handleCloseLead('lost')}
                                                            className={`w-full py-5 rounded-3xl border text-xs font-black uppercase tracking-[0.2em] transition-all ${lossReason ? 'border-red-500/40 text-red-500 hover:bg-red-600 hover:text-white' : 'border-white/5 text-white/10 cursor-not-allowed'}`}
                                                        >
                                                            CONFIRMAR PERDA
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {isRecordingSale && (
                                        <motion.div
                                            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
                                            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                            className="absolute inset-0 z-[110] bg-black/60 flex items-center justify-center p-10 rounded-[3rem]"
                                        >
                                            <div className="glass-card w-full max-w-md p-10 space-y-8 bg-[#0a0f1d] border-emerald-500/20 relative shadow-2xl">
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
                                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Valor Total da Venda</label>
                                                        <input
                                                            type="text"
                                                            placeholder="R$ 0,00"
                                                            value={saleData.sale_value}
                                                            onChange={(e) => setSaleData({ ...saleData, sale_value: formatCurrencyInput(e.target.value) })}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Margem de Lucro Bruta</label>
                                                        <input
                                                            type="text"
                                                            placeholder="R$ 0,00"
                                                            value={saleData.profit_margin}
                                                            onChange={(e) => setSaleData({ ...saleData, profit_margin: formatCurrencyInput(e.target.value) })}
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
                                    )}
                                </AnimatePresence>

                                <header className="flex flex-col gap-6 mb-10">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-600 shadow-lg shadow-red-600/20">
                                                <Zap size={20} className="text-white" />
                                            </div>
                                            <div>
                                                <h2 className="text-3xl font-black tracking-tighter text-white font-outfit uppercase">Centro de Gestão</h2>
                                                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Operação Direta: {actionLead.name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {userRole === 'admin' && (
                                                <button
                                                    onClick={() => analyzeConversation()}
                                                    disabled={isAnalyzing}
                                                    className="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-[9px] font-black text-white uppercase hover:bg-red-600 hover:border-red-500 transition-all flex items-center gap-2 group shadow-xl"
                                                >
                                                    <RefreshCcw size={14} className={isAnalyzing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500 text-red-500'} />
                                                    {isAnalyzing ? 'Analisando...' : 'Reanalisar Lead (IA)'}
                                                </button>
                                            )}
                                            <button onClick={() => {
                                                setActionLead(null);
                                                setIsFinishing(false);
                                            }} className="h-12 w-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                                                <Plus size={24} className="text-white/40 rotate-45" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tab Switcher */}
                                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 w-fit">
                                        <button
                                            onClick={() => setModalTab('details')}
                                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'details' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Atendimento
                                        </button>
                                        <button
                                            onClick={() => setModalTab('karbam')}
                                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'karbam' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Karbam
                                        </button>
                                    </div>
                                </header>

                                {modalTab === 'karbam' ? (
                                    <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <section className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <BadgeCheck size={18} className="text-amber-500" />
                                                <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Avaliação Karbam</h4>
                                            </div>
                                            <div className="glass-card rounded-[2.5rem] p-10 bg-amber-500/[0.02] border-amber-500/10 flex flex-col items-center text-center space-y-6">
                                                <div className="h-20 w-20 rounded-3xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                                                    <Search size={32} className="text-amber-500" />
                                                </div>
                                                <div className="space-y-2">
                                                    <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Análise Karbam</h3>
                                                    <p className="text-sm text-white/40 max-w-sm mx-auto leading-relaxed">
                                                        Avaliação técnica e simulação de margem para o veículo {actionLead.carro_troca || 'da troca'}.
                                                    </p>
                                                </div>

                                                {actionLead.status === 'scheduled' && (
                                                    <div className="w-full p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between animate-pulse">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                                                                <Calendar size={24} className="text-amber-500" />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Vistoria Agendada</p>
                                                                <p className="text-sm font-black text-white">Próxima Visita</p>
                                                            </div>
                                                        </div>
                                                        <BadgeCheck size={24} className="text-amber-500" />
                                                    </div>
                                                )}

                                                <div className="w-full grid grid-cols-2 gap-4 pt-4">
                                                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5 text-left group hover:bg-amber-500/5 transition-all relative">
                                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Veículo Selecionado</p>
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
                                ) : (
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-10">
                                        <div className="space-y-8">
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
                                                                    <p className="text-[10px] text-white/30 font-bold tracking-widest leading-none mt-1">{actionLead.phone}</p>
                                                                </div>
                                                            </div>
                                                            <div className={`px-4 py-2 rounded-2xl border flex flex-col items-center justify-center ${actionLead.ai_score >= 70 ? 'bg-emerald-500/10 border-emerald-500/20' : actionLead.ai_score >= 40 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                                                <p className="text-[7px] font-black opacity-40 uppercase tracking-[0.2em] leading-none mb-1">Score</p>
                                                                <p className={`text-xl font-black leading-none ${actionLead.ai_score >= 70 ? 'text-emerald-500' : actionLead.ai_score >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{actionLead.ai_score || 0}</p>
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

                                        <div className="space-y-8">
                                            <section className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={18} className="text-emerald-500" />
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60">Notas e Descricao do Atendimento</h4>
                                                    </div>
                                                    {userRole === 'admin' && actionLead.ai_summary && (
                                                        <button
                                                            onClick={handleClearNotes}
                                                            className="text-[9px] font-black text-rose-500/40 hover:text-rose-500 transition-colors uppercase"
                                                        >
                                                            Limpar Historico
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="glass-card rounded-3xl p-6 bg-emerald-500/5 border-emerald-500/10 flex flex-col gap-4">
                                                    {actionLead.ai_summary && (
                                                        <div className="bg-black/40 rounded-2xl p-5 text-[13px] leading-relaxed text-white/80 max-h-[400px] overflow-y-auto custom-scrollbar italic whitespace-pre-wrap border border-white/10 shadow-inner">
                                                            {actionLead.ai_summary}
                                                        </div>
                                                    )}
                                                    <textarea
                                                        placeholder="Escreva uma nova nota aqui..."
                                                        value={newNoteText}
                                                        onChange={(e) => setNewNoteText(e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded-2xl p-4 text-xs text-white min-h-[100px] focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none italic"
                                                    />
                                                    <button
                                                        onClick={handleSaveDetails}
                                                        className="w-full py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
                                                    >
                                                        Salvar e Registrar Nota
                                                    </button>
                                                </div>
                                            </section>

                                            <section className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles size={18} className="text-red-500" />
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60">Laboratório de IA</h4>
                                                    </div>
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
                                                        {...{ webkitdirectory: "", directory: "" }}
                                                        multiple
                                                    />
                                                </div>

                                                <div className="glass-card rounded-3xl p-6 space-y-4 bg-red-600/[0.02] border-red-500/10">
                                                    <textarea
                                                        placeholder="Cole a conversa para analise estrategica..."
                                                        value={chatText}
                                                        onChange={(e) => setChatText(e.target.value)}
                                                        className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-xs text-white/60 min-h-[120px] focus:outline-none focus:ring-1 focus:ring-red-500/30 resize-none italic"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            analyzeConversation();
                                                        }}
                                                        disabled={isAnalyzing || chatText.length < 10}
                                                        className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isAnalyzing || chatText.length < 10 ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-red-600 text-white shadow-xl shadow-red-600/20 hover:scale-[1.02]'}`}
                                                    >
                                                        {isAnalyzing ? <><Plus size={16} className="animate-spin" /> Analisando...</> : <><Zap size={16} /> Analisar e Sugerir</>}
                                                    </button>

                                                    {actionLead.ai_reason && (
                                                        <div className="space-y-4">
                                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                                                <p className="text-[11px] text-white/50 leading-relaxed italic">{actionLead.ai_reason}</p>
                                                            </div>

                                                            {actionLead.behavioral_profile && (
                                                                <div className="space-y-4">
                                                                    {/* Pontuação de IA Destacada - NOVO */}
                                                                    <div className="p-6 rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent border border-white/10 flex items-center justify-between group overflow-hidden relative">
                                                                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-red-600/10" />

                                                                        <div className="flex items-center gap-5 relative z-10">
                                                                            <div className={`w-16 h-16 rounded-[1.5rem] border-2 flex items-center justify-center shadow-2xl ${actionLead.ai_score >= 70 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500 shadow-emerald-500/10' : actionLead.ai_score >= 40 ? 'border-amber-500/30 bg-amber-500/5 text-amber-500 shadow-amber-500/10' : 'border-red-500/30 bg-red-500/5 text-red-500 shadow-red-500/10'}`}>
                                                                                <span className="text-2xl font-black">{actionLead.ai_score || 0}</span>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] leading-none mb-1.5">Temperatura do Lead</p>
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`w-2 h-2 rounded-full animate-pulse ${actionLead.ai_classification === 'hot' ? 'bg-rose-500' : actionLead.ai_classification === 'warm' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                                                                                    <p className={`text-sm font-black uppercase tracking-widest ${actionLead.ai_classification === 'hot' ? 'text-rose-500' : actionLead.ai_classification === 'warm' ? 'text-amber-500' : 'text-sky-500'}`}>
                                                                                        {actionLead.ai_classification?.toUpperCase() || 'WARM'}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <button
                                                                            onClick={() => analyzeConversation()}
                                                                            disabled={isAnalyzing || chatText.length < 10}
                                                                            className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 h-fit text-[10px] font-black text-white uppercase hover:bg-white/10 active:scale-95 transition-all flex items-center gap-2 relative z-10 shadow-lg"
                                                                        >
                                                                            <RefreshCcw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
                                                                            {isAnalyzing ? 'Analisando...' : 'Reanalisar'}
                                                                        </button>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div className="p-5 rounded-[2rem] bg-white/5 border border-white/5">
                                                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5 pl-1">Estágio do Funil</p>
                                                                            <p className="text-xs font-black text-white uppercase pl-1">{actionLead.behavioral_profile.funnel_stage || 'Qualificação'}</p>
                                                                        </div>
                                                                        <div className="p-5 rounded-[2rem] bg-white/5 border border-white/5">
                                                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5 pl-1">Probabilidade</p>
                                                                            <div className="flex items-center gap-2 pl-1">
                                                                                <Plus size={14} className="text-emerald-500" />
                                                                                <p className="text-xs font-black text-emerald-500 uppercase">{actionLead.behavioral_profile.closing_probability || 0}% de Fechamento</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div className="p-5 rounded-[2rem] bg-white/5 border border-white/5">
                                                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5 pl-1">Urgência</p>
                                                                            <div className="flex items-center gap-2 pl-1">
                                                                                <AlertCircle size={14} className={actionLead.behavioral_profile.urgency === 'high' ? 'text-rose-500' : 'text-amber-500'} />
                                                                                <p className={`text-xs font-black uppercase ${actionLead.behavioral_profile.urgency === 'high' ? 'text-rose-500' : 'text-amber-500'}`}>
                                                                                    {actionLead.behavioral_profile.urgency === 'high' ? 'Alta' : actionLead.behavioral_profile.urgency === 'medium' ? 'Média' : 'Baixa'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="p-5 rounded-[2rem] bg-white/5 border border-white/5">
                                                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5 pl-1">Sentimento</p>
                                                                            <div className="flex items-center gap-2 pl-1">
                                                                                <MessageSquare size={14} className="text-emerald-500" />
                                                                                <p className="text-xs font-black text-emerald-500 uppercase">{actionLead.behavioral_profile.sentiment || 'Neutro'}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}


                                                            {actionLead.next_step && (
                                                                <div className="p-4 rounded-2xl bg-red-600/10 border border-red-500/20">
                                                                    <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-1">Estratégia Recomendada</p>
                                                                    <p className="text-[11px] font-bold text-white leading-tight">{actionLead.next_step}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </section>
                                        </div>
                                    </div>
                                )}

                                <footer className="mt-12 pt-10 border-t border-white/5 grid grid-cols-2 md:grid-cols-3 gap-6">
                                    <a
                                        href={`tel:${actionLead.phone}`}
                                        onClick={() => setTimeout(() => setIsSubmittingCallSummary(true), 1000)}
                                        className="py-5 rounded-[2rem] bg-white/5 border border-white/10 text-[11px] font-black text-white hover:bg-white/10 transition-all flex items-center justify-center gap-3"
                                    >
                                        <Phone size={18} /> LIGAR AGORA
                                    </a>
                                    <a
                                        href={`https://wa.me/${actionLead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                            `Olá ${actionLead.name.split(' ')[0]}, tudo bem? Sou ${userName.toLowerCase().includes('camila') ? 'a consultora' : 'o consultor'} ${userName.split(' ')[0]} da Manos Veículos. Vi seu interesse no ${actionLead.vehicle_interest || 'nosso estoque'} e gostaria de te ajudar!`
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="py-5 rounded-[2rem] bg-emerald-600 text-white text-[11px] font-black shadow-xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-3"
                                    >
                                        <MessageSquare size={18} /> ENVIAR WHATSAPP
                                    </a>
                                    <button
                                        onClick={() => setIsFinishing(true)}
                                        className="py-5 rounded-[2rem] bg-red-600/10 border border-red-600/20 text-red-500 text-[11px] font-black hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-3 uppercase"
                                    >
                                        Finalizar Atendimento
                                    </button>
                                    {userRole === 'admin' && (
                                        <button
                                            onClick={handleDeleteLead}
                                            className="col-span-2 md:col-span-1 py-5 rounded-[2rem] bg-rose-950/20 border border-rose-500/20 text-rose-500 text-[11px] font-black hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-3 uppercase"
                                        >
                                            <AlertCircle size={18} /> Excluir Lead
                                        </button>
                                    )}
                                </footer>
                            </motion.div>
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
                                                        ai_score: 50,
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
                                                } catch (err) {
                                                    console.error("Error creating lead:", err);
                                                    showToast("Erro ao criar lead.", "error");
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
                {toast.visible && (
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
                )}
            </AnimatePresence>
        </div >
    );
}

export default function LeadsPage() {
    return (
        <Suspense fallback={
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <LeadsContent />
        </Suspense>
    );
}


