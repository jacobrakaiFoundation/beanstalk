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

/** Strip HTML tags and collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|ul|ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

/** Map the API recall type to an FDA-style status. */
function mapStatus(recallType: string): Recall["status"] {
  if (recallType === "Closed Recall") return "Completed";
  return "Ongoing";
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

/** Keep API ISO dates (YYYY-MM-DD); reject anything else. */
function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

/**
 * Normalize one FSIS API record to the app's Recall shape.
 * Returns null when the record has no title (unusable).
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

  return {
    id,
    source: "USDA-FSIS",
    recallNumber: id,
    eventId: "",
    productDescription: title,
    reasonForRecall: reasonText,
    classification: mapClassification(asString(record.field_recall_classification)),
    status: mapStatus(asString(record.field_recall_type)),
    distributionPattern: states.join(", "),
    recallingFirm: extractFirm(title),
    city: "",
    state: "",
    country: "USA",
    recallInitiationDate: normalizeDate(asString(record.field_recall_date)),
    productType: "Meat/Poultry/Egg",
    codeInfo: "",
    moreCodeInfo: summary.slice(0, 500),
    voluntaryMandated: "Voluntary",
    address1: "",
    address2: "",
    postalCode: "",
    centerClassificationDate: "",
    initialFirmNotification: "Press Release",
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
