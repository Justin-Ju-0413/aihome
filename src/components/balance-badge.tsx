'use client';
import { balanceViewFromKey } from '@/lib/balance-view';
import type { CurrentKeyView } from '@/stores/workbench-store';

const STYLE: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  invalid: 'bg-red-100 text-red-700',
  unsupported: 'bg-gray-100 text-body',
  never: 'bg-gray-100 text-heading',
  network: 'bg-gray-100 text-body',
  rate_limited: 'bg-amber-100 text-amber-800',
  timeout: 'bg-gray-100 text-body',
  error: 'bg-gray-100 text-body',
};

export default function BalanceBadge({ currentKey }: { currentKey: CurrentKeyView | null }) {
  const view = balanceViewFromKey(currentKey);
  return (
    <span
      data-testid={`balance-${view.status}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[view.status] ?? ''}`}
      title={view.detail}
    >
      {view.text}
    </span>
  );
}
