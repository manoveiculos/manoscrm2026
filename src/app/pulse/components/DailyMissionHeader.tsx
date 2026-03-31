'use client';

import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Clock, Trophy, Activity, Users, Zap, Flame, Target, TrendingUp, Brain } from 'lucide-react';

interface DailyMissionHeaderProps {
    userName: string;
    salesCount: number;
    leadCount: number;
    avgResponseTime?: number;
    responseRate?: number;
    userRole?: 'admin' | 'consultant';
}

const PERIOD_REPERTOIRE = {
    morning: {
        phrases: [
            "Bom dia, campeão! O sucesso começa agora. Primeiro a chegar, primeiro a vender.",
            "O sol nasceu e os leads também. Velocidade é tudo nas primeiras horas.",
            "Quem domina a manhã, domina o dia. Bora pra cima!",
            "Energia total! Sua meta de hoje começa com o primeiro contato de agora.",
            "Café na xícara e foco no CRM. O mercado recompensa quem acorda cedo.",
            "Leads da madrugada estão esfriando. Aqueça-os agora!",
            "Oportunidades batem à porta de quem já está trabalhando.",
            "Sua mentalidade matinal define seus resultados noturnos.",
            "A primeira hora define o ritmo. Comece com velocidade máxima.",
            "Novo dia, novos leads, mesma fome de fechamento.",
            "A disciplina de hoje é o lucro de amanhã. Vamos!",
            "Não espere o lead chamar. Seja o protagonista da abordagem.",
            "Cada minuto de atraso é uma chance a menos de venda.",
            "Abra o dia com um 'sim'. Foco total nos leads mais quentes."
        ],
        tips: [
            "Priorize os leads que chegaram durante a noite — eles são sua mina de ouro agora.",
            "Abordagem matinal: seja breve, direto e cheio de energia no WhatsApp.",
            "Confira sua agenda de hoje imediatamente e prepare os materiais dos veículos.",
            "O primeiro contato em menos de 5 min aumenta a conversão em 9x. Não demore!",
            "Mande um vídeo do carro no sol da manhã. A iluminação ajuda a vender!",
            "Leads matinais geralmente estão decidindo. Seja o consultor que resolve."
        ]
    },
    afternoon: {
        phrases: [
            "Tarde produtiva! O ritmo não pode cair. O fechamento está próximo.",
            "Metade do dia já foi. Como está o seu pipeline? Acelera!",
            "A consistência na tarde separa os amadores dos profissionais.",
            "Não deixe o cansaço vencer a sua meta. Faltam poucos passos.",
            "O 'não' você já tem. Vá buscar o 'sim' agora à tarde.",
            "Mantenha o sangue frio e o coração quente. Bora vender!",
            "A tarde é o momento de colher o que plantou pela manhã.",
            "Foco nos detalhes. O cliente decide o fechamento no detalhe.",
            "Disciplina é fazer o que precisa ser feito, mesmo sem vontade.",
            "Transforme a tarde no seu período mais lucrativo do dia.",
            "O sucesso é a soma de pequenos esforços feitos repetidamente.",
            "O cliente está no intervalo. A hora de mandar o WhatsApp é agora!",
            "Seja imbatível. A meta não se atinge sozinha.",
            "Cada lead atendido agora é um passo rumo ao topo do ranking."
        ],
        tips: [
            "Momento ideal para follow-ups. Pergunte: 'Ficou alguma dúvida sobre o vídeo?'",
            "Mande fotos do interior do carro e do painel. Detalhes encantam à tarde.",
            "Reative aqueles leads que não responderam de manhã com uma nova foto.",
            "Use o horário de almoço dos clientes para mensagens estratégicas.",
            "Ofereça um test-drive para o final da tarde ou amanhã cedo.",
            "Leads da tarde esperam resolutividade. Seja firme na proposta."
        ]
    },
    night: {
        phrases: [
            "Boa noite! Último esforço para fechar o dia com chave de ouro.",
            "O dia acaba, mas a ambição continua. Última ligação, última chance.",
            "Preparando o terreno para amanhã. Quem planta à noite, colhe cedo.",
            "Feche o dia com orgulho. Você deu o seu melhor hoje?",
            "Um campeão só descansa quando a missão está cumprida.",
            "O silêncio da noite é bom para organizar o pipeline de amanhã.",
            "Não deixe para amanhã o fechamento que você pode garantir hoje.",
            "A dedicação extra de agora é o seu diferencial amanhã.",
            "Meta batida é sono tranquilo. Vamos garantir esse resultado!",
            "O mercado não para. Deixe tudo pronto para explodir amanhã.",
            "A excelência é um hábito, não um ato. Continue firme.",
            "Grandes vendas costumam acontecer no 'último minuto'.",
            "Reflexão de hoje: o que posso fazer melhor amanhã?",
            "Último lead do dia pode ser o seu maior faturamento."
        ],
        tips: [
            "Deixe mensagens agendadas ou rascunhos prontos para os leads de amanhã cedo.",
            "Revise suas metas e veja o que faltou. Organize a prioridade 1 de amanhã.",
            "Mensagens à noite devem ser suaves: 'Vi seu interesse, amanhã te mando os detalhes'.",
            "Aproveite para estudar os novos veículos que entraram no estoque hoje.",
            "Organize sua agenda de amanhã agora. Garanta que o cliente lembre.",
            "O fechamento noturno exige paciência e segurança. Passe confiança."
        ]
    }
};

// Animated counter hook ...
function useAnimatedCounter(value: number, duration = 1500) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        let start = 0;
        const step = value / (duration / 16);
        const timer = setInterval(() => {
            start += step;
            if (start >= value) { setDisplay(value); clearInterval(timer); }
            else setDisplay(Math.floor(start));
        }, 16);
        return () => clearInterval(timer);
    }, [value, duration]);
    return display;
}

export const DailyMissionHeader: React.FC<DailyMissionHeaderProps> = ({
    userName, salesCount, leadCount, avgResponseTime, responseRate, userRole = 'consultant'
}) => {
    const monthlyGoal = userRole === 'admin' ? 50 : 15; // Metas ajustadas para a escala real da Manos
    const progress = Math.min(100, (salesCount / monthlyGoal) * 100);
    const salesLeft = Math.max(0, monthlyGoal - salesCount);
    const goalMet = salesLeft === 0;

    // Cálculo da Taxa de Conversão Real (Vendas / Total de Leads * 100)
    const realConversionRate = leadCount > 0 ? (salesCount / leadCount) * 100 : 0;

    const animatedSales = useAnimatedCounter(salesCount, 1200);
    const animatedLeads = useAnimatedCounter(leadCount, 1000);
    const animatedRate = useAnimatedCounter(Math.round(realConversionRate), 1400);

    const capitalizedName = userName
        ? userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase()
        : 'Campeão';

    const getPeriod = () => {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return 'morning';
        if (h >= 12 && h < 18) return 'afternoon';
        return 'night';
    };

    const period = getPeriod();

    const getGreeting = () => {
        if (period === 'morning') return { text: 'BOM DIA', icon: '☀️' };
        if (period === 'afternoon') return { text: 'BOA TARDE', icon: '⚡' };
        return { text: 'BOA NOITE', icon: '🔥' };
    };
    const greeting = getGreeting();

    const getPhrase = () => {
        const today = new Date();
        const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
        const phrases = PERIOD_REPERTOIRE[period].phrases;
        return phrases[seed % phrases.length];
    };

    const getAITip = () => {
        const today = new Date();
        const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate() + 3;
        const tips = PERIOD_REPERTOIRE[period].tips;
        return tips[seed % tips.length];
    };

    const getResponseStatus = (time?: number) => {
        if (!time) return { label: 'Calculando', color: '#ffffff30', glow: 'none' };
        if (time <= 5) return { label: 'Excelente', color: '#22c55e', glow: '0 0 20px rgba(34,197,94,0.4)' };
        if (time <= 15) return { label: 'Bom', color: '#f59e0b', glow: '0 0 20px rgba(245,158,11,0.4)' };
        return { label: 'Lento', color: '#ef4444', glow: '0 0 20px rgba(239,68,68,0.4)' };
    };
    const respStatus = getResponseStatus(avgResponseTime);

    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="w-full relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0d0d10]"
        >
            {/* Background glow effects */}
            <div className="absolute top-0 left-1/4 w-96 h-48 bg-red-600/8 blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-64 h-32 bg-red-900/10 blur-[60px] pointer-events-none" />
            {goalMet && (
                <motion.div
                    animate={{ opacity: [0.05, 0.12, 0.05] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-amber-500/10 pointer-events-none"
                />
            )}

            {/* TOP ROW: greeting + phrase + AI tip */}
            <div className="relative px-6 pt-6 pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/[0.05]">
                <div className="space-y-2">
                    {/* Greeting badge */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center gap-2"
                    >
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">{greeting.text},</span>
                    </motion.div>

                    {/* Main name — big and bold */}
                    <motion.h1
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-2xl sm:text-3xl font-black text-white leading-none tracking-tight"
                    >
                        {capitalizedName}{' '}
                        <span className="text-red-500">
                            {goalMet ? '🏆 Meta Batida!' : '— Execute.'}
                        </span>
                    </motion.h1>

                    {/* Motivating phrase */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-[12px] text-white/40 italic font-medium max-w-md border-l-2 border-red-600/40 pl-3 leading-relaxed"
                    >
                        {getPhrase()}
                    </motion.p>
                </div>

                {/* AI tip */}
                <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-start gap-3 bg-[#0a0a0e] border border-white/[0.06] rounded-2xl px-4 py-3 max-w-xs shrink-0"
                >
                    <Brain size={14} className="text-red-500/60 shrink-0 mt-0.5" />
                    <div>
                        <span className="text-[9px] font-black text-red-500/50 uppercase tracking-widest block mb-1">IA // Dica do Dia</span>
                        <span className="text-[11px] text-white/40 leading-relaxed block">{getAITip()}</span>
                    </div>
                </motion.div>
            </div>

            {/* BOTTOM ROW: 4 KPI tiles */}
            <div className="relative px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4">

                {/* VENDAS — with animated goal bar */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-3"
                >
                    <div className="flex items-center gap-2">
                        <Trophy size={12} className="text-amber-500/60" />
                        <span className="text-[9px] font-black text-white/25 uppercase tracking-[0.3em]">Vendas</span>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <motion.span
                            key={salesCount}
                            className="text-3xl font-black tabular-nums text-white"
                            style={{ textShadow: goalMet ? '0 0 20px rgba(245,158,11,0.6)' : 'none' }}
                        >
                            {animatedSales}
                        </motion.span>
                        <span className="text-sm text-white/20 font-bold">/ {monthlyGoal}</span>
                    </div>

                    {/* Goal progress bar — thick, glowing */}
                    <div className="relative w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1.8, ease: 'easeOut', delay: 0.6 }}
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                                background: goalMet
                                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                    : 'linear-gradient(90deg, #dc2626, #ef4444)',
                                boxShadow: goalMet
                                    ? '0 0 10px rgba(245,158,11,0.6)'
                                    : '0 0 8px rgba(220,38,38,0.5)',
                            }}
                        >
                            {/* Shimmer effect */}
                            <motion.div
                                animate={{ x: ['-100%', '300%'] }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: 'linear', delay: 1 }}
                                className="absolute inset-y-0 w-1/3 bg-white/25 skew-x-12"
                            />
                        </motion.div>
                    </div>

                    <p className="text-[9px] font-black uppercase tracking-widest"
                        style={{ color: goalMet ? '#f59e0b' : '#ffffff30' }}>
                        {goalMet ? '🏆 META ATINGIDA!' : `${salesLeft} para a meta`}
                    </p>
                </motion.div>

                {/* RESPOSTA */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-3"
                >
                    <div className="flex items-center gap-2">
                        <Clock size={12} className="text-white/25" />
                        <span className="text-[9px] font-black text-white/25 uppercase tracking-[0.3em]">Resposta</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span
                            className="text-3xl font-black tabular-nums"
                            style={{ color: respStatus.color, textShadow: respStatus.glow }}
                        >
                            {avgResponseTime ?? '—'}
                        </span>
                        {avgResponseTime && <span className="text-sm text-white/20 font-bold">min</span>}
                    </div>
                    <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: avgResponseTime ? `${Math.max(10, 100 - (avgResponseTime / 30 * 100))}%` : '5%' }}
                            transition={{ duration: 1.5, ease: 'easeOut', delay: 0.7 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: respStatus.color, boxShadow: respStatus.glow }}
                        />
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: respStatus.color }}>
                        {respStatus.label}
                    </p>
                </motion.div>

                {/* TAXA */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-3"
                >
                    <div className="flex items-center gap-2">
                        <Activity size={12} className="text-white/25" />
                        <span className="text-[9px] font-black text-white/25 uppercase tracking-[0.3em]">Taxa</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-3xl font-black tabular-nums text-white">{animatedRate}</span>
                        <span className="text-lg text-white/20 font-bold">%</span>
                    </div>
                    <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, responseRate || 0)}%` }}
                            transition={{ duration: 1.6, ease: 'easeOut', delay: 0.8 }}
                            className="h-full rounded-full"
                            style={{
                                background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                                boxShadow: '0 0 8px rgba(139,92,246,0.5)',
                            }}
                        />
                    </div>
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Taxa Conv.
                    </p>
                </motion.div>

                {/* LEADS ATIVOS */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="space-y-3"
                >
                    <div className="flex items-center gap-2">
                        <Users size={12} className="text-white/25" />
                        <span className="text-[9px] font-black text-white/25 uppercase tracking-[0.3em]">Leads</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span
                            className="text-3xl font-black tabular-nums"
                            style={{ color: '#ef4444', textShadow: '0 0 20px rgba(239,68,68,0.4)' }}
                        >
                            {animatedLeads}
                        </span>
                    </div>
                    <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (leadCount / 200) * 100)}%` }}
                            transition={{ duration: 1.6, ease: 'easeOut', delay: 0.9 }}
                            className="h-full rounded-full"
                            style={{
                                background: 'linear-gradient(90deg, #dc2626, #ef4444)',
                                boxShadow: '0 0 8px rgba(220,38,38,0.5)',
                            }}
                        />
                    </div>
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Pipeline Ativo
                    </p>
                </motion.div>
            </div>
        </motion.header>
    );
};
