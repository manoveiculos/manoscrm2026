'use client';

import { usePathname } from 'next/navigation';
import { NavigationV2 } from '@/components/v2/NavigationV2';
import { BackgroundDecor } from '@/components/BackgroundDecor';
import { ConsultantAlertModal } from '@/components/v2/ConsultantAlertModal';

export const LayoutWrapperV2 = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname() || '';
    const isEmbed = pathname.endsWith('/embed');

    if (isEmbed) {
        return (
            <div className="flex min-h-screen bg-[#03060b] font-inter text-white overflow-hidden w-full max-w-[100vw]">
                <BackgroundDecor />
                <main className="flex-1 min-h-screen w-full relative z-10">
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
            <main className="flex-1 min-h-screen w-full relative z-10 flex justify-start items-start">
                <div className="h-full w-full p-4 md:p-0 mt-14 md:mt-0 pt-16 md:pt-0 flex flex-col items-start justify-start overflow-x-hidden">
                    {children}
                </div>
            </main>
        </div>
    );
};
