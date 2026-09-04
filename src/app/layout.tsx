import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { TopNav } from '@/components/layout/TopNav';
import { GlassCursor } from '@/components/layout/GlassCursor';
import { LanguageProvider } from '@/lib/i18n';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'AIHome - Agent Manager',
  description: 'Visual management system for AI Agents and Skills',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning: 浏览器翻译插件（Trancy/有道）会在 hydrate 前往 <html> 注入属性
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} font-body`}>
        <LanguageProvider>
          <GlassCursor />
          <div className="flex flex-col min-h-screen">
            <TopNav />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
          <Toaster position="bottom-right" />
        </LanguageProvider>
      </body>
    </html>
  );
}
