import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import type { DiscrepancyRuleGate, DiscrepancyReadinessLevel } from '@/lib/discrepancyDetectionReadiness';
import { useState } from 'react';

interface Props {
  headline: string;
  overall: DiscrepancyReadinessLevel;
  gates: DiscrepancyRuleGate[];
  canRunMeaningfulDetection: boolean;
  loading: boolean;
  onRefresh: () => void;
}

const OVERALL_STYLE: Record<
  DiscrepancyReadinessLevel,
  { border: string; text: string; label: string }
> = {
  ready: {
    border: 'border-emerald-500/25 bg-emerald-500/[0.04]',
    text: 'text-qo-sage-text',
    label: 'Ready',
  },
  partial: {
    border: 'border-amber-500/25 bg-amber-500/[0.04]',
    text: 'text-amber-300',
    label: 'Partial',
  },
  echo_only: {
    border: 'border-qo-accent/25 bg-qo-accent/[0.04]',
    text: 'text-qo-accent',
    label: 'ECHO only',
  },
  blocked: {
    border: 'border-red-500/20 bg-red-500/[0.04]',
    text: 'text-qo-risk',
    label: 'Blocked',
  },
};

function GateIcon({ status }: { status: DiscrepancyRuleGate['status'] }) {
  if (status === 'ready') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === 'degraded') return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-qo-risk shrink-0" />;
}

export function DiscrepancyReadinessPanel({
  headline,
  overall,
  gates,
  canRunMeaningfulDetection,
  loading,
  onRefresh,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const style = OVERALL_STYLE[overall];

  return (
    <SpotlightCard className={cn('p-4 border', style.border)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-text-secondary hover:text-text-primary"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <h2 className="text-sm font-semibold text-text-primary">Detection readiness</h2>
            <span className={cn('text-[10px] font-medium uppercase tracking-wide', style.text)}>
              {style.label}
            </span>
          </div>
          <p className="text-xs text-text-secondary pl-6">{headline}</p>
          {!canRunMeaningfulDetection && overall !== 'blocked' && (
            <p className="text-[10px] text-text-muted pl-6 max-w-2xl">
              Run Detection is available, but upload internal permits, exceedances, and DMR line items
              before treating Rule 2 triage as complete.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/compliance"
            className="text-[10px] px-2 py-1 rounded border border-black/[0.08] text-text-secondary hover:text-text-primary"
          >
            Upload Dashboard
          </Link>
          <Link
            to="/compliance/external-data"
            className="text-[10px] px-2 py-1 rounded border border-black/[0.08] text-text-secondary hover:text-text-primary"
          >
            ECHO sync
          </Link>
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-black/[0.08] text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>
      </div>

      {expanded && (
        <ul className="mt-3 pl-6 space-y-2 border-t border-black/[0.06] pt-3">
          {gates.map((gate) => (
            <li key={gate.id} className="flex gap-2 text-xs">
              <GateIcon status={gate.status} />
              <div className="min-w-0">
                <p className="font-medium text-text-primary">{gate.label}</p>
                <p className="text-text-secondary">{gate.summary}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{gate.recommendation}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SpotlightCard>
  );
}
