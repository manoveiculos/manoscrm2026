'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QualificacaoCampos, ResultadoQualificacao } from '@/lib/qualificacao';

export type QualificacaoItem = ResultadoQualificacao & { campos: QualificacaoCampos };

/**
 * Busca em lote a qualificação (campos + selo) de uma lista de leads.
 * `uids` no formato da view leads_unified ("tabela:id").
 */
export function useQualificacaoLote(uids: string[]) {
    const [items, setItems] = useState<Record<string, QualificacaoItem>>({});
    const [piso, setPiso] = useState<number | null>(null);
    const chave = uids.slice().sort().join(',');
    const ultimaChave = useRef('');

    const carregar = useCallback(async (lista: string[]) => {
        if (lista.length === 0) { setItems({}); return; }
        try {
            const res = await fetch(`/api/lead/qualificacao?uids=${lista.map(encodeURIComponent).join(',')}`, { cache: 'no-store' });
            const data = await res.json();
            if (data?.success) {
                setItems(data.items || {});
                setPiso(data.piso ?? null);
            }
        } catch { /* selo é informativo: falha não trava a tela */ }
    }, []);

    useEffect(() => {
        if (chave === ultimaChave.current) return;
        ultimaChave.current = chave;
        carregar(chave ? chave.split(',') : []);
    }, [chave, carregar]);

    /** Atualiza um lead localmente (após salvar no cartão). */
    const atualizar = useCallback((uid: string, item: QualificacaoItem) => {
        setItems(prev => ({ ...prev, [uid]: item }));
    }, []);

    const recarregar = useCallback(() => carregar(chave ? chave.split(',') : []), [carregar, chave]);

    return { items, piso, atualizar, recarregar };
}
