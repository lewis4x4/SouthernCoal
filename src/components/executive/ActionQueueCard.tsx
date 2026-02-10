import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

interface ActionItem {
  id: string;
  description: string;
  dueDate: string;
  daysUntilDue: number;
  priority: 'critical' | 'urgent' | 'upcoming';
  obligationType: string;
}

export function ActionQueueCard() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data: rows, error } = await supabase
        .from('consent_decree_obligations')
        .select('id, description, due_date, obligation_type, status')
        .in('status', ['pending', 'in_progress', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(20);

      if (error || !rows) {
        console.error('[dashboard] Failed to fetch actions:', error?.message);
        setLoading(false);
        return;
      }

      const now = new Date();
      const mapped: ActionItem[] = rows
        .filter((r) => r.due_date)
        .map((r) => {
          const due = new Date(r.due_date as string);
          const daysUntilDue = Math.floor((due.getTime() - now.getTime()) / 86_400_000);
          let priority: ActionItem['priority'] = 'upcoming';
          if (daysUntilDue < -14) priority = 'critical';
          else if (daysUntilDue < 2) priority = 'urgent';

          return {
            id: r.id as string,
            description: (r.description as string) ?? 'Unnamed obligation',
            dueDate: due.toLocaleDateString(),
            daysUntilDue,
            priority,
            obligationType: (r.obligation_type as string) ?? 'general',
          };
        })
        // Sort: critical first, then urgent, then upcoming
        .sort((a, b) => {
          const order = { critical: 0, urgent: 1, upcoming: 2 };
          return order[a.priority] - order[b.priority] || a.daysUntilDue - b.daysUntilDue;
        });

      setActions(mapped);
      setLoading(false);
    }

    fetch();
  }, []);

  const priorityStyles: Record<string, string> = {
    critical: 'border-red-500/20 bg-red-500/[0.06] text-red-400',
    urgent: 'border-orange-500/20 bg-orange-500/[0.06] text-orange-400',
    upcoming: 'border-yellow-500/20 bg-yellow-500/[0.06] text-yellow-400',
  };

  const criticalCount = actions.filter((a) => a.priority === 'critical').length;
  const urgentCount = actions.filter((a) => a.priority === 'urgent').length;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-crystal-surface/50 to-crystal-surface/20 p-6 backdrop-blur-xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-secondary">Actions Required</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {loading
              ? 'Loading...'
              : actions.length === 0
                ? 'No pending actions'
                : `${criticalCount} critical, ${urgentCount} urgent`}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.05] p-2">
          <Clock className="h-5 w-5 text-orange-400" />
        </div>
      </div>

      {/* Action List */}
      <div className="max-h-[400px] space-y-2.5 overflow-y-auto pr-1">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[80px] animate-pulse rounded-lg border border-white/[0.04] bg-white/[0.02]"
              />
            ))
          : actions.length === 0
            ? (
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-6 text-center text-sm text-text-muted">
                  No overdue or upcoming obligations found.
                </div>
              )
            : actions.map((action) => (
                <Link
                  key={action.id}
                  to="/obligations"
                  className={cn(
                    'block rounded-lg border p-4 transition-all hover:scale-[1.01]',
                    priorityStyles[action.priority],
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          {action.obligationType}
                        </span>
                        <span className="text-xs font-medium">{action.description}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs opacity-70">
                        <span>Due: {action.dueDate}</span>
                      </div>
                      <div className="text-xs font-bold">
                        {action.daysUntilDue < 0
                          ? `${Math.abs(action.daysUntilDue)} days overdue`
                          : action.daysUntilDue === 0
                            ? 'Due today'
                            : `Due in ${action.daysUntilDue} days`}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                  </div>
                </Link>
              ))}
      </div>

      {/* View All */}
      <Link
        to="/obligations"
        className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
      >
        View All Obligations
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
