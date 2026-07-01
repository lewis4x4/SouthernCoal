import { Bell, Mail, Smartphone, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ECHO_STALE_DAYS } from '@/hooks/useSyncHealth';

const RULES = [
  {
    severity: 'Critical',
    trigger: 'Any pending or newly detected critical discrepancy (e.g. SNC not tracked)',
    channels: 'In-app + email; SMS to on-call list when configured',
    rateLimit: '1 email / org / hour',
  },
  {
    severity: 'High',
    trigger: 'Pending or new high-severity items (missing violations, large DMR mismatch)',
    channels: 'Per user notification preferences',
    rateLimit: '1 email / org / hour',
  },
  {
    severity: 'Digest',
    trigger: `≥25 pending medium items, or manual "Send digest"`,
    channels: 'Per user preferences (discrepancy_digest event)',
    rateLimit: '1 email / org / 24 hours',
  },
  {
    severity: 'Batch',
    trigger: '≥50 new discrepancies in a single detection run',
    channels: 'Per user preferences',
    rateLimit: '1 email / org / 6 hours',
  },
] as const;

export function ComplianceAlertRulesPanel() {
  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-purple-500/15">
        <Bell size={16} className="text-purple-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Compliance alert rules</h3>
          <p className="text-xs text-text-muted mt-1">
            Fires automatically after ECHO discrepancy detection and weekly sync. Configure channels
            under{' '}
            <Link to="/admin/notifications" className="text-qo-accent hover:text-qo-accent">
              Notification Preferences
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-muted border-b border-black/[0.06]">
              <th className="text-left py-2 px-4 font-medium">Rule</th>
              <th className="text-left py-2 px-4 font-medium">When</th>
              <th className="text-left py-2 px-4 font-medium">Channels</th>
              <th className="text-left py-2 px-4 font-medium">Rate limit</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.severity} className="border-t border-white/[0.03]">
                <td className="py-2 px-4 font-medium text-text-primary">{r.severity}</td>
                <td className="py-2 px-4 text-text-secondary">{r.trigger}</td>
                <td className="py-2 px-4 text-text-muted">{r.channels}</td>
                <td className="py-2 px-4 text-text-muted whitespace-nowrap">{r.rateLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-purple-500/10 flex flex-wrap gap-4 text-[10px] text-text-muted">
        <span className="flex items-center gap-1">
          <Mail size={12} /> Resend (<code className="font-mono">RESEND_API_KEY</code>)
        </span>
        <span className="flex items-center gap-1">
          <Smartphone size={12} /> Twilio critical SMS (
          <code className="font-mono">TWILIO_*</code>, on-call:{' '}
          <code className="font-mono">COMPLIANCE_ALERT_SMS_TO</code>)
        </span>
        <span className="flex items-center gap-1">
          <Info size={12} /> ECHO stale sync: {ECHO_STALE_DAYS}d (task 5.14)
        </span>
      </div>
    </div>
  );
}
