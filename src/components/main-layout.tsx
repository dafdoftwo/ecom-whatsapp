'use client';

import Navigation from '@/components/Navigation';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <div className="w-64 flex-shrink-0">
        <Navigation />
      </div>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
} 