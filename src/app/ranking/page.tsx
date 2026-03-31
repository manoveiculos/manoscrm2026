import { RankingPageClient } from './RankingPageClient';

export const metadata = {
    title: 'Ranking de Vendas | Manos Veículos',
    description: 'Leaderboard de performance dos consultores Manos Veículos.',
};

export default function RankingPage() {
    return (
        <main className="min-h-screen bg-[#0C0C0F]">
            <RankingPageClient />
        </main>
    );
}
