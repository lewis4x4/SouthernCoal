import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, DollarSign, AlertTriangle, BarChart3, Clock, Search, ShieldAlert } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';

const REFRESH_INTERVAL_MS = 60_000;
const DOMAIN_COLORS: Record<string, string> = {
  permits: '#60a5fa',
  exceedances: '#f87171',
  penalties: '#fbbf24',
  sampling: '#34d399',
  organizations: '#a78bfa',
};

interface AuditEntry {
  created_at: string;
  description: string;
}

export function SearchObservabilityPage() {
  const { getEffectiveRole } = usePermissions();
  const navigate = useNavigate();
  const role = getEffectiveRole();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const isAuthorized = ['executive', 'admin', 'environmental_manager'].includes(role);

  useEffect(() => {
    if (!isAuthorized) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthorized, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('audit_log')
      .select('created_at, description')
      .eq('action', 'compliance_search')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(5000);

    setEntries(data || []);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Parse descriptions
  const parsed = useMemo(() => {
    return entries.map((e) => {
      try {
        return { ...JSON.parse(e.description || '{}'), created_at: e.created_at };
      } catch {
        return { created_at: e.created_at };
      }
    });
  }, [entries]);

  // --- 1. Cost per query by day ---
  const costByDay = useMemo(() => {
    const days: Record<string, { total: number; count: number }> = {};
    for (const p of parsed) {
      if (!p.estimated_token_cost) continue;
      const day = p.created_at?.slice(0, 10);
      if (!day) continue;
      if (!days[day]) days[day] = { total: 0, count: 0 };
      days[day].total += p.estimated_token_cost;
      days[day].count += 1;
    }
    return Object.entries(days)
      .map(([date, { total, count }]) => ({
        date,
        avg: total / count,
        total,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [parsed]);

  // --- 2. Fail rate by day ---
  const failByDay = useMemo(() => {
    const days: Record<string, { success: number; fail: number }> = {};
    for (const p of parsed) {
      const day = p.created_at?.slice(0, 10);
      if (!day) continue;
      if (!days[day]) days[day] = { success: 0, fail: 0 };
      if (p.error || p.validation_passed === false) {
        days[day].fail += 1;
      } else {
        days[day].success += 1;
      }
    }
    return Object.entries(days)
      .map(([date, { success, fail }]) => ({ date, success, fail }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [parsed]);

  // --- 3. Top queries ---
  const topQueries = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of parsed) {
      const q = p.natural_language_query;
      if (!q) continue;
      counts[q] = (counts[q] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [parsed]);

  // --- 4. Zero-result queries ---
  const zeroResultQueries = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of parsed) {
      if (p.result_count === 0 && p.natural_language_query) {
        counts[p.natural_language_query] = (counts[p.natural_language_query] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [parsed]);

  // --- 5. Volume by domain ---
  const domainVolume = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of parsed) {
      const domains: string[] = p.domains_searched || [];
      for (const d of domains) {
        counts[d] = (counts[d] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [parsed]);

  // --- 6. Response time stats ---
  const responseTimeStats = useMemo(() => {
    const times = parsed
      .map((p) => p.execution_time_ms)
      .filter((t): t is number => typeof t === 'number')
      .sort((a, b) => a - b);

    if (times.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0 };

    const p = (pct: number) => times[Math.floor(times.length * pct)] || 0;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    return { p50: p(0.5), p95: p(0.95), p99: p(0.99), avg: Math.round(avg) };
  }, [parsed]);

  // --- 7. Validation blocks ---
  const validationBlocks = useMemo(() => {
    return parsed
      .filter((p) => p.validation_passed === false)
      .map((p) => ({
        query: p.natural_language_query || '—',
        reason: p.validation_reason || 'Unknown',
        sql: p.generated_sql?.substring(0, 120) || '',
        date: p.created_at,
      }))
      .slice(0, 20);
  }, [parsed]);

  // --- Summary stats ---
  const totalQueries = parsed.length;
  const totalCost = parsed.reduce((sum, p) => sum + (p.estimated_token_cost || 0), 0);
  const failCount = parsed.filter((p) => p.error || p.validation_passed === false).length;
  const failRate = totalQueries > 0 ? ((failCount / totalQueries) * 100).toFixed(1) : '0';

  if (!isAuthorized) return null;

  return (
    <div className="space-y-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-2xl bg-purple-500/10 p-3">
            <Activity className="h-7 w-7 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Search Observability
            </h1>
            <p className="text-sm text-text-secondary">
              AI search system health — trailing 7 days
            </p>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Search className="h-3.5 w-3.5" />
            Total Queries
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-text-primary">{totalQueries}</p>
        </SpotlightCard>
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <DollarSign className="h-3.5 w-3.5" />
            Total Cost
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-text-primary">
            ${totalCost.toFixed(4)}
          </p>
        </SpotlightCard>
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <AlertTriangle className="h-3.5 w-3.5" />
            Fail Rate
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-text-primary">{failRate}%</p>
        </SpotlightCard>
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Clock className="h-3.5 w-3.5" />
            Avg Response
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-text-primary">
            {(responseTimeStats.avg / 1000).toFixed(1)}s
          </p>
        </SpotlightCard>
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cost per query */}
        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <DollarSign className="h-4 w-4" />
            Cost per Query (avg)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={costByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={(v) => `$${v.toFixed(4)}`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  formatter={(value: unknown) => [`$${Number(value).toFixed(5)}`, 'Avg Cost']}
                />
                <Line type="monotone" dataKey="avg" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SpotlightCard>

        {/* Fail rate by day */}
        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <AlertTriangle className="h-4 w-4" />
            Success / Failure by Day
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={failByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                <Tooltip
                  contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                />
                <Bar dataKey="success" stackId="a" fill="#34d399" name="Success" />
                <Bar dataKey="fail" stackId="a" fill="#f87171" name="Failed" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SpotlightCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Volume by domain */}
        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <BarChart3 className="h-4 w-4" />
            Query Volume by Domain
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={domainVolume}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {domainVolume.map((entry) => (
                    <Cell key={entry.name} fill={DOMAIN_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SpotlightCard>

        {/* Response time */}
        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Clock className="h-4 w-4" />
            Response Time Distribution
          </h3>
          <div className="grid grid-cols-4 gap-3 py-6">
            {[
              { label: 'Avg', value: responseTimeStats.avg },
              { label: 'p50', value: responseTimeStats.p50 },
              { label: 'p95', value: responseTimeStats.p95 },
              { label: 'p99', value: responseTimeStats.p99 },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="font-mono text-xl font-bold text-text-primary">
                  {(value / 1000).toFixed(1)}s
                </p>
                <p className="text-xs text-text-muted">{label}</p>
              </div>
            ))}
          </div>
        </SpotlightCard>
      </div>

      {/* Lists row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top queries */}
        <SpotlightCard className="p-4">
          <h3 className="mb-3 text-sm font-medium text-text-secondary">Top 20 Queries</h3>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {topQueries.length === 0 ? (
              <p className="py-4 text-center text-xs text-text-muted">No queries yet</p>
            ) : (
              topQueries.map(({ query, count }, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white/[0.04]">
                  <span className="truncate text-text-secondary">{query}</span>
                  <span className="shrink-0 font-mono text-text-muted">{count}</span>
                </div>
              ))
            )}
          </div>
        </SpotlightCard>

        {/* Zero-result queries */}
        <SpotlightCard className="p-4">
          <h3 className="mb-3 text-sm font-medium text-text-secondary">Zero-Result Queries</h3>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {zeroResultQueries.length === 0 ? (
              <p className="py-4 text-center text-xs text-text-muted">No zero-result queries</p>
            ) : (
              zeroResultQueries.map(({ query, count }, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white/[0.04]">
                  <span className="truncate text-text-secondary">{query}</span>
                  <span className="shrink-0 font-mono text-text-muted">{count}</span>
                </div>
              ))
            )}
          </div>
        </SpotlightCard>
      </div>

      {/* Validation blocks (Admin only) */}
      {role === 'admin' && validationBlocks.length > 0 && (
        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <ShieldAlert className="h-4 w-4" />
            SQL Validation Blocks ({validationBlocks.length})
          </h3>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {validationBlocks.map((block, i) => (
              <div key={i} className="rounded-lg border border-red-500/10 bg-red-500/[0.03] p-2 text-xs">
                <p className="font-medium text-red-300">{block.reason}</p>
                <p className="mt-0.5 truncate text-text-muted">{block.query}</p>
                {block.sql && (
                  <pre className="mt-1 truncate font-mono text-[10px] text-text-muted">{block.sql}</pre>
                )}
              </div>
            ))}
          </div>
        </SpotlightCard>
      )}

      {/* Last refresh */}
      <p className="text-center text-[10px] text-text-muted">
        Last refreshed: {lastRefresh.toLocaleTimeString()} · Auto-refresh every 60s
      </p>
    </div>
  );
}
