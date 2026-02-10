import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import { useUserProfile } from './useUserProfile';
import type { QueueEntry } from '@/types/queue';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

/**
 * Subscribes to Realtime changes on file_processing_queue.
 * Scoped per org via RLS + client-side filter (v6 Section 9).
 * Includes 30s heartbeat fallback for WebSocket disconnects.
 */
export function useRealtimeQueue() {
  const { profile } = useUserProfile();
  const { setEntries, upsertEntry } = useQueueStore();
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const lastEventRef = useRef<number>(Date.now());

  const fetchQueue = useCallback(async () => {
    if (!profile) {
      console.warn('[queue] No profile — skipping fetch');
      return;
    }

    // Paginate to bypass PostgREST's default 1000-row limit
    const PAGE_SIZE = 1000;
    let allEntries: QueueEntry[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('file_processing_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('[queue] Failed to fetch queue:', error.message, error.details, error.hint);
        return;
      }

      if (data) {
        allEntries = allEntries.concat(data as QueueEntry[]);
        hasMore = data.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log('[queue] fetch result:', { count: allEntries.length });
    setEntries(allEntries);
  }, [profile, setEntries]);

  // Initial fetch
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Realtime subscription
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'file_processing_queue',
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          lastEventRef.current = Date.now();

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const entry = payload.new as unknown as QueueEntry;
            upsertEntry(entry);
          } else if (payload.eventType === 'DELETE' && payload.old && 'id' in payload.old) {
            useQueueStore.getState().removeEntry(payload.old.id as string);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, upsertEntry]);

  // Heartbeat fallback: if no Realtime event for 30s and entries in processing/queued, re-fetch
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      const timeSinceLastEvent = Date.now() - lastEventRef.current;
      const entries = useQueueStore.getState().entries;
      const hasActiveEntries = entries.some(
        (e) => e.status === 'processing' || e.status === 'queued',
      );

      if (timeSinceLastEvent >= HEARTBEAT_INTERVAL && hasActiveEntries) {
        fetchQueue();
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [fetchQueue]);

  return { refetch: fetchQueue };
}
