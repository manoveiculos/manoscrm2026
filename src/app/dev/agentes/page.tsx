import { notFound } from 'next/navigation';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { carregarEntradaAgentes } from '@/lib/agentes/carregar';
import { estadoDosAgentes } from '@/lib/agentes/estado';
import { PreviewAgentes } from './PreviewAgentes';

export const dynamic = 'force-dynamic';

/**
 * PRÉVIA da Central dos Agentes com os DADOS REAIS, em modo só leitura (nenhum
 * botão grava). Só existe fora de produção — em produção dá 404 e o proxy não
 * libera /dev. Serve para os prints da revisão sem precisar de login local.
 */
export default async function Page() {
    if (process.env.NODE_ENV === 'production') notFound();
    const agora = Date.now();
    const dados = estadoDosAgentes(await carregarEntradaAgentes(createAdminClient(), agora));
    return <PreviewAgentes dados={dados} agora={agora} />;
}
