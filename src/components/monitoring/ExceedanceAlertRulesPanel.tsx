import { Bell, Mail, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

const RULES = [
  {
    rule: 'Critical',
    when: 'Open or new critical exceedance (>100% over limit)',
    channels: 'In-app + email; SMS on-call for critical',
    limit: '1 / hour',
  },
  {
    rule: 'Major',
    when: 'Open or new major exceedance (>50% over limit)',
    channels: 'Per notification preferences',
    limit: '1 / hour',
  },
  {
    rule: 'Digest',
    when: '≥10 open moderate exceedances, or manual Send digest',
    channels: 'exceedance_digest preference',
    limit: '1 / 24h',
  },
] as const;

export function ExceedanceAlertRulesPanel() {
  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-orange-500/15">
        <Bell size={16} className="text-orange-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Exceedance alert rules</h3>
          <p className="text-xs text-text-muted mt-1">
            Triggered after lab import when permit limits are exceeded. Configure channels in{' '}
            <Link to="/admin/notifications" className="text-qo-accent hover:text-qo-accent">
              Notification Preferences
            </Link>
            .
          </p>
        </div>
      </div>
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
            <tr key={r.rule} className="border-t border-white/[0.03]">
              <td className="py-2 px-4 font-medium text-text-primary">{r.rule}</td>
              <td className="py-2 px-4 text-text-secondary">{r.when}</td>
              <td className="py-2 px-4 text-text-muted">{r.channels}</td>
              <td className="py-2 px-4 text-text-muted whitespace-nowrap">{r.limit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-orange-500/10 flex flex-wrap gap-3 text-[10px] text-text-muted">
        <span className="flex items-center gap-1">
          <Mail size={12} /> Resend
        </span>
        <span className="flex items-center gap-1">
          <Smartphone size={12} /> Twilio (critical, on-call list)
        </span>
      </div>
    </div>
  );
}
