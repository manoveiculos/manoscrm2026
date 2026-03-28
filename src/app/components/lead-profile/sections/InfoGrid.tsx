'use client';
import React, { useState } from 'react';
import { Lead } from '../types';
import { formatPreco } from '@/lib/shared_utils/helpers';
import { Car, DollarSign, MapPin, Clock, ChevronRight, Pencil, Check, X, UserCircle2 } from 'lucide-react';

interface InfoGridProps {
    lead: Lead;
    isAdmin: boolean;
    onSave: (field: string, value: string) => Promise<void>;
    calcularTempoFunil: (date: string) => string;
    calcularDiffHoras: (date: string) => number;
}

function EditableRow({
    icon: Icon,
    label,
    value,
    field,
    isAdmin,
    onSave,
    valueColor,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    field: string;
    isAdmin: boolean;
    onSave: (field: string, value: string) => Promise<void>;
    valueColor?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [tmp, setTmp] = useState(value);
    const [saving, setSaving] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        if (field === 'valor_investimento') {
            const clean = val.replace(/\D/g, '');
            val = clean ? 'R$ ' + parseInt(clean).toLocaleString('pt-BR') : '';
        }
        setTmp(val);
    };

    const commit = async () => {
        setSaving(true);
        await onSave(field, tmp);
        setSaving(false);
        setEditing(false);
    };

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05] last:border-0 transition-colors ${
                isAdmin && !editing ? 'hover:bg-white/[0.03] cursor-pointer group' : ''
            } ${editing ? 'bg-white/[0.04]' : ''}`}
            onClick={() => isAdmin && !editing && setEditing(true)}
        >
            {/* Ícone */}
            <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                <Icon size={14} className="text-white/35" />
            </div>

            {/* Label + valor */}
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium mb-0.5">{label}</p>
                {editing ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            autoFocus
                            value={tmp}
                            onChange={handleChange}
                            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
                            className="flex-1 bg-white/[0.07] border border-white/15 rounded-md px-2 py-1 text-white text-[13px] outline-none min-w-0"
                        />
                        <button onClick={commit} disabled={saving} className="h-6 w-6 flex items-center justify-center rounded-md bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-all shrink-0">
                            {saving ? '…' : <Check size={10} />}
                        </button>
                        <button onClick={() => setEditing(false)} className="h-6 w-6 flex items-center justify-center rounded-md bg-white/[0.05] text-white/30 hover:text-white/60 transition-all shrink-0">
                            <X size={10} />
                        </button>
                    </div>
                ) : (
                    <p className="text-[14px] font-semibold truncate" style={{ color: valueColor || 'rgba(255,255,255,0.85)' }}>
                        {value || '—'}
                    </p>
                )}
            </div>

            {/* Indicador de editável */}
            {isAdmin && !editing && (
                <Pencil size={12} className="text-white/15 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
        </div>
    );
}

const cleanInterest = (str: string) => {
    if (!str) return 'Cotação';
    const words = str.split(/\s+/);
    const unique = words.filter((w, i) => w.toLowerCase() !== words[i - 1]?.toLowerCase());
    const cleaned = unique.join(' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
};

export const InfoGrid: React.FC<InfoGridProps> = ({ lead, isAdmin, onSave, calcularTempoFunil, calcularDiffHoras }) => {
    const tempoHoras = calcularDiffHoras(lead.created_at);
    const timeColor = tempoHoras < 24 ? '#10b981' : tempoHoras < 72 ? '#f59e0b' : '#ef4444';

    const valorRaw = lead.valor_investimento;
    const valorDisplay = valorRaw && valorRaw !== '0'
        ? formatPreco(
            parseFloat(String(valorRaw).replace(/\D/g, '')) > 1_000_000
                ? parseFloat(String(valorRaw).replace(/\D/g, '')) / 100
                : valorRaw
        )
        : 'Pendente';

    return (
        <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
            <EditableRow
                icon={Car}
                label="Interesse"
                value={cleanInterest(lead.vehicle_interest || lead.interesse || '')}
                field="interesse"
                isAdmin={true} // Todos podem editar
                onSave={onSave}
            />
            <EditableRow
                icon={DollarSign}
                label="Valor de Investimento"
                value={valorDisplay}
                field="valor_investimento"
                isAdmin={true} // Todos podem editar
                onSave={onSave}
            />
            <EditableRow
                icon={MapPin}
                label="Origem"
                value={lead.origem || lead.source || 'Social'}
                field="origem"
                isAdmin={isAdmin}
                onSave={onSave}
            />
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05]">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <UserCircle2 size={14} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium mb-0.5">Consultor Atual</p>
                    <p className="text-[14px] font-semibold text-white/85">
                        {lead.vendedor || lead.consultant_name || lead.primeiro_vendedor || 'Pendente'}
                    </p>
                </div>
            </div>
            <EditableRow
                icon={Car}
                label="Troca"
                value={lead.carro_troca || lead.troca || 'Não informado'}
                field="carro_troca"
                isAdmin={isAdmin}
                onSave={onSave}
            />
            {/* Tempo no CRM — somente leitura */}
            <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    <Clock size={14} className="text-white/35" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium mb-0.5">Tempo no CRM</p>
                    <p className="text-[14px] font-semibold" style={{ color: timeColor }}>
                        {calcularTempoFunil(lead.created_at)}
                    </p>
                </div>
            </div>
        </div>
    );
};
