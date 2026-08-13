import { WidgetApp } from '@/components/widget/WidgetApp';

export const metadata = { title: 'AIHome Widget' };

export default function WidgetPage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-white/95 p-1 dark:bg-gray-900/95">
      <WidgetApp />
    </main>
  );
}
