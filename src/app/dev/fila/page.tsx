import { notFound } from 'next/navigation';
import { PreviewFila } from './PreviewFila';

export const dynamic = 'force-dynamic';

/**
 * PRÉVIA da Minha Fila e do menu por perfil com dados FICTÍCIOS.
 * Só existe fora de produção (o proxy também só libera /dev fora de produção).
 * Serve para conferir a tela em 375 px e tirar os prints da revisão sem
 * login e sem ler dado de cliente.
 *
 *   /dev/fila                     → Minha Fila (vendedor)
 *   /dev/fila?vista=menu          → menu do vendedor aberto
 *   /dev/fila?vista=menu&perfil=gestor|admin
 *   /dev/fila?instalar=android|ios  → com o convite para instalar o app
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ vista?: string; perfil?: string; instalar?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const sp = await searchParams;
    const perfil = sp.perfil === 'admin' || sp.perfil === 'gestor' ? sp.perfil : 'vendedor';
    const instalar = sp.instalar === 'android' || sp.instalar === 'ios' ? sp.instalar : null;
    return <PreviewFila vista={sp.vista === 'menu' ? 'menu' : 'fila'} perfil={perfil} instalar={instalar} />;
}
