/**
 * Import parsed permit PDF extracted_data into npdes_permits / outfalls / permit_limits.
 */

import { resolveParameterId, type SupabaseClient } from "./lab-record-enrichment.ts";

export const PERMIT_PDF_IMPORT_TYPES = new Set([
  "original_permit",
  "renewal",
  "draft_permit",
  "tsmp_permit",
  "modification",
]);

export interface ExtractedPermitPdfLimit {
  parameter?: string;
  outfall?: string;
  value?: string;
  unit?: string;
  frequency?: string;
}

export interface ExtractedPermitPdf {
  document_type: string;
  permit_number?: string;
  state?: string;
  effective_date?: string;
  expiration_date?: string;
  outfall_count?: number;
  limit_count?: number;
  limits?: ExtractedPermitPdfLimit[];
}

export interface PermitPdfImportResult {
  permitsCreated: number;
  outfallsCreated: number;
  limitsCreated: number;
  skippedNoParameter: number;
  importedPermitIds: string[];
  importedOutfallIds: string[];
  importedLimitIds: string[];
}

function normalizeOutfallNumber(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length > 0) {
    return digits.padStart(3, "0");
  }
  return trimmed;
}

function parseLimitValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadParameterCaches(supabase: SupabaseClient): Promise<{
  aliasCache: Map<string, { parameterId: string; canonicalName: string }>;
  nameToIdCache: Map<string, string>;
}> {
  const aliasCache = new Map<string, { parameterId: string; canonicalName: string }>();
  const nameToIdCache = new Map<string, string>();

  const { data: aliases } = await supabase
    .from("parameter_aliases")
    .select("alias, parameter_id, parameters:parameter_id (name, short_name)");

  for (const row of aliases ?? []) {
    const alias = String(row.alias ?? "").toLowerCase();
    const paramId = row.parameter_id as string | null;
    const param = row.parameters as { name?: string; short_name?: string } | null;
    if (!alias || !paramId) continue;
    aliasCache.set(alias, {
      parameterId: paramId,
      canonicalName: param?.short_name ?? param?.name ?? alias,
    });
  }

  const { data: parameters } = await supabase
    .from("parameters")
    .select("id, name, short_name");

  for (const param of parameters ?? []) {
    if (param.name) nameToIdCache.set(String(param.name).toLowerCase(), param.id);
    if (param.short_name) nameToIdCache.set(String(param.short_name).toLowerCase(), param.id);
  }

  return { aliasCache, nameToIdCache };
}

export async function importPermitPdfExtractedData(
  supabase: SupabaseClient,
  extracted: ExtractedPermitPdf,
  organizationId: string,
  stateCode: string,
  regulatoryAgency: string | null,
  importBatchId: string,
): Promise<PermitPdfImportResult> {
  if (!extracted.permit_number) {
    throw new Error("Permit number is required for PDF import");
  }

  if (!extracted.limits || extracted.limits.length === 0) {
    throw new Error("No limits found in parsed permit PDF extraction");
  }

  const { aliasCache, nameToIdCache } = await loadParameterCaches(supabase);

  let permitsCreated = 0;
  let outfallsCreated = 0;
  let limitsCreated = 0;
  let skippedNoParameter = 0;
  const importedPermitIds: string[] = [];
  const importedOutfallIds: string[] = [];
  const importedLimitIds: string[] = [];

  let permitId: string;
  const { data: existingPermit } = await supabase
    .from("npdes_permits")
    .select("id")
    .eq("permit_number", extracted.permit_number)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingPermit) {
    permitId = existingPermit.id;
    if (extracted.effective_date || extracted.expiration_date) {
      await supabase
        .from("npdes_permits")
        .update({
          ...(extracted.effective_date ? { effective_date: extracted.effective_date } : {}),
          ...(extracted.expiration_date ? { expiration_date: extracted.expiration_date } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", permitId);
    }
  } else {
    const { data: newPermit, error: permitCreateError } = await supabase
      .from("npdes_permits")
      .insert({
        permit_number: extracted.permit_number,
        organization_id: organizationId,
        state_code: stateCode,
        regulatory_agency: regulatoryAgency,
        permit_status: "active",
        effective_date: extracted.effective_date ?? null,
        expiration_date: extracted.expiration_date ?? null,
      })
      .select("id")
      .single();

    if (permitCreateError || !newPermit) {
      throw new Error(`Failed to create permit ${extracted.permit_number}: ${permitCreateError?.message}`);
    }

    permitId = newPermit.id;
    permitsCreated++;
    importedPermitIds.push(permitId);
  }

  const outfallIdMap = new Map<string, string>();
  const uniqueOutfalls = new Set<string>();

  for (const limit of extracted.limits) {
    if (limit.outfall) uniqueOutfalls.add(normalizeOutfallNumber(limit.outfall));
  }

  for (const outfallNumber of uniqueOutfalls) {
    const { data: existingOutfall } = await supabase
      .from("outfalls")
      .select("id")
      .eq("permit_id", permitId)
      .eq("outfall_number", outfallNumber)
      .maybeSingle();

    if (existingOutfall) {
      outfallIdMap.set(outfallNumber, existingOutfall.id);
      continue;
    }

    const { data: newOutfall, error: outfallCreateError } = await supabase
      .from("outfalls")
      .insert({
        permit_id: permitId,
        outfall_number: outfallNumber,
        is_active: true,
      })
      .select("id")
      .single();

    if (outfallCreateError || !newOutfall) {
      console.warn("[import-permit-pdf] Failed to create outfall:", outfallNumber, outfallCreateError?.message);
      continue;
    }

    outfallIdMap.set(outfallNumber, newOutfall.id);
    outfallsCreated++;
    importedOutfallIds.push(newOutfall.id);
  }

  const limitsToUpsert: Array<Record<string, unknown>> = [];

  for (const limit of extracted.limits) {
    const parameterRaw = limit.parameter?.trim() ?? "";
    if (!parameterRaw) {
      skippedNoParameter++;
      continue;
    }

    const resolved = resolveParameterId(
      {
        parameter_raw: parameterRaw,
        parameter_canonical: parameterRaw,
        site_state: stateCode,
      },
      aliasCache,
      nameToIdCache,
    );

    if (!resolved.parameterId) {
      skippedNoParameter++;
      continue;
    }

    const outfallNumber = normalizeOutfallNumber(limit.outfall ?? "001");
    const outfallId = outfallIdMap.get(outfallNumber);
    if (!outfallId) {
      continue;
    }

    const limitValue = parseLimitValue(limit.value);
    const frequency = limit.frequency?.trim().toLowerCase() ?? "";
    const statisticalBase = frequency.includes("avg") || frequency.includes("average")
      ? "average"
      : "maximum";

    limitsToUpsert.push({
      permit_id: permitId,
      outfall_id: outfallId,
      parameter_id: resolved.parameterId,
      limit_type: limitValue !== null ? "daily_max" : "numeric",
      limit_value: limitValue,
      limit_min: null,
      limit_max: limitValue,
      unit: limit.unit ?? null,
      statistical_base: statisticalBase,
      monitoring_frequency: limit.frequency ?? null,
      sample_type: null,
      is_active: true,
      review_status: "pending_review",
      extraction_source: "ai_pdf",
      extraction_confidence: null,
      import_batch_id: importBatchId,
    });
  }

  if (limitsToUpsert.length > 0) {
    const { data: upsertedLimits, error: limitsError } = await supabase
      .from("permit_limits")
      .upsert(limitsToUpsert, {
        onConflict: "outfall_id,parameter_id,statistical_base,monitoring_frequency",
        ignoreDuplicates: false,
      })
      .select("id");

    if (limitsError) {
      throw new Error(`Limits upsert failed: ${limitsError.message}`);
    }

    limitsCreated = upsertedLimits?.length ?? 0;
    importedLimitIds.push(...(upsertedLimits ?? []).map((l: { id: string }) => l.id));
  }

  return {
    permitsCreated,
    outfallsCreated,
    limitsCreated,
    skippedNoParameter,
    importedPermitIds,
    importedOutfallIds,
    importedLimitIds,
  };
}
