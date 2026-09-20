import { loadConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import { enrichFromAnnouncement, HttpFdaSource } from "./sources.js";

/**
 * Re-run announcement enrichment over the most recent RSS-sourced notices and
 * replace their stored text. Exists because the poller enriches a notice once,
 * when it is new: a fix to how FDA pages are read (2026-09-19, tables were being
 * flattened to pipe-separated rows) would otherwise reach only future recalls
 * while every notice already on a phone stayed as it was.
 *
 * Never enqueues notifications and never touches eligibility or food
 * classification. An optional field the re-read cannot produce keeps its
 * stored value (replaceEnrichment COALESCEs it) and is named in the log line,
 * so a thin parse is visible instead of silently erasing lot numbers.
 *
 *   node dist/reenrich.js <limit>
 */
const OPTIONAL_FIELDS = [
  "productDescription",
  "reasonForRecall",
  "companyName",
  "classification",
  "status",
  "distribution",
  "codeInfo",
] as const;

const limitArgument = process.argv[2];
if (limitArgument === undefined) throw new Error("usage: node dist/reenrich.js <limit>  (1-500 most recent RSS notices)");
const limit = Number(limitArgument);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error(`limit must be an integer between 1 and 500, got ${limitArgument}`);

const config = loadConfig();
const database = new AppDatabase(config.databasePath);
const source = new HttpFdaSource(config.rssUrl, config.annualXmlUrls);
const ids = database.listNoticeIdsByKind("rss", limit);
let failed = 0;
for (const id of ids) {
  const notice = database.getStoredNotice(id);
  if (!notice) throw new Error(`notice ${id} disappeared during re-enrichment`);
  try {
    const document = await source.fetchAnnouncement(notice.sourceURL);
    const enriched = enrichFromAnnouncement(notice, document);
    database.replaceEnrichment({ ...enriched, retrievedAt: new Date().toISOString() });
    const kept = OPTIONAL_FIELDS.filter((field) => notice[field] !== null && enriched[field] === null);
    const keptNote = kept.length > 0 ? `  kept stored ${kept.join(",")}` : "";
    console.log(`ok   ${id}  summary ${notice.summary.length} -> ${enriched.summary.length} chars${keptNote}  ${notice.sourceURL}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${id}  ${notice.sourceURL}  ${error instanceof Error ? error.message : String(error)}`);
  }
}
database.close();
console.log(`re-enriched ${ids.length - failed} of ${ids.length}${failed > 0 ? `, ${failed} FAILED` : ""}`);
process.exit(failed > 0 ? 1 : 0);
