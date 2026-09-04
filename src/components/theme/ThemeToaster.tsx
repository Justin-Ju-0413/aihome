'use client';

import { Toaster } from 'sonner';
import { useTheme } from './ThemeProvider';

/** sonner 弹窗配色跟随应用主题。 */
export function ThemeToaster() {
  const { theme } = useTheme();
  return <Toaster position="bottom-right" theme={theme} />;
}
