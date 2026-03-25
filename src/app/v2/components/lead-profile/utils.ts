import { MessageSquare, Phone, History, CarFront, Flag, Trophy, Target, Bot, Zap, Check, X, Shield, Edit3, ArrowRight, Search, Activity, Calendar } from 'lucide-react';

export const EVENT_CONFIG: Record<string, any> = {
    whatsapp_in: { icon: MessageSquare, color: '#25D366', label: 'WhatsApp (Cliente)' },
    whatsapp_out: { icon: MessageSquare, color: '#34B7F1', label: 'WhatsApp (Consultor)' },
    whatsapp_template: { icon: Target, color: '#FF7A00', label: 'Estratégia WhatsApp' },
    call: { icon: Phone, color: '#A855F7', label: 'Chamada Telefônica' },
    status_change: { icon: History, color: '#FACC15', label: 'Mudança de Estágio' },
    ai_lab: { icon: Bot, color: '#A855F7', label: 'Análise Laboratório' },
    ai_action: { icon: Zap, color: '#DC2626', label: 'Ação Tática IA' },
    system: { icon: Shield, color: '#6B7280', label: 'Log do Sistema' }
};

export const getTemplatesForStage = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('entrada')) return [
        { id: 't1', label: 'SAUDAÇÃO TÁTICA', emoji: '🤝', message: 'Olá {name}! Aqui é o {consultant} da Manos Multimarcas. Vi que você se interessou no nosso {vehicle}. Como posso acelerar sua conquista hoje?' },
        { id: 't2', label: 'VÍDEO DO ARSENAL', emoji: '🎥', message: 'Tudo bem {name}? Acabei de preparar um vídeo exclusivo do {vehicle} pra você. Posso te enviar por aqui?' }
    ];
    if (s.includes('triagem')) return [
        { id: 't3', label: 'QUALIFICAÇÃO FINANCEIRA', emoji: '💰', message: '{name}, para eu te passar a melhor condição no {vehicle}, você pretende fazer uma entrada ou usar seu usado na troca?' },
        { id: 't4', label: 'AGENDAMENTO DE TESTE', emoji: '🏎️', message: 'O {vehicle} está higienizado e pronto aqui no pátio. Consegue passar aqui hoje às 15h ou prefere amanhã cedo?' }
    ];
    return [
        { id: 't5', label: 'REENGATE ESTRATÉGICO', emoji: '🎯', message: 'Oi {name}, ainda estou com o {vehicle} reservado pra você. Surgiu uma condição de taxa nova aqui, quer que eu simule?' }
    ];
};

export const fillTemplate = (msg: string, lead: any) => {
    return msg
        .replace(/{name}/g, lead.name?.split(' ')[0] || 'Cliente')
        .replace(/{vehicle}/g, lead.vehicle_interest || 'veículo')
        .replace(/{consultant}/g, 'Consultor');
};

export const getAcaoTaticaFallback = (lead: any) => ({
    emoji: '🎯',
    titulo: 'REENGATE IMEDIATO',
    descricao: `O lead ${lead.name} está sem interação humana há mais de 24h. Recomendado envio de script de "Acompanhamento" via WhatsApp para manter o radar ativo.`
});

export const calcularTempoFunil = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
};

export const calcularDiffHoras = (createdAt: string) => {
    return (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
};

export const parsePrice = (price: any): number => {
    if (!price) return 0;
    if (typeof price === 'number') return price;
    const cleaned = price.replace(/[^\d]/g, '');
    return parseInt(cleaned) || 0;
};
