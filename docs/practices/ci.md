# CI practices

Canonical guide for continuous integration in this monorepo. Workflow source of
truth: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). Machine-checked
facts: [`shared/contracts/ci.json`](../../shared/contracts/ci.json).

Before opening or updating a PR that touches docs, contracts, workflows, or
package identity, run:

```bash
node scripts/check-docs-alignment.mjs
```

CI runs the same script in the `pull request hygiene` job (no `npm ci`).

## When jobs run

| Trigger | Workflow | Behavior |
| --- | --- | --- |
| Push to `main` | `ci.yml` | `checks`, `notification service checks`, `native release checks`, `android sideload apk`, `android native assemble` |
| Non-draft PR (`opened` / `synchronize` / `reopened` / `ready_for_review`) | `ci.yml` | Same five jobs + `pull request hygiene` |
| Draft PR | `ci.yml` | Only `pull request hygiene` (title, body, labels, CODEOWNERS, docs alignment, secret grep). The other five jobs skip via `github.event.pull_request.draft != true` |
| Push / non-draft PR / weekly cron | `security.yml` | Org reusable CodeQL + dependency review (`scan`) |
| Push to `main` touching `food-recall-app/**` (or `workflow_dispatch`) | `pages.yml` | Build + deploy GitHub Pages |
| `@claude` in issue/PR comment or review | `claude.yml` | On-demand Claude; not a merge gate |

Concurrency: `ci.yml` cancels in-progress runs for the same PR/ref.
`pages.yml` does **not** cancel mid-deploy (`cancel-in-progress: false`).

Actions are pinned to full commit SHAs (version in a trailing comment), per the
org monitoring docs. Dependabot refreshes the pins.

## Protected status contexts

Branch protection / required checks must use the **job `name:`** strings below,
not the YAML job ids. Renaming any of these breaks required-status matching.

| Job id (`ci.yml`) | Protected context (`name:`) | Must stay stable |
| --- | --- | --- |
| `checks` | `checks` | yes |
| `service` | `notification service checks` | yes |
| `native` | `native release checks` | yes |
| `android` | `android sideload apk` | yes |
| `android-native` | `android native assemble` | yes |
| `pr` | `pull request hygiene` | yes |

These names are locked in [`shared/contracts/ci.json`](../../shared/contracts/ci.json)
and verified by `scripts/check-docs-alignment.mjs`.

## Job map and local equivalents

Node **22** everywhere CI installs Node. Android jobs use Temurin **Java 21**.
Default `working-directory` for `checks` is `food-recall-app/` unless a step
overrides it.

### `checks` → context `checks`

Lint, typecheck/build, coverage tests for the React/PWA, plus openFDA proxy
helper tests.

```bash
# food-recall-app/
npm ci
npm run check              # biome check .
npm run build              # fetch:fsis + tsc --noEmit + vite build
npm run test:coverage

# openfda-proxy/
node --test
```

### `service` → context `notification service checks`

```bash
# notification-service/
npm ci
# CI also installs sqlite3 and runs: bash -n scripts/backup.sh scripts/restore.sh scripts/monitor.sh
npm run check              # lint + test + build
npm audit --omit=dev
docker compose config --quiet
docker build --tag beanstalk-notifications:test .
```

### `native` → context `native release checks`

Requires macOS with **Xcode 26+** (CI uses `macos-26`).

```bash
xcodebuild -version
swift test --package-path ios/Core
xcodebuild \
  -project ios/Beanstalk.xcodeproj \
  -scheme Beanstalk \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

### `android` → context `android sideload apk`

Capacitor-wrapped Vite SPA → debug-signed sideload APK (`android-apk/`).
Uses the Android debug keystore; Play upload signing is not configured.
Release / Play identity: [`docs/practices/release.md`](release.md) and
[`docs/release/`](../release/).

```bash
# food-recall-app/
npm ci
npm run build:android      # VITE_BASE=/ build + cap sync android

# android-apk/
./gradlew assembleDebug --no-daemon
# artifact: android-apk/app/build/outputs/apk/debug/app-debug.apk
```

### `android-native` → context `android native assemble`

Native Compose client under `android/`, plus a fixed set of JVM unit tests
(see the `--tests` list in `ci.yml`).

```bash
# android/
./gradlew :app:assembleDebug --no-daemon
./gradlew :app:testDebugUnitTest --no-daemon \
  --tests org.jacobrakaifoundation.beanstalk.ColdStartResilienceTest \
  --tests org.jacobrakaifoundation.beanstalk.ApplicationGraphColdStartTest \
  --tests org.jacobrakaifoundation.beanstalk.data.WatchlistSyncEngineTest \
  --tests org.jacobrakaifoundation.beanstalk.data.network.BeanstalkApiTest \
  --tests org.jacobrakaifoundation.beanstalk.notifications.AlertControlPolicyTest \
  --tests org.jacobrakaifoundation.beanstalk.util.UserFacingErrorTest \
  --tests org.jacobrakaifoundation.beanstalk.notifications.NotificationCoordinatorTest \
  --tests org.jacobrakaifoundation.beanstalk.ui.BrowseRequestTest \
  --tests org.jacobrakaifoundation.beanstalk.ui.NotificationDetailStateReducerTest \
  --tests org.jacobrakaifoundation.beanstalk.ui.WatchlistScreenTest \
  --tests org.jacobrakaifoundation.beanstalk.domain.EnforcementReportLinkTest \
  --tests org.jacobrakaifoundation.beanstalk.ui.SettingsScreenTest
# artifact: android/app/build/outputs/apk/debug/app-debug.apk
```

### `pr` → context `pull request hygiene`

Pull requests only (including drafts). No `npm ci`; finishes in seconds.

| Check | Local / equivalent |
| --- | --- |
| Conventional Commits title | Title must match `^(feat\|fix\|docs\|style\|refactor\|perf\|test\|chore\|ci\|revert)(\(.+\))?!?: .+` |
| Issue reference + Summary | Body has `Closes #N` / `Fixes #N` / `Resolves #N` (Dependabot exempt); prefer a `## Summary` section ([`.github/pull_request_template.md`](../../.github/pull_request_template.md)) |
| Auto-labels | `enhancement` / `docs` / `ci` from changed paths |
| CODEOWNERS | `gh api repos/<owner>/<repo>/codeowners/errors` |
| Docs / contracts alignment | `node scripts/check-docs-alignment.mjs` |
| Hardcoded secrets / private keys in diff | Review `git diff origin/<base>...HEAD` for credential-shaped literals and `BEGIN … PRIVATE KEY` |

## Security scanning (separate workflow)

CodeQL and dependency review live in
[`.github/workflows/security.yml`](../../.github/workflows/security.yml), which
calls the org reusable workflow
`jacobrakaiFoundation/.github/.github/workflows/security-scan.yml@main`.
They are **not** duplicated in `ci.yml`. Draft PRs skip `scan` the same way as
the heavy `ci.yml` jobs. Weekly cron (`17 6 * * 1` UTC Mondays) catches
vulnerabilities that appear without a new commit.

Belt-and-braces secret grep in `pull request hygiene` complements GitHub secret
scanning; it does not replace CodeQL or dependency review.

## Pages and Claude (related, not merge gates)

| Workflow | Local equivalent | Notes |
| --- | --- | --- |
| `pages.yml` → `build` | In `food-recall-app/`: `npm ci` then `VITE_OPENFDA_PROXY=https://beanstalk-openfda.jacob-e-durham.workers.dev npm run build` | Default Vite base `/beanstalk/` for project Pages |
| `pages.yml` → `deploy` | n/a (GitHub Pages Actions) | Needs Settings → Pages → Source = GitHub Actions |
| `claude.yml` → `claude` | n/a | Needs `CLAUDE_CODE_OAUTH_TOKEN`; skipped (green) if unset |

Store / Play / sideload release steps are owned by
[`docs/practices/release.md`](release.md) (links into `docs/app-store/` and
`docs/release/`), not by CI.

## Git hooks and commit hygiene

| Piece | Role |
| --- | --- |
| `.githooks/commit-msg` | Strips Claude Code attribution trailers from commit messages; never blocks a commit |
| `git config core.hooksPath .githooks` | Points Git at that hooks dir. Claude Code SessionStart in `.claude/settings.json` sets this for agent sessions; humans should set it once locally the same way |
| `.claude/hooks/commit-guard.py` | Claude PreToolUse guard: blocks `git commit --no-verify`, `hooksPath` overrides, and overwriting the commit-msg hook |

PR titles (not commit subjects) are what `pull request hygiene` enforces for
Conventional Commits. Prefer the same type prefixes on commits for a readable
history.

## Propagation

1. Change the workflow or a local command in code / `package.json` / Gradle.
2. Update [`shared/contracts/ci.json`](../../shared/contracts/ci.json) if a
   protected context name, Node/Java version, or job id changed.
3. Update this guide in the same PR.
4. Confirm with `node scripts/check-docs-alignment.mjs`.

Do not rename protected contexts casually. Do not move docs alignment out of
`pull request hygiene` without updating the contract, this guide, and
[`shared/contracts/README.md`](../../shared/contracts/README.md).
