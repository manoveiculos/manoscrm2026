'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NavigationV2 } from '@/components/v2/NavigationV2';
import { BackgroundDecor } from '@/components/BackgroundDecor';
import { ConsultantAlertModal } from '@/components/v2/ConsultantAlertModal';
import { TrafficAlertBanner } from '@/components/v2/TrafficAlertBanner';
import { createClient } from '@/lib/supabase/client';

export const LayoutWrapperV2 = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname() || '';
    const isEmbed = pathname.endsWith('/embed');
    const isLogin = pathname === '/login';
    const isRepasse = pathname.startsWith('/repasse'); // app mobile do Paulo, sem sidebar
    const supabase = createClient();
    const router = useRouter();

    useEffect(() => {
        if (isLogin || isEmbed) return;

        let alive = true;
        async function checkAccess() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (!user) return;

                // E-mail administrador de bypass
                if (user.email?.toLowerCase() === 'alexandre_gorges@hotmail.com') {
                    return;
                }

                // Consultar se o consultor existe e está ativo no banco
                const { data: consultant, error } = await supabase
                    .from('consultants_manos_crm')
                    .select('status')
                    .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
                    .maybeSingle();

                if (error) {
                    console.error('Erro ao verificar acesso:', error);
                    return;
                }

                if (alive) {
                    if (!consultant || consultant.status !== 'active') {
                        console.warn('Usuário logado inativo ou não autorizado no CRM. Desconectando...');
                        await supabase.auth.signOut();
                        window.location.href = '/login?error=unauthorized';
                    }
                }
            } catch (err) {
                console.error('Erro ao checar acesso no wrapper:', err);
            }
        }

        checkAccess();
        return () => { alive = false; };
    }, [pathname, isLogin, isEmbed, supabase, router]);

    // App mobile do Paulo (/repasse): casca própria com bottom-nav, sem o sidebar do desktop
    if (isRepasse) {
        return (
            <div className="min-h-screen bg-[#0C0C0F] font-inter text-white w-full max-w-[100vw]">
                {children}
            </div>
        );
    }

    if (isEmbed || isLogin) {
        return (
            <div className="flex min-h-screen bg-[#03060b] font-inter text-white overflow-hidden w-full max-w-[100vw]">
                <BackgroundDecor />
                <main className="flex-1 min-h-screen w-full relative">
                    <div className="h-full w-full">
                        {children}
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#03060b] font-inter text-white w-full max-w-[100vw] overflow-x-hidden">
            <BackgroundDecor />
            <NavigationV2 />
            <ConsultantAlertModal />
            <main className="flex-1 min-h-screen w-full relative flex flex-col justify-start items-start">
                <TrafficAlertBanner />
                <div className="h-full w-full p-4 md:p-0 mt-14 md:mt-0 pt-16 md:pt-0 flex flex-col items-start justify-start overflow-x-hidden">
                    {children}
                </div>
            </main>
        </div>
    );
};
