import React from 'react';
import { Search, Car, Zap } from 'lucide-react';
import { InventoryItem } from '../types';
import { formatPreco, formatKM } from '@/app/leads/utils/helpers';

interface ArsenalTabProps {
    lead: any;
    inventory: InventoryItem[];
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    showAllArsenal: boolean;
    setShowAllArsenal: (val: boolean) => void;
    handleVincularVeiculo: (vehicle: InventoryItem) => void;
    parsePrice: (price: any) => number;
}

export const ArsenalTab: React.FC<ArsenalTabProps> = ({
    lead,
    inventory,
    searchTerm,
    setSearchTerm,
    showAllArsenal,
    setShowAllArsenal,
    handleVincularVeiculo,
    parsePrice
}) => {
    const rawBudget = lead.valor_investimento || lead.estimated_ticket || 0;
    const budget = typeof rawBudget === 'string' ? parsePrice(rawBudget) : Number(rawBudget);

    const filtered = inventory.filter(car => {
        if (car.status?.toLowerCase() === 'vendido') return false;

        const matchesSearch =
            car.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
            car.modelo.toLowerCase().includes(searchTerm.toLowerCase());

        if (showAllArsenal || searchTerm.length > 0) return matchesSearch;

        if (budget > 1000) {
            const minBudget = budget * 0.8;
            const maxBudget = budget * 1.2;
            const carPrice = parsePrice(car.preco);
            return matchesSearch && carPrice >= minBudget && carPrice <= maxBudget;
        }

        return matchesSearch;
    }).sort((a, b) => {
        const interest = (lead.vehicle_interest || '').toLowerCase();
        const aMatch = interest && (a.modelo.toLowerCase().includes(interest) || a.marca.toLowerCase().includes(interest));
        const bMatch = interest && (b.modelo.toLowerCase().includes(interest) || b.marca.toLowerCase().includes(interest));

        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;

        return parsePrice(a.preco) - parsePrice(b.preco);
    });

    return (
        <div className="space-y-4 pb-10">
            {/* Barra de pesquisa */}
            <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                    type="text"
                    placeholder="Buscar por marca ou modelo..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-[#141418] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-white text-[13px] outline-none focus:border-white/20 transition-colors placeholder:text-white/20"
                />
            </div>

            {/* Info de budget */}
            {budget > 0 && !showAllArsenal && searchTerm.length === 0 && (
                <div className="flex items-center gap-2 px-1">
                    <Zap size={11} className="text-red-500 shrink-0" />
                    <span className="text-[11px] text-white/30">
                        Sugestões para investimento de <span className="text-white/70 font-semibold">{formatPreco(budget)}</span>
                    </span>
                </div>
            )}

            {/* Lista de veículos */}
            <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="h-14 w-14 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mx-auto mb-4">
                            <Car size={24} className="text-white/15" />
                        </div>
                        <p className="text-[13px] font-semibold text-white/40 mb-1">Nenhum veículo encontrado</p>
                        <p className="text-[11px] text-white/20 max-w-[240px] mx-auto leading-relaxed">
                            {showAllArsenal
                                ? 'Estoque vazio.'
                                : 'Nenhuma sugestão no range de ±20% do investimento.'}
                        </p>
                        {!showAllArsenal && (
                            <button
                                onClick={() => { setShowAllArsenal(true); setSearchTerm(''); }}
                                className="mt-4 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-[11px] text-white/50 hover:text-white/80 transition-colors"
                            >
                                Ver todo o estoque
                            </button>
                        )}
                    </div>
                ) : (
                    filtered.slice(0, 50).map((car, idx) => {
                        const carPrice = parsePrice(car.preco);
                        const isIdealMatch = budget > 0 && carPrice >= (budget * 0.9) && carPrice <= (budget * 1.1);
                        const isTextMatch = !!(lead.vehicle_interest || '') &&
                            (car.modelo.toLowerCase().includes((lead.vehicle_interest || '').toLowerCase()) ||
                             car.marca.toLowerCase().includes((lead.vehicle_interest || '').toLowerCase()));
                        const isHighlighted = isIdealMatch || isTextMatch;

                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors group ${isHighlighted ? 'bg-red-600/[0.03]' : ''}`}
                            >
                                {/* Ícone do carro */}
                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border ${isHighlighted ? 'bg-red-600/10 border-red-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                                    <Car size={16} className={isHighlighted ? 'text-red-400' : 'text-white/25'} />
                                </div>

                                {/* Info do veículo */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-[13px] font-semibold text-white truncate">
                                            {car.marca} {car.modelo}
                                        </p>
                                        {isIdealMatch && (
                                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded shrink-0">
                                                Match
                                            </span>
                                        )}
                                        {isTextMatch && !isIdealMatch && (
                                            <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">
                                                Desejado
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13px] font-bold text-red-400">{formatPreco(car.preco)}</span>
                                        <span className="text-white/20 text-[10px]">•</span>
                                        <span className="text-[11px] text-white/30">{car.ano} · {formatKM(car.km)}</span>
                                        <span className="text-white/15 text-[10px]">•</span>
                                        <span className="text-[10px] text-white/20">{car.combustivel}</span>
                                    </div>
                                </div>

                                {/* Botão vincular */}
                                <button
                                    onClick={() => handleVincularVeiculo(car)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shrink-0 ${
                                        isHighlighted
                                            ? 'bg-red-600/80 hover:bg-red-600 text-white border border-red-500/50'
                                            : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/50 hover:text-white border border-white/[0.07]'
                                    }`}
                                >
                                    Vincular
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {!showAllArsenal && searchTerm.length === 0 && filtered.length > 0 && (
                <div className="text-center pt-1">
                    <button
                        onClick={() => setShowAllArsenal(true)}
                        className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
                    >
                        + Ver restante do estoque
                    </button>
                </div>
            )}
        </div>
    );
};
