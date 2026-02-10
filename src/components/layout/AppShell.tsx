import type { ReactNode } from 'react';
import { TopNav } from '@/components/navigation/TopNav';
import { DisclaimerFooter } from '@/components/legal/DisclaimerFooter';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />

      {/* Main content — pt-16 accounts for fixed TopNav height */}
      <main className="flex-1 px-6 py-6 pt-[88px]">{children}</main>

      <DisclaimerFooter />
    </div>
  );
}
