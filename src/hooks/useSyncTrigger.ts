import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface SyncResult {
  success: boolean;
  permitsSynced?: number;
  dmrsInserted?: number;
  errors?: string[];
  error?: string;
}

export interface EchoSyncInvokeBody {
  sync_type?: 'manual' | 'scheduled';
  stale_days?: number;
  stale_only?: boolean;
  limit?: number;
  run_tag?: string;
}

export function useSyncTrigger() {
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const triggerSync = useCallback(async (
    source: 'echo' | 'msha',
    echoBody?: EchoSyncInvokeBody,
  ) => {
    const fnName = source === 'echo' ? 'sync-echo-data' : 'sync-msha-data';
    setSyncing((prev) => ({ ...prev, [source]: true }));

    const body =
      source === 'echo'
        ? { sync_type: 'manual' as const, ...echoBody }
        : { sync_type: 'manual' };

    try {
      const { data, error } = await supabase.functions.invoke(fnName, { body });

      if (error) {
        toast.error(`${source.toUpperCase()} sync failed: ${error.message}`);
        return;
      }

      const result = data as SyncResult;
      if (result.success) {
        toast.success(
          `${source.toUpperCase()} sync complete: ${result.permitsSynced ?? 0} facilities, ${result.dmrsInserted ?? 0} DMRs`,
        );
      } else {
        toast.error(result.error || `${source.toUpperCase()} sync failed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to trigger ${source.toUpperCase()} sync: ${msg}`);
      console.error(err);
    } finally {
      setSyncing((prev) => ({ ...prev, [source]: false }));
    }
  }, []);

  return {
    syncing,
    triggerEchoSync: useCallback(
      (options?: EchoSyncInvokeBody) => triggerSync('echo', options),
      [triggerSync],
    ),
    triggerMshaSync: useCallback(() => triggerSync('msha'), [triggerSync]),
  };
}
