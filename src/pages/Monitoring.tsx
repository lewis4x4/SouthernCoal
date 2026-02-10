import { Link } from 'react-router-dom';
import { Activity, ArrowLeft } from 'lucide-react';

export function Monitoring() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-12 text-center">
      <div className="inline-flex rounded-2xl bg-orange-500/10 p-4">
        <Activity className="h-10 w-10 text-orange-400" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-text-primary">
        Real-Time Monitoring
      </h1>

      <p className="text-text-secondary">
        Live alert stream, exceedance tracking, and interactive state map. This module will
        subscribe to Supabase Realtime for immediate notification of violations, near-misses, and
        system events across all 5 states.
      </p>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-left">
        <h3 className="mb-3 text-sm font-medium text-text-secondary">Coming Soon</h3>
        <ul className="space-y-2 text-sm text-text-muted">
          <li>Real-time alert stream (WebSocket via Supabase Realtime)</li>
          <li>Active exceedance map with state/site drill-down</li>
          <li>Exceedance table with parameter, limit, and result details</li>
          <li>Noncompliance notification generator</li>
          <li>Corrective action tracking</li>
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
