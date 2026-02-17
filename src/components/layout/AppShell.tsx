import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/navigation/Sidebar';
import { DisclaimerFooter } from '@/components/legal/DisclaimerFooter';
import { cn } from '@/lib/cn';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  // Sync with sidebar pinned state for proper margin
  const [isPinned, setIsPinned] = useState(() => {
    const saved = localStorage.getItem('sidebar-pinned');
    return saved === 'true';
  });

  // Listen for sidebar pin changes
  useEffect(() => {
    const handlePinChange = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      setIsPinned(customEvent.detail);
    };

    window.addEventListener('sidebar-pin-change', handlePinChange);
    return () => window.removeEventListener('sidebar-pin-change', handlePinChange);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* Main content — ml accounts for sidebar width */}
      <div
        className={cn(
          'flex min-h-screen flex-1 flex-col transition-[margin] duration-300',
          isPinned ? 'ml-56' : 'ml-16'
        )}
      >
        <main className="flex-1 px-6 py-6">{children}</main>
        <DisclaimerFooter />
      </div>
    </div>
  );
}
