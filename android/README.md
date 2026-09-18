# Native Android app

Compose sources for the Beanstalk recall client (`applicationId`
`org.jacobrakaifoundation.beanstalk`). This is the project #144 started. The
sideloadable web-wrap APK lives in [`../android-apk`](../android-apk) and is
what CI uploads as `beanstalk-debug-apk`.

Play upload signing uses `ANDROID_UPLOAD_*` environment variables when present.
`assembleDebug` uses the Android debug keystore.

```bash
cd android
./gradlew :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.
