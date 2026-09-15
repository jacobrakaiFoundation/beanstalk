import type { Recall, RecallClassification } from "../types/recall";

/**
 * Raw record shape from the official FSIS Recall API
 * (https://www.fsis.usda.gov/fsis/api/recall/v/1).
 * Fields are `unknown` because the API serves Drupal JSON with
 * string booleans ('True'/'False') and list fields as arrays.
 */
export interface FsisApiRecord {
  field_title?: unknown;
  field_recall_number?: unknown;
  field_recall_number_export?: unknown;
  field_recall_url?: unknown;
  field_recall_type?: unknown;
  field_recall_classification?: unknown;
  field_recall_reason?: unknown;
  field_recall_date?: unknown;
  field_states?: unknown;
  field_establishment?: unknown;
  field_product_items?: unknown;
  field_summary?: unknown;
  field_archive_recall?: unknown;
}

export interface FsisSnapshot {
  recalls: Recall[];
  error: string | null;
  fetchedAt: string | null;
}

/** Coerce an API scalar to string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Coerce an API list (or lone scalar) to a string array. */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((v) => v.length > 0);
  const s = asString(value);
  return s ? [s] : [];
}

/** Decode a small, fixed set of HTML entities once. `&amp;` is last so nothing is double-unescaped. */
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * Strip HTML for the summary excerpt. Decode entities first, then remove tags
 * (including leftover incomplete tags) so markup cannot be reconstituted.
 */
function stripHtml(html: string): string {
  const decoded = decodeHtmlEntities(html);
  const withBreaks = decoded.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(?:p|div|li|ul|ol)\b[^>]*>?/gi, "\n");
  let stripped = withBreaks;
  let previous = "";
  while (stripped !== previous) {
    previous = stripped;
    stripped = stripped.replace(/<[a-zA-Z][^>]*>/g, "");
  }
  stripped = stripped.replace(/<[^>]*>?/g, "");
  return stripped
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/** Map the API classification to the app's RecallClassification. */
function mapClassification(value: string): RecallClassification {
  if (value === "Class I") return "Class I";
  if (value === "Class II") return "Class II";
  if (value === "Class III") return "Class III";
  return "Unknown";
}

/** Extract the firm from titles following the "Company Recalls Product" pattern. */
function extractFirm(title: string): string {
  const m = /^(.+?)\s+(?:recalls?|announces?|issues)\b/i.exec(title);
  return m ? m[1].trim() : "";
}

/** Extract a recalled quantity (e.g. "3,204 pounds") from product text. */
function extractQuantity(text: string): string {
  const m =
    /(\d[\d,]*\s*(?:pounds?|lbs?|kg|units?|cases?|packages?|boxes?|bags?|containers?|jars?|cans?|pouches?|pieces?|cartons?))/i.exec(
      text,
    );
  return m ? m[1].trim() : "";
}

/** Generate a fallback stable ID when the API has no recall number. */
function fallbackId(title: string, link: string): string {
  const key = `${link}|${title}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return `FSIS-${Math.abs(hash).toString(36)}`;
}

/** Normalize FSIS ISO dates to the app's YYYYMMDD; reject anything else. */
function normalizeDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  if (/^\d{8}$/.test(value)) return value;
  return "";
}

/**
 * Normalize one FSIS API record to the app's Recall shape.
 * Returns null when the record has no title (unusable).
 * FDA-only vocabulary (status Ongoing/Completed, country, voluntary/mandated,
 * firm notification) is left empty — FSIS type stays in `rawStatus`.
 */
export function mapFsisRecord(record: FsisApiRecord): Recall | null {
  const title = asString(record.field_title).trim();
  if (!title) return null;

  const number = asString(record.field_recall_number) || asString(record.field_recall_number_export);
  const link = asString(record.field_recall_url);
  const id = number ? `FSIS-${number}` : fallbackId(title, link);
  const reasons = asStringArray(record.field_recall_reason);
  const reasonText = reasons.join("; ");
  const states = asStringArray(record.field_states);
  const summary = stripHtml(asString(record.field_summary));
  const productItems = asString(record.field_product_items);
  const recallType = asString(record.field_recall_type).trim();

  return {
    id,
    source: "USDA-FSIS",
    recallNumber: id,
    eventId: "",
    productDescription: title,
    reasonForRecall: reasonText,
    classification: mapClassification(asString(record.field_recall_classification)),
    status: recallType,
    rawStatus: recallType || undefined,
    distributionPattern: states.join(", "),
    recallingFirm: extractFirm(title),
    city: "",
    state: "",
    country: "",
    recallInitiationDate: normalizeDate(asString(record.field_recall_date)),
    productType: "Meat/Poultry/Egg",
    codeInfo: "",
    moreCodeInfo: summary.slice(0, 500),
    voluntaryMandated: "",
    address1: "",
    address2: "",
    postalCode: "",
    centerClassificationDate: "",
    initialFirmNotification: "",
    productQuantity: extractQuantity(productItems),
    terminationDate: "",
    establishmentNumber: asStringArray(record.field_establishment).join("; "),
    hazard: reasonText,
    link,
  };
}

/** Archived records are history; the build keeps only active ones. */
export function isArchived(record: FsisApiRecord): boolean {
  const v = record.field_archive_recall;
  return v === true || v === "True";
}

export function isFsisSnapshot(value: unknown): value is FsisSnapshot {
  return Boolean(value) && typeof value === "object" && Array.isArray((value as { recalls?: unknown }).recalls);
}
