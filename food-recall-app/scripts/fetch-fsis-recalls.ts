/**
 * Build-time script: fetches the official FSIS Recall API,
 * keeps non-archived records, normalizes them with the shared
 * mapper, and writes public/fsis-recalls.json as static JSON.
 *
 * Only active records are bundled: the full API history is
 * thousands of closed recalls and would bloat the client bundle.
 *
 * Pass --recalls-only to exclude Public Health Alerts and keep
 * only recall records.
 *
 * Fetch failure is non-fatal: the script writes an empty snapshot
 * with an error field so `npm run build` stays offline/CI-safe.
 * Never write seed or placeholder recall rows.
 *
 * Run: tsx scripts/fetch-fsis-recalls.ts [--recalls-only]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type FsisApiRecord, type FsisSnapshot, isArchived, mapFsisRecord } from "../src/lib/fsis.ts";
import type { Recall } from "../src/types/recall";

const FSIS_API_URL = "https://www.fsis.usda.gov/fsis/api/recall/v/1";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "fsis-recalls.json");

function writeSnapshot(recalls: Recall[], error: string | null): void {
  const snapshot: FsisSnapshot = {
    recalls,
    error,
    fetchedAt: error ? null : new Date().toISOString(),
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`Wrote ${OUT_PATH} (${recalls.length} recalls${error ? `; error: ${error}` : ""})`);
}

async function main() {
  console.log(`Fetching FSIS recalls from ${FSIS_API_URL}...`);
  const res = await fetch(FSIS_API_URL, {
    headers: { "User-Agent": "Beanstalk-FoodRecall/1.0 (build script)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    writeSnapshot([], `FSIS API fetch failed: ${res.status} ${res.statusText}`);
    return;
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("application/json")) {
    writeSnapshot([], `FSIS API returned non-JSON content-type: ${contentType}`);
    return;
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    writeSnapshot([], "FSIS API returned a non-array payload");
    return;
  }
  console.log(`Received ${(data as unknown[]).length} API records.`);

  const recallsOnly = process.argv.includes("--recalls-only");
  const recalls: Recall[] = [];
  let archived = 0;
  let alertsSkipped = 0;
  for (const item of data as FsisApiRecord[]) {
    try {
      if (isArchived(item)) {
        archived += 1;
        continue;
      }
      if (recallsOnly && String((item as Record<string, unknown>).field_recall_type) === "Public Health Alert") {
        alertsSkipped += 1;
        continue;
      }
      const mapped = mapFsisRecord(item);
      if (mapped) recalls.push(mapped);
    } catch {
      // One malformed record must not abort the snapshot.
    }
  }

  const seen = new Set<string>();
  const deduped: Recall[] = [];
  for (const r of recalls) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      deduped.push(r);
    }
  }
  deduped.sort((a, b) => b.recallInitiationDate.localeCompare(a.recallInitiationDate));

  if (recallsOnly) {
    console.log(
      `Kept ${deduped.length} active FSIS recalls (skipped ${archived} archived, ${alertsSkipped} alerts --recalls-only).`,
    );
  } else {
    console.log(`Kept ${deduped.length} active FSIS recalls (skipped ${archived} archived).`);
  }

  writeSnapshot(deduped, null);
}

main().catch((err) => {
  console.error("FSIS fetch failed:", err);
  writeSnapshot([], err instanceof Error ? err.message : String(err));
});
