import { useState, useCallback } from 'react';
import { supabase, getFreshToken } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';

interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
}

const FTS_FILENAME_PATTERN = /Failure[_ ]to[_ ]Sample[_ ]Penalties[_ ]Q(\d)[_ ](\d{4})/i;

function parseQuarterYear(fileName: string): { quarter: number; year: number } | null {
  const match = fileName.match(FTS_FILENAME_PATTERN);
  if (!match?.[1] || !match[2]) return null;
  const quarter = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  if (quarter < 1 || quarter > 4 || year < 2020 || year > 2099) return null;
  return { quarter, year };
}

export function useFtsUpload() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  });

  const upload = useCallback(
    async (file: File, quarter: number, year: number) => {
      if (!user || !profile?.organization_id) {
        toast.error('You must be signed in to upload.');
        return null;
      }

      setState({ uploading: true, progress: 10, error: null });

      try {
        // Validate file type
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
          throw new Error('Only .xlsx files are accepted.');
        }

        // Get fresh token
        const token = await getFreshToken();
        setState((s) => ({ ...s, progress: 20 }));

        // Build storage path: {org_id}/Q{quarter}_{year}_{filename}
        const orgId = profile.organization_id;
        const storagePath = `${orgId}/Q${quarter}_${year}_${file.name}`;

        // Upload to storage
        const { error: uploadErr } = await supabase.storage
          .from('fts-penalties')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: true,
          });

        if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
        setState((s) => ({ ...s, progress: 50 }));

        // Insert upload record
        const { data: uploadRecord, error: insertErr } = await supabase
          .from('fts_uploads')
          .insert({
            organization_id: orgId,
            uploaded_by: user.id,
            file_name: file.name,
            file_path: storagePath,
            quarter,
            year,
            format_version: 'Q3_legacy', // Will be updated by parser
            parse_status: 'pending',
          })
          .select('*')
          .single();

        if (insertErr) throw new Error(`Failed to create upload record: ${insertErr.message}`);
        setState((s) => ({ ...s, progress: 70 }));

        // Call Edge Function
        const { error: fnErr } = await supabase.functions.invoke('parse-fts-excel', {
          body: { upload_id: uploadRecord.id },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (fnErr) {
          console.warn('[fts-upload] Edge Function invocation error:', fnErr.message);
          // Don't throw — the function may still process and update status via Realtime
        }

        setState({ uploading: false, progress: 100, error: null });

        log('fts_upload' , {
          file_name: file.name,
          quarter,
          year,
          upload_id: uploadRecord.id,
        });

        toast.success(`Uploaded ${file.name} — parsing in progress`);
        return uploadRecord.id as string;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ uploading: false, progress: 0, error: message });
        toast.error(message);
        return null;
      }
    },
    [user, profile, log],
  );

  const reparse = useCallback(
    async (uploadId: string) => {
      if (!user) return;

      try {
        const token = await getFreshToken();

        // Reset status to pending
        const { error: updateErr } = await supabase
          .from('fts_uploads')
          .update({ parse_status: 'pending', parse_error: null, updated_at: new Date().toISOString() })
          .eq('id', uploadId);
        if (updateErr) throw new Error(`Failed to reset upload: ${updateErr.message}`);

        // Delete old violations + totals (CASCADE would handle on upload delete, but we're re-parsing)
        const { error: delVErr } = await supabase.from('fts_violations').delete().eq('upload_id', uploadId);
        if (delVErr) throw new Error(`Failed to delete violations: ${delVErr.message}`);
        const { error: delTErr } = await supabase.from('fts_monthly_totals').delete().eq('upload_id', uploadId);
        if (delTErr) throw new Error(`Failed to delete totals: ${delTErr.message}`);

        // Re-invoke parser
        await supabase.functions.invoke('parse-fts-excel', {
          body: { upload_id: uploadId },
          headers: { Authorization: `Bearer ${token}` },
        });

        toast.info('Re-parsing started');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to re-parse');
      }
    },
    [user],
  );

  return {
    ...state,
    upload,
    reparse,
    parseQuarterYear,
  };
}
