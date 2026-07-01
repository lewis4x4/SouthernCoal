import { Bell } from 'lucide-react';
import { cn } from '@/lib/cn';

interface NotificationBellProps {
  unreadCount: number;
  isExpanded: boolean;
  onClick: () => void;
}

/** Sidebar notification bell — styled for dark charcoal nav. */
export function NotificationBell({ unreadCount, isExpanded, onClick }: NotificationBellProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
        'text-[#B8B2A8] hover:bg-[rgba(231,227,219,0.05)] hover:text-qo-sidebar-text',
        !isExpanded && 'justify-center',
      )}
      title="Notifications"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <Bell className="h-5 w-5 shrink-0" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 left-6 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-qo-risk px-1 text-[10px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      {isExpanded && <span className="whitespace-nowrap">Notifications</span>}
      {isExpanded && unreadCount > 0 && (
        <span className="ml-auto inline-flex items-center rounded-full border border-qo-risk/30 bg-qo-risk/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#E8A89A]">
          {unreadCount}
        </span>
      )}
    </button>
  );
}
