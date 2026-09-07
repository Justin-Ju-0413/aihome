import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: React.ReactNode;
  /** 标题下的说明文字 */
  subtitle?: React.ReactNode;
  /** 标题区右侧/下方的操作按钮 */
  actions?: React.ReactNode;
  align?: 'center' | 'left';
  className?: string;
}

/** 全站统一页头:衬线大标题 + 分隔线 + 副标题,与玻璃体系配套(header 语义元素,供测试/无障碍定位)。 */
export function PageHeader({ title, subtitle, actions, align = 'center', className }: PageHeaderProps) {
  if (align === 'left') {
    return (
      <header className={cn('flex items-end justify-between mb-6', className)}>
        <div>
          <h1 className="font-heading text-3xl font-bold text-heading">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </header>
    );
  }

  return (
    <header className={cn('px-6 py-8 text-center', className)}>
      <h1 className="font-heading text-3xl font-bold text-heading">{title}</h1>
      <div className="w-16 h-px bg-divider mx-auto mt-3" />
      {subtitle && <p className="text-sm text-muted mt-2">{subtitle}</p>}
      {actions && <div className="flex items-center justify-center gap-3 mt-6">{actions}</div>}
    </header>
  );
}
