# Docs index

Start with the root [`README.md`](../README.md) for product and run commands.
Living practice guides and machine-checked facts:

| Path | Role |
| --- | --- |
| [`practices/`](practices/) | CI, release, and onboarding best practices |
| [`../shared/contracts/`](../shared/contracts/) | Package ids, hosts, CI job names (CI-enforced) |
| [`architecture.md`](architecture.md) | Code-derived architecture note |
| [`recipes/fda-fetch.md`](recipes/fda-fetch.md) | Web openFDA + FSIS fetch recipe |
| [`app-store/`](app-store/) | iPhone App Store draft package |
| [`release/`](release/) | Play Data safety / permissions |
| [`accessibility.md`](accessibility.md) | Store accessibility claims |
| [`FUNDING.md`](FUNDING.md) | Funding brief |
| [`reviews/`](reviews/) | Historical adversarial reviews (not current gates) |

Before changing package ids, hostnames, or CI job `name:` strings, update
[`shared/contracts/`](../shared/contracts/) in the same PR and run:

```bash
node scripts/check-docs-alignment.mjs
```
