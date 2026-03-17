import { useState, useEffect } from 'react';

/**
 * Hook para detectar se o dispositivo é mobile baseado na largura da janela.
 * Atualizado para evitar problemas de hidratação (SSR vs CSR) e loops de renderização.
 */
export const useIsMobile = (breakpoint: number = 768) => {
    // Inicializamos como null ou false, mas garantimos que o valor real só venha após o mount
    const [isMobile, setIsMobile] = useState<boolean>(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        
        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Executa imediatamente no mount (client-side)
        checkMobile();

        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [breakpoint]);

    // Retorna false durante o SSR e o valor real após a hidratação no cliente
    return isMobile;
};
