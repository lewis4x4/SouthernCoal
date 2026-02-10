import { Link } from 'react-router-dom';
import { Settings, ArrowLeft } from 'lucide-react';

export function Admin() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-12 text-center">
      <div className="inline-flex rounded-2xl bg-slate-500/10 p-4">
        <Settings className="h-10 w-10 text-slate-400" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-text-primary">
        Administration
      </h1>

      <p className="text-text-secondary">
        User management, role assignments, notification preferences, and system configuration.
        Manage access across 8 roles with site-level or global scoping.
      </p>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-left">
        <h3 className="mb-3 text-sm font-medium text-text-secondary">Coming Soon</h3>
        <ul className="space-y-2 text-sm text-text-muted">
          <li>User profiles — CRUD on user_profiles table</li>
          <li>Role assignments — site-scoped and global via user_role_assignments</li>
          <li>Notification preferences — email/SMS/in-app per event type</li>
          <li>State regulatory configs — agency and DMR system settings</li>
          <li>Audit log viewer — read-only browse of all system actions</li>
        </ul>
      </div>

      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>
    </div>
  );
}
