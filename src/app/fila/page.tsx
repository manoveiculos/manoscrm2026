'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PrizeWheelModal from '@/app/components/roleta/PrizeWheelModal';
import type { CardFila, Fila } from '@/lib/fila/montarFila';
import { FilaView } from './_components/FilaView';
import type { FilaApi, RespostaApi, Resultado } from './_components/tipos';

/**
 * MINHA FILA — tela inicial do vendedor (Fase 1 da repaginação, Growth 360).
 * O que fazer agora, em ordem de prioridade, com resultado em até 2 toques.
 * Dados: GET /api/fila (só os leads do consultor logado).
 */

async function postJson(url: string, body: unknown): Promise<RespostaApi & { data?: any }> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            // Se o vendedor sair da tela durante o "desfazer", o pedido ainda chega.
            keepalive: true,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) return { ok: false, error: data?.error || `erro ${res.status}` };
        return { ok: true, data };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'sem conexão' };
    }
}

/** Mesmo prefixo de id que o perfil do lead usa na roleta (1 giro por venda). */
function idRoleta(card: CardFila): string {
    const prefixo: Record<string, string> = { leads_distribuicao_crm_26: 'crm26_', leadsfacebook: 'fb_', leads_manos_crm: 'main_' };
    return `${prefixo[card.table || ''] || ''}${card.nativeId}`;
}

export default function MinhaFilaPage() {
    const [fila, setFila] = useState<Fila | null>(null);
    const [dica, setDica] = useState<string | null>(null);
    const [nome, setNome] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null);
    const [roleta, setRoleta] = useState<{ veiculoId: string; modelo: string } | null>(null);
    const emCurso = useRef(false);

    const carregar = useCallback(async () => {
        if (emCurso.current) return;
        emCurso.current = true;
        setCarregando(true);
        try {
            const res = await fetch('/api/fila', { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) throw new Error(data?.error || `erro ${res.status}`);
            setFila(data.fila);
            setDica(data.dica || null);
            setNome(data.nome || null);
            setAviso(data.aviso || null);
            setErro(null);
            setAtualizadoEm(Date.now());
        } catch (e: any) {
            setErro(e?.message || 'erro');
        } finally {
            setCarregando(false);
            emCurso.current = false;
        }
    }, []);

    // Carrega, atualiza a cada minuto e quando o vendedor volta para a aba
    // (ex.: depois de uma ligação).
    useEffect(() => {
        carregar();
        const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 60_000);
        const vis = () => { if (document.visibilityState === 'visible') carregar(); };
        document.addEventListener('visibilitychange', vis);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
    }, [carregar]);

    const api: FilaApi = useMemo(() => ({
        registrarLigacao: (card) => postJson('/api/fila/contato', { uid: card.uid }),

        marcarRetorno: (card, quando) => postJson('/api/fila/retorno', { uid: card.uid, quando: quando.toISOString() }),

        marcarVisita: (card, quando) => {
            const tel = card.telefone && !card.telefone.includes('*') ? String(card.telefone).replace(/\D/g, '') : null;
            return postJson('/api/agenda', {
                lead_uid: card.uid,
                cliente_nome: card.nome,
                cliente_telefone: tel,
                cliente_whatsapp: tel,
                veiculo_interesse: card.carro,
                tipo: 'loja',
                data_hora: quando.toISOString(),
                observacoes: 'Marcada pela Minha Fila',
            });
        },

        registrarResultado: (card, r: Resultado) => postJson('/api/lead/finish', r.tipo === 'venda'
            ? {
                lead_id: card.nativeId,
                lead_table: card.table,
                finish_type: 'venda',
                vehicle_name: r.veiculo,
                sale_value: r.valor,
                exige_valor: true,
            }
            : {
                lead_id: card.nativeId,
                lead_table: card.table,
                finish_type: 'perda',
                motivo_perda_estruturado: r.motivo,
                diagnostico_atendimento: r.detalhe || null,
            }),
    }), []);

    const aoGravar = useCallback((card: CardFila, r: Resultado) => {
        if (r.tipo === 'venda') setRoleta({ veiculoId: idRoleta(card), modelo: r.veiculo });
        carregar();
    }, [carregar]);

    return (
        <div className="w-full">
            <FilaView
                fila={fila}
                dica={dica}
                nome={nome}
                aviso={aviso}
                carregando={carregando}
                erro={erro}
                atualizadoEm={atualizadoEm}
                api={api}
                onAtualizar={carregar}
                onResultadoGravado={aoGravar}
            />
            {roleta && (
                <PrizeWheelModal open veiculoId={roleta.veiculoId} veiculoModelo={roleta.modelo} onClose={() => setRoleta(null)} />
            )}
        </div>
    );
}
