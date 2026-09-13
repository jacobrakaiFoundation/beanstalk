import { createHash } from "node:crypto";

export const NOTICE_FIELDS = [
  "title",
  "summary",
  "productDescription",
  "reasonForRecall",
  "companyName",
  "distribution",
  "codeInfo",
] as const;

export type MatchableField = (typeof NOTICE_FIELDS)[number];
export type FoodClassification = "food" | "unknown";
export type NoticeSourceKind = "rss" | "annual";

export interface RecallNotice {
  id: string;
  title: string;
  summary: string;
  productDescription: string | null;
  reasonForRecall: string | null;
  companyName: string | null;
  classification: string | null;
  status: string | null;
  distribution: string | null;
  codeInfo: string | null;
  publicationDate: string;
  recallInitiationDate: string | null;
  retrievedAt: string;
  sourceURL: string;
}

export interface StoredNotice extends RecallNotice {
  canonicalURL: string;
  sourceGUID: string | null;
  sourceKind: NoticeSourceKind;
  foodClassification: FoodClassification;
  eligibleForAlert: boolean;
}

export interface NoticeMatch {
  term: string;
  field: MatchableField;
}

export function normalizeTerm(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim().replace(/\s+/gu, " ");
}

export function validateAndNormalizeTerms(values: readonly string[]): string[] {
  if (values.length > 20) {
    throw new Error("A watchlist may contain at most 20 terms");
  }

  const normalized = [...new Set(values.map(normalizeTerm))];
  for (const term of normalized) {
    const length = [...term].length;
    if (length < 2 || length > 80) {
      throw new Error("Each watchlist term must contain 2 to 80 characters");
    }
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function matchesTerm(value: string, normalizedTerm: string): boolean {
  const normalizedValue = value.normalize("NFKC").toLocaleLowerCase("en-US");
  const expression = new RegExp(
    `(?<![\\p{L}\\p{N}\\p{M}])${escapeRegExp(normalizedTerm)}(?![\\p{L}\\p{N}\\p{M}])`,
    "u",
  );
  return expression.test(normalizedValue);
}

export function findNoticeMatch(notice: RecallNotice, terms: readonly string[]): NoticeMatch | null {
  for (const term of terms) {
    for (const field of NOTICE_FIELDS) {
      const value = notice[field];
      if (value !== null && matchesTerm(value, term)) {
        return { term, field };
      }
    }
  }
  return null;
}

export function canonicalizeFdaUrl(value: string): string {
  const url = new URL(value);
  url.protocol = "https:";
  url.hostname = url.hostname.toLocaleLowerCase("en-US");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString();
}

export function noticeIdForUrl(canonicalURL: string): string {
  return `notice_${createHash("sha256").update(canonicalURL).digest("hex").slice(0, 32)}`;
}

const CLEARLY_NON_FOOD =
  /\b(injection|injectable|syringe|tablet|capsule|prescription|medical device|catheter|implant|ophthalmic|intravenous|cosmetic|tattoo ink|vape|cigarette|yohimbine|sexual enhancement)\b/iu;

export function classifyRssItem(title: string, summary: string): FoodClassification {
  return CLEARLY_NON_FOOD.test(`${title} ${summary}`) ? "unknown" : "food";
}
