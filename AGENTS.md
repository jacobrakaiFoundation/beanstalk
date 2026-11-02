# Beanstalk

FDA and USDA FSIS food recall search: a web app, iPhone and Android clients, a push
notification service, and an openFDA proxy. `README.md` has the product, data
boundaries, and full run instructions; this file is what an agent needs on top.

## Practices and contracts

- Best-practice guides: [`docs/practices/`](docs/practices/) (CI, release, onboarding).
- First-run path for humans and agents: [`docs/practices/onboarding.md`](docs/practices/onboarding.md).
- Machine-checked identity and related facts: [`shared/contracts/`](shared/contracts/).
- Before handing back docs or identity changes, run:
  `node scripts/check-docs-alignment.mjs`

## Layout and checks

| Path | What | Check before handing back |
| --- | --- | --- |
| `food-recall-app/` | React/Vite PWA | `npm ci && npm run check && npm run build && npm run test:coverage` |
| `openfda-proxy/` | Cloudflare Worker | `node --test` |
| `notification-service/` | Node 22 Fastify + SQLite, APNs/FCM | `npm ci && npm run check` |
| `ios/` | SwiftUI app | `swift test --package-path ios/Core` |
| `android/` | Native Compose app | `./gradlew :app:assembleDebug` (CI also runs selected `:app:testDebugUnitTest`) |
| `android-apk/` | Capacitor wrap of the web app | `npm run build:android` in `food-recall-app/`, then `./gradlew assembleDebug` in `android-apk/` |

`.github/workflows/ci.yml` runs these on every non-draft pull request, plus the
docs alignment script above. Default Cloud Agent install covers
`food-recall-app/` only (see `.cursor/environment.json` and onboarding).

Two Android trees exist on purpose (`android/` native vs `android-apk/` sideload).
Package ids and collision rules are owned by `docs/practices/release.md` and
`shared/contracts/identity.json` — link those; do not invent a second source of truth.

## Deploy targets

- Web app: GitHub Pages at https://jacobrakaifoundation.github.io/beanstalk/, rebuilt
  by `pages.yml` on each push to `main` that touches `food-recall-app/`.
- openFDA proxy: `npx wrangler deploy` from `openfda-proxy/`.
- Notification service: Docker Compose bound to `127.0.0.1:8787` behind a tunnel; see
  `notification-service/README.md`.
- App Store / Play: gated by `docs/practices/release.md` and the checklists it links.

Merging to `main`, deploying, and anything sent to Apple or Google need Jacob's yes.

## Rules

- Pull requests go to `jacobrakaiFoundation/beanstalk`. Titles follow Conventional Commits (CI enforces it).
- Commits run `.githooks/commit-msg`. The Claude Code session hook sets
  `core.hooksPath`, and `.claude/hooks/commit-guard.py` blocks bypassing it.
- Never commit secrets, keystores, APNs/FCM credentials, or API keys.
- A search with no result never means a product is safe. Keep that boundary in all copy.
- Prefer linking `docs/practices/` and `shared/contracts/` over copying package ids or job lists into new markdown.
