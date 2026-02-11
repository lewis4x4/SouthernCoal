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

export function useSyncTrigger() {
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const triggerSync = useCallback(async (source: 'echo' | 'msha') => {
    const fnName = source === 'echo' ? 'sync-echo-data' : 'sync-msha-data';
    setSyncing((prev) => ({ ...prev, [source]: true }));

    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { sync_type: 'manual' },
      });

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
      toast.error(`Failed to trigger ${source.toUpperCase()} sync`);
      console.error(err);
    } finally {
      setSyncing((prev) => ({ ...prev, [source]: false }));
    }
  }, []);

  return {
    syncing,
    triggerEchoSync: useCallback(() => triggerSync('echo'), [triggerSync]),
    triggerMshaSync: useCallback(() => triggerSync('msha'), [triggerSync]),
  };
}
