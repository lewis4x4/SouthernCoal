import { useEffect, useRef, useCallback } from 'react';
import { supabase, getFreshToken } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import { useAuth } from './useAuth';
import type { QueueEntry } from '@/types/queue';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Fire-and-forget embedding generation after a document is parsed.
 * Never blocks the UI — failures are logged but silently ignored.
 */
async function triggerEmbeddings(queueId: string) {
  try {
    const accessToken = await getFreshToken();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    await fetch(`${supabaseUrl}/functions/v1/generate-embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ queue_id: queueId }),
    });
  } catch (err) {
    console.warn('[embeddings] Generation failed (non-blocking):', err);
  }
}

const HEARTBEAT_INTERVAL = 120_000; // 2 minutes (reduced from 30s to ease connection pressure)

/**
 * Subscribes to Realtime changes on file_processing_queue.
 * Scoped per org via RLS + client-side filter (v6 Section 9).
 * Includes heartbeat fallback for WebSocket disconnects.
 *
 * Data flow:
 * 1. Initial load: paginated fetch (all entries)
 * 2. Live updates: Realtime subscription (INSERT/UPDATE/DELETE)
 * 3. Heartbeat: lightweight single-page fetch only when entries are actively processing
 */
export function useRealtimeQueue() {
  const { user } = useAuth();
  const { setEntries, upsertEntry } = useQueueStore();
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const lastEventRef = useRef<number>(Date.now());
  const initialLoadDone = useRef(false);

  /**
   * Full paginated fetch — used only on initial mount.
   * Loads all entries in 1000-row chunks.
   */
  const fetchAllEntries = useCallback(async () => {
    if (!user) return;

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

    console.log('[queue] initial fetch:', { count: allEntries.length });
    setEntries(allEntries);
    initialLoadDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on user.id, not user object
  }, [user?.id, setEntries]);

  /**
   * Lightweight heartbeat fetch — single query for active entries only.
   * Only fetches rows with status processing/queued to detect stuck items.
   */
  const heartbeatFetch = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('file_processing_queue')
      .select('*')
      .in('status', ['processing', 'queued'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[queue] Heartbeat fetch failed:', error.message);
      return;
    }

    if (data) {
      // Merge active entries into existing store (don't replace everything)
      for (const entry of data as QueueEntry[]) {
        upsertEntry(entry);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on user.id, not user object
  }, [user?.id, upsertEntry]);

  // Initial fetch — full paginated load once
  useEffect(() => {
    fetchAllEntries();
  }, [fetchAllEntries]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

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

            // Trigger embedding generation when parse completes
            if (payload.eventType === 'UPDATE' && entry.status === 'parsed') {
              triggerEmbeddings(entry.id);
            }
          } else if (payload.eventType === 'DELETE' && payload.old && 'id' in payload.old) {
            useQueueStore.getState().removeEntry(payload.old.id as string);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on user.id, not user object
  }, [user?.id, upsertEntry]);

  // Heartbeat: lightweight fetch for active entries only (every 2 min)
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      const timeSinceLastEvent = Date.now() - lastEventRef.current;
      const entries = useQueueStore.getState().entries;
      const hasActiveEntries = entries.some(
        (e) => e.status === 'processing' || e.status === 'queued',
      );

      if (timeSinceLastEvent >= HEARTBEAT_INTERVAL && hasActiveEntries) {
        heartbeatFetch();
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [heartbeatFetch]);

  return { refetch: fetchAllEntries };
}
