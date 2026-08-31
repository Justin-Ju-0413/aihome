import type { KeyRecord } from './workbench/types';

export interface BalanceView {
  status: 'ok' | 'never' | 'invalid' | 'network' | 'rate_limited' | 'timeout' | 'unsupported' | 'error';
  text: string;
  detail?: string;
}

// 接受 KeyRecord 或最小形状（站点视图的 currentKey 不含明文/掩码字段）
export function balanceViewFromKey(
  key: Pick<KeyRecord, 'lastCheckStatus' | 'lastBalanceJson'> | null | undefined
): BalanceView {
  if (!key) return { status: 'never', text: '配置 key' };
  const st = key.lastCheckStatus;
  if (st === 'ok' && key.lastBalanceJson) {
    try {
      const parsed = JSON.parse(key.lastBalanceJson) as { balances: { currency: string; total: string; note?: string }[] };
      const b = parsed.balances[0];
      if (!b) return { status: 'error', text: '无余额数据' };
      const text = b.note?.includes('已用') ? `${b.note}` : `${b.currency === 'CNY' ? '¥' : '$'}${b.total}`;
      return { status: 'ok', text, detail: b.note && !b.note.includes('已用') ? b.note : undefined };
    } catch {
      return { status: 'error', text: '数据异常' };
    }
  }
  switch (st) {
    case 'never': return { status: 'never', text: '配置 key' };
    case 'invalid': return { status: 'invalid', text: 'key 无效' };
    case 'network': return { status: 'network', text: '查询失败' };
    case 'rate_limited': return { status: 'rate_limited', text: '请求过频' };
    case 'timeout': return { status: 'timeout', text: '查询超时' };
    case 'unsupported': return { status: 'unsupported', text: '余额查询不可用' };
    default: return { status: 'error', text: '查询失败' };
  }
}
