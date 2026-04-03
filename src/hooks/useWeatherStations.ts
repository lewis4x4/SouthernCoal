import { useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useWeatherStationsStore } from '@/stores/weatherStations';
import type { WeatherStation, SiteWeatherStationAssignmentWithStation } from '@/types/weather';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Main hook for Weather Stations data management.
 * Handles fetching, Realtime subscriptions, and CRUD mutations.
 */
export function useWeatherStations() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();

  const stations = useWeatherStationsStore((s) => s.stations);
  const assignments = useWeatherStationsStore((s) => s.assignments);
  const loading = useWeatherStationsStore((s) => s.loading);
  const error = useWeatherStationsStore((s) => s.error);
  const setStations = useWeatherStationsStore((s) => s.setStations);
  const upsertStation = useWeatherStationsStore((s) => s.upsertStation);
  const setAssignments = useWeatherStationsStore((s) => s.setAssignments);
  const setLoading = useWeatherStationsStore((s) => s.setLoading);
  const setError = useWeatherStationsStore((s) => s.setError);

  const loadingRef = useRef(false);
  const fetchStationsRef = useRef<(() => Promise<void>) | null>(null);

  // -------------------------------------------------------------------------
  // Fetch all weather stations for the user's tenant
  // -------------------------------------------------------------------------
  const fetchStations = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const tenantId = profile?.organization_id ?? null;
    if (!tenantId) {
      loadingRef.current = false;
      setLoading(false);
      return;
    }

    const { data, error: fetchErr } = await supabase
      .from('weather_stations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('station_name', { ascending: true });

    loadingRef.current = false;

    if (fetchErr) {
      console.error('[useWeatherStations] Fetch error:', fetchErr.message);
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    setStations((data || []) as WeatherStation[]);
  }, [profile?.organization_id, setStations, setLoading, setError]);

  // -------------------------------------------------------------------------
  // Fetch site-to-station assignments with station join
  // -------------------------------------------------------------------------
  const fetchAssignments = useCallback(async () => {
    const { data, error: fetchErr } = await supabase
      .from('site_weather_station_assignments')
      .select('*, weather_station:weather_stations(*)')
      .order('assigned_at', { ascending: false });

    if (fetchErr) {
      console.warn('[useWeatherStations] Failed to fetch assignments:', fetchErr.message);
      return;
    }

    setAssignments((data || []) as SiteWeatherStationAssignmentWithStation[]);
  }, [setAssignments]);

  // Keep ref updated for Realtime callback
  useEffect(() => {
    fetchStationsRef.current = fetchStations;
  }, [fetchStations]);

  // -------------------------------------------------------------------------
  // CRUD: Create Station
  // -------------------------------------------------------------------------
  const createStation = useCallback(
    async (station: Omit<WeatherStation, 'id' | 'created_at' | 'updated_at'>): Promise<{ data: WeatherStation | null; error: string | null }> => {
      const { data, error: insertErr } = await supabase
        .from('weather_stations')
        .insert(station)
        .select()
        .single();

      if (insertErr) {
        console.error('[useWeatherStations] Create error:', insertErr.message);
        toast.error('Failed to create weather station');
        return { data: null, error: insertErr.message };
      }

      if (data) {
        upsertStation(data as WeatherStation);
        log('weather_station_created', { station_id: data.id, station_name: (data as WeatherStation).station_name }, {
          module: 'rain_events',
          tableName: 'weather_stations',
          recordId: data.id,
          newValues: data as Record<string, unknown>,
        });
        toast.success('Weather station created');
      }

      return { data: data as WeatherStation, error: null };
    },
    [upsertStation, log],
  );

  // -------------------------------------------------------------------------
  // CRUD: Update Station
  // -------------------------------------------------------------------------
  const updateStation = useCallback(
    async (stationId: string, updates: Partial<WeatherStation>): Promise<{ error: string | null }> => {
      const { data, error: updateErr } = await supabase
        .from('weather_stations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', stationId)
        .select()
        .single();

      if (updateErr) {
        console.error('[useWeatherStations] Update error:', updateErr.message);
        toast.error('Failed to update weather station');
        return { error: updateErr.message };
      }

      if (data) {
        upsertStation(data as WeatherStation);
        log('weather_station_updated', { station_id: stationId, fields: Object.keys(updates) }, {
          module: 'rain_events',
          tableName: 'weather_stations',
          recordId: stationId,
          newValues: updates as Record<string, unknown>,
        });
      }

      return { error: null };
    },
    [upsertStation, log],
  );

  // -------------------------------------------------------------------------
  // CRUD: Delete Station
  // -------------------------------------------------------------------------
  const deleteStation = useCallback(
    async (stationId: string): Promise<{ error: string | null }> => {
      const station = stations.find((s) => s.id === stationId);

      const { error: deleteErr } = await supabase
        .from('weather_stations')
        .delete()
        .eq('id', stationId);

      if (deleteErr) {
        console.error('[useWeatherStations] Delete error:', deleteErr.message);
        toast.error('Failed to delete weather station');
        return { error: deleteErr.message };
      }

      useWeatherStationsStore.getState().removeStation(stationId);
      log('weather_station_deleted', { station_id: stationId, station_name: station?.station_name }, {
        module: 'rain_events',
        tableName: 'weather_stations',
        recordId: stationId,
      });
      toast.success('Weather station deleted');

      return { error: null };
    },
    [stations, log],
  );

  // -------------------------------------------------------------------------
  // CRUD: Assign Station to Site
  // -------------------------------------------------------------------------
  const assignStationToSite = useCallback(
    async (siteId: string, weatherStationId: string, opts?: { distanceMiles?: number; isPrimary?: boolean }): Promise<{ error: string | null }> => {
      const { error: insertErr } = await supabase
        .from('site_weather_station_assignments')
        .insert({
          site_id: siteId,
          weather_station_id: weatherStationId,
          distance_miles: opts?.distanceMiles ?? null,
          is_primary: opts?.isPrimary ?? false,
          assigned_by: user?.id ?? null,
          assigned_at: new Date().toISOString(),
        });

      if (insertErr) {
        console.error('[useWeatherStations] Assign error:', insertErr.message);
        toast.error('Failed to assign station to site');
        return { error: insertErr.message };
      }

      log('weather_station_assigned', { site_id: siteId, weather_station_id: weatherStationId }, {
        module: 'rain_events',
        tableName: 'site_weather_station_assignments',
        newValues: { site_id: siteId, weather_station_id: weatherStationId },
      });

      // Refresh assignments
      await fetchAssignments();
      toast.success('Station assigned to site');

      return { error: null };
    },
    [user?.id, log, fetchAssignments],
  );

  // -------------------------------------------------------------------------
  // CRUD: Remove Assignment
  // -------------------------------------------------------------------------
  const removeAssignment = useCallback(
    async (assignmentId: string): Promise<{ error: string | null }> => {
      const { error: deleteErr } = await supabase
        .from('site_weather_station_assignments')
        .delete()
        .eq('id', assignmentId);

      if (deleteErr) {
        console.error('[useWeatherStations] Remove assignment error:', deleteErr.message);
        toast.error('Failed to remove station assignment');
        return { error: deleteErr.message };
      }

      log('weather_station_unassigned', { assignment_id: assignmentId }, {
        module: 'rain_events',
        tableName: 'site_weather_station_assignments',
        recordId: assignmentId,
      });

      // Refresh assignments
      await fetchAssignments();
      toast.success('Station assignment removed');

      return { error: null };
    },
    [log, fetchAssignments],
  );

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (user) {
      fetchStations();
      fetchAssignments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react to user.id, not user object
  }, [user?.id, fetchStations, fetchAssignments]);

  // Issue #13 pattern: Use useMemo for channel name
  const channelName = useMemo(
    () => `weather-stations-${profile?.organization_id ?? user?.id ?? 'anon'}`,
    [profile?.organization_id, user?.id],
  );

  // -------------------------------------------------------------------------
  // Realtime subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !profile?.organization_id) return;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weather_stations',
          filter: `tenant_id=eq.${profile.organization_id}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (import.meta.env.DEV) console.log('[useWeatherStations] Realtime event:', payload.eventType);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            fetchStationsRef.current?.();
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = (payload.old as { id: string }).id;
            useWeatherStationsStore.getState().removeStation(deletedId);
          }
        },
      )
      .subscribe();

    return () => {
      void channel
        .unsubscribe()
        .then(() =>
          supabase.removeChannel(channel).catch((err) => {
            if (import.meta.env.DEV) console.warn('[weather-stations] removeChannel failed', err);
          }),
        )
        .catch((err) => {
          if (import.meta.env.DEV) console.warn('[weather-stations] unsubscribe failed', err);
        });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react to user.id + org
  }, [user?.id, profile?.organization_id, channelName]);

  return {
    stations,
    assignments,
    loading,
    error,
    createStation,
    updateStation,
    deleteStation,
    assignStationToSite,
    removeAssignment,
    refetch: fetchStations,
  };
}
