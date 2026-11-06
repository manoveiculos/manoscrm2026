'use client';

import Link from 'next/link';
import { ExternalLink, UserX } from 'lucide-react';
import { QualificacaoCard } from '@/components/qualificacao/QualificacaoCard';
import { FichaIACard } from '@/components/qualificacao/FichaIACard';
import type { ConversaItem } from '@/lib/whatsapp/conversasView';

/**
 * Ficha do lead ao lado da conversa: selo, os 4 campos de qualificação
 * (editáveis, mesmo componente do perfil), ficha da IA e atalho para o perfil.
 */
export function FichaLead({ conversa }: { conversa: ConversaItem }) {
    if (!conversa.leadUid) {
        return (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-center">
                <UserX size={22} className="mx-auto text-white/40 mb-2" />
                <p className="text-[13px] font-bold text-white/80">Sem lead ligado a este telefone</p>
                <p className="text-[12px] text-white/45 mt-1">
                    O CRM liga a conversa ao lead pelo telefone. Quando o lead for criado, a ficha aparece aqui.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            <Link
                href={`/lead/${encodeURIComponent(conversa.leadUid)}`}
                className="min-h-[44px] rounded-xl bg-white text-black text-[13px] font-black flex items-center justify-center gap-2 active:scale-95"
            >
                Abrir perfil do lead <ExternalLink size={14} />
            </Link>
            <QualificacaoCard uid={conversa.leadUid} />
            <FichaIACard uid={conversa.leadUid} />
        </div>
    );
}
