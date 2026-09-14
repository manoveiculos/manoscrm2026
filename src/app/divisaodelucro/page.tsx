'use client';

import React, { useState, useEffect } from 'react';
import {
    AcertoRegistrado,
    KpisSocietarios,
    RetiradaSocio,
    verificarAcessoSocio
} from '@/lib/services/societarioService';
import type { AcertoEmpresas, NomeSocio } from '@/lib/services/societarioAcerto';
import { ParsedContratoResult } from '@/lib/services/societarioPdfParser';
import { KpiCards } from './components/KpiCards';
import { TabelaNegocios } from '../societario/components/TabelaNegocios';
import { ModuloIngestaoPdf } from '../societario/components/ModuloIngestaoPdf';
import { PainelCaixaAcerto } from '../societario/components/PainelCaixaAcerto';
import { ModalDetalhamentoOperacao } from '../societario/components/ModalDetalhamentoOperacao';
import { FormNovoContrato } from '../societario/components/FormNovoContrato';
import {
    ShieldCheck,
    RefreshCw,
    Plus,
    Lock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function DivisaoDeLucroPage() {
    const [carregando, setCarregando] = useState(true);
    const [autorizado, setAutorizado] = useState<boolean | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [socioAtual, setSocioAtual] = useState<NomeSocio | null>(null);
    const [veiculos, setVeiculos] = useState<any[]>([]);
    const [retiradas, setRetiradas] = useState<RetiradaSocio[]>([]);
    const [acertos, setAcertos] = useState<AcertoRegistrado[]>([]);
    const [acerto, setAcerto] = useState<AcertoEmpresas | null>(null);
    const [kpis, setKpis] = useState<KpisSocietarios>({
        volumeVendas: 0,
        custoAquisicaoTotal: 0,
        comissoesECustosTotal: 0,
        lucroLiquidoTotal: 0,
        alexandre: { cotaTotal: 0, retiradas: 0, saldoDisponivel: 0 },
        ivo: { cotaTotal: 0, retiradas: 0, saldoDisponivel: 0 }
    });

    const [veiculoSelecionado, setVeiculoSelecionado] = useState<any | null>(null);
    const [modalNovoContrato, setModalNovoContrato] = useState(false);
    const [parsedPdfData, setParsedPdfData] = useState<ParsedContratoResult | null>(null);

    const carregarDados = async () => {
        setCarregando(true);
        try {
            let email: string | null = null;
            try {
                const { data } = await supabase.auth.getSession();
                email = data?.session?.user?.email || null;
                setUserEmail(email);
            } catch (aErr) {
                console.warn('Aviso de sessão auth:', aErr);
            }

            let isPermitido = true;
            if (email) {
                isPermitido = await verificarAcessoSocio(email);
            }
            setAutorizado(isPermitido);

            const res = await fetch('/api/societario/dados');
            const data = await res.json();

            if (data && data.success) {
                const lista = data.veiculos || [];
                setVeiculos(lista);
                setRetiradas(data.retiradas || []);
                setAcertos(data.acertos || []);
                setAcerto(data.acerto || null);
                setSocioAtual(data.socio?.nome || null);
                setKpis(data.kpis);
                // modal aberto passa a mostrar a versão recarregada do veículo
                setVeiculoSelecionado((atual: any) => (atual ? lista.find((v: any) => v.id === atual.id) ?? atual : atual));
            }
        } catch (err) {
            console.error('Erro ao carregar dados de divisão de lucro:', err);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        carregarDados();
    }, []);

    const handlePdfParsed = (data: ParsedContratoResult) => {
        setParsedPdfData(data);
        setModalNovoContrato(true);
    };

    if (carregando && autorizado === null) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="flex items-center gap-3 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                    <span>Carregando Dashboard Divisão de Lucro...</span>
                </div>
            </div>
        );
    }

    if (autorizado === false) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Acesso Restrito - Divisão de Lucro</h2>
                    <p className="text-xs text-slate-400">
                        Este módulo de apuração de fechamentos e partilha de lucros é exclusivo para <strong>Alexandre</strong> e <strong>Ivo</strong>.
                    </p>
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-500 font-mono">
                        Usuário Atual: {userEmail || 'Não Autenticado'}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            {/* Header Principal */}
            <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Acesso Exclusivo Alexandre & Ivo
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                            {socioAtual ? `Logado como ${socioAtual}` : 'Mano Veículos 2026'}
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-2">
                        Dashboard de Divisão de Lucro
                    </h1>
                    <p className="text-xs md:text-sm text-slate-400 mt-1">
                        Contratos, caixa de cada empresa, acerto entre Manos e V3 e aprovação das operações.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={carregarDados}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all shadow-md flex items-center gap-2 text-xs font-semibold"
                    >
                        <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-emerald-400' : ''}`} /> Atualizar Dados
                    </button>

                    <button
                        onClick={() => {
                            setParsedPdfData(null);
                            setModalNovoContrato(true);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Novo Contrato / Operação
                    </button>
                </div>
            </div>

            {/* Conteúdo do Dashboard */}
            <div className="max-w-7xl mx-auto space-y-8">
                {/* 1. KPIs das Cotas e Margens */}
                <KpiCards kpis={kpis} />

                {/* 2. Módulo de Ingestão PDF Parser */}
                <ModuloIngestaoPdf onParsed={handlePdfParsed} />

                {/* 3. Tabela Consolidada de Negócios */}
                <TabelaNegocios
                    veiculos={veiculos}
                    onSelectVeiculo={(v) => setVeiculoSelecionado(v)}
                />

                {/* 4. Caixa das empresas, acerto entre elas e retiradas */}
                <PainelCaixaAcerto
                    acerto={acerto}
                    veiculos={veiculos}
                    retiradas={retiradas}
                    acertos={acertos}
                    socioAtual={socioAtual}
                    onAtualizar={carregarDados}
                />
            </div>

            {/* Modais de Interação */}
            {veiculoSelecionado && (
                <ModalDetalhamentoOperacao
                    key={veiculoSelecionado.id}
                    veiculo={veiculoSelecionado}
                    socioAtual={socioAtual}
                    onClose={() => setVeiculoSelecionado(null)}
                    onSaveSuccess={carregarDados}
                />
            )}

            {modalNovoContrato && (
                <FormNovoContrato
                    parsedData={parsedPdfData}
                    veiculosExistentes={veiculos}
                    onSuccess={carregarDados}
                    onClose={() => {
                        setModalNovoContrato(false);
                        setParsedPdfData(null);
                    }}
                />
            )}
        </div>
    );
}
