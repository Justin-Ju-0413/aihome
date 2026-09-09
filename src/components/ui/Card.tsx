'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 关闭内边距,用于自定义内容的容器卡片 */
  flush?: boolean;
}

/** 全站统一玻璃卡片:glass-panel + 圆角 + 分隔线边框 + 标准内边距。 */
export function Card({ className, flush, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'glass-panel rounded-xl border border-card-border',
        !flush && 'p-5',
        className,
      )}
      {...props}
    />
  );
}
