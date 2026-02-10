import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from './useAuditLog';

interface GenerateResult {
  generated: number;
  error: string | null;
}

/**
 * Generate recurring DMR obligations from a parsed permit's extracted data.
 *
 * Logic:
 *  1. Read effective_date, expiration_date, state, permit_number from extracted_data
 *  2. Determine frequency: AL → monthly, all others → quarterly (per CD spec)
 *  3. Generate deadline dates from effective → expiration
 *  4. Insert obligation rows into consent_decree_obligations
 *  5. Fire audit log
 */
export function useObligationGeneration() {
  const [generating, setGenerating] = useState(false);
  const { log } = useAuditLog();

  const generateDMRSchedule = useCallback(
    async (opts: {
      queueId: string;
      permitNumber: string;
      state: string;
      effectiveDate: string;
      expirationDate: string;
    }): Promise<GenerateResult> => {
      const { queueId, permitNumber, state, effectiveDate, expirationDate } = opts;

      if (generating) return { generated: 0, error: 'Already generating' };
      setGenerating(true);

      try {
        // Check for existing DMR obligations for this permit
        const { count } = await supabase
          .from('consent_decree_obligations')
          .select('id', { count: 'exact', head: true })
          .eq('obligation_type', 'dmr_submission')
          .ilike('description', `%${permitNumber}%`);

        if (count && count > 0) {
          setGenerating(false);
          return { generated: 0, error: `DMR obligations already exist for permit ${permitNumber}` };
        }

        // Determine frequency: AL → monthly, all others → quarterly
        const frequency = state.toUpperCase() === 'AL' ? 'monthly' : 'quarterly';
        const deadlines = generateDeadlines(effectiveDate, expirationDate, frequency);

        if (deadlines.length === 0) {
          setGenerating(false);
          return { generated: 0, error: 'No deadlines generated (check date range)' };
        }

        // Build obligation rows
        const rows = deadlines.map((date) => ({
          paragraph_number: '47',
          title: `DMR Submission — ${permitNumber}`,
          description: `DMR — ${permitNumber} — due ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
          obligation_type: 'dmr_submission',
          frequency,
          initial_due_date: date.toISOString().split('T')[0],
          next_due_date: date.toISOString().split('T')[0],
          responsible_role: 'environmental_manager',
          status: 'pending',
        }));

        // Batch insert
        const { error: insertError } = await supabase
          .from('consent_decree_obligations')
          .insert(rows);

        if (insertError) {
          setGenerating(false);
          return { generated: 0, error: `Insert failed: ${insertError.message}` };
        }

        // Audit log
        log('obligation_generation', {
          permit_number: permitNumber,
          count: rows.length,
          queue_id: queueId,
          frequency,
          date_range: `${effectiveDate} to ${expirationDate}`,
        });

        setGenerating(false);
        return { generated: rows.length, error: null };
      } catch (err) {
        setGenerating(false);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { generated: 0, error: message };
      }
    },
    [generating, log],
  );

  return { generateDMRSchedule, generating };
}

/**
 * Generate deadline dates between start and end at given frequency.
 */
function generateDeadlines(
  start: string,
  end: string,
  frequency: 'monthly' | 'quarterly',
): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  const endDate = new Date(end);
  const increment = frequency === 'monthly' ? 1 : 3;

  // Start from the first period after effective date
  current.setMonth(current.getMonth() + increment);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setMonth(current.getMonth() + increment);
  }

  return dates;
}
