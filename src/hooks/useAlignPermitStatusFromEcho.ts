import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  mapEchoPermitStatusToInternal,
  statusMismatchNeedsInternalUpdate,
  type NpdesPermitStatus,
} from '@/lib/echoPermitStatusMap';

export function useAlignPermitStatusFromEcho() {
  const [busy, setBusy] = useState(false);
  const { log } = useAuditLog();

  const alignStatus = useCallback(
    async (permitId: string, echoStatus: string, reviewNotes?: string) => {
      const mapped = mapEchoPermitStatusToInternal(echoStatus);
      if (!mapped) {
        return { ok: false as const, error: `Unrecognized ECHO status: ${echoStatus}` };
      }

      setBusy(true);
      const { data, error } = await supabase.rpc('align_npdes_permit_status_from_echo', {
        p_permit_id: permitId,
        p_echo_status: echoStatus,
        p_review_notes: reviewNotes ?? null,
      });
      setBusy(false);

      if (error) {
        return { ok: false as const, error: error.message };
      }

      void log(
        'permit_status_aligned_from_echo',
        { permit_id: permitId, echo_status: echoStatus, new_status: mapped },
        { module: 'external_data', tableName: 'npdes_permits', recordId: permitId },
      );

      return { ok: true as const, newStatus: mapped as NpdesPermitStatus, row: data };
    },
    [log],
  );

  return { alignStatus, busy, needsUpdate: statusMismatchNeedsInternalUpdate };
}
