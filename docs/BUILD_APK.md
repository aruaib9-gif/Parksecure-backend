# Building the Android APK

The Expo project in [mobile/](../mobile) is prebuilt to a native Android project
(`mobile/android/`) with **release signing already configured** using the keystore in
`mobile/credentials/parksecure-release.keystore`.

> ⚠️ **Back up the keystore.** The keystore and its passwords are required to publish updates
> to already-installed apps — lose them and existing installs can never be updated. Neither is
> tracked in git: the keystore is gitignored and the passwords live in the gitignored
> `mobile/android/keystore.properties` (or CI environment variables).
> See [mobile/credentials/README.md](../mobile/credentials/README.md).

## Prerequisites

- Node 20+ · JDK 17 · Android SDK (`ANDROID_HOME`, platform 36 + build-tools)

## 1. Point the app at your API

The API URL is supplied by [mobile/app.config.js](../mobile/app.config.js) from the
`PARKSECURE_API_URL` environment variable, falling back to
`https://parksecure-api.onrender.com`. Set it at build time:

```bash
export PARKSECURE_API_URL=https://parksecure-api-xxxx.onrender.com
```

Confirm what will be compiled in:

```bash
npx expo config --json | grep apiUrl
```

This is only the **default**. Users can point a released build at a different server from
the login screen ("Tap to change server"), which tests `/health` before saving the address
to the device keychain — so you do not need a new APK for every backend change.

> Release builds disallow plain HTTP (Android blocks cleartext by default), so the URL must
> be `https://`. For LAN testing against `http://192.168.x.x:4000`, use Expo Go or a debug
> build, which do permit cleartext.

## 2. Build

```bash
cd mobile
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# If you changed app.json/app.config.js (icons, package name, plugins), re-sync native:
npx expo prebuild --platform android --no-install

cd android
./gradlew assembleRelease
```

The signed APK lands at:

```
mobile/android/app/build/outputs/apk/release/app-release.apk
```

Install it directly on a device (`adb install app-release.apk`) or share the file.

## Play Store (optional)

Google Play requires an AAB rather than an APK:

```bash
./gradlew bundleRelease
# -> mobile/android/app/build/outputs/bundle/release/app-release.aab
```

## Version bumps

Increment `expo.android.versionCode` (integer, must always increase) and `expo.version`
in `mobile/app.json`, then re-run `npx expo prebuild --platform android --no-install` before building.

## APK size

The APK bundles native libraries for all four Android ABIs (~113 MB). To cut it to roughly a
quarter, either ship an AAB (Play Store splits per device automatically) or enable ABI splits
in `mobile/android/app/build.gradle`. Most real devices are `arm64-v8a`.

## Alternative: EAS cloud builds

If you prefer building in Expo's cloud (no local Android SDK needed):

```bash
cd mobile
eas build --platform android --profile production
```

(Requires a free Expo account and `eas login`; EAS manages its own signing credentials.)
