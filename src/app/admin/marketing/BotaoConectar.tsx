'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, TriangleAlert } from 'lucide-react';

type Provedor = 'google' | 'meta';
const NOME: Record<Provedor, string> = { google: 'Google Ads', meta: 'Facebook / Instagram' };

/**
 * Botão "Conectar": abre a tela oficial de login e autorização do Google ou do Meta.
 * A senha é digitada lá; o CRM nunca a vê. Na volta, mostra se deu certo ou o que faltou.
 */
export function BotaoConectar({ provedor, rotulo = 'Conectar' }: { provedor: Provedor; rotulo?: string }) {
    const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro' | 'falta'; texto: string } | null>(null);

    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        if (q.get('conectado') === provedor) { setAviso({ tom: 'ok', texto: `${NOME[provedor]} conectado. Atualize a tela para ver as campanhas.` }); return; }
        if (q.get('provedor') !== provedor) return;
        const c = q.get('conectar');
        if (c === 'falta') setAviso({ tom: 'falta', texto: `Para este botão funcionar, falta cadastrar no servidor: ${q.get('vars')}. Depois é só clicar de novo.` });
        else if (c === 'negado') setAviso({ tom: 'erro', texto: 'Você cancelou a autorização. Clique em Conectar e escolha Permitir.' });
        else if (c === 'invalido') setAviso({ tom: 'erro', texto: 'A conexão expirou antes de terminar. Clique em Conectar de novo.' });
        else if (c === 'erro') setAviso({ tom: 'erro', texto: q.get('motivo') || 'Não consegui concluir a conexão.' });
    }, [provedor]);

    return (
        <div className="space-y-2">
            {/* link normal (não fetch): o navegador precisa sair para a tela oficial de login */}
            <a href={`/api/oauth/${provedor}/start`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-xs font-semibold hover:bg-white">
                <Link2 className="w-3.5 h-3.5" /> {rotulo} {NOME[provedor]}
            </a>
            {aviso && (
                <p className={`flex items-start gap-1.5 text-xs ${aviso.tom === 'ok' ? 'text-emerald-300' : aviso.tom === 'falta' ? 'text-amber-300' : 'text-red-300'}`}>
                    {aviso.tom === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> : <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />}
                    <span>{aviso.texto}</span>
                </p>
            )}
        </div>
    );
}
