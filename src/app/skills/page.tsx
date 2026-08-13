import { RegistryPanel } from '@/components/registry/RegistryPanel';

export default function SkillsPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold">技能注册表</h1>
      <p className="mb-4 text-sm text-gray-500">
        规范副本只存一份，通过符号链接分发到各 agent 平台（Claude Code / Codex / WorkBuddy）。真实目录不会被覆盖。
      </p>
      <RegistryPanel />
    </main>
  );
}
