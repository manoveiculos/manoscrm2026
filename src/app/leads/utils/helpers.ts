export const formatPhoneBR = (val: string) => {
    if (!val) return '';
    let digits = val.replace(/\D/g, '');
    // Strip country code 55 if present
    if (digits.startsWith('55') && digits.length >= 12) {
        digits = digits.substring(2);
    }
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.substring(0, 2)}) ${digits.substring(2)}`;
    if (digits.length <= 10) return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
    return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7, 11)}`;
};

export const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
        'new': 'Aguardando',
        'received': 'Aguardando',
        'attempt': 'Em Atendimento',
        'contacted': 'Em Atendimento',
        'confirmed': 'Em Atendimento',
        'scheduled': 'Agendamento',
        'visited': 'Visita e Test Drive',
        'test_drive': 'Visita e Test Drive',
        'proposed': 'Negociação',
        'negotiation': 'Negociação',
        'closed': 'Vendido',
        'post_sale': 'Sem Contato',
        'lost': 'Perda Total',
        'comprado': 'Comprado'
    };
    const s = status.toLowerCase();
    if (s === 'lost' || s === 'lost_redistributed') return 'Perda Total';
    if (s === 'post_sale' || s === 'sem contato') return 'Sem Contato';
    return labels[status] || status.toUpperCase();
};

export const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (['received', 'new', 'novo'].includes(s)) return 'bg-blue-500';
    if (['attempt', 'contacted', 'confirmed'].includes(s)) return 'bg-amber-500';
    if (['scheduled'].includes(s)) return 'bg-red-500';
    if (['visited', 'test_drive'].includes(s)) return 'bg-red-600';
    if (['proposed', 'negotiation'].includes(s)) return 'bg-red-700';
    if (s === 'closed') return 'bg-emerald-500';
    if (s === 'post_sale' || s === 'sem contato') return 'bg-orange-500/80';
    if (s === 'lost' || s === 'lost_redistributed' || s === 'perda total') return 'bg-slate-500/80';
    if (s === 'comprado') return 'bg-indigo-500';
    return 'bg-white/10';
};

export const getAIClassLabel = (classification: string) => {
    const labels: { [key: string]: string } = {
        'hot': 'MUITO INTERESSADO',
        'warm': 'POTENCIAL',
        'cold': 'EM PESQUISA'
    };
    return labels[classification] || classification.toUpperCase();
};

export const formatValue = (val: string) => {
    if (!val) return '';
    return val.replace(/_/g, ' ').trim();
};
