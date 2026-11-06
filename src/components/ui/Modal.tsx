'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** 底部操作区(按钮组);省略则不渲染 footer */
  footer?: React.ReactNode;
  /** 最大宽度,Tailwind 尺寸类,默认 max-w-md */
  maxWidth?: string;
  children: React.ReactNode;
  className?: string;
}

/** 全站统一模态:scrim 遮罩 + glass-modal 壳 + Esc/点遮罩关闭。 */
export function Modal({
  open,
  onClose,
  title,
  footer,
  maxWidth = 'max-w-md',
  children,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 scrim flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'glass-modal rounded-xl border border-card-border shadow-xl w-full animate-fade-in',
          maxWidth,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-heading text-xl font-bold text-heading">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-muted transition-colors hover:text-primary hover:bg-primary/10"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer !== undefined && (
          <div className="px-6 py-4 border-t border-divider flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
