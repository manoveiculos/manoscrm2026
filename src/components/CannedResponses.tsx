'use client';

import { useState } from 'react';
import { MessageSquarePlus, Copy, Check, ExternalLink } from 'lucide-react';

/**
 * CannedResponses — biblioteca de mensagens prontas pro vendedor
 *
 * Tokens suportados (substituídos no copy):
 *   {firstName}    primeiro nome do cliente
 *   {vehicle}      veículo de interesse (ou "este veículo" se vazio)
 *   {consultant}   primeiro nome do vendedor logado
 */

export interface CannedContext {
    leadFirstName: string;
    vehicleInterest: string;
    consultantFirstName: string;
    leadPhone?: string;
}

interface Template {
    key: string;
    label: string;
    icon: string;
    body: string;
    /** Se preenchido, ao copiar abre essa URL (ex: link Google Maps) */
    open?: string;
}

const TEMPLATES: Template[] = [
    {
        key: 'welcome',
        label: 'Boas-vindas',
        icon: '👋',
        body: 'Olá {firstName}! Vi seu interesse no {vehicle}. Sou o {consultant} da Manos Veículos. Como posso te ajudar agora?',
    },
    {
        key: 'financing',
        label: 'Financiamento',
        icon: '💳',
        body: 'Pra fazer a simulação de crédito do {vehicle} agora mesmo, preciso só do seu CPF e data de nascimento. Aprovação em minutos. Pode me passar?',
    },
    {
        key: 'visit_schedule',
        label: 'Agendar visita',
        icon: '📅',
        body: 'Que tal vir conhecer o {vehicle} pessoalmente? Posso reservar pra você hoje à tarde ou amanhã. Qual horário é melhor?',
    },
    {
        key: 'test_drive',
        label: 'Test drive',
        icon: '🚙',
        body: 'O {vehicle} merece um test drive. Quer agendar pra dar uma volta com ele? Posso separar pra hoje ou amanhã.',
    },
    {
        key: 'docs_for_credit',
        label: 'Docs p/ crédito',
        icon: '📄',
        body: 'Pra dar entrada no crédito preciso: RG/CNH, comprovante de residência (até 3 meses) e comprovante de renda. Pode me mandar fotos por aqui?',
    },
    {
        key: 'trade_in',
        label: 'Avaliação de troca',
        icon: '🔄',
        body: '{firstName}, quer dar seu carro como troca? Me passa marca, modelo, ano e quilometragem que avalio agora.',
    },
    {
        key: 'follow_up_24h',
        label: 'Follow-up 24h',
        icon: '👋',
        body: '{firstName}, ainda tenho aquela condição reservada no {vehicle}. Posso te ligar agora pra fechar?',
    },
    {
        key: 'follow_up_3d',
        label: 'Follow-up 3 dias',
        icon: '🔁',
        body: 'Oi {firstName}! Sumiu? O {vehicle} continua disponível, mas tem outros interessados em cima. Bora finalizar?',
    },
    {
        key: 'location_riodosul',
        label: 'Loja Rio do Sul',
        icon: '📍',
        body: 'Estamos em Rio do Sul/SC. Endereço e rota: https://maps.google.com/?q=Manos+Ve%C3%ADculos+Rio+do+Sul',
        open: 'https://maps.google.com/?q=Manos+Ve%C3%ADculos+Rio+do+Sul',
    },
    {
        key: 'location_itapema',
        label: 'Loja Itapema',
        icon: '📍',
        body: 'Estamos em Itapema/SC também. Endereço e rota: https://maps.google.com/?q=Manos+Ve%C3%ADculos+Itapema',
        open: 'https://maps.google.com/?q=Manos+Ve%C3%ADculos+Itapema',
    },
    {
        key: 'inventory',
        label: 'Estoque completo',
        icon: '🚗',
        body: '{firstName}, dá uma olhada no nosso estoque completo: https://manosveiculos.com.br/estoque',
    },
];

function fillTokens(body: string, ctx: CannedContext): string {
    return body
        .replaceAll('{firstName}', ctx.leadFirstName || 'tudo bem')
        .replaceAll('{vehicle}', ctx.vehicleInterest || 'este veículo')
        .replaceAll('{consultant}', ctx.consultantFirstName || 'time');
}

interface Props {
    ctx: CannedContext;
    /** Se passado, será chamado com o texto pronto pra ser inserido em algum input */
    onPick?: (text: string) => void;
}

export default function CannedResponses({ ctx, onPick }: Props) {
    const [open, setOpen] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    async function copy(t: Template) {
        const text = fillTokens(t.body, ctx);
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(t.key);
            onPick?.(text);
            setTimeout(() => setCopiedKey(null), 1500);
            if (t.open) window.open(t.open, '_blank');
        } catch {
            // fallback: chama onPick mesmo sem clipboard
            onPick?.(text);
        }
    }

    function openWhatsApp(t: Template) {
        if (!ctx.leadPhone) return;
        const text = fillTokens(t.body, ctx);
        const phone = ctx.leadPhone.replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-gray-200 border border-zinc-700"
            >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                Mensagens prontas
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-[70vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl">
                        <div className="p-2 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
                            <p className="text-[11px] text-gray-400 px-1">Click para copiar e abrir WhatsApp já com a mensagem.</p>
                        </div>
                        <ul className="p-1">
                            {TEMPLATES.map(t => {
                                const filled = fillTokens(t.body, ctx);
                                const copied = copiedKey === t.key;
                                return (
                                    <li key={t.key} className="border-b border-zinc-800 last:border-b-0">
                                        <div className="px-2 py-2 hover:bg-zinc-800 rounded">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                                                    <span>{t.icon}</span>
                                                    <span>{t.label}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => copy(t)}
                                                        className="p-1 rounded hover:bg-zinc-700 text-gray-300"
                                                        title="Copiar"
                                                    >
                                                        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                    {ctx.leadPhone && (
                                                        <button
                                                            onClick={() => openWhatsApp(t)}
                                                            className="p-1 rounded hover:bg-zinc-700 text-emerald-400"
                                                            title="Abrir WhatsApp com texto"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-gray-400 line-clamp-2">{filled}</p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
}
