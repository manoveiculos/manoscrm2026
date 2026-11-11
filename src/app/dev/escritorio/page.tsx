import { notFound } from 'next/navigation';
import { DemoEscritorio } from './DemoEscritorio';

export const dynamic = 'force-dynamic';

/**
 * PROTÓTIPO do escritório animado da Central dos Agentes.
 * DADOS DE DEMONSTRAÇÃO + simulador de eventos — só existe fora de produção.
 * A tela real (/agentes) continua usando só registros reais.
 */
export default function Page() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <DemoEscritorio />;
}
