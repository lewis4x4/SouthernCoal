import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  mapEchoPermitStatusToInternal,
  statusMismatchNeedsInternalUpdate,
  type NpdesPermitStatus,
} from '@/lib/echoPermitStatusMap';

export function useAlignPermitStatusFromEcho() {
  const [busy, setBusy] = useState(false);

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

      return { ok: true as const, newStatus: mapped as NpdesPermitStatus, row: data };
    },
    [],
  );

  return { alignStatus, busy, needsUpdate: statusMismatchNeedsInternalUpdate };
}
