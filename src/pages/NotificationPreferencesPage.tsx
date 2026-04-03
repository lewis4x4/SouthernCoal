import { Bell, Mail, Smartphone } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { EVENT_TYPE_LABELS } from '@/types/notifications';
import type { NotificationEventType } from '@/types/notifications';

function ChannelToggle({
  enabled,
  onChange,
  label,
  icon,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors',
        enabled
          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
          : 'bg-white/[0.02] border-white/[0.08] text-text-muted hover:bg-white/[0.05]',
      )}
      title={`${enabled ? 'Disable' : 'Enable'} ${label}`}
      aria-label={`${enabled ? 'Disable' : 'Enable'} ${label}`}
    >
      {icon}
      {label}
    </button>
  );
}

export function NotificationPreferencesPage() {
  const { allEventTypes, getPreference, updatePreference, loading } = useNotificationPreferences();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Group event types by category
  const groups: { label: string; types: NotificationEventType[] }[] = [
    {
      label: 'Deadlines & Compliance',
      types: ['deadline_approaching', 'deadline_overdue', 'exceedance_detected'],
    },
    {
      label: 'Corrective Actions',
      types: ['corrective_action_assigned', 'corrective_action_due'],
    },
    {
      label: 'Governance',
      types: ['governance_issue_raised', 'governance_escalated'],
    },
    {
      label: 'Field Operations',
      types: ['field_visit_completed', 'readiness_check_failed', 'readiness_gate_overridden'],
    },
    {
      label: 'Data & Uploads',
      types: ['correction_submitted', 'correction_reviewed', 'upload_processed', 'upload_failed', 'sync_conflict'],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-amber-500/10 p-2.5">
          <Bell className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Notification Preferences
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Choose how you receive notifications for each event type. Emergency-level notifications always use all channels.
          </p>
        </div>
      </div>

      {/* Channel legend */}
      <div className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Bell size={14} /> In-App
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Mail size={14} /> Email
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Smartphone size={14} /> SMS
        </div>
      </div>

      {/* Preference groups */}
      {groups.map((group) => (
        <div key={group.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="text-sm font-semibold text-text-primary">{group.label}</h3>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {group.types
              .filter((t) => allEventTypes.includes(t))
              .map((eventType) => {
                const pref = getPreference(eventType);
                return (
                  <div
                    key={eventType}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <span className="text-sm text-text-secondary">
                      {EVENT_TYPE_LABELS[eventType]}
                    </span>
                    <div className="flex items-center gap-2">
                      <ChannelToggle
                        enabled={pref.in_app_enabled}
                        onChange={(v) => updatePreference(eventType, 'in_app_enabled', v)}
                        label="In-App"
                        icon={<Bell size={12} />}
                      />
                      <ChannelToggle
                        enabled={pref.email_enabled}
                        onChange={(v) => updatePreference(eventType, 'email_enabled', v)}
                        label="Email"
                        icon={<Mail size={12} />}
                      />
                      <ChannelToggle
                        enabled={pref.sms_enabled}
                        onChange={(v) => updatePreference(eventType, 'sms_enabled', v)}
                        label="SMS"
                        icon={<Smartphone size={12} />}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default NotificationPreferencesPage;
