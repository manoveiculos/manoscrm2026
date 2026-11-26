'use client';

import { useState } from 'react';
import WhatsAppEspelhoPage from '@/app/admin/whatsapp/page';

// Dados fictícios: nenhum nome ou número real.
const agora = Date.now();
const iso = (minAtras: number) => new Date(agora - minAtras * 60_000).toISOString();

const CONVERSAS = [
    { id: '00000000-0000-4000-8000-000000000001', telefone: '47999990001', nome: 'Cliente Exemplo', ultimaEm: iso(3), ultimaDirecao: 'in', ultimaTipo: 'texto', ultimaTexto: 'Consigo pagar dia 10, pode ser?', total: 9 },
    { id: '00000000-0000-4000-8000-000000000002', telefone: '47999990002', nome: null, ultimaEm: iso(80), ultimaDirecao: 'out', ultimaTipo: 'texto', ultimaTexto: 'Bom dia! Segue o boleto atualizado.', total: 4 },
    { id: '00000000-0000-4000-8000-000000000003', telefone: '47999990003', nome: 'Fornecedor Teste', ultimaEm: iso(60 * 30), ultimaDirecao: 'in', ultimaTipo: 'audio', ultimaTexto: null, total: 2 },
];

const msg = (id: number, direcao: 'in' | 'out', minAtras: number, tipo: string, texto: string | null, extra: Record<string, unknown> = {}) => ({
    id: `00000000-0000-4000-9000-${String(id).padStart(12, '0')}`, providerId: `P${id}`, direcao, autor: direcao === 'in' ? 'cliente' : 'vendedor',
    tipo, texto, legenda: null, temMidia: false, midiaMime: null, midiaBytes: null, midiaNome: null, midiaExpirada: false,
    midiaErro: tipo === 'texto' ? null : 'indisponivel', duracaoS: null, transcricao: null, citadaId: null, statusEntrega: null,
    editadaEm: null, apagadaEm: null, criadaEm: iso(minAtras), localizacao: null, contatos: null, analiseAudio: null, ...extra,
});

const DETALHE = {
    conversa: CONVERSAS[0],
    mensagens: [
        msg(1, 'out', 60 * 26, 'texto', 'Olá! Passando para lembrar da parcela que venceu ontem.'),
        msg(2, 'in', 60 * 25, 'texto', 'Oi, tô sabendo. Esse mês ficou apertado.'),
        msg(3, 'out', 60 * 25 - 5, 'texto', 'Entendo. Quer que eu veja uma data melhor pra você?'),
        msg(4, 'in', 60 * 2, 'audio', null, { duracaoS: 14, temMidia: true, midiaErro: null }),
        msg(9, 'in', 60 * 2 - 1, 'imagem', null, { legenda: 'Foto antiga do comprovante' }),
        msg(5, 'in', 60 * 2 - 1, 'texto', 'Mandei errado, ignora', { apagadaEm: iso(60 * 2 - 2) }),
        msg(6, 'out', 30, 'texto', 'Consegue me dizer o dia certinho?', { editadaEm: iso(29) }),
        msg(7, 'in', 3, 'texto', 'Consigo pagar dia 10, pode ser?', { citadaId: 'P6' }),
        msg(8, 'out', 2, 'reacao', '👍', { citadaId: 'P7' }),
    ],
    citadas: {},
    temMais: true,
};

const SYNC = { ultima_sync_em: iso(1), importacao_concluida: false, importacao_pagina: 400, total_evolution: 390_666, ultimo_erro: null, ultimo_erro_em: null };

function responder(url: string): unknown {
    if (url.includes('/api/espelho-wa/conversas/')) return { success: true, ...DETALHE };
    if (url.includes('/api/espelho-wa/conversas')) return { success: true, configurado: true, instancia: 'Camila', conversas: CONVERSAS, temMais: false, sync: SYNC };
    if (url.includes('/api/espelho-wa/sincronizar')) return { success: true, novas: 0 };
    return null;
}

export function PreviewEspelho() {
    // Troca o fetch ANTES de a tela montar (o inicializador roda no render, antes dos efeitos dos filhos).
    useState(() => {
        if (typeof window === 'undefined') return false;
        const original = window.fetch.bind(window);
        window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            const r = responder(url);
            if (r) return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
            return original(input, init);
        }) as typeof window.fetch;
        return true;
    });
    return (
        <div className="min-h-screen bg-[#07070A] p-4">
            <WhatsAppEspelhoPage />
        </div>
    );
}
