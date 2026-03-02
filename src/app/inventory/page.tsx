'use client';

import React, { useEffect, useState } from 'react';
import {
    Car,
    TrendingUp,
    Search,
    Filter,
    DollarSign,
    Calendar,
    Tag,
    Clock,
    Fuel,
    Calculator,
    AlertCircle,
    Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { InventoryItem } from '@/lib/types';
import { StatsCard } from '@/components/StatsCard';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};


const getDriveImageUrl = (driveId: string | undefined) => {
    if (!driveId) return null;
    let id = '';
    try {
        const ids = JSON.parse(driveId);
        id = Array.isArray(ids) ? ids[0] : driveId;
    } catch {
        id = driveId.replace(/[\[\]"]/g, '');
    }

    if (!id || id.length < 10) return null;
    return `https://lh3.googleusercontent.com/d/${id}`;
};


const formatKM = (km: string | number | null) => {
    if (!km || km === '0') return null;
    if (typeof km === 'number') return `${km.toLocaleString('pt-BR')} KM`;
    const numericStr = km.toString().replace(/[^\d]/g, '');
    if (!numericStr) return null;
    return `${Number(numericStr).toLocaleString('pt-BR')} KM`;
};

const formatPrice = (price: string | number | null | undefined) => {
    if (price === null || price === undefined) return 'Consulte';
    const numericPrice = typeof price === 'string'
        ? parseFloat(price.replace(/[^\d.,]/g, '').replace(',', '.'))
        : price;

    if (isNaN(numericPrice)) return 'Consulte';

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0
    }).format(numericPrice);
};

const cleanPriceForStats = (price: string | number | null | undefined) => {
    if (!price) return 0;
    if (typeof price === 'number') return price;
    return parseFloat(price.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
};

export default function InventoryPage() {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter] = useState<'all' | 'in_stock' | 'sold' | 'reserved'>('all');
    const [selectedCarForFinancing, setSelectedCarForFinancing] = useState<InventoryItem | null>(null);
    const [downPayment, setDownPayment] = useState<number>(0);

    useEffect(() => {
        async function loadInventory() {
            try {
                const data = await dataService.getInventory();
                setInventory(data);
            } catch (error) {
                console.error("Error loading inventory:", error);
            } finally {
                setLoading(false);
            }
        }
        loadInventory();
    }, []);

    const filteredInventory = inventory.filter(car => {
        const matchesSearch = car.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            car.marca.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filter === 'all' || car.status === filter;
        return matchesSearch && matchesFilter;
    });

    const stats = {
        total: inventory.length,
        inStock: inventory.filter(i => i.status === 'in_stock' || !i.status).length,
        totalValue: inventory.reduce((acc, i) => acc + cleanPriceForStats(i.preco), 0),
        soldRecent: inventory.filter(i => i.status === 'sold').length
    };

    const calculateInstallment = (totalPrice: number, entry: number, periods: number) => {
        const amountToFinance = totalPrice - entry;
        if (amountToFinance <= 0) return 0;
        const interestRate = 0.02; // 2% ao mês
        // PMT = P * (i * (1 + i)^n) / ((1 + i)^n - 1)
        const installment = amountToFinance * (interestRate * Math.pow(1 + interestRate, periods)) / (Math.pow(1 + interestRate, periods) - 1);
        return installment;
    };

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="relative">
                    <div className="h-16 w-16 border-4 border-red-500/20 rounded-full" />
                    <div className="h-16 w-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin absolute top-0" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 w-fit text-[10px] font-bold uppercase tracking-wider border border-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                        <Tag size={12} />
                        Gestão de Ativos
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white font-outfit">
                        Estoque <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-white to-red-600">Central</span>
                    </h1>
                    <p className="text-white/40 font-medium italic">Controle total dos veículos em tempo real com integração Supabase.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar modelo ou categoria..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-6 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/50 w-full md:w-80 transition-all font-medium"
                        />
                    </div>
                </div>
            </header>

            {/* Stats Grid */}
            <motion.section
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                <StatsCard
                    title="Total em Estoque"
                    value={stats.total}
                    trend={0}
                    icon={Car}
                    color="red"
                />
                <StatsCard
                    title="Disponíveis agora"
                    value={stats.inStock}
                    trend={0}
                    icon={Sparkles}
                    color="emerald"
                />
                <StatsCard
                    title="Valor de Estoque"
                    value={`R$ ${stats.totalValue.toLocaleString()}`}
                    trend={0}
                    icon={DollarSign}
                    color="emerald"
                />
                <StatsCard
                    title="Giro de Estoque"
                    value="0 dias"
                    trend={0}
                    icon={Clock}
                    color="red"
                />
            </motion.section>

            {/* Inventory List */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <p className="text-xs text-white/20 font-bold uppercase tracking-widest">
                        {filteredInventory.length} resultados encontrados
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <AnimatePresence mode='popLayout'>
                        {filteredInventory.map((car) => (
                            <motion.div
                                layout
                                key={car.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-[#141414] border border-white/5 overflow-hidden shadow-2xl hover:border-red-600/50 transition-all cursor-pointer flex flex-col group rounded-2xl"
                            >
                                {/* Car Image - Clickable for Calculator */}
                                <div
                                    className="aspect-[4/3] bg-black relative overflow-hidden cursor-pointer"
                                    onClick={() => {
                                        setSelectedCarForFinancing(car);
                                        setDownPayment(cleanPriceForStats(car.preco) * 0.3); // Sugestão de 30% de entrada
                                    }}
                                >
                                    <img
                                        src={car.imagem_url || getDriveImageUrl(car.drive_id) || `https://placehold.co/800x600/141414/ef4444.png?text=${encodeURIComponent(car.modelo)}`}
                                        alt={`${car.marca} ${car.modelo}`}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.onerror = null;
                                            target.src = `https://placehold.co/800x600/141414/ef4444.png?text=${encodeURIComponent(car.modelo)}`;
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent opacity-60" />

                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-2xl flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                                            <Calculator className="text-white" size={20} />
                                            <span className="text-white text-xs font-black uppercase tracking-widest">Simular Financiamento</span>
                                        </div>
                                    </div>

                                    {car.status && (
                                        <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">
                                            {car.status}
                                        </div>
                                    )}
                                </div>

                                <div className="bg-red-600 text-white inline-block px-5 py-2.5 font-black text-xl -mt-6 relative z-10 self-start ml-4 rounded-xl shadow-[0_8px_20px_rgba(220,38,38,0.4)]">
                                    {formatPrice(car.preco)}
                                </div>

                                <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">{car.marca}</span>
                                            <span className="w-1 h-1 rounded-full bg-white/10" />
                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.1em]">{car.ano}</span>
                                        </div>
                                        <h4 className="font-black text-lg uppercase tracking-tight text-white group-hover:text-red-500 transition-colors line-clamp-2 leading-tight">
                                            {car.modelo}
                                        </h4>
                                        <p className="text-[11px] text-white/50 uppercase font-bold line-clamp-2 mt-2 min-h-[2.5em] leading-relaxed">
                                            {car.descricao || `${car.ano} • ${formatKM(car.km)} • ${car.combustivel || 'FLEX'}`}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-6 border-t border-white/5">
                                        {formatKM(car.km) && (
                                            <div className="flex items-center gap-3 text-[10px] text-white font-black uppercase">
                                                <TrendingUp size={16} className="text-red-500" />
                                                <span className="tracking-widest">{formatKM(car.km)}</span>
                                            </div>
                                        )}
                                        {car.cambio && (
                                            <div className="flex items-center gap-3 text-[10px] text-white font-black uppercase text-right justify-end">
                                                <Filter size={16} className="text-red-500" />
                                                <span className="tracking-widest">{car.cambio}</span>
                                            </div>
                                        )}
                                        {car.ano && (
                                            <div className="flex items-center gap-3 text-[10px] text-white font-black uppercase">
                                                <Calendar size={16} className="text-red-500" />
                                                <span className="tracking-widest">{car.ano}</span>
                                            </div>
                                        )}
                                        {car.combustivel && (
                                            <div className="flex items-center gap-3 text-[10px] text-white font-black uppercase text-right justify-end">
                                                <Fuel size={16} className="text-red-500" />
                                                <span className="tracking-widest">{car.combustivel}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="h-1.5 w-full bg-red-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {filteredInventory.length === 0 && (
                    <div className="bg-white border border-gray-100 p-20 text-center space-y-4 rounded-3xl">
                        <AlertCircle className="mx-auto text-gray-200" size={48} />
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-gray-900">Nenhum veículo encontrado</h3>
                            <p className="text-sm text-gray-400">Tente ajustar sua busca ou filtros para encontrar o que procura.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Financing Calculator Modal */}
            <AnimatePresence>
                {selectedCarForFinancing && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedCarForFinancing(null)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-[#141414] border border-white/10 w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 flex flex-col md:flex-row"
                        >
                            {/* Left Side: Car Info */}
                            <div className="w-full md:w-5/12 bg-black relative">
                                <img
                                    src={selectedCarForFinancing.imagem_url || getDriveImageUrl(selectedCarForFinancing.drive_id) || ''}
                                    className="w-full h-full object-cover"
                                    alt={selectedCarForFinancing.modelo}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                                <div className="absolute bottom-6 left-6 right-6">
                                    <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">{selectedCarForFinancing.marca}</p>
                                    <h3 className="text-white font-black text-xl uppercase tracking-tighter leading-tight mt-1">{selectedCarForFinancing.modelo}</h3>
                                    <p className="text-white/60 text-lg font-black mt-2">{formatPrice(selectedCarForFinancing.preco)}</p>
                                </div>
                            </div>

                            {/* Right Side: Calculator */}
                            <div className="flex-1 p-8 space-y-6 bg-[#141414] flex flex-col justify-center">
                                <div className="text-center space-y-1 mb-2">
                                    <h2 className="text-white font-black text-xs uppercase tracking-[0.3em]">Simulador de financiamento</h2>
                                    <p className="text-white/20 text-[8px] font-bold uppercase tracking-widest">Escolha sua entrada e veja as parcelas</p>
                                </div>

                                <div className="space-y-6 flex-1">
                                    {/* Entry Section - Compact & Double Values */}
                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-3 shadow-inner relative overflow-hidden">
                                        <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-3">
                                            <div className="space-y-1">
                                                <p className="text-red-500 text-[8px] font-black uppercase tracking-[0.2em]">Sua Entrada</p>
                                                <div className="relative flex items-baseline gap-1">
                                                    <span className="text-white/20 font-black text-[10px] uppercase">R$</span>
                                                    <input
                                                        type="text"
                                                        value={downPayment.toLocaleString('pt-BR')}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '');
                                                            setDownPayment(Number(val));
                                                        }}
                                                        className="bg-transparent text-white font-black text-xl focus:outline-none w-full tracking-tighter"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1 text-right">
                                                <p className="text-white/40 text-[8px] font-black uppercase tracking-[0.2em]">Valor Financiado</p>
                                                <div className="flex items-baseline justify-end gap-1">
                                                    <span className="text-white/20 font-black text-[10px] uppercase">R$</span>
                                                    <input
                                                        type="text"
                                                        value={(cleanPriceForStats(selectedCarForFinancing.preco) - downPayment).toLocaleString('pt-BR')}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '');
                                                            const total = cleanPriceForStats(selectedCarForFinancing.preco);
                                                            const newDownPayment = total - Number(val);
                                                            setDownPayment(Math.max(0, Math.min(total, newDownPayment)));
                                                        }}
                                                        className="bg-transparent text-white font-black text-xl text-right focus:outline-none w-full tracking-tighter"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <p className="text-white/20 text-[7px] font-black uppercase tracking-widest italic animate-pulse text-center">
                                            <span className="text-red-500">→</span> movimente a barra para simular <span className="text-red-500">←</span>
                                        </p>

                                        <div className="relative h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-900 via-red-600 to-red-400 transition-all duration-300"
                                                style={{ width: `${(downPayment / cleanPriceForStats(selectedCarForFinancing.preco)) * 100}%` }}
                                            />
                                            <input
                                                type="range"
                                                min="0"
                                                max={cleanPriceForStats(selectedCarForFinancing.preco)}
                                                step="500"
                                                value={downPayment}
                                                onChange={(e) => setDownPayment(Number(e.target.value))}
                                                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                        </div>
                                    </div>

                                    {/* All possibilities Table */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                            <p className="text-white/40 text-[9px] font-black uppercase tracking-widest">Opções de Financiamento</p>
                                            <p className="text-white/20 text-[8px] font-bold uppercase">Parcelas Fixas</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[12, 24, 36, 48, 60].map((m) => {
                                                const installment = calculateInstallment(cleanPriceForStats(selectedCarForFinancing.preco), downPayment, m);
                                                const isHighlight = m === 48;
                                                return (
                                                    <div
                                                        key={m}
                                                        className={`flex items-center justify-between px-5 py-3 rounded-2xl border transition-all group ${isHighlight
                                                            ? 'bg-red-600/10 border-red-600/30 shadow-[0_0_15px_rgba(220,38,38,0.1)]'
                                                            : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isHighlight ? 'text-red-500' : 'text-white/40 group-hover:text-red-500'
                                                            }`}>
                                                            {m} Parcelas
                                                        </span>
                                                        <div className="text-right">
                                                            <span className={`text-lg font-black tracking-tight transition-colors ${isHighlight ? 'text-red-500' : 'text-white'
                                                                }`}>
                                                                {formatPrice(installment)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4">
                                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 backdrop-blur-sm">
                                        <p className="text-[9px] font-black text-white/50 uppercase tracking-widest text-center leading-relaxed">
                                            Simulação sujeita a <span className="text-red-500">aprovação de crédito</span><br />
                                            e análise de <span className="text-red-500">score</span> pelo banco parceiro.
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-center gap-3">
                                        <img
                                            src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png"
                                            alt="Logo Manos"
                                            className="h-10 w-auto opacity-100 brightness-110"
                                        />
                                        <div className="h-0.5 w-12 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
