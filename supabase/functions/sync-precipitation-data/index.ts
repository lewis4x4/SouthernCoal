import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NOAA_CDO_TOKEN = Deno.env.get("NOAA_CDO_TOKEN") ?? "";

const NOAA_CDO_BASE = "https://www.ncei.noaa.gov/cdo-web/api/v2";
const MAX_RETRIES = 3;
const BACKOFF_SCHEDULE = [30_000, 60_000, 120_000]; // 30s, 60s, 120s
const RATE_LIMIT_MS = 250; // NOAA CDO limit: 5 req/sec
const STALE_THRESHOLD_HOURS = 48;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WeatherStation {
  id: string;
  station_id: string; // NOAA station ID e.g. "GHCND:USC00461220"
  station_name: string;
  organization_id: string;
  is_active: boolean;
}

interface ThresholdResult {
  outfall_id: string;
  site_id: string;
  organization_id: string | null;
  threshold_inches: number;
  exceeded: boolean;
}

interface AuthResult {
  authorized: boolean;
  userId: string | null;
  orgId: string | null;
  role: string | null;
}

// ---------------------------------------------------------------------------
// Auth — dual path: Bearer JWT (manual) OR service role key (cron)
// ---------------------------------------------------------------------------
const ALLOWED_ROLES = ["environmental_manager", "executive", "admin", "site_manager"];

async function validateAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<AuthResult> {
  const denied: AuthResult = { authorized: false, userId: null, orgId: null, role: null };

  // Path 1: Internal secret header (cron, server-to-server)
  const internalSecret = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";
  if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
    return { authorized: true, userId: null, orgId: null, role: "system" };
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");

    // Path 2: User JWT (manual trigger) — verify signature via Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return denied;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) return denied;

    const { data: roleData } = await supabase
      .from("user_role_assignments")
      .select("roles(name)")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const userRole = (
      roleData?.roles &&
      typeof roleData.roles === "object" &&
      "name" in roleData.roles
    )
      ? (roleData.roles as { name: string }).name
      : null;

    if (!userRole || !ALLOWED_ROLES.includes(userRole)) return denied;

    return {
      authorized: true,
      userId: user.id,
      orgId: profile.organization_id,
      role: userRole,
    };
  }

  return denied;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = MAX_RETRIES,
  timeoutMs = 30_000,
): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (resp.ok) return resp;
      if (resp.status === 429 || resp.status === 503) {
        const backoff = BACKOFF_SCHEDULE[attempt] ?? 120_000;
        console.log(`NOAA CDO ${resp.status}, backing off ${backoff}ms (attempt ${attempt + 1})`);
        await sleep(backoff);
        continue;
      }
      console.error(`NOAA CDO error: ${resp.status} for ${url}`);
      return null;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(`NOAA CDO timeout after ${timeoutMs}ms (attempt ${attempt + 1}): ${url}`);
      } else {
        console.error(`NOAA CDO fetch error (attempt ${attempt + 1}):`, err);
      }
      if (attempt === retries - 1) return null;
      const backoff = BACKOFF_SCHEDULE[attempt] ?? 120_000;
      await sleep(backoff);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth
  const auth = await validateAuth(req, supabase);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!NOAA_CDO_TOKEN) {
    return new Response(
      JSON.stringify({ success: false, error: "NOAA_CDO_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Parse optional body
  let targetDate = getYesterday();
  let targetStationId: string | null = null;
  try {
    const body = await req.json();
    if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      targetDate = body.date;
    }
    if (typeof body.station_id === "string" && body.station_id.trim().length > 0) {
      targetStationId = body.station_id.trim();
    }
  } catch {
    // No body is fine — defaults apply
  }

  // -----------------------------------------------------------------------
  // 1. Fetch active weather stations
  // -----------------------------------------------------------------------
  let stationQuery = supabase
    .from("weather_stations")
    .select("id, station_id, station_name, organization_id, is_active")
    .eq("data_source", "ncei_cdo")
    .eq("is_active", true);

  if (targetStationId) {
    stationQuery = stationQuery.eq("id", targetStationId);
  }

  const { data: stations, error: stationError } = await stationQuery;

  if (stationError) {
    console.error("Error querying weather stations:", stationError);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to query weather stations" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!stations || stations.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: "No active weather stations found",
        synced: 0,
        gaps: 0,
        alerts: 0,
        failures: 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`Found ${stations.length} active weather stations for date ${targetDate}`);

  // -----------------------------------------------------------------------
  // 2. Create sync log entry
  // -----------------------------------------------------------------------
  const orgId = stations[0].organization_id;
  const { data: syncLog, error: syncLogError } = await supabase
    .from("external_sync_log")
    .insert({
      organization_id: orgId,
      source: "noaa_precipitation",
      sync_type: auth.role === "system" ? "scheduled" : "manual",
      status: "running",
      triggered_by: auth.userId,
    })
    .select("id")
    .single();

  if (syncLogError || !syncLog) {
    console.error("Failed to create sync log:", syncLogError);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to create sync log" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // -----------------------------------------------------------------------
  // 3. Fetch precipitation data for each station
  // -----------------------------------------------------------------------
  let synced = 0;
  let gaps = 0;
  let alerts = 0;
  let failures = 0;
  const errors: string[] = [];

  const noaaHeaders = { token: NOAA_CDO_TOKEN };

  for (const station of stations as WeatherStation[]) {
    try {
      const url = `${NOAA_CDO_BASE}/data?datasetid=GHCND&stationid=${encodeURIComponent(station.station_id)}&datatypeid=PRCP&startdate=${targetDate}&enddate=${targetDate}&units=standard`;

      const resp = await fetchWithRetry(url, noaaHeaders);

      if (!resp) {
        failures++;
        errors.push(`${station.station_id} (${station.station_name}): fetch failed after ${MAX_RETRIES} retries`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const data = await resp.json() as Record<string, unknown>;

      // NOAA CDO returns { metadata: {...}, results: [...] } when data exists,
      // or { metadata: { resultset: { count: 0 } } } / empty object when no data.
      const results = data?.results as Array<Record<string, unknown>> | undefined;

      if (!results || results.length === 0) {
        // ---------------------------------------------------------------
        // 4. Data gap handling
        // ---------------------------------------------------------------
        gaps++;
        console.log(`${station.station_id}: no data for ${targetDate} — flagging as STATION_DATA_GAP`);

        // Insert gap notification for env_manager
        await supabase.from("notifications").insert({
          organization_id: station.organization_id,
          type: "STATION_DATA_GAP",
          title: `No precipitation data: ${station.station_name}`,
          message: `Weather station ${station.station_name} (${station.station_id}) returned no data for ${targetDate}. Manual data entry or station investigation may be required.`,
          severity: "warning",
          target_roles: ["environmental_manager"],
          metadata: {
            station_id: station.id,
            noaa_station_id: station.station_id,
            station_name: station.station_name,
            date: targetDate,
          },
        });

        // ---------------------------------------------------------------
        // 5. Check for staleness (48+ hours with no data)
        // ---------------------------------------------------------------
        const { data: latestReading } = await supabase
          .from("precipitation_readings")
          .select("reading_date")
          .eq("weather_station_id", station.id)
          .order("reading_date", { ascending: false })
          .limit(1)
          .single();

        if (latestReading?.reading_date) {
          const lastDate = new Date(latestReading.reading_date);
          const targetDateObj = new Date(targetDate);
          const hoursSinceData = (targetDateObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60);

          if (hoursSinceData >= STALE_THRESHOLD_HOURS) {
            console.log(`${station.station_id}: STALE — no data for ${hoursSinceData.toFixed(0)} hours`);

            await supabase.from("notifications").insert({
              organization_id: station.organization_id,
              type: "STATION_STALE",
              title: `Stale weather station: ${station.station_name}`,
              message: `Weather station ${station.station_name} (${station.station_id}) has had no data for ${hoursSinceData.toFixed(0)} hours (since ${latestReading.reading_date}). Station may be offline or decommissioned.`,
              severity: "high",
              target_roles: ["environmental_manager"],
              metadata: {
                station_id: station.id,
                noaa_station_id: station.station_id,
                station_name: station.station_name,
                last_reading_date: latestReading.reading_date,
                hours_since_data: Math.round(hoursSinceData),
              },
            });
          }
        }

        await sleep(RATE_LIMIT_MS);
        continue;
      }

      // ---------------------------------------------------------------
      // 6. Upsert precipitation readings
      // ---------------------------------------------------------------
      // NOAA PRCP values in standard units are in inches
      // results may contain multiple entries; take the PRCP one
      const prcpRecord = results.find((r) => r.datatype === "PRCP");
      const rainfallInches = prcpRecord ? Number(prcpRecord.value) : 0;

      const { error: upsertErr } = await supabase
        .from("precipitation_readings")
        .upsert(
          {
            weather_station_id: station.id,
            reading_date: targetDate,
            reading_time: null, // daily summary
            rainfall_inches: rainfallInches,
            source_type: "api_automated",
            raw_api_response: data,
            created_at: new Date().toISOString(),
          },
          { onConflict: "weather_station_id,reading_date,reading_time" },
        );

      if (upsertErr) {
        failures++;
        errors.push(`${station.station_id}: upsert failed — ${upsertErr.message}`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      synced++;
      console.log(`${station.station_id}: ${rainfallInches}" precipitation on ${targetDate}`);

      // ---------------------------------------------------------------
      // 7. Check rain event thresholds
      // ---------------------------------------------------------------
      const { data: thresholdResults, error: thresholdErr } = await supabase
        .rpc("check_rain_event_thresholds", {
          p_station_id: station.id,
          p_date: targetDate,
          p_rainfall_inches: rainfallInches,
        });

      if (thresholdErr) {
        console.error(`${station.station_id}: threshold check failed — ${thresholdErr.message}`);
        errors.push(`${station.station_id}: threshold check failed — ${thresholdErr.message}`);
      } else if (thresholdResults && Array.isArray(thresholdResults)) {
        const exceededOutfalls = (thresholdResults as ThresholdResult[]).filter((r) => r.exceeded);

        for (const outfall of exceededOutfalls) {
          // ---------------------------------------------------------------
          // 8. Create precipitation events + notifications for exceedances
          // ---------------------------------------------------------------
          const { error: eventErr } = await supabase
            .from("precipitation_events")
            .insert({
              site_id: outfall.site_id,
              organization_id: outfall.organization_id,
              outfall_id: outfall.outfall_id,
              weather_station_id: station.id,
              weather_station: station.station_name, // backward compat text column
              event_start: targetDate,
              rainfall_amount_inches: rainfallInches,
              threshold_inches: outfall.threshold_inches,
              trigger_source: "automated",
              status: "alert_generated",
            });

          if (eventErr) {
            console.error(`${station.station_id}: event insert failed for outfall ${outfall.outfall_id} — ${eventErr.message}`);
            errors.push(`${station.station_id}: event insert for outfall ${outfall.outfall_id} — ${eventErr.message}`);
          } else {
            alerts++;
            console.log(`${station.station_id}: ALERT — ${rainfallInches}" exceeded threshold ${outfall.threshold_inches}" at outfall ${outfall.outfall_id}`);

            // Notify supervisor roles
            await supabase.from("notifications").insert({
              organization_id: outfall.organization_id || station.organization_id,
              type: "RAIN_EVENT_ALERT",
              title: `Rain event threshold exceeded: ${station.station_name}`,
              message: `${rainfallInches}" of precipitation recorded on ${targetDate} at ${station.station_name}, exceeding the ${outfall.threshold_inches}" threshold for outfall ${outfall.outfall_id}. Sampling may be required within regulatory timeframes.`,
              severity: "critical",
              target_roles: ["site_manager", "environmental_manager"],
              metadata: {
                station_id: station.id,
                noaa_station_id: station.station_id,
                station_name: station.station_name,
                outfall_id: outfall.outfall_id,
                site_id: outfall.site_id,
                rainfall_inches: rainfallInches,
                threshold_inches: outfall.threshold_inches,
                date: targetDate,
              },
            });
          }
        }
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      failures++;
      errors.push(`${station.station_id}: unexpected error — ${String(err)}`);
    }
  }

  // -----------------------------------------------------------------------
  // 9. System outage detection — all stations failed
  // -----------------------------------------------------------------------
  if (failures === stations.length && stations.length > 0) {
    console.error("SYSTEM_WEATHER_OUTAGE: all stations failed");

    await supabase.from("notifications").insert({
      organization_id: orgId,
      type: "SYSTEM_WEATHER_OUTAGE",
      title: "Weather data system outage",
      message: `All ${stations.length} weather station(s) failed to return data for ${targetDate}. The NOAA CDO API may be experiencing an outage. Manual precipitation data entry is required until service is restored.`,
      severity: "critical",
      target_roles: ["site_manager", "environmental_manager"],
      metadata: {
        date: targetDate,
        stations_attempted: stations.length,
        errors: errors.slice(0, 20), // cap to avoid oversized payload
      },
    });
  }

  // -----------------------------------------------------------------------
  // 10. Update sync log
  // -----------------------------------------------------------------------
  const finalStatus = failures === stations.length ? "failed" : "completed";
  await supabase
    .from("external_sync_log")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      records_synced: synced,
      records_failed: failures,
      error_details: errors.length > 0 ? { errors } : null,
      metadata: {
        source: "noaa_precipitation",
        date: targetDate,
        stations_total: stations.length,
        stations_synced: synced,
        stations_gaps: gaps,
        alerts_generated: alerts,
        failures,
        target_station_id: targetStationId,
        triggered_by: auth.userId || "system",
      },
    })
    .eq("id", syncLog.id);

  // -----------------------------------------------------------------------
  // 11. Audit log
  // -----------------------------------------------------------------------
  const { error: auditErr } = await supabase.from("audit_log").insert({
    user_id: auth.userId,
    organization_id: orgId,
    action: failures === stations.length ? "precipitation_sync_failed" : "precipitation_sync_completed",
    module: "precipitation",
    table_name: "external_sync_log",
    record_id: syncLog.id,
    description: JSON.stringify({
      source: "noaa_precipitation",
      date: targetDate,
      stations_total: stations.length,
      synced,
      gaps,
      alerts,
      failures,
      errors_count: errors.length,
      target_station_id: targetStationId,
      triggered_by: auth.userId || "system",
      role: auth.role,
    }),
  });
  if (auditErr) console.error("Audit log insert failed:", auditErr.message);

  // -----------------------------------------------------------------------
  // 12. Return summary
  // -----------------------------------------------------------------------
  console.log(`Precipitation sync complete: ${synced} synced, ${gaps} gaps, ${alerts} alerts, ${failures} failures`);

  return new Response(
    JSON.stringify({
      success: true,
      syncLogId: syncLog.id,
      date: targetDate,
      synced,
      gaps,
      alerts,
      failures,
      stationsTotal: stations.length,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
