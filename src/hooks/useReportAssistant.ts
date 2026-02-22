import { useState, useCallback } from 'react';
import { supabase, getFreshToken } from '@/lib/supabase';
import { useAuditLog } from './useAuditLog';

/**
 * AI Report Assistant — Natural language → report generation.
 *
 * Parses user intent from NL queries and maps to report_definitions.
 * Never auto-generates — always returns a suggestion for user confirmation.
 *
 * Phase 7 of Report Engine build (SCC Report Build v1.0, Feb 2026).
 */

interface ReportSuggestion {
  report_key: string;
  report_number: number;
  title: string;
  description: string;
  tier: number;
  priority: string;
  is_locked: boolean;
  inferred_config: {
    states?: string[];
    date_from?: string;
    date_to?: string;
    format?: string;
  };
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

interface AssistantResult {
  suggestions: ReportSuggestion[];
  parsed_intent: string;
  is_report_query: boolean;
}

// Report keyword patterns → report_key mapping
const REPORT_PATTERNS: { patterns: RegExp[]; report_keys: string[]; config_hints: (query: string) => Record<string, unknown> }[] = [
  {
    patterns: [/permit\s*inventor/i, /all\s*permits/i, /permit\s*list/i, /how\s*many\s*permits/i],
    report_keys: ['permit_inventory'],
    config_hints: (q) => inferStateFilter(q),
  },
  {
    patterns: [/expir/i, /renewal/i, /permits?\s*(coming\s*)?due/i, /permits?\s*about\s*to/i],
    report_keys: ['permit_renewal_tracker'],
    config_hints: (q) => inferStateFilter(q),
  },
  {
    patterns: [/outfall/i, /discharge\s*point/i, /monitoring\s*point/i],
    report_keys: ['outfall_inventory'],
    config_hints: (q) => inferStateFilter(q),
  },
  {
    patterns: [/parameter\s*matrix/i, /limit\s*matrix/i, /all\s*limits/i, /permit\s*limits/i],
    report_keys: ['permit_limit_parameter_matrix'],
    config_hints: (q) => inferStateFilter(q),
  },
  {
    patterns: [/echo/i, /noncompli/i, /snc/i, /significant\s*non/i, /epa\s*status/i],
    report_keys: ['epa_echo_noncompliance'],
    config_hints: (q) => inferStateFilter(q),
  },
  {
    patterns: [/dmr\s*data/i, /dmr\s*summar/i, /discharge\s*monitoring/i],
    report_keys: ['epa_dmr_data_summary'],
    config_hints: (q) => ({ ...inferStateFilter(q), ...inferDateRange(q) }),
  },
  {
    patterns: [/consent\s*decree/i, /cd\s*obligation/i, /obligation\s*status/i],
    report_keys: ['consent_decree_obligations'],
    config_hints: () => ({}),
  },
  {
    patterns: [/fts/i, /fish\s*tissue/i, /violation\s*report/i],
    report_keys: ['fts_violation_report'],
    config_hints: (q) => ({ ...inferStateFilter(q), ...inferDateRange(q) }),
  },
  {
    patterns: [/discrepanc/i, /triage/i, /data\s*quality\s*issue/i],
    report_keys: ['discrepancy_triage'],
    config_hints: () => ({}),
  },
  {
    patterns: [/ai\s*extract/i, /verification\s*status/i, /pending\s*review/i, /unverified\s*limit/i],
    report_keys: ['ai_extraction_verification'],
    config_hints: () => ({}),
  },
  {
    patterns: [/audit\s*trail/i, /audit\s*log/i, /who\s*changed/i, /change\s*log/i],
    report_keys: ['system_audit_trail'],
    config_hints: (q) => inferDateRange(q),
  },
  {
    patterns: [/file\s*pipeline/i, /processing\s*queue/i, /upload\s*status/i],
    report_keys: ['file_processing_pipeline'],
    config_hints: () => ({}),
  },
  {
    patterns: [/deadline/i, /regulatory\s*date/i, /due\s*date/i, /upcoming\s*deadline/i],
    report_keys: ['regulatory_deadline_tracker'],
    config_hints: () => ({}),
  },
  {
    patterns: [/state\s*comparison/i, /state\s*matrix/i, /cross[\s-]*state/i, /state\s*by\s*state/i, /compliance\s*summar/i],
    report_keys: ['state_compliance_matrix'],
    config_hints: () => ({}),
  },
  {
    patterns: [/sync\s*health/i, /external\s*sync/i, /data\s*sync/i],
    report_keys: ['external_sync_health'],
    config_hints: () => ({}),
  },
  // Composite / executive queries
  {
    patterns: [/board\s*meeting/i, /executive\s*summar/i, /ceo/i, /coo/i, /board\s*report/i],
    report_keys: ['state_compliance_matrix', 'epa_echo_noncompliance', 'consent_decree_obligations'],
    config_hints: (q) => inferStateFilter(q),
  },
  {
    patterns: [/quarterly\s*report/i, /quarterly\s*cd/i, /court\s*submission/i],
    report_keys: ['quarterly_consent_decree'],
    config_hints: () => ({}),
  },
  {
    patterns: [/inspection\s*prep/i, /inspector\s*coming/i, /site\s*visit/i],
    report_keys: ['inspection_preparation_package'],
    config_hints: (q) => inferStateFilter(q),
  },
  {
    patterns: [/selenium/i, /ky\s*selenium/i, /kentucky\s*selenium/i],
    report_keys: ['selenium_monitoring_ky'],
    config_hints: () => ({ states: ['KY'] }),
  },
  {
    patterns: [/conductivity/i, /tds/i, /total\s*dissolved/i, /wv\s*conduct/i],
    report_keys: ['conductivity_tds_analysis_wv'],
    config_hints: () => ({ states: ['WV'] }),
  },
];

function inferStateFilter(query: string): Record<string, unknown> {
  const states: string[] = [];
  if (/\bwv\b|west\s*virginia/i.test(query)) states.push('WV');
  if (/\bva\b|virginia(?!\s*west)/i.test(query)) states.push('VA');
  if (/\bky\b|kentucky/i.test(query)) states.push('KY');
  if (/\btn\b|tennessee/i.test(query)) states.push('TN');
  if (/\bal\b|alabama/i.test(query)) states.push('AL');
  return states.length > 0 ? { states } : {};
}

function inferDateRange(query: string): Record<string, unknown> {
  const now = new Date();
  if (/last\s*30\s*days/i.test(query)) {
    const from = new Date(now.getTime() - 30 * 86400000);
    return { date_from: from.toISOString().split('T')[0], date_to: now.toISOString().split('T')[0] };
  }
  if (/last\s*90\s*days/i.test(query)) {
    const from = new Date(now.getTime() - 90 * 86400000);
    return { date_from: from.toISOString().split('T')[0], date_to: now.toISOString().split('T')[0] };
  }
  if (/this\s*year|202[56]/i.test(query)) {
    return { date_from: `${now.getFullYear()}-01-01`, date_to: now.toISOString().split('T')[0] };
  }
  if (/last\s*quarter/i.test(query)) {
    const qMonth = Math.floor((now.getMonth()) / 3) * 3;
    const from = new Date(now.getFullYear(), qMonth - 3, 1);
    const to = new Date(now.getFullYear(), qMonth, 0);
    return { date_from: from.toISOString().split('T')[0], date_to: to.toISOString().split('T')[0] };
  }
  return {};
}

// Cache report definitions
let cachedDefs: Map<string, { report_key: string; report_number: number; title: string; description: string; tier: number; priority: string; is_locked: boolean }> | null = null;

async function getReportDefs() {
  if (cachedDefs) return cachedDefs;
  const { data } = await supabase
    .from('report_definitions')
    .select('report_key, report_number, title, description, tier, priority, is_locked');
  cachedDefs = new Map();
  for (const d of data ?? []) {
    cachedDefs.set(d.report_key, d);
  }
  return cachedDefs;
}

export function useReportAssistant() {
  const { log } = useAuditLog();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<AssistantResult | null>(null);

  const analyze = useCallback(async (query: string): Promise<AssistantResult> => {
    setLoading(true);
    const defs = await getReportDefs();

    const matchedKeys = new Set<string>();
    const matchedConfigs: Record<string, Record<string, unknown>> = {};
    const matchedConfidence: Record<string, 'high' | 'medium' | 'low'> = {};

    for (const pattern of REPORT_PATTERNS) {
      const isMatch = pattern.patterns.some((p) => p.test(query));
      if (isMatch) {
        const hints = pattern.config_hints(query);
        for (const key of pattern.report_keys) {
          matchedKeys.add(key);
          matchedConfigs[key] = hints;
          matchedConfidence[key] = pattern.patterns.length > 2 ? 'high' : 'medium';
        }
      }
    }

    const suggestions: ReportSuggestion[] = [];
    for (const key of matchedKeys) {
      const def = defs.get(key);
      if (!def) continue;
      suggestions.push({
        ...def,
        inferred_config: matchedConfigs[key] as ReportSuggestion['inferred_config'],
        confidence: matchedConfidence[key] ?? 'low',
        reason: `Matched query patterns for "${def.title}"`,
      });
    }

    // Sort: unlocked first, then by tier, then by priority
    suggestions.sort((a, b) => {
      if (a.is_locked !== b.is_locked) return a.is_locked ? 1 : -1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      const pOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
      return (pOrder[a.priority as keyof typeof pOrder] ?? 3) - (pOrder[b.priority as keyof typeof pOrder] ?? 3);
    });

    const assistantResult: AssistantResult = {
      suggestions,
      parsed_intent: query,
      is_report_query: suggestions.length > 0,
    };

    setResult(assistantResult);
    setLoading(false);

    log('filter_change', {
      action: 'ai_report_assistant_query',
      query,
      suggestions_count: suggestions.length,
      suggestion_keys: suggestions.map((s) => s.report_key),
    });

    return assistantResult;
  }, [log]);

  const generate = useCallback(async (
    reportKey: string,
    config: Record<string, unknown> = {},
    delivery: { download?: boolean; email?: boolean } = { download: true },
  ): Promise<{ success: boolean; job_id?: string; download_url?: string; error?: string }> => {
    setGenerating(true);
    try {
      const token = await getFreshToken();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            report_key: reportKey,
            format: 'csv',
            config,
            delivery,
          }),
        },
      );
      const data = await resp.json();
      setGenerating(false);

      log('filter_change', {
        action: 'ai_report_assistant_generate',
        report_key: reportKey,
        success: data.success,
        job_id: data.job_id,
      });

      return {
        success: data.success,
        job_id: data.job_id,
        download_url: data.download_url,
        error: data.error,
      };
    } catch (err) {
      setGenerating(false);
      return { success: false, error: String(err) };
    }
  }, [log]);

  const clear = useCallback(() => {
    setResult(null);
  }, []);

  return { analyze, generate, clear, result, loading, generating };
}
