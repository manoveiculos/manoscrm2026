import { notFound } from 'next/navigation';
import { DemoJogo } from './DemoJogo';

export const dynamic = 'force-dynamic';

/**
 * PROVA DE CONCEITO do escritório em jogo (cena isométrica em Canvas 2D).
 * Eventos simulados — só existe fora de produção. A tela real (/agentes) não usa isto ainda.
 */
export default function Page() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <DemoJogo />;
}
