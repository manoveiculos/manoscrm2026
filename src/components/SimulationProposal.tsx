'use client';

import React from 'react';
import { InventoryItem } from '@/lib/types';
import { Car, Fuel, Calendar, TrendingUp } from 'lucide-react';

interface SimulationProposalProps {
    car: InventoryItem;
    downPayment: number;
    financedAmount: number;
    installmentValue: number;
    installmentsCount: number;
}

const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0
    }).format(price);
};

const formatKM = (km: string | number | null) => {
    if (!km || km === '0') return 'N/A';
    if (typeof km === 'number') return `${km.toLocaleString('pt-BR')} KM`;
    const numericStr = km.toString().replace(/[^\d]/g, '');
    if (!numericStr) return 'N/A';
    return `${Number(numericStr).toLocaleString('pt-BR')} KM`;
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
    return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`; // High res
};

export const SimulationProposal = React.forwardRef<HTMLDivElement, SimulationProposalProps>(({
    car,
    downPayment,
    financedAmount,
    installmentValue,
    installmentsCount
}, ref) => {
    const imgSrc = car.imagem_url || getDriveImageUrl(car.drive_id);

    return (
        <div
            ref={ref}
            className="w-[1080px] h-[1920px] bg-black text-white flex flex-col font-sans relative overflow-hidden"
            style={{
                fontFamily: "'Inter', sans-serif",
                width: '1080px',
                height: '1920px',
            }}
        >
            {/* Background Gradient Layer */}
            <div
                className="absolute inset-0 z-0"
                style={{
                    backgroundImage: 'radial-gradient(circle at 50% 10%, #252525 0%, #000000 70%)'
                }}
            />

            {/* Decorative Grid */}
            <div className="absolute inset-0 opacity-[0.05] z-0"
                style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

            {/* Header / Logo */}
            <div className="pt-24 pb-12 px-20 flex justify-between items-center z-10">
                <img
                    src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png"
                    alt="Logo Manos"
                    className="h-28 w-auto brightness-200"
                    crossOrigin="anonymous"
                />
                <div className="text-right">
                    <p className="text-red-600 font-extrabold text-3xl uppercase tracking-[0.2em]">Proposta</p>
                    <p className="text-white/30 font-bold text-2xl uppercase tracking-widest">Digital</p>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-16 z-10 flex flex-col gap-10">
                {/* Hero Car Section */}
                <div className="relative w-full aspect-[4/3] rounded-[4rem] overflow-hidden shadow-[0_60px_120px_rgba(0,0,0,1)] border-4 border-white/10">
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10 opacity-70" />
                    {imgSrc ? (
                        <img
                            src={imgSrc}
                            alt={car.modelo}
                            className="w-full h-full object-cover"
                            crossOrigin="anonymous"
                        />
                    ) : (
                        <div className="w-full h-full bg-[#111] flex items-center justify-center">
                            <Car className="text-white/5" size={240} />
                        </div>
                    )}

                    {/* Badge on Image */}
                    <div className="absolute bottom-12 left-12 z-20 flex items-center gap-6">
                        <div className="bg-red-600 px-8 py-4 rounded-[2rem] font-extrabold text-5xl shadow-2xl">
                            {car.ano}
                        </div>
                        <div className="bg-black/80 px-8 py-4 rounded-[2rem] font-bold text-4xl border border-white/20">
                            {formatKM(car.km)}
                        </div>
                    </div>
                </div>

                {/* Car Info */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <p className="text-red-500 font-extrabold text-4xl uppercase tracking-[0.4em]">{car.marca}</p>
                        <div className="h-1 flex-1 bg-gradient-to-r from-red-600/50 to-transparent rounded-full" />
                    </div>
                    <h1 className="text-[120px] font-extrabold leading-[0.9] tracking-tighter uppercase drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                        {car.modelo}
                    </h1>
                </div>

                {/* Pricing Table Section */}
                <div className="mt-10 bg-white/[0.04] backdrop-blur-3xl rounded-[5rem] p-20 border border-white/10 shadow-3xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/10 blur-[100px] -z-10 rounded-full" />

                    <div className="absolute -top-12 left-20 bg-red-600 text-white px-12 py-7 rounded-[2.5rem] font-extrabold text-6xl shadow-[0_30px_60px_rgba(220,38,38,0.5)] border-t border-white/30">
                        {formatPrice(typeof car.preco === 'number' ? car.preco : parseFloat(String(car.preco).replace(/[^\d.,]/g, '').replace(',', '.')))}
                    </div>

                    <div className="grid grid-cols-2 gap-16 pt-20 pb-16 border-b border-white/10">
                        <div className="space-y-4">
                            <p className="text-white/30 text-3xl font-bold uppercase tracking-widest">Entrada</p>
                            <p className="text-6xl font-extrabold text-white">{formatPrice(downPayment)}</p>
                        </div>
                        <div className="space-y-4 text-right">
                            <p className="text-white/30 text-3xl font-bold uppercase tracking-widest">Saldo Financiado</p>
                            <p className="text-6xl font-extrabold text-white">{formatPrice(financedAmount)}</p>
                        </div>
                    </div>

                    <div className="pt-16 space-y-10 flex flex-col items-center">
                        <div className="bg-red-600/15 px-12 py-5 rounded-full border border-red-600/40">
                            <p className="text-4xl font-extrabold text-red-500 uppercase tracking-[0.5em]">Plano Recomendado</p>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-baseline gap-6">
                                <span className="text-white/30 font-extrabold text-7xl">{installmentsCount}X</span>
                                <span className="text-[220px] font-extrabold leading-none text-white tracking-tighter drop-shadow-[0_0_60px_rgba(255,255,255,0.15)]">
                                    {formatPrice(installmentValue)}
                                </span>
                            </div>
                            <p className="text-4xl font-extrabold text-white/20 uppercase tracking-[0.8em]">Fixas mensais</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Disclaimer & Branding */}
            <div className="pt-10 pb-24 px-20 z-10 flex flex-col items-center gap-12">
                <div className="bg-white/10 px-12 py-8 rounded-[3rem] border border-white/10 w-full">
                    <p className="text-3xl font-bold text-white/40 uppercase tracking-[0.2em] text-center leading-relaxed">
                        Aprovação de crédito sujeita a <span className="text-red-500">score</span>.<br />
                        Condições exclusivas para esta unidade.
                    </p>
                </div>

                <div className="flex flex-col items-center gap-8">
                    <div className="flex items-center gap-6">
                        <div className="h-px w-24 bg-gradient-to-r from-transparent to-white/20" />
                        <img
                            src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png"
                            alt="Logo Manos"
                            className="h-20 w-auto brightness-200 opacity-80"
                            crossOrigin="anonymous"
                        />
                        <div className="h-px w-24 bg-gradient-to-l from-transparent to-white/20" />
                    </div>
                </div>
            </div>
        </div>
    );
});

SimulationProposal.displayName = 'SimulationProposal';
