'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    CarFront, Search, DollarSign, Fuel, TrendingUp, Calculator,
    Gauge, Filter, X, Sparkles, Tag, ChevronDown, ArrowRight,
    Zap, LayoutGrid, List as ListIcon, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { InventoryItem } from '@/lib/types';

// ── Animation Variants ────────────────────────────────────────
const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};
const item = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0 }
};

// ── Utility Helpers ───────────────────────────────────────────
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
    return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
};

const formatKM = (km: string | number | null) => {
    if (!km || km === '0') return null;
    const n = typeof km === 'number' ? km : Number(km.toString().replace(/[^\d]/g, ''));
    return `${n.toLocaleString('pt-BR')} km`;
};

const formatPrice = (price: string | number | null | undefined) => {
    if (price === null || price === undefined) return 'Consulte';
    const n = typeof price === 'string'
        ? parseFloat(price.replace(/[^\d.,]/g, '').replace(',', '.'))
        : price;
    if (isNaN(n)) return 'Consulte';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
};

const cleanPrice = (price: string | number | null | undefined): number => {
    if (!price) return 0;
    if (typeof price === 'number') return price;
    return parseFloat(price.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
};

const calcInstallment = (total: number, entry: number, periods: number) => {
    const amt = total - entry;
    if (amt <= 0) return 0;
    const r = 0.0199; // ~2% a.m.
    return amt * (r * Math.pow(1 + r, periods)) / (Math.pow(1 + r, periods) - 1);
};

// ── Car Image ─────────────────────────────────────────────────
const CarImage = ({ car, className = '' }: { car: InventoryItem; className?: string }) => {
    const [error, setError] = useState(false);
    const src = car.imagem_url || getDriveImageUrl(car.drive_id);
    if (!src || error) return (
        <div className={`w-full h-full bg-gradient-to-br from-[#0d0d10] to-[#1a1a20] flex flex-col items-center justify-center gap-3 ${className}`}>
            <CarFront className="text-white/8" size={52} />
            <span className="text-white/15 text-[9px] font-black uppercase tracking-widest text-center px-4">{car.marca} {car.modelo}</span>
        </div>
    );
    return (
        <img src={src} alt={`${car.marca} ${car.modelo}`}
            className={`w-full h-full object-cover ${className}`}
            referrerPolicy="no-referrer" onError={() => setError(true)} />
    );
};

// ── Simulation Panel (slide from right) ──────────────────────
const SimulationPanel = ({ car, onClose, onSold }: { car: InventoryItem; onClose: () => void; onSold?: () => void }) => {
    const [downPayment, setDownPayment] = useState(() => Math.round(cleanPrice(car.preco) * 0.3));
    const [mounted, setMounted] = useState(false);
    const [markingState, setMarkingState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    useEffect(() => { setMounted(true); return () => setMounted(false); }, []);

    const handleMarkSold = async () => {
        if (markingState !== 'idle') return;
        setMarkingState('loading');
        try {
            const res = await fetch('/api/v2/inventory/sold-notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: car.id,
                    vehicleName: `${car.marca} ${car.modelo}`,
                    vehicleModel: car.modelo,
                }),
            });
            if (!res.ok) throw new Error('Erro ao marcar como vendido');
            setMarkingState('done');
            onSold?.();
        } catch {
            setMarkingState('error');
        }
    };

    const totalPrice = cleanPrice(car.preco);
    const financed = Math.max(0, totalPrice - downPayment);
    const pctEntry = totalPrice > 0 ? (downPayment / totalPrice) * 100 : 0;

    const INSTALLMENTS = [12, 24, 36, 48, 60];

    const gerarMensagem = (parcelas: number) => {
        const inst = calcInstallment(totalPrice, downPayment, parcelas);
        const msg = `🚗 *Simulação de Financiamento — Manos Veículos*\n\n` +
            `*Veículo:* ${car.marca} ${car.modelo} ${car.ano}\n` +
            `*Valor:* ${formatPrice(totalPrice)}\n` +
            `*Entrada:* ${formatPrice(downPayment)} (${Math.round(pctEntry)}%)\n` +
            `*Financiado:* ${formatPrice(financed)}\n` +
            `*Parcelas:* ${parcelas}x de ${formatPrice(inst)}\n\n` +
            `⚠️ _Simulação sujeita a aprovação de crédito. Taxa: ~2% a.m._\n\n` +
            `Posso te ajudar com mais detalhes? 😊`;
        return encodeURIComponent(msg);
    };

    const panel = (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9998] flex justify-end">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
                />
                {/* Panel */}
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                    className="fixed top-0 right-0 h-screen w-[460px] max-w-[95vw] bg-[#111114] border-l border-white/[0.07] shadow-2xl z-[9999] flex flex-col overflow-hidden"
                >
                    {/* Vehicle Hero */}
                    <div className="relative h-56 shrink-0 overflow-hidden">
                        <CarImage car={car} className="transition-transform duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-[#111114]/50 to-transparent" />

                        {/* Close */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all"
                        >
                            <X size={14} />
                        </button>

                        {/* Vehicle Info Overlay */}
                        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
                            <div>
                                <p className="text-red-500 text-[9px] font-black uppercase tracking-[0.3em]">{car.marca}</p>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight leading-tight">{car.modelo}</h2>
                                <p className="text-white/40 text-[11px] font-medium mt-0.5">
                                    {car.ano}{formatKM(car.km) ? ` • ${formatKM(car.km)}` : ''}{car.combustivel ? ` • ${car.combustivel}` : ''}
                                </p>
                            </div>
                            <div className="bg-red-600 text-white px-4 py-2 rounded-xl font-black text-lg shadow-[0_8px_25px_rgba(220,38,38,0.4)]">
                                {formatPrice(car.preco)}
                            </div>
                        </div>
                    </div>

                    {/* Calculator Body */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5">

                        {/* Header */}
                        <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-red-600/15 border border-red-500/20 flex items-center justify-center">
                                <Calculator size={13} className="text-red-400" />
                            </div>
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em]">Simulador de Financiamento</span>
                        </div>

                        {/* Entry Card */}
                        <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.07] space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em]">Entrada</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-white/25 font-black text-xs">R$</span>
                                        <input
                                            type="text"
                                            value={downPayment.toLocaleString('pt-BR')}
                                            onChange={(e) => {
                                                const v = e.target.value.replace(/\D/g, '');
                                                setDownPayment(Math.min(Number(v), totalPrice));
                                            }}
                                            className="bg-transparent text-white font-black text-xl focus:outline-none w-full tracking-tighter"
                                        />
                                    </div>
                                    <p className="text-[9px] text-white/25 font-medium">{Math.round(pctEntry)}% do valor</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Financiado</p>
                                    <p className="text-white font-black text-xl tracking-tighter">{formatPrice(financed)}</p>
                                    <p className="text-[9px] text-white/25 font-medium">{Math.round(100 - pctEntry)}% do valor</p>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-1.5">
                                <div className="relative h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                                    <div
                                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-700 via-red-500 to-red-400 rounded-full transition-all duration-200"
                                        style={{ width: `${Math.min(pctEntry, 100)}%` }}
                                    />
                                    <input type="range" min="0" max={totalPrice} step="500"
                                        value={downPayment}
                                        onChange={(e) => setDownPayment(Number(e.target.value))}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </div>
                                <p className="text-center text-white/15 text-[8px] font-black uppercase tracking-widest">arraste para ajustar</p>
                            </div>
                        </div>

                        {/* Installment Options */}
                        <div className="space-y-2">
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Opções de Parcela</p>
                            <div className="space-y-1.5">
                                {INSTALLMENTS.map((m) => {
                                    const inst = calcInstallment(totalPrice, downPayment, m);
                                    const isPopular = m === 48;
                                    return (
                                        <div key={m} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                                            isPopular
                                                ? 'bg-red-600/8 border-red-600/25'
                                                : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]'
                                        }`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[11px] font-black uppercase tracking-widest ${isPopular ? 'text-red-400' : 'text-white/40'}`}>
                                                    {m}x
                                                </span>
                                                {isPopular && (
                                                    <span className="text-[7px] font-black bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Popular</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[13px] font-black tracking-tight ${isPopular ? 'text-red-400' : 'text-white'}`}>
                                                    {formatPrice(inst)}
                                                </span>
                                                {/* Enviar via WhatsApp */}
                                                <a
                                                    href={`https://wa.me/?text=${gerarMensagem(m)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Enviar simulação via WhatsApp"
                                                    className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-all"
                                                >
                                                    <Share2 size={11} />
                                                </a>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Marcar Vendido */}
                        {car.status !== 'sold' && (
                            <div className="border-t border-white/[0.06] pt-4">
                                <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.2em] mb-2">Gestão do Veículo</p>
                                <button
                                    onClick={handleMarkSold}
                                    disabled={markingState !== 'idle'}
                                    className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all border flex items-center justify-center gap-2 ${
                                        markingState === 'done'
                                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 cursor-default'
                                            : markingState === 'error'
                                            ? 'bg-red-500/15 border-red-500/30 text-red-400 cursor-default'
                                            : markingState === 'loading'
                                            ? 'bg-white/5 border-white/10 text-white/30 cursor-wait'
                                            : 'bg-red-600/10 border-red-600/25 text-red-400 hover:bg-red-600/20 hover:border-red-500/40'
                                    }`}
                                >
                                    {markingState === 'loading' && (
                                        <span className="h-3.5 w-3.5 border-2 border-t-transparent border-current rounded-full animate-spin" />
                                    )}
                                    {markingState === 'done' ? 'Vendido — Consultores Notificados' : markingState === 'error' ? 'Erro — Tente Novamente' : 'Marcar como Vendido'}
                                </button>
                                {markingState === 'done' && (
                                    <p className="text-[8px] text-emerald-400/60 text-center mt-1.5 font-medium">
                                        Alertas criados no Cowork IA para consultores com leads interessados.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Disclaimer */}
                        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-center">
                            <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-relaxed">
                                Simulação sujeita a <span className="text-red-500/60">aprovação de crédito</span> e análise de <span className="text-red-500/60">score</span>. Taxa: ~2% a.m.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );

    if (mounted && typeof document !== 'undefined') {
        return createPortal(panel, document.body);
    }
    return null;
};

// ── Vehicle Card ──────────────────────────────────────────────
const VehicleCard = ({ car, onClick }: { car: InventoryItem; onClick: () => void }) => {
    const isSold = car.status === 'sold';
    const isReserved = car.status === 'reserved';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileHover={{ y: -6 }}
            onClick={!isSold ? onClick : undefined}
            className={`rounded-[2rem] bg-white/[0.03] border border-white/[0.07] overflow-hidden shadow-xl transition-all group relative ${
                isSold ? 'opacity-50 cursor-not-allowed' : 'hover:border-red-500/30 cursor-pointer'
            }`}
        >
            {/* Image */}
            <div className="aspect-[16/10] relative overflow-hidden bg-[#0d0d10]">
                <CarImage car={car} className="transition-transform duration-700 group-hover:scale-105 opacity-75 group-hover:opacity-100" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-transparent to-transparent opacity-90" />

                {/* Status Badge */}
                {(isSold || isReserved) && (
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-black/60 backdrop-blur-md border border-white/10 text-white/80 z-10">
                        {isSold ? 'Vendido' : 'Reservado'}
                    </div>
                )}

                {/* Price Tag */}
                <div className="absolute bottom-3 left-3 bg-red-600 text-white px-4 py-1.5 rounded-xl font-black text-[15px] shadow-[0_8px_20px_rgba(220,38,38,0.45)] z-10">
                    {formatPrice(car.preco)}
                </div>

                {/* Hover CTA */}
                {!isSold && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                        <div className="bg-black/50 backdrop-blur-xl border border-white/15 px-5 py-2.5 rounded-2xl flex items-center gap-2 translate-y-4 group-hover:translate-y-0 transition-transform">
                            <Calculator size={14} className="text-white" />
                            <span className="text-white text-[10px] font-black uppercase tracking-widest">Simular</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Details */}
            <div className="p-5 space-y-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em]">{car.marca}</span>
                        <span className="w-1 h-1 rounded-full bg-white/10" />
                        <span className="text-[9px] font-black text-white/25 uppercase tracking-[0.15em]">{car.ano}</span>
                    </div>
                    <h3 className="font-black text-[15px] text-white uppercase tracking-tight leading-tight group-hover:text-red-400 transition-colors line-clamp-1">
                        {car.modelo}
                    </h3>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.05]">
                    {formatKM(car.km) && (
                        <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-semibold">
                            <Gauge size={11} className="text-red-500/50 shrink-0" />
                            <span>{formatKM(car.km)}</span>
                        </div>
                    )}
                    {car.cambio && (
                        <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-semibold">
                            <Tag size={11} className="text-red-500/50 shrink-0" />
                            <span className="uppercase">{car.cambio}</span>
                        </div>
                    )}
                    {car.combustivel && (
                        <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-semibold">
                            <Fuel size={11} className="text-red-500/50 shrink-0" />
                            <span className="uppercase">{car.combustivel}</span>
                        </div>
                    )}
                    {car.cor && (
                        <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-semibold">
                            <div className="w-2.5 h-2.5 rounded-full bg-white/15 border border-white/10 shrink-0" />
                            <span className="uppercase truncate">{car.cor}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom accent line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-red-600 to-red-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
        </motion.div>
    );
};

// ── Main Page ─────────────────────────────────────────────────
export default function InventoryV2() {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterBrand, setFilterBrand] = useState('all');
    const [filterFuel, setFilterFuel] = useState('all');
    const [sortBy, setSortBy] = useState<'recent' | 'price_asc' | 'price_desc' | 'km_asc'>('recent');
    const [selectedCar, setSelectedCar] = useState<InventoryItem | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        dataService.getInventory()
            .then(setInventory)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const brands = useMemo(() => Array.from(new Set(inventory.map(c => c.marca).filter(Boolean))).sort(), [inventory]);
    const fuels = useMemo(() => Array.from(new Set(inventory.map(c => c.combustivel).filter(Boolean))).sort(), [inventory]);

    const filtered = useMemo(() => {
        let items = inventory.filter(car => {
            const q = searchTerm.toLowerCase();
            const matchSearch = !q || car.modelo.toLowerCase().includes(q) || car.marca.toLowerCase().includes(q) || (car.ano?.toString() || '').includes(q) || (car.cor || '').toLowerCase().includes(q);
            const matchBrand = filterBrand === 'all' || car.marca === filterBrand;
            const matchFuel = filterFuel === 'all' || car.combustivel === filterFuel;
            return matchSearch && matchBrand && matchFuel;
        });
        switch (sortBy) {
            case 'price_asc': items.sort((a, b) => cleanPrice(a.preco) - cleanPrice(b.preco)); break;
            case 'price_desc': items.sort((a, b) => cleanPrice(b.preco) - cleanPrice(a.preco)); break;
            case 'km_asc': items.sort((a, b) => (Number(a.km) || 999999) - (Number(b.km) || 999999)); break;
        }
        return items;
    }, [inventory, searchTerm, filterBrand, filterFuel, sortBy]);

    const stats = useMemo(() => ({
        total: inventory.length,
        available: inventory.filter(i => !i.status || i.status === 'in_stock').length,
        totalValue: inventory.reduce((s, i) => s + cleanPrice(i.preco), 0),
        avgPrice: inventory.length ? inventory.reduce((s, i) => s + cleanPrice(i.preco), 0) / inventory.length : 0,
    }), [inventory]);

    if (loading) return (
        <div className="flex h-[80vh] items-center justify-center">
            <div className="h-16 w-16 border-4 border-t-transparent border-red-500 rounded-full animate-spin shadow-[0_0_30px_rgba(239,68,68,0.3)]" />
        </div>
    );

    return (
        <div className="w-full space-y-6 pb-32 pt-0 px-2 md:px-0">

            {/* ── HUD HEADER ──────────────────────────────── */}
            <header className="border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 px-6 py-3 -mx-2 md:-mx-0 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                {/* Left: identity + stats */}
                <div className="flex items-center gap-5">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <CarFront size={14} className="text-red-600" />
                            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/90">
                                Arsenal <span className="text-red-500">de Veículos</span>
                            </h1>
                        </div>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-0.5">V2.5 // Estoque Inteligente</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-1">
                        <div className="h-6 w-[1px] bg-white/5 mr-3" />
                        <span className="text-xs font-black text-white/70 tabular-nums">{stats.total}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">estoque</span>
                        <span className="w-px h-3 bg-white/10 mx-2" />
                        <span className="text-xs font-black text-emerald-400 tabular-nums">{stats.available}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">disponíveis</span>
                        <span className="w-px h-3 bg-white/10 mx-2" />
                        <span className="text-xs font-black text-amber-400 tabular-nums">{formatPrice(stats.totalValue)}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">total</span>
                    </div>
                </div>

                {/* Right: search */}
                <div className="flex items-center gap-2">
                    <div className="relative group/s">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within/s:text-red-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="BUSCAR..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-[10px] font-black uppercase tracking-widest w-40 focus:w-56 focus:bg-white/10 focus:border-red-500/30 outline-none transition-all placeholder:text-white/10"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Stats Cards ─────────────────────────────────── */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
                {[
                    { label: 'Em Estoque', value: stats.total, icon: CarFront, color: 'red' },
                    { label: 'Disponíveis', value: stats.available, icon: Sparkles, color: 'emerald' },
                    { label: 'Ticket Médio', value: formatPrice(stats.avgPrice), icon: DollarSign, color: 'amber' },
                    { label: 'Valor Total', value: formatPrice(stats.totalValue), icon: TrendingUp, color: 'blue' },
                ].map((s, i) => (
                    <motion.div
                        key={i}
                        variants={item}
                        whileHover={{ y: -8 }}
                        className="p-5 md:p-6 rounded-[2rem] premium-glass border-white/5 relative overflow-hidden group/stat"
                    >
                        <div className={`absolute top-0 right-0 w-24 h-24 bg-${s.color}-500/5 blur-[40px] -mr-8 -mt-8 group-hover/stat:bg-${s.color}-500/10 transition-all pointer-events-none`} />
                        <div className={`h-10 w-10 rounded-xl bg-${s.color}-500/10 text-${s.color}-500 flex items-center justify-center mb-4 relative z-10`}>
                            <s.icon size={20} />
                        </div>
                        <p className="text-xl md:text-2xl font-black text-white tabular-nums relative z-10 leading-none">{s.value}</p>
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.2em] mt-1.5 relative z-10">{s.label}</p>
                    </motion.div>
                ))}
            </motion.div>

            {/* ── Filters Bar ─────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Brand */}
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
                    <Filter size={12} className="text-red-500 shrink-0" />
                    <select
                        value={filterBrand}
                        onChange={e => setFilterBrand(e.target.value)}
                        className="bg-transparent text-[11px] font-black uppercase tracking-wider text-white focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="all" className="bg-[#111114]">Todas Marcas</option>
                        {brands.map(b => <option key={b} value={b} className="bg-[#111114]">{b}</option>)}
                    </select>
                    <ChevronDown size={10} className="text-white/30 shrink-0" />
                </div>

                {/* Fuel */}
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
                    <Fuel size={12} className="text-red-500 shrink-0" />
                    <select
                        value={filterFuel}
                        onChange={e => setFilterFuel(e.target.value)}
                        className="bg-transparent text-[11px] font-black uppercase tracking-wider text-white focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="all" className="bg-[#111114]">Combustível</option>
                        {fuels.map(f => <option key={f} value={f!} className="bg-[#111114]">{f}</option>)}
                    </select>
                    <ChevronDown size={10} className="text-white/30 shrink-0" />
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
                    <TrendingUp size={12} className="text-red-500 shrink-0" />
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as typeof sortBy)}
                        className="bg-transparent text-[11px] font-black uppercase tracking-wider text-white focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="recent" className="bg-[#111114]">Mais Recentes</option>
                        <option value="price_asc" className="bg-[#111114]">Menor Preço</option>
                        <option value="price_desc" className="bg-[#111114]">Maior Preço</option>
                        <option value="km_asc" className="bg-[#111114]">Menor KM</option>
                    </select>
                    <ChevronDown size={10} className="text-white/30 shrink-0" />
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-1 ml-auto bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`h-7 w-7 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-red-600/20 text-red-400' : 'text-white/30 hover:text-white/60'}`}
                    >
                        <LayoutGrid size={13} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`h-7 w-7 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-red-600/20 text-red-400' : 'text-white/30 hover:text-white/60'}`}
                    >
                        <ListIcon size={13} />
                    </button>
                </div>

                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">
                    {filtered.length} veículos
                </span>
            </div>

            {/* ── Vehicle Grid ─────────────────────────────────── */}
            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    <AnimatePresence mode="popLayout">
                        {filtered.map(car => (
                            <VehicleCard key={car.id} car={car} onClick={() => setSelectedCar(car)} />
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                /* List View */
                <div className="space-y-2">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((car, i) => (
                            <motion.div
                                key={car.id}
                                layout
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 12 }}
                                transition={{ delay: Math.min(i * 0.02, 0.2) }}
                                onClick={() => setSelectedCar(car)}
                                className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-red-500/25 hover:bg-white/[0.05] transition-all cursor-pointer group"
                            >
                                {/* Thumb */}
                                <div className="h-16 w-24 rounded-xl overflow-hidden shrink-0 bg-[#0d0d10]">
                                    <CarImage car={car} className="group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100" />
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em]">{car.marca} · {car.ano}</p>
                                    <h4 className="font-black text-[14px] text-white uppercase truncate group-hover:text-red-400 transition-colors">{car.modelo}</h4>
                                    <div className="flex items-center gap-3 mt-1">
                                        {formatKM(car.km) && <span className="text-[10px] text-white/35 font-medium flex items-center gap-1"><Gauge size={9} />{formatKM(car.km)}</span>}
                                        {car.combustivel && <span className="text-[10px] text-white/35 font-medium uppercase">{car.combustivel}</span>}
                                        {car.cambio && <span className="text-[10px] text-white/35 font-medium uppercase">{car.cambio}</span>}
                                    </div>
                                </div>
                                {/* Price + CTA */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right">
                                        <p className="font-black text-white text-[15px]">{formatPrice(car.preco)}</p>
                                        {car.status && car.status !== 'in_stock' && (
                                            <span className="text-[9px] text-white/30 uppercase font-black">{car.status === 'sold' ? 'Vendido' : 'Reservado'}</span>
                                        )}
                                    </div>
                                    <div className="h-8 w-8 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-400 group-hover:bg-red-600 group-hover:text-white transition-all">
                                        <ArrowRight size={14} />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Empty State */}
            {filtered.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-32 text-center rounded-[3rem] premium-glass border-white/5"
                >
                    <CarFront size={56} className="mx-auto text-white/5 mb-6" />
                    <h3 className="text-2xl font-black text-white/60 uppercase tracking-[0.2em]">Nenhum veículo</h3>
                    <p className="text-white/20 font-medium mt-2 text-sm">Tente ajustar os filtros ou a busca.</p>
                </motion.div>
            )}

            {/* ── Simulation Panel ──────────────────────────────── */}
            <AnimatePresence>
                {selectedCar && (
                    <SimulationPanel
                        car={selectedCar}
                        onClose={() => setSelectedCar(null)}
                        onSold={() => {
                            setInventory(prev => prev.map(c => c.id === selectedCar.id ? { ...c, status: 'sold' } : c));
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
