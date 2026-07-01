/**
 * Shared outfall + parameter DB resolution for state lab parsers.
 * Ports fuzzy matching from parse-lab-data-edd for VA/TN/AL parse-only paths
 * and import-lab-data safety net.
 */

import {
  type LabImportRecord,
  PARAMETER_MAP,
  type ExtractedLabDataBase,
  buildExtractedLabData,
} from "./lab-import-records.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClient = any;

export type OutfallMatchMethod = "exact" | "zero_strip" | "digits_only";
export type OutfallAliasSource = "lab_edd" | "permit_sheet" | "dmr" | "netdmr" | "osmre" | "manual";

export interface KnownOutfall {
  id: string;
  outfall_number: string;
  permit_id: string;
}

export interface OutfallMatchResult {
  outfallDbId: string;
  canonicalId: string;
  matchMethod: OutfallMatchMethod;
}

interface OutfallAliasEntry {
  outfallId: string;
  canonicalId: string;
  matchMethod: OutfallMatchMethod;
}

type OutfallAliasCache = Map<string, OutfallAliasEntry>;

interface ParameterAliasEntry {
  parameterId: string;
  canonicalName: string;
}

type ParameterAliasCache = Map<string, ParameterAliasEntry>;

export interface EnrichmentStats {
  recordsTotal: number;
  outfallsResolved: number;
  parametersResolved: number;
  outfallAliasesCreated: number;
}

export interface EnrichmentResult {
  records: LabImportRecord[];
  stats: EnrichmentStats;
  warnings: string[];
}

export function normalizeOutfallId(raw: string): string {
  let s = raw.trim().toUpperCase();
  s = s.replace(/\.0$/, "");
  return s;
}

export function fuzzyMatchOutfall(
  raw: string,
  knownOutfalls: KnownOutfall[],
  outfallAliasCache: OutfallAliasCache,
): OutfallMatchResult | null {
  if (!raw || knownOutfalls.length === 0) return null;

  const normalizedRaw = raw.toLowerCase().trim();
  const cached = outfallAliasCache.get(normalizedRaw);
  if (cached) {
    return {
      outfallDbId: cached.outfallId,
      canonicalId: cached.canonicalId,
      matchMethod: cached.matchMethod,
    };
  }

  const normalized = normalizeOutfallId(raw);

  for (const o of knownOutfalls) {
    if (o.outfall_number.toUpperCase() === normalized) {
      return { outfallDbId: o.id, canonicalId: o.outfall_number, matchMethod: "exact" };
    }
  }

  const numericPart = normalized.replace(/^0+/, "") || "0";
  for (const o of knownOutfalls) {
    const oNorm = o.outfall_number.toUpperCase().replace(/^0+/, "") || "0";
    if (oNorm === numericPart) {
      return { outfallDbId: o.id, canonicalId: o.outfall_number, matchMethod: "zero_strip" };
    }
  }

  const digitsOnly = normalized.replace(/[^0-9]/g, "");
  if (digitsOnly) {
    for (const o of knownOutfalls) {
      const oDigits = o.outfall_number.replace(/[^0-9]/g, "");
      if (oDigits === digitsOnly) {
        return { outfallDbId: o.id, canonicalId: o.outfall_number, matchMethod: "digits_only" };
      }
    }
    const digitsNoZeros = digitsOnly.replace(/^0+/, "") || "0";
    for (const o of knownOutfalls) {
      const oDigitsNoZeros = o.outfall_number.replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";
      if (oDigitsNoZeros === digitsNoZeros) {
        return { outfallDbId: o.id, canonicalId: o.outfall_number, matchMethod: "digits_only" };
      }
    }
  }

  return null;
}

export function resolveParameterId(
  record: Pick<LabImportRecord, "parameter_raw" | "parameter_canonical" | "site_state">,
  aliasCache: ParameterAliasCache,
  nameToIdCache: Map<string, string>,
): { canonical: string; parameterId: string | null } {
  const rawLower = record.parameter_raw.trim().toLowerCase();
  const canonicalLower = record.parameter_canonical.trim().toLowerCase();
  const state = record.site_state?.toUpperCase() || null;

  const fromRaw = lookupParameterAlias(aliasCache, rawLower, state);
  if (fromRaw) return fromRaw;

  const fromCanonical = lookupParameterAlias(aliasCache, canonicalLower, state);
  if (fromCanonical) return fromCanonical;

  const mapped = PARAMETER_MAP[rawLower] ?? PARAMETER_MAP[canonicalLower];
  const canonical = mapped ?? record.parameter_canonical;

  const byName = nameToIdCache.get(canonical.toLowerCase());
  if (byName) {
    return { canonical, parameterId: byName };
  }

  return { canonical, parameterId: null };
}

function lookupParameterAlias(
  cache: ParameterAliasCache,
  key: string,
  _state: string | null,
): { canonical: string; parameterId: string | null } | null {
  if (!key) return null;
  const hit = cache.get(key);
  if (hit) {
    return { canonical: hit.canonicalName, parameterId: hit.parameterId };
  }
  return null;
}

async function loadParameterAliases(supabase: SupabaseClient): Promise<ParameterAliasCache> {
  const cache: ParameterAliasCache = new Map();

  try {
    const { data, error } = await supabase
      .from("parameter_aliases")
      .select(`
        alias,
        parameter_id,
        state_code,
        parameters:parameter_id (name)
      `) as {
        data: Array<{
          alias: string;
          parameter_id: string;
          state_code: string | null;
          parameters: { name: string } | null;
        }> | null;
        error: { message: string } | null;
      };

    if (error || !data) return cache;

    for (const row of data) {
      const alias = (row.alias ?? "").toLowerCase().trim();
      const parameterId = row.parameter_id;
      const canonicalName = row.parameters?.name ?? null;
      if (alias && parameterId && canonicalName) {
        cache.set(alias, { parameterId, canonicalName });
      }
    }
  } catch {
    // Fall back to PARAMETER_MAP + parameters table
  }

  return cache;
}

async function loadParameterNameIndex(supabase: SupabaseClient): Promise<Map<string, string>> {
  const index = new Map<string, string>();

  try {
    const { data, error } = await supabase
      .from("parameters")
      .select("id, name, short_name");

    if (error || !data) return index;

    for (const row of data as Array<{ id: string; name: string; short_name: string | null }>) {
      index.set(row.name.toLowerCase(), row.id);
      if (row.short_name) {
        index.set(row.short_name.toLowerCase(), row.id);
      }
    }
  } catch {
    // Import may still succeed when parameter_aliases cover all rows
  }

  return index;
}

async function loadOutfallAliases(
  supabase: SupabaseClient,
  organizationId: string,
  permitIds: string[],
): Promise<OutfallAliasCache> {
  const cache: OutfallAliasCache = new Map();
  if (!organizationId || permitIds.length === 0) return cache;

  try {
    const { data, error } = await supabase
      .from("outfall_aliases")
      .select(`
        alias,
        outfall_id,
        match_method,
        outfalls:outfall_id (outfall_number)
      `)
      .eq("organization_id", organizationId)
      .in("permit_id", permitIds) as {
        data: Array<{
          alias: string;
          outfall_id: string;
          match_method: string;
          outfalls: { outfall_number: string } | null;
        }> | null;
        error: { message: string } | null;
      };

    if (error || !data) return cache;

    for (const row of data) {
      const alias = (row.alias ?? "").toLowerCase().trim();
      const outfallDbId = row.outfall_id;
      const canonicalId = row.outfalls?.outfall_number ?? null;
      const matchMethod = row.match_method as OutfallMatchMethod;
      if (alias && outfallDbId && canonicalId) {
        cache.set(alias, { outfallId: outfallDbId, canonicalId, matchMethod });
      }
    }
  } catch {
    // Continue without alias cache
  }

  return cache;
}

async function saveOutfallAlias(
  supabase: SupabaseClient,
  alias: string,
  outfallId: string,
  organizationId: string,
  permitId: string,
  matchMethod: OutfallMatchMethod,
  source: OutfallAliasSource,
): Promise<void> {
  try {
    await supabase
      .from("outfall_aliases")
      .upsert({
        alias: alias.toLowerCase().trim(),
        outfall_id: outfallId,
        organization_id: organizationId,
        permit_id: permitId,
        match_method: matchMethod,
        source,
      }, {
        onConflict: "alias,organization_id,permit_id",
        ignoreDuplicates: true,
      });
  } catch {
    // Fire-and-forget
  }
}

interface PermitOutfallContext {
  permitMap: Map<string, string>;
  outfallsByPermit: Map<string, KnownOutfall[]>;
  outfallAliasCache: OutfallAliasCache;
}

async function loadPermitOutfallContext(
  supabase: SupabaseClient,
  organizationId: string | null,
  permitNumbers: string[],
): Promise<PermitOutfallContext> {
  const permitMap = new Map<string, string>();
  const outfallsByPermit = new Map<string, KnownOutfall[]>();
  const emptyAliasCache: OutfallAliasCache = new Map();

  if (permitNumbers.length === 0) {
    return { permitMap, outfallsByPermit, outfallAliasCache: emptyAliasCache };
  }

  let permitQuery = supabase
    .from("npdes_permits")
    .select("id, permit_number")
    .in("permit_number", permitNumbers);

  if (organizationId) {
    permitQuery = permitQuery.eq("organization_id", organizationId);
  }

  const { data: permits } = await permitQuery;
  if (!permits?.length) {
    return { permitMap, outfallsByPermit, outfallAliasCache: emptyAliasCache };
  }

  for (const p of permits as Array<{ id: string; permit_number: string }>) {
    permitMap.set(p.permit_number, p.id);
  }

  const permitIds = [...permitMap.values()];
  const { data: outfalls } = await supabase
    .from("outfalls")
    .select("id, outfall_number, permit_id")
    .in("permit_id", permitIds);

  if (outfalls) {
    for (const o of outfalls as KnownOutfall[]) {
      const list = outfallsByPermit.get(o.permit_id) ?? [];
      list.push(o);
      outfallsByPermit.set(o.permit_id, list);
    }
  }

  const outfallAliasCache = organizationId
    ? await loadOutfallAliases(supabase, organizationId, permitIds)
    : emptyAliasCache;

  return { permitMap, outfallsByPermit, outfallAliasCache };
}

export interface EnrichmentOptions {
  persistOutfallAliases?: boolean;
  aliasSource?: OutfallAliasSource;
}

/**
 * Resolve outfall_db_id and parameter_id on parsed lab records.
 */
export async function enrichLabImportRecords(
  supabase: SupabaseClient,
  organizationId: string | null,
  records: LabImportRecord[],
  options: EnrichmentOptions = {},
): Promise<EnrichmentResult> {
  const warnings: string[] = [];
  const persistOutfallAliases = options.persistOutfallAliases ?? false;
  const aliasSource = options.aliasSource ?? "manual";

  if (records.length === 0) {
    return {
      records,
      stats: {
        recordsTotal: 0,
        outfallsResolved: 0,
        parametersResolved: 0,
        outfallAliasesCreated: 0,
      },
      warnings,
    };
  }

  const permitNumbers = [...new Set(
    records.map((r) => r.permit_number.trim()).filter(Boolean),
  )];

  const [parameterAliasCache, parameterNameIndex, permitContext] = await Promise.all([
    loadParameterAliases(supabase),
    loadParameterNameIndex(supabase),
    loadPermitOutfallContext(supabase, organizationId, permitNumbers),
  ]);

  const { permitMap, outfallsByPermit, outfallAliasCache } = permitContext;
  const hasOutfallData = outfallsByPermit.size > 0;

  if (permitNumbers.length > 0 && !hasOutfallData) {
    warnings.push(
      `No permits/outfalls matched for: ${permitNumbers.slice(0, 5).join(", ")}${permitNumbers.length > 5 ? "…" : ""}`,
    );
  }

  let outfallsResolved = 0;
  let parametersResolved = 0;
  let outfallAliasesCreated = 0;
  const queuedAliases = new Set<string>();

  const enriched = records.map((record) => {
    const next: LabImportRecord = { ...record };

    if (!next.outfall_db_id && next.outfall_raw && hasOutfallData) {
      const permitId = permitMap.get(next.permit_number.trim());
      const knownOutfalls = permitId ? (outfallsByPermit.get(permitId) ?? []) : [];

      if (knownOutfalls.length > 0) {
        const match = fuzzyMatchOutfall(next.outfall_raw, knownOutfalls, outfallAliasCache);
        if (match) {
          next.outfall_matched = match.canonicalId;
          next.outfall_db_id = match.outfallDbId;
          next.outfall_match_method = match.matchMethod;
          outfallsResolved++;

          const normalizedAlias = next.outfall_raw.toLowerCase().trim();
          if (
            persistOutfallAliases &&
            organizationId &&
            permitId &&
            !outfallAliasCache.has(normalizedAlias)
          ) {
            const queueKey = `${normalizedAlias}|${permitId}`;
            if (!queuedAliases.has(queueKey)) {
              queuedAliases.add(queueKey);
              outfallAliasesCreated++;
              void saveOutfallAlias(
                supabase,
                normalizedAlias,
                match.outfallDbId,
                organizationId,
                permitId,
                match.matchMethod,
                aliasSource,
              );
            }
          }
        }
      }
    } else if (next.outfall_db_id) {
      outfallsResolved++;
    }

    if (!next.parameter_id) {
      const param = resolveParameterId(next, parameterAliasCache, parameterNameIndex);
      next.parameter_canonical = param.canonical || next.parameter_canonical;
      next.parameter_id = param.parameterId;
      if (param.parameterId) {
        parametersResolved++;
      }
    } else {
      parametersResolved++;
    }

    return next;
  });

  return {
    records: enriched,
    stats: {
      recordsTotal: enriched.length,
      outfallsResolved,
      parametersResolved,
      outfallAliasesCreated,
    },
    warnings,
  };
}

export function aliasSourceForDocumentType(
  documentType: ExtractedLabDataBase["document_type"],
): OutfallAliasSource {
  switch (documentType) {
    case "osmre_monitoring":
      return "osmre";
    case "lab_data_edd":
      return "lab_edd";
    case "va_lab_csv":
    case "al_lab_data":
    default:
      return "manual";
  }
}

/**
 * Rebuild extracted_data summaries after enrichment for Upload Dashboard preview.
 */
export function applyEnrichmentToExtracted(
  extracted: ExtractedLabDataBase,
  enrichment: EnrichmentResult,
): ExtractedLabDataBase {
  const rebuilt = buildExtractedLabData({
    ...extracted,
    records: enrichment.records,
    warnings: [...extracted.warnings, ...enrichment.warnings],
  });

  return {
    ...rebuilt,
    outfall_aliases_created: enrichment.stats.outfallAliasesCreated,
  };
}
