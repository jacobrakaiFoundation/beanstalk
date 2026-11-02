# Release practices

Canonical gates for shipping Beanstalk. Detail checklists live under
[`docs/app-store/`](../app-store/) and [`docs/release/`](../release/); this
guide is the entry point and the place package ids are stated once.

Machine-checked identity: [`shared/contracts/identity.json`](../../shared/contracts/identity.json).
Public client hosts: [`shared/contracts/hosts.json`](../../shared/contracts/hosts.json)
(`https://api.jacobrakai.org` for native backend calls).
After any id or host change, run `node scripts/check-docs-alignment.mjs`.

## Approval rule

Merging to `main`, deploying anything that reaches users, and every submission
or upload to Apple or Google need **Jacob's explicit yes** first. Draft packages
and CI artifacts are not a release.

## Secrets never in the repo

Never commit keystores, upload key passwords, APNs `.p8` files, FCM service
accounts, `google-services.json`, API keys, or tunnel credentials. Play upload
values are env / local Gradle properties only (`android/README.md`). Notification
credentials live under `notification-service/secrets/` on the host
(`notification-service/README.md`). CI greps the diff for hardcoded secrets.

## Product identity (do not collide)

| Surface | Id | Path | Store / channel |
| --- | --- | --- | --- |
| Native Android (Compose) | `org.jacobrakaifoundation.beanstalk` | `android/` | Play App Bundle |
| Capacitor sideload | `org.jacobrakaifoundation.beanstalk.sideload` | `android-apk/` + `food-recall-app/capacitor.config.json` | Debug APK only (not Play) |
| iOS | `org.jacobrakaifoundation.beanstalk` | `ios/` | App Store / TestFlight |

Native Play and Capacitor sideload **must** keep distinct `applicationId` /
Capacitor `appId` values so both can install on one device. The Java/Kotlin
`namespace` under `android-apk/` may stay `org.jacobrakaifoundation.beanstalk`;
install collision is decided by `applicationId`. Sideload
`package_name` and `custom_url_scheme` in `android-apk/app/src/main/res/values/strings.xml`
must match the sideload id.

FCM `FCM_ANDROID_PACKAGE_NAME` on the notification service targets the **native**
Play package (`org.jacobrakaifoundation.beanstalk`), not the sideload id.

## iOS App Store

1. Enrollment, fee waiver, and seller name: [`docs/app-store/enrollment-and-fee-waiver.md`](../app-store/enrollment-and-fee-waiver.md).
2. Metadata, privacy label, screenshots, review notes:
   [`docs/app-store/README.md`](../app-store/README.md) and its linked files.
3. Manual gate before Connect and before tapping **Release This Version**:
   [`docs/app-store/release-checklist.md`](../app-store/release-checklist.md).
4. Build/archive on Xcode 26+ (same floor as CI `macos-26`). Bundle id
   `org.jacobrakaifoundation.beanstalk`, minimum deployment iOS 17
   (`ios/project.yml`).
5. Production notification host, public policy Pages URLs, and TestFlight
   device checks must pass before App Review. Release is **manual** after
   Account Holder authorization (Jacob).

## Play Store (native Compose only)

1. Ship from `android/` with `applicationId` `org.jacobrakaifoundation.beanstalk`.
   The Capacitor project is not a Play candidate.
2. Sign `bundleRelease` with the four upload env / Gradle properties documented
   in [`android/README.md`](../../android/README.md). Missing all four yields an
   unsigned AAB; partial set fails configuration.
3. Permissions and Data safety form inputs:
   [`docs/release/play-permissions.md`](../release/play-permissions.md),
   [`docs/release/play-data-safety.md`](../release/play-data-safety.md).
   Re-verify against the binary you upload; mark **UNVERIFIED** rows before paste.
4. Obtain Jacob's yes before Play Console upload or production rollout.

## GitHub Pages (web PWA)

- Workflow: [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).
- Public URL: `https://jacobrakaifoundation.github.io/beanstalk/`.
- Triggers: push to `main` touching `food-recall-app/**` or the workflow, plus
  `workflow_dispatch`.
- Requires Settings → Pages → Source = **GitHub Actions**.
- Build uses Vite base `/beanstalk/` and hardcodes
  `VITE_OPENFDA_PROXY=https://beanstalk-openfda.jacob-e-durham.workers.dev`
  (no trailing slash). Deploying the Worker is separate (`openfda-proxy/`,
  `npx wrangler deploy`) and also needs Jacob's yes for production changes.

## Capacitor sideload APK

- Not a store release. Debug-signed with the Android debug keystore.
- Id: `org.jacobrakaifoundation.beanstalk.sideload` (Capacitor `appId` and
  Gradle `applicationId` must match).
- Build: `food-recall-app` → `npm run build:android` (`VITE_BASE=/`), then
  `android-apk` → `./gradlew assembleDebug`. Details and install steps:
  [`android-apk/README.md`](../../android-apk/README.md).
- CI job `android sideload apk` uploads artifact `beanstalk-debug-apk`.
- Do not point Play Data safety / permissions docs at this APK; it does not
  call the Foundation notification API.

## notification-service deploy

Canonical host path is Docker Compose on Malachi, bound to `127.0.0.1:8787`
behind an HTTPS tunnel. Full steps: [`notification-service/README.md`](../../notification-service/README.md)
(Malachi deployment + Release checks).

Before a mobile release that depends on push:

1. `npm run check`, `docker compose config`, and a test image build succeed.
2. `/healthz` is healthy from outside the host; set `REQUIRE_APNS=1` /
   `REQUIRE_FCM=1` once that provider is required.
3. Backups run at least daily with 14-day retention; restore has been practiced.
4. Secrets stay on the host (`secrets/` mode `0700`, `.env` mode `0600`); never
   in the image or this repository.
5. Jacob approves the cutover or credential enablement.

## Downstream docs (do not fork identity)

When ids or gates change, update code → `shared/contracts/identity.json` → this
file in the same change, then fix any stale mention in the linked checklists.
Do not restate package ids in new markdown when a link here or to the contract
suffices ([`docs/practices/README.md`](README.md) propagation rules).
