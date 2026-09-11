# Release signing keystore

`parksecure-release.keystore` signs the production APK.

> **Back up this file and its passwords somewhere safe.** If you lose them you cannot ship
> an update to anyone who already installed the app — Android requires every update to be
> signed by the same key, and there is no recovery path.

## Where the credentials live

Neither the keystore nor its passwords are tracked in git:

| What | Where | Tracked? |
|---|---|---|
| Keystore file | `credentials/parksecure-release.keystore` | No — `.gitignore` |
| Passwords / alias | `android/keystore.properties` | No — `.gitignore` |

`android/app/build.gradle` resolves each value from, in order: an environment variable, then
`android/keystore.properties`, then a gradle property. If none is found it falls back to the
**debug** keystore so a fresh clone still builds — always confirm the signer before releasing:

```bash
$ANDROID_HOME/build-tools/36.1.0/apksigner verify --print-certs app-release.apk
# expect: CN=ParkSecure, OU=Mobile, O=ParkSecure, L=Lagos, C=NG
```

## Setting up on a new machine

Restore the keystore to `credentials/`, then recreate `android/keystore.properties`:

```properties
PARKSECURE_UPLOAD_STORE_FILE=../../credentials/parksecure-release.keystore
PARKSECURE_UPLOAD_KEY_ALIAS=parksecure
PARKSECURE_UPLOAD_STORE_PASSWORD=<password>
PARKSECURE_UPLOAD_KEY_PASSWORD=<password>
```

## CI

Export the same four names as environment variables (from your CI secret store) and commit
nothing — the environment takes precedence over the properties file.
