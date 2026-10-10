---
name: mobile-eas-dev
description: Launch and iterate on apps/mobile from a cloud sandbox (no local Xcode or simulator) on an EAS cloud iOS simulator. Use when asked to run, start, open, or show the mobile app from a cloud workspace, or to verify a mobile change there. On a machine with real Xcode, use mobile-sim-verification instead.
---

# Mobile on a cloud sandbox (EAS Simulator)

A cloud sandbox is Linux: no `xcrun`, no `simctl`. `apps/mobile/scripts/eas-dev.sh` is the one command
that gets the real dev-client app running on an EAS cloud iOS simulator, connected to this sandbox's
own Metro and API. Run it:

```bash
apps/mobile/scripts/eas-dev.sh
```

It reuses this checkout's running session when there is one. Otherwise it installs the finished
simulator build whose native fingerprint matches this checkout and starts a session, about two minutes.
It builds only when no such build exists (the first time, or after a native change), about fifteen
minutes. Pass `--new` to stop the running session and start a fresh one. `apps/mobile/AGENTS.md`'s
"Verifying in the real app" section records why the script does each step.

The session is tagged with the workspace id. The desktop Mobile pane lists the workspace's tagged
sessions, so the person can watch the simulator there without a link. The script also prints an
`expo.dev/simulator-preview/...` URL for a browser.

## Driving the simulator

Load the session and call `agent-device` directly:

```bash
cd apps/mobile && set -a && . ./.env.eas-simulator && set +a
agent-device snapshot -i                        # what is on screen, with @refs
agent-device press 'label="Continue"' --settle  # acts, waits, prints what changed
agent-device fill @e16 "hello" --settle
agent-device screenshot /tmp/screen.png
agent-device help                               # the rest
```

- `agent-device` keeps one session per working directory. Run it from `apps/mobile` every time.
- Through `eas simulator:exec npx agent-device` each command takes about 25 s. Install it globally
  (`npm install -g agent-device`) when it is missing.
- The dev-menu sheet covers the first screen on a fresh install: press `Continue`, then `Close`.
- Source edits reach the app through fast refresh in about two seconds.

## Limits

- The script forwards the relay and realtime ports but starts neither service, so host and workspace
  presence show as unreachable. That is fine for auth and UI checks.
- The session stops by itself after 15 idle minutes (`MOBILE_EAS_IDLE_MINUTES`). Stop it sooner with
  `eas simulator:stop` from `apps/mobile`.
- The Expo account runs two builds at a time; a build can wait in the queue behind the team's.

Needs `EXPO_TOKEN` and this repo's `.env` (`.superset/setup.sh` or `.superset/setup.cloud.sh`).
