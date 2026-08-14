import { WidgetApp } from '@/components/widget/WidgetApp';

export const metadata = { title: 'AIHome Widget' };

export default function WidgetPage() {
  return (
    <main className="h-screen w-screen overflow-hidden p-1">
      <WidgetApp />
    </main>
  );
}
