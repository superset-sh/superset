---
name: limrun-maestro-testing
description: "Run Maestro YAML flows against a Limrun cloud iOS simulator with `lim ios maestro`, from any environment (Linux, Windows, macOS, VM, container). Use when the user wants to run, write, or debug Maestro flows or `maestro test` on iOS, migrate an existing Maestro suite to remote simulators, or asks for UI testing with Maestro. iOS simulators only today. For Detox suites use limrun-detox-testing; for driving the simulator without a test framework use limrun-ios-simulator."
user-invocable: true
---

# Maestro on Limrun iOS

Run the stock upstream Maestro CLI against a remote Limrun iOS simulator.
`lim ios maestro` wires `maestro test` to the instance transparently: it
installs and launches the Maestro XCTest runner on the simulator when needed,
then routes the driver traffic to it. No fork of Maestro, no local simulator,
no local Xcode.

## Prerequisites

- `lim` CLI 0.22.0 or newer: `npm install --global lim`. Auth is `lim login` or
  `LIM_API_KEY` (it may already be set in the user's environment even when `.env` and the shell do not show it; check before asking for it).
- Maestro CLI on PATH: `curl -fsSL https://get.maestro.mobile.dev | bash`.
  Maestro needs Java 17+ (`java -version` to check). Both Maestro 2.5.x and
  2.6+ work; `lim` adapts to the installed version automatically.

The CLI is the source of truth: if a flag errors or you need one not shown
here, check `lim ios <subcommand> --help` instead of guessing.

## Verify the setup

Before touching the user's app, prove the whole pipeline with a flow against
the built-in Settings app; it needs no app install, tunnel, or build:

```bash
ID=$(lim ios create --install-asset appstore/maestro-ios-runner-2.5.1.tar.gz \
  --no-open --quiet --json | jq -r .metadata.id)

cat > hello-flow.yaml <<'EOF'
appId: com.apple.Preferences
---
- launchApp
- assertVisible: General
- takeScreenshot: settings-check
EOF

lim ios maestro --id "$ID" test hello-flow.yaml
```

All three steps reporting `COMPLETED` means Maestro, the runner, and the
remote wiring all work; anything failing after this point is about the app or
the flow, not the setup.

## Run a flow

```bash
lim ios maestro test flow.yaml
lim ios maestro test flows/
lim ios maestro --id <ios-id> test flow.yaml
```

Without `--id` this targets the most recently created iOS instance in the
current workspace (workspaces follow the git repo or worktree you run from);
pass `--id <ios-id>` (before `test`) in scripts, agents, or when running from
a different directory. The first run on an instance takes a few extra seconds
to launch the runner (plus the install when it wasn't preinstalled); later
runs skip that. Extra Maestro flags go after
`--`:

```bash
lim ios maestro -- test flow.yaml --include-tags smoke --test-output-dir artifacts
```

Do not pass `--platform`, `--device`, `--udid`, `--no-reinstall-driver`, or
`--driver-host-port`; `lim` sets those itself and rejects duplicates.
Real Maestro exit codes and reports are preserved, so CI wiring works as with
local Maestro.

## Instance setup

Any running iOS instance works; the runner is installed on first use. Creating
the instance with the runner preinstalled skips that step:

```bash
lim ios create --install-asset appstore/maestro-ios-runner-2.5.1.tar.gz --no-open
```

`--no-open` skips opening the stream URL in a browser (important on headless
and CI machines). The runner asset name above is the only published one and it
is version-agnostic: the same runner serves Maestro 2.5.x through 2.7.x, so do
not look for an asset matching your Maestro version.

Install the app under test as usual (`lim ios create --install app.ipa`,
`lim ios install-app`, or a build skill), then reference its bundle id via
`appId:` in the flow. For Expo Go testing, also preinstall
`appstore/Expo-Go-54.0.6.tar.gz` and open the project URL with `openLink`
(env vars must be prefixed `MAESTRO_` to be visible in flows):

```bash
MAESTRO_EXPO_URL='exp://<tunnel-host>' lim ios maestro test flow.yaml
```

## Expo dev-client builds

Expo Go is the quickest path, but a dev-client build works too. `launchApp`
lands on the dev launcher rather than your app, so open the dev-client URL
instead: `- stopApp` followed by
`- openLink: <scheme>://expo-development-client/?url=<url-encoded-metro-url>`.
Use `limrun-expo-development` for building the dev client, starting Metro, and
deriving that URL.

## Flow gotchas on Limrun

- `startRecording`/`stopRecording` YAML commands are not supported (the
  simulator is remote). Record around the run instead: `lim ios record start
  --id <ios-id>` returns immediately (recording happens on the instance), and
  after the flow `lim ios record stop --id <ios-id> -o video.mp4` downloads
  the video to the local path.
- `takeScreenshot` works and saves the PNG locally into the working
  directory (or `--test-output-dir`), like stock Maestro.
- `addMedia` and flow commands that reference local simulator file paths are
  not supported.
- HTTP calls from `runScript`/`evalScript` must use `https://` URLs. Plain
  `http://` calls are refused (except to the driver itself), because Maestro's
  plain-HTTP traffic is routed through a local bridge that only forwards to
  the remote simulator.
- When a flow re-runs against an app that is already open (for example Expo
  Go), start it with `- stopApp` before `openLink`/`launchApp`; deep links
  can be dropped by an app that is mid-foreground, and stale screens fail
  early assertions.
- Fleet variance: anchor assertions on stable accessibility identifiers and
  text, not on timing. Use `extendedWaitUntil` with a generous timeout for
  first app load.
- Text selectors match the element's accessibility label, and on iOS a label
  often folds in sibling content (icon names, adjacent text) or non-breaking
  spaces. Read the exact label with `lim ios element-tree` before writing the
  selector instead of guessing from what the screen shows.

## Validation signals

- `Running maestro <version> against <ios-id>...` then
  `Running on Limrun iPhone - iOS ...`: the driver is connected end to end.
- `Launching the Maestro runner...`: first use on this instance.
  `Installing the Maestro runner...` additionally appears only when the
  instance was created without the runner asset. Subsequent runs skip both.
- Maestro itself prints several JDK `WARNING` lines (reflection, native
  access) on every run; they are benign upstream noise, not Limrun errors.
- Flow failures print Maestro's own debug output directory with screenshots
  and the UI hierarchy; `lim ios element-tree --id <ios-id>` shows the live
  screen when debugging selectors.

## Cleanup

Delete the instance when done: `lim ios delete <ios-id>` (`--id` is not valid
for delete). The wiring `lim ios maestro` starts is torn down when the command
exits.
