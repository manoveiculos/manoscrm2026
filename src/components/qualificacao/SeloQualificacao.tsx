'use client';

import { SELO_META, type Selo } from '@/lib/qualificacao';

/** Selo Quente / Morno / Fora do perfil / Sem qualificação. */
export function SeloQualificacao({ selo, motivo, compact = false }: { selo: Selo; motivo?: string; compact?: boolean }) {
    const meta = SELO_META[selo];
    return (
        <span
            title={motivo || meta.label}
            className={`inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap ${meta.className} ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
        >
            <span aria-hidden>{meta.emoji}</span>
            {meta.label}
        </span>
    );
}
