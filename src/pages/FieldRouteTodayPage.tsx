import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  MapPin,
  Navigation,
  Route,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { FieldDataSyncBar } from '@/components/field/FieldDataSyncBar';
import { FieldSameOutfallDayWarning } from '@/components/field/FieldSameOutfallDayWarning';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useAuth } from '@/hooks/useAuth';
import { useFieldOps } from '@/hooks/useFieldOps';
import { usePermissions } from '@/hooks/usePermissions';
import { mapsDirUrl, mapsSearchUrl } from '@/lib/fieldMapsNav';
import { groupSameOutfallSameDay } from '@/lib/fieldSameOutfallDay';
import {
  fieldRouteCacheMatchesView,
  loadFieldRouteCacheFromIdb,
  loadFieldRouteCacheMatching,
  saveFieldRouteCacheDual,
  type FieldRouteCachePayload,
} from '@/lib/fieldRouteLocalCache';
import {
  FIELD_HANDOFF_GOVERNANCE_INBOX,
  governanceIssuesInboxHref,
} from '@/lib/governanceInboxNav';
import { visitNeedsDisposition } from '@/lib/fieldVisitDisposition';
import { enrichFieldVisitsWithScheduleHints } from '@/lib/fieldVisitScheduleHints';
import { supabase } from '@/lib/supabase';
import type { FieldVisitListItem } from '@/types';

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function getOnlineSnapshot() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

const MANAGER_ROLES = ['site_manager', 'environmental_manager', 'executive', 'admin'];

function sortVisitsForRoute(a: FieldVisitListItem, b: FieldVisitListItem) {
  const sa = a.route_stop_sequence;
  const sb = b.route_stop_sequence;
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  if (sa != null && sb == null) return -1;
  if (sa == null && sb != null) return 1;
  return `${a.scheduled_date}T${a.created_at}`.localeCompare(`${b.scheduled_date}T${b.created_at}`);
}

export function FieldRouteTodayPage() {
  const { user } = useAuth();
  const { getEffectiveRole } = usePermissions();
  const role = getEffectiveRole();
  const canSeeOrgWide = MANAGER_ROLES.includes(role);

  const {
    visits,
    loading,
    outboundPendingCount,
    outboundQueueDiagnostic,
    clearOutboundQueueDiagnostic,
    refresh,
  } = useFieldOps();

  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);

  const today = new Date().toISOString().slice(0, 10);
  const [routeDate, setRouteDate] = useState(today);
  const [scope, setScope] = useState<'mine' | 'org'>(canSeeOrgWide ? 'org' : 'mine');
  const [outfallCoords, setOutfallCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const [idbRouteSnapshot, setIdbRouteSnapshot] = useState<FieldRouteCachePayload | null>(null);
  const lastAutoSavedKeyRef = useRef<string | null>(null);

  const cacheViewerId = scope === 'mine' ? user?.id ?? null : null;

  useEffect(() => {
    if (!canSeeOrgWide) setScope('mine');
  }, [canSeeOrgWide]);

  const routeCache = useMemo(
    () => loadFieldRouteCacheMatching(routeDate, scope, cacheViewerId),
    [routeDate, scope, cacheViewerId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await loadFieldRouteCacheFromIdb();
        if (cancelled) return;
        if (p && fieldRouteCacheMatchesView(p, routeDate, scope, cacheViewerId)) {
          setIdbRouteSnapshot(p);
        } else {
          setIdbRouteSnapshot(null);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[FieldRouteTodayPage] loadFieldRouteCacheFromIdb failed', e);
          setIdbRouteSnapshot(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeDate, scope, cacheViewerId]);

  const effectiveRouteCache = useMemo(() => {
    if (idbRouteSnapshot) return idbRouteSnapshot;
    return routeCache;
  }, [idbRouteSnapshot, routeCache]);

  const dayVisitsLive = useMemo(() => {
    let list = visits.filter((v) => v.scheduled_date === routeDate);
    if (scope === 'mine' && user?.id) {
      list = list.filter((v) => v.assigned_to === user.id);
    }
    return [...list].sort((a, b) => {
      if (scope === 'org' && a.assigned_to !== b.assigned_to) {
        return a.assigned_to_name.localeCompare(b.assigned_to_name);
      }
      return sortVisitsForRoute(a, b);
    });
  }, [routeDate, scope, user?.id, visits]);

  const dayVisits = useMemo(() => {
    if (online) return dayVisitsLive;
    return effectiveRouteCache?.visits ?? [];
  }, [online, effectiveRouteCache, dayVisitsLive]);

  const routeOutfallDayConflicts = useMemo(() => groupSameOutfallSameDay(dayVisits), [dayVisits]);

  useEffect(() => {
    if (!online && effectiveRouteCache?.outfallCoords) {
      setOutfallCoords(effectiveRouteCache.outfallCoords);
    }
  }, [online, effectiveRouteCache]);

  const loadCoords = useCallback(async (ids: string[]) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    if (ids.length === 0) {
      setOutfallCoords({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from('outfalls')
        .select('id, latitude, longitude')
        .in('id', ids);

      if (error) {
        toast.error(`Could not load outfall locations: ${error.message}`);
        return;
      }

      const next: Record<string, { lat: number; lng: number }> = {};
      for (const row of data ?? []) {
        const lat = row.latitude != null ? Number(row.latitude) : NaN;
        const lng = row.longitude != null ? Number(row.longitude) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          next[row.id as string] = { lat, lng };
        }
      }
      setOutfallCoords(next);
    } catch (e) {
      console.error('[FieldRouteTodayPage] loadCoords failed', e);
      toast.error(e instanceof Error ? e.message : 'Could not load outfall locations');
    }
  }, []);

  useEffect(() => {
    const ids = [...new Set(dayVisits.map((v) => v.outfall_id))];
    void loadCoords(ids);
  }, [dayVisits, loadCoords]);

  const routeLineCoords = useMemo(() => {
    const ordered = [...dayVisits].sort(sortVisitsForRoute);
    const coords: Array<{ lat: number; lng: number }> = [];
    for (const v of ordered) {
      const c = outfallCoords[v.outfall_id];
      if (c) coords.push(c);
    }
    return coords;
  }, [dayVisits, outfallCoords]);

  const completedCount = dayVisits.filter((v) => v.visit_status === 'completed').length;
  const openStopsCount = useMemo(
    () => dayVisits.filter((v) => visitNeedsDisposition(v)).length,
    [dayVisits],
  );
  const forceMajeureFlaggedCount = useMemo(
    () => dayVisits.filter((v) => v.potential_force_majeure).length,
    [dayVisits],
  );
  const accessIssueOutcomeCount = useMemo(
    () => dayVisits.filter((v) => v.outcome === 'access_issue').length,
    [dayVisits],
  );
  const fullRouteHref = routeLineCoords.length >= 2 ? mapsDirUrl(routeLineCoords) : '';

  const showRouteLoader = loading && online && dayVisits.length === 0;

  const persistOfflineCopy = useCallback(
    async (showToast: boolean) => {
      if (!online) {
        if (showToast) {
          toast.error('Connect to the network to save an offline copy');
        }
        return;
      }
      try {
        const ids = [...new Set(dayVisitsLive.map((v) => v.outfall_id))];
        const coords: Record<string, { lat: number; lng: number }> = {};
        for (const id of ids) {
          const c = outfallCoords[id];
          if (c) coords[id] = c;
        }
        const visitsForCache = await enrichFieldVisitsWithScheduleHints(dayVisitsLive);
        const { ok, snapshot } = await saveFieldRouteCacheDual({
          routeDate,
          scope,
          viewerUserId: cacheViewerId,
          visits: visitsForCache,
          outfallCoords: coords,
        });
        if (fieldRouteCacheMatchesView(snapshot, routeDate, scope, cacheViewerId)) {
          setIdbRouteSnapshot(snapshot);
        }
        if (ok) {
          if (showToast) {
            toast.success('Offline route copy updated on this device');
          }
        } else if (showToast) {
          toast.error('Could not save offline copy (storage blocked or full)');
        }
      } catch (e) {
        console.error('[FieldRouteTodayPage] persistOfflineCopy failed', e);
        if (showToast) {
          toast.error(e instanceof Error ? e.message : 'Could not update offline route copy');
        }
      }
    },
    [cacheViewerId, dayVisitsLive, online, outfallCoords, routeDate, scope],
  );

  function handleSaveOffline() {
    void persistOfflineCopy(true);
  }

  useEffect(() => {
    if (!online || loading) return;
    const cacheKey = JSON.stringify({
      routeDate,
      scope,
      viewerUserId: cacheViewerId,
      visits: dayVisitsLive.map((v) => [v.id, v.visit_status, v.route_stop_sequence, v.updated_at]),
      coords: Object.entries(outfallCoords)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, c]) => [id, c.lat, c.lng]),
    });
    if (lastAutoSavedKeyRef.current === cacheKey) return;
    void persistOfflineCopy(false);
    lastAutoSavedKeyRef.current = cacheKey;
  }, [cacheViewerId, dayVisitsLive, loading, online, outfallCoords, persistOfflineCopy, routeDate, scope]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Today&apos;s route
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Phase 3 route execution with Phase 4 preview: today&apos;s list is saved to this device (localStorage and IndexedDB when available) while online, then shown when the browser is offline. Field actions still need connectivity or the outbound queue.
          </p>
        </div>
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <Route className="h-6 w-6 text-emerald-300" />
        </div>
      </div>

      <FieldDataSyncBar
        loading={loading}
        pendingOutboundCount={outboundPendingCount}
        queueFlushDiagnostic={outboundQueueDiagnostic}
        onDismissQueueFlushDiagnostic={clearOutboundQueueDiagnostic}
        onRefresh={refresh}
        auditRefreshPayload={{ surface: 'field_route_today', route_date: routeDate, scope }}
      />

      <FieldSameOutfallDayWarning
        groups={routeOutfallDayConflicts}
        contextLabel={"Today's route list"}
      />

      {dayVisits.length > 0 && openStopsCount > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100"
          role="status"
          aria-live="polite"
        >
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" aria-hidden />
          <div>
            <p className="font-medium text-cyan-50">
              {openStopsCount} open stop{openStopsCount === 1 ? '' : 's'} on this route date
            </p>
            <p className="mt-1 text-xs text-cyan-200/85">
              Assigned or in-progress visits still need a final disposition (complete or cancel in the field app, or sync
              queued work). Each outfall should end the day with a clear status.
            </p>
            {forceMajeureFlaggedCount > 0 && (
              <p className="mt-2 flex items-start gap-2 text-xs font-medium text-amber-200/95">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                <span>
                  {forceMajeureFlaggedCount} visit{forceMajeureFlaggedCount === 1 ? '' : 's'} flagged as potential force
                  majeure — open each visit for notes and check the{' '}
                  <Link
                    to={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
                    className="font-semibold text-cyan-50 underline decoration-cyan-400/45 underline-offset-2 hover:text-white"
                  >
                    governance inbox
                  </Link>{' '}
                  for review deadlines.
                </span>
              </p>
            )}
            {accessIssueOutcomeCount > 0 && (
              <p className="mt-2 flex items-start gap-2 text-xs font-medium text-rose-200/95">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />
                <span>
                  {accessIssueOutcomeCount} visit{accessIssueOutcomeCount === 1 ? '' : 's'} recorded an access issue —
                  confirm documentation, photos, and{' '}
                  <Link
                    to={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
                    className="font-semibold text-rose-50 underline decoration-rose-400/45 underline-offset-2 hover:text-white"
                  >
                    governance follow-up
                  </Link>
                  .
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {dayVisits.length > 0 && openStopsCount === 0 && forceMajeureFlaggedCount > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden />
          <div>
            <p className="font-medium text-amber-50">
              {forceMajeureFlaggedCount} force majeure candidate
              {forceMajeureFlaggedCount === 1 ? '' : 's'} on this route date
            </p>
            <p className="mt-1 text-xs text-amber-200/90">
              Stops are disposition-complete but still flagged for compliance review — confirm the{' '}
              <Link
                to={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
                className="font-semibold text-amber-50 underline decoration-amber-400/45 underline-offset-2 hover:text-white"
              >
                governance inbox
              </Link>{' '}
              and visit notes.
            </p>
          </div>
        </div>
      )}

      {dayVisits.length > 0 && openStopsCount === 0 && accessIssueOutcomeCount > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          role="status"
          aria-live="polite"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" aria-hidden />
          <div>
            <p className="font-medium text-rose-50">
              {accessIssueOutcomeCount} access issue outcome
              {accessIssueOutcomeCount === 1 ? '' : 's'} on this route date
            </p>
            <p className="mt-1 text-xs text-rose-200/90">
              Review visit records and the{' '}
              <Link
                to={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
                className="font-semibold text-rose-50 underline decoration-rose-400/45 underline-offset-2 hover:text-white"
              >
                governance queue
              </Link>{' '}
              for escalation and resolution.
            </p>
          </div>
        </div>
      )}

      {!online && effectiveRouteCache && dayVisits.length > 0 && (
        <div
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="status"
          aria-live="polite"
        >
          Offline — showing route saved{' '}
          {new Date(effectiveRouteCache.savedAt).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
          {'. '}Visits you opened before can also load from the local cache.
        </div>
      )}

      {!online && !effectiveRouteCache && (
        <div
          className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-text-secondary"
          role="status"
          aria-live="polite"
        >
          You&apos;re offline and no saved route matches this date and scope. Go online once, open this page, then use &quot;Save route offline&quot;.
        </div>
      )}

      <SpotlightCard className="p-6" spotlightColor="rgba(16, 185, 129, 0.08)">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-2">
            <span className="text-xs font-medium text-text-muted">Route date</span>
            <input
              type="date"
              value={routeDate}
              onChange={(e) => setRouteDate(e.target.value)}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-emerald-400/30"
            />
          </label>
          {canSeeOrgWide && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-text-muted">Scope</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScope('mine')}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    scope === 'mine'
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
                  }`}
                >
                  My assignments
                </button>
                <button
                  type="button"
                  onClick={() => setScope('org')}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    scope === 'org'
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
                  }`}
                >
                  All samplers (day)
                </button>
              </div>
            </div>
          )}
          {online && (
            <button
              type="button"
              onClick={handleSaveOffline}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Update offline copy
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-text-muted">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-emerald-300" />
            {completedCount} / {dayVisits.length} completed
          </span>
          {forceMajeureFlaggedCount > 0 && (
            <span className="inline-flex items-center gap-2 text-amber-200/90">
              <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
              {forceMajeureFlaggedCount} FM candidate{forceMajeureFlaggedCount === 1 ? '' : 's'}
            </span>
          )}
          {accessIssueOutcomeCount > 0 && (
            <span className="inline-flex items-center gap-2 text-rose-200/90">
              <ShieldAlert className="h-4 w-4 text-rose-300" aria-hidden />
              {accessIssueOutcomeCount} access issue{accessIssueOutcomeCount === 1 ? '' : 's'}
            </span>
          )}
          {fullRouteHref && (
            <a
              href={fullRouteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-emerald-300 hover:text-emerald-200"
            >
              <Navigation className="h-4 w-4" />
              Open full route in Maps
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          )}
        </div>
      </SpotlightCard>

      {showRouteLoader ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400/60" />
        </div>
      ) : dayVisits.length === 0 ? (
        online || effectiveRouteCache ? (
          <SpotlightCard className="p-8">
            <p className="text-sm text-text-muted">
              No field visits for this date{scope === 'mine' ? ' assigned to you' : ''}. Check the{' '}
              <Link to="/field/dispatch" className="text-emerald-300 hover:text-emerald-200">
                Field Queue
              </Link>
              .
            </p>
          </SpotlightCard>
        ) : null
      ) : (
        <ol className="space-y-3">
          {dayVisits.map((visit) => {
            const coord = outfallCoords[visit.outfall_id];
            const needsDisposition = visitNeedsDisposition(visit);
            return (
              <li key={visit.id}>
                <SpotlightCard
                  className={`p-5 transition-colors hover:border-white/[0.1] ${
                    needsDisposition ? 'border-l-2 border-l-cyan-400/35 pl-[calc(1.25rem-2px)]' : ''
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-sm font-bold text-emerald-200">
                        {visit.route_stop_sequence ?? '—'}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <MapPin className="h-4 w-4 text-emerald-300" />
                          <span className="font-semibold text-text-primary">
                            {visit.permit_number ?? 'Permit'} / {visit.outfall_number ?? 'Outfall'}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              visit.visit_status === 'completed'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                : visit.visit_status === 'in_progress'
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                  : 'border-white/[0.1] bg-white/[0.04] text-text-muted'
                            }`}
                          >
                            {visit.visit_status.replace('_', ' ')}
                          </span>
                          {visit.potential_force_majeure && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              FM candidate
                            </span>
                          )}
                          {visit.outcome === 'access_issue' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200">
                              <ShieldAlert className="h-3 w-3" aria-hidden />
                              Access issue
                            </span>
                          )}
                        </div>
                        {scope === 'org' && (
                          <div className="mt-2 inline-flex items-center gap-1 text-xs text-text-muted">
                            <UserRound className="h-3.5 w-3.5" />
                            {visit.assigned_to_name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {coord && (
                        <a
                          href={mapsSearchUrl(coord.lat, coord.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-emerald-500/30 hover:text-emerald-200"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Directions
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      )}
                      <Link
                        to={`/field/visits/${visit.id}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
                      >
                        Open visit
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </SpotlightCard>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-center text-xs text-text-muted">
        <Link to="/field/dispatch" className="text-emerald-400/80 hover:text-emerald-300">
          Field Queue
        </Link>
        {' · '}
        <Link to="/field/schedule" className="text-emerald-400/80 hover:text-emerald-300">
          Sampling Calendar
        </Link>
      </p>
    </div>
  );
}
