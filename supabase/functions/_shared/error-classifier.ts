/**
 * Error classification for Edge Function parsers.
 * Converts raw errors into user-friendly messages.
 */

/**
 * Classify an error and return user-friendly error messages.
 * Returns an array where the first element is the user-friendly message
 * and subsequent elements are technical details.
 */
export function classifyError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const raw = message.length > 800 ? message.slice(0, 800) + "..." : message;

  // Header/format mismatches
  if (lower.includes("header") && (lower.includes("mismatch") || lower.includes("expected"))) {
    return [
      "File does not match the expected format. Check that this is the correct file type for this category.",
      raw,
    ];
  }

  // Empty file
  if (lower.includes("no data rows") || lower.includes("no rows") || lower.includes("empty")) {
    return ["File contains no data rows. Only headers were found.", raw];
  }

  // No worksheet
  if (lower.includes("no worksheet") || lower.includes("no sheet")) {
    return ["Could not find a valid worksheet in this Excel file.", raw];
  }

  // Row limit exceeded
  if (lower.includes("row limit") || lower.includes("too many rows") || lower.includes("50,000") || lower.includes("50000")) {
    return ["File exceeds the 50,000 row limit. Please split into smaller files.", raw];
  }

  // Unsupported format
  if (lower.includes("unsupported format") || lower.includes("not supported")) {
    return ["File format not supported. Expected .xlsx, .xls, .csv, or .zip.", raw];
  }

  // Password protected
  if (lower.includes("password") || lower.includes("encrypted")) {
    return ["File is password protected. Please upload an unlocked version.", raw];
  }

  // Corrupt file
  if (lower.includes("corrupt") || lower.includes("malformed") || lower.includes("invalid")) {
    return ["File could not be read. It may be corrupted or in an unsupported format.", raw];
  }

  // ZIP extraction errors
  if (lower.includes("zip") || lower.includes("archive") || lower.includes("decompress")) {
    return ["Failed to extract ZIP archive. The file may be corrupted or use unsupported compression.", raw];
  }

  // Resource limits
  if (lower.includes("worker") || lower.includes("compute") || lower.includes("resource") || lower.includes("memory")) {
    return ["Edge Function ran out of compute resources. The file may be too large.", raw];
  }

  // Timeout
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
    return ["Processing timed out. The file may be too large.", raw];
  }

  // Storage errors
  if (lower.includes("storage") || lower.includes("download") || lower.includes("fetch")) {
    return ["Failed to download file from storage. Please try again.", raw];
  }

  // Database errors
  if (lower.includes("database") || lower.includes("postgres") || lower.includes("supabase")) {
    return ["Database operation failed. Please try again or contact support.", raw];
  }

  // NetDMR specific
  if (lower.includes("netdmr") || lower.includes("dmr")) {
    return ["DMR data format error. Check that this is a valid NetDMR export file.", raw];
  }

  // STORET code issues
  if (lower.includes("storet") || lower.includes("parameter code")) {
    return ["Unknown parameter code found. Some parameters could not be mapped.", raw];
  }

  // Permit not found
  if (lower.includes("permit") && lower.includes("not found")) {
    return ["Permit number not found in database. Import the permit before processing this file.", raw];
  }

  // Outfall not found
  if (lower.includes("outfall") && lower.includes("not found")) {
    return ["Outfall not found in database. Import the permit limits before processing this file.", raw];
  }

  // Default: return raw error
  return [raw];
}

/**
 * Extract the user-friendly message from classified errors
 */
export function getUserFriendlyError(err: unknown): string {
  return classifyError(err)[0];
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  // Transient errors that might succeed on retry
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("network") ||
    lower.includes("connection") ||
    lower.includes("temporarily") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("504")
  );
}
