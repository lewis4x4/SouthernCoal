import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from './useAuditLog';
import type { PenaltyTier } from '@/types/obligations';

export interface DeadlineAlert {
  id: string;
  description: string;
  obligationType: string | null;
  nextDueDate: string;
  daysAtRisk: number;
  penaltyTier: PenaltyTier;
  accruedPenalty: number;
}

const ALERT_CACHE_KEY = 'scc_deadline_alerts_sent';

/** Days-at-risk thresholds that trigger escalation alerts */
const ESCALATION_DAYS = [1, 7, 14, 15, 30, 31];

/**
 * Deadline alerts — fetches obligations near escalation thresholds,
 * shows in-app toasts, and optionally triggers email via Edge Function.
 *
 * Deduplicates via localStorage: each {obligation_id}_{threshold} is
 * only alerted once per calendar day.
 */
export function useDeadlineAlerts() {
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { log } = useAuditLog();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchAlerts() {
      const { data: rows, error } = await supabase
        .from('consent_decree_obligations')
        .select('id, description, obligation_type, next_due_date, days_at_risk, penalty_tier, accrued_penalty')
        .in('status', ['pending', 'in_progress', 'overdue'])
        .gt('days_at_risk', 0)
        .order('days_at_risk', { ascending: false });

      if (error || !rows) {
        console.error('[deadline-alerts] Failed to fetch:', error?.message);
        setLoading(false);
        return;
      }

      // Filter to obligations at escalation trigger points
      const escalating = rows.filter((r) => {
        const days = r.days_at_risk as number;
        return ESCALATION_DAYS.some((threshold) => days >= threshold && days <= threshold + 2);
      });

      const mapped: DeadlineAlert[] = escalating.map((r) => ({
        id: r.id as string,
        description: (r.description as string) ?? 'Unnamed obligation',
        obligationType: r.obligation_type as string | null,
        nextDueDate: r.next_due_date as string,
        daysAtRisk: r.days_at_risk as number,
        penaltyTier: (r.penalty_tier as PenaltyTier) ?? 'none',
        accruedPenalty: (r.accrued_penalty as number) ?? 0,
      }));

      setAlerts(mapped);
      setLoading(false);

      // Show toasts for new alerts (not previously shown today)
      const today = new Date().toISOString().split('T')[0]!;
      const sentCache = getSentCache();

      for (const alert of mapped) {
        const nearestThreshold = ESCALATION_DAYS.filter((t) => alert.daysAtRisk >= t).pop();
        if (!nearestThreshold) continue;

        const cacheKey = `${alert.id}_${nearestThreshold}`;
        if (sentCache[cacheKey] === today) continue;

        // Show toast
        const tierLabel = alert.penaltyTier === 'tier_3' ? 'TIER 3'
          : alert.penaltyTier === 'tier_2' ? 'TIER 2' : 'TIER 1';

        toast.warning(
          `${tierLabel}: ${alert.description} — ${alert.daysAtRisk} days overdue ($${alert.accruedPenalty.toLocaleString()})`,
          { duration: 8000 },
        );

        // Mark as sent
        sentCache[cacheKey] = today;

        // Audit log
        log('deadline_alert_sent', {
          obligation_id: alert.id,
          days_at_risk: alert.daysAtRisk,
          penalty_tier: alert.penaltyTier,
          threshold: nearestThreshold,
        });

        // Try email alert (fire-and-forget)
        sendEmailAlert(alert).catch(() => {
          // Non-critical — Resend may not be configured yet
        });
      }

      setSentCache(sentCache);
    }

    fetchAlerts();
  }, [log]);

  return { alerts, loading };
}

function getSentCache(): Record<string, string> {
  try {
    const cached = localStorage.getItem(ALERT_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function setSentCache(cache: Record<string, string>) {
  try {
    // Prune entries older than today to prevent unbounded growth
    const today = new Date().toISOString().split('T')[0];
    const pruned: Record<string, string> = {};
    for (const [key, date] of Object.entries(cache)) {
      if (date === today) pruned[key] = date;
    }
    localStorage.setItem(ALERT_CACHE_KEY, JSON.stringify(pruned));
  } catch { /* quota exceeded — non-critical */ }
}

async function sendEmailAlert(alert: DeadlineAlert) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.functions.invoke('send-deadline-alert', {
    body: {
      obligation_id: alert.id,
      obligation_name: alert.description,
      days_late: alert.daysAtRisk,
      penalty_tier: alert.penaltyTier,
      accrued_penalty: alert.accruedPenalty,
      recipient_email: session.user.email,
    },
  });
}
