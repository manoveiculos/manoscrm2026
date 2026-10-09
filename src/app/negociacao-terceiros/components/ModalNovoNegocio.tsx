'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Plus, Trash2, CheckCircle2, ShieldCheck, Car, Save, Loader2, ArrowRight } from 'lucide-react';
import { ModuloIngestaoPdf } from '@/app/societario/components/ModuloIngestaoPdf';
import { ParsedContratoResult } from '@/lib/services/societarioPdfParser';

interface ModalNovoNegocioProps {
    onClose: () => void;
    onSuccess: () => void;
    negocioIdToEdit?: string | null;
}

interface Despesa {
    categoria: string;
    descricao: string;
    valor: number;
}

export function ModalNovoNegocio({ onClose, onSuccess, negocioIdToEdit }: ModalNovoNegocioProps) {
    const [step, setStep] = useState(negocioIdToEdit ? 2 : 1);
    const [salvando, setSalvando] = useState(false);
    const [editandoId, setEditandoId] = useState<string | null>(null);

    // Form data
    const [tipoOperacao, setTipoOperacao] = useState('Compra e Venda Própria');
    const [status, setStatus] = useState('Em Negociação');
    const [veiculo, setVeiculo] = useState('');
    const [placa, setPlaca] = useState('');
    const [ano, setAno] = useState('');
    
    // Valores
    const [valorEntrada, setValorEntrada] = useState(0);
    const [valorSaida, setValorSaida] = useState(0);
    const [pagamentoDiretoCliente, setPagamentoDiretoCliente] = useState(false);

    // Contato
    const [nomeParceiro, setNomeParceiro] = useState('');
    
    // Despesas adicionais
    const [despesas, setDespesas] = useState<Despesa[]>([]);
    
    // Regras Automáticas e Impostos
    const [incluirTransferencia, setIncluirTransferencia] = useState(true);
    const [nfeSaida, setNfeSaida] = useState(0);
    const [nfeEntrada, setNfeEntrada] = useState(0);
    const [impostoManual, setImpostoManual] = useState(false);

    // Função para calcular impostos baseados na planilha
    const calcularImpostoTotal = (saida: number, entrada: number) => {
        if (!saida) return 0;
        
        // ICMS (12% sobre 5% do valor da NFe de Saída)
        const baseIcms = saida * 0.05;
        const valorIcms = baseIcms * 0.12;

        const diferenca = saida - entrada;
        if (diferenca <= 0) return valorIcms; // Se não houver lucro, paga apenas ICMS sobre a saída

        // PIS/COFINS (3.65% sobre a diferença deduzido do ICMS)
        const basePisCofins = diferenca - valorIcms;
        const valorPisCofins = basePisCofins > 0 ? basePisCofins * 0.0365 : 0;

        // IRPJ/CSLL (7.68% sobre a diferença)
        const valorIrpjCsll = diferenca * 0.0768;

        return valorIcms + valorPisCofins + valorIrpjCsll;
    };

    const impostoCalculado = calcularImpostoTotal(nfeSaida, nfeEntrada);

    // Efeito para carregar dados caso venha com ID de edição
    React.useEffect(() => {
        if (negocioIdToEdit) {
            buscarNegocioPorId(negocioIdToEdit);
        }
    }, [negocioIdToEdit]);

    const carregarDadosForm = (data: any) => {
        setEditandoId(data.id);
        setTipoOperacao(data.tipo_operacao || 'Compra e Venda Própria');
        setStatus(data.status || 'Em Negociação');
        setVeiculo(data.veiculo_modelo || '');
        setPlaca(data.veiculo_placa || '');
        setAno(data.veiculo_ano || '');
        setNomeParceiro(data.terceiro_nome || '');
        setValorEntrada(Number(data.valor_nfe_entrada) || 0);
        setValorSaida(Number(data.valor_nfe_saida) || 0);
        setStep(2);
    };

    const buscarNegocioPorId = async (id: string) => {
        try {
            const { data, error } = await supabase.from('negociacao_terceiros').select('*').eq('id', id).single();
            if (data && !error) {
                carregarDadosForm(data);
                const { data: desp } = await supabase.from('negociacao_terceiros_despesas').select('*').eq('negociacao_id', data.id);
                if (desp && desp.length > 0) {
                    setDespesas(desp.filter(d => d.categoria !== 'Imposto' && d.categoria !== 'Taxa').map(d => ({
                        categoria: d.categoria,
                        descricao: d.descricao,
                        valor: d.valor
                    })));
                    const transf = desp.find(d => d.categoria === 'Taxa' && d.descricao.includes('Transferência'));
                    if (transf) setIncluirTransferencia(true);
                    else setIncluirTransferencia(false);

                    const nf = desp.find(d => d.categoria === 'Imposto' && d.descricao.includes('Nota Fiscal'));
                    if (nf) {
                        // Como agora o cálculo é complexo, apenas definimos o valor caso esteja editando
                        // Mas sem ter NFe Saida e NFe Entrada salvas na DB, não dá pra fazer reversa perfeita.
                        // Como solução, habilitamos o modo se os valores da negociação servirem:
                        setNfeSaida(data.valor_nfe_saida || 0);
                        setNfeEntrada(data.valor_nfe_entrada || 0);
                    }
                }
            }
        } catch (e) { console.error(e); }
    };

    const excluirNegocio = async () => {
        if (!editandoId || !window.confirm('Tem certeza que deseja excluir esta negociação? Todas as contas e acertos vinculados serão apagados.')) return;
        setSalvando(true);
        try {
            await supabase.from('negociacao_terceiros').delete().eq('id', editandoId);
            onSuccess();
            onClose();
        } catch (e) {
            console.error('Erro ao excluir:', e);
        } finally {
            setSalvando(false);
        }
    };

    const buscarNegocioExistente = async (placaBusca: string) => {
        try {
            const { data, error } = await supabase
                .from('negociacao_terceiros')
                .select('*')
                .ilike('veiculo_placa', placaBusca)
                .neq('status', 'Finalizado')
                .neq('status', 'Cancelado')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data && !error) {
                carregarDadosForm(data);
                
                // Carregar despesas existentes
                const { data: desp } = await supabase
                    .from('negociacao_terceiros_despesas')
                    .select('*')
                    .eq('negociacao_id', data.id);
                
                if (desp && desp.length > 0) {
                    setDespesas(desp.map(d => ({
                        categoria: d.categoria,
                        descricao: d.descricao,
                        valor: d.valor
                    })));
                }
                return true;
            }
        } catch (err) {
            console.log('Nenhum negócio anterior encontrado para a placa:', placaBusca);
        }
        return false;
    };

    const handlePdfParsed = async (data: ParsedContratoResult) => {
        if (data.tipo === 'compra') {
            setValorEntrada(data.valorTotal || 0);
            setStatus('Veículo em Estoque Terceiro');
        } else if (data.tipo === 'venda') {
            setValorSaida(data.valorTotal || 0);
            setStatus('Vendido');
        }
        
        setVeiculo(data.marcaModelo || '');
        setPlaca(data.placa || '');
        setAno(data.anoFabricacao ? `${data.anoFabricacao}` : '');
        setNomeParceiro(data.nomeParteInversa || '');
        
        if (data.placa) {
            await buscarNegocioExistente(data.placa);
        }

        // Auto preencher NFE Entrada e NFE Saida
        if (data.tipo === 'venda' && data.valorTotal) {
            setNfeSaida(data.valorTotal);
        } else if (data.tipo === 'compra' && data.valorTotal) {
            setNfeEntrada(data.valorTotal);
        }
        
        setStep(2);
    };

    const addDespesa = () => {
        setDespesas([...despesas, { categoria: 'Outros', descricao: '', valor: 0 }]);
    };

    const updateDespesa = (index: number, field: keyof Despesa, value: any) => {
        const newDespesas = [...despesas];
        newDespesas[index] = { ...newDespesas[index], [field]: value };
        setDespesas(newDespesas);
    };

    const removeDespesa = (index: number) => {
        setDespesas(despesas.filter((_, i) => i !== index));
    };

    const salvarNegocio = async () => {
        setSalvando(true);
        try {
            const margem = valorSaida - valorEntrada;
            
            // Calcula total de despesas (apenas as despesas operacionais da sociedade)
            let totalDespesas = despesas.reduce((acc, curr) => acc + curr.valor, 0);

            // As taxas de transferência e impostos são repassadas ao cliente, 
            // então NÃO diminuem o lucro líquido (comissão gerada).

            const lucroLiquido = margem - totalDespesas;
            
            // Divisão meio a meio
            const lucroAlexandre = lucroLiquido / 2;
            const lucroWilson = lucroLiquido / 2;

            // 1. Criar ou Atualizar negócio principal
            const payload = {
                tipo_operacao: tipoOperacao,
                veiculo_modelo: veiculo,
                veiculo_placa: placa,
                veiculo_ano: ano,
                terceiro_nome: nomeParceiro,
                status,
                valor_nfe_entrada: valorEntrada,
                valor_nfe_saida: valorSaida,
                margem_bruta: margem,
                lucro_liquido: lucroLiquido,
                percentual_alexandre: 50,
                percentual_wilson: 50,
                lucro_alexandre: lucroAlexandre,
                lucro_wilson: lucroWilson,
            };

            let negocioId = editandoId;

            if (editandoId) {
                await supabase.from('negociacao_terceiros').update(payload).eq('id', editandoId);
                // Se estamos editando, apagamos as despesas antigas para recriar as novas (simplificação)
                await supabase.from('negociacao_terceiros_despesas').delete().eq('negociacao_id', editandoId);
            } else {
                const { data: negocioNovo, error } = await supabase
                    .from('negociacao_terceiros')
                    .insert(payload)
                    .select()
                    .single();

                if (error) throw error;
                negocioId = negocioNovo.id;
            }

            // 2. Criar Despesas no banco
            const despesasInserir = despesas.map(d => ({
                negociacao_id: negocioId,
                categoria: d.categoria,
                descricao: d.descricao,
                valor: d.valor,
                responsavel_pagamento: 'Caixa Terceiros'
            }));

            if (incluirTransferencia && (status === 'Vendido' || valorSaida > 0)) {
                despesasInserir.push({
                    negociacao_id: negocioId,
                    categoria: 'Taxa',
                    descricao: 'Transferência (Fixa)',
                    valor: 380,
                    responsavel_pagamento: 'Cliente Final'
                });
            }

            if (impostoCalculado > 0 && (status === 'Vendido' || valorSaida > 0)) {
                despesasInserir.push({
                    negociacao_id: negocioId,
                    categoria: 'Imposto',
                    descricao: `Nota Fiscal (Lucro Real/Presumido)`,
                    valor: impostoCalculado,
                    responsavel_pagamento: 'Caixa Terceiros'
                });
            }

            if (despesasInserir.length > 0) {
                const { error: errDespesas } = await supabase
                    .from('negociacao_terceiros_despesas')
                    .insert(despesasInserir);
                if (errDespesas) throw errDespesas;
            }

            // 3. Criar ou Atualizar Registros de Caixa
            // Nova lógica: não deletamos mais. Apenas atualizamos se for Pendente, ou criamos se não existir.
            // Função auxiliar para lidar com cada tipo de lançamento no Caixa
            const syncCaixa = async (tipo: string, descMatch: string, descricaoCompleta: string, valor: number) => {
                if (valor <= 0) return;
                const { data: ext } = await supabase.from('negociacao_terceiros_caixa')
                    .select('id, status').eq('negociacao_id', negocioId).eq('tipo', tipo).ilike('descricao', descMatch).limit(1).maybeSingle();
                
                if (ext) {
                    // Já existe. Se estiver pendente, atualiza o valor caso tenha mudado. Se já foi pago, não mexe.
                    if (ext.status === 'Pendente') {
                        await supabase.from('negociacao_terceiros_caixa').update({
                            valor: valor,
                            descricao: descricaoCompleta
                        }).eq('id', ext.id);
                    }
                } else {
                    // Não existe, cria novo
                    await supabase.from('negociacao_terceiros_caixa').insert({
                        negociacao_id: negocioId,
                        tipo: tipo,
                        descricao: descricaoCompleta,
                        valor: valor,
                        status: 'Pendente'
                    });
                }
            };

            if (!pagamentoDiretoCliente && valorEntrada > 0) {
                await syncCaixa('A Pagar', '%Compra%', `Compra de veículo: ${veiculo}`, valorEntrada);
            }

            if ((status === 'Vendido' || valorSaida > 0) && valorSaida > 0) {
                await syncCaixa('A Receber', 'Venda de veículo%', `Venda de veículo: ${veiculo}`, valorSaida);
            }

            // Gerar cobranças "A Receber" do cliente referente a impostos e transferência
            if (incluirTransferencia && (status === 'Vendido' || valorSaida > 0)) {
                await syncCaixa('A Receber', '%Transferência%', `Taxa de Transferência (Cliente): ${veiculo}`, 380);
            }

            if (impostoCalculado > 0 && (status === 'Vendido' || valorSaida > 0)) {
                await syncCaixa('A Receber', '%Imposto%', `Repasse de Imposto NF (Cliente): ${veiculo}`, impostoCalculado);
            }

            // Gerar Acertos (Lucro a distribuir) se já estiver vendido e tiver lucro
            if (status === 'Vendido' && lucroLiquido > 0) {
                await syncCaixa('Acerto', '%Lucro Wilson%', `Lucro Wilson (50%): ${veiculo}`, lucroWilson);
                await syncCaixa('Acerto', '%Lucro Alexandre%', `Lucro Alexandre (50%): ${veiculo}`, lucroAlexandre);
            }

            onSuccess();
            onClose();
        } catch (err) {
            console.error('Erro ao salvar negócio:', err);
            alert('Erro ao salvar. Verifique o console.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#0C0C0F] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Plus className="w-5 h-5 text-red-500" />
                            Novo Negócio de Terceiros
                        </h2>
                        <p className="text-xs text-white/40 mt-1">
                            {step === 1 ? 'Passo 1: Importar Contrato Inteligente' : 'Passo 2: Confirmar Dados e Despesas'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-white/50 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1">
                    {step === 1 && (
                        <div className="space-y-6">
                            <ModuloIngestaoPdf onParsed={handlePdfParsed} />
                            
                            <div className="flex items-center justify-center">
                                <div className="h-px bg-white/10 w-full max-w-[100px]"></div>
                                <span className="text-xs text-white/30 px-4 uppercase font-bold tracking-wider">Ou preencha manualmente</span>
                                <div className="h-px bg-white/10 w-full max-w-[100px]"></div>
                            </div>

                            <div className="text-center">
                                <button 
                                    onClick={() => setStep(2)}
                                    className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm transition-all inline-flex items-center gap-2"
                                >
                                    Pular e Preencher Manualmente <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            
                            {/* Coluna Esquerda: Dados Principais */}
                            <div className="space-y-5">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                                    <Car className="w-4 h-4 text-emerald-400" /> Dados do Veículo e Operação
                                </h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-white/50">Status da Operação</label>
                                        <select 
                                            value={status} 
                                            onChange={(e) => setStatus(e.target.value)}
                                            className="w-full bg-[#15151A] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
                                        >
                                            <option value="Em Negociação">Em Negociação</option>
                                            <option value="Veículo em Estoque Terceiro">Estoque</option>
                                            <option value="Vendido">Vendido</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-white/50">Tipo de Negócio</label>
                                        <select 
                                            value={tipoOperacao} 
                                            onChange={(e) => setTipoOperacao(e.target.value)}
                                            className="w-full bg-[#15151A] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
                                        >
                                            <option value="Compra e Venda Própria">Compra e Venda Própria</option>
                                            <option value="Intermediação">Intermediação</option>
                                            <option value="Repasse">Repasse</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-white/50">Veículo (Marca/Modelo)</label>
                                    <input 
                                        type="text" 
                                        value={veiculo} onChange={(e) => setVeiculo(e.target.value)}
                                        className="w-full bg-[#15151A] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
                                        placeholder="Ex: Porsche 911 Carrera"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-white/50">Placa</label>
                                        <input 
                                            type="text" 
                                            value={placa} onChange={(e) => setPlaca(e.target.value)}
                                            className="w-full bg-[#15151A] border border-white/10 rounded-xl p-3 text-sm text-white uppercase focus:outline-none focus:border-red-500"
                                            placeholder="AAA-1234"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-white/50">Nome do Terceiro/Parceiro</label>
                                        <input 
                                            type="text" 
                                            value={nomeParceiro} onChange={(e) => setNomeParceiro(e.target.value)}
                                            className="w-full bg-[#15151A] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="space-y-1 relative">
                                        <label className="text-xs font-medium text-white/50">Valor de Compra/Entrada</label>
                                        <div className="absolute left-3 bottom-3 text-white/50 text-sm">R$</div>
                                        <input 
                                            type="number" 
                                            value={valorEntrada || ''} onChange={(e) => setValorEntrada(Number(e.target.value))}
                                            className="w-full bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 pl-10 text-sm text-white focus:outline-none focus:border-blue-500 font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1 relative">
                                        <label className="text-xs font-medium text-white/50">Valor de Venda/Saída</label>
                                        <div className="absolute left-3 bottom-3 text-white/50 text-sm">R$</div>
                                        <input 
                                            type="number" 
                                            value={valorSaida || ''} onChange={(e) => setValorSaida(Number(e.target.value))}
                                            className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 pl-10 text-sm text-white focus:outline-none focus:border-emerald-500 font-bold"
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center gap-3 p-4 border border-white/10 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={pagamentoDiretoCliente}
                                        onChange={(e) => setPagamentoDiretoCliente(e.target.checked)}
                                        className="w-5 h-5 rounded border-white/20 bg-transparent text-red-500 focus:ring-0 focus:ring-offset-0"
                                    />
                                    <div>
                                        <div className="text-sm font-bold text-white">Pagamento Direto pelo Cliente</div>
                                        <div className="text-[10px] text-white/50 mt-0.5">Marque isso se o dinheiro não saiu do caixa da sociedade na compra.</div>
                                    </div>
                                </label>
                            </div>

                            {/* Coluna Direita: Regras e Despesas */}
                            <div className="space-y-5">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                                    <ShieldCheck className="w-4 h-4 text-purple-400" /> Regras e Despesas Adicionais
                                </h3>

                                {/* Automatizações de Venda */}
                                {(status === 'Vendido' || valorSaida > 0) && (
                                    <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-4">
                                        <div className="text-xs font-bold text-purple-400 mb-2">Cobranças Automáticas na Venda</div>
                                        
                                        <label className="flex items-center justify-between cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" checked={incluirTransferencia} onChange={(e) => setIncluirTransferencia(e.target.checked)} className="rounded bg-transparent border-white/20 text-purple-500" />
                                                <span className="text-sm text-white">Taxa de Transferência Fixa</span>
                                            </div>
                                            <span className="text-sm font-bold text-white">R$ 380,00</span>
                                        </label>

                                        <div className="space-y-3 relative pt-3 border-t border-purple-500/20">
                                            <div className="text-xs font-bold text-purple-400 mb-2">Cálculo de Impostos (NFe)</div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-medium text-white/70">NFe Entrada</label>
                                                    <div className="relative mt-1">
                                                        <div className="absolute left-3 bottom-2.5 text-white/50 text-xs">R$</div>
                                                        <input 
                                                            type="number" 
                                                            value={nfeEntrada || ''} onChange={(e) => setNfeEntrada(Number(e.target.value))}
                                                            className="w-full bg-[#15151A] border border-white/10 rounded-xl p-2.5 pl-8 text-xs text-white focus:outline-none focus:border-purple-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-white/70">NFe Saída</label>
                                                    <div className="relative mt-1">
                                                        <div className="absolute left-3 bottom-2.5 text-white/50 text-xs">R$</div>
                                                        <input 
                                                            type="number" 
                                                            value={nfeSaida || ''} onChange={(e) => setNfeSaida(Number(e.target.value))}
                                                            className="w-full bg-[#15151A] border border-white/10 rounded-xl p-2.5 pl-8 text-xs text-white focus:outline-none focus:border-purple-500"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {nfeSaida > 0 && (
                                                <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                                                    <div className="flex justify-between mb-1">
                                                        <span>ICMS (12% da Base Reduzida)</span>
                                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((nfeSaida * 0.05) * 0.12)}</span>
                                                    </div>
                                                    <div className="flex justify-between mb-1">
                                                        <span>PIS/COFINS (3.65% da Base Líq.)</span>
                                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, (nfeSaida - nfeEntrada) - ((nfeSaida * 0.05) * 0.12)) * 0.0365)}</span>
                                                    </div>
                                                    <div className="flex justify-between mb-2">
                                                        <span>IRPJ/CSLL (7.68% sobre Diferença)</span>
                                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((nfeSaida - nfeEntrada) * 0.0768)}</span>
                                                    </div>
                                                    <div className="flex justify-between pt-2 border-t border-purple-500/20 font-bold text-sm text-purple-400">
                                                        <span>Total Impostos:</span>
                                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(impostoCalculado)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Lista de Despesas Extras */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-xs font-bold text-white/50 uppercase">Outras Despesas</label>
                                        <button onClick={addDespesa} className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors">
                                            <Plus className="w-3 h-3" /> Adicionar
                                        </button>
                                    </div>

                                    {despesas.length === 0 ? (
                                        <div className="text-center p-4 border border-dashed border-white/10 rounded-xl text-xs text-white/30">
                                            Nenhuma despesa extra adicionada.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {despesas.map((d, index) => (
                                                <div key={index} className="flex gap-2 items-center bg-[#15151A] p-2 rounded-xl border border-white/5">
                                                    <input 
                                                        type="text" placeholder="Descrição" 
                                                        value={d.descricao} onChange={(e) => updateDespesa(index, 'descricao', e.target.value)}
                                                        className="flex-1 bg-transparent border-none text-xs text-white focus:ring-0 px-2"
                                                    />
                                                    <div className="relative w-24">
                                                        <div className="absolute left-2 top-1.5 text-white/50 text-xs">R$</div>
                                                        <input 
                                                            type="number" 
                                                            value={d.valor || ''} onChange={(e) => updateDespesa(index, 'valor', Number(e.target.value))}
                                                            className="w-full bg-white/5 border-none rounded text-xs text-white focus:ring-0 pl-6 py-1.5"
                                                        />
                                                    </div>
                                                    <button onClick={() => removeDespesa(index)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl mt-4">
                                    <div className="text-xs text-emerald-400 mb-1 font-bold">Resumo da Divisão de Lucro</div>
                                    <div className="text-sm text-white/80 mb-2">A divisão entre Alexandre e Wilson é sempre de <strong>50% / 50%</strong>. Todas as cobranças adicionais são repassadas ao cliente final ou deduzidas do lucro total.</div>
                                </div>

                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 2 && (
                    <div className="p-6 border-t border-white/5 flex items-center justify-between gap-3 bg-[#15151A] rounded-b-2xl">
                        {editandoId ? (
                            <button 
                                onClick={excluirNegocio}
                                disabled={salvando}
                                className="px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors text-xs font-bold flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Excluir
                            </button>
                        ) : (
                            <div></div> // Espaçador
                        )}
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl font-bold text-sm text-white/50 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={salvarNegocio}
                                disabled={salvando || (!veiculo && !nomeParceiro)}
                                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                            >
                                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Salvar Negócio Completo
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
