import { existsSync } from 'fs';
import type { ActiveUsageSource, Checkpoint, ScannedEvent, UsageSource } from '../types';
import { scanCcSwitch } from './ccswitch';
import { scanClaude } from './claude';
import { scanCodex } from './codex';
import { scanOpencode } from './opencode';
import { scanHermes } from './hermes';
import { USAGE_SOURCE_PATHS } from '../paths';
import type { ModelPricing } from '../pricing';

export interface AdapterScan {
  events: ScannedEvent[];
  checkpoint: Checkpoint;
}

type Adapter = (path: string, cp: Checkpoint, pricing: (m: string) => ModelPricing | null) => AdapterScan;

const ADAPTERS: Record<ActiveUsageSource, Adapter> = {
  'cc-switch': (p, cp) => scanCcSwitch(p, cp),
  claude: (p, cp, pricing) => scanClaude(p, cp, pricing),
  codex: (p, cp, pricing) => scanCodex(p, cp, pricing),
  opencode: (p, cp) => scanOpencode(p, cp),
  hermes: (p, cp) => scanHermes(p, cp),
};

export function checkSourceAvailability(id: ActiveUsageSource): { ok: boolean; reason?: string } {
  const p = USAGE_SOURCE_PATHS[id]();
  if (!existsSync(p)) return { ok: false, reason: `not found: ${p}` };
  return { ok: true };
}

export function scanSource(
  id: ActiveUsageSource,
  cp: Checkpoint,
  pricing: (m: string) => ModelPricing | null
): AdapterScan {
  const p = USAGE_SOURCE_PATHS[id]();
  return ADAPTERS[id](p, cp, pricing);
}
