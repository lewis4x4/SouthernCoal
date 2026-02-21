import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useFtsStore } from '@/stores/fts';

function formatCompact(amount: number): string | null {
  if (amount < 1_000) return null;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(amount / 1_000)}k`;
}

export function useFtsNavBadge(): string | null {
  const navQuarterTotal = useFtsStore((s) => s.navQuarterTotal);
  const setNavQuarterTotal = useFtsStore((s) => s.setNavQuarterTotal);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const qStart = (quarter - 1) * 3 + 1;
    const qEnd = quarter * 3;

    async function fetch() {
      const { data, error } = await supabase
        .from('fts_monthly_totals')
        .select('state, total_penalties')
        .eq('monitoring_year', year)
        .gte('monitoring_month', qStart)
        .lte('monitoring_month', qEnd);

      if (error || !data) {
        if (error && import.meta.env.DEV) {
          console.warn('[useFtsNavBadge] Failed to fetch quarterly total for nav badge:', error.message);
        }
        return;
      }

      const total = data
        .filter((r) => r.state !== 'TN')
        .reduce((sum, r) => sum + (r.total_penalties ?? 0), 0);

      setNavQuarterTotal(total);
    }

    fetch();
  }, [setNavQuarterTotal]);

  if (navQuarterTotal === null || navQuarterTotal < 1_000) return null;
  return formatCompact(navQuarterTotal);
}
