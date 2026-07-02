import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { toast } from 'sonner';

export type StatutoryAlertType =
  | 'msha_abatement'
  | 'edd_paragraph49'
  | 'sampling_gap'
  | 'exceedance_digest';

interface UnacknowledgedPayload {
  msha_abatement?: Array<{ alert_ref_id: string }>;
  edd_paragraph49?: Array<{ alert_ref_id: string }>;
  sampling_gap?: Array<{ alert_ref_id: string }>;
  counts?: { total?: number };
}

export function useStatutoryAlertAcks() {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;

  const [unacknowledgedIds, setUnacknowledgedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const ackKey = useCallback(
    (alertType: StatutoryAlertType, alertRefId: string) => `${alertType}:${alertRefId}`,
    [],
  );

  const fetchUnacknowledged = useCallback(async () => {
    if (!orgId) {
      setUnacknowledgedIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('get_unacknowledged_statutory_alerts', {
      p_organization_id: orgId,
    });

    if (error) {
      console.error('[statutory-ack] fetch error:', error.message);
      setUnacknowledgedIds(new Set());
    } else {
      const payload = (data ?? {}) as UnacknowledgedPayload;
      const ids = new Set<string>();
      for (const row of payload.msha_abatement ?? []) {
        ids.add(ackKey('msha_abatement', row.alert_ref_id));
      }
      for (const row of payload.edd_paragraph49 ?? []) {
        ids.add(ackKey('edd_paragraph49', row.alert_ref_id));
      }
      for (const row of payload.sampling_gap ?? []) {
        ids.add(ackKey('sampling_gap', row.alert_ref_id));
      }
      setUnacknowledgedIds(ids);
    }

    setLoading(false);
  }, [ackKey, orgId]);

  useEffect(() => {
    void fetchUnacknowledged();
  }, [fetchUnacknowledged]);

  const isUnacknowledged = useCallback(
    (alertType: StatutoryAlertType, alertRefId: string) =>
      unacknowledgedIds.has(ackKey(alertType, alertRefId)),
    [ackKey, unacknowledgedIds],
  );

  const acknowledge = useCallback(
    async (alertType: StatutoryAlertType, alertRefId: string, note?: string) => {
      const key = ackKey(alertType, alertRefId);
      setAcknowledging(key);
      try {
        const { error } = await supabase.rpc('acknowledge_alert', {
          p_alert_type: alertType,
          p_alert_ref_id: alertRefId,
          p_note: note ?? null,
          p_channel: 'ui',
        });

        if (error) {
          toast.error('Failed to record acknowledgment');
          return error.message;
        }

        setUnacknowledgedIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        toast.success('Alert acknowledged — triage status unchanged');
        return null;
      } finally {
        setAcknowledging(null);
      }
    },
    [ackKey],
  );

  const isAcknowledging = useCallback(
    (alertType: StatutoryAlertType, alertRefId: string) =>
      acknowledging === ackKey(alertType, alertRefId),
    [ackKey, acknowledging],
  );

  const unacknowledgedCount = useMemo(() => unacknowledgedIds.size, [unacknowledgedIds]);

  return {
    loading,
    acknowledging,
    unacknowledgedCount,
    isUnacknowledged,
    isAcknowledging,
    acknowledge,
    refetch: fetchUnacknowledged,
  };
}
