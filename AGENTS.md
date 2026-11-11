# Beanstalk

FDA and USDA FSIS food recall search: a web app, iPhone and Android clients, a push
notification service, and an openFDA proxy. `README.md` has the product, data
boundaries, and full run instructions; this file is what an agent needs on top.

## Layout and checks

| Path | What | Check before handing back |
| --- | --- | --- |
| `food-recall-app/` | React/Vite PWA | `npm ci && npm run check && npm run build && npm run test:coverage` |
| `openfda-proxy/` | Cloudflare Worker | `node --test` |
| `notification-service/` | Node 22 Fastify + SQLite, APNs/FCM | `npm ci && npm run check` |
| `ios/` | SwiftUI app | `swift test --package-path ios/Core` |
| `android/` | Native Compose app | `./gradlew :app:assembleDebug` |
| `android-apk/` | Capacitor wrap of the web app | `npm run build:android` in `food-recall-app/`, then `./gradlew assembleDebug` |

`.github/workflows/ci.yml` runs all of these on every pull request.

## Deploy targets

- Web app: GitHub Pages at https://jacobrakaifoundation.github.io/beanstalk/, rebuilt
  by `pages.yml` on each push to `main` that touches `food-recall-app/`.
- openFDA proxy: `npx wrangler deploy` from `openfda-proxy/`.
- Notification service: Docker Compose bound to `127.0.0.1:8787` behind a tunnel; see
  `notification-service/README.md`.
- App Store: gated by `docs/app-store/release-checklist.md`.

Merging to `main`, deploying, and anything sent to Apple or Google need Jacob's yes.

## Rules

- Pull requests go to `jacobrakaiFoundation/beanstalk` (remote `foundation`); `origin`
  is `jacobyoby/beanstalk`. Titles follow Conventional Commits (CI enforces it).
- Commits run `.githooks/commit-msg`. The Claude Code session hook sets
  `core.hooksPath`, and `.claude/hooks/commit-guard.py` blocks bypassing it.
- Never commit secrets, keystores, APNs/FCM credentials, or API keys.
- A search with no result never means a product is safe. Keep that boundary in all copy.
