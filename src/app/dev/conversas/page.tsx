import { notFound } from 'next/navigation';
import { PreviewConversas } from './PreviewConversas';

export const dynamic = 'force-dynamic';

/**
 * PRÉVIA da tela Conversas (Fase 3, leitura) com dados FICTÍCIOS.
 * Só existe fora de produção (o proxy também só libera /dev fora de produção).
 *
 *   /dev/conversas                     → lista do vendedor
 *   /dev/conversas?vista=conversa      → conversa aberta (todos os tipos de mensagem)
 *   /dev/conversas?perfil=admin        → visão do admin (todas, com o vendedor de cada uma)
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ vista?: string; perfil?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const sp = await searchParams;
    return (
        <PreviewConversas
            vista={sp.vista === 'conversa' ? 'conversa' : 'lista'}
            perfil={sp.perfil === 'admin' ? 'admin' : 'vendedor'}
        />
    );
}
