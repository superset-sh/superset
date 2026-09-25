---
name: mobile-sim-verification
description: Verify apps/mobile behavior end-to-end on the iOS simulator against a local API and relay, with Maestro for input and a stand-in host instead of a second machine. Use when asked to verify, reproduce, screenshot, or edge-test a mobile change in the real app rather than in tests.
---

# Mobile Simulator Verification

The mobile counterpart to `cdp-verification`. There is no CDP on a phone: input goes through
Maestro, evidence comes from `simctl` screenshots and recordings, and state comes from the real local
API and relay. "Rules" is what counts as valid evidence. "Mechanics" is how to get there.
`apps/mobile/scripts/e2e/host-states.sh` is a working example.

## Rules

1. **Use the real screen.** Sign in and reach the screen the way a user does. A temporary preview
   route that mounts one component with fixed props is diagnostic support, and must be reported as
   such. It hides the header, the data hooks, loading states and navigation.

2. **Drive state through real services.** Change what the app sees by changing the local API or
   relay (register a host, open or close its socket), not by seeding the query cache.

3. **Run the edge pass before reporting "tested".** The main path is not the test. At minimum:
   cold start, a dependency down (relay or API stopped), recovery when it returns, app backgrounded
   and resumed, rapid state flapping, a very long name, one long-string locale (German) and one CJK
   locale, and the largest text size. Say which you ran and which you did not.

4. **Never show "unknown" as a negative.** A query that is pending or failed has not said "offline",
   "empty" or "none". Check what the screen paints in both states; this is the most common mobile
   bug found by this process.

5. **Catch flashes with a recording.** A screenshot taken after a `sleep` cannot show a state that
   lasts half a second. Record the launch and diff the frames.

6. **Attribute failures correctly.** Before reporting that a check is red on main, confirm it in CI.
   A fresh worktree's mobile typecheck shows errors in unrelated packages that CI does not.

## Mechanics

### Services

Start each in a Superset terminal so it outlives the tool call. `--local` is required; without it
the command returns nothing.

```bash
superset terminals create --local --workspace "$SUPERSET_WORKSPACE_ID" --command "<cmd>"
```

- **API:** `cd apps/api && bun run dev`. A 500 with `password authentication failed` means this
  worktree's Neon branch was deleted by the daily cleanup. Recreate it as `.superset/lib/setup/steps.sh`
  does and rewrite the three lines under `# Workspace Database` in `.env`.
- **Relay:** run it in a loop. `wrangler dev` exits with an empty `✘ [ERROR]` when a client aborts a
  request, which every app relaunch does. Durable Object state survives the restart.
  ```bash
  cd apps/relay && while true; do CI=1 WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler dev \
    --port "$RELAY_PORT" --var NEXT_PUBLIC_API_URL:http://localhost:$API_PORT --local; sleep 1; done
  ```
- **Metro:** `cd apps/mobile && CI=1 bunx expo start --dev-client --port 8081`. `CI=1` turns off file
  watching, so restart Metro after editing code. The first bundle after a dependency change takes
  minutes and the dev client gives up waiting: warm it first by fetching `launchAsset.url` from
  `curl -H 'expo-platform: ios' localhost:8081`.

### App

- A dev-client build must be installed on the simulator. Reuse one from DerivedData only if native
  dependencies have not changed since; otherwise `bunx expo prebuild -p ios`, then `xcodebuild
  -workspace ios/Superset.xcworkspace -scheme Superset -configuration Debug -sdk iphonesimulator
  -derivedDataPath <scratch>` and `xcrun simctl install`. JavaScript-only changes need no rebuild.
  `ios/` is gitignored.
- Silence the first-run developer menu:
  `xcrun simctl spawn booted defaults write sh.superset.mobile EXDevMenuIsOnboardingFinished -bool YES`.
- Sign in: `maestro test apps/mobile/.maestro/flows/sign-in.yml`
  (`JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home`).
- The dev account has no plan, so Home shows the paywall. Give its org a temporary one on this
  worktree's Neon branch, and delete the row afterwards. Confirm `DATABASE_URL_UNPOOLED` is the
  workspace branch first.
  ```sql
  insert into subscriptions (id, plan, reference_id, status, stripe_subscription_id, period_start, period_end, seats)
  values (gen_random_uuid(), 'pro', '<org id>', 'active', 'sub_temp_mobile_e2e', now(), now() + interval '2 days', 1);
  ```

### Hosts without a second machine

`apps/mobile/scripts/e2e/stand-in-host.ts` registers a host through `host.ensure`, holds the relay
control socket open to make it online, reads its presence, and deletes it through `host.delete`. It
refuses to run against a non-local API. While online it receives the app's `stream:dial` tickets and
answers none, so lists behind that host keep loading.

### Evidence

```bash
xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100
xcrun simctl io booted screenshot shot.png
xcrun simctl io booted recordVideo --codec h264 launch.mov   # stop with SIGINT
ffmpeg -i launch.mov -vf fps=10 frames/f%03d.png
xcrun simctl spawn booted defaults write "Apple Global Domain" AppleLanguages -array de-DE   # then relaunch
xcrun simctl ui booted content_size extra-extra-extra-large
```

Count requests in the relay log to prove polling behavior (for example none while backgrounded).
Reset the locale, text size and status bar, stop the services, and delete test hosts and the
temporary plan when done.
