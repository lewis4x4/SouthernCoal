import { useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { MONTH_ABBR } from '@/lib/constants';
import { useFtsStore } from '@/stores/fts';
import type { FtsUpload, FtsViolation, FtsMonthlyTotal, FtsKpis } from '@/types/fts';

export function useFtsData() {
  const { uploads, violations, monthlyTotals, filters, setUploads, upsertUpload, setViolations, setMonthlyTotals } =
    useFtsStore();

  // ── Fetch uploads ──
  const fetchUploads = useCallback(async () => {
    const { data, error } = await supabase
      .from('fts_uploads')
      .select('*')
      .order('created_at', { ascending: false })
      .returns<FtsUpload[]>();
    if (!error && data) setUploads(data);
  }, [setUploads]);

  // ── Fetch violations with filters ──
  const fetchViolations = useCallback(async () => {
    let query = supabase.from('fts_violations').select('*');
    if (filters.year) query = query.eq('monitoring_year', filters.year);
    if (filters.quarter) query = query.eq('monitoring_quarter', filters.quarter);
    if (filters.state) query = query.eq('state', filters.state);
    if (filters.dnrSearch) query = query.ilike('dnr_number', `%${filters.dnrSearch}%`);
    query = query.order('monitoring_year', { ascending: true }).order('monitoring_month', { ascending: true }).limit(5000);

    const { data, error } = await query.returns<FtsViolation[]>();
    if (!error && data) setViolations(data);
  }, [filters, setViolations]);

  // ── Fetch monthly totals ──
  const fetchMonthlyTotals = useCallback(async () => {
    let query = supabase.from('fts_monthly_totals').select('*');
    if (filters.year) query = query.eq('monitoring_year', filters.year);
    query = query.order('monitoring_month', { ascending: true }).limit(1000);

    const { data, error } = await query.returns<FtsMonthlyTotal[]>();
    if (!error && data) setMonthlyTotals(data);
  }, [filters.year, setMonthlyTotals]);

  // ── Refetch all ──
  const refetch = useCallback(() => {
    fetchUploads();
    fetchViolations();
    fetchMonthlyTotals();
  }, [fetchUploads, fetchViolations, fetchMonthlyTotals]);

  // ── Initial fetch + refetch on filter change ──
  useEffect(() => {
    refetch();
  }, [refetch]);

  // ── Realtime subscription on fts_uploads ──
  useEffect(() => {
    const channel = supabase
      .channel('fts-uploads-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fts_uploads' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            upsertUpload(payload.new as unknown as FtsUpload);
            if (
              payload.eventType === 'UPDATE' &&
              (payload.new as Record<string, unknown>).parse_status === 'completed'
            ) {
              fetchViolations();
              fetchMonthlyTotals();
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [upsertUpload, fetchViolations, fetchMonthlyTotals]);

  // ── Compute KPIs ──
  // KPIs operate on the already-filtered violations array (year/quarter/state from store)
  const kpis = useMemo((): FtsKpis => {
    // Determine year context: use the filter year, or the latest year in the data
    const years = [...new Set(violations.map((v) => v.monitoring_year))].sort((a, b) => b - a);
    const effectiveYear = filters.year ?? years[0] ?? new Date().getFullYear();

    // Determine the quarter context from filtered data or current date
    const quarters = [...new Set(violations.map((v) => v.monitoring_quarter))].sort((a, b) => b - a);
    const latestQuarter = quarters[0] ?? Math.ceil((new Date().getMonth() + 1) / 3);

    const totalYtd = violations
      .filter((v) => v.monitoring_year === effectiveYear)
      .reduce((s, v) => s + v.penalty_amount, 0);

    const qViolations = filters.quarter
      ? violations
      : violations.filter((v) => v.monitoring_quarter === latestQuarter);
    const currentQuarter = qViolations.reduce((s, v) => s + v.penalty_amount, 0);

    // Worst state this quarter
    const stateMap = new Map<string, number>();
    for (const v of qViolations) {
      stateMap.set(v.state, (stateMap.get(v.state) ?? 0) + v.penalty_amount);
    }
    let worstState: FtsKpis['worstState'] = null;
    let maxAmt = 0;
    for (const [state, amount] of stateMap) {
      if (amount > maxAmt) {
        maxAmt = amount;
        worstState = {
          state,
          amount,
          percentage: currentQuarter > 0 ? (amount / currentQuarter) * 100 : 0,
        };
      }
    }

    // Violation counts
    const cat1Count = violations.filter((v) => v.penalty_category === 1).length;
    const cat2Count = violations.filter((v) => v.penalty_category === 2).length;

    // Most penalized permit
    const permitMap = new Map<string, { state: string; amount: number; count: number }>();
    for (const v of violations) {
      const key = `${v.state}::${v.dnr_number}`;
      const existing = permitMap.get(key) ?? { state: v.state, amount: 0, count: 0 };
      existing.amount += v.penalty_amount;
      existing.count += 1;
      permitMap.set(key, existing);
    }
    let mostPenalized: FtsKpis['mostPenalizedPermit'] = null;
    let maxPermitAmt = 0;
    for (const [key, val] of permitMap) {
      if (val.amount > maxPermitAmt) {
        maxPermitAmt = val.amount;
        mostPenalized = { dnr: key.split('::')[1] ?? key, ...val };
      }
    }

    // Repeat offender rate (Cat 2 / total)
    const total = violations.length;
    const repeatOffenderRate = total > 0 ? (cat2Count / total) * 100 : 0;

    // MoM change from monthlyTotals
    const months = [...new Set(monthlyTotals.map((t) => `${t.monitoring_year}-${String(t.monitoring_month).padStart(2, '0')}`))].sort().reverse();
    let momChange: FtsKpis['momChange'] = null;
    if (months.length >= 2) {
      const latestKey = months[0]!;
      const priorKey = months[1]!;
      const [lYear, lMonth] = latestKey.split('-').map(Number) as [number, number];
      const [pYear, pMonth] = priorKey.split('-').map(Number) as [number, number];
      const latestTotal = monthlyTotals
        .filter((t) => t.monitoring_year === lYear && t.monitoring_month === lMonth && t.state !== 'TN')
        .reduce((s, t) => s + t.total_penalties, 0);
      const priorTotal = monthlyTotals
        .filter((t) => t.monitoring_year === pYear && t.monitoring_month === pMonth && t.state !== 'TN')
        .reduce((s, t) => s + t.total_penalties, 0);
      if (priorTotal > 0) {
        momChange = {
          percentage: ((latestTotal - priorTotal) / priorTotal) * 100,
          priorMonthName: MONTH_ABBR[pMonth] ?? '',
        };
      }
    }

    return {
      totalYtd,
      ytdYear: effectiveYear,
      currentQuarter,
      currentQuarterNum: latestQuarter,
      worstState,
      violationCount: total,
      cat1Count,
      cat2Count,
      mostPenalizedPermit: mostPenalized,
      repeatOffenderRate,
      momChange,
    };
  }, [violations, monthlyTotals, filters.quarter]);

  return {
    uploads,
    violations,
    monthlyTotals,
    kpis,
    filters,
    refetch,
  };
}
