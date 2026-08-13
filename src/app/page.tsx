import { redirect } from 'next/navigation';
import { workspaceConfigExists } from '@/lib/workspace-config';

// build 时无 AIHOME_CONFIG_DIR env，静态渲染会固化错误跳转；强制每次请求动态判断
export const dynamic = 'force-dynamic';

export default async function Home() {
  // 首次启动（无 config.json）：引导选择工作区目录
  if (!(await workspaceConfigExists())) {
    redirect('/onboarding');
  }
  redirect('/board');
}
