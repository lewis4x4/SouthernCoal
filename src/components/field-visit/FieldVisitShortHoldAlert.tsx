import { AlertTriangle, Clock3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FieldVisitUrgencyFlag } from '@/lib/fieldVisitRequirements';

interface FieldVisitShortHoldAlertProps {
  flags: FieldVisitUrgencyFlag[];
}

function toneClasses(tone: FieldVisitUrgencyFlag['tone']) {
  switch (tone) {
    case 'critical':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
    case 'warning':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
    default:
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100';
  }
}

export function FieldVisitShortHoldAlert({
  flags,
}: FieldVisitShortHoldAlertProps) {
  if (flags.length === 0) return null;

  return (
    <div className="space-y-3">
      {flags.map((flag) => (
        <div
          key={flag.id}
          className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', toneClasses(flag.tone))}
        >
          {flag.tone === 'critical' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <div>
            <div className="font-medium">{flag.label}</div>
            <div className="mt-1 text-sm/6 opacity-90">{flag.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
