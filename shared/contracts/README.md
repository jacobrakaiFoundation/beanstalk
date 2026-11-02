# Shared contracts

Machine-readable facts that documentation and workflows must stay aligned with.
**Code owns the values.** These files mirror them so humans, agents, and CI can
check drift without scraping every README by hand.

| File | What it locks |
| --- | --- |
| [`identity.json`](identity.json) | Android `applicationId`s, Capacitor `appId`, iOS bundle id, package paths |
| [`ci.json`](ci.json) | Node/Java versions, protected status context names, CI job ids, alignment job |

## How updates propagate

1. Change the **code** (Gradle, `capacitor.config.json`, `ios/project.yml`,
   workflow `name:` / versions, …).
2. Update the matching field in the contract JSON in the same PR.
3. Update any prose that cites the value (or point the prose at this contract /
   `docs/practices/` instead of repeating the literal).
4. `node scripts/check-docs-alignment.mjs` must pass. CI runs it on every
   pull request (including drafts) in the `pull request hygiene` job in
   `.github/workflows/ci.yml`.

Do not invent a second source of truth in markdown. Prefer linking here or to
`docs/practices/`.

## Security

Contracts are public facts (package names, paths). Never put secrets, keystore
paths with credentials, API keys, or environment-specific hostnames that are
not already in public docs into this directory.
