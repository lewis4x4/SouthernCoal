import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to `external_sync_log` for the current org (matches RLS).
 * Use a stable callback via ref so the channel is not recreated every render.
 */
function warnRealtimeDev(label: string, err: unknown) {
  if (import.meta.env.DEV) {
    console.warn(`[useExternalSyncLogRealtime] ${label}`, err);
  }
}

export function useExternalSyncLogRealtime(
  organizationId: string | null | undefined,
  onChange: () => void | Promise<void>,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`external-sync-log:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'external_sync_log',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          void Promise.resolve(onChangeRef.current()).catch((err) => warnRealtimeDev('onChange', err));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel).catch((err) => warnRealtimeDev('removeChannel', err));
    };
  }, [organizationId]);
}
