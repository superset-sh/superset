---
name: limrun-expo-development
description: "Prepare and run Expo / React Native apps on Limrun with Expo dev-client iteration. Use when the user wants an Expo dev build, Metro tunnel, hot reload, JS/TS iteration without repeated native rebuilds, or to run/test an Expo app on a remote iOS simulator or Android emulator."
user-invocable: true
effort: high
---

# Developing Expo Apps on Limrun

Use this skill for Expo / React Native-specific setup and dev-client iteration, on iOS simulators and Android emulators. Use **limrun-ios-simulator** and **limrun-android-emulator** for command details, device interaction, screenshots, recordings, and cleanup, and the build skills (**limrun-xcode**, **limrun-gradle**) for build flag details and non-Expo workflows.

All builds and device operations must run on Limrun. Do not use local Xcode, local simulators, a local Android SDK, or local emulators; local `adb` is used only to talk to the remote emulator through the CLI's tunnel.

## Expo Readiness

Before changing Expo dependencies or app config, check the app's Expo SDK version and use the matching Expo versioned docs.

Verify this is an Expo app:

```bash
npx expo config --type introspect --json
```

Derive:

- `BUNDLE_ID` from `ios.bundleIdentifier` (iOS) and `PACKAGE` from `android.package` (Android). When `android.package` is missing, introspect reports a placeholder (like `com.placeholder.appid`) while the build generates a different real applicationId; set `android.package` in `app.json` before building so `$PACKAGE` matches the installed app.
- `SLUG` from `slug`
- `SCHEME` from `scheme`, falling back to `exp+${SLUG}`
- `BRANCH` from `git branch --show-current`, falling back to `main`
- `ASSET_NAME="${BUNDLE_ID}/${BRANCH}-debug.zip"` on iOS, `ASSET_NAME="${PACKAGE}/${BRANCH}-debug.apk"` on Android

## Ensure Dev Client

Expo development builds require `expo-dev-client`. If it is missing from `package.json`, add it:

```bash
npx expo install expo-dev-client
```

Installing `expo-dev-client`, adding/removing/updating native dependencies, or changing native app config means the uploaded Debug asset is stale. Build a fresh Debug app before starting the dev loop. A changed native dependency makes the uploaded Debug asset stale, so the rebuild comes before the dev loop.

## Debug Build Asset

First check whether a reusable Debug dev-client asset already exists:

```bash
lim asset list --name-prefix "$BUNDLE_ID/"   # iOS
lim asset list --name-prefix "$PACKAGE/"     # Android
```

Reuse the exact `$ASSET_NAME` only when:

- it exists, and
- no native dependency or native config changed in this session.

If the current task changed native dependencies or native config, skip asset reuse even if `$ASSET_NAME` exists.

When reusing the asset, create or reuse a device and install it:

```bash
lim ios create \
  --reuse-if-exists \
  --install-asset "$ASSET_NAME" \
  --label repo=<repo> \
  --label agent=<agent>

lim android create \
  --reuse-if-exists \
  --install-asset "$ASSET_NAME" \
  --no-open \
  --label repo=<repo> \
  --label agent=<agent>
```

Android note: keep the tunnel that `create` opens by default (do not pass
`--no-connect` here, unlike plain driving sessions); the Metro reverse
tunnel below runs over it. Note the instance ID from the output and pass
`--id` to every later `lim android` call: Metro and Expo run from the app
directory, and instance resolution is per git worktree, so commands run from
elsewhere will not find the instance on their own.

### Fresh build on Android

Build the Debug APK remotely and upload it as the asset (Expo prebuild,
`--expo-app-dir`, and other build flags belong to **limrun-gradle**; the
default `assembleDebug` task is the right dev-client build):

```bash
lim gradle build . --upload "$ASSET_NAME"
lim android create --reuse-if-exists --install-asset "$ASSET_NAME" --no-open --label repo=<repo> --label agent=<agent>
```

For a later native rebuild on a running emulator, rebuild with `--upload` and
install the new APK via the Download URL the build prints (the instance
fetches it server-side):

```bash
lim gradle build . --upload "$ASSET_NAME"
lim android install-app "<Download URL from the build output>" --id <android-instance-id>
```

### Fresh build on iOS

When building fresh, create or reuse a standalone Xcode sandbox and build
before creating a simulator, so the simulator doesn't sit idle (and hit its
inactivity timeout) during a long build:

```bash
lim xcode create --reuse-if-exists --label repo=<repo> --label agent=<agent>

lim xcode build . \
  --configuration Debug \
  --upload "$ASSET_NAME"
```

Run `lim xcode version set <major|major.minor>` once in the repo when the
project needs a specific Xcode (`27` for the Xcode 27 GA, `27.1` for the beta);
see `limrun-xcode` for the rules.

Use `--expo-app-dir`, `--scheme`, or `--workspace` when the project layout requires it.

Then create the simulator attached to that Xcode target; the attach installs
and launches the build immediately:

```bash
lim ios create --attach \
  --reuse-if-exists \
  --label repo=<repo> \
  --label agent=<agent>
```

Add `--no-open` to any `create` when you have no browser to show the user; it
skips opening the stream URL and leaves the URL in the output to share.

If an iOS simulator is already running from a reused asset and a later native rebuild becomes necessary, attach that same simulator instead of creating a second one:

```bash
lim xcode attach-simulator <ios-instance-id> --id <xcode-instance-id>
```

After the attach, every successful `lim xcode build` installs and launches the app on the attached simulator.

## Start Metro Through Limrun on iOS

This flow is for iOS. Android uses `adb reverse`; skip to **Start Metro on
Android** instead of running the `lim ios` commands.

Start one destination tunnel after the Debug app is installed. Metro can keep
its normal local port; Expo advertises localhost:

```bash
METRO_PORT=8081
lim ios tunnel \
  --selector "localhost:${METRO_PORT}" \
  --detach \
  --id <ios-instance-id>
TUNNEL_URL="http://localhost:${METRO_PORT}"
echo "TUNNEL_URL=$TUNNEL_URL"

EXPO_PACKAGER_PROXY_URL="$TUNNEL_URL" \
  npx expo start --dev-client --port "$METRO_PORT"
```

`EXPO_PACKAGER_PROXY_URL` keeps localhost and the declared port in manifests,
bundle URLs, and deep links. Set it inline so it takes precedence over project dotenv
values. Keep Metro and the detached tunnel running while the user iterates.
Run Metro as a managed background process, or copy the printed `TUNNEL_URL` into
a second terminal before launching the app.

If port 8081 is already occupied, choose another explicit port and use the same
value for the tunnel selector, `TUNNEL_URL`, and Expo's `--port`. Selector sets
are immutable: stop and recreate the tunnel with the complete selector list
when the port changes.

Only add `--offline` in a genuinely network-isolated environment after
dependencies are installed. Offline mode disables network checks and dependency
validation, so do not use it to compensate for ordinary Expo authentication.

### Launch the iOS dev client

Open the Debug app through the dev-client URL:

```bash
ENCODED_URL="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$TUNNEL_URL")"
DEV_CLIENT_URL="${SCHEME}://expo-development-client/?url=${ENCODED_URL}"
lim ios open-url --id <ios-instance-id> "$DEV_CLIENT_URL"
```

If opening fails and the primary scheme came from `scheme`, retry once with
`exp+${SLUG}`. On a fresh instance, the iOS dev-menu onboarding sheet can
consume the first deep link; tap through it and open the URL again.

For Expo Go, replace `--dev-client` with `--go`, then open:

```bash
lim ios open-url \
  --id <ios-instance-id> \
  "exp://${TUNNEL_URL#http://}"
```

Tunnel lifecycle:

```bash
lim ios tunnel status --id <ios-instance-id> --json
lim ios tunnel stop --id <ios-instance-id>
```

One instance accepts one active destination tunnel. Stop the current tunnel
before starting another route set. When iteration ends, stop Metro with
`Ctrl+C` and stop the detached tunnel with the command above.

If the simulator attempts a route while Metro is stopped, the tunnel remains
active and status records a correlated `connection_refused`. Restart Metro with
the same proxy URL and reopen the dev-client URL; do not recreate the simulator
or tunnel.

## Start Metro on Android

Android uses `adb reverse` over the CLI's ADB tunnel. Metro stays on its default
port 8081, no packager hostname override is needed, and the emulator reaches
Metro at `http://127.0.0.1:8081`:

```bash
lim android connect --id <android-instance-id>   # background shell; prints "Tunnel started on 127.0.0.1:<port>."
adb -s 127.0.0.1:<port> reverse tcp:8081 tcp:8081

npx expo start --dev-client --port 8081

DEV_CLIENT_URL="${SCHEME}://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
lim android open-url "$DEV_CLIENT_URL" --id <android-instance-id>
```

The ADB tunnel dies with the shell that started it, and the port changes on
every reconnect; re-run `adb reverse` with the new serial after any reconnect.
See **limrun-android-emulator** for tunnel details.

On the first launch, tap through the dev-menu onboarding sheet
(`lim android tap-element --text Continue`) and close the dev menu. The bundle
loads behind the native sheet.

## Fallback: Expo Tunnel

If the Limrun endpoint cannot be used, start Expo's public tunnel:

```bash
npm install --save-dev '@expo/ngrok@^4.1.0'
npx expo start --dev-client --tunnel
```

Use the complete dev-client URI Expo prints:

```bash
DEV_CLIENT_URL="<complete URI printed by Expo>"
lim ios open-url --id <ios-instance-id> "$DEV_CLIENT_URL"
lim android open-url "$DEV_CLIENT_URL" --id <android-instance-id>
```

## Legacy iOS fixed-port reverse tunnel

`lim ios reverse` remains available for workflows that already use the reserved
57090–57099 range. Expo dev-client can derive or advertise multiple packager
URLs, so mismatched mappings like `57090:8081` can leave some URLs pointing at
the local Metro port instead of the simulator-facing reverse endpoint.

Use the simulator-facing host printed by `lim ios reverse` in both `REACT_NATIVE_PACKAGER_HOSTNAME` and the encoded dev-client URL. Keep the reverse command running in a separate or background terminal while Metro is running:

```bash
lim ios reverse 57090:57090 --id <ios-instance-id>

REACT_NATIVE_PACKAGER_HOSTNAME=<reverse-host> \
  npx expo start --dev-client --host lan --port 57090

ENCODED_URL="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "http://<reverse-host>:57090")"
DEV_CLIENT_URL="${SCHEME}://expo-development-client/?url=${ENCODED_URL}"
lim ios open-url --id <ios-instance-id> "$DEV_CLIENT_URL"
```

## Verify

For quick static validation, prefer:

```bash
npx tsc --noEmit
```

Only run `npm run lint` or `npx expo lint` when the repo already has ESLint configured. Expo lint can create ESLint config and mutate dependencies in projects that have not configured linting yet.

On iOS, use the element tree first:

```bash
lim ios element-tree
```

Success means the app UI is visible or the Expo dev menu shows it is connected to the tunnel. On a fresh instance the first dev-client launch can land on the dev-menu onboarding sheet covering the launcher: tap through it (`lim ios tap-element --ax-label Continue`), then open the dev-client URL again, since the first deep link is consumed by the sheet. If the tree does not confirm the connection, inspect app logs:

```bash
lim ios app-log "$BUNDLE_ID" --tail 100
```

On Android, verify with screenshots, not the element tree: Expo apps
typically expose no accessibility nodes there, so a rendered screen and an
empty tree coexist (see **limrun-android-emulator**):

```bash
lim android screenshot check.png --id <android-instance-id>
```

To see why the app died (crash, ANR), relaunch it watched; the command blocks
while the app runs (run it in a background shell) and prints the exit reason,
stack trace, and a recent app log tail when the app dies:

```bash
lim android launch-app "$PACKAGE" --mode RelaunchIfRunning --id <android-instance-id>
```

## Iterating

Once connected, JS/TS edits should update through Metro without another native build. If the task changes native dependencies, native config, or build settings, rebuild Debug before relaunching the dev loop.

Tell the user:

- device stream as a short Markdown link, for example `[Open simulator stream](<signedStreamUrl>)` or `[Open emulator stream](<signedStreamUrl>)`
- uploaded Debug asset name
- that JS/TS changes can now iterate through Metro
- that native changes require a new Debug build

## Final Preview

For a final shareable preview or PR demo, use a Release build so the user does not need Metro running:

```bash
ASSET_NAME="<bundle-id>/<pr-or-session>.zip"
lim xcode build . --configuration Release --upload "$ASSET_NAME"

ASSET_NAME="<package>/<pr-or-session>.apk"
lim gradle build . --task assembleRelease --upload "$ASSET_NAME"
```

Preview URL (`platform=android` for APK assets):

```text
https://console.limrun.com/preview?asset=${ASSET_NAME}&platform=ios
```

## Gotchas

- `npx expo start --dev-client` requires `expo-dev-client`; without it Expo cannot determine the development-build scheme.
- `No script URL provided` usually means the app is not a dev-client build or was launched without a dev-client URL.
- After a fresh native rebuild/install, a stale Metro/runtime error like `Cannot find native module` may come from the old app process. Relaunch the dev-client URL and verify with `element-tree` before assuming the rebuild failed.
- If a Debug build after adding a native dependency still behaves like the old native graph, that is unexpected Limrun behavior. Retry the build; creating a fresh build/device target is only a troubleshooting fallback.
- Expo tunnel startup can be flaky. Retry before changing the workflow.
- Do not reuse uploaded Debug assets after native dependency or native config changes.
- On Android, pass `--id <android-instance-id>` to every `lim android` call in this loop: instance resolution is per git worktree and the loop's commands run from mixed directories.
- An empty Android element tree while the screenshot shows the app is normal for Expo apps; verify by screenshot.
