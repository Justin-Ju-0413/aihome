import { redirect } from 'next/navigation';
import { workspaceConfigExists } from '@/lib/workspace-config';

export default async function Home() {
  // 首次启动（无 config.json）：引导选择工作区目录
  if (!(await workspaceConfigExists())) {
    redirect('/onboarding');
  }
  redirect('/board');
}
