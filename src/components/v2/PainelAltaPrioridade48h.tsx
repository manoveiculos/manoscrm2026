'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
    Flame,
    Zap,
    Thermometer,
    MessageSquare,
    Phone,
    UserCheck,
    CreditCard,
    Car,
    Clock,
    Search,
    Filter,
    RefreshCw,
    Send,
    AlertCircle,
    CheckCircle2,
    ExternalLink,
    Sparkles,
    Image as ImageIcon,
    Copy,
    Check,
    Eye,
    Inbox,
    FolderOpen,
    Bot,
    X,
    MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { summarizeLeadConversation, ConversationSummaryResult } from '@/lib/services/aiConversationService';
import Link from 'next/link';

export interface LeadPrioridade48h {
    id: string;
    lead_name: string;
    lead_phone: string;
    vendedor_id: string;
    nome_vendedor: string;
    telefone_vendedor: string;
    created_at: string;
    last_interaction_at: string;
    score: number;
    resumo_ia: string;
    tem_troca: boolean;
    avaliou_credito: boolean;
    mensagens_cliente: number;
    midias_enviadas: number;
    status_atendimento?: string;
    veiculo_interesse?: string;
    origem?: string;
    messages?: Array<{
        id: string;
        direction: 'inbound' | 'outbound';
        text: string;
        timestamp: string;
        sender_name?: string;
        has_media?: boolean;
    }>;
    webhook_enviado_24h?: boolean;
}

// ── LÓGICA DO SCORE DE ENGAJAMENTO ──
// +1 ponto por mensagem do cliente
// +5 pontos por mídias (áudio/fotos/documentos)
// +10 pontos se detectar intenção de troca
// +10 pontos se detectar intenção de crédito
export function calcularEngagementScore(lead: {
    mensagens_cliente: number;
    midias_enviadas: number;
    tem_troca: boolean;
    avaliou_credito: boolean;
}): number {
    let score = 0;
    score += (lead.mensagens_cliente || 0) * 1;
    score += (lead.midias_enviadas || 0) * 5;
    if (lead.tem_troca) score += 10;
    if (lead.avaliou_credito) score += 10;
    return score;
}

// Helper para formatar o primeiro nome do vendedor
function formatarNomeVendedor(nomeCompleto: string): string {
    if (!nomeCompleto || nomeCompleto.toLowerCase().includes('não atribuído')) return 'Não Atribuído';
    const partes = nomeCompleto.trim().split(' ');
    if (partes[0].toLowerCase() === 'wilson') return 'Wilson';
    if (partes[0].toLowerCase() === 'victor') return 'Victor';
    if (partes[0].toLowerCase() === 'sergio') return 'Sergio';
    if (partes[0].toLowerCase() === 'paulo') return 'Paulo';
    if (partes[0].toLowerCase() === 'renato') return 'Renato';
    return partes[0];
}

// ── GERADOR DE TEXTO DE COBRANÇA AO VENDEDOR ──
export function gerarTextoCobranca(lead: LeadPrioridade48h): string {
    const nomeVendedor = lead.nome_vendedor && lead.nome_vendedor !== 'Não Atribuído' ? lead.nome_vendedor : 'Consultor';
    const nomeLead = lead.lead_name || 'Cliente';
    const telefoneLead = lead.lead_phone && lead.lead_phone !== 'Sem telefone' ? ` (${lead.lead_phone})` : '';

    const temPoucaConversa = !lead.resumo_ia || 
        lead.resumo_ia.includes('Sem histórico recente') || 
        lead.resumo_ia.includes('Aguardando retorno inicial') ||
        (lead.mensagens_cliente || 0) <= 1;

    if (temPoucaConversa) {
        const infoCarro = lead.veiculo_interesse ? ` referente ao ${lead.veiculo_interesse}` : '';
        return `Fala ${nomeVendedor}, vi no CRM que vc chamou o ${nomeLead}${telefoneLead}${infoCarro}. E aí, como está o atendimento com ele?`;
    }

    const resumoFormatado = lead.resumo_ia.trim();
    const textoResumo = resumoFormatado.endsWith('.') ? resumoFormatado : `${resumoFormatado}.`;
    return `Fala ${nomeVendedor}, vi aqui no CRM que vc atendeu o ${nomeLead}${telefoneLead}. ${textoResumo} Como tá o atendimento com ele?`;
}

// ── GERADOR DE LINK WHATSAPP DE COBRANÇA AO VENDEDOR ──
export function gerarLinkCobrancaWhatsApp(lead: LeadPrioridade48h): string {
    const rawPhone = (lead.telefone_vendedor || '5547999999999').replace(/\D/g, '');
    const phoneFormatted = rawPhone.length === 10 || rawPhone.length === 11 ? `55${rawPhone}` : rawPhone;
    const texto = gerarTextoCobranca(lead);
    return `https://wa.me/${phoneFormatted}?text=${encodeURIComponent(texto)}`;
}

function formatTimeAgo(isoDate: string): string {
    if (!isoDate) return '—';
    const diffMs = Date.now() - new Date(isoDate).getTime();
    if (isNaN(diffMs) || diffMs < 0) return 'agora';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `há ${diffHours}h ${diffMin % 60}m`;
    const diffDays = Math.floor(diffHours / 24);
    return `há ${diffDays}d ${diffHours % 24}h`;
}

export function PainelAltaPrioridade48h() {
    const [leads, setLeads] = useState<LeadPrioridade48h[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [vendedorFiltro, setVendedorFiltro] = useState<string>('todos');
    const [tempFiltro, setTempFiltro] = useState<'todos' | 'super_quente' | 'quente' | 'morno'>('todos');
    const [busca, setBusca] = useState('');
    const [ultimaAtualizacao, setUltimaAtualizacao] = useState(new Date());

    // Modais & Estados de Copiar / Webhook
    const [modalLeadConversa, setModalLeadConversa] = useState<LeadPrioridade48h | null>(null);
    const [copiadoId, setCopiadoId] = useState<string | null>(null);
    const [disparandoWebhookId, setDisparandoWebhookId] = useState<string | null>(null);
    const [statusWebhook, setStatusWebhook] = useState<{ id: string; success: boolean; msg: string } | null>(null);

    // ── BUSCA DADOS REAIS DO SUPABASE E RODA A SKILL DE IA NAS CONVERSAS ──
    const carregarLeadsReais = async () => {
        setCarregando(true);
        try {
            // 1. Carrega consultores cadastrados no CRM para resolver nome e telefone do vendedor
            const { data: consultores } = await supabase
                .from('consultants_manos_crm')
                .select('id, name, phone, user_id, auth_id');

            const consultorMap = new Map<string, { name: string; phone: string }>();
            if (consultores) {
                consultores.forEach((c: any) => {
                    const info = { name: c.name || 'Vendedor', phone: c.phone || '47999999999' };
                    if (c.id) consultorMap.set(c.id, info);
                    if (c.user_id) consultorMap.set(c.user_id, info);
                    if (c.auth_id) consultorMap.set(c.auth_id, info);
                });
            }

            // 2. Limite exato de 48h atrás (em ms)
            const limite48hMs = Date.now() - 48 * 3600 * 1000;

            // 3. Busca os leads mais recentes
            const { data: rawLeads, error } = await supabase
                .from('leads')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                console.error('Erro ao buscar leads reais do Supabase:', error);
                setLeads([]);
                return;
            }

            if (rawLeads && rawLeads.length > 0) {
                const leadsFiltrados48h = rawLeads.filter((d: any) => {
                    const dataInteracao = new Date(d.updated_at || d.created_at).getTime();
                    const dataCriacao = new Date(d.created_at).getTime();
                    return dataInteracao >= limite48hMs || dataCriacao >= limite48hMs;
                });

                // Processa a Skill de IA para cada lead em paralelo (máximo 15 principais)
                const promessasLeads = leadsFiltrados48h.slice(0, 30).map(async (d: any) => {
                    const cInfo = d.assigned_consultant_id ? consultorMap.get(d.assigned_consultant_id) : null;
                    const nomeVendedorBruto = cInfo?.name || d.consultor_nome || d.vendedor || d.assigned_consultant || 'Não Atribuído';
                    const nomeVendedorFormatado = formatarNomeVendedor(nomeVendedorBruto);
                    const telefoneVendedor = cInfo?.phone || d.consultor_telefone || '47999999999';

                    const leadName = d.name || d.lead_name || d.nome || 'Cliente WhatsApp';
                    const leadPhone = d.phone || d.telefone || d.celular || '';
                    const veiculoInteresse = d.vehicle_interest || d.modelo_interesse || d.interesse || undefined;

                    // Chamar a Skill de Análise de Conversa WhatsApp por IA
                    let aiResult: ConversationSummaryResult | null = null;
                    try {
                        aiResult = await summarizeLeadConversation({
                            leadId: String(d.id),
                            phone: leadPhone,
                            leadName,
                            vehicleInterest: veiculoInteresse
                        });
                    } catch (e) {
                        console.warn('Falha na IA para lead:', d.id, e);
                    }

                    const resumoFinal = aiResult?.summary || d.ai_summary || d.observacoes || 'Lead recente das últimas 48h. Aguardando acompanhamento do vendedor.';
                    const msgsCliente = aiResult?.messageCount || Number(d.mensagens_cliente || 2);
                    const midiasEnviadas = aiResult?.mediaCount || Number(d.midias_enviadas || 0);
                    const temTrocaReal = aiResult?.hasTradeIn || !!(d.carro_troca || /troca|avaliar|usado/i.test(resumoFinal));
                    const avaliouCreditoReal = aiResult?.hasCredit || !!(d.valor_investimento || /financ|crédit|parcela/i.test(resumoFinal));

                    const leadObj = {
                        id: String(d.id),
                        lead_name: leadName,
                        lead_phone: leadPhone || 'Sem telefone',
                        vendedor_id: d.assigned_consultant_id || 'unassigned',
                        nome_vendedor: nomeVendedorFormatado,
                        telefone_vendedor: telefoneVendedor,
                        created_at: d.created_at,
                        last_interaction_at: d.updated_at || aiResult?.lastMessageTime || d.created_at,
                        mensagens_cliente: msgsCliente,
                        midias_enviadas: midiasEnviadas,
                        tem_troca: temTrocaReal,
                        avaliou_credito: avaliouCreditoReal,
                        score: 0,
                        resumo_ia: resumoFinal,
                        status_atendimento: d.status || 'aguardando_vendedor',
                        veiculo_interesse: veiculoInteresse,
                        origem: d.origem || d.source || 'CRM',
                        messages: aiResult?.messages || []
                    };

                    const scoreCalculado = calcularEngagementScore(leadObj);
                    const scoreFinal = Math.max(scoreCalculado, Number(d.ai_score || 0));

                    return {
                        ...leadObj,
                        score: scoreFinal
                    };
                });

                const leadsProcessados = await Promise.all(promessasLeads);
                setLeads(leadsProcessados);
            } else {
                setLeads([]);
            }
        } catch (err) {
            console.error('Falha crítica ao buscar leads para o painel 48h:', err);
            setLeads([]);
        } finally {
            setCarregando(false);
            setUltimaAtualizacao(new Date());
        }
    };

    useEffect(() => {
        carregarLeadsReais();
    }, []);

    // ── COPIAR MENSAGEM PARA ÁREA DE TRANSFERÊNCIA ──
    const handleCopiarMensagem = (lead: LeadPrioridade48h) => {
        const texto = gerarTextoCobranca(lead);
        navigator.clipboard.writeText(texto);
        setCopiadoId(lead.id);
        setTimeout(() => setCopiadoId(null), 2500);
    };

    // ── DISPARAR WEBHOOK N8N MANUALMENTE/AUTOMÁTICO ──
    const handleDispararWebhookN8N = async (lead: LeadPrioridade48h) => {
        setDisparandoWebhookId(lead.id);
        setStatusWebhook(null);

        try {
            const textoCobranca = gerarTextoCobranca(lead);
            const res = await fetch('/api/v2/cobranca-n8n', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: lead.id,
                    lead_name: lead.lead_name,
                    lead_phone: lead.lead_phone,
                    vendedor_id: lead.vendedor_id,
                    vendedor_nome: lead.nome_vendedor,
                    vendedor_telefone: lead.telefone_vendedor,
                    veiculo_interesse: lead.veiculo_interesse,
                    resumo_ia: lead.resumo_ia,
                    score: lead.score,
                    created_at: lead.created_at,
                    last_interaction_at: lead.last_interaction_at,
                    mensagem_cobranca: textoCobranca
                })
            });

            const data = await res.json();
            if (data.success) {
                setStatusWebhook({ id: lead.id, success: true, msg: 'Cobrança disparada no webhook n8n com sucesso!' });
            } else {
                setStatusWebhook({ id: lead.id, success: false, msg: data.error || 'Erro ao comunicar com webhook' });
            }
        } catch (err: any) {
            setStatusWebhook({ id: lead.id, success: false, msg: err.message || 'Falha de rede ao chamar webhook' });
        } finally {
            setDisparandoWebhookId(null);
            setTimeout(() => setStatusWebhook(null), 4000);
        }
    };

    // ── FILTRAGEM & RANQUEAMENTO DADOS REAIS ──
    const leadsFiltradosERanqueados = useMemo(() => {
        const agoraMs = Date.now();
        const limite48hMs = 48 * 3600 * 1000;

        return leads
            .filter((lead) => {
                const dataInteracao = new Date(lead.last_interaction_at || lead.created_at).getTime();
                if (agoraMs - dataInteracao > limite48hMs) return false;

                if (vendedorFiltro !== 'todos' && lead.nome_vendedor.toLowerCase() !== vendedorFiltro.toLowerCase()) {
                    return false;
                }

                if (tempFiltro === 'super_quente' && lead.score < 30) return false;
                if (tempFiltro === 'quente' && (lead.score < 15 || lead.score >= 30)) return false;
                if (tempFiltro === 'morno' && lead.score >= 15) return false;

                if (busca.trim()) {
                    const term = busca.toLowerCase();
                    const nomeL = lead.lead_name.toLowerCase();
                    const nomeV = lead.nome_vendedor.toLowerCase();
                    const carro = (lead.veiculo_interesse || '').toLowerCase();
                    const resumo = lead.resumo_ia.toLowerCase();
                    return nomeL.includes(term) || nomeV.includes(term) || carro.includes(term) || resumo.includes(term);
                }

                return true;
            })
            .sort((a, b) => b.score - a.score);
    }, [leads, vendedorFiltro, tempFiltro, busca]);

    const vendedoresLista = useMemo(() => {
        const nomes = Array.from(new Set(leads.map((l) => l.nome_vendedor))).filter(Boolean);
        return ['todos', ...nomes];
    }, [leads]);

    const kpiSuperQuentes = leadsFiltradosERanqueados.filter((l) => l.score >= 30).length;
    const kpiComCredito = leadsFiltradosERanqueados.filter((l) => l.avaliou_credito).length;
    const kpiComTroca = leadsFiltradosERanqueados.filter((l) => l.tem_troca).length;

    return (
        <div className="min-h-screen bg-[#0C0C0F] text-slate-100 p-4 md:p-8 space-y-6">
            {/* Header Principal da War Room */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-black tracking-wider uppercase flex items-center gap-1.5">
                            <Flame className="w-4 h-4 text-red-500 animate-pulse" /> Painel de Alta Prioridade 48h
                        </span>
                        <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Janela Ativa: CRM Real + Resumo IA
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                        Visão Tática de Cobrança ao Time
                    </h1>
                    <p className="text-xs md:text-sm text-slate-400 mt-1">
                        Skill de IA integrada analisando conversas reais do WhatsApp para cobrança imediata via n8n e links diretos.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={carregarLeadsReais}
                        disabled={carregando}
                        className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all shadow-md flex items-center gap-2 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-red-400' : ''}`} />
                        <span>Atualizar &amp; Rodar Skill IA</span>
                    </button>
                    <div className="text-[11px] text-slate-500 font-mono text-right hidden sm:block">
                        <div>Última análise:</div>
                        <div className="text-slate-400 font-semibold" suppressHydrationWarning>{ultimaAtualizacao.toLocaleTimeString('pt-BR')}</div>
                    </div>
                </div>
            </div>

            {/* Toast Feedback Webhook */}
            {statusWebhook && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                        statusWebhook.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        {statusWebhook.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        <span>{statusWebhook.msg}</span>
                    </div>
                    <button onClick={() => setStatusWebhook(null)} className="text-slate-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </motion.div>
            )}

            {/* KPI Cards em Estilo War Room */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Leads Ativos (48h)</span>
                        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold font-mono text-white mt-2">
                        {leadsFiltradosERanqueados.length}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Leads reais com Skill IA ativada</p>
                </div>

                <div className="bg-slate-900/80 border border-red-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden bg-gradient-to-br from-red-950/20 via-slate-900 to-slate-900">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-red-400 tracking-wider">🔥 Super Quentes</span>
                        <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                            <Flame className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold font-mono text-red-400 mt-2">
                        {kpiSuperQuentes}
                    </div>
                    <p className="text-[11px] text-red-300/70 mt-1">Score ≥ 30 (Cobrança urgente)</p>
                </div>

                <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">💰 Avaliaram Crédito</span>
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CreditCard className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold font-mono text-emerald-400 mt-2">
                        {kpiComCredito}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Intenção de financiamento</p>
                </div>

                <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-amber-400 tracking-wider">🚗 Com Troca</span>
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Car className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold font-mono text-amber-400 mt-2">
                        {kpiComTroca}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Carro de entrada oferecido</p>
                </div>
            </div>

            {/* Barra de Filtros e Pesquisa */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Buscar por lead, vendedor, carro de interesse ou resumo de IA..."
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/60"
                        />
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                        <span className="text-xs text-slate-400 font-semibold whitespace-nowrap flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" /> Vendedor:
                        </span>
                        <div className="flex items-center gap-1.5">
                            {vendedoresLista.map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setVendedorFiltro(v)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                        vendedorFiltro === v
                                            ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {v === 'todos' ? 'Todos' : v}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                        <Filter className="w-3.5 h-3.5" /> Temperatura:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setTempFiltro('todos')}
                            className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                                tempFiltro === 'todos' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Todas
                        </button>
                        <button
                            onClick={() => setTempFiltro('super_quente')}
                            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                                tempFiltro === 'super_quente'
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                    : 'text-slate-400 hover:text-red-400'
                            }`}
                        >
                            🔥 Super Quentes (≥30)
                        </button>
                        <button
                            onClick={() => setTempFiltro('quente')}
                            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                                tempFiltro === 'quente'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'text-slate-400 hover:text-amber-400'
                            }`}
                        >
                            ⚡ Quentes (15-29)
                        </button>
                        <button
                            onClick={() => setTempFiltro('morno')}
                            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                                tempFiltro === 'morno'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : 'text-slate-400 hover:text-cyan-400'
                            }`}
                        >
                            🌡️ Em Aquecimento (&lt;15)
                        </button>
                    </div>
                </div>
            </div>

            {/* Lista de Cards dos Leads Ranqueados */}
            <div className="space-y-4">
                {carregando ? (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                        <RefreshCw className="w-8 h-8 text-red-500 animate-spin mx-auto" />
                        <h3 className="text-base font-bold text-white">Analisando conversas do WhatsApp via IA...</h3>
                        <p className="text-xs text-slate-400">Extraindo resumos estratégicos e mensagens reais do Supabase.</p>
                    </div>
                ) : leadsFiltradosERanqueados.length === 0 ? (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                        <AlertCircle className="w-10 h-10 text-slate-500 mx-auto" />
                        <h3 className="text-base font-bold text-white">Nenhum lead real nas últimas 48h</h3>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                            Não foram localizados leads com interação ou cadastro na janela de 48 horas no CRM com os filtros aplicados.
                        </p>
                    </div>
                ) : (
                    leadsFiltradosERanqueados.map((lead, index) => {
                        const rank = index + 1;
                        const isSuperQuente = lead.score >= 30;
                        const isQuente = lead.score >= 15 && lead.score < 30;
                        const linkWhatsapp = gerarLinkCobrancaWhatsApp(lead);
                        const isCopiado = copiadoId === lead.id;
                        const isDisparandoWebhook = disparandoWebhookId === lead.id;

                        return (
                            <motion.div
                                key={lead.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                                className={`bg-slate-900/90 border rounded-2xl p-5 shadow-2xl relative overflow-hidden transition-all hover:border-slate-700 ${
                                    isSuperQuente
                                        ? 'border-red-500/40 bg-gradient-to-r from-red-950/20 via-slate-900 to-slate-900/90'
                                        : isQuente
                                        ? 'border-amber-500/30'
                                        : 'border-slate-800'
                                }`}
                            >
                                {/* Barra Indicadora Lateral */}
                                <div
                                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                                        isSuperQuente ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]' : isQuente ? 'bg-amber-500' : 'bg-cyan-500'
                                    }`}
                                />

                                <div className="space-y-4 pl-2">
                                    {/* Cabecalho do Card */}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            {/* Posição no Ranking */}
                                            <span
                                                className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center border shadow-md ${
                                                    rank === 1
                                                        ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                                                        : rank === 2
                                                        ? 'bg-slate-300/20 text-slate-200 border-slate-300/40'
                                                        : rank === 3
                                                        ? 'bg-orange-600/20 text-orange-300 border-orange-500/40'
                                                        : 'bg-slate-950 text-slate-400 border-slate-800'
                                                }`}
                                            >
                                                #{rank}
                                            </span>

                                            <div>
                                                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                                                    {lead.lead_name}
                                                    <span className="text-xs font-normal text-slate-400 font-mono">
                                                        {lead.lead_phone}
                                                    </span>
                                                    {lead.origem && (
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                                            {lead.origem}
                                                        </span>
                                                    )}
                                                </h3>
                                                {lead.veiculo_interesse && (
                                                    <p className="text-xs text-slate-400 flex items-center gap-1 font-medium mt-0.5">
                                                        <Car className="w-3.5 h-3.5 text-cyan-400" /> Interesse em:{' '}
                                                        <strong className="text-white">{lead.veiculo_interesse}</strong>
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Score & Temperatura */}
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`px-3 py-1.5 rounded-xl border font-mono font-bold text-xs flex items-center gap-1.5 shadow-md ${
                                                    isSuperQuente
                                                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                                        : isQuente
                                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                                                }`}
                                            >
                                                {isSuperQuente ? (
                                                    <Flame className="w-4 h-4 text-red-500 animate-pulse" />
                                                ) : isQuente ? (
                                                    <Zap className="w-4 h-4 text-amber-400" />
                                                ) : (
                                                    <Thermometer className="w-4 h-4 text-cyan-400" />
                                                )}
                                                <span>
                                                    Score: <strong>{lead.score} pts</strong>
                                                </span>
                                            </div>

                                            <span className="text-[11px] text-slate-400 font-mono bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                                                {formatTimeAgo(lead.last_interaction_at)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Informações do Vendedor Responsável */}
                                    <div className="flex items-center justify-between text-xs p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-400 font-semibold">Vendedor Responsável:</span>
                                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-bold text-white flex items-center gap-1">
                                                <UserCheck className="w-3.5 h-3.5 text-blue-400" /> {lead.nome_vendedor}
                                            </span>
                                        </div>
                                        <span className="text-slate-500 text-[11px]">
                                            WhatsApp Vendedor: <strong className="font-mono text-slate-400">{lead.telefone_vendedor}</strong>
                                        </span>
                                    </div>

                                    {/* Resumo Gerado pela Skill de IA */}
                                    <div className="p-3.5 bg-purple-950/20 border border-purple-500/30 rounded-xl space-y-1.5 shadow-inner">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-purple-300 uppercase tracking-wider">
                                                <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" /> Resumo Curto da Conversa (Skill IA)
                                            </div>
                                            <span className="text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-200 px-2 py-0.5 rounded font-mono">
                                                GPT-4o Mini
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-200 leading-relaxed font-sans font-medium">
                                            {lead.resumo_ia}
                                        </p>
                                    </div>

                                    {/* Badges Visuais Rápidas */}
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        {lead.avaliou_credito && (
                                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold flex items-center gap-1">
                                                💰 Tem Crédito / Simulação
                                            </span>
                                        )}
                                        {lead.tem_troca && (
                                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold flex items-center gap-1">
                                                🚗 Avaliou Troca
                                            </span>
                                        )}
                                        <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold flex items-center gap-1">
                                            ⏳ Status: {lead.status_atendimento}
                                        </span>
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 font-mono text-[11px] flex items-center gap-1">
                                            <MessageSquare className="w-3 h-3 text-slate-400" /> {lead.mensagens_cliente} msgs
                                        </span>
                                        {lead.midias_enviadas > 0 && (
                                            <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-purple-300 font-mono text-[11px] flex items-center gap-1">
                                                <ImageIcon className="w-3 h-3 text-purple-400" /> {lead.midias_enviadas} mídias (+{lead.midias_enviadas * 5}pts)
                                            </span>
                                        )}
                                    </div>

                                    {/* BARRA DE AÇÕES DO LEAD DO PAINEL DE PRIORIDADE 48H */}
                                    <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
                                        {/* Grupo 1: Ver Conversa, Ir Inbox, Ver CRM */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => setModalLeadConversa(lead)}
                                                className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer"
                                            >
                                                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                                                <span>Ver Conversa</span>
                                            </button>

                                            <Link
                                                href={`/inbox?lead=${lead.id}`}
                                                className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer"
                                            >
                                                <Inbox className="w-3.5 h-3.5 text-blue-400" />
                                                <span>Ir p/ Inbox</span>
                                            </Link>

                                            <Link
                                                href={`/pipeline?lead=${lead.id}`}
                                                className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer"
                                            >
                                                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Ver no CRM</span>
                                            </Link>
                                        </div>

                                        {/* Grupo 2: Copiar Msg, Disparar Webhook n8n e WhatsApp Vendedor */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => handleCopiarMensagem(lead)}
                                                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer ${
                                                    isCopiado
                                                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                                        : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white'
                                                }`}
                                            >
                                                {isCopiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
                                                <span>{isCopiado ? 'Copiado!' : 'Copiar Msg'}</span>
                                            </button>

                                            <button
                                                onClick={() => handleDispararWebhookN8N(lead)}
                                                disabled={isDisparandoWebhook}
                                                className="px-3 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all shadow border border-purple-400/20 disabled:opacity-50 cursor-pointer"
                                            >
                                                <Bot className={`w-3.5 h-3.5 ${isDisparandoWebhook ? 'animate-spin' : ''}`} />
                                                <span>{isDisparandoWebhook ? 'Enviando n8n...' : 'Disparar n8n'}</span>
                                            </button>

                                            <a
                                                href={linkWhatsapp}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer border border-emerald-400/20"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                                <span>Cobrar Vendedor ({lead.nome_vendedor})</span>
                                                <ExternalLink className="w-3 h-3 opacity-70" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>

            {/* MODAL DE HISTÓRICO DA CONVERSA COMPLETA DO LEAD */}
            <AnimatePresence>
                {modalLeadConversa && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
                        >
                            {/* Cabecalho Modal */}
                            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        <MessageCircle className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                                            Conversa de {modalLeadConversa.lead_name}
                                            <span className="text-xs font-mono text-slate-400 font-normal">
                                                ({modalLeadConversa.lead_phone})
                                            </span>
                                        </h3>
                                        <p className="text-[11px] text-slate-400">
                                            Vendedor Responsável:{' '}
                                            <strong className="text-white">{modalLeadConversa.nome_vendedor}</strong>
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setModalLeadConversa(null)}
                                    className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Resumo IA Destacado */}
                            <div className="p-3.5 bg-purple-950/30 border-b border-purple-500/30 text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-purple-300 uppercase tracking-wider mb-1">
                                    <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Resumo IA do Atendimento
                                </div>
                                <p className="text-slate-200 leading-relaxed font-sans">{modalLeadConversa.resumo_ia}</p>
                            </div>

                            {/* Conteúdo das Mensagens */}
                            <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-[#0A0A0D]">
                                {!modalLeadConversa.messages || modalLeadConversa.messages.length === 0 ? (
                                    <div className="text-center py-12 space-y-2">
                                        <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
                                        <p className="text-xs text-slate-400">
                                            Nenhum registro individual de bolha salvo na tabela whatsapp_messages.
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            O resumo acima foi sintetizado a partir do histórico do CRM.
                                        </p>
                                    </div>
                                ) : (
                                    modalLeadConversa.messages.map((m) => {
                                        const isClient = m.direction === 'inbound';
                                        return (
                                            <div
                                                key={m.id}
                                                className={`flex flex-col ${isClient ? 'items-start' : 'items-end'}`}
                                            >
                                                <div className="text-[10px] text-slate-500 mb-0.5 px-1 font-mono">
                                                    {m.sender_name || (isClient ? 'Cliente' : 'Vendedor')} •{' '}
                                                    {formatTimeAgo(m.timestamp)}
                                                </div>
                                                <div
                                                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs font-sans shadow-md ${
                                                        isClient
                                                            ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/60'
                                                            : 'bg-emerald-700/80 text-white rounded-tr-none border border-emerald-600/60'
                                                    }`}
                                                >
                                                    {m.has_media && (
                                                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase opacity-80 border-b border-white/10 pb-1">
                                                            <ImageIcon className="w-3 h-3" /> Mídia / Anexo detectado
                                                        </div>
                                                    )}
                                                    <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Rodapé Modal */}
                            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-slate-400 font-mono text-[11px]">
                                    Total de mensagens salvas: {modalLeadConversa.messages?.length || 0}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleCopiarMensagem(modalLeadConversa)}
                                        className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                        <Copy className="w-3.5 h-3.5 text-purple-400" /> Copiar Mensagem de Cobrança
                                    </button>
                                    <a
                                        href={gerarLinkCobrancaWhatsApp(modalLeadConversa)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                        <Send className="w-3.5 h-3.5" /> Chamar Vendedor
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
