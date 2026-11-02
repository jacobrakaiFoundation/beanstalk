# Practices

Living best-practice guides for this monorepo. Each area guide is the human /
agent entry point; machine-checked facts live under [`shared/contracts/`](../../shared/contracts/).

| Area | Guide | Owns | Downstream check |
| --- | --- | --- | --- |
| CI | [`ci.md`](ci.md) | Workflow jobs, required checks, hooks, secret scanning | `scripts/check-docs-alignment.mjs` + `.github/workflows/ci.yml` |
| Release | [`release.md`](release.md) | App Store, Play, Pages, sideload APK, notification-service deploy gates | same script + release checklists |
| Onboarding | [`onboarding.md`](onboarding.md) | First-run paths for humans and agents (`AGENTS.md`, CONTRIBUTING, env) | same script + `AGENTS.md` |

## Propagation rules

1. **One claim, one home.** Product identity → `shared/contracts/identity.json`.
   How to run CI locally → `docs/practices/ci.md`. Store submission steps →
   `docs/app-store/` / `docs/release/` (linked from `release.md`, not copied).
2. **Code first.** When a package id, job name, or command changes, update code,
   then the contract, then the practice guide in the same PR.
3. **CI enforces alignment.** `node scripts/check-docs-alignment.mjs` fails the
   build when docs or contracts disagree with code.
4. **Agents read `AGENTS.md`**, which points here. Do not duplicate long runbooks
   inside agent files; link instead.

## Adding a practice area

Add a row to the table above, create `docs/practices/<area>.md`, extend the
alignment script if there are machine-checkable facts, and link from `AGENTS.md`.
