import { Sparkles } from 'lucide-react';

const ROLE_SUGGESTIONS: Record<string, string[]> = {
  executive: [
    "What's our total penalty exposure this quarter?",
    'Which facilities have the most exceedances?',
    'How many permits are expiring in the next 90 days?',
    'What corrective actions are overdue?',
    "What's the average lab turnaround time this quarter?",
    'How many DMRs are overdue for submission?',
    'Consent decree obligation status summary',
    'Any enforcement actions received in the last 90 days?',
  ],
  environmental_manager: [
    'Show me all exceedances in the last 30 days',
    'Which outfalls are closest to their permit limits?',
    'List all permits expiring in the next 90 days',
    'What corrective actions are assigned to my team?',
    'Show me all iron results above the permit limit this month',
    'Which lab imports had rejected rows?',
    'List all DMRs in draft status',
    'What consent decree obligations are overdue?',
    'Show me all open NOVs',
    'When is our next scheduled audit?',
  ],
  site_manager: [
    "Show me my facility's exceedance history",
    'Any overdue sampling events at my sites?',
    'Open corrective actions assigned to my team',
    'How many active permits at my sites?',
    'Recent lab results for my sites',
    'DMR submission status for my facilities',
    'Any enforcement actions at my sites?',
  ],
  field_sampler: [
    'What samples are due this week?',
    'Show my recent sampling schedule',
    'Which outfalls do I need to sample next?',
    'Show my recent sampling events with lab results',
    'Any hold time violations on my samples?',
  ],
  lab_tech: [
    'Recent lab data imports and their status',
    'Any hold time violations in recent imports?',
    'Show rejected rows from the last import',
    'Which imports are still processing?',
    'Lab results summary for this month by parameter',
  ],
  safety_manager: [
    'Open corrective actions at my sites',
    'Recent exceedances at my facilities',
    'Compliance audit schedule for my sites',
    'Open audit findings at my facilities',
  ],
  admin: [
    'System-wide compliance summary',
    'Permit inventory by state',
    'Active sites count by organization',
    'DMR submission compliance rate by state',
    'Lab import error rate this month',
    'Consent decree obligations summary',
    'All enforcement actions this year',
  ],
  read_only: [
    'Current compliance status by state',
    'Recent exceedance summary',
    'Permit inventory overview',
    'Consent decree obligation overview',
    'Recent enforcement action summary',
  ],
};

interface SearchSuggestionsProps {
  userRole: string;
  onSelect: (query: string) => void;
}

export function SearchSuggestions({ userRole, onSelect }: SearchSuggestionsProps) {
  const suggestions = ROLE_SUGGESTIONS[userRole] ?? ROLE_SUGGESTIONS.read_only ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Sparkles className="h-3 w-3" />
        <span>Suggested queries</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
