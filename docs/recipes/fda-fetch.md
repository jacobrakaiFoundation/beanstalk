# How Beanstalk fetches FDA and USDA FSIS recall data

**Status:** Draft recipe for contributors and educators.
**Prepared:** 2026-10-29 (America/Los_Angeles).
**Scope:** What the web app in `food-recall-app/` actually does today. Native iOS/Android notice feeds and the notification service are out of scope.

Beanstalk's browser app searches two public sources: the [openFDA food enforcement](https://open.fda.gov/apis/food/enforcement/) archive and a build-time [USDA FSIS recall](https://www.fsis.usda.gov/fsis/api/recall/v/1) snapshot. Neither path is a live recall-lifecycle feed. Empty results do not mean a product is safe.

## openFDA food enforcement

Runtime search goes through `fetchRecalls` in [`food-recall-app/src/lib/api.ts`](../../food-recall-app/src/lib/api.ts). That function builds an openFDA `search` string, calls `fetchOpenFdaResource("enforcement", …)` from [`food-recall-app/src/lib/openfdaPaging.ts`](../../food-recall-app/src/lib/openfdaPaging.ts), maps each result into the app's `Recall` shape, and optionally merges FSIS rows on the first page.

### Endpoint and query shape

- Upstream path: `https://api.fda.gov/food/enforcement.json`
- Query builder: `buildOpenFdaQuery` sets `limit`, `sort` (`report_date:desc`), either `skip` or `search_after`, and optional `search`
- Cross-field search: `buildGroupedSearchClause` OR-groups `product_description`, `reason_for_recall`, and `recalling_firm` (see `buildSearchParam` / `sanitizeSearchQuery` in `api.ts`)
- Extra filters (classification, status, distribution state, dietary predicates, hazard/reason category) are AND-ed as openFDA predicates

### Candidate URLs (dev → proxy → direct)

`openFdaCandidateUrls` tries, in order:

1. Same-origin `/api/food/enforcement.json` (Vite dev proxy in [`food-recall-app/vite.config.ts`](../../food-recall-app/vite.config.ts) rewrites to `api.fda.gov`)
2. `VITE_OPENFDA_PROXY` + `/food/enforcement.json` when that env var is set (GitHub Pages build sets it in [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml))
3. Direct `https://api.fda.gov/food/enforcement.json`

If a candidate returns a non-JSON SPA catch-all or a non-JSON 404, the client tries the next URL. AbortError stops the chain.

### Pagination and `search_after`

openFDA rejects `skip` above **25000** (`FDA_SKIP_LIMIT` in `openfdaPaging.ts`). Deeper pages must use `search_after`.

- Normal pages: `skip` + `limit` (default limit 20 in `fetchRecalls`)
- Past the skip limit: `bootstrapSearchAfterCursor` walks forward in hops of up to `FDA_MAX_LIMIT` (1000), reading the next cursor from each response
- Cursor extraction: prefer response header `X-OpenFDA-Search-After`, else parse `rel="next"` from the `Link` header (`parseSearchAfterFromResponse`)

Browsers on GitHub Pages cannot read openFDA's `Link` header cross-origin (it is not CORS-safelisted). The Cloudflare Worker in [`openfda-proxy/`](../../openfda-proxy/) proxies only `/food/enforcement.json` and `/food/event.json`, re-exposes `Link`, copies `search_after` onto `X-OpenFDA-Search-After`, and strips `api_key` from rewritten Link URLs. See [`openfda-proxy/src/index.js`](../../openfda-proxy/src/index.js).

### Rate limits and API keys

The client treats HTTP **429** as `RATE_LIMIT` (retryable) in `parseErrorCode`. It does not implement its own token bucket.

Optional keys:

| Variable | Where | Role |
| --- | --- | --- |
| `OPENFDA_API_KEY` | Vite proxy / Worker secret | Preferred server-side injection so the key is not bundled |
| `VITE_OPENFDA_KEY` | Legacy local-dev fallback read only by `vite.config.ts` | Not supported. Vite exposes `VITE_`-prefixed variables to client code, so never set a key with this prefix in a production or Pages build. Use `OPENFDA_API_KEY`. |

Exact openFDA per-minute ceilings are documented by FDA and in the app README; they are not hard-coded in TypeScript.

### Caching and timeouts

- openFDA result cache: `localStorage` key `ponder:openfda:cache`, **6 hour** TTL, keep at most **20** entries (`CACHE_TTL_MS` / `setCache` in `api.ts`)
- Request timeout: **8000 ms** (`FETCH_TIMEOUT_MS`)
- On retryable failure with a cache hit: return stale rows with `isStale: true` and the error
- HTTP 404 with message matching “No matches found” is treated as an empty result set, not an outage

### Demo mode

`?demo=1`, `localStorage` `ponder:demo=1`, or `VITE_DEMO=true` serves fictional rows from `mockData.ts` and never calls openFDA.

## USDA FSIS snapshot

FSIS is **not** queried live from production Pages. A build script writes a static JSON snapshot that the client loads.

1. **Build:** `npm run fetch:fsis` runs [`food-recall-app/scripts/fetch-fsis-recalls.ts`](../../food-recall-app/scripts/fetch-fsis-recalls.ts) against `https://www.fsis.usda.gov/fsis/api/recall/v/1`, drops archived rows, maps records with [`food-recall-app/src/lib/fsis.ts`](../../food-recall-app/src/lib/fsis.ts), and writes `food-recall-app/public/fsis-recalls.json`. Fetch failure writes `{ recalls: [], error, fetchedAt: null }` so CI stays offline-safe. No seed or placeholder recall rows.
2. **Dev:** Vite proxies `/api/fsis-recalls` to the same FSIS API URL (`vite.config.ts`).
3. **Runtime:** `loadFsisFeed` in `api.ts` reads the snapshot (or the dev proxy), caches mapped recalls in `localStorage` under `ponder:fsis:cache` for **24 hours**, and filters client-side (`filterFsisRecalls`).
4. **Merge:** When the Source filter is not `FDA`, page 0 (and not a `search_after` page) prefixes filtered FSIS rows ahead of FDA rows. `total` stays the FDA total so later skip windows stay honest. Source `USDA-FSIS` returns only the filtered FSIS list. FSIS failure never hides a successful FDA response.

## Error handling summary

| Condition | Behavior in `fetchRecalls` |
| --- | --- |
| openFDA 404 “No matches found” | Empty FDA list; still may prefix FSIS on page 0 |
| 429 | `RATE_LIMIT`, retryable; stale cache if present |
| 400 | `BAD_REQUEST`, not retryable |
| 5xx | `SERVER`, retryable; stale cache if present |
| Invalid JSON / missing `results` | `MALFORMED`, retryable; stale cache if present |
| Abort / 8s timeout | `TIMEOUT` or `NETWORK` |
| FSIS unavailable | `fsisUnavailable` flag; FDA path continues |

## Run locally

```sh
cd food-recall-app
npm ci
npm run dev
```

Optional:

```sh
# Optional OPENFDA_API_KEY for the Vite /api/food proxy (the only supported key name).
# See https://open.fda.gov/apis/authentication/ — do not commit a real key.

# Refresh the FSIS snapshot without a full production build
npm run fetch:fsis

# Full build (fetch:fsis + typecheck + vite build)
npm run build

# Unit tests covering fetch, paging, FSIS mapping
npm run test
```

Dev server defaults to port **5173** (`vite.config.ts`). For production-like paging past 25k matches, set `VITE_OPENFDA_PROXY` to a deployed `openfda-proxy` origin (no trailing slash), or rely on the Vite `/api/food` proxy in local dev.

Related package docs: [`food-recall-app/README.md`](../../food-recall-app/README.md), [`openfda-proxy/README.md`](../../openfda-proxy/README.md).

---

A project of JACOBRAKAI FOUNDATION, a 501(c)(3) public charity (EIN 33-3382083).
