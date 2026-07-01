import { unzipSync } from "https://esm.sh/fflate@0.8.2";

/** Read a named entry from a single-file MSHA OGD zip (Mines.txt / Violations.txt). */
export async function readZipTextEntry(
  blob: Blob,
  entryMatcher: (name: string) => boolean,
): Promise<string> {
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const match = Object.entries(archive).find(([name]) => entryMatcher(name.toLowerCase()));
  if (!match?.[1]) {
    throw new Error("Expected entry not found in MSHA archive");
  }
  return new TextDecoder().decode(match[1]);
}
