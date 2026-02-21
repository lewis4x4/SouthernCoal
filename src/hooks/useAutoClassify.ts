import { useCallback } from 'react';
import { FILENAME_PATTERNS } from '@/lib/constants';
import type { ClassificationResult } from '@/types/upload';

// Extensions that indicate tabular data (lab results, EDD, etc.) — never quarterly reports
const DATA_EXTENSIONS = /\.(xlsx|xls|csv|tsv|txt)$/i;

/**
 * Filename regex classification engine.
 * Parses filenames to auto-detect state and category.
 * Extension-aware: XLSX/CSV files with quarter names → lab_data, not quarterly_report.
 */
export function useAutoClassify() {
  const classify = useCallback((fileName: string): ClassificationResult => {
    let stateCode: string | null = null;
    let category: string | null = null;
    const matchedPatterns: string[] = [];
    const isDataFile = DATA_EXTENSIONS.test(fileName);

    for (const pattern of FILENAME_PATTERNS) {
      const match = fileName.match(pattern.regex);
      if (!match) continue;

      if (pattern.field === 'state' && !stateCode && pattern.value) {
        stateCode = pattern.value;
        matchedPatterns.push(`state:${pattern.value}`);
      } else if (pattern.field === 'category' && !category && pattern.value) {
        // Data files (XLSX/CSV) with quarter names are lab data, not quarterly reports
        if (isDataFile && pattern.value === 'quarterly_report') {
          category = 'lab_data';
          matchedPatterns.push('category:lab_data (override: data file extension)');
        } else {
          category = pattern.value;
          matchedPatterns.push(`category:${pattern.value}`);
        }
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
