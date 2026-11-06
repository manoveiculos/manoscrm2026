import './globals.css';
import type { Metadata, Viewport } from 'next';
import { LayoutWrapperV2 } from '@/components/v2/LayoutWrapperV2';
import BlockingAlertModal from '@/components/BlockingAlertModal';
import { RegistrarApp } from '@/components/v2/AppInstalavel';

export const metadata: Metadata = {
  title: 'Manos CRM',
  description: 'Máquina de vender',
  alternates: {
    canonical: 'https://manoscrm.com.br?v=20260429-1136'
  },
  // App instalável no iPhone (o manifesto vem de src/app/manifest.ts).
  appleWebApp: {
    capable: true,
    title: 'Manos CRM',
    statusBarStyle: 'black',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

// Cor da barra do celular quando o CRM está aberto como app.
export const viewport: Viewport = {
  themeColor: '#0C0C0F',
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
        <RegistrarApp />
      </body>
    </html>
  );
}
