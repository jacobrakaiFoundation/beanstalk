# Beanstalk — Food Recall Tracker

Search and filter food enforcement records **as published by openFDA**, with dietary concern matching, watchlist alerts, and an offline-capable PWA. Not a live FDA recall-lifecycle feed.

## Stack
Vite + React 19 + TypeScript + Tailwind CSS v4 + PWA (Workbox)

## Data
- **Primary recalls**: [openFDA Food Enforcement API](https://api.fda.gov/food/enforcement.json) ([overview & disclaimer](https://open.fda.gov/apis/food/enforcement/), [example queries](https://open.fda.gov/apis/food/enforcement/example-api-queries/)) — 29,000+ records **as published by openFDA** (not live FDA lifecycle), paginated
- **USDA FSIS recalls**: official [FSIS Recall API](https://www.fsis.usda.gov/fsis/api/recall/v/1) snapshot (`npm run fetch:fsis` during build). Merge on page 0 with a Source filter (All / FDA / USDA-FSIS). Fetch failure writes `{ recalls: [], error }` — no seed rows.
- **Early Signals (CAERS)**: [openFDA Food Adverse Event API](https://api.fda.gov/food/event.json) — same proxy/auth/rate limits as enforcement
- **Publish cadence**: openFDA refreshes the enforcement dataset on a **weekly** schedule (FDA does not guarantee a fixed weekday). Status fields are as published, not a current lifecycle.
- **Empty search**: openFDA returns HTTP 404 + “No matches found” — the app shows an empty list, not an error.
- **Pagination**: Per [openFDA paging](https://open.fda.gov/apis/paging/), `skip` works through the first 25,000 matches. Later pages follow `search_after` from the response `Link` header. Skip-based `rel=next` links after page 0 do **not** include a cursor (and `skip=25000`'s next URL is `skip=25006`, which openFDA rejects), so the UI chains cursors from the first page. GitHub Pages cannot read `Link` cross-origin; deploy `openfda-proxy/` and set `VITE_OPENFDA_PROXY` so production can. Status is as published by openFDA, not a live lifecycle.
- **Related Events**: parenthesized OR of product tokens ([#102](https://github.com/jacobrakaiFoundation/beanstalk/pull/102)).
- **API key**: Local dev may set `VITE_OPENFDA_KEY` (40→240 req/min); in the browser the app calls `/api/food/…`, and the dev or host proxy can inject `OPENFDA_API_KEY` server-side so the key is not bundled (see `src/lib/api.ts`).
- **Cache**: 6-hour localStorage cache with LRU eviction for offline/stale serving
- **Demo Mode**: Add `?demo=1` to URL for fictional mock data (`src/lib/mockData.ts`, `src/lib/mockEvents.ts`)
- **Fallback**: stale cached data from the last successful fetch (no automatic mock fallback)

## Run
```bash
cd food-recall-app
npm ci
npm run dev    # http://localhost:5173
npm run build  # output: dist/
npm run test   # vitest (unit + component)
```

## Features
- **Tabs**: **Recalls** (enforcement) and **Early Signals** (unverified CAERS adverse event reports)
- **Search**: Debounced cross-field search (product, reason, firm, reaction) with grouped OR clauses
- **Early Signals**: Search product brand / reactions / outcomes; FDA “not scientifically verified” disclaimer on every event surface; related CAERS links on recall detail
- **Filters**: Classification (I/II/III), Status (Ongoing/Completed/Terminated), Distribution State, Dietary Concerns (14 allergen types with negation handling) — recall tab only
- **Watchlist**: Save keywords for browser notification alerts when matching recalls or adverse event reports appear
- **Alerts**: Browser push notifications via Notification API, permission-gated
- **PWA**: Installable, offline-capable with Workbox precaching and service worker
- **Dark Mode**: OS-preference detection with manual toggle
- **Accessibility**: WCAG 2.1 AA compliant — proper labels, contrast ratios (4.5:1+ text, 3:1+ non-text), focus indicators, keyboard navigation, focus-trapped modal, skip link, aria-live regions
- **Responsive**: Single-column mobile, collapsible filters, 2-col grid on desktop with sticky sidebar
- **Demo**: `?demo=1` with conspicuously fictional recall and event data

## Test Coverage
- `api.test.ts` — API fetching, caching, error handling, search clause building
- `events.test.ts` — CAERS mapping, search, errors, demo mode, related-event lookup
- `dietary.test.ts` — Allergen matching, negation, predicate building
- `RecallCard.test.tsx` — Rendering, interaction, a11y attributes
- `watchlist.test.ts` — localStorage CRUD, type validation
- `WatchlistPanel.test.tsx` — Form submission, item management, a11y
- `formatDate.test.ts` — Date formatting, new-recall detection
- `notifications.test.ts` — Permission flow, send/create
- `SearchBar.test.tsx` — Label, value, onChange (includes reaction placeholder)
- `FilterPanel.test.tsx` — Select options, onChange, clear
- `landingPages.test.ts` — Discovery tags, JSON-LD, sitemap, and social meta on public HTML pages

## Deploy
Any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages):
```bash
npm run build  # outputs dist/ with base /beanstalk/ for GitHub Pages
```

The Android sideload APK uses `npm run build:android` (`VITE_BASE=/` plus `npx cap sync android`) so the WebView can load assets at the origin root. That path does not change the Pages deploy. See [`../android-apk/README.md`](../android-apk/README.md).

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| `VITE_OPENFDA_KEY` | No | openFDA API key (40→240 req/min) |
| `VITE_DEMO` | No | Set to `true` to enable demo mode by default |
