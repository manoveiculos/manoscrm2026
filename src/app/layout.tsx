import './globals.css';
import { LayoutWrapperV2 } from '@/components/v2/LayoutWrapperV2';
import BlockingAlertModal from '@/components/BlockingAlertModal';

export const metadata = {
  title: 'Manos CRM',
  description: 'Máquina de vender',
  alternates: {
    canonical: 'https://manoscrm.com.br?v=20260429-1136'
  }
};

// Cache buster: 2026-04-29T11:36:00Z

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <LayoutWrapperV2>{children}</LayoutWrapperV2>
        <BlockingAlertModal />
      </body>
    </html>
  );
}
