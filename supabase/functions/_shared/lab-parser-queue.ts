/**
 * Shared queue/auth helpers for state-specific lab parsers.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivilegedOrAnonymousJwt } from "./auth.ts";
import { markFailed, markParsed, markProcessing } from "./queue-status.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClient = any;

export const LAB_PARSER_MAX_FILE_SIZE = 50 * 1024 * 1024;

export function jsonResponse(body: Record<string, unknown>, status = 200, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export async function verifyLabParserAuth(
  req: Request,
  supabase: SupabaseClient,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  if (isPrivilegedOrAnonymousJwt(token)) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

export interface LabQueueEntry {
  id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number | null;
  file_category: string;
  state_code: string | null;
  status: string;
  organization_id: string | null;
}

export async function loadLabQueueEntry(
  supabase: SupabaseClient,
  queueId: string,
): Promise<{ entry: LabQueueEntry | null; error?: string }> {
  const { data, error } = await supabase
    .from("file_processing_queue")
    .select(
      "id, storage_bucket, storage_path, file_name, file_size_bytes, file_category, state_code, status, organization_id",
    )
    .eq("id", queueId)
    .single();

  if (error || !data) {
    return { entry: null, error: "Queue entry not found" };
  }
  return { entry: data as LabQueueEntry };
}

export function validateLabQueueEntry(
  entry: LabQueueEntry,
  expectedCategory = "lab_data",
): string | null {
  if (entry.status !== "queued" && entry.status !== "failed") {
    return `Cannot process entry with status '${entry.status}'. Expected 'queued' or 'failed'.`;
  }
  if (entry.file_category !== expectedCategory) {
    return `Expected '${expectedCategory}' files, not '${entry.file_category}'.`;
  }
  const fileSize = entry.file_size_bytes ?? 0;
  if (fileSize > LAB_PARSER_MAX_FILE_SIZE) {
    return `File is too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Maximum is ${LAB_PARSER_MAX_FILE_SIZE / 1024 / 1024}MB.`;
  }
  return null;
}

export async function downloadQueueFile(
  supabase: SupabaseClient,
  entry: LabQueueEntry,
): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(entry.storage_bucket)
    .download(entry.storage_path);

  if (error || !data) {
    throw new Error(`Failed to download file: ${error?.message ?? "no data returned"}`);
  }
  return data.arrayBuffer();
}

export { markFailed, markParsed, markProcessing };
