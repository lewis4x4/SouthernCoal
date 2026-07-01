import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { toast } from 'sonner';

export interface DispatchAlertResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  dryRun?: boolean;
  recipientCount?: number;
  emailsSent?: number;
  smsSent?: number;
  decision?: { eventType: string; priority: string; title: string };
  errors?: string[];
}

export function useComplianceAlerts() {
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
        const { data, error } = await supabase.functions.invoke('dispatch-compliance-alerts', {
          body: {
            organization_id: profile.organization_id,
            force_digest: options?.forceDigest ?? false,
            dry_run: options?.dryRun ?? false,
          },
        });

        if (error) {
          toast.error(`Alert dispatch failed: ${error.message}`);
          return null;
        }

        const result = data as DispatchAlertResult;

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
        } else if (result.success) {
          toast.success(
            `Alerts dispatched: ${result.emailsSent ?? 0} email(s), ${result.smsSent ?? 0} SMS`,
          );
        }

        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
        return null;
      } finally {
        setDispatching(false);
      }
    },
    [profile?.organization_id],
  );

  return { dispatching, dispatchDryRun: () => dispatch({ dryRun: true }), dispatchDigest: () => dispatch({ forceDigest: true }), dispatch };
}
