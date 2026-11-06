'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mesclarMensagens, type ConversaDetalhe, type ConversaItem } from '@/lib/whatsapp/conversasView';
import { ConversasView } from './_components/ConversasView';

/**
 * CONVERSAS — o WhatsApp da loja dentro do CRM (Fase 3, leitura).
 * Dados: GET /api/wa/conversas e /api/wa/conversas/:id (RLS: vendedor só vê
 * as dele). Atualiza sozinho: lista a cada 20 s, conversa aberta a cada 8 s.
 *   /conversas?c=<id da conversa>
 *   /conversas?lead=<tabela:id>   (vem da Minha Fila / perfil do lead)
 */

const LISTA_MS = 20_000;
const CONVERSA_MS = 8_000;

type Perfil = 'vendedor' | 'gestor' | 'admin';

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) throw new Error(data?.error || `erro ${res.status}`);
    return data as T;
}

function ConversasPagina() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const selecionada = params.get('c');
    const leadParam = params.get('lead');

    const [conversas, setConversas] = useState<ConversaItem[] | null>(null);
    const [perfil, setPerfil] = useState<Perfil | null>(null);
    const [carregandoLista, setCarregandoLista] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);

    const [detalhe, setDetalhe] = useState<ConversaDetalhe | null>(null);
    const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
    const [carregandoAntigas, setCarregandoAntigas] = useState(false);
    const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
    const listaEmCurso = useRef(false);

    const selecionar = useCallback((id: string | null) => {
        router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
    }, [router, pathname]);

    // ── Lista ────────────────────────────────────────────────────────────
    const carregarLista = useCallback(async () => {
        if (listaEmCurso.current) return;
        listaEmCurso.current = true;
        setCarregandoLista(true);
        try {
            const d = await getJson<{ conversas: ConversaItem[]; perfil: Perfil }>('/api/wa/conversas');
            setConversas(d.conversas);
            setPerfil(d.perfil);
            setErroLista(null);
        } catch (e) {
            setErroLista(e instanceof Error ? e.message : 'erro');
        } finally {
            setCarregandoLista(false);
            listaEmCurso.current = false;
        }
    }, []);

    useEffect(() => {
        carregarLista();
        const t = setInterval(() => { if (document.visibilityState === 'visible') carregarLista(); }, LISTA_MS);
        const vis = () => { if (document.visibilityState === 'visible') carregarLista(); };
        document.addEventListener('visibilitychange', vis);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
    }, [carregarLista]);

    // ── ?lead= → acha a conversa daquele lead ───────────────────────────
    useEffect(() => {
        if (!leadParam || selecionada) return;
        let vivo = true;
        (async () => {
            const naLista = conversas?.find(c => c.leadUid === leadParam);
            if (naLista) { selecionar(naLista.id); return; }
            if (!conversas) return; // espera a lista
            try {
                const d = await getJson<{ conversas: ConversaItem[] }>(`/api/wa/conversas?lead=${encodeURIComponent(leadParam)}`);
                if (!vivo) return;
                if (d.conversas[0]) selecionar(d.conversas[0].id);
                // Lead sem conversa no WhatsApp da loja (a gravação começou em 05/11):
                // vai para o perfil do lead, que era o destino antigo do botão.
                else router.replace(`/lead/${encodeURIComponent(leadParam)}`);
            } catch (e) {
                if (vivo) setErroDetalhe(e instanceof Error ? e.message : 'erro');
            }
        })();
        return () => { vivo = false; };
    }, [leadParam, selecionada, conversas, selecionar, router]);

    // ── Conversa aberta ─────────────────────────────────────────────────
    useEffect(() => {
        setDetalhe(null);
        setErroDetalhe(null);
        if (!selecionada) return;
        let vivo = true;
        setCarregandoDetalhe(true);

        getJson<ConversaDetalhe>(`/api/wa/conversas/${selecionada}?abrir=1`)
            .then(d => {
                if (!vivo) return;
                setDetalhe(d);
                // abriu: some o contador de não lidas na lista (o servidor zera se for o vendedor dono)
                setConversas(prev => prev?.map(c => c.id === selecionada ? { ...c, naoLidas: 0 } : c) ?? prev);
            })
            .catch(e => { if (vivo) setErroDetalhe(e instanceof Error ? e.message : 'erro'); })
            .finally(() => { if (vivo) setCarregandoDetalhe(false); });

        const atualizar = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const d = await getJson<ConversaDetalhe>(`/api/wa/conversas/${selecionada}`);
                if (!vivo) return;
                setDetalhe(prev => prev && prev.conversa.id === d.conversa.id
                    ? { ...prev, conversa: d.conversa, mensagens: mesclarMensagens(prev.mensagens, d.mensagens), citadas: { ...prev.citadas, ...d.citadas } }
                    : d);
            } catch { /* tenta de novo no próximo ciclo */ }
        };
        const t = setInterval(atualizar, CONVERSA_MS);
        return () => { vivo = false; clearInterval(t); };
    }, [selecionada]);

    const carregarAntigas = useCallback(async () => {
        const d0 = detalhe;
        if (!d0 || !d0.mensagens.length || carregandoAntigas) return;
        setCarregandoAntigas(true);
        try {
            const antes = d0.mensagens[0].criadaEm;
            const d = await getJson<ConversaDetalhe>(`/api/wa/conversas/${d0.conversa.id}?antes=${encodeURIComponent(antes)}`);
            setDetalhe(prev => prev && prev.conversa.id === d0.conversa.id
                ? { ...prev, mensagens: mesclarMensagens(d.mensagens, prev.mensagens), citadas: { ...d.citadas, ...prev.citadas }, temMais: d.temMais }
                : prev);
        } catch (e) {
            setErroDetalhe(e instanceof Error ? e.message : 'erro');
        } finally {
            setCarregandoAntigas(false);
        }
    }, [detalhe, carregandoAntigas]);

    return (
        <ConversasView
            conversas={conversas}
            perfil={perfil}
            carregandoLista={carregandoLista}
            erroLista={erroLista}
            selecionada={selecionada}
            detalhe={detalhe}
            carregandoDetalhe={carregandoDetalhe}
            carregandoAntigas={carregandoAntigas}
            erroDetalhe={erroDetalhe}
            onSelecionar={selecionar}
            onAtualizar={carregarLista}
            onCarregarAntigas={carregarAntigas}
        />
    );
}

export default function ConversasPage() {
    // useSearchParams precisa de Suspense na página de cliente (Next 16)
    return (
        <Suspense fallback={null}>
            <ConversasPagina />
        </Suspense>
    );
}
