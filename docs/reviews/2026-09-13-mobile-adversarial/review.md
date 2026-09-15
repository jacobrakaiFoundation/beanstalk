# Beanstalk mobile adversarial review

> **Status (2026-09-13):** Historical pre-release adversarial review, not a current release gate without re-verification. P1/P2 findings below remain **open** unless separately confirmed fixed in `main` (this docs pass did not re-audit the cited code paths).

**Recommendation: request changes before release.** Four P1 findings and seven P2 findings follow. This is a local review; no GitHub review, merge, deployment, or store submission was performed.

Reviewed on September 13, 2026 (America/Los_Angeles): iOS [PR #142](https://github.com/jacobrakaiFoundation/beanstalk/pull/142) at `e4c590e86717de181e049c348925e6024a8fa3a4`, and Android [PR #144](https://github.com/jacobrakaiFoundation/beanstalk/pull/144) at `f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3`. Android is stacked on the iOS branch. Shared backend defects must be fixed in the base and carried into Android.

The review made no application changes. The Android worktree is clean. The iOS worktree contains unrelated, uncommitted payment integration work, which is excluded from this review. All cited iOS client files match both committed heads. Backend probes import the unchanged Android-head source; corresponding shared logic was checked in the iOS base.

## High priority: repair before approval

**1. [P1] FDA corrections do not replace previously stored lot and hazard information.**

[database.ts:321](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/notification-service/src/database.ts#L321) gives existing non-null product, hazard, distribution, and lot fields precedence over every incoming value. The actual database probe inserts `LOT-OLD / Undeclared egg`, then upserts `LOT-NEW / Undeclared milk`. The result retains the old lot and hazard while advancing `retrievedAt`. Separately, [poller.ts:92](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/notification-service/src/poller.ts#L92) only fetches announcement pages before the previous URL cursor. Editing the announcement at the same cursor URL produces zero additional announcement fetches on the next successful poll. Both paths prevent users from seeing corrected or expanded recall information. Refresh existing authoritative announcements and replace authoritative fields under explicit source precedence, retaining genuine publication and retrieval dates. Verify a same-URL lot expansion end to end without generating an unintended duplicate alert.

**2. [P1] A response for an obsolete push token disables its valid replacement.**

[queue.ts:182](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/notification-service/src/queue.ts#L182) disables a device by registration ID when an in-flight send returns an invalid-token result, without checking whether that token is still current. The probe starts delivery to token A, rotates the device to B, then returns `Unregistered` for A. B becomes inactive and the remaining queued alert is permanently canceled. The batch also snapshots all tokens before awaiting sends: a separate probe rotates to B after the first successful send and observes `sentTokens=[A,A]`, with both jobs marked sent. Load the current destination for each claim and condition invalidation on the sent token or token revision. Handle a superseded destination without canceling delivery for its replacement. The same invalidation logic exists at iOS-base [queue.ts:168](https://github.com/jacobrakaiFoundation/beanstalk/blob/e4c590e86717de181e049c348925e6024a8fa3a4/notification-service/src/queue.ts#L168).

**3. [P1] Android can permanently lose removal of the last watch term.**

[WatchlistSyncEngine.kt:27](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/WatchlistSyncEngine.kt#L27) captures terms, awaits upload, and unconditionally clears the pending marker. Local edits can occur during that await even though network operations are serialized. The compiled-class probe uploads `milk`, removes the final local term while that upload is suspended, and resumes the old upload. The next sync returns success with `local=[] server=[milk] pending=false uploads=1`. The server can continue matching a term the user removed. Registration repeats the same acknowledgement pattern at [BeanstalkRepository.kt:161](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/BeanstalkRepository.kt#L161). Version local mutations and acknowledge only the uploaded revision; drain newer edits, including an empty list.

**4. [P1] A non-food RSS cursor can make gap recovery fail indefinitely.**

[poller.ts:125](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/notification-service/src/poller.ts#L125) requires the old RSS cursor to appear in the output of `parseAnnualXml`. That parser discards non-food records at [sources.ts:245](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/notification-service/src/sources.ts#L245), while RSS cursor selection uses the newest item regardless of classification. The live [FDA Food Safety Recalls feed](https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/food-safety-recalls/rss.xml) contains an epinephrine injection recall, confirming that non-food items reach this feed. If such an item is the cursor when a feed gap occurs, reconciliation cannot find it even when the annual document contains its exact URL. The probe supplies that URL in annual XML and observes three consecutive `gap-paused` results and `gapStatus=failed`. Validate continuity against all valid official source identifiers before filtering food records. Keep non-food entries ineligible for alerts.

## Recall content and presentation

**5. [P2] A table-containing wrapper discards surrounding announcement prose.**

[sources.ts:145](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/notification-service/src/sources.ts#L145) replaces an entire sibling element's text with descendant table rows whenever that element contains a table. Wrapping the existing fixture's announcement paragraphs and product table in one ordinary `div` causes the extracted summary to lose both the allergy-risk paragraph and the disposal instruction. The isolated fixture proves a supported-HTML-shape failure; the one live FDA announcement inspected has separate paragraph siblings and does not reproduce this particular wrapper failure. Traverse prose and tables in document order without making them mutually exclusive, and verify hazard and consumer-action wording remains present.

**6. [P2] iOS displays FDA calendar dates a day early in U.S. time zones.**

[OpenFDA.swift:100](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/ios/Core/Sources/BeanstalkCore/OpenFDA.swift#L100) formats date-only FDA values after parsing them at midnight UTC. Executing the actual formatter under `America/Los_Angeles` yields `20260913 → Sep 12, 2026` and `20260101 → Dec 31, 2025`. Treat date-only values as calendar dates independently of timestamp conversion. Cover western U.S. time zones and a year boundary.

**7. [P2] Cached iOS watchlist matches hide the offline warning.**

[WatchlistView.swift:73](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/ios/App/Views/WatchlistView.swift#L73) renders the model's offline message only when results are empty. When cached matches are available after a failed refresh, the matches render without that message; the detail link also passes no offline provenance. This is confirmed by source control flow, not a device walkthrough. Render freshness information independently of result count and preserve it when opening a cached detail.

**8. [P2] Android pagination can combine different searches and skip results.**

[BeanstalkViewModel.kt:120](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/ui/BeanstalkViewModel.kt#L120) uses the current editable query with the previous results' page or cursor. Search A, edit the field to B without submitting, and select Load more: the request uses B with A's pagination position and appends to A's results. The historical path skips B's first page. Confirmed from source control flow; no device reproduction was performed. Separate draft and submitted queries, or reset pagination whenever the query changes.

## Notification lifecycle and navigation

**9. [P2] An offline iPhone opt-out leaves server deletion pending without automatic retry.**

[NotificationRegistrationService.swift:64](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/ios/App/Networking/NotificationRegistrationService.swift#L64) returns early from synchronization when local alerts are disabled, even when failed deletion left server credentials stored. The service probe performs an offline DELETE, restores connectivity, creates a new service, and synchronizes. DELETE attempts remain at one, credentials remain stored, and the status changes to “alerts are not active.” Manual retry exists but automatic cleanup never runs. This establishes retained server registration; physical APNs behavior after OS unregistration was not measured. Persist pending deletion and retry it before the disabled-state return, preserving the warning until cleanup succeeds.

**10. [P2] Android can display an earlier recall after the user taps a later notification.**

[BeanstalkViewModel.kt:199](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/ui/BeanstalkViewModel.kt#L199) launches unguarded detail requests for each notification target. The compiled reducer receives completions in the permitted order “tap A, tap B, B completes, A completes” and ends with `lastTap=B displayed=A`. An older failure can also erase a newer success. This combines an actual reducer probe with verification of the caller's missing concurrency guard; it is not a full Activity/network test. Guard both completion paths by request generation and invalidate pending notification requests when any other detail is opened.

**11. [P2] Android replays consumed notification navigation after recreation.**

[MainActivity.kt:24](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/MainActivity.kt#L24) processes the retained launch intent on every `onCreate`. [BeanstalkApp.kt:60](https://github.com/jacobrakaiFoundation/beanstalk/blob/f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/ui/BeanstalkApp.kt#L60) also navigates whenever a recreated composition sees a positive notification-navigation version. After opening a notification and navigating away, an Activity/composition recreation can reopen the old recall. Confirmed by source control flow; rotation and enlarged-text recreation remain device verification steps. Consume navigation events and distinguish new intent handling from state restoration.

## Evidence and limits

Backend [probe source](./backend-probes.mts) and [actual JSON output](./backend-results.json) use real parsing, SQLite, polling, queue, and device-store implementations with deterministic sources and senders. No push credentials or real deliveries are involved. Run from the Android checkout with its installed Node 26 runtime and dependencies:

```sh
node notification-service/node_modules/tsx/dist/cli.mjs docs/reviews/2026-09-13-mobile-adversarial/backend-probes.mts
```

The [Android reproduction instructions](./android/README.md) and [iOS reproduction instructions](./ios/README.md) preserve probe sources, actual output, and limitations. Both client probe sets were rerun successfully by the primary reviewer. iOS service probes retain the actual method bodies while replacing network and OS boundaries with test doubles. Tests do not establish physical-device delivery or exact OS UI timing.

An additional iOS probe shows that an earlier permission result can overwrite a later opt-out. It is retained as a concurrency observation rather than a separate release finding because the real UI timing window was not established.

Firebase documentation confirms that background notification-plus-data messages go directly to the system tray, bypassing the service receive callback. It also says notification messages are collapsible and ignore the supplied collapse key. This requires physical-device validation of opt-out and offline bursts; this review does not claim a reproduced FCM delivery loss. Sources: [Android message receipt](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [collapse behavior](https://firebase.google.com/docs/cloud-messaging/customize-messages/collapsible-message-types).

The production service, store enrollment, privacy/support availability, signing, physical devices, accessibility walkthroughs, backup restoration, and capacity/isolation checks were not revalidated in this code review. Passing these probes does not complete those release acceptance checks.

**First repair:** correct authoritative recall refresh and field replacement in finding 1, then rerun the same-URL expansion reproduction.
