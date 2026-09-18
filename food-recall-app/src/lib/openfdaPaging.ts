/** openFDA rejects `skip` above this value. Deeper pages must use `search_after`. */
export const FDA_SKIP_LIMIT = 25000;

/** openFDA's maximum `limit` per request; used when walking a `search_after` cursor. */
export const FDA_MAX_LIMIT = 1000;

/**
 * Production CORS proxy that re-exposes the openFDA `Link` header.
 * GitHub Pages calls `api.fda.gov` cross-origin, and `Link` is not a
 * CORS-safelisted header, so `search_after` is unreadable without this.
 */
export const DEFAULT_OPENFDA_PROXY = "https://beanstalk-openfda.jacob-e-durham.workers.dev";

export function parseSearchAfterFromLink(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const rel = part.toLowerCase();
    if (!rel.includes('rel="next"') && !rel.includes("rel='next'") && !rel.includes("rel=next")) continue;
    const start = part.indexOf("<");
    const end = part.indexOf(">", start + 1);
    if (start === -1 || end === -1) continue;
    try {
      const url = new URL(part.slice(start + 1, end), "https://api.fda.gov");
      const token = url.searchParams.get("search_after");
      if (token) return token;
    } catch {
      /* ignore malformed Link URLs */
    }
  }
  return null;
}

export function linkHeaderFrom(res: Response): string | null {
  return res.headers?.get?.("link") ?? null;
}

export function parseSearchAfterFromResponse(res: Response): string | null {
  const exposed = res.headers?.get?.("x-openfda-search-after");
  if (exposed) return exposed;
  return parseSearchAfterFromLink(linkHeaderFrom(res));
}

export function buildOpenFdaQuery(args: {
  limit: number;
  skip: number;
  sort: string;
  searchParam?: string | null;
  searchAfter?: string;
}): string {
  const params = new URLSearchParams();
  params.set("limit", String(args.limit));
  params.set("sort", args.sort);
  if (args.searchAfter) {
    params.set("search_after", args.searchAfter);
  } else {
    params.set("skip", String(args.skip));
  }
  if (args.searchParam) params.set("search", args.searchParam);
  return params.toString();
}

export function openFdaProxyBase(): string | null {
  const configured = import.meta.env.VITE_OPENFDA_PROXY?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return null;
}

export function openFdaCandidateUrls(resource: "enforcement" | "event"): string[] {
  const file = `${resource}.json`;
  const urls: string[] = [];
  const isBrowser = typeof window !== "undefined" && window.location.origin !== "null";
  if (isBrowser) urls.push(`${window.location.origin}/api/food/${file}`);
  const proxy = openFdaProxyBase();
  if (proxy) urls.push(`${proxy}/food/${file}`);
  urls.push(`https://api.fda.gov/food/${file}`);
  return [...new Set(urls)];
}

function isJsonContentType(res: Response): boolean {
  const contentType = res.headers?.get?.("content-type") ?? null;
  return contentType === null || contentType.includes("application/json");
}

function shouldTryNextCandidate(res: Response): boolean {
  const contentType = res.headers?.get?.("content-type") ?? null;
  const isSpaCatchAll = res.ok && contentType !== null && !contentType.includes("application/json");
  const isMissingProxy = res.status === 404 && !isJsonContentType(res);
  return isSpaCatchAll || isMissingProxy;
}

export async function fetchOpenFdaResource(
  resource: "enforcement" | "event",
  query: string,
  fetchImpl: (url: string) => Promise<Response>,
): Promise<Response> {
  const bases = openFdaCandidateUrls(resource);
  let lastError: unknown;
  for (let i = 0; i < bases.length; i += 1) {
    const url = `${bases[i]}?${query}`;
    try {
      const res = await fetchImpl(url);
      if (shouldTryNextCandidate(res) && i < bases.length - 1) continue;
      return res;
    } catch (e) {
      lastError = e;
      const isAbort = e instanceof DOMException && e.name === "AbortError";
      if (isAbort || i === bases.length - 1) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("openFDA fetch failed");
}

/**
 * Walk from skip=0 with `search_after`. Skip-based `rel=next` links after the
 * first page are themselves skip URLs and never include a cursor — including
 * `skip=25000`, whose next link is `skip=25006` and returns HTTP 400.
 */
export async function bootstrapSearchAfterCursor(args: {
  skip: number;
  limit: number;
  searchParam?: string | null;
  sort: string;
  fetchPage: (query: string) => Promise<Response>;
  hopLimit?: number;
}): Promise<string | null> {
  const hopSize = Math.min(Math.max(1, args.hopLimit ?? FDA_MAX_LIMIT), FDA_MAX_LIMIT);
  let cursor: string | null = null;
  let advanced = 0;
  while (advanced < args.skip) {
    const step = Math.min(hopSize, args.skip - advanced);
    const query = buildOpenFdaQuery({
      limit: step,
      skip: 0,
      sort: args.sort,
      searchParam: args.searchParam,
      searchAfter: cursor ?? undefined,
    });
    const res = await args.fetchPage(query);
    if (!res.ok) return null;
    cursor = parseSearchAfterFromResponse(res);
    if (!cursor) return null;
    advanced += step;
  }
  return cursor;
}
