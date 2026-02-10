import { Link } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';

export function Reports() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-12 text-center">
      <div className="inline-flex rounded-2xl bg-emerald-500/10 p-4">
        <FileText className="h-10 w-10 text-emerald-400" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-text-primary">
        Report Generator
      </h1>

      <p className="text-text-secondary">
        Auto-generate court-ready DMRs and quarterly Consent Decree reports from uploaded lab data.
        Select state, permit, and period — the system calculates monthly averages, daily maximums,
        and flags exceedances automatically.
      </p>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-left">
        <h3 className="mb-3 text-sm font-medium text-text-secondary">Coming Soon</h3>
        <ul className="space-y-2 text-sm text-text-muted">
          <li>DMR Generator — state-specific templates (NetDMR, E2DMR, MyTDEC, eDMR)</li>
          <li>Quarterly CD Report — Attachments A–G auto-populated</li>
          <li>Preview, download, and mark-as-submitted workflows</li>
          <li>NODI code handling for missing data</li>
          <li>Export to PDF with compliance disclaimer</li>
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
