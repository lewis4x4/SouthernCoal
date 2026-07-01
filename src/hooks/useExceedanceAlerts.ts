import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { toast } from 'sonner';

export function useExceedanceAlerts() {
  const { profile } = useUserProfile();
  const [dispatching, setDispatching] = useState(false);

  const dispatch = useCallback(
    async (options?: { dryRun?: boolean; forceDigest?: boolean }) => {
      if (!profile?.organization_id) {
        toast.error('Organization not loaded');
        return null;
      }

      setDispatching(true);
      try {
        const { data, error } = await supabase.functions.invoke('dispatch-exceedance-alerts', {
          body: {
            organization_id: profile.organization_id,
            dry_run: options?.dryRun ?? false,
            force_digest: options?.forceDigest ?? false,
          },
        });

        if (error) {
          toast.error(`Exceedance alert failed: ${error.message}`);
          return null;
        }

        const result = data as {
          skipped?: boolean;
          reason?: string;
          recipientCount?: number;
          emailsSent?: number;
          dryRun?: boolean;
        };

        if (options?.dryRun) {
          toast.message(
            result.skipped
              ? `Dry run: no alert (${result.reason ?? 'rules not met'})`
              : `Dry run: would notify ${result.recipientCount ?? 0} recipients`,
          );
          return result;
        }

        if (result.skipped) {
          toast.message(`No alert sent (${result.reason ?? 'skipped'})`);
        } else {
          toast.success(`Exceedance alerts dispatched (${result.emailsSent ?? 0} email)`);
        }

        return result;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setDispatching(false);
      }
    },
    [profile?.organization_id],
  );

  return {
    dispatching,
    dispatchDryRun: () => dispatch({ dryRun: true }),
    dispatchDigest: () => dispatch({ forceDigest: true }),
  };
}
