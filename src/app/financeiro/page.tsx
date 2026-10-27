'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
    WalletCards,
    Lock,
    RefreshCw,
    Plus,
    MessageSquare,
    Gem,
    ListFilter,
    Layers,
    UserCheck,
    CheckCircle,
    SlidersHorizontal,
    Sparkles,
    ArrowRightLeft,
    Upload,
    History,
    Clock,
    ShieldAlert,
    ShieldCheck,
} from 'lucide-react';
import { FinConta, FinCategoria, FinLancamento, FinPatrimonio, FinFechamento, isFinanceiroAutorizado } from '@/lib/financeiro/types';
import { Preset, rangePreset, hojeISO, brl } from '@/lib/financeiro/format';

import { BarraLancamentoRapido } from './components/BarraLancamentoRapido';
import { KpiCardsFinanceiro } from './components/KpiCardsFinanceiro';
import { TabelaLancamentos } from './components/TabelaLancamentos';
import { AbaPatrimonio } from './components/AbaPatrimonio';
import { AbaFechamentos } from './components/AbaFechamentos';
import { AbaHistoricoPlanilha } from './components/AbaHistoricoPlanilha';
import { AbaContasPagarReceber } from './components/AbaContasPagarReceber';
import { ModalResumoWhatsApp } from './components/ModalResumoWhatsApp';
import { ModalLancamentoDetalhado } from './components/ModalLancamentoDetalhado';
import { ModalGerenciarConta } from './components/ModalGerenciarConta';
import { ModalTransferencia } from './components/ModalTransferencia';
import { ModalFechamentoConta } from './components/ModalFechamentoConta';
import { ModalAcertoSocios } from './components/ModalAcertoSocios';
import { ModalImportarExtrato } from './components/ModalImportarExtrato';
import { ModalConfirmarExclusao } from './components/ModalConfirmarExclusao';
import { ModalAuditoriaExclusoes } from './components/ModalAuditoriaExclusoes';

type AbaAtiva = 'visao_geral' | 'contas_pagar_receber' | 'extrato' | 'patrimonio' | 'fechamentos' | 'historico_planilha';

export default function FinanceiroPage() {
    const router = useRouter();

    // Controle de Acesso e Usuário
    const [carregandoAcesso, setCarregandoAcesso] = useState(true);
    const [autorizado, setAutorizado] = useState<boolean | null>(null);
    const [userEmail, setUserEmail] = useState<string>('');
    const [effectiveOwner, setEffectiveOwner] = useState<string>('hgledra@hotmail.com');
    const isAlexandre = userEmail === 'alexandre_gorges@hotmail.com';

    // Navegação de Abas
    const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('visao_geral');

    // Dados Carregados
    const [contas, setContas] = useState<FinConta[]>([]);
    const [categorias, setCategorias] = useState<FinCategoria[]>([]);
    const [lancamentos, setLancamentos] = useState<FinLancamento[]>([]);
    const [itensPatrimonio, setItensPatrimonio] = useState<FinPatrimonio[]>([]);
    const [fechamentos, setFechamentos] = useState<FinFechamento[]>([]);
    const [kpis, setKpis] = useState<any>({
        totalCaixa: 0,
        patrimonioLiquido: 0,
        totalAtivosBens: 0,
        totalPassivos: 0,
        totalEntradas: 0,
        totalSaidas: 0,
        resultadoPeriodo: 0,
        resultadoOperacional: 0,
        aPagar7d: 0,
        aReceber7d: 0,
    });
    const [textoWhatsApp, setTextoWhatsApp] = useState<string>('');

    // Filtros do Extrato
    const [filtroPreset, setFiltroPreset] = useState<Preset>('mes');
    const [filtroEscopo, setFiltroEscopo] = useState<string>('todos');
    const [filtroTipo, setFiltroTipo] = useState<string>('todos');
    const [filtroStatus, setFiltroStatus] = useState<string>('todos');
    const [filtroConta, setFiltroConta] = useState<string>('');
    const [busca, setBusca] = useState<string>('');

    // Modais
    const [modalWhatsAppAberto, setModalWhatsAppAberto] = useState(false);
    const [presetWhatsApp, setPresetWhatsApp] = useState<Preset>('semana');
    const [modalLancamentoAberto, setModalLancamentoAberto] = useState(false);
    const [lancamentoParaEditar, setLancamentoParaEditar] = useState<FinLancamento | null>(null);

    // Novos Modais de Contas e Transferência
    const [modalContaAberto, setModalContaAberto] = useState(false);
    const [contaParaEditar, setContaParaEditar] = useState<FinConta | null>(null);

    const [modalTransferenciaAberto, setModalTransferenciaAberto] = useState(false);
    const [contaOrigemTransferencia, setContaOrigemTransferencia] = useState<string | undefined>(undefined);

    const [modalFechamentoContaAberto, setModalFechamentoContaAberto] = useState(false);
    const [contaIdFechamento, setContaIdFechamento] = useState<string | undefined>(undefined);

    const [modalAcertoAberto, setModalAcertoAberto] = useState(false);
    const [modalImportarExtratoAberto, setModalImportarExtratoAberto] = useState(false);
    const [modalAuditoriaAberto, setModalAuditoriaAberto] = useState(false);
    const [modalExclusaoAberto, setModalExclusaoAberto] = useState(false);
    const [lancamentoParaExcluir, setLancamentoParaExcluir] = useState<FinLancamento | null>(null);

    // Toast de Feedback
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    const mostrarToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    // 1. Verificação de Acesso
    useEffect(() => {
        const checkAuth = async () => {
            setCarregandoAcesso(true);
            try {
                const { data } = await supabase.auth.getSession();
                const email = data?.session?.user?.email?.trim().toLowerCase() || '';
                setUserEmail(email);

                if (isFinanceiroAutorizado(email)) {
                    setAutorizado(true);
                    if (email.includes('ledra')) {
                        setEffectiveOwner('hgledra@hotmail.com');
                    } else {
                        setEffectiveOwner('hgledra@hotmail.com');
                    }
                } else {
                    setAutorizado(false);
                    setTimeout(() => router.push('/'), 3000);
                }
            } catch (err) {
                console.error('Erro ao verificar acesso:', err);
                setAutorizado(false);
            } finally {
                setCarregandoAcesso(false);
            }
        };
        checkAuth();
    }, [router]);

    // 2. Carregar Dados do Usuário Ativo
    const carregarTudo = useCallback(async () => {
        if (!effectiveOwner) return;

        try {
            const ownerQuery = `?owner=${encodeURIComponent(effectiveOwner)}`;

            // Init (contas e categorias)
            const resInit = await fetch(`/api/financeiro/init${ownerQuery}`);
            const dataInit = await resInit.json();
            if (dataInit.success) {
                setCategorias(dataInit.categorias || []);
            }

            // Contas com saldo atualizado
            const resContas = await fetch(`/api/financeiro/contas${ownerQuery}`);
            const dataContas = await resContas.json();
            if (dataContas.success) {
                setContas(dataContas.contas || []);
            }

            // Lançamentos
            const range = rangePreset(filtroPreset);
            let urlLancs = `/api/financeiro/lancamentos${ownerQuery}&inicio=${range.inicio}&fim=${range.fim}&escopo=${filtroEscopo}&tipo=${filtroTipo}&status=${filtroStatus}`;
            if (filtroConta) urlLancs += `&conta_id=${filtroConta}`;
            if (busca) urlLancs += `&q=${encodeURIComponent(busca)}`;

            const resLancs = await fetch(urlLancs);
            const dataLancs = await resLancs.json();
            if (dataLancs.success) {
                setLancamentos(dataLancs.lancamentos || []);
            }

            // Patrimônio
            const resPatri = await fetch(`/api/financeiro/patrimonio${ownerQuery}`);
            const dataPatri = await resPatri.json();
            if (dataPatri.success) {
                setItensPatrimonio(dataPatri.itens || []);
            }

            // Fechamentos
            const resFech = await fetch(`/api/financeiro/fechamento${ownerQuery}`);
            const dataFech = await resFech.json();
            if (dataFech.success) {
                setFechamentos(dataFech.fechamentos || []);
            }

            // Resumo & WhatsApp
            const resResumo = await fetch(`/api/financeiro/resumo${ownerQuery}&preset=${filtroPreset}`);
            const dataResumo = await resResumo.json();
            if (dataResumo.success) {
                setKpis(dataResumo.kpis || {});
                setTextoWhatsApp(dataResumo.whatsappTexto || '');
            }
        } catch (err) {
            console.error('Erro ao carregar dados do financeiro:', err);
        }
    }, [effectiveOwner, filtroPreset, filtroEscopo, filtroTipo, filtroStatus, filtroConta, busca]);

    useEffect(() => {
        if (autorizado) {
            carregarTudo();
        }
    }, [autorizado, carregarTudo]);

    // Atualiza texto WhatsApp quando mudar preset no modal
    const atualizarResumoWhatsApp = async (p: Preset) => {
        setPresetWhatsApp(p);
        try {
            const res = await fetch(`/api/financeiro/resumo?owner=${encodeURIComponent(effectiveOwner)}&preset=${p}`);
            const data = await res.json();
            if (data.success) {
                setTextoWhatsApp(data.whatsappTexto || '');
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Ações de Lançamento
    const handleSalvarLancamento = async (dados: any): Promise<boolean> => {
        try {
            const method = dados.id ? 'PUT' : 'POST';
            const res = await fetch(`/api/financeiro/lancamentos?owner=${encodeURIComponent(effectiveOwner)}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Erro ao salvar');

            mostrarToast(dados.id ? 'Lançamento atualizado!' : 'Lançamento registrado com sucesso!');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message || 'Erro ao salvar lançamento');
            return false;
        }
    };

    const handleSolicitarExclusao = (id: string, lanc?: FinLancamento) => {
        const item = lanc || lancamentos.find((l) => l.id === id) || null;
        if (item) {
            setLancamentoParaExcluir(item);
            setModalExclusaoAberto(true);
        }
    };

    const handleConfirmarExclusaoComMotivo = async (id: string, motivo: string): Promise<boolean> => {
        try {
            const res = await fetch(`/api/financeiro/lancamentos?owner=${encodeURIComponent(effectiveOwner)}&id=${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivo }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Erro ao excluir');

            mostrarToast('Lançamento excluído e registrado no log de auditoria.');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message || 'Erro ao excluir');
            return false;
        }
    };

    const handleDarBaixa = async (id: string, contaId?: string): Promise<boolean> => {
        try {
            const res = await fetch(`/api/financeiro/lancamentos?owner=${encodeURIComponent(effectiveOwner)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'dar_baixa', id, conta_id: contaId }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Erro ao dar baixa');

            mostrarToast('Pagamento/Recebimento baixado com sucesso!');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message || 'Erro ao dar baixa');
            return false;
        }
    };

    // Ações de Contas
    const handleSalvarConta = async (dados: any): Promise<boolean> => {
        try {
            const method = dados.id ? 'PUT' : 'POST';
            const res = await fetch(`/api/financeiro/contas?owner=${encodeURIComponent(effectiveOwner)}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Erro ao salvar conta');

            mostrarToast(dados.id ? 'Conta atualizada!' : 'Conta cadastrada com sucesso!');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message || 'Erro ao salvar conta');
            return false;
        }
    };

    const handleExcluirConta = async (id: string): Promise<boolean> => {
        try {
            const res = await fetch(`/api/financeiro/contas?owner=${encodeURIComponent(effectiveOwner)}&id=${id}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Erro ao excluir conta');

            mostrarToast(json.desativada ? 'Conta desativada para preservar histórico.' : 'Conta excluída com sucesso.');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message || 'Erro ao excluir conta');
            return false;
        }
    };

    // Ações de Patrimônio
    const handleSalvarPatrimonio = async (dados: any): Promise<boolean> => {
        try {
            const method = dados.id ? 'PUT' : 'POST';
            const res = await fetch(`/api/financeiro/patrimonio?owner=${encodeURIComponent(effectiveOwner)}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            mostrarToast('Patrimônio atualizado!');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message);
            return false;
        }
    };

    const handleAtualizarValorPatrimonio = async (id: string, novoValor: number): Promise<boolean> => {
        return handleSalvarPatrimonio({ id, valor_atual: novoValor });
    };

    const handleAlternarAtivoPatrimonio = async (id: string, ativo: boolean): Promise<boolean> => {
        return handleSalvarPatrimonio({ id, ativo });
    };

    const handleExcluirPatrimonio = async (id: string): Promise<boolean> => {
        if (!confirm('Deseja realmente excluir este item do patrimônio?')) return false;
        try {
            const res = await fetch(`/api/financeiro/patrimonio?owner=${encodeURIComponent(effectiveOwner)}&id=${id}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            mostrarToast('Item excluído.');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message);
            return false;
        }
    };

    // Ações de Fechamento (Geral e Individual de Conta)
    const handleCriarFechamento = async (dados: any): Promise<boolean> => {
        try {
            const res = await fetch(`/api/financeiro/fechamento?owner=${encodeURIComponent(effectiveOwner)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            mostrarToast('Fechamento registrado e travado com sucesso!');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message);
            return false;
        }
    };

    const handleReabrirFechamento = async (id: string): Promise<boolean> => {
        try {
            const res = await fetch(`/api/financeiro/fechamento?owner=${encodeURIComponent(effectiveOwner)}&id=${id}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            mostrarToast('Período reaberto para edição.');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message);
            return false;
        }
    };

    // Ações de Liquidação de Acerto entre Sócios
    const handleLiquidarAcerto = async (ids: string[]): Promise<boolean> => {
        try {
            const res = await fetch(`/api/financeiro/lancamentos?owner=${encodeURIComponent(effectiveOwner)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, acao: 'liquidar' }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            mostrarToast('PIX confirmado e acerto atualizado com sucesso!');
            carregarTudo();
            return true;
        } catch (err: any) {
            alert(err.message);
            return false;
        }
    };

    // Renderização de Telas de Carregamento e Bloqueio
    if (carregandoAcesso) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="flex items-center gap-3 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                    <span className="font-bold">Carregando Módulo Financeiro...</span>
                </div>
            </div>
        );
    }

    if (autorizado === false) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
                    <p className="text-sm text-slate-400">
                        Este módulo é de acesso exclusivo aos logins autorizados (<strong>Alexandre Gorges</strong> e <strong>Felipe Ledra</strong>).
                    </p>
                    <p className="text-xs text-slate-500">Redirecionando para o início...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0A0A0E] text-white p-4 md:p-8 space-y-6">
            {/* Toast Flutuante */}
            {toastMsg && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-500 text-slate-950 font-black px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-in slide-in-from-top-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>{toastMsg}</span>
                </div>
            )}

            {/* Cabeçalho Principal */}
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold flex items-center gap-1.5">
                            <WalletCards className="w-3.5 h-3.5" /> Caixa Livre & Patrimônio
                        </span>

                        {/* Seletor de Caixa (Alexandre pode alternar entre Ledra e seu próprio) */}
                        {isAlexandre && (
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setEffectiveOwner('hgledra@hotmail.com')}
                                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                        effectiveOwner === 'hgledra@hotmail.com'
                                            ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    👤 Caixa Felipe Ledra
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEffectiveOwner('alexandre_gorges@hotmail.com')}
                                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                        effectiveOwner === 'alexandre_gorges@hotmail.com'
                                            ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    👤 Meu Caixa (Alexandre)
                                </button>
                            </div>
                        )}
                    </div>

                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        Controle Financeiro & Evolução
                    </h1>
                    <p className="text-xs md:text-sm text-slate-400 mt-1">
                        Organização de contas individuais, transferências, fluxo de bens e proteção contra perda de capital.
                    </p>
                </div>

                {/* CTAs do Topo */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => {
                            setContaOrigemTransferencia(undefined);
                            setModalTransferenciaAberto(true);
                        }}
                        className="px-3.5 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-bold text-xs transition-all flex items-center gap-2"
                    >
                        <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                        <span>Transferir</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setModalImportarExtratoAberto(true)}
                        className="px-3.5 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 font-bold text-xs transition-all flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4 text-purple-400" />
                        <span>Importar Extrato</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setModalAuditoriaAberto(true)}
                        className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs transition-all flex items-center gap-2"
                        title="Histórico de exclusões com rastreabilidade"
                    >
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span>Logs Exclusões</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            atualizarResumoWhatsApp(presetWhatsApp);
                            setModalWhatsAppAberto(true);
                        }}
                        className="px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-bold text-xs transition-all flex items-center gap-2"
                    >
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                        <span>Resumo WhatsApp</span>
                    </button>

                    <button
                        type="button"
                        onClick={carregarTudo}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-all text-xs font-bold"
                        title="Atualizar dados"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setLancamentoParaEditar(null);
                            setModalLancamentoAberto(true);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Novo Lançamento
                    </button>
                </div>
            </div>

            {/* Barra de Lançamento Rápido em 1 Linha (Principal Motor de Organização) */}
            <div className="max-w-7xl mx-auto">
                <BarraLancamentoRapido
                    categorias={categorias}
                    contas={contas}
                    onSalvar={handleSalvarLancamento}
                    onAbrirModalCompleto={() => {
                        setLancamentoParaEditar(null);
                        setModalLancamentoAberto(true);
                    }}
                    onAbrirTransferencia={() => {
                        setContaOrigemTransferencia(undefined);
                        setModalTransferenciaAberto(true);
                    }}
                />
            </div>

            {/* Abas de Navegação */}
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setAbaAtiva('visao_geral')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                            abaAtiva === 'visao_geral'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Sparkles className="w-4 h-4" /> Visão Geral & Diário
                    </button>
                    <button
                        type="button"
                        onClick={() => setAbaAtiva('contas_pagar_receber')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                            abaAtiva === 'contas_pagar_receber'
                                ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30 font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Clock className="w-4 h-4 text-rose-400" /> Contas a Pagar & Receber
                        {lancamentos.filter(l => l.status === 'previsto').length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 font-bold">
                                {lancamentos.filter(l => l.status === 'previsto').length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setAbaAtiva('extrato')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                            abaAtiva === 'extrato'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <ListFilter className="w-4 h-4" /> Extrato Completo
                    </button>
                    <button
                        type="button"
                        onClick={() => setAbaAtiva('patrimonio')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                            abaAtiva === 'patrimonio'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Gem className="w-4 h-4 text-purple-400" /> Fluxo de Patrimônio
                    </button>
                    <button
                        type="button"
                        onClick={() => setAbaAtiva('fechamentos')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                            abaAtiva === 'fechamentos'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Layers className="w-4 h-4" /> Fechamentos de Caixa
                    </button>
                    <button
                        type="button"
                        onClick={() => setAbaAtiva('historico_planilha')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                            abaAtiva === 'historico_planilha'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-black'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <History className="w-4 h-4 text-amber-400" /> 📜 Histórico Planilha (2023–2026)
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold">
                            30 Períodos
                        </span>
                    </button>
                </div>
            </div>

            {/* Conteúdo da Aba Ativa */}
            <div className="max-w-7xl mx-auto space-y-6">
                {abaAtiva === 'visao_geral' && (
                    <div className="space-y-6">
                        <KpiCardsFinanceiro
                            kpis={kpis}
                            contas={contas}
                            onNovaConta={() => {
                                setContaParaEditar(null);
                                setModalContaAberto(true);
                            }}
                            onEditarConta={(c) => {
                                setContaParaEditar(c);
                                setModalContaAberto(true);
                            }}
                            onTransferir={(origemId) => {
                                setContaOrigemTransferencia(origemId);
                                setModalTransferenciaAberto(true);
                            }}
                            onFecharConta={(cId) => {
                                setContaIdFechamento(cId);
                                setModalFechamentoContaAberto(true);
                            }}
                            onAbrirAcerto={() => setModalAcertoAberto(true)}
                        />

                        {/* Extrato Recente no Painel Diário */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <h3 className="text-sm font-black text-white">Extrato Recente do Período</h3>
                                <button
                                    type="button"
                                    onClick={() => setAbaAtiva('extrato')}
                                    className="text-xs text-emerald-400 hover:underline font-bold"
                                >
                                    Ver Extrato Completo →
                                </button>
                            </div>
                            <TabelaLancamentos
                                lancamentos={lancamentos.slice(0, 15)}
                                categorias={categorias}
                                contas={contas}
                                onEditar={(l) => {
                                    setLancamentoParaEditar(l);
                                    setModalLancamentoAberto(true);
                                }}
                                onExcluir={handleSolicitarExclusao}
                                filtroPreset={filtroPreset}
                                onMudarPreset={setFiltroPreset}
                                filtroEscopo={filtroEscopo}
                                onMudarEscopo={setFiltroEscopo}
                                filtroTipo={filtroTipo}
                                onMudarTipo={setFiltroTipo}
                                filtroStatus={filtroStatus}
                                onMudarStatus={setFiltroStatus}
                                filtroConta={filtroConta}
                                onMudarConta={setFiltroConta}
                                busca={busca}
                                onMudarBusca={setBusca}
                            />
                        </div>
                    </div>
                )}

                {abaAtiva === 'contas_pagar_receber' && (
                    <AbaContasPagarReceber
                        lancamentos={lancamentos}
                        contas={contas}
                        onDarBaixa={handleDarBaixa}
                        onEditar={(l) => {
                            setLancamentoParaEditar(l);
                            setModalLancamentoAberto(true);
                        }}
                        onExcluir={(l) => handleSolicitarExclusao(l.id, l)}
                        onNovo={(tipo) => {
                            setLancamentoParaEditar({
                                id: '',
                                tipo,
                                valor: 0,
                                data: hojeISO(),
                                data_vencimento: hojeISO(),
                                descricao: '',
                                conta_id: contas[0]?.id || null,
                                conta_destino_id: null,
                                categoria_id: null,
                                escopo: 'PF',
                                placa: null,
                                status: 'previsto',
                                texto_original: null,
                                fechamento_id: null,
                                created_at: new Date().toISOString(),
                            });
                            setModalLancamentoAberto(true);
                        }}
                    />
                )}

                {abaAtiva === 'extrato' && (
                    <TabelaLancamentos
                        lancamentos={lancamentos}
                        categorias={categorias}
                        contas={contas}
                        onEditar={(l) => {
                            setLancamentoParaEditar(l);
                            setModalLancamentoAberto(true);
                        }}
                        onExcluir={handleSolicitarExclusao}
                        filtroPreset={filtroPreset}
                        onMudarPreset={setFiltroPreset}
                        filtroEscopo={filtroEscopo}
                        onMudarEscopo={setFiltroEscopo}
                        filtroTipo={filtroTipo}
                        onMudarTipo={setFiltroTipo}
                        filtroStatus={filtroStatus}
                        onMudarStatus={setFiltroStatus}
                        filtroConta={filtroConta}
                        onMudarConta={setFiltroConta}
                        busca={busca}
                        onMudarBusca={setBusca}
                    />
                )}

                {abaAtiva === 'patrimonio' && (
                    <AbaPatrimonio
                        itens={itensPatrimonio}
                        totais={{
                            totalCaixa: kpis.totalCaixa,
                            totalAtivosBens: kpis.totalAtivosBens,
                            totalAtivosGeral: kpis.totalCaixa + kpis.totalAtivosBens,
                            totalPassivos: kpis.totalPassivos,
                            patrimonioLiquido: kpis.patrimonioLiquido,
                        }}
                        onSalvarItem={handleSalvarPatrimonio}
                        onAtualizarValor={handleAtualizarValorPatrimonio}
                        onAlternarAtivo={handleAlternarAtivoPatrimonio}
                        onExcluirItem={handleExcluirPatrimonio}
                    />
                )}

                {abaAtiva === 'fechamentos' && (
                    <AbaFechamentos
                        fechamentos={fechamentos}
                        contas={contas}
                        onAbrirModalFechamento={(cId) => {
                            setContaIdFechamento(cId);
                            setModalFechamentoContaAberto(true);
                        }}
                        onReabrirFechamento={handleReabrirFechamento}
                    />
                )}

                {abaAtiva === 'historico_planilha' && (
                    <AbaHistoricoPlanilha />
                )}
            </div>

            {/* Modais */}
            <ModalImportarExtrato
                aberto={modalImportarExtratoAberto}
                onFechar={() => setModalImportarExtratoAberto(false)}
                contas={contas}
                categorias={categorias}
                ownerParam={effectiveOwner}
                onImportadoComSucesso={() => {
                    mostrarToast('Extrato importado com sucesso!');
                    carregarTudo();
                }}
            />

            <ModalResumoWhatsApp
                isOpen={modalWhatsAppAberto}
                onClose={() => setModalWhatsAppAberto(false)}
                textoWhatsApp={textoWhatsApp}
                presetAtual={presetWhatsApp}
                onMudarPreset={atualizarResumoWhatsApp}
            />

            <ModalLancamentoDetalhado
                isOpen={modalLancamentoAberto}
                onClose={() => setModalLancamentoAberto(false)}
                onSalvar={handleSalvarLancamento}
                onExcluir={handleSolicitarExclusao}
                categorias={categorias}
                contas={contas}
                lancamentoParaEditar={lancamentoParaEditar}
            />

            <ModalGerenciarConta
                isOpen={modalContaAberto}
                onClose={() => setModalContaAberto(false)}
                onSalvar={handleSalvarConta}
                onExcluir={handleExcluirConta}
                contaParaEditar={contaParaEditar}
            />

            <ModalTransferencia
                isOpen={modalTransferenciaAberto}
                onClose={() => setModalTransferenciaAberto(false)}
                contas={contas}
                contaOrigemInicial={contaOrigemTransferencia}
                onRealizarTransferencia={handleSalvarLancamento}
            />

            <ModalFechamentoConta
                isOpen={modalFechamentoContaAberto}
                onClose={() => setModalFechamentoContaAberto(false)}
                contas={contas}
                contaIdInicial={contaIdFechamento}
                onRealizarFechamento={handleCriarFechamento}
            />

            <ModalAcertoSocios
                isOpen={modalAcertoAberto}
                onClose={() => setModalAcertoAberto(false)}
                acerto={kpis.acerto || { totalAlexandreDeveAoLedra: 0, totalLedraDeveAoAlexandre: 0, saldoLiquidoAcerto: 0, itensPendentes: [] }}
                onLiquidar={handleLiquidarAcerto}
            />

            <ModalConfirmarExclusao
                aberto={modalExclusaoAberto}
                lancamento={lancamentoParaExcluir}
                onFechar={() => {
                    setModalExclusaoAberto(false);
                    setLancamentoParaExcluir(null);
                }}
                onConfirmar={handleConfirmarExclusaoComMotivo}
            />

            <ModalAuditoriaExclusoes
                aberto={modalAuditoriaAberto}
                onFechar={() => setModalAuditoriaAberto(false)}
                onItemRestaurado={() => {
                    mostrarToast('Lançamento restaurado com sucesso!');
                    carregarTudo();
                }}
            />
        </div>
    );
}
