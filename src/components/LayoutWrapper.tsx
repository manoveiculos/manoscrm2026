'use client';

import { Navigation } from './Navigation';
import { BackgroundDecor } from './BackgroundDecor';
import { usePathname } from 'next/navigation';

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    return (
        <>
            <BackgroundDecor />
            <div className="flex min-h-screen">
                {!isLoginPage && <Navigation />}
                <main className={`flex-1 p-4 md:p-8 animate-in fade-in duration-1000 ${!isLoginPage ? 'md:ml-72' : ''}`}>
                    <div className="mx-auto max-w-7xl">
                        {children}
                    </div>
                </main>
            </div>
        </>
    );
}
