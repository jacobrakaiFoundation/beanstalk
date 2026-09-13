# Google Play Data safety working answers

## Submission posture

Answer from the signed Android App Bundle and deployed production system. Every Play app must complete Data safety and provide a privacy-policy URL, including apps on closed testing tracks. Search handling that qualifies as ephemeral still needs to be declared in the form.

## Data handled by the first release

| Google data type | Collection and use | Retention | Shared |
| --- | --- | --- | --- |
| App activity → In-app search history | A submitted Latest phrase goes to the Foundation service. A visibly labeled Historical phrase and its filters go directly to openFDA. Both are optional user actions used only to return results. Complete the form's ephemeral-processing questions because the Foundation does not store or log queries. Also assess Health info when a submitted phrase reveals an allergy or condition. | Foundation: request lifetime only. FDA: governed by FDA's policy. | Working answer: No. The Foundation is the first party; the direct openFDA transfer is a user-initiated, visibly labeled search. Confirm this against the live form. |
| User-generated content → Other user-generated content | Optional watch words and phrases are stored by the Foundation service for matching. A term may reveal an allergy or health concern, so answer the form's Health info questions from the submitted feature as well. Watch terms are never sent through FCM. | Until device deletion or inactive-registration cleanup; backups may persist up to 14 additional days. | No. Processed by the Foundation only. |
| Device or other IDs | Firebase Installations generates and sends Google an FID. The app sends that FID to the Foundation for targeted alerts. The Foundation also stores a random device registration ID and credential-verification hash for updates and deletion. | Foundation: active registration; inactive identifiers follow the privacy-policy cleanup schedule. Google: under Firebase's service terms. | Working answer: No. Google processes the FID as the notification service provider. |
| App info and performance → app/device configuration | FCM automatically collects the app version. FCM and Firebase Installations collect the Firebase user agent: OS version, device name, model, brand and form factor, installer, and Firebase SDK names and versions. Firebase says the user agent is not linked to a user or device identifier. | Google processes this under Firebase's service terms; the Foundation does not receive it. | Working answer: No. Google processes it as the Firebase service provider. |
| App info and performance → Diagnostics | The Foundation stores bounded delivery attempts, result codes, and timestamps to operate and troubleshoot notifications. No Crashlytics, Analytics, Performance Monitoring, or BigQuery delivery export is included. | Delivery rows are deleted within 30 days; backups may persist up to 14 additional days. | No. |

Every listed transfer follows an optional user action: submitting a search or enabling alerts. A user can browse the initial announcement list and save records without either. Data is used for **App functionality**; Firebase also uses its user agent to provide, maintain, and improve its service. No data is used by the Foundation for advertising, marketing, personalization, creditworthiness, or cross-app tracking. Network traffic is encrypted in transit. No account, name, email, contacts, precise location, advertising ID, photos, payment data, or Android health-platform data is requested.

Saved recalls remain in the app's local database and are not collected by the Foundation. Users can delete them in Saved. The Settings deletion action removes the server registration and watchlist and clears the local app credential.

## Firebase boundary

- Use Firebase Cloud Messaging and Firebase Installations only.
- Keep Firebase Analytics, Crashlytics, Performance Monitoring, Remote Config, In-App Messaging, AdMob, and BigQuery delivery export disabled and absent from the dependency graph.
- Enable FID registration with `firebase_messaging_installation_id_enabled=true` and upload refreshed FIDs from `onRegistered`.
- Do not log a FID, authorization header, client secret, watch term, or raw search URL.
- Declare the FID, FCM's automatic app-version collection, and the Firebase user agent described above. FCM receives only a generic title/body and public `noticeId` from Beanstalk; it does not receive watch terms or matched recall wording.
- Compare the exact Firebase SDK version in the signed bundle with Firebase's current disclosure immediately before submitting the final form.

## Verification before answering in Play Console

- [ ] Compare this table with the signed bundle's permissions and full dependency graph.
- [ ] Exercise search, registration, token/FID rotation, watchlist update, deletion, and opt-out while inspecting server and reverse-proxy logs.
- [ ] Confirm the public privacy page names Android, Firebase Installations/FCM, every retained field, deletion, and backup timing.
- [ ] Confirm the privacy URL is public, non-geofenced, HTML, and accessible from Settings.
- [ ] Save a dated export or screenshots of the submitted Data safety answers outside the repository.

[Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) · [Firebase Play disclosure](https://firebase.google.com/docs/android/play-data-disclosure)
