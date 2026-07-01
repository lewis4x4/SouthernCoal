import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';

interface DetectionResult {
  success?: boolean;
  totalFound?: number;
  inserted?: number;
  skippedDuplicates?: number;
  insertErrors?: number;
  error?: string;
  message?: string;
}

/**
 * Triggers detect-discrepancies for the current org (ECHO rules 1–3).
 * Uses the user's JWT — no internal secret required.
 */
export function useDiscrepancyDetection() {
  const [running, setRunning] = useState(false);
  const { profile } = useUserProfile();
  const { log } = useAuditLog();

  const runDetection = useCallback(async () => {
    if (!profile?.organization_id) {
      toast.error('Organization context required');
      return;
    }

    setRunning(true);
    toast.info('Running discrepancy detection...');

    try {
      const { data, error } = await supabase.functions.invoke('detect-discrepancies', {
        body: {
          source: 'echo',
          organization_id: profile.organization_id,
          triggered_by: profile.id,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as DetectionResult;
      if (result.error) {
        throw new Error(result.error);
      }

      log(
        'discrepancy_detected',
        {
          source: 'echo',
          total_found: result.totalFound ?? 0,
          inserted: result.inserted ?? 0,
          skipped_duplicates: result.skippedDuplicates ?? 0,
          insert_errors: result.insertErrors ?? 0,
          trigger: 'review_queue_manual',
        },
        { module: 'external_data', tableName: 'discrepancy_reviews' },
      );

      const inserted = result.inserted ?? 0;
      const found = result.totalFound ?? 0;
      toast.success(
        `Detection complete: ${inserted} new discrepanc${inserted === 1 ? 'y' : 'ies'} ` +
          `(${found} evaluated)`,
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      toast.error(`Discrepancy detection failed: ${message}`);
      return null;
    } finally {
      setRunning(false);
    }
  }, [profile?.organization_id, profile?.id, log]);

  return { running, runDetection };
}
