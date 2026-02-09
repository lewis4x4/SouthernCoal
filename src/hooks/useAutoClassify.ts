import { useCallback } from 'react';
import { FILENAME_PATTERNS } from '@/lib/constants';
import type { ClassificationResult } from '@/types/upload';

/**
 * Filename regex classification engine.
 * Parses filenames to auto-detect state and category.
 */
export function useAutoClassify() {
  const classify = useCallback((fileName: string): ClassificationResult => {
    let stateCode: string | null = null;
    let category: string | null = null;
    const matchedPatterns: string[] = [];

    for (const pattern of FILENAME_PATTERNS) {
      const match = fileName.match(pattern.regex);
      if (!match) continue;

      if (pattern.field === 'state' && !stateCode && pattern.value) {
        stateCode = pattern.value;
        matchedPatterns.push(`state:${pattern.value}`);
      } else if (pattern.field === 'category' && !category && pattern.value) {
        category = pattern.value;
        matchedPatterns.push(`category:${pattern.value}`);
      }
    }

    // Determine confidence
    let confidence: ClassificationResult['confidence'] = 'low';
    if (stateCode && category) {
      confidence = 'high';
    } else if (stateCode || category) {
      confidence = 'medium';
    }

    return { stateCode, category, confidence, matchedPatterns };
  }, []);

  return { classify };
}
