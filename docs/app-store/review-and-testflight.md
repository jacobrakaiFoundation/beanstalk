# App Review notes and TestFlight gate

## App Review notes

Paste and update bracketed build-specific details before submission:

> Beanstalk is a free, accountless food-recall information app from JACOBRAKAI FOUNDATION. No login or demo credentials are required.
>
> The Recalls tab displays FDA-published food recall announcements. Historical Search is separately labeled and uses openFDA food enforcement records; it is not presented as a live recall-lifecycle feed. Each record exposes its dates and original FDA source.
>
> Watchlist tab: type a word or phrase such as `salmonella` and tap Add. The app checks recent FDA announcements on the device and lists matches with the matched word and field. Watch terms stay on the iPhone; there is no permission prompt, notification, or server registration. The app does not send push notifications.
>
> Saved tab: open any recall and tap the bookmark (Save) to keep a local copy. Settings → Data on this iPhone → Clear saved recalls and watch terms removes both from the device.
>
> Settings → Donate to the Foundation opens `https://jacobrakai.org/donate/` in the user's external browser. Stripe handles payment only after the user continues from that page. Every app feature remains free. A donation is optional and unlocks no content, service, badge, recognition, or other benefit. The app has no in-app purchases.
>
> Beanstalk is independent and is not affiliated with or endorsed by FDA. It does not use the FDA logo.
>
> - Backend base URL: `[production HTTPS URL]`
> - Review contact: `[enter the App Store Connect contact; do not publish it in repository files]`

Do not submit with bracketed text. Review notes describe only what a reviewer can reach in the submitted build's UI.

## TestFlight checklist

- [ ] Upload a Release archive signed by the Foundation team; confirm the build finishes processing without compliance warnings.
- [ ] Internal testers complete all four tabs on the smallest and largest supported iPhones, in light/dark appearance and at accessibility text sizes.
- [ ] Test watch-term add/remove, clearing local data from Settings, reinstall, offline relaunch, and saved-record persistence.
- [ ] Verify word boundaries and visible evidence: `salmonella` does not match `salmon`; `code` does not match `cod`; phrase matching is case-insensitive; undeclared-allergen notices are not hidden by broad negation.
- [ ] Validate source dates, lots, codes, firms, distribution, unknown classifications, empty results, filters-before-pagination, unavailable sources, and the “no result does not mean safe” message.
- [ ] Verify VoiceOver order and labels, button shapes, contrast, Dynamic Type with no clipped controls, Reduce Motion, share sheet, FDA external links, and return from the external-browser donation page.
- [ ] Record build number, devices, OS versions, tester, date, failures, and evidence links. Do not mark the gate passed from simulator-only results.

For external testing, add complete beta review information and submit the first external build to TestFlight App Review. TestFlight builds expire after 90 days. See [TestFlight](https://developer.apple.com/testflight/) and [build statuses](https://developer.apple.com/help/app-store-connect/reference/app-uploads/app-build-statuses).
