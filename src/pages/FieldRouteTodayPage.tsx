import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Navigation,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { FieldDataSyncBar } from '@/components/field/FieldDataSyncBar';
import { FieldDataSourceBanner } from '@/components/field/FieldDataSourceBanner';
import { FieldDispatchLoadAlerts } from '@/components/field/FieldDispatchLoadAlerts';
import { FieldSameOutfallDayWarning } from '@/components/field/FieldSameOutfallDayWarning';
import { useAuth } from '@/hooks/useAuth';
import { useFieldOps } from '@/hooks/useFieldOps';
import { usePermissions } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { mapsDirUrl, mapsSearchUrl } from '@/lib/fieldMapsNav';
import { groupSameOutfallSameDay } from '@/lib/fieldSameOutfallDay';
import {
  fieldRouteCacheMatchesView,
  loadFieldRouteCacheFromIdbMatching,
  loadFieldRouteCacheMatching,
  saveFieldRouteCacheDual,
  type FieldRouteCachePayload,
} from '@/lib/fieldRouteLocalCache';
import { getEasternTodayYmd } from '@/lib/operationalDate';
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
  const { profile } = useUserProfile();
  const { getEffectiveRole } = usePermissions();
  const role = getEffectiveRole();
  const canSeeOrgWide = MANAGER_ROLES.includes(role);

  const {
    visits,
    loading,
    lastSyncedAt,
    outboundPendingCount,
    outboundQueueDiagnostic,
    clearOutboundQueueDiagnostic,
    dispatchLoadAlerts,
    refresh,
  } = useFieldOps();

  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);

  const today = getEasternTodayYmd();
  const [routeDate, setRouteDate] = useState(today);
  const [scope, setScope] = useState<'mine' | 'org'>(canSeeOrgWide ? 'org' : 'mine');
  const [openStopsOnly, setOpenStopsOnly] = useState(false);
  const [outfallCoords, setOutfallCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const [idbRouteSnapshot, setIdbRouteSnapshot] = useState<FieldRouteCachePayload | null>(null);
  const lastAutoSavedKeyRef = useRef<string | null>(null);

  const cacheViewerId = user?.id ?? null;
  const cacheOrganizationId = profile?.organization_id ?? null;

  useEffect(() => {
    if (!canSeeOrgWide) setScope('mine');
  }, [canSeeOrgWide]);

  const routeCache = useMemo(
    () => loadFieldRouteCacheMatching(routeDate, scope, cacheViewerId, cacheOrganizationId),
    [routeDate, scope, cacheViewerId, cacheOrganizationId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await loadFieldRouteCacheFromIdbMatching(routeDate, scope, cacheViewerId, cacheOrganizationId);
        if (cancelled) return;
        if (p && fieldRouteCacheMatchesView(p, routeDate, scope, cacheViewerId, cacheOrganizationId)) {
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
  }, [routeDate, scope, cacheViewerId, cacheOrganizationId]);

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

  const displayDayVisits = useMemo(() => {
    if (!openStopsOnly) return dayVisits;
    return dayVisits.filter((v) => visitNeedsDisposition(v));
  }, [dayVisits, openStopsOnly]);

  const routeOutfallDayConflicts = useMemo(
    () => groupSameOutfallSameDay(displayDayVisits),
    [displayDayVisits],
  );

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
    const ordered = [...displayDayVisits].sort(sortVisitsForRoute);
    const coords: Array<{ lat: number; lng: number }> = [];
    for (const v of ordered) {
      const c = outfallCoords[v.outfall_id];
      if (c) coords.push(c);
    }
    return coords;
  }, [displayDayVisits, outfallCoords]);

  const completedCount = useMemo(
    () => displayDayVisits.filter((v) => v.visit_status === 'completed').length,
    [displayDayVisits],
  );
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
        if (!cacheOrganizationId || !cacheViewerId) {
          if (showToast) {
            toast.error('Could not save offline copy without a complete user context');
          }
          return;
        }
        const { ok, snapshot } = await saveFieldRouteCacheDual({
          routeDate,
          organizationId: cacheOrganizationId,
          scope,
          viewerUserId: cacheViewerId,
          visits: visitsForCache,
          outfallCoords: coords,
        });
        if (fieldRouteCacheMatchesView(snapshot, routeDate, scope, cacheViewerId, cacheOrganizationId)) {
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
    [cacheOrganizationId, cacheViewerId, dayVisitsLive, online, outfallCoords, routeDate, scope],
  );

  function handleSaveOffline() {
    void persistOfflineCopy(true);
  }

  useEffect(() => {
    if (!online || loading) return;
    const cacheKey = JSON.stringify({
      organizationId: cacheOrganizationId,
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
  }, [cacheOrganizationId, cacheViewerId, dayVisitsLive, loading, online, outfallCoords, persistOfflineCopy, routeDate, scope]);

  const nextOpenStop = displayDayVisits.find((v) => visitNeedsDisposition(v));
  const hasRouteAlerts = outboundQueueDiagnostic || dispatchLoadAlerts.length > 0 ||
    routeOutfallDayConflicts.length > 0 || forceMajeureFlaggedCount > 0 || accessIssueOutcomeCount > 0;

  return (
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={routeDate}
          onChange={(e) => setRouteDate(e.target.value)}
          className="min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none focus:border-emerald-400/30"
        />
        {canSeeOrgWide ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setScope('mine')}
              className={`min-h-12 rounded-2xl px-4 text-sm font-medium transition-colors ${
                scope === 'mine'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] active:bg-white/[0.12]'
              }`}
            >
              Mine
            </button>
            <button
              type="button"
              onClick={() => setScope('org')}
              className={`min-h-12 rounded-2xl px-4 text-sm font-medium transition-colors ${
                scope === 'org'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] active:bg-white/[0.12]'
              }`}
            >
              All
            </button>
          </div>
        ) : null}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setOpenStopsOnly(false)}
            className={`min-h-12 rounded-2xl px-4 text-sm font-medium transition-colors ${
              !openStopsOnly
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] active:bg-white/[0.12]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setOpenStopsOnly(true)}
            className={`min-h-12 rounded-2xl px-4 text-sm font-medium transition-colors ${
              openStopsOnly
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] active:bg-white/[0.12]'
            }`}
          >
            Open
          </button>
        </div>
        <span className="ml-auto text-sm font-medium text-text-muted">
          {completedCount}/{displayDayVisits.length}
        </span>
        {online && (
          <button
            type="button"
            onClick={handleSaveOffline}
            className="inline-flex min-h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-text-secondary transition-colors hover:bg-white/[0.06] active:bg-white/[0.1]"
            aria-label="Save route offline"
            title="Save route offline"
          >
            <CalendarDays className="h-5 w-5" />
          </button>
        )}
        {fullRouteHref ? (
          <a
            href={fullRouteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-emerald-200"
            aria-label="Open full route in Maps"
          >
            <Navigation className="h-5 w-5" />
          </a>
        ) : null}
      </div>

      {/* Collapsible status strip */}
      {hasRouteAlerts ? (
        <details className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 text-sm text-text-secondary">
            {forceMajeureFlaggedCount > 0 ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : null}
            {accessIssueOutcomeCount > 0 ? <span className="h-2 w-2 rounded-full bg-rose-400" /> : null}
            {outboundQueueDiagnostic ? <span className="h-2 w-2 rounded-full bg-red-400" /> : null}
            <span className="flex-1">
              {openStopsCount > 0 ? `${openStopsCount} open` : 'Route alerts'}
              {forceMajeureFlaggedCount > 0 ? ` · ${forceMajeureFlaggedCount} FM` : ''}
              {accessIssueOutcomeCount > 0 ? ` · ${accessIssueOutcomeCount} access` : ''}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform [[open]>&]:rotate-90" aria-hidden />
          </summary>
          <div className="space-y-3 border-t border-white/[0.06] p-3">
            <FieldDataSyncBar
              loading={loading}
              lastSyncedAt={lastSyncedAt}
              pendingOutboundCount={outboundPendingCount}
              queueFlushDiagnostic={outboundQueueDiagnostic}
              onDismissQueueFlushDiagnostic={clearOutboundQueueDiagnostic}
              onRefresh={refresh}
              auditRefreshPayload={{ surface: 'field_route_today', route_date: routeDate, scope }}
            />
            <FieldDispatchLoadAlerts alerts={dispatchLoadAlerts} />
            <FieldSameOutfallDayWarning groups={routeOutfallDayConflicts} contextLabel={"Today's route list"} />
          </div>
        </details>
      ) : null}

      {!online && dayVisits.length > 0 ? (
        <FieldDataSourceBanner variant="route_offline_device" routeSavedAt={effectiveRouteCache?.savedAt} />
      ) : null}

      {!online && !effectiveRouteCache && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-text-secondary">
          Offline with no saved route. Go online, open this page, then save offline.
        </div>
      )}

      {/* Stop list */}
      {showRouteLoader ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400/60" />
        </div>
      ) : dayVisits.length === 0 ? (
        online || effectiveRouteCache ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center text-sm text-text-muted">
            No field visits for this date{scope === 'mine' ? ' assigned to you' : ''}.
          </div>
        ) : null
      ) : openStopsOnly && displayDayVisits.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center text-sm text-text-muted">
          All stops complete. Switch to &quot;All&quot; to review.
        </div>
      ) : (
        <ol className="space-y-2">
          {displayDayVisits.map((visit) => {
            const coord = outfallCoords[visit.outfall_id];
            const needsDisposition = visitNeedsDisposition(visit);
            const isHero = nextOpenStop?.id === visit.id;

            if (isHero) {
              return (
                <li key={visit.id}>
                  <div className="rounded-2xl border-2 border-cyan-400/30 bg-cyan-500/[0.06] p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-2xl font-bold text-emerald-200">
                        {visit.route_stop_sequence ?? '—'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-semibold text-text-primary">
                          {visit.permit_number ?? 'Permit'} / {visit.outfall_number ?? 'Outfall'}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${
                            visit.visit_status === 'in_progress'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                              : 'border-white/[0.1] bg-white/[0.04] text-text-muted'
                          }`}>
                            {visit.visit_status.replace('_', ' ')}
                          </span>
                          {visit.potential_force_majeure ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                              <AlertTriangle className="h-3 w-3" aria-hidden /> FM
                            </span>
                          ) : null}
                          {scope === 'org' && visit.assigned_to_name ? (
                            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                              <UserRound className="h-3 w-3" /> {visit.assigned_to_name}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <Link
                        to={`/field/visits/${visit.id}`}
                        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-500/20 text-base font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/30 active:bg-emerald-500/35"
                      >
                        Start this stop
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                      {coord ? (
                        <a
                          href={mapsSearchUrl(coord.lat, coord.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-emerald-200"
                        >
                          <Navigation className="h-4 w-4" />
                          Navigate
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={visit.id}>
                <Link
                  to={`/field/visits/${visit.id}`}
                  className={`flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 py-2 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] ${
                    needsDisposition
                      ? 'border-l-2 border-l-cyan-400/30 border-y-white/[0.06] border-r-white/[0.06]'
                      : 'border-white/[0.06]'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-sm font-bold text-emerald-200">
                    {visit.route_stop_sequence ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary">
                      {visit.permit_number ?? 'Permit'} / {visit.outfall_number ?? 'Outfall'}
                    </span>
                    {scope === 'org' && visit.assigned_to_name ? (
                      <span className="block text-xs text-text-muted">{visit.assigned_to_name}</span>
                    ) : null}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    visit.visit_status === 'completed'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : visit.visit_status === 'in_progress'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'border-white/[0.1] bg-white/[0.04] text-text-muted'
                  }`}>
                    {visit.visit_status.replace('_', ' ')}
                  </span>
                  {visit.potential_force_majeure ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" /> : null}
                  {visit.outcome === 'access_issue' ? <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" /> : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
