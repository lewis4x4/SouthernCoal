import { useEffect, useRef } from 'react';
import { X, CheckCheck, Clock, AlertTriangle, AlertOctagon, Siren } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PRIORITY_COLORS } from '@/types/notifications';
import type { Notification, NotificationPriority } from '@/types/notifications';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}

const PRIORITY_ICONS: Record<NotificationPriority, React.ReactNode> = {
  info: <Clock size={14} />,
  warning: <AlertTriangle size={14} />,
  urgent: <AlertTriangle size={14} />,
  critical: <AlertOctagon size={14} />,
  emergency: <Siren size={14} />,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationDrawer({
  open,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: NotificationDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing from the bell click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const unread = notifications.filter((n) => !n.in_app_read_at);

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-label="Notifications"
      className="fixed left-16 top-0 z-[60] flex h-screen w-[min(320px,calc(100vw-64px))] flex-col border-r border-white/[0.08] bg-crystal-surface/98 backdrop-blur-xl shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Notifications</h2>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <button
              onClick={onMarkAllRead}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-muted hover:bg-white/[0.05] hover:text-text-secondary transition-colors"
              title="Mark all as read"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.05] hover:text-text-secondary transition-colors"
            aria-label="Close notifications"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-text-muted">
            No notifications
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {notifications.map((notification) => {
              const isUnread = !notification.in_app_read_at;
              const colors = PRIORITY_COLORS[notification.priority];

              return (
                <div
                  key={notification.id}
                  className={cn(
                    'group relative px-4 py-3 transition-colors hover:bg-white/[0.02] cursor-pointer',
                    isUnread && 'bg-white/[0.01]',
                  )}
                  onClick={() => {
                    if (isUnread) onMarkRead(notification.id);
                  }}
                >
                  {/* Unread indicator */}
                  {isUnread && (
                    <div className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-cyan-400" />
                  )}

                  <div className="flex items-start gap-2">
                    {/* Priority icon */}
                    <span className={cn('mt-0.5 shrink-0', colors.text)}>
                      {PRIORITY_ICONS[notification.priority]}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border',
                            colors.bg,
                            colors.border,
                            colors.text,
                          )}
                        >
                          {notification.priority}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {timeAgo(notification.created_at)}
                        </span>
                      </div>

                      <p
                        className={cn(
                          'mt-1 text-xs leading-relaxed',
                          isUnread ? 'text-text-primary font-medium' : 'text-text-secondary',
                        )}
                      >
                        {notification.title}
                      </p>

                      {notification.body && (
                        <p className="mt-0.5 text-[11px] text-text-muted line-clamp-2">
                          {notification.body}
                        </p>
                      )}
                    </div>

                    {/* Dismiss button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(notification.id);
                      }}
                      className="shrink-0 rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:bg-white/[0.05] hover:text-text-secondary transition-all"
                      aria-label="Dismiss notification"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
