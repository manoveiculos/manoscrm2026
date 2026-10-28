'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GarimpeiroManosPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/compras');
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center bg-[#03060b] text-white/40 font-bold uppercase tracking-widest text-xs h-screen">
      Redirecionando para Central de Compras...
    </div>
  );
}
