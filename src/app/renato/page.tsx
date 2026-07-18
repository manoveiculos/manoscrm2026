'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ScootersApp from './_app/ScootersApp';

const ALLOWED = ['renato@manos.com.br', 'alexandre_gorges@hotmail.com'];

const center: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: '#F3F6F5', color: '#5C6B66', fontFamily: "'Inter', sans-serif", textAlign: 'center', padding: 24,
};

export default function RenatoPage() {
    const [allowed, setAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        (async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const email = (session?.user?.email || '').toLowerCase();
            if (ALLOWED.includes(email)) { setAllowed(true); return; }
            // admin do CRM também entra
            if (session?.user?.id) {
                const { data: c } = await supabase.from('consultants_manos_crm').select('role').eq('auth_id', session.user.id).maybeSingle();
                setAllowed(c?.role === 'admin');
            } else setAllowed(false);
        })();
    }, []);

    if (allowed === null) return <div style={center}>Verificando acesso…</div>;
    if (!allowed) return (
        <div style={center}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🛴</div>
            <h1 style={{ margin: 0, fontSize: 20, color: '#14201C', fontFamily: "'Space Grotesk', sans-serif" }}>Acesso restrito</h1>
            <p style={{ marginTop: 6, fontSize: 14 }}>Este app é exclusivo do Renato.</p>
        </div>
    );

    return <ScootersApp />;
}
