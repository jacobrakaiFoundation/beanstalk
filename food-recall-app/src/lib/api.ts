import type { Recall, RecallClassification, RecallSource } from "../types/recall";
import { buildDietaryPredicate, type DietaryConcern, matchesDietaryConcerns } from "./dietary";
import { type FsisApiRecord, isArchived, isFsisSnapshot, mapFsisRecord } from "./fsis";
import { mockRecalls } from "./mockData";
import {
  bootstrapSearchAfterCursor,
  buildOpenFdaQuery,
  FDA_SKIP_LIMIT,
  fetchOpenFdaResource,
  parseSearchAfterFromResponse,
} from "./openfdaPaging";
import { buildReasonCategoryPredicate, categorizeReason, isReasonCategory } from "./reasonCategory";
import { STATE_NAMES } from "./usStates";

export { FDA_SKIP_LIMIT, parseSearchAfterFromLink, parseSearchAfterFromResponse } from "./openfdaPaging";

// ---------- FSIS (USDA) recalls ----------

const FSIS_CACHE_KEY = "ponder:fsis:cache";
const FSIS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface FsisCacheEntry {
  data: Recall[];
  timestamp: number;
}

interface FsisFeed {
  recalls: Recall[];
  unavailable: boolean;
}

function readFsisCache(): FsisCacheEntry | null {
  try {
    const raw = localStorage.getItem(FSIS_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as FsisCacheEntry;
    if (!entry || !Array.isArray(entry.data) || typeof entry.timestamp !== "number") return null;
    return entry;
  } catch {
    return null;
  }
}

function setFsisCache(data: Recall[]): void {
  try {
    localStorage.setItem(FSIS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (error) {
    console.warn("FSIS cache write failed", error);
  }
}

function isJsonContentType(res: Response): boolean {
  const contentType = res.headers?.get?.("content-type") ?? null;
  // Absent headers (test mocks) are treated as JSON, matching the FDA fetch.
  return contentType === null || contentType.includes("application/json");
}

function parseFsisPayload(data: unknown): FsisFeed {
  if (isFsisSnapshot(data)) {
    return {
      recalls: data.recalls,
      unavailable: Boolean(data.error) && data.recalls.length === 0,
    };
  }
  if (!Array.isArray(data)) return { recalls: [], unavailable: true };
  if (data.length === 0) return { recalls: [], unavailable: false };
  const first = data[0];
  const looksMapped =
    Boolean(first) &&
    typeof first === "object" &&
    "source" in first &&
    "recallNumber" in first &&
    "productDescription" in first;
  if (looksMapped) return { recalls: data as Recall[], unavailable: false };
  return {
    recalls: (data as FsisApiRecord[])
      .filter((item) => !isArchived(item))
      .map(mapFsisRecord)
      .filter((r): r is Recall => r !== null),
    unavailable: false,
  };
}

async function loadFsisFeed(signal?: AbortSignal): Promise<FsisFeed> {
  const cached = readFsisCache();
  const fresh = cached && Date.now() - cached.timestamp <= FSIS_TTL_MS ? cached.data : null;
  if (fresh) return { recalls: fresh, unavailable: false };

  try {
    const url = import.meta.env.DEV ? "/api/fsis-recalls" : `${import.meta.env.BASE_URL}fsis-recalls.json`;
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, signal);
    if (!res.ok || !isJsonContentType(res)) {
      return { recalls: cached?.data ?? [], unavailable: cached === null };
    }
    const parsed = parseFsisPayload(await res.json());
    if (parsed.recalls.length > 0) setFsisCache(parsed.recalls);
    if (parsed.recalls.length > 0) return { recalls: parsed.recalls, unavailable: false };
    return { recalls: cached?.data ?? [], unavailable: parsed.unavailable && cached === null };
  } catch {
    return { recalls: cached?.data ?? [], unavailable: cached === null };
  }
}

export async function fetchFsisRecalls(signal?: AbortSignal): Promise<Recall[]> {
  const feed = await loadFsisFeed(signal);
  return feed.recalls;
}

/** Client-side filter FSIS recalls to match the same criteria as openFDA server-side search. */
export function filterFsisRecalls(
  recalls: Recall[],
  params: {
    search?: string;
    classification?: string;
    status?: string;
    state?: string;
    dietary?: string[];
    hazard?: string;
  },
): Recall[] {
  let filtered = recalls;
  const q = (params.search || "").toLowerCase().trim();
  if (q) {
    filtered = filtered.filter((r) =>
      `${r.productDescription} ${r.reasonForRecall} ${r.recallingFirm}`.toLowerCase().includes(q),
    );
  }
  if (params.classification) {
    filtered = filtered.filter((r) => r.classification === params.classification);
  }
  if (params.status) {
    filtered = filtered.filter((r) => r.status.toLowerCase() === params.status!.toLowerCase());
  }
  if (params.state) {
    filtered = filtered.filter((r) => matchesDistributionPattern(r.distributionPattern, params.state!));
  }
  if (params.dietary && params.dietary.length > 0) {
    filtered = filtered.filter((r) => matchesDietaryConcerns(r, params.dietary as DietaryConcern[]));
  }
  if (params.hazard) {
    filtered = filtered.filter((r) => categorizeReason(r.reasonForRecall) === params.hazard);
  }
  return filtered;
}

interface OpenFDARecord {
  recall_number?: string;
  event_id?: string;
  product_description?: string;
  reason_for_recall?: string;
  classification?: RecallClassification;
  status?: string;
  distribution_pattern?: string;
  recalling_firm?: string;
  city?: string;
  state?: string;
  country?: string;
  recall_initiation_date?: string;
  report_date?: string;
  product_type?: string;
  code_info?: string;
  more_code_info?: string;
  voluntary_mandated?: string;
  address_1?: string;
  address_2?: string;
  postal_code?: string;
  center_classification_date?: string;
  initial_firm_notification?: string;
  product_quantity?: string;
  termination_date?: string;
}

const KNOWN_CLASSIFICATIONS = new Set(["Class I", "Class II", "Class III", "Not Yet Classified"]);

function normalizeClassification(raw?: string): RecallClassification {
  if (!raw || typeof raw !== "string") return "Unknown";
  const trimmed = raw.trim();
  if (KNOWN_CLASSIFICATIONS.has(trimmed)) return trimmed as RecallClassification;
  if (trimmed === "") return "Unknown";
  return "Unknown";
}

function normalizeStatus(raw?: string): string {
  if (!raw || typeof raw !== "string" || raw.trim() === "") return "Unknown";
  return raw.trim();
}

function stableId(r: Omit<Recall, "id">): string {
  if (r.recallNumber.trim()) return r.recallNumber.trim();
  // An event can contain distinct products/lots. Without a recall number,
  // identify the full normalized record, whose field order is fixed below.
  // Literal JSON avoids hash/delimiter collisions. Changed source fields create
  // a new internal key; this key is never a fabricated FDA recall number.
  return `source:${JSON.stringify(r)}`;
}

function mapOpenFDA(r: OpenFDARecord): Recall | null {
  if (!r || typeof r !== "object") return null;
  // Preserve missing as unknown, do not invent
  const rawClassification = typeof r.classification === "string" ? r.classification : undefined;
  const rawStatus = typeof r.status === "string" ? r.status : undefined;
  const record: Omit<Recall, "id"> = {
    recallNumber: typeof r.recall_number === "string" ? r.recall_number : "",
    eventId: typeof r.event_id === "string" ? r.event_id : "",
    productDescription: typeof r.product_description === "string" ? r.product_description : "",
    reasonForRecall: typeof r.reason_for_recall === "string" ? r.reason_for_recall : "",
    classification: normalizeClassification(rawClassification),
    status: normalizeStatus(rawStatus),
    distributionPattern: typeof r.distribution_pattern === "string" ? r.distribution_pattern : "",
    recallingFirm: typeof r.recalling_firm === "string" ? r.recalling_firm : "",
    city: typeof r.city === "string" ? r.city : "",
    state: typeof r.state === "string" ? r.state : "",
    country: typeof r.country === "string" ? r.country : "",
    recallInitiationDate:
      typeof r.recall_initiation_date === "string"
        ? r.recall_initiation_date
        : typeof r.report_date === "string"
          ? r.report_date
          : "",
    productType: typeof r.product_type === "string" ? r.product_type : "",
    codeInfo: typeof r.code_info === "string" ? r.code_info : "",
    moreCodeInfo: typeof r.more_code_info === "string" ? r.more_code_info : "",
    voluntaryMandated: typeof r.voluntary_mandated === "string" ? r.voluntary_mandated : "",
    rawClassification,
    rawStatus,
    address1: typeof r.address_1 === "string" ? r.address_1 : "",
    address2: typeof r.address_2 === "string" ? r.address_2 : "",
    postalCode: typeof r.postal_code === "string" ? r.postal_code : "",
    centerClassificationDate: typeof r.center_classification_date === "string" ? r.center_classification_date : "",
    initialFirmNotification: typeof r.initial_firm_notification === "string" ? r.initial_firm_notification : "",
    productQuantity: typeof r.product_quantity === "string" ? r.product_quantity : "",
    terminationDate: typeof r.termination_date === "string" ? r.termination_date : "",
    source: "FDA",
  };
  return { id: stableId(record), ...record };
}

export function sanitizeSearchQuery(query: string): string {
  return query.replace(/["\\]/g, "").trim();
}

export function matchesDistributionPattern(distributionPattern: string, selectedState: string): boolean {
  if (!selectedState) return true;
  const pattern = distributionPattern.toLowerCase();
  if (!pattern || pattern.trim() === "") return false; // unclear, not matching specific state
  // Nationwide is potentially relevant to any state
  if (pattern.includes("nationwide") || pattern.includes("national distribution") || pattern.includes("nationwide -")) {
    return true;
  }
  if (selectedState === "Nationwide") {
    return pattern.includes("nationwide") || pattern.includes("national");
  }
  // Bounded abbreviation match: \bCA\b etc. (case-sensitive for abbreviations to avoid matching English words like "in" for IN)
  const abbr = selectedState;
  const full = STATE_NAMES[selectedState] || "";
  const abbrRegex = new RegExp(`\\b${abbr}\\b`);
  if (abbrRegex.test(distributionPattern)) return true;
  if (full && new RegExp(`\\b${full}\\b`, "i").test(distributionPattern)) return true;
  return false;
}

export function isDistributionUnclear(distributionPattern: string): boolean {
  const p = distributionPattern.trim().toLowerCase();
  if (!p) return true;
  if (p === "n/a" || p === "unknown" || p.includes("direct to consumer") || p.includes("retail only")) {
    // Consider ambiguous/region-only as unclear if no state abbreviation or nationwide present
    const hasState = Object.keys(STATE_NAMES).some(
      (abbr) =>
        new RegExp(`\\b${abbr}\\b`, "i").test(distributionPattern) ||
        new RegExp(`\\b${STATE_NAMES[abbr]}\\b`, "i").test(distributionPattern),
    );
    const hasNationwide = p.includes("nationwide") || p.includes("national");
    return !hasState && !hasNationwide;
  }
  return false;
}

/**
 * Build the cross-field OR clause grouped in parentheses.
 */
export function buildGroupedSearchClause(search: string): string | null {
  const sanitized = sanitizeSearchQuery(search);
  if (!sanitized) return null;
  const fields = ["product_description", "reason_for_recall", "recalling_firm"];
  const inner = fields.map((f) => `${f}:"${sanitized}"`).join(" OR ");
  return `(${inner})`;
}

/**
 * Build the full search= value with grouped OR and optional predicates composed outside via AND.
 */
export function buildSearchParam(search: string, predicates: string[] = []): string | null {
  const grouped = buildGroupedSearchClause(search);
  const parts: string[] = [];
  if (grouped) parts.push(grouped);
  parts.push(...predicates.filter(Boolean));
  if (parts.length === 0) return null;
  return parts.join(" AND ");
}

const CACHE_KEY = "ponder:openfda:cache";
const SYNC_KEY = "ponder:openfda:lastSynced";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Build a collision-free cache key using JSON.stringify of a tuple.
 * Dietary array is sorted so [milk, eggs] and [eggs, milk] produce the same key.
 */
export function buildCacheKey(
  search: string,
  classification: string,
  status: string,
  state: string,
  dietary: string[],
  limit: number,
  skip: number,
  hazard: string,
  source: string,
  searchAfter = "",
): string {
  const sortedDietary = [...dietary].sort();
  return JSON.stringify([
    sanitizeSearchQuery(search),
    classification,
    status,
    state,
    sortedDietary,
    limit,
    skip,
    hazard,
    source,
    searchAfter,
  ]);
}

interface CacheEntry {
  key: string;
  data: { recalls: Recall[]; total: number };
  timestamp: number;
}

function getCache(cacheKey: string): { recalls: Recall[]; total: number } | null {
  const entry = getCacheEntry(cacheKey);
  return entry ? entry.data : null;
}

function getCacheEntry(cacheKey: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entries: CacheEntry[] = JSON.parse(raw);
    const hit = entries.find((e) => e.key === cacheKey);
    if (!hit) return null;
    if (Date.now() - hit.timestamp > CACHE_TTL_MS) return null;
    return hit;
  } catch {
    return null;
  }
}

function setCache(cacheKey: string, data: { recalls: Recall[]; total: number }): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const entries: CacheEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = entries.filter((e) => e.key !== cacheKey);
    filtered.unshift({ key: cacheKey, data, timestamp: Date.now() });
    localStorage.setItem(CACHE_KEY, JSON.stringify(filtered.slice(0, 20)));
    localStorage.setItem(SYNC_KEY, new Date().toISOString());
  } catch {}
}

export function getLastSynced(): string | null {
  try {
    return localStorage.getItem(SYNC_KEY);
  } catch {
    return null;
  }
}

export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(SYNC_KEY);
  } catch {}
}

export function isDemoMode(): boolean {
  try {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("demo") === "1" || params.get("demo") === "true") return true;
    if (localStorage.getItem("ponder:demo") === "1") return true;
    if ((import.meta as unknown as { env: Record<string, string> }).env?.VITE_DEMO === "true") return true;
  } catch {}
  return false;
}

export type FetchError = {
  code: "NOT_FOUND" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK" | "SERVER" | "BAD_REQUEST" | "MALFORMED";
  message: string;
  status?: number;
  retryable: boolean;
};

export type FetchResult = {
  recalls: Recall[];
  total: number;
  error: FetchError | null;
  isStale: boolean;
  lastSynced: string | null;
  isDemo: boolean;
  fsisUnavailable?: boolean;
  /** Cursor for the next openFDA page when `skip` would exceed {@link FDA_SKIP_LIMIT}. */
  nextSearchAfter?: string | null;
};

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  outerSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchEnforcementResponse(query: string, signal?: AbortSignal): Promise<Response> {
  return fetchOpenFdaResource("enforcement", query, (url) => fetchWithTimeout(url, FETCH_TIMEOUT_MS, signal));
}

function parseErrorCode(status: number, body: unknown): FetchError {
  const msg =
    typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: { message?: string } }).error.message || "")
      : "";
  // openFDA returns HTTP 404 + "No matches found" for empty result sets — expected, not an outage.
  if (status === 404 && /no matches/i.test(msg)) {
    return { code: "NOT_FOUND", message: "No matches found", status, retryable: false };
  }
  if (status === 429) return { code: "RATE_LIMIT", message: "Rate limited — retry shortly", status, retryable: true };
  if (status === 400) return { code: "BAD_REQUEST", message: msg || "Bad request", status, retryable: false };
  if (status >= 500) return { code: "SERVER", message: msg || `Server error ${status}`, status, retryable: true };
  return {
    code: "SERVER",
    message: msg || `Request failed ${status}`,
    status,
    retryable: status >= 500 || status === 429,
  };
}

async function mergeOpenFdaWithFsis(args: {
  fdaRecalls: Recall[];
  fdaTotal: number;
  cacheKey: string;
  source: string;
  search: string;
  classification: string;
  status: string;
  state: string;
  dietary: string[];
  hazard: string;
  pageSkip: number;
  fsisPromise: Promise<FsisFeed>;
  nextSearchAfter?: string | null;
  usingSearchAfter?: boolean;
}): Promise<FetchResult> {
  const { fdaRecalls, fdaTotal, cacheKey, source, pageSkip, fsisPromise, nextSearchAfter, usingSearchAfter } = args;
  let recalls = fdaRecalls;
  const total = fdaTotal;
  let fsisUnavailable = false;
  if (source !== "FDA") {
    try {
      const feed = await fsisPromise;
      fsisUnavailable = feed.unavailable;
      if (feed.recalls.length > 0 && pageSkip === 0 && !usingSearchAfter) {
        const filteredFsis = filterFsisRecalls(feed.recalls, {
          search: args.search,
          classification: args.classification,
          status: args.status,
          state: args.state,
          dietary: args.dietary,
          hazard: args.hazard,
        });
        const fdaIds = new Set(fdaRecalls.map((r) => r.id));
        const extra = filteredFsis.filter((r) => !fdaIds.has(r.id));
        // Prefix FSIS on page 0. Keep every FDA row from this page and leave
        // `total` as the FDA count so later pages stay honest skip windows.
        recalls = [...extra, ...fdaRecalls];
      }
    } catch {
      /* FSIS failure is non-fatal and must not hide an FDA success */
    }
  }
  setCache(cacheKey, { recalls, total });
  return {
    recalls,
    total,
    error: null,
    isStale: false,
    lastSynced: getLastSynced(),
    isDemo: false,
    fsisUnavailable,
    nextSearchAfter,
  };
}

export async function fetchRecalls(params?: {
  search?: string;
  limit?: number;
  skip?: number;
  classification?: string;
  status?: string;
  state?: string;
  dietary?: string[];
  /** Reason category name from reasonCategory.ts; filters reason_for_recall server-side. */
  hazard?: string;
  source?: RecallSource | "";
  signal?: AbortSignal;
  /** openFDA `search_after` cursor for pages past {@link FDA_SKIP_LIMIT}. */
  searchAfter?: string;
}): Promise<FetchResult> {
  const limit = params?.limit ?? 20;
  const skip = params?.skip ?? 0;
  const search = params?.search || "";
  const classification = params?.classification || "";
  const status = params?.status || "";
  const state = params?.state || "";
  const dietary = params?.dietary || [];
  const hazard = params?.hazard || "";
  const source = params?.source || "";
  const predicates: string[] = [];
  if (classification) predicates.push(`classification:"${sanitizeSearchQuery(classification)}"`);
  if (hazard && isReasonCategory(hazard)) predicates.push(buildReasonCategoryPredicate(hazard));
  if (status) predicates.push(`status:"${sanitizeSearchQuery(status)}"`);
  if (state) {
    if (state === "Nationwide") {
      predicates.push(`distribution_pattern:"Nationwide"`);
    } else {
      predicates.push(
        `(distribution_pattern:"${sanitizeSearchQuery(state)}" OR distribution_pattern:"Nationwide" OR distribution_pattern:"national")`,
      );
    }
  }
  if (dietary.length > 0) {
    const dp = buildDietaryPredicate(dietary as DietaryConcern[]);
    if (dp) predicates.push(dp);
  }
  const searchParam = buildSearchParam(search, predicates);
  const demo = isDemoMode();

  // Demo mode: explicit, conspicuously fictional data — filter before slicing
  if (demo) {
    const q = sanitizeSearchQuery(search).toLowerCase();
    let filtered = mockRecalls.map((r) => ({
      ...r,
      productDescription: `DEMO — Fictional — ${r.productDescription}`,
      recallNumber: `DEMO-${r.recallNumber}`,
    }));
    if (q) {
      filtered = filtered.filter((r) =>
        `${r.productDescription} ${r.reasonForRecall} ${r.recallingFirm}`.toLowerCase().includes(q),
      );
    }
    if (classification) filtered = filtered.filter((r) => r.classification === classification);
    if (status) filtered = filtered.filter((r) => r.status.toLowerCase() === status.toLowerCase());
    if (state) filtered = filtered.filter((r) => matchesDistributionPattern(r.distributionPattern, state));
    if (dietary.length > 0) filtered = filtered.filter((r) => matchesDietaryConcerns(r, dietary as DietaryConcern[]));
    if (hazard) filtered = filtered.filter((r) => categorizeReason(r.reasonForRecall) === hazard);
    if (source) filtered = filtered.filter((r) => r.source === source);
    const total = filtered.length;
    const paged = filtered.slice(skip, skip + limit);
    return { recalls: paged, total, error: null, isStale: false, lastSynced: getLastSynced(), isDemo: true };
  }

  let searchAfter = params?.searchAfter || "";
  if (!searchAfter && skip > FDA_SKIP_LIMIT) {
    try {
      searchAfter =
        (await bootstrapSearchAfterCursor({
          limit,
          skip,
          searchParam,
          sort: "report_date:desc",
          fetchPage: (query) => fetchEnforcementResponse(query, params?.signal),
        })) ?? "";
    } catch (e: unknown) {
      const isAbort = e instanceof DOMException && e.name === "AbortError";
      return {
        recalls: [],
        total: 0,
        error: isAbort
          ? { code: "TIMEOUT", message: "Request timed out", retryable: true }
          : { code: "NETWORK", message: e instanceof Error ? e.message : "Network error", retryable: true },
        isStale: false,
        lastSynced: getLastSynced(),
        isDemo: false,
      };
    }
    if (!searchAfter) {
      return {
        recalls: [],
        total: 0,
        error: null,
        isStale: false,
        lastSynced: getLastSynced(),
        isDemo: false,
        nextSearchAfter: null,
      };
    }
  }
  const requestSkip = searchAfter ? 0 : skip;
  const cacheKey = buildCacheKey(
    search,
    classification,
    status,
    state,
    dietary,
    limit,
    requestSkip,
    hazard,
    source,
    searchAfter,
  );
  const cachedEntry = getCacheEntry(cacheKey);
  const cached = cachedEntry?.data ?? null;

  try {
    if (params?.signal?.aborted) {
      const err: FetchError = { code: "NETWORK", message: "Aborted", retryable: false };
      return { recalls: [], total: 0, error: err, isStale: false, lastSynced: getLastSynced(), isDemo: false };
    }
    if (source === "USDA-FSIS") {
      const feed = await loadFsisFeed(params?.signal);
      const filteredFsis = filterFsisRecalls(feed.recalls, {
        search,
        classification,
        status,
        state,
        dietary,
        hazard,
      });
      const sorted = [...filteredFsis].sort((a, b) =>
        (b.recallInitiationDate || "").localeCompare(a.recallInitiationDate || ""),
      );
      return {
        recalls: sorted.slice(skip, skip + limit),
        total: filteredFsis.length,
        error: null,
        isStale: false,
        lastSynced: getLastSynced(),
        isDemo: false,
        fsisUnavailable: feed.unavailable,
      };
    }
    // Start FSIS fetch in parallel with FDA fetch (skip when FDA-only)
    const fsisPromise =
      source === "FDA"
        ? Promise.resolve({ recalls: [] as Recall[], unavailable: false })
        : loadFsisFeed(params?.signal);
    const query = buildOpenFdaQuery({
      limit,
      skip: requestSkip,
      sort: "report_date:desc",
      searchParam,
      searchAfter: searchAfter || undefined,
    });
    const res = await fetchEnforcementResponse(query, params?.signal);
    const nextSearchAfter = parseSearchAfterFromResponse(res);
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const err = parseErrorCode(res.status, body);
      if (err.code === "NOT_FOUND") {
        // Genuine FDA empty — still prefix FSIS on page 0 when the source filter is All
        return mergeOpenFdaWithFsis({
          fdaRecalls: [],
          fdaTotal: 0,
          cacheKey,
          source,
          search,
          classification,
          status,
          state,
          dietary,
          hazard,
          pageSkip: requestSkip,
          fsisPromise,
          nextSearchAfter,
          usingSearchAfter: Boolean(searchAfter),
        });
      }
      // For retryable errors, return stale cache if available with label
      if (cached && cachedEntry) {
        return {
          recalls: cached.recalls,
          total: cached.total,
          error: err,
          isStale: true,
          lastSynced: new Date(cachedEntry.timestamp).toISOString(),
          isDemo: false,
        };
      }
      return { recalls: [], total: 0, error: err, isStale: false, lastSynced: getLastSynced(), isDemo: false };
    }
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      const err: FetchError = { code: "MALFORMED", message: "Invalid JSON in FDA response", retryable: true };
      if (cached && cachedEntry)
        return {
          recalls: cached.recalls,
          total: cached.total,
          error: err,
          isStale: true,
          lastSynced: new Date(cachedEntry.timestamp).toISOString(),
          isDemo: false,
        };
      return { recalls: [], total: 0, error: err, isStale: false, lastSynced: getLastSynced(), isDemo: false };
    }
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).results)) {
      const err: FetchError = {
        code: "MALFORMED",
        message: "Malformed FDA response: missing results array",
        retryable: true,
      };
      if (cached && cachedEntry)
        return {
          recalls: cached.recalls,
          total: cached.total,
          error: err,
          isStale: true,
          lastSynced: new Date(cachedEntry.timestamp).toISOString(),
          isDemo: false,
        };
      return { recalls: [], total: 0, error: err, isStale: false, lastSynced: getLastSynced(), isDemo: false };
    }
    const data = raw as {
      results: unknown[];
      meta?: { results?: { total?: unknown; skip?: unknown; limit?: unknown } };
    };
    // Validate pagination meta types when present
    if (data.meta?.results) {
      const m = data.meta.results;
      if (
        (m.total !== undefined && typeof m.total !== "number") ||
        (m.skip !== undefined && typeof m.skip !== "number") ||
        (m.limit !== undefined && typeof m.limit !== "number")
      ) {
        const err: FetchError = {
          code: "MALFORMED",
          message: "Malformed FDA response: invalid pagination meta",
          retryable: true,
        };
        if (cached && cachedEntry)
          return {
            recalls: cached.recalls,
            total: cached.total,
            error: err,
            isStale: true,
            lastSynced: new Date(cachedEntry.timestamp).toISOString(),
            isDemo: false,
          };
        return { recalls: [], total: 0, error: err, isStale: false, lastSynced: getLastSynced(), isDemo: false };
      }
    }
    const mapped = (data.results as OpenFDARecord[]).map(mapOpenFDA).filter((r): r is Recall => r !== null);
    // Deduplicate by id, keep first
    const seen = new Set<string>();
    const fdaRecalls: Recall[] = [];
    for (const r of mapped) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        fdaRecalls.push(r);
      }
    }
    const fdaTotal = typeof data.meta?.results?.total === "number" ? data.meta.results.total : fdaRecalls.length;

    return mergeOpenFdaWithFsis({
      fdaRecalls,
      fdaTotal,
      cacheKey,
      source,
      search,
      classification,
      status,
      state,
      dietary,
      hazard,
      pageSkip: requestSkip,
      fsisPromise,
      nextSearchAfter,
      usingSearchAfter: Boolean(searchAfter),
    });
  } catch (e: unknown) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    const err: FetchError = isAbort
      ? { code: "TIMEOUT", message: "Request timed out", retryable: true }
      : { code: "NETWORK", message: e instanceof Error ? e.message : "Network error", retryable: true };
    if (cached && cachedEntry) {
      return {
        recalls: cached.recalls,
        total: cached.total,
        error: err,
        isStale: true,
        lastSynced: new Date(cachedEntry.timestamp).toISOString(),
        isDemo: false,
      };
    }
    return { recalls: [], total: 0, error: err, isStale: false, lastSynced: getLastSynced(), isDemo: false };
  }
}
