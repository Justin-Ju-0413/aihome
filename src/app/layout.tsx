import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { TopNav } from '@/components/layout/TopNav';
import { GlassCursor } from '@/components/layout/GlassCursor';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ThemeToaster } from '@/components/theme/ThemeToaster';
import { LanguageProvider } from '@/lib/i18n';

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
  // suppressHydrationWarning: 浏览器翻译插件（Trancy/有道）与 ThemeScript 都会在 hydrate 前改动 <html>
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} ${playfair.variable} font-body`}>
        <ThemeProvider>
          <LanguageProvider>
            <GlassCursor />
            <div className="flex flex-col min-h-screen">
              <TopNav />
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
            <ThemeToaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
