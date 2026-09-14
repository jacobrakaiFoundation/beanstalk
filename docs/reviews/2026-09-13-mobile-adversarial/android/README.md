# Android adversarial probes

Read-only reproduction against compiled application classes at commit f22a003. No application source or test files changed.

Run:

```sh
python3 docs/reviews/2026-09-13-mobile-adversarial/android/run-probes.py
```

Requires existing Android debug compilation outputs and cached dependencies. Compilation of this probe occurs in a temporary directory outside the repository.

The first probe actually suspends WatchlistSyncEngine at the upload continuation, removes the final local term while that request is in flight, and resumes it. The next sync acknowledges success without uploading the new empty list.

The second probe calls the actual NotificationDetailStateReducer in the completion order permitted by BeanstalkViewModel.openNotificationTarget: tap A, tap B, B completes, A completes. It confirms the late A result overwrites B. This does not simulate the full Android Activity or network stack; the absence of a generation/cancellation guard in the calling ViewModel makes that completion ordering possible.

No physical device, emulator, live FCM delivery, or runtime configuration-change test was performed. Separate source-control-flow findings should not be described as device reproductions.
