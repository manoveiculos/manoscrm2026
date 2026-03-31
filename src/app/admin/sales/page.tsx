import { SalesManagementDashboard } from './SalesManagementDashboard';

export const metadata = {
    title: 'Gestão de Vendas | Admin Manos Veículos',
    description: 'Dashboard administrativo para controle de performance e conversão.',
};

export default function SalesManagementPage() {
    return (
        <main className="min-h-screen bg-[#0C0C0F]">
            <SalesManagementDashboard />
        </main>
    );
}
