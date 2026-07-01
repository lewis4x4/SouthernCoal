import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { displayNameFromProfileFields } from '@/lib/reviewQueueDisplay';

/** Maps user_profiles.id → display name for triage / audit columns. */
export function useReviewerProfiles(userIds: string[]): Record<string, string> {
  const key = useMemo(() => [...new Set(userIds.filter(Boolean))].sort().join(','), [userIds]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setNames({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const map: Record<string, string> = {};
      const BATCH = 100;

      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .in('id', chunk);

        if (error) {
          console.error('[useReviewerProfiles] fetch failed:', error.message);
          break;
        }

        for (const row of data ?? []) {
          map[row.id as string] = displayNameFromProfileFields(
            row.first_name as string | null,
            row.last_name as string | null,
            row.email as string | null,
          );
        }
      }

      if (!cancelled) setNames(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
}
