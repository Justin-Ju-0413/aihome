export type SkillRow = {
  id: string;
  name: string;
  description: string;
  source_dir: string;
  installed_at: string;
};

export type PlatformRow = {
  name: string;
  enabled: number; // 0 | 1
  install_dir: string;
};

export type SyncStatus = 'linked' | 'broken' | 'conflict' | 'removed' | 'failed';

export type SyncStateRow = {
  skill_id: string;
  platform: string;
  status: SyncStatus;
  error: string;
  linked_at: string;
};

export type NewSkill = {
  name: string;
  description: string;
  source_dir: string;
};
