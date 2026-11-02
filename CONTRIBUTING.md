# Contributing

Thanks for helping with Beanstalk. Product overview and how to run each package
live in [`README.md`](README.md). **First-run setup, remotes, and the agent vs
human doc map** live in
[`docs/practices/onboarding.md`](docs/practices/onboarding.md) — start there if
you are new to the monorepo.

## Pull requests

1. Point issues and PRs at **`jacobrakaiFoundation/beanstalk`** (Foundation
   remote). From a fork, open the PR into that repository.
2. Use the template in
   [`.github/pull_request_template.md`](.github/pull_request_template.md).
3. PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/)
   (for example `feat: add recall filters`). CI rejects other titles.
4. Prefer focused diffs. Update user-facing docs when behavior changes.
5. For docs or identity (`shared/contracts/`) changes, run
   `node scripts/check-docs-alignment.mjs` from the repo root before opening the
   PR. CI runs the same check on non-draft PRs.

## Secrets

Do not commit secrets, keystores, APNs/FCM credentials, or API keys. See
[`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## Practices

Living guides for CI, release, and onboarding:
[`docs/practices/`](docs/practices/). Machine-checked package ids:
[`shared/contracts/`](shared/contracts/).
