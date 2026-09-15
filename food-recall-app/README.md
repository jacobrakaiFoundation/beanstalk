# Beanstalk — Food Recall Tracker

Search and filter food enforcement records **as published by openFDA**, with dietary concern matching, watchlist alerts, and an offline-capable PWA. Not a live FDA recall-lifecycle feed.

## Stack
Vite + React 19 + TypeScript + Tailwind CSS v4 + PWA (Workbox)

## Data
- **Primary recalls**: [openFDA Food Enforcement API](https://api.fda.gov/food/enforcement.json) — 29,000+ records **as published by openFDA** (not live FDA lifecycle), paginated
- **USDA FSIS recalls**: official [FSIS Recall API](https://www.fsis.usda.gov/fsis/api/recall/v/1) snapshot (`npm run fetch:fsis` during build). Merge on page 0 with a Source filter (All / FDA / USDA-FSIS). Fetch failure writes `{ recalls: [], error }` — no seed rows. `search_after` is not used.
- **Early Signals (CAERS)**: [openFDA Food Adverse Event API](https://api.fda.gov/food/event.json) — same proxy/auth/rate limits as enforcement
- **Publish lag**: Dataset typically refreshes mid-week (Wednesday). Status fields are as published, not a current lifecycle.
- **Empty search**: openFDA returns HTTP 404 + “No matches found” — the app shows an empty list, not an error.
- **Pagination**: `skip` is capped at 25,000. `search_after` is not implemented; narrow filters to page further.
- **Related Events**: parenthesized OR of product tokens ([#102](https://github.com/jacobyoby/beanstalk/pull/102)).
- **API Key**: Optional via `VITE_OPENFDA_KEY` env var (increases rate limit from 40 to 240 req/min)
- **Cache**: 6-hour localStorage cache with LRU eviction for offline/stale serving
- **Demo Mode**: Add `?demo=1` to URL for fictional mock data (`src/lib/mockData.ts`, `src/lib/mockEvents.ts`)
- **Fallback**: stale cached data from the last successful fetch (no automatic mock fallback)

## Run
```bash
cd food-recall-app
npm install
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
