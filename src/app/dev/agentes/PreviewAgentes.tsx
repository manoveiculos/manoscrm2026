'use client';

import type { CentralAgentes } from '@/lib/agentes/estado';
import { CentralView } from '@/app/agentes/_components/CentralView';

export function PreviewAgentes({ dados, agora }: { dados: CentralAgentes; agora: number }) {
    return (
        <main className="min-h-screen bg-[#03060b] text-white px-4 py-5">
            <CentralView dados={dados} conexao="previa" agora={agora} somenteLeitura />
        </main>
    );
}
