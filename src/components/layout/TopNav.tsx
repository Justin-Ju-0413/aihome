'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { DictKey } from '@/lib/i18n';

const navItems: Array<{ href: string; labelKey: DictKey; testId: string }> = [
  { href: '/board', labelKey: 'nav.board', testId: 'nav-board' },
  { href: '/graph', labelKey: 'nav.graph', testId: 'nav-graph' },
  { href: '/agents', labelKey: 'nav.agents', testId: 'nav-agents' },
  { href: '/usage', labelKey: 'nav.usage', testId: 'nav-usage' },
  { href: '/workbench', labelKey: 'nav.workbench', testId: 'nav-workbench' },
  { href: '/sync', labelKey: 'nav.sync', testId: 'nav-sync' },
  { href: '/skills', labelKey: 'nav.registry', testId: 'nav-skills' },
  { href: '/console', labelKey: 'nav.console', testId: 'nav-console' },
  { href: '/settings', labelKey: 'nav.settings', testId: 'nav-settings' },
];

export function TopNav() {
  const pathname = usePathname();
  const { t, lang, setLang } = useI18n();

  return (
    <nav className="sticky top-0 z-40 glass-nav border-b border-divider px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo - Left */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-heading text-2xl font-bold text-primary tracking-tight">AIHome</span>
        </Link>

        {/* Navigation + language switch - Right */}
        <div className="flex items-center gap-6">
          <ul className="flex items-center gap-8">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={item.testId}
                    className={cn(
                      'text-sm font-medium tracking-widest transition-colors pb-1',
                      isActive
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-secondary hover:text-primary'
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* 中 / EN 语言切换 */}
          <div
            className="flex items-center gap-1 text-xs rounded-md border border-card-border px-1.5 py-1"
            data-testid="lang-switch"
          >
            <button
              onClick={() => setLang('zh')}
              className={cn(
                'px-1.5 py-0.5 rounded transition-colors',
                lang === 'zh' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted hover:text-primary'
              )}
            >
              中
            </button>
            <span className="text-divider">/</span>
            <button
              onClick={() => setLang('en')}
              className={cn(
                'px-1.5 py-0.5 rounded transition-colors',
                lang === 'en' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted hover:text-primary'
              )}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
