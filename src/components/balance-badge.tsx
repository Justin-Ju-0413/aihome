'use client';
import { balanceViewFromKey } from '@/lib/balance-view';
import type { CurrentKeyView } from '@/stores/workbench-store';
import { Badge } from '@/components/ui/Badge';

const TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  ok: 'success',
  invalid: 'danger',
  rate_limited: 'warning',
  unsupported: 'neutral',
  never: 'neutral',
  network: 'neutral',
  timeout: 'neutral',
  error: 'neutral',
};

export default function BalanceBadge({ currentKey }: { currentKey: CurrentKeyView | null }) {
  const view = balanceViewFromKey(currentKey);
  return (
    <Badge data-testid={`balance-${view.status}`} tone={TONE[view.status] ?? 'neutral'} title={view.detail}>
      {view.text}
    </Badge>
  );
}
