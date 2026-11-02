# Beanstalk iOS build 3 (guideline 5.6 remediation) adversarial review

**Recommendation: request changes before sending the Resolution Center reply.** The diff does make the alert path reachable, and the client/server contract is proven working against the live service by probe. But the reply contains three statements a reviewer can falsify from the app itself, and the alert feature has never delivered a push in production. Three P1, four P2, four P3 follow.

Reviewed 2026-09-21 against the uncommitted working tree on `fix/ios-alerts-live`, on top of `ff1b258`. Read-only: no files were edited, committed, or stashed. Live probes used `User-Agent: ops-probe`; the one registration created was deleted (204, then 401 on re-read).

## The alert path itself

**Verdict on question 1: the wire contract works end to end against the deployed service.** A full lifecycle probe against `https://api.jacobrakai.org` succeeded with exactly the shapes `DeviceAPI.swift` produces and decodes: `POST /v1/devices` with `{"deviceToken","environment"}` → `201 {"deviceId","clientSecret"}`; `PUT /v1/devices/me/watchlist` with `Authorization: Bearer <deviceId>.<clientSecret>` → `200 {"terms":["listeria"]}`; `GET /v1/devices/me` → 200; `PUT /v1/devices/me/token` → 200; `DELETE /v1/devices/me` → 204. That matches `ios/App/Networking/DeviceAPI.swift:99-107`, `:149-156`, `:189-195` against `notification-service/src/app.ts:290-360`. The Release `APNS_ENVIRONMENT` is `production` (`ios/project.yml:42-43`, `ios/Beanstalk.xcodeproj/project.pbxproj:334`), which `AppConfiguration.swift:10-13` maps to the service string `production`, which `notification-service/src/apns.ts:56-59` routes to `api.push.apple.com`. The entitlement takes the same variable and correctly receives `production`/`development`, not `production`/`sandbox`. No finding on request paths, methods, field names, auth format, response decoding, or APNs host selection.

**1. [P1] The reply tells Apple to look for a button the app will not show in that state.**

The reply says: "Watchlist → add a term → allow notifications → Settings shows 'Turn on alerts for this watchlist'." It will not. `NotificationRegistrationService.swift:70-72` sets `alertsEnabled = true` as soon as the permission is granted. `AlertControlPolicy.swift:35` returns `.turnOff` whenever `alertsEnabled` is true, and `SettingsView.swift:37-40` renders `.turnOff` as **"Remove this device from Beanstalk alerts"**. The "Turn on alerts for this watchlist" button (`SettingsView.swift:33-36`) appears only when `alertsEnabled` is false and at least one term exists, i.e. after the user *declines* the prompt or removes the device. A reviewer following the reply's own steps sees a different string than the reply promises. Under a 5.6 rejection that is the worst possible thing to get wrong. Rewrite the step to name the Remove button, or drop the string and say "Settings → Notifications shows the alert controls".

**2. [P1] "No code paths are gated on server responses" is false, and falsifiable in the UI.**

`SettingsView.swift:44-48` shows the "Retry Removing This Device" button only when `notifications.hasStoredRegistration` is true, and that flag is set at `NotificationRegistrationService.swift:248` only after `registerOrRotate` returns without throwing, i.e. only after the server answered 201/200. The visible status line is likewise server-driven: `:258` prints `enableFailedMessage` on a failed registration, `:300` prints `watchlistSyncFailedMessage` on a failed sync, `:309-313` prints one of three server-outcome strings. Delivery is also date-gated server-side (`notification-service/src/queue.ts:303-310`, `alert_expired`). Say what is actually true and still exonerating: "No feature is unlocked, hidden, or changed based on a server response, a date, a region, or detection of a reviewer. The only server-dependent text is an error message when the registration call fails."

**3. [P1] The alert feature has never delivered a push in production, and the reply invites Apple to test it.**

Live `/healthz` returns `"lastSentAt": null` with `queued/retrying/sending/failed` all 0 and `recentApnsFailures: 0`. No successful delivery exists anywhere in the retained window (retention is 30 days, `config.ts:89`). `pushDisabled: false` proves only that all four APNs credential fields are set (`config.ts:58-63`, `apns.ts:153-157`); it does not prove the key is valid or that `APNS_BUNDLE_ID` equals `org.jacobrakaifoundation.beanstalk`, and neither is checkable from outside. There is also no on-demand path: `queue.ts:62-66` enqueues only notices with `eligibleForAlert`, `foodClassification = "food"` and `sourceKind = "rss"`, and `poller.ts:75,107` marks pre-existing notices ineligible. So the reply's hedge is accurate but leaves Apple with a feature it cannot observe, which is exactly the complaint. Before sending: send one real APNs push to a physical device from the production service and keep the receipt, then attach that evidence. Verify `APNS_BUNDLE_ID` on the `notification-service-notifications-1` container matches the bundle ID.

## The Resolution Center reply

**4. [P2] The reply does not reconcile the screen recording, which is the likely trigger for 5.6.**

The submitted review notes state "the first term presents the iOS notification-permission prompt; allow it," and a screen recording from a physical iPhone was attached to the 2.1 reply. Build 2 could not produce that prompt. With `BEANSTALK_PUSH_CONFIGURED` false, `WatchlistView.swift:134-139` evaluates `shouldOfferEnable(alertsEnabled:false, alertsAvailable:false, …)`, which `AlertControlPolicy.swift:36` resolves to `.none`, so `requestAfterFirstWatchTerm` is never called and the fallback `syncWatchlist` returns at `NotificationRegistrationService.swift:118-121` without touching the network. Notes describing a prompt the binary suppresses, plus a recording showing a flow the binary cannot run, is what "intentionally hidden" means to App Review. The reply must say plainly that the recording was made from a build with the flag on and that the submitted binary had it off. Silence here reads as the cover-up.

**5. [P2] The reply omits that build 2's main tab was also dead, and the omission is discoverable.**

`api.beanstalk.jacobrakai.org` does not resolve (`dig +short` against 1.1.1.1 returns nothing), and `origin/main` at `ff1b258` still carries it in `ios/App/Info.plist:22`. `APIClient.swift:45-77` routes the Recalls list through `AppConfiguration.backendBaseURL` with a local-cache fallback only; on a clean install the cache is empty, so the request throws and the Recalls tab cannot populate. The reply mentions the unpublished hostname but frames the defect as alerts-only. A reviewer who saw an empty primary tab will read that framing as a partial admission. Proof is from the tracked tree and DNS, not from the build-2 binary, which I did not inspect.

**6. [P2] The reply hands Apple a public repository that documents the gating and eleven open defects.**

`https://github.com/jacobrakaiFoundation/beanstalk` returns 200, and `docs/reviews/2026-09-13-mobile-adversarial/review.md` is publicly fetchable (raw.githubusercontent 200). It lists eleven P1/P2 findings in the notification path, and `docs/reviews/2026-09-15-android-sideload-adversarial/review.md:62` states that `api.beanstalk.jacobrakai.org` "may be unresolved". Offering that link during a 5.6 review invites a reviewer to read your own defect log. Drop the last paragraph, or make the link conditional on Apple asking for source.

**7. [P2] The deployed service is two merged PRs behind this repo, so "the notification service source is in this repo" is not true of what Apple will hit.**

Live `/healthz` omits the `pushProviders` object that `app.ts:205-208` always emits at HEAD, and its `queue` block omits `recentPushFailures`/`lastPushFailureAt` that `queue.ts:278-280` always emits. Live `GET /v1/devices/me` returned `{"id","environment","active","disabledReason","terms"}` with no `provider` or `identifierKind`, while HEAD's `deviceResponse` (`app.ts:125-133`) always includes both. All three match `47f679b` (#142) exactly. So `7da73e2` (#204, proxy-hop trust and safe re-enrichment) and `dc35c52` (#144) are not running. The iOS contract is unaffected, which the probe proves, but the edited checklist item in `docs/app-store/release-checklist.md:12` only asks for `/healthz` and `/v1/notices` to answer, so it passes against a stale build. Add a version or commit assertion to that item and redeploy before submitting.

## Process

**8. [P3] Nothing in CI verifies the two settings this whole fix depends on.**

`.github/workflows/ci.yml:143-152` builds Release for `-sdk iphonesimulator` with `CODE_SIGNING_ALLOWED=NO`. That embeds no entitlements and asserts nothing about `BEANSTALK_PUSH_CONFIGURED` or `aps-environment`. The claim in `docs/app-store/release-checklist.md:9` that the Release archive "contains … APNs entitlement, production endpoints" rests entirely on a manual archive. Add a step that reads both keys out of the built `Info.plist` and fails on anything but `true` and `production`.

**9. [P3] The review-notes template still contains two unfilled brackets under a rule that forbids them.**

`docs/app-store/review-and-testflight.md:11` keeps "[attach a review-only test procedure or temporary test notice if available]" and `:20` keeps "[enter the App Store Connect contact…]", while `:22` says "Do not submit with bracketed text." The diff filled only the backend-URL bracket. The notes actually submitted to Apple contain no brackets, so this is a template defect, not a shipped one.

**10. [P3] `DeviceAPI.verifyRegistration()` is defined and never called.**

`ios/App/Networking/DeviceAPI.swift:119-127`; `grep -rn verifyRegistration ios/` returns only the definition. It is an unreferenced authenticated network method in a binary being reviewed for hidden functionality. Delete it or wire it to the Settings status.

**11. [P3] The Android build still points at the unresolvable hostname.**

`android/app/build.gradle.kts:34` sets `BACKEND_BASE_URL` to `https://api.beanstalk.jacobrakai.org`. Out of scope for this submission, but a Play submission from that tree reproduces the same defect that produced this rejection.

## Not findings

- **Request paths, methods, JSON field names, auth header format, response decoding.** Verified by live probe; see the verdict above.
- **APNs environment and entitlement.** `AppConfiguration.swift:10-13` maps the build setting correctly for both consumers; `development`/`production` reach the entitlement, `sandbox`/`production` reach the service.
- **Dead hostnames, build-time flags, debug/test/review strings in the shipped iOS sources.** `grep -rn -E "#if |ProcessInfo|XCTest|DEBUG|[Ss]taging|api\.beanstalk" ios/App ios/Core/Sources` finds only `AccessibilitySupport.swift:76` (`#if canImport(AVKit)`) and the `"Coming soon"` constant at `AlertControlPolicy.swift:10`, which is now unreachable because `isPushConfigured` is true. Remaining `api.beanstalk` references are in `ios/Core/Tests/`, which does not ship.
- **Entitlements without a working feature.** `aps-environment` is the only entitlement, and the feature behind it is now reachable.
- **Privacy manifest.** `ios/Resources/PrivacyInfo.xcprivacy` exists and is in the Resources build phase (`project.pbxproj:11`).
- **Watchlist term validation.** `WatchlistView.swift:107-119` caps at 20 terms and 2–80 characters, and `NotificationRegistrationService.swift:343` de-duplicates; `app.ts:328-346` and `domain.ts:51-64` enforce the same bounds. No mismatch.
- **Prior review's open iOS alert-path findings.** #7 (cached matches hide the offline warning) is fixed: `WatchlistView.swift:71-73` renders the message unconditionally and `:86` passes `offlineCopyMessage`. #9 (offline opt-out leaves deletion pending) is fixed: `NotificationRegistrationService.swift:90-96` now enqueues `performRegistrationDeletion` when alerts are off but credentials remain. #6 (dates a day early) is fixed: `OpenFDA.swift:103-112` parses compact dates in the current time zone. #2 (a stale token disabling its replacement) is fixed and is in the deployed build: `disableIfCurrent` landed in `47f679b` and is called at `queue.ts:201`.
- **Build numbering and version.** `CURRENT_PROJECT_VERSION = 3` is consistent in `ios/project.yml:30` and both configs of the tracked `project.pbxproj` (`:339`, `:364`), and 3 is greater than the uploaded build 2. `MARKETING_VERSION 1.0.0` against App Store version 1.0 is not a new risk: build 2 carried the same value and reached review. Note that the tracked value was `1` while builds 1 and 2 were uploaded, so the repo has not been the source of truth for build numbers.
- **`docs/app-store/*.md` contradicting the build.** After the diff, no file under `docs/app-store/` references `api.beanstalk.jacobrakai.org`, "Coming soon", or `BEANSTALK_PUSH_CONFIGURED`.
- **Public URLs in the app.** Privacy, support and donation pages all return 200.
