'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted disabled:opacity-50 transition-shadow';

/** 全站统一文本输入框。 */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'px-3 py-2 text-sm', className)} {...props} />;
}

/** 全站统一多行文本域。 */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'px-3 py-2 text-sm', className)} {...props} />;
}

/** 统一表单标签。 */
export function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-medium text-text-body mb-2', className)} {...props} />;
}
