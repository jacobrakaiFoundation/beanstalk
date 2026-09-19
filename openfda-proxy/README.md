# Beanstalk openFDA proxy

GitHub Pages serves the web app from `jacobrakaifoundation.github.io`. Production `fetch` therefore hits `api.fda.gov` cross-origin. openFDA sends `Access-Control-Allow-Origin: *` but does **not** expose `Link`, and `Link` is not a CORS-safelisted header. Without this worker, `res.headers.get("link")` is always `null` in the browser, so `search_after` paging cannot start.

The worker:

- Proxies `GET`/`HEAD` for `/food/enforcement.json` and `/food/event.json` only
- Re-exposes `Link` and copies `search_after` onto `X-OpenFDA-Search-After`
- Rewrites `Link` URLs onto this origin and strips `api_key` so a server-injected key cannot leak into the client cursor cache

Deployed at `https://beanstalk-openfda.jacob-e-durham.workers.dev` after `npx wrangler deploy`. The Pages build hardcodes that origin as `VITE_OPENFDA_PROXY` in `.github/workflows/pages.yml` (no trailing slash), so the static app can read `Link` / `search_after`. An unset proxy keeps fetches on `api.fda.gov` and does not stall Pages.

```bash
npx wrangler deploy
# optional: npx wrangler secret put OPENFDA_API_KEY
```

Run helper tests with `node --test` in this directory.
