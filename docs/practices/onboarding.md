# Onboarding practices

Canonical first-run guide for humans and agents working in
[`jacobrakaiFoundation/beanstalk`](https://github.com/jacobrakaiFoundation/beanstalk).

Product story, data boundaries, and full package runbooks live in
[`README.md`](../../README.md). This page is the single path from clone to a
working local demo, then into the right docs for deeper work.

## Who reads what

| Audience | Start here | Then |
| --- | --- | --- |
| Human contributor | This guide → [`CONTRIBUTING.md`](../../CONTRIBUTING.md) | Package README for the area you touch; open a PR against the Foundation remote |
| Coding agent | [`AGENTS.md`](../../AGENTS.md) | This guide for first-run; [`docs/practices/`](./) for CI/release; [`shared/contracts/`](../../shared/contracts/) for identity facts |
| Claude Code | [`CLAUDE.md`](../../CLAUDE.md) (`@AGENTS.md`) | Same as agents |

Do not duplicate long runbooks into `AGENTS.md` or `CONTRIBUTING.md`. Link here
or to the package README instead.

## Prerequisites

- **Git** and a GitHub account that can open PRs against
  `jacobrakaiFoundation/beanstalk`.
- **Node.js 22** (CI and `notification-service` engines field use `>=22`).
  Cloud Agent installs use the nvm default Node 22.x.
- Optional, by area: JDK + Android SDK (`android/`, `android-apk/`), Xcode 26+
  and XcodeGen (`ios/`), Docker (`notification-service` image checks), Wrangler
  (`openfda-proxy` deploy).

## First-run path (everyone)

Clone the Foundation repository (or a fork with `origin` pointed at your fork
and `upstream` at the Foundation remote — see [Remotes](#remotes)).

```bash
git clone https://github.com/jacobrakaiFoundation/beanstalk.git
cd beanstalk
```

Install and start the web app — the default local surface:

```bash
cd food-recall-app
npm ci
npm run dev
```

Open **http://localhost:5173/beanstalk/** (Vite `base` defaults to `/beanstalk/`
for GitHub Pages parity). Append **`?demo=1`** for fictional labeled demo data
without calling openFDA.

Before handing back web changes:

```bash
npm run check && npm run build && npm run test:coverage
```

Cloud Agents already run this path via [`.cursor/environment.json`](../../.cursor/environment.json)
(`npm ci` in `food-recall-app/`, Vite on port 5173). That install is intentional:
it boots the demo quickly. Install other packages only when your change needs them.

## Optional packages

Install and verify only what your change touches. Prefer the package README for
edge cases; these are the usual local checks (aligned with
[`AGENTS.md`](../../AGENTS.md) and CI):

| Path | When | Local check |
| --- | --- | --- |
| `openfda-proxy/` | CORS/`Link` proxy or Pages paging | `node --test` (from that directory) |
| `notification-service/` | Ingestion, device API, APNs/FCM | `npm ci && npm run check` (Node 22; copy `.env.example` → `.env`) |
| `ios/` | SwiftUI / Core | `swift test --package-path ios/Core` |
| `android/` | Native Compose client | `./gradlew :app:assembleDebug` |
| `android-apk/` | Capacitor sideload of the web app | `npm run build:android` in `food-recall-app/`, then `./gradlew assembleDebug` in `android-apk/` |

Full product and deploy context: root [`README.md`](../../README.md). CI job map:
[`ci.md`](ci.md). Store / sideload / Pages gates: [`release.md`](release.md).

## Dual Android trees

There are **two** Android projects on purpose:

- **`android/`** — native Jetpack Compose client (Play-oriented path).
- **`android-apk/`** — Capacitor wrap of `food-recall-app` (debug-signed sideload
  artifact from CI).

They must not share an install identity once release packaging lands. Package
ids, bundle ids, and collision rules are owned by
[`release.md`](release.md) and
[`shared/contracts/identity.json`](../../shared/contracts/identity.json). Do not
copy those literals into new markdown; link the contract or release guide.

## Remotes

Pull requests and issues belong on **`jacobrakaiFoundation/beanstalk`** (the
Foundation remote). If you work from a fork:

1. `origin` → your fork (push branches here).
2. `upstream` → `https://github.com/jacobrakaiFoundation/beanstalk.git` (fetch /
   rebase from here).
3. Open the PR **into** `jacobrakaiFoundation/beanstalk` (usually `main`).

CI enforces Conventional Commits PR titles against that repository. Merging to
`main`, deploying, and App Store / Play publication need Jacob's yes
(see [`AGENTS.md`](../../AGENTS.md)).

## Git hooks

`.githooks/commit-msg` strips Claude Code attribution trailers from commit
messages. Claude Code session setup sets `core.hooksPath` to `.githooks`;
`.claude/hooks/commit-guard.py` blocks bypassing that hook. Humans can enable
the same path with:

```bash
git config core.hooksPath .githooks
```

## Docs and contracts before a docs PR

Practice guides live under [`docs/practices/`](./). Machine-checked identity
facts live under [`shared/contracts/`](../../shared/contracts/).

Before opening or updating a docs / identity PR, run from the repo root:

```bash
node scripts/check-docs-alignment.mjs
```

CI runs the same script on non-draft PRs. It fails when practice files are
missing required links, or when `identity.json` drifts from Gradle /
Capacitor / iOS project values.

## Safety and product boundary

- Never commit secrets, keystores, APNs/FCM credentials, or API keys.
- A search with no result never means a product is safe. Keep that boundary in
  user-facing copy.
- Report vulnerabilities per [`SECURITY.md`](../../SECURITY.md).

## Related surfaces

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — PR hygiene for humans
- [`AGENTS.md`](../../AGENTS.md) — agent layout, checks, deploy gates
- [`.github/pull_request_template.md`](../../.github/pull_request_template.md)
- [`docs/app-store/`](../app-store/) — App Store package (linked from release guide)
- [`docs/release/`](../release/) — Play / release checklists (linked from release guide)
