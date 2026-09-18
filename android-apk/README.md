# Beanstalk Android sideload APK

This directory is the Capacitor Android project that packages the existing
Vite/PWA (`food-recall-app`) as a sideloadable APK. It is not the incomplete
native Compose sources in [`../android`](../android).

The APK is **debug-signed** with the Android debug keystore. Play Store upload
signing is not configured.

## Build

From the repository root, with Node 22 and a local Android SDK:

```bash
cd food-recall-app
npm ci
npm run build:android
cd ../android-apk
./gradlew assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

`npm run build:android` builds the SPA with `VITE_BASE=/` so WebView asset
URLs resolve at the origin root. GitHub Pages still uses the default
`/beanstalk/` base.

## Install on a phone

### adb (USB debugging)

1. On the phone: Settings → About phone → tap Build number seven times.
2. Settings → Developer options → enable USB debugging.
3. Connect the phone and authorize the computer.

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or install the CI artifact named `beanstalk-debug-apk` after downloading
`app-debug.apk`:

```bash
adb install -r app-debug.apk
```

### Files app (no computer)

1. Download `app-debug.apk` from the GitHub Actions artifact
   `beanstalk-debug-apk` on the `android sideload apk` job.
2. Open Settings → Apps → Special app access → Install unknown apps.
   Allow the app you will use to open the file (Files, Chrome, or Drive).
3. Open the downloaded APK and tap Install.

Debug builds are not Play-signed. Android will show a warning that the app
is from an unknown source. That is expected for this artifact.

## CI artifact

Every non-draft push and pull request runs `.github/workflows/ci.yml` job
`android sideload apk` and uploads `beanstalk-debug-apk`.
