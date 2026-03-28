import React, { useState, useEffect } from 'react';
import { Car, ShieldCheck, Loader2, Check, CheckCircle2 } from 'lucide-react';
import { Lead } from '../types';

interface TradeInTabProps {
    lead: Lead;
    onSaveField: (field: string, value: string) => Promise<void>;
}

interface FipeResult {
    fipe: string;
    mercado: string;
    base_pagamento: string;
    observacao: string;
}

export const TradeInTab: React.FC<TradeInTabProps> = ({ lead, onSaveField }) => {
    const [brand, setBrand] = useState('');
    const [modelName, setModelName] = useState('');
    const [year, setYear] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Efeito para decompor o carro_troca atual se vier como string única
    useEffect(() => {
        const fullCar = lead.carro_troca || lead.troca || '';
        if (fullCar) {
            // Tentativa simples de split: "Marca Modelo Ano"
            const parts = fullCar.split(' ');
            if (parts.length >= 2) {
                setBrand(parts[0]);
                const lastPart = parts[parts.length - 1];
                if (/^\d{4}$/.test(lastPart)) {
                    setYear(lastPart);
                    setModelName(parts.slice(1, -1).join(' '));
                } else {
                    setModelName(parts.slice(1).join(' '));
                    setYear('');
                }
            } else {
                setModelName(fullCar);
                setBrand('');
                setYear('');
            }
        }
    }, [lead.carro_troca, lead.troca]);

    const handleSaveTradeIn = async () => {
        const fullQuery = `${brand} ${modelName} ${year}`.trim();
        if (fullQuery.length < 3) return;

        setSaving(true);
        setSaved(false);
        try {
            await onSaveField('carro_troca', fullQuery);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Erro ao salvar veículo de troca:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="bg-[#141418] border border-white/[0.07] rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                            <Car size={20} className="text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-bold text-white">Veículo de Troca</h3>
                            <p className="text-[11px] text-white/35">Informe os detalhes para salvar no CRM</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-2 pt-1">
                    <div className="col-span-4 space-y-1.5">
                        <label className="text-[9px] text-white/40 uppercase tracking-widest font-semibold ml-1">Marca</label>
                        <input
                            type="text"
                            value={brand}
                            onChange={(e) => setBrand(e.target.value)}
                            placeholder="Ex: Fiat"
                            className="w-full bg-black/40 border border-white/[0.09] rounded-xl px-3 py-2.5 text-white text-[12px] outline-none focus:border-blue-500/40 transition-all placeholder:text-white/5"
                        />
                    </div>
                    <div className="col-span-5 space-y-1.5">
                        <label className="text-[9px] text-white/40 uppercase tracking-widest font-semibold ml-1">Modelo</label>
                        <input
                            type="text"
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            placeholder="Ex: Palio"
                            className="w-full bg-black/40 border border-white/[0.09] rounded-xl px-3 py-2.5 text-white text-[12px] outline-none focus:border-blue-500/40 transition-all placeholder:text-white/5"
                        />
                    </div>
                    <div className="col-span-3 space-y-1.5">
                        <label className="text-[9px] text-white/40 uppercase tracking-widest font-semibold ml-1">Ano</label>
                        <input
                            type="text"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="2015"
                            maxLength={4}
                            className="w-full bg-black/40 border border-white/[0.09] rounded-xl px-3 py-2.5 text-white text-[12px] outline-none focus:border-blue-500/40 transition-all placeholder:text-white/5 text-center"
                        />
                    </div>
                </div>

                <button 
                    onClick={handleSaveTradeIn}
                    disabled={saving || (!brand && !modelName)}
                    className={`w-full h-[44px] flex items-center justify-center gap-2 rounded-xl border transition-all font-bold text-[13px] ${
                        saved 
                        ? 'bg-green-500/20 border-green-500/40 text-green-400' 
                        : 'bg-blue-600/10 text-blue-400 border-blue-600/20 hover:bg-blue-600 hover:text-white'
                    } disabled:opacity-30`}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Check size={16} />}
                    {saving ? 'Salvando...' : saved ? 'Veículo Salvo!' : 'Salvar Veículo de Troca'}
                </button>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 flex gap-3">
                <ShieldCheck size={16} className="text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-200/60 leading-relaxed">
                    As informações de troca serão atualizadas na Visão Geral do lead e registradas na Timeline.
                </p>
            </div>
        </div>
    );
};
