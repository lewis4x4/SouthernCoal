import { useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRainEventsStore } from '@/stores/rainEvents';
import type {
  PrecipitationEvent,
  PrecipitationReading,
  DismissReasonCode,
} from '@/types/weather';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Main hook for Rain Event data management.
 * Handles fetching, Realtime subscriptions, and mutations.
 */
export function useRainEvents() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();

  const events = useRainEventsStore((s) => s.events);
  const readings = useRainEventsStore((s) => s.readings);
  const filters = useRainEventsStore((s) => s.filters);
  const loading = useRainEventsStore((s) => s.loading);
  const error = useRainEventsStore((s) => s.error);
  const setEvents = useRainEventsStore((s) => s.setEvents);
  const setReadings = useRainEventsStore((s) => s.setReadings);
  const setLoading = useRainEventsStore((s) => s.setLoading);
  const setError = useRainEventsStore((s) => s.setError);
  const setFilters = useRainEventsStore((s) => s.setFilters);
  const clearFilters = useRainEventsStore((s) => s.clearFilters);

  const loadingRef = useRef(false);
  const fetchEventsRef = useRef<(() => Promise<void>) | null>(null);

  // -------------------------------------------------------------------------
  // Fetch precipitation events for the user's organization
  // -------------------------------------------------------------------------
  const fetchEvents = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const orgId = profile?.organization_id ?? null;

    // Build query — organization_id is nullable so handle both cases
    let query = supabase
      .from('precipitation_events')
      .select('*')
      .order('event_date', { ascending: false });

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error: fetchErr } = await query;

    loadingRef.current = false;

    if (fetchErr) {
      console.error('[useRainEvents] Fetch error:', fetchErr.message);
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    setEvents((data || []) as PrecipitationEvent[]);
  }, [profile?.organization_id, setEvents, setLoading, setError]);

  // -------------------------------------------------------------------------
  // Fetch precipitation readings
  // -------------------------------------------------------------------------
  const fetchReadings = useCallback(async () => {
    const { data, error: fetchErr } = await supabase
      .from('precipitation_readings')
      .select('*')
      .order('reading_date', { ascending: false })
      .limit(500);

    if (fetchErr) {
      console.warn('[useRainEvents] Failed to fetch readings:', fetchErr.message);
      return;
    }

    setReadings((data || []) as PrecipitationReading[]);
  }, [setReadings]);

  // Keep ref updated for Realtime callback
  useEffect(() => {
    fetchEventsRef.current = fetchEvents;
  }, [fetchEvents]);

  // -------------------------------------------------------------------------
  // Mutation: Activate an event (triggers sampling)
  // -------------------------------------------------------------------------
  const activateEvent = useCallback(
    async (eventId: string, outfalls: string[]): Promise<{ error: string | null }> => {
      const { error: updateErr } = await supabase
        .from('precipitation_events')
        .update({
          status: 'activated',
          activated_by: user?.id ?? null,
          activated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (updateErr) {
        console.error('[useRainEvents] Activate error:', updateErr.message);
        toast.error('Failed to activate rain event');
        return { error: updateErr.message };
      }

      // Call RPC for each outfall to create sampling calendar entries
      for (const outfallId of outfalls) {
        const { error: rpcErr } = await supabase.rpc('create_manual_sampling_calendar_entry', {
          p_event_id: eventId,
          p_outfall_id: outfallId,
        });

        if (rpcErr) {
          console.warn('[useRainEvents] RPC error for outfall', outfallId, rpcErr.message);
        }
      }

      log('rain_event_activated', {
        event_id: eventId,
        outfall_count: outfalls.length,
        outfall_ids: outfalls,
      }, {
        module: 'rain_events',
        tableName: 'precipitation_events',
        recordId: eventId,
        newValues: { status: 'activated', activated_by: user?.id },
      });

      toast.success('Rain event activated — sampling dispatched');
      await fetchEvents();

      return { error: null };
    },
    [user?.id, log, fetchEvents],
  );

  // -------------------------------------------------------------------------
  // Mutation: Dismiss an event
  // -------------------------------------------------------------------------
  const dismissEvent = useCallback(
    async (
      eventId: string,
      reasonCode: DismissReasonCode,
      justification: string,
    ): Promise<{ error: string | null }> => {
      const { error: updateErr } = await supabase
        .from('precipitation_events')
        .update({
          status: 'dismissed',
          dismissed_by: user?.id ?? null,
          dismissed_at: new Date().toISOString(),
          dismiss_reason_code: reasonCode,
          dismiss_justification: justification,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (updateErr) {
        console.error('[useRainEvents] Dismiss error:', updateErr.message);
        toast.error('Failed to dismiss rain event');
        return { error: updateErr.message };
      }

      log('rain_event_dismissed', {
        event_id: eventId,
        reason_code: reasonCode,
        justification_length: justification.length,
      }, {
        module: 'rain_events',
        tableName: 'precipitation_events',
        recordId: eventId,
        newValues: { status: 'dismissed', dismiss_reason_code: reasonCode },
      });

      toast.success('Rain event dismissed');
      await fetchEvents();

      return { error: null };
    },
    [user?.id, log, fetchEvents],
  );

  // -------------------------------------------------------------------------
  // Mutation: Declare a manual event
  // -------------------------------------------------------------------------
  const declareManualEvent = useCallback(
    async (data: {
      weather_station_id: string;
      event_date: string;
      rainfall_inches: number;
      manual_trigger_reason_code: string;
      manual_trigger_justification: string;
    }): Promise<{ data: PrecipitationEvent | null; error: string | null }> => {
      const orgId = profile?.organization_id ?? null;

      const { data: inserted, error: insertErr } = await supabase
        .from('precipitation_events')
        .insert({
          organization_id: orgId,
          weather_station_id: data.weather_station_id,
          event_date: data.event_date,
          rainfall_inches: data.rainfall_inches,
          trigger_source: 'manual',
          status: 'alert_generated',
          manual_trigger_reason_code: data.manual_trigger_reason_code,
          manual_trigger_justification: data.manual_trigger_justification,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[useRainEvents] Manual declare error:', insertErr.message);
        toast.error('Failed to declare manual rain event');
        return { data: null, error: insertErr.message };
      }

      log('rain_event_manual_declared', {
        event_id: inserted?.id,
        reason_code: data.manual_trigger_reason_code,
        rainfall_inches: data.rainfall_inches,
      }, {
        module: 'rain_events',
        tableName: 'precipitation_events',
        recordId: inserted?.id,
        newValues: inserted as Record<string, unknown>,
      });

      toast.success('Manual rain event declared');
      await fetchEvents();

      return { data: inserted as PrecipitationEvent, error: null };
    },
    [profile?.organization_id, log, fetchEvents],
  );

  // -------------------------------------------------------------------------
  // Mutation: Add a manual reading
  // -------------------------------------------------------------------------
  const addManualReading = useCallback(
    async (data: {
      weather_station_id: string;
      reading_date: string;
      reading_time?: string;
      rainfall_inches: number;
      duration_hours?: number;
      data_quality_flag?: string;
    }): Promise<{ data: PrecipitationReading | null; error: string | null }> => {
      const { data: inserted, error: insertErr } = await supabase
        .from('precipitation_readings')
        .insert({
          weather_station_id: data.weather_station_id,
          reading_date: data.reading_date,
          reading_time: data.reading_time ?? null,
          rainfall_inches: data.rainfall_inches,
          duration_hours: data.duration_hours ?? null,
          data_quality_flag: data.data_quality_flag ?? null,
          source_type: 'manual_entry',
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[useRainEvents] Manual reading error:', insertErr.message);
        toast.error('Failed to add precipitation reading');
        return { data: null, error: insertErr.message };
      }

      log('precipitation_reading_manual', {
        reading_id: inserted?.id,
        station_id: data.weather_station_id,
        rainfall_inches: data.rainfall_inches,
      }, {
        module: 'rain_events',
        tableName: 'precipitation_readings',
        recordId: inserted?.id,
        newValues: inserted as Record<string, unknown>,
      });

      toast.success('Precipitation reading added');
      await fetchReadings();

      return { data: inserted as PrecipitationReading, error: null };
    },
    [log, fetchReadings],
  );

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (user) {
      fetchEvents();
      fetchReadings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react to user.id, not user object
  }, [user?.id, fetchEvents, fetchReadings]);

  // Issue #13 pattern: Use useMemo for channel name
  const channelName = useMemo(
    () => `rain-events-${profile?.organization_id ?? user?.id ?? 'anon'}`,
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
          table: 'precipitation_events',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (import.meta.env.DEV) console.log('[useRainEvents] Realtime event:', payload.eventType);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            fetchEventsRef.current?.();
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = (payload.old as { id: string }).id;
            useRainEventsStore.getState().removeEvent(deletedId);
          }
        },
      )
      .subscribe();

    return () => {
      void channel
        .unsubscribe()
        .then(() =>
          supabase.removeChannel(channel).catch((err) => {
            if (import.meta.env.DEV) console.warn('[rain-events] removeChannel failed', err);
          }),
        )
        .catch((err) => {
          if (import.meta.env.DEV) console.warn('[rain-events] unsubscribe failed', err);
        });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react to user.id + org
  }, [user?.id, profile?.organization_id, channelName]);

  return {
    events,
    readings,
    filters,
    loading,
    error,
    activateEvent,
    dismissEvent,
    declareManualEvent,
    addManualReading,
    setFilters,
    clearFilters,
    refetch: fetchEvents,
  };
}
