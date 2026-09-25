---
name: mobile-demo-record
description: Run apps/mobile on the iOS simulator against the local stack, drive it with Maestro, and capture clean screen recordings. Use when asked to record, film, screenshot, or demo the mobile app, or to verify a mobile change in the real app.
---

# Recording the mobile app

There is no CDP for mobile. The equivalent is the iOS simulator, booted headless, driven by
Maestro, recorded with `simctl`. Nothing here opens a window on the user's display.

## Rules

1. **Real app state only.** Record real sessions, real pull requests, real pages. No mockups,
   no DOM-style fakery. Seed the data the story needs, then delete it.
2. **No real data in frame.** Use the dev account (`admin@local.test`) and a demo org with demo
   projects. Read every frame of the contact sheet for names, emails, repo names, and tokens
   before sharing anything.
3. **One take per story.** A host that has connected once is no longer "never connected", a
   read page is no longer unread. Reset or reseed state before each take.
4. **Report what you recorded against**: worktree, API port, simulator UDID, app build date.

## Stack

Start each in its own Superset terminal
(`superset terminals create --local --workspace $SUPERSET_WORKSPACE_ID --command "..."`;
without `--local` the call silently returns nothing). Ports come from `.superset/ports.json`
and the root `.env`.

| Service | Command | Trap |
| --- | --- | --- |
| API | `cd apps/api && bun run dev` | A 500 "password authentication failed" means the worktree's Neon branch was cleaned up. Recreate it and rewrite the "# Workspace Database" lines in `.env`. |
| Relay | `cd apps/relay && while true; do CI=1 WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler dev --port $RELAY_PORT --var NEXT_PUBLIC_API_URL:http://localhost:$API_PORT --local; done` | wrangler dev dies with an empty error whenever a client aborts mid-request, which every app relaunch does. Hence the loop. |
| Metro | `cd apps/mobile && CI=1 bunx expo start --dev-client --port 8081` | `CI=1` disables file watching: restart Metro after code edits. Pre-warm the first bundle by curling the `launchAsset.url` from `curl -H 'expo-platform: ios' localhost:8081`, or the dev client times out. |

`apps/mobile/app.config.ts` loads the repo-root `.env` with `override: true`, so every local
bundle points at this workspace's API no matter what `apps/mobile/.env` says.

## Simulator

```bash
U=$(xcrun simctl list devices available | grep -m1 "iPhone 17 Pro (" | grep -oE '[0-9A-F-]{36}')
xcrun simctl boot $U && xcrun simctl bootstatus $U -b
xcrun simctl ui $U appearance light
xcrun simctl status_bar $U override --time "9:41" --batteryState discharging \
  --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi
xcrun simctl spawn $U defaults write sh.superset.mobile EXDevMenuIsOnboardingFinished -bool YES
xcrun simctl openurl $U "superset://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

- `simctl boot` does not launch Simulator.app. Keep it that way.
- The status bar override resets on shutdown. Reapply it after every boot.
- No dev client installed, or it crashes on launch after a native dependency change? Rebuild:
  From `apps/mobile` (`cd apps/mobile` from the repo root), run
  `bunx expo prebuild -p ios`, then `xcodebuild -workspace ios/Superset.xcworkspace -scheme
  Superset -configuration Debug -sdk iphonesimulator -derivedDataPath <scratch>/dd`
  (about 10 minutes), then `xcrun simctl install $U <path to Superset.app>`. Set
  `SENTRY_DISABLE_AUTO_UPLOAD=true`. Never set `CODE_SIGNING_ALLOWED=NO`: it drops the keychain
  entitlement and the app crashes on first SecureStore read. Pure JS changes need no rebuild.

## Driving

Maestro needs `JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home`. Flows
live in `apps/mobile/.maestro/flows/`. Sign in with `tapOn: { id: dev-sign-in-button }`.

- Write one flow per story. Prefer `tapOn` by visible text, add a `testID` when text is
  ambiguous. `inputText` types character by character, which reads as a person typing on film.
- Maestro takes 7 to 25 seconds to start. Launch it before you start recording, and begin the
  flow with a `waitForAnimationToEnd` or a short `extendedWaitUntil` so the take opens on a
  settled screen.
- The dev session has `plan: null`, so Home shows the paywall. Seed a `subscriptions` row on
  the worktree's Neon branch (plan `pro`, `reference_id` = the org id,
  `stripe_subscription_id` `sub_temp_...`) and delete it after.
- Need a host without a second machine? `POST /api/trpc/host.ensure` with the session JWT
  registers one, and holding `ws://localhost:$RELAY_PORT/v2/control?hostId=<org>:<machineId>`
  open with `Authorization: Bearer <jwt>` marks it online. Delete the `v2_users_hosts` and
  `v2_hosts` rows after. For a story with a real agent working, point the app at a real local
  host-service instead.

- Maestro matches the whole accessibility label, and rows carry extra text (the Settings row is
  `, Pages, `). Match with a regex: `tapOn: ".*Pages.*"`. Dump what it sees with
  `maestro --udid $U hierarchy`.
- Metro fails with `ENOENT ... react-native-worklets/.worklets/<n>.js`? Its cache outlived the
  generated files. Restart it with `--clear`.

## Pages in the app

Pages need three more things locally, none of which setup provides:

- **Object storage.** The API writes page files to `R2_ENDPOINT` (`localhost:9000`, nothing
  listens there) while the usercontent Worker reads its own local R2. Run a minimal S3 stand-in
  on :9000 (PUT with `x-amz-copy-source`, GET, HEAD, `POST ?delete`), publish through
  `page.assets.upload` then `page.publish`, then copy every stored object across with
  `bunx wrangler r2 object put superset-private-dev/<key> --local --env dev --file <f>
  --content-type <type>` from `apps/usercontent`.
- **The Worker's secret.** `apps/usercontent/.dev.vars` needs `USERCONTENT_TOKEN_SECRET` set to
  the value in the root `.env`, or every page answers 500. Start it with
  `cd apps/usercontent && bun run dev`.
- **Transport security.** The dev build allows local networking only, and
  `<id>.frame.usercontent.localhost` does not count, so the page fails with error -1022. On the
  simulator's installed copy only:
  `PlistBuddy -c "Set :NSAppTransportSecurity:NSAllowsArbitraryLoads true" -c "Add
  :NSAppTransportSecurity:NSAllowsArbitraryLoadsInWebContent bool true" "$(xcrun simctl
  get_app_container $U sh.superset.mobile app)/Info.plist"`, then relaunch. Revert it after.

tRPC calls from a script need `authorization: Bearer <jwt>` plus
`x-superset-organization-id`, because the JWT carries no active organization. Tap to comment
did not open the comment popover under Maestro on the simulator (2026-09-19, cause unknown);
film comments through "Show all comments" and Reply instead.

## Capturing

Run capture commands from a scratch directory. Use an absolute path to the Maestro flow
when recording outside the repo.

```bash
mkdir -p raw shots cfr
xcrun simctl io $U recordVideo --codec h264 --force raw/01-story.mov & REC=$!
maestro test <repo>/apps/mobile/.maestro/flows/<story>.yml
kill -INT $REC; wait $REC
xcrun simctl io $U screenshot shots/01.png
```

- Stop with `SIGINT` only. Any other signal leaves an unplayable file.
- `recordVideo` writes a frame only when the screen changes, so the file is variable frame
  rate and wall-clock marks do not map to video time. Normalize before choosing cut points:
  `ffmpeg -i raw/01-story.mov -vf fps=30 -an -c:v libx264 -crf 14 -pix_fmt yuv420p cfr/01.mp4`.
- A screenshot after a `sleep` never catches a sub-second flash. Record, then extract frames
  with `ffmpeg -vf fps=10`.
- Before changing simulator variants, record the existing appearance, content size, and
  `AppleLanguages` value (including whether it was unset) so cleanup can restore them.
- Variants: `simctl ui $U appearance dark`, `simctl ui $U content_size extra-extra-extra-large`,
  and `simctl spawn $U defaults write "Apple Global Domain" AppleLanguages -array de-DE`
  followed by a relaunch.

For a framed demo video, use the shared `mobile-demo-film` skill after recording.

## Cleanup

Delete only the rows and objects created for this recording: subscriptions, hosts, demo
sessions, and, for Pages, published pages, comments, and their objects in the S3 stand-in and
local R2. Restore any organization or user names changed for the demo.

Stop every service started for the recording, including the usercontent Worker and storage
stand-in when used. Restore the simulator's prior appearance, content size, and
`AppleLanguages` value (remove the override if it was originally unset), revert any installed
app transport-security changes, clear status-bar overrides, then `xcrun simctl shutdown $U`.
Recordings and screenshots stay in the scratch directory unless the user asks for them in
the repo.
