import './globals.css';
import { LayoutWrapperV2 } from '@/components/v2/LayoutWrapperV2';

export const metadata = {
  title: 'Manos CRM V2',
  description: 'Sistema CRM Premium Intelligence',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <LayoutWrapperV2>{children}</LayoutWrapperV2>
      </body>
    </html>
  );
}
