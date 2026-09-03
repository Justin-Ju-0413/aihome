'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import MarkdownAgentsSection from '@/components/agents/MarkdownAgentsSection';
import InstalledToolsSection from '@/components/agents/InstalledToolsSection';

export default function AgentsPage() {
  const { t } = useI18n();
  const [section, setSection] = useState<'tools' | 'markdown'>('tools');

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 pt-8 pb-4 text-center">
        <h1 className="font-heading text-3xl font-bold text-heading">{t('agents.page.title')}</h1>
        <div className="w-16 h-px bg-divider mx-auto mt-3" />

        <div className="flex items-center justify-center mt-5" data-testid="agents-section-tabs">
          <div className="flex border border-card-border rounded-lg glass-input p-1">
            <button
              onClick={() => setSection('tools')}
              data-testid="agents-tab-tools"
              className={cn(
                'px-4 py-1.5 rounded-md text-sm',
                section === 'tools' ? 'bg-primary/10 text-primary font-medium' : 'text-muted hover:text-text-body',
              )}
            >
              {t('tools.tabTools')}
            </button>
            <button
              onClick={() => setSection('markdown')}
              data-testid="agents-tab-markdown"
              className={cn(
                'px-4 py-1.5 rounded-md text-sm',
                section === 'markdown' ? 'bg-primary/10 text-primary font-medium' : 'text-muted hover:text-text-body',
              )}
            >
              {t('tools.tabMarkdown')}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        {section === 'tools' ? <InstalledToolsSection /> : <MarkdownAgentsSection />}
      </div>
    </div>
  );
}
