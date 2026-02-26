import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { LayoutWrapper } from "@/components/LayoutWrapper";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: "Manos Veículos | Luxury Lead Management",
  description: "Plataforma de CRM automotivo de alta performance com IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${outfit.variable} dark`}>
      <body className="bg-background font-inter selection:bg-primary/30">
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
