'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/board', label: 'BOARD', testId: 'nav-board' },
  { href: '/graph', label: 'GRAPH', testId: 'nav-graph' },
  { href: '/agents', label: 'AGENTS', testId: 'nav-agents' },
  { href: '/settings', label: 'SETTINGS', testId: 'nav-settings' },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-divider px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo - Left */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-heading text-2xl font-bold text-primary tracking-tight">AIHome</span>
        </Link>

        {/* Navigation - Right */}
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
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
