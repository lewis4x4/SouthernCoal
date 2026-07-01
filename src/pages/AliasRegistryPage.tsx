import { useMemo, useState } from 'react';
import { GitBranch, Search, Plus, BookOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAliasRegistry } from '@/hooks/useAliasRegistry';
import { ParameterAliasCoveragePanel } from '@/components/aliases/ParameterAliasCoveragePanel';
import { usePermissions } from '@/hooks/usePermissions';
import { STATES } from '@/lib/constants';

type Tab = 'parameters' | 'outfalls';

const OUTFALL_ALIAS_MANAGER_ROLES = new Set(['admin', 'environmental_manager', 'site_manager']);

export function AliasRegistryPage() {
  const { getEffectiveRole } = usePermissions();
  const {
    parameterAliases,
    outfallAliases,
    outfallOptions,
    loading,
    saving,
    createOutfallAlias,
  } = useAliasRegistry();

  const [tab, setTab] = useState<Tab>('parameters');
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [newOutfallId, setNewOutfallId] = useState('');

  const canManageOutfallAliases = OUTFALL_ALIAS_MANAGER_ROLES.has(getEffectiveRole());

  const filteredParameters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parameterAliases;
    return parameterAliases.filter(
      (row) =>
        row.alias.toLowerCase().includes(q) ||
        row.parameters?.name?.toLowerCase().includes(q) ||
        (row.state_code ?? '').toLowerCase().includes(q),
    );
  }, [parameterAliases, query]);

  const filteredOutfalls = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return outfallAliases;
    return outfallAliases.filter((row) => {
      const permit = row.outfalls?.npdes_permits?.permit_number ?? '';
      const outfallNum = row.outfalls?.outfall_number ?? '';
      return (
        row.alias.toLowerCase().includes(q) ||
        outfallNum.toLowerCase().includes(q) ||
        permit.toLowerCase().includes(q)
      );
    });
  }, [outfallAliases, query]);

  async function handleAddOutfallAlias() {
    const option = outfallOptions.find((o) => o.id === newOutfallId);
    if (!option) return;
    const { error } = await createOutfallAlias(newAlias, option.id, option.permit_id);
    if (error) return;
    setNewAlias('');
    setNewOutfallId('');
    setShowAdd(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-qo-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-qo-accent/10 p-2.5">
          <BookOpen className="h-6 w-6 text-qo-accent" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Alias Registry</h1>
          <p className="mt-1 text-sm text-text-muted">
            Parameter and outfall name normalization used by lab parsers (tasks 2.62 / 2.63). Parameter aliases are
            centrally seeded; add org outfall aliases when lab IDs differ from permit sheets.
          </p>
        </div>
      </div>

      <ParameterAliasCoveragePanel />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-black/[0.08] bg-white p-0.5">
          {(['parameters', 'outfalls'] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                tab === key ? 'bg-qo-accent/15 text-qo-accent' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {key === 'parameters' ? 'Parameters' : 'Outfalls'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search alias, parameter, permit…"
            className="w-full rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-qo-accent/50"
          />
        </div>
        {tab === 'outfalls' && canManageOutfallAliases && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-qo-accent/15 px-3 py-1.5 text-xs font-medium text-qo-accent hover:bg-qo-accent/25 transition-colors"
          >
            <Plus size={14} />
            Add outfall alias
          </button>
        )}
      </div>

      {tab === 'outfalls' && showAdd && canManageOutfallAliases && (
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 space-y-3">
          <p className="text-xs text-text-muted">
            Maps a lab/permit outfall label (e.g. &quot;001A&quot;, &quot;OF-3&quot;) to a canonical outfall in your registry.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="Alias as it appears in lab files"
              className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm font-mono text-text-primary"
            />
            <select
              value={newOutfallId}
              onChange={(e) => setNewOutfallId(e.target.value)}
              className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Select canonical outfall…</option>
              {outfallOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.permit_number} · {o.outfall_number}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={saving || !newAlias.trim() || !newOutfallId}
            onClick={() => void handleAddOutfallAlias()}
            className="rounded-lg border border-qo-accent/30 bg-qo-accent/10 px-4 py-2 text-xs font-medium text-qo-accent disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save alias'}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-black/[0.08] bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-qo-accent" />
            <span className="text-sm font-semibold text-text-primary">
              {tab === 'parameters' ? 'Parameter aliases' : 'Outfall aliases'}
            </span>
          </div>
          <span className="text-xs text-text-muted">
            {tab === 'parameters' ? filteredParameters.length : filteredOutfalls.length} rows
          </span>
        </div>

        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          {tab === 'parameters' ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-qo-nested text-text-muted">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Alias</th>
                  <th className="text-left py-2 px-3 font-medium">Parameter</th>
                  <th className="text-left py-2 px-3 font-medium">State</th>
                  <th className="text-left py-2 px-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredParameters.map((row) => (
                  <tr key={row.id} className="border-t border-black/[0.04] hover:bg-qo-nested/50">
                    <td className="py-2 px-3 font-mono text-text-primary">{row.alias}</td>
                    <td className="py-2 px-3 text-text-secondary">{row.parameters?.name ?? '—'}</td>
                    <td className="py-2 px-3 text-text-muted">{row.state_code ?? 'All'}</td>
                    <td className="py-2 px-3 text-text-muted">{row.source ?? '—'}</td>
                  </tr>
                ))}
                {filteredParameters.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-text-muted">
                      No parameter aliases match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-qo-nested text-text-muted">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Alias</th>
                  <th className="text-left py-2 px-3 font-medium">Permit</th>
                  <th className="text-left py-2 px-3 font-medium">Outfall</th>
                  <th className="text-left py-2 px-3 font-medium">Match</th>
                  <th className="text-left py-2 px-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutfalls.map((row) => (
                  <tr key={row.id} className="border-t border-black/[0.04] hover:bg-qo-nested/50">
                    <td className="py-2 px-3 font-mono text-text-primary">{row.alias}</td>
                    <td className="py-2 px-3 font-mono text-text-secondary">
                      {row.outfalls?.npdes_permits?.permit_number ?? '—'}
                    </td>
                    <td className="py-2 px-3 font-mono text-qo-accent">
                      {row.outfalls?.outfall_number ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-text-muted">{row.match_method ?? '—'}</td>
                    <td className="py-2 px-3 text-text-muted">{row.source ?? '—'}</td>
                  </tr>
                ))}
                {filteredOutfalls.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-text-muted">
                      {outfallOptions.length === 0
                        ? 'No outfalls in registry yet — upload permits to seed outfalls, then add aliases.'
                        : 'No outfall aliases match this filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {tab === 'parameters' && (
        <p className="text-[11px] text-text-muted">
          States: {STATES.map((s) => s.code).join(', ')}. New parameter aliases require a service-role seed or migration.
        </p>
      )}
    </div>
  );
}
