# Google Play review notes and internal-testing gate

## Review notes

Replace every bracketed value before submission:

> Beanstalk is a free, accountless food-recall information app from JACOBRAKAI FOUNDATION. No login or access credential is required.
>
> The Recalls tab displays FDA-published food recall announcements. Historical Search is separately labeled and uses openFDA food enforcement records; it is not presented as a live recall-lifecycle feed. Every notice provides its dates and original FDA source.
>
> Beanstalk is not affiliated with, endorsed by, or representative of FDA or another government entity. Its official FDA source is https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/food-safety-recalls/rss.xml.
>
> To review notification consent, open Watchlist and add `salmonella`. Adding the first term shows an explanation and then the Android notification-permission prompt. Denial leaves all browsing and saving features available. The production service silently seeds existing notices and alerts only for a later, newly published matching announcement, so old or demo data cannot produce a review alert. [Attach a safe review procedure or a video of the physical-device test.]
>
> Settings → Remove this device from Beanstalk alerts deletes the server-side registration and watchlist and clears the app credential. Saved recalls remain local and can be removed from Saved.
>
> Settings → Donate to the Foundation opens https://jacobrakai.org/donate/ in the external browser. It is a tax-exempt donation, every feature remains free, and a donation provides no content, badge, recognition, or other benefit. Google Play Billing is not included.
>
> Beanstalk is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Users are reminded to consult a healthcare professional for medical advice, diagnosis, or treatment.
>
> Backend base URL: `[production HTTPS URL]`
> Review contact: `[private Play Console review contact]`

## Internal-test acceptance

- [ ] Install the Play-delivered build on a small phone and a large phone running supported Android versions, including Android 13 and Android 16.
- [ ] Complete all four tabs with TalkBack, large font and display scaling, light/dark theme, keyboard or switch access, and touch-target checks.
- [ ] On a physical phone, receive a newly published matching notification while the app is backgrounded and while it is stopped; tapping opens the correct notice and visible match evidence.
- [ ] Test permission denial, later enablement in Android Settings, missing or outdated Google Play services, FID refresh after reinstall/app-data clearing, authenticated rotation, opt-out, and device deletion.
- [ ] Verify `salmonella` does not match `salmon`, `code` does not match `cod`, phrases are case-insensitive, and undeclared-allergen matches are not hidden by broad negation.
- [ ] Verify initial history is silent; stale, archive, demo, annual-only, and duplicate records never alert; a feed gap pauses delivery until reconciliation.
- [ ] Verify source wording, lots/codes, publication/initiation/retrieval dates, unknown classifications, empty states, filters before pagination, unavailable sources, and the no-result safety warning.
- [ ] Relaunch offline and confirm saved records remain available with an outdated-copy warning. Verify return navigation after FDA, privacy, support, and donation browser links.
- [ ] Restore the notification database in a non-production rehearsal and confirm restored registrations are quarantined and unsent deliveries cannot replay.
- [ ] Record bundle version, Play test-track URL, devices, OS versions, tester, date, failures, and evidence links.

Do not mark this gate passed from an emulator, direct debug APK, Firebase console test alone, or locally signed bundle.
