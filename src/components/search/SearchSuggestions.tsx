import { Sparkles } from 'lucide-react';

const ROLE_SUGGESTIONS: Record<string, string[]> = {
  executive: [
    "What's our total penalty exposure this quarter?",
    'Which facilities have the most exceedances?',
    'How many permits are expiring in the next 90 days?',
    'What corrective actions are overdue?',
  ],
  environmental_manager: [
    'Show me all exceedances in the last 30 days',
    'Which outfalls are closest to their permit limits?',
    'List all permits expiring in the next 90 days',
    'What corrective actions are assigned to my team?',
  ],
  site_manager: [
    "Show me my facility's exceedance history",
    'Any overdue sampling events at my sites?',
    'Open corrective actions assigned to my team',
    'How many active permits at my sites?',
  ],
  field_sampler: [
    'What samples are due this week?',
    'Show my recent sampling schedule',
    'Which outfalls do I need to sample next?',
  ],
  lab_tech: [
    'Recent sampling events awaiting results',
    'Which outfalls have pending samples?',
  ],
  safety_manager: [
    'Open corrective actions at my sites',
    'Recent exceedances at my facilities',
  ],
  admin: [
    'System-wide compliance summary',
    'Permit inventory by state',
    'Active sites count by organization',
  ],
  read_only: [
    'Current compliance status by state',
    'Recent exceedance summary',
    'Permit inventory overview',
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
