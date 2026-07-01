import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivilegedOrAnonymousJwt } from "../_shared/auth.ts";
import {
  extractAllNetDmrRowsFromBlob,
  type NetDmrRow,
} from "../_shared/netdmr-parse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("FRONTEND_URL") ?? (
  (Deno.env.get("SUPABASE_URL") ?? "").includes("localhost") ? "http://localhost:5173" : ""
);

const responseCorsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const IMPORT_ALLOWED_ROLES = ["admin", "environmental_manager", "site_manager", "executive"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

interface AuthResult {
  userId: string;
  organizationId: string;
  canImport: boolean;
}

interface ExtractedDmrPreview {
  document_type: "netdmr_bundle";
  import_id?: string | null;
}

async function verifyAuth(
  req: Request,
  supabase: SupabaseClient,
): Promise<AuthResult | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  if (isPrivilegedOrAnonymousJwt(token)) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("organization_id, role_assignments(roles(name))")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) return null;

  const userRoles: string[] = [];
  const roleAssignments = profile.role_assignments;
  if (Array.isArray(roleAssignments)) {
    for (const assignment of roleAssignments) {
      if (assignment?.roles?.name) {
        userRoles.push(assignment.roles.name.toLowerCase());
      }
    }
  }

  return {
    userId: user.id,
    organizationId: profile.organization_id,
    canImport: userRoles.some((role) => IMPORT_ALLOWED_ROLES.includes(role)),
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseCorsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePermitNumber(raw: string): string {
  return raw.trim().toUpperCase();
}

function normalizeOutfallKey(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  const stripped = trimmed.replace(/^0+/, "") || "0";
  const digits = stripped.replace(/\D/g, "");
  return digits || stripped;
}

function resolveOutfallId(
  rawOutfall: string,
  permitId: string,
  byExact: Map<string, string>,
  byNormalized: Map<string, string>,
  aliasMap: Map<string, string>,
): string | null {
  const trimmed = rawOutfall.trim();
  if (!trimmed) return null;

  const aliasKey = `${permitId}|${trimmed.toLowerCase()}`;
  const aliasHit = aliasMap.get(aliasKey);
  if (aliasHit) return aliasHit;

  const exactKey = `${permitId}|${trimmed.toUpperCase()}`;
  const exact = byExact.get(exactKey);
  if (exact) return exact;

  const normKey = `${permitId}|${normalizeOutfallKey(trimmed)}`;
  return byNormalized.get(normKey) ?? null;
}

serve(async (req: Request) => {
  console.log("[import-netdmr-dmr] Invoked at", new Date().toISOString());

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: responseCorsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const auth = await verifyAuth(req, supabase);
  if (!auth) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
  const { userId, organizationId: userOrgId, canImport } = auth;

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  if (!canImport) {
    return jsonResponse(
      { success: false, error: "Forbidden: insufficient permissions to import data" },
      403,
    );
  }

  let queueId: string;
  try {
    const body = await req.json();
    queueId = body.queue_id;
    if (!queueId || typeof queueId !== "string") {
      throw new Error("queue_id required");
    }
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid request: queue_id (string) required" },
      400,
    );
  }

  const { data: queueEntry, error: fetchError } = await supabase
    .from("file_processing_queue")
    .select(
      "id, file_name, file_category, status, organization_id, storage_bucket, storage_path, extracted_data",
    )
    .eq("id", queueId)
    .single();

  if (fetchError || !queueEntry) {
    return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
  }

  if (queueEntry.status !== "parsed") {
    return jsonResponse(
      {
        success: false,
        error: `Cannot import entry with status '${queueEntry.status}'. Expected 'parsed'.`,
      },
      409,
    );
  }

  if (queueEntry.file_category !== "dmr") {
    return jsonResponse(
      {
        success: false,
        error: `import-netdmr-dmr only handles dmr files, not '${queueEntry.file_category}'`,
      },
      400,
    );
  }

  const extractedPreview = queueEntry.extracted_data as ExtractedDmrPreview | null;
  if (!extractedPreview || extractedPreview.document_type !== "netdmr_bundle") {
    return jsonResponse(
      { success: false, error: "No valid netdmr_bundle data — parse the file first" },
      400,
    );
  }

  const organizationId = queueEntry.organization_id;
  if (!organizationId) {
    return jsonResponse({ success: false, error: "Queue entry missing organization_id" }, 400);
  }

  if (organizationId !== userOrgId) {
    return jsonResponse(
      { success: false, error: "Access denied: queue entry belongs to different organization" },
      403,
    );
  }

  const { data: lockResult, error: lockError } = await supabase
    .from("file_processing_queue")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", queueId)
    .eq("status", "parsed")
    .select("id")
    .single();

  if (lockError || !lockResult) {
    return jsonResponse(
      { success: false, error: "Import already in progress for this entry" },
      409,
    );
  }

  let importId: string | null = extractedPreview.import_id ?? null;

  try {
    if (!importId) {
      const { data: importRow, error: importCreateError } = await supabase
        .from("data_imports")
        .insert({
          organization_id: organizationId,
          file_name: queueEntry.file_name,
          file_category: "dmr",
          source_system: "netdmr",
          import_status: "importing",
          import_started_at: new Date().toISOString(),
          imported_by: userId,
          record_count: 0,
          import_metadata: { queue_id: queueId, parser: "netdmr_bundle" },
          can_rollback: true,
        })
        .select("id")
        .single();

      if (importCreateError || !importRow) {
        throw new Error(`Failed to create data_imports: ${importCreateError?.message}`);
      }
      importId = importRow.id as string;
    }

    const { data: fileData, error: dlError } = await supabase.storage
      .from(queueEntry.storage_bucket)
      .download(queueEntry.storage_path);

    if (dlError || !fileData) {
      throw new Error(`Failed to download file: ${dlError?.message ?? "no data"}`);
    }

    const { rows, warnings: parseWarnings } = await extractAllNetDmrRowsFromBlob(
      fileData,
      queueEntry.file_name,
    );

    if (rows.length === 0) {
      throw new Error("No DMR rows found in file");
    }

    const { data: permits } = await supabase
      .from("npdes_permits")
      .select("id, permit_number")
      .eq("organization_id", organizationId);

    const permitIdByNumber = new Map<string, string>();
    for (const p of permits ?? []) {
      permitIdByNumber.set(normalizePermitNumber(p.permit_number), p.id);
    }

    const permitIds = [...permitIdByNumber.values()];

    const { data: outfalls } = permitIds.length > 0
      ? await supabase
        .from("outfalls")
        .select("id, permit_id, outfall_number")
        .in("permit_id", permitIds)
      : { data: [] };

    const outfallByExact = new Map<string, string>();
    const outfallByNormalized = new Map<string, string>();
    for (const o of outfalls ?? []) {
      const num = String(o.outfall_number).trim().toUpperCase();
      outfallByExact.set(`${o.permit_id}|${num}`, o.id);
      outfallByNormalized.set(
        `${o.permit_id}|${normalizeOutfallKey(num)}`,
        o.id,
      );
    }

    const { data: aliases } = await supabase
      .from("outfall_aliases")
      .select("alias, outfall_id, permit_id")
      .eq("organization_id", organizationId);

    const aliasMap = new Map<string, string>();
    for (const a of aliases ?? []) {
      if (!a.permit_id) continue;
      aliasMap.set(`${a.permit_id}|${String(a.alias).toLowerCase()}`, a.outfall_id);
    }

    const { data: parameters } = await supabase
      .from("parameters")
      .select("id, storet_code");

    const paramIdByStoret = new Map<string, string>();
    for (const p of parameters ?? []) {
      if (p.storet_code) {
        paramIdByStoret.set(String(p.storet_code).trim(), p.id);
      }
    }

    type SubmissionKey = string;
    const submissionRows = new Map<SubmissionKey, NetDmrRow[]>();

    let skippedNoPermit = 0;
    let skippedNoPeriod = 0;
    let skippedNoOutfall = 0;
    let skippedNoParameter = 0;

    for (const row of rows) {
      if (!row.monitoringPeriodStart || !row.monitoringPeriodEnd) {
        skippedNoPeriod++;
        continue;
      }

      const permitId = permitIdByNumber.get(normalizePermitNumber(row.permitNumber));
      if (!permitId) {
        skippedNoPermit++;
        continue;
      }

      const outfallId = resolveOutfallId(
        row.outfallId,
        permitId,
        outfallByExact,
        outfallByNormalized,
        aliasMap,
      );
      if (!outfallId) {
        skippedNoOutfall++;
        continue;
      }

      const parameterId = paramIdByStoret.get(row.parameterCode.trim());
      if (!parameterId) {
        skippedNoParameter++;
        continue;
      }

      const key =
        `${permitId}|${row.monitoringPeriodStart}|${row.monitoringPeriodEnd}`;
      if (!submissionRows.has(key)) {
        submissionRows.set(key, []);
      }
      submissionRows.get(key)!.push(row);
    }

    let submissionsCreated = 0;
    let lineItemsCreated = 0;
    const importedSubmissionIds: string[] = [];

    for (const [key, groupRows] of submissionRows) {
      const [permitId, periodStart, periodEnd] = key.split("|");
      const allNoDischarge = groupRows.every((r) => r.nodiCode?.toUpperCase() === "C");

      const { data: submission, error: subError } = await supabase
        .from("dmr_submissions")
        .upsert(
          {
            organization_id: organizationId,
            permit_id: permitId,
            monitoring_period_start: periodStart,
            monitoring_period_end: periodEnd,
            submission_type: "monthly",
            status: "draft",
            no_discharge: allNoDischarge,
            source_file_id: queueId,
            import_id: importId,
          },
          { onConflict: "permit_id,monitoring_period_start,monitoring_period_end" },
        )
        .select("id")
        .single();

      if (subError || !submission) {
        console.error("[import-netdmr-dmr] Submission upsert failed:", subError?.message);
        continue;
      }

      submissionsCreated++;
      importedSubmissionIds.push(submission.id);

      const lineItems = groupRows.map((row) => {
        const outfallId = resolveOutfallId(
          row.outfallId,
          permitId,
          outfallByExact,
          outfallByNormalized,
          aliasMap,
        )!;
        const parameterId = paramIdByStoret.get(row.parameterCode.trim())!;

        return {
          submission_id: submission.id,
          outfall_id: outfallId,
          parameter_id: parameterId,
          statistical_base: row.statisticalBase,
          limit_value: row.limitValue,
          limit_unit: row.limitUnit || null,
          measured_value: row.measuredValue,
          measured_unit: row.measuredUnit || null,
          nodi_code: row.nodiCode,
          is_exceedance: row.isExceedance,
          exceedance_pct: row.exceedancePct,
          sample_count: row.sampleCount,
          storet_code: row.parameterCode,
        };
      });

      const { data: insertedLines, error: lineError } = await supabase
        .from("dmr_line_items")
        .upsert(lineItems, {
          onConflict: "submission_id,outfall_id,parameter_id,statistical_base",
          ignoreDuplicates: false,
        })
        .select("id");

      if (lineError) {
        console.error("[import-netdmr-dmr] Line items upsert failed:", lineError.message);
        continue;
      }

      lineItemsCreated += insertedLines?.length ?? 0;
    }

    const now = new Date().toISOString();
    const recordsFailed =
      skippedNoPermit + skippedNoPeriod + skippedNoOutfall + skippedNoParameter;

    await supabase
      .from("file_processing_queue")
      .update({
        status: "imported",
        imported_at: now,
        updated_at: now,
        records_imported: lineItemsCreated,
        records_failed: recordsFailed,
        error_log: [
          ...parseWarnings,
          ...(recordsFailed > 0
            ? [`Skipped ${recordsFailed} rows (missing permit, period, outfall, or parameter)`]
            : []),
        ],
      })
      .eq("id", queueId);

    if (importId) {
      await supabase
        .from("data_imports")
        .update({
          import_status: "imported",
          import_completed_at: now,
          record_count: lineItemsCreated,
          import_metadata: {
            submissions_created: submissionsCreated,
            line_items_created: lineItemsCreated,
            skipped_no_permit: skippedNoPermit,
            skipped_no_period: skippedNoPeriod,
            skipped_no_outfall: skippedNoOutfall,
            skipped_no_parameter: skippedNoParameter,
            submission_ids: importedSubmissionIds.slice(0, 50),
          },
        })
        .eq("id", importId);
    }

    const auditPayload = {
      user_id: userId,
      organization_id: organizationId,
      action: "bulk_process",
      module: "import",
      table_name: "dmr_submissions",
      record_id: queueId,
      description: JSON.stringify({
        action_type: "netdmr_dmr_imported",
        file_name: queueEntry.file_name,
        submissions_created: submissionsCreated,
        line_items_created: lineItemsCreated,
        skipped_no_permit: skippedNoPermit,
        skipped_no_outfall: skippedNoOutfall,
        skipped_no_parameter: skippedNoParameter,
        import_id: importId,
      }),
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: auditError } = await supabase.from("audit_log").insert(auditPayload);
      if (!auditError) break;
      if (attempt === 3) {
        console.error("[import-netdmr-dmr] Audit log failed after 3 attempts");
      } else {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    console.log(
      "[import-netdmr-dmr] Success:",
      queueEntry.file_name,
      "| submissions:", submissionsCreated,
      "| lines:", lineItemsCreated,
      "| skipped:", recordsFailed,
    );

    return jsonResponse({
      success: true,
      submissions_created: submissionsCreated,
      line_items_created: lineItemsCreated,
      skipped_no_permit: skippedNoPermit,
      skipped_no_outfall: skippedNoOutfall,
      skipped_no_parameter: skippedNoParameter,
      import_id: importId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[import-netdmr-dmr] Error:", message);

    await supabase
      .from("file_processing_queue")
      .update({
        status: "failed",
        error_log: [`Import failed: ${message}`],
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueId);

    return jsonResponse({ success: false, error: message }, 500);
  }
});
