import { notFound } from 'next/navigation';
import { PreviewEspelho } from './PreviewEspelho';

export const dynamic = 'force-dynamic';

/**
 * PRÉVIA da tela Gestão → WhatsApp (espelho só leitura) com dados FICTÍCIOS.
 * Só existe fora de produção (o proxy também só libera /dev fora de produção).
 * Serve para conferir a tela sem login e sem ler dado de cliente.
 */
export default function Page() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <PreviewEspelho />;
}
