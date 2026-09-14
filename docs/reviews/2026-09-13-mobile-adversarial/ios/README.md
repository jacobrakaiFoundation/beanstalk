# iOS adversarial review probes — 2026-09-13

These are isolated local reproductions. They do not contact production, change app data, use APNs credentials, or edit either app checkout.

## Source verification

- PR #142: `e4c590e86717de181e049c348925e6024a8fa3a4`
- PR #144: `f22a0032aec14a1f8d1ca5b5e1a75c38de7991d3`
- Every file listed in `source-provenance.json` matches both heads exactly.
- The complete `ios/` trees of both PR heads are identical (`git diff <PR142-head> <PR144-head> -- ios` is empty).
- Checksums and per-file comparisons are in `source-provenance.json`.

## Date probe

`beanstalk-ios-date-probe.swift` copies the complete `SourceDateFormatter` implementation verbatim from `ios/Core/Sources/BeanstalkCore/OpenFDA.swift` and adds a harness that sets the default timezone to America/Los_Angeles. The output demonstrates the calendar-day shift for FDA date-only values. The third input deliberately does not match either supported format and is preserved verbatim.

```sh
cd docs/reviews/2026-09-13-mobile-adversarial/ios
swift beanstalk-ios-date-probe.swift
```

Actual output from a successful run is preserved in `date-output.txt`.

## Registration probe

`beanstalk-ios-registration-probe.swift` includes the app's actual `NotificationRegistrationService` method bodies and the verbatim core `SerializedAsyncQueue`, `WatchMatcher`, and `AlertControlPolicy` implementations. To compile on macOS, it replaces UIKit/UserNotifications/DeviceAPI boundaries with deterministic test doubles, removes the notification-observer initializer, and points `deviceAPI` to the shared test double. Combine is real. No service method under test is rewritten.

The first scenario fails an offline DELETE, recovers network connectivity, constructs a new notification service, and synchronizes. The DELETE count remains one, credentials remain stored, and the app changes its status to alerts not active.

The second scenario holds an earlier authorization response, executes a later opt-out, and resumes authorization as granted. Local enabled intent changes from false to true and registration is requested. This proves the unsafe asynchronous ordering in the service; a physical-device UI timing window was not measured.

```sh
cd docs/reviews/2026-09-13-mobile-adversarial/ios
swiftc -parse-as-library beanstalk-ios-registration-probe.swift -o /tmp/beanstalk-ios-registration-probe
/tmp/beanstalk-ios-registration-probe
```

Successful compiler output is preserved in `registration-compile-output.txt` (empty means no diagnostics). Actual execution output is preserved in `registration-output.txt`.
