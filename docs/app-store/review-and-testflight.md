# App Review notes and TestFlight gate

## App Review notes

Paste and update bracketed build-specific details before submission:

> Beanstalk is a free, accountless food-recall information app from JACOBRAKAI FOUNDATION. No login or demo credentials are required.
>
> The Recalls tab displays FDA-published food recall announcements. Historical Search is separately labeled and uses openFDA food enforcement records; it is not presented as a live recall-lifecycle feed. Each record exposes its dates and original FDA source.
>
> To review notifications: open Watchlist and add `salmonella`. Adding the first watch term presents the iOS notification-permission prompt; allow it. The production service silently seeds existing notices and alerts only on a later, newly published matching notice; it does not generate a test alert from old or demo data. Reviewers may use [attach a review-only test procedure or temporary test notice if available].
>
> Settings → Notifications → Remove this device from Beanstalk alerts removes the server-side alert registration and local bearer credential. Saved recalls are local to the device and can be removed from the Saved tab.
>
> Settings → Donate to the Foundation opens `https://jacobrakai.org/donate/` in the user's external browser. Stripe handles payment only after the user continues from that page. Every app feature remains free. A donation is optional and unlocks no content, service, badge, recognition, or other benefit. The app has no in-app purchases.
>
> Beanstalk is independent and is not affiliated with or endorsed by FDA. It does not use the FDA logo.
>
> - Backend base URL: `[production HTTPS URL]`
> - Review contact: `[enter the App Store Connect contact; do not publish it in repository files]`

Do not submit with bracketed text. Attach a short video if the quiet initial seeding behavior makes notification review impractical.

## TestFlight checklist

- [ ] Upload a Release archive signed by the Foundation team; confirm the build finishes processing without compliance warnings.
- [ ] Internal testers complete all four tabs on the smallest and largest supported iPhones, in light/dark appearance and at accessibility text sizes.
- [ ] A physical iPhone receives a newly created matching notification while the app is backgrounded and while it is terminated; tapping opens the correct notice.
- [ ] Test denied permission, later permission changes in iOS Settings, APNs token rotation, opt-out, Remove this device from Beanstalk alerts, reinstall, offline relaunch, and saved-record persistence.
- [ ] Verify word boundaries and visible evidence: `salmonella` does not match `salmon`; `code` does not match `cod`; phrase matching is case-insensitive; undeclared-allergen notices are not hidden by broad negation.
- [ ] Verify initial history is silent, stale/archive/demo notices never alert, duplicate notices alert once, a detected feed gap pauses delivery until reconciliation, and recovery does not replay old alerts.
- [ ] Validate source dates, lots, codes, firms, distribution, unknown classifications, empty results, filters-before-pagination, unavailable sources, and the “no result does not mean safe” message.
- [ ] Verify VoiceOver order and labels, button shapes, contrast, Dynamic Type with no clipped controls, Reduce Motion, share sheet, FDA external links, and return from the external-browser donation page.
- [ ] Restore the notification database from backup in a non-production rehearsal; confirm every restored device is quarantined, all unsent deliveries are canceled, old alerts cannot replay, and an authenticated current-token refresh can reactivate only that device while deduplication history survives.
- [ ] Record build number, devices, OS versions, tester, date, failures, and evidence links. Do not mark the gate passed from simulator-only results.

For external testing, add complete beta review information and submit the first external build to TestFlight App Review. TestFlight builds expire after 90 days. See [TestFlight](https://developer.apple.com/testflight/) and [build statuses](https://developer.apple.com/help/app-store-connect/reference/app-uploads/app-build-statuses).
