import type { ReactNode } from 'react';
import { MarketingProvider } from './MarketingProvider';

export default function MarketingLayout({ children }: { children: ReactNode }) {
    return <MarketingProvider>{children}</MarketingProvider>;
}
