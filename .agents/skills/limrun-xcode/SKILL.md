---
name: limrun-xcode
description: "Build an iOS / Apple app on remote Xcode with `lim xcode build` instead of local xcodebuild, run project commands with `lim xcode run`, or run its XCTest suites with `lim xcode test`, from any environment (Linux, Windows, macOS, VM, container). Use for non-Bazel projects (an `.xcodeproj` / `.xcworkspace`, an XcodeGen `project.yml` with a gitignored project, React Native / Expo native build) when the user wants to build, compile, run code generation or Make targets, test, inspect build logs, reload, produce a preview build, or ship a signed device IPA. To run, tap, screenshot, or otherwise interact with the result on a simulator, use limrun-ios-simulator. For Bazel workspaces, use limrun-xcode-bazel."
user-invocable: true
effort: high
---

# Remote Xcode build

Build Apple projects on Limrun's remote Xcode, from any environment (Linux,
Windows, macOS, VM, container). `lim xcode build` syncs your sources to a remote
Xcode instance, builds there, and (when a simulator is attached) installs and
relaunches the app. This workflow builds on the remote instance; local Xcode, local simulators,
and local build tools are not part of it. A finished run has the app running
and verified on a Limrun simulator.

For driving the app once it's running (tap, type, element tree, screenshot,
record), use the **`limrun-ios-simulator`** skill. For Bazel workspaces, use
**`limrun-xcode-bazel`** instead of this skill.

## Auth and CLI

Install if needed: `npm install --global lim`. Auth is `lim login` or
`LIM_API_KEY` (it may already be set in the user's environment even when `.env` and the shell do not show it; check before asking for it). The CLI is the source of truth:
the commands in this skill are verified, but if a flag errors or you need one
not shown here, check `--help` instead of guessing:

```bash
lim xcode --help
lim xcode build --help
lim xcode run --help
```

## Build

Instead of `xcodebuild`, build with:

```bash
lim xcode build .
```

This creates or reuses the remembered Xcode target, syncs the current directory,
and streams the build logs through stdout and stderr.

Use `--scheme` and `--workspace` if the project has multiple schemes or uses a
workspace file:

```bash
lim xcode build . --scheme MyApp --workspace MyApp.xcworkspace
```

Use `--configuration Debug` or `--configuration Release` for a specific Xcode
configuration. If omitted, Limrun uses limbuild's project-type default: `Debug`
for native Xcode builds, `Release` for React Native / Expo builds.

```bash
lim xcode build . --configuration Debug
```

### Detached builds and logs

Use `--detach` to return once the build is accepted; a webhook is optional.
`logs` reads the latest build without an exec ID, including persisted logs after
instance deletion; add `--follow` to wait for completion.

```bash
lim xcode build . --detach
lim xcode logs
lim xcode logs --follow
```

### Pick the Xcode version

A sandbox builds with its node's default Xcode (26.4 today). The fleet carries
one released (GA) Xcode per major plus one beta while Apple seeds one: today
26.4 GA, 27.0 GA and 27.1 beta. Two selectors cover them:

- A bare major (`27`) binds the newest GA release of that major, never a beta,
  and follows Apple's point releases on its own. Use it for App Store builds.
- A major.minor (`27.1`) pins that exact version. This is how you pick a beta.

Set a preference once for the workspace; every later build, test, RBE session
and new sandbox follows it, and the flag overrides it for one command:

```bash
lim xcode version list      # Select is the value to type, Channel is ga or beta; * marks the one in use
lim xcode use xcode@27      # prefer the Xcode 27 GA for this workspace; switches the remembered sandbox now
lim xcode build .           # builds with 27
lim xcode version           # "27.0 (27A266a)" shows the sandbox's current Xcode
lim xcode version set 27.1  # pin the 27.1 beta instead
lim xcode build . --xcode-version 26   # one-off override, not remembered
lim xcode version unset     # forget the preference; the sandbox goes back to the node default
```

Combine Xcode and mise selections with `lim xcode use xcode@27 node@24`.

For scripting, `lim xcode version list --quiet` prints one selector per line
(`26`, `27`, `27.1`) and `--json` returns `{ installed, bound, preferred }`
(`installed[].channel` is `ga` or `beta`). The table marks the Xcode in use
with `*`. `lim xcode version set` does not record a version the node lacks (the
error lists the available ones) but keeps it when the sandbox is merely busy.

When the sandbox is on another Xcode than the workspace prefers, the next
build says so and switches it first. Switching invalidates the build cache made
with the other version (the next build starts cold) and is refused while a build,
sync or `lim xcode rbe` stack is running. With persistent disk snapshots
(`--snapshot-key`), use a separate key per Xcode lane, for example `myapp-27` and
`myapp-27.1`: archives are stored per key and a restore under a different Xcode
is wiped.

A major.minor pin lasts until the fleet retires that version; then
`lim xcode build` fails with the daemon's message and a hint to run
`lim xcode version set 27` or `lim xcode version unset`. When a beta becomes GA
it replaces the beta under the same major.minor selector (one cold build); the
bare major follows the newest released Xcode of its major, so it moves to 27.1
as soon as 27.1 is GA on the node.

App Store uploads from a beta Xcode are rejected by Apple, so keep
`--upload-to-appstore` on a bare-major pin (`27`, not `27.1`). Gate on
`channel`, not `betaSeed`: Apple's 27.1 seed ships without a seed number.

`--dev-server-url` is only supported with `--configuration Debug` for React
Native / Expo builds. It's a post-install launch URL: limbuild validates it is a
parseable absolute URL, then opens it unchanged after installing on the attached
simulator. Framework-specific skills construct the correct URL.

```bash
lim xcode build . --configuration Debug --dev-server-url '<absolute-url>'
```

If the app launches without using the expected URL, open it explicitly to
separate build/install issues from URL routing:

```bash
lim ios open-url --id <ios-instance-id> '<absolute-url>'
```

## Disk snapshots

Reuse source files, dependencies, and DerivedData across Xcode instances.

CLI **0.35.1 and earlier** use `--cache-*` instead of `--snapshot-*`, and
`--wait-cache` instead of `--wait-snapshot`. The snapshot rename preserves
the old flags as aliases.

From the project directory, create with a snapshot key, build, then delete:

```bash
XCODE_ID=$(lim xcode create --snapshot-key myapp-main --quiet)
lim xcode build . --id "$XCODE_ID" --scheme MyApp
lim xcode delete "$XCODE_ID" --wait-snapshot
```

The first run starts cold; later runs restore the saved snapshot. Termination
saves it after a successful build with no later sync, replacing the previous
snapshot under that key. `--wait-snapshot` waits for the save and reports its
result. In CI, run deletion in a cleanup step even if the build fails.

Leave `--snapshot-paths` unset to save the whole workspace. Keep the project
folder's name unchanged between runs. Use separate keys per project, Xcode
version, and concurrent CI job.

For branch fallbacks, add `--snapshot-restore-keys "myapp-pr51,myapp-main"`
at creation. Each entry tries an exact match, then the newest matching literal
prefix, before moving to the next entry. Without this flag, the save key is
also the restore key. Pass only restore keys to reuse a snapshot without saving.

Configure snapshots at creation. Restore keys and paths stay fixed.
On an existing instance, `build --snapshot-key` can only bind an unassigned
save key if snapshots were already enabled; it does not restore or enable them.

See the [disk snapshot guide](https://docs.limrun.com/docs/ios/snapshots) for skipped
saves, cold builds, and SDK usage.

## Developer tool versions

After syncing, `lim xcode use` selects tools in the sandbox and installs missing versions.
Run `lim xcode tools install` for synced project tool selections ([details](https://docs.limrun.com/docs/ios/build-with-xcode)). Use major versions, or major.minor for Ruby, Flutter, and pre-1.0 tools such as Mint.

```bash
lim xcode tools
# Node includes npm/npx, Ruby includes gem, Flutter includes Dart, CocoaPods includes cocoapods-patch.
lim xcode use node@24 pnpm@10 yarn@4 bun@1 ruby@3.3 bundler@4 cocoapods@1 \
  cmake@3 java@jetbrains-21 corretto@21 flutter@3.44 mint@0.18 \
  xcodegen@2 xcbeautify@3 zsign@1
lim xcode tools install
lim xcode use --cwd apps/mobile node@24
lim xcode tools install --cwd apps/mobile
lim xcode run -- mise use --pin node@24.5.0
```

## Run project commands

Use `lim xcode run [relative-cwd] -- <command>` when the repository needs a
remote macOS command before or outside `xcodebuild`. The CLI syncs the current
directory first. The working directory is relative to that synced root and
defaults to `.`:

```bash
lim xcode run -- make api
lim xcode run apps/api -- make generate
```

Pass environment variables before the delimiter. Use `--no-sync` only when the
same instance already has the source state you need:

```bash
lim xcode run --env API_ENV=development -- npm run generate
lim xcode run --no-sync -- make api
```

The sandbox includes Node, Ruby, CMake, Mint, mise, and Homebrew. Tool installs
made with mise, Mint, or Homebrew stay in the instance's sandbox home and
remain available on later commands on that instance:

```bash
lim xcode run -- 'mise trust && mise install'
lim xcode run -- 'mint install apollographql/apollo-ios-cli'
lim xcode run -- brew install tree
```

Commands are one-shot and non-interactive. There is no TTY or stdin channel.

## Generated Xcode projects (XcodeGen)

If the repo has a `project.yml` and the `.xcodeproj` is gitignored, do not run
xcodegen locally and do not treat the missing project as an error. The remote
sandbox generates the project from `project.yml` before building:

```bash
lim xcode build .
```

The spec is found at the repo root or one directory down (like `ios/`), no
flags needed. The project regenerates on every build, so `project.yml` edits
take effect by just rebuilding. A committed or force-synced `.xcodeproj`
always wins: the sandbox only generates when the sync didn't supply one.

If the repo's codegen produces gitignored inputs the build needs (a generated
local Swift package, config-derived sources), run that step locally first and
force-sync its output with `--include`:

```bash
make generate   # or whatever the repo's codegen step is
lim xcode build . --include '^ios/GeneratedKit/'
```

`--include` takes a regular expression like `--ignore`, not gitignore syntax.
To reach files under a directory that is ignored as a whole, the pattern must
also match the directory path itself, as above.

## Run on a simulator

`lim xcode build` is build-and-install. Don't attach a simulator until the user
needs to see or interact with the app. Check / attach:

```bash
lim xcode get             # is a simulator already attached?
lim ios create --attach   # attach one (installs the last build immediately)
```

Add `--no-open` when you have no browser to show the user; it skips opening
the stream URL locally and still prints it for sharing.

If the attach output includes a signed stream URL, share it with the user as a
Markdown link, such as `[Live simulator](<signed-stream-url>)`.

When a simulator is attached, every successful `lim xcode build` automatically
reinstalls and relaunches the app, no separate install step. To tap, type, read
the element tree, screenshot, or record, switch to **`limrun-ios-simulator`**.

## Run tests (XCTest)

`lim xcode test` builds the scheme's test targets on the sandbox, runs them on
an attached simulator (unit and UI targets alike), and streams one line per
test case. The exec exits non-zero when any test fails, so it works as a CI
gate.

```bash
lim xcode test .
lim xcode test ./MyProject --scheme MyApp
```

It auto-acquires a simulator-backed target like `lim xcode build --ios` and
reuses the instances on repeat runs, so iterating is fast. The scheme must
have a test action configured (shared schemes from Xcode have one when the
project has test targets). `--xcode-version 27` builds the tests with that
major's GA (`27.1` selects the beta); the simulator keeps the fleet default
runtime, so the run warns and proceeds (runtime-dependent failures are possible).

Select a subset with xcodebuild's identifier format
`Target[/Class[/method]]`; repeat the flag for multiple entries. The two flags
are mutually exclusive:

```bash
lim xcode test . --only-testing MyAppTests/LoginTests/testValidLogin
lim xcode test . --skip-testing MyAppUITests
```

A bare target name selects or skips that whole target. An `--only-testing`
entry naming a target the build did not produce fails the run instead of
silently running everything.

For machine consumption, `--json` streams the raw per-case events as NDJSON
and ends with a `{"exitCode": N}` record:

```bash
lim xcode test . --json > results.ndjson
```

`--build-only` compiles the test targets without acquiring a simulator; the
products stay on the sandbox for a later run.

If UI tests fail at the very first interaction on an instance that has run
many suites back to back, prefer fresh instances with
`--inactivity-timeout 30m` on the next run.

## Signed device builds (IPA)

Prefer Apple cloud signing when the user has an App Store Connect team API key.
Apple creates or reuses a cloud-managed certificate and provisioning profile,
so the user does not need to supply a p12 or `.mobileprovision`. The key ID,
issuer ID and `.p8` file are configured by the user on their own machine as
flags or environment variables; never ask for their values in the conversation:

```bash
lim xcode build . --sdk iphoneos --configuration Release \
  --signing-method release-testing --team-id "$APPLE_TEAM_ID" \
  --asc-key-id "$ASC_KEY_ID" --asc-issuer-id "$ASC_ISSUER_ID" \
  --asc-key AuthKey.p8 \
  --upload myapp.ipa
```

Signing methods:

- `debugging`: development-signed IPA for registered development devices.
- `release-testing`: distribution-signed IPA for registered test devices.
- `app-store-connect`: distribution-signed IPA for App Store Connect.

Cloud signing requires a device SDK (`--sdk iphoneos` or `--sdk watchos`), a
team API key with an issuer ID, and `--team-id` matching that key's Apple
Developer team. For distribution methods,
the API key must be an Admin key or have **Access to cloud-managed distribution
certificates** enabled. A `Cloud signing permission error` means that permission
is missing. `No Account for Team` means the team ID and API key do not match.
`Failed Registering Bundle Identifier` means the bundle ID belongs to another
team and cannot be registered automatically.

Cloud signing takes entitlements only from `--entitlements`, never from the
project's `.entitlements` file: the archive is unsigned and the export
preserves entitlements only from an existing code signature. Any app using
capabilities (HealthKit, CloudKit, app groups, push) MUST pass the flag or
the capability is silently stripped from the IPA. A bare path targets the
app; `<bundleId>=<path>` targets an embedded bundle (widget, watch app);
repeat per bundle:

```bash
lim xcode build . --sdk iphoneos --configuration Release \
  --signing-method release-testing --team-id VMBY3VYW4U \
  --asc-key-id 2X9R4HXF34 --asc-issuer-id "$ASC_ISSUER_ID" \
  --asc-key AuthKey.p8 \
  --entitlements ./MyApp/MyApp.entitlements \
  --entitlements com.example.myapp.widgets=./Widgets/Widgets.entitlements \
  --upload myapp.ipa
```

The plist values must be fully expanded (no `$(AppIdentifierPrefix)`; write
the concrete prefix), must omit export-managed keys (`application-identifier`,
`com.apple.developer.team-identifier`, `get-task-allow`,
`beta-reports-active`), and every capability must be enabled on the App ID in
the developer portal or the export fails naming it.

Manual signing remains available when the user already has a p12 and profiles:

```bash
lim xcode build . --sdk iphoneos --configuration Release \
  --certificate-p12 dist.p12 --certificate-password "$P12_PASSWORD" \
  --provisioning-profile app.mobileprovision \
  --upload myapp.ipa
```

The upload output includes a download URL for the signed IPA. A SUCCEEDED build
means the signature already passed Apple's verifier on the server, so don't
re-verify the IPA yourself unless the user asks. Invalid signing fails the
build loudly instead of producing a broken artifact.

If the app embeds extensions (WidgetKit widgets, share sheets, intents) or a
watch app, App Store signing needs one provisioning profile per bundle id, all
issued for the same distribution certificate. Repeat `--provisioning-profile`
once per bundle; each profile is matched to its bundle by the
application-identifier inside it, so order doesn't matter:

```bash
lim xcode build . --sdk iphoneos --configuration Release \
  --certificate-p12 dist.p12 --certificate-password "$P12_PASSWORD" \
  --provisioning-profile app.mobileprovision \
  --provisioning-profile widgets.mobileprovision \
  --upload myapp.ipa
```

With multiple profiles, every profile must carry an explicit (non-wildcard)
bundle id. A `signing preflight failed: no provisioning profile covers ...`
error names the embedded bundle that lacks a profile; ask the user for a
profile with exactly that bundle id.

Use a p12 that includes its full CA chain, not just the leaf certificate. If
needed, re-export it with the chain:

```bash
openssl pkcs12 -export -inkey dist.key -in dist.pem -certfile wwdr.pem -out dist-chain.p12
```

Failure strings to recognize in the build output:

- `Unknown issuer hash`: the p12 lacks its CA chain; re-export it with the
  chain as above.
- `code signature verification failed`: the platform's post-sign check rejected
  the artifact. Not a problem in the user's code; retry, and report it if it
  persists.
- p12 password errors: `--certificate-password` doesn't match the file; the
  user corrects the value on their machine.

## Upload to App Store Connect

To upload the signed IPA to App Store Connect for TestFlight or App Store
distribution, pass `--upload-to-appstore` with the App Store Connect API key
flags on a signed device build:

```bash
lim xcode build . --sdk iphoneos --configuration Release \
  --certificate-p12 dist.p12 --certificate-password "$P12_PASSWORD" \
  --provisioning-profile app.mobileprovision \
  --upload-to-appstore --asc-key-id "$ASC_KEY_ID" --asc-issuer-id "$ASC_ISSUER_ID" \
  --asc-key AuthKey.p8
```

Cloud signing can sign and upload with the same API key:

```bash
lim xcode build . --sdk iphoneos --configuration Release \
  --signing-method app-store-connect --team-id "$APPLE_TEAM_ID" \
  --asc-key-id "$ASC_KEY_ID" --asc-issuer-id "$ASC_ISSUER_ID" \
  --asc-key AuthKey.p8 \
  --upload-to-appstore --auto-build-number
```

`--upload-to-appstore` requires either cloud signing or the manual signing
flags, plus `--asc-key-id` and `--asc-key`. Combine it with `--upload
<asset-name>` when the user also wants the IPA in Asset Storage.

Device IPAs carry the app's symbols (`Symbols/` next to `Payload/`), so App
Store Connect symbolicates crash reports without a separate dSYM upload. This
needs the build to produce dSYMs: `--configuration Release` does by default;
Debug does not, and the IPA then simply ships without symbols.

The user provides these on their own machine, as flags or environment variables
the CLI reads locally; they are not pasted into the conversation. All three live
in App Store Connect under Users and Access, Integrations tab, App Store Connect
API:

- `--asc-key-id`: the Key ID next to their API key. If they don't have one,
  point them at Team Keys with the **Developer** role: the least-privileged
  role that can upload builds. Creating team keys needs an Admin account.
- `--asc-issuer-id`: the Issuer ID at the TOP of the Integrations page (a
  team value, not per-key). Cloud signing requires a team key and this flag.
  For manual signing plus upload, omit it for individual API keys.
- `--asc-key`: path to the downloaded `.p8` file. Apple keeps no copy and
  the download link disappears after leaving the page; if the user lost it,
  they must generate a new key. Never commit the `.p8` or paste its content
  into files; pass a filesystem path.

By default the build returns as soon as the upload commits and leaves Apple's
processing verdict to App Store Connect (processing routinely takes many
minutes). Pass `--asc-wait-timeout <seconds>` (max 1800) to watch for the
verdict before returning. Read the outcome from the final lines:

- `App Store Connect: upload accepted.`: done; the build appears in
  TestFlight once Apple finishes.
- `App Store Connect: uploaded, still processing on Apple's side (upload
  <id>).`: the exit code is 0 and the upload succeeded; Apple is still
  processing. Do NOT retry the build.
- `App Store Connect upload failed; the build and signing succeeded.`: exit
  code 1 with Apple's error text earlier in the log. Only the delivery
  failed.

Failure strings to recognize:

- Apple text about the bundle version being already used: bump
  `CFBundleVersion` (Expo: `expo.ios.buildNumber` in app.json) and rebuild.
- `HTTP 401`: key ID / issuer ID / .p8 mismatch, or a revoked key.
- `HTTP 403`: the key's role cannot upload builds; it needs the Developer role
  or higher.
- `no App Store Connect app with bundle id`: the app record doesn't exist;
  the user must create it in App Store Connect manually (the API cannot).
- Build later stuck at "Missing Compliance" in TestFlight: the app doesn't
  answer the export-compliance question at build time. Set
  `ITSAppUsesNonExemptEncryption` to `NO` in Info.plist (Expo:
  `expo.ios.config.usesNonExemptEncryption: false` in app.json) and rebuild.

For hands-off delivery to testers, the app's internal TestFlight group must
have automatic distribution enabled (create-only setting) and the compliance
key above must be set; then no post-upload steps exist at all.

## Preview builds

Only create a reusable preview asset when the user asks for a preview build or
when you're opening a PR. Build and upload:

```bash
ASSET_NAME="<bundle id / pr number / or any session identifier>.zip"
lim xcode build . --upload ${ASSET_NAME}
# Debug preview build:
lim xcode build . --configuration Debug --upload ${ASSET_NAME}
```

Build uploads default to a 14-day TTL: each build pushes the asset's expiry
to 14 days from that upload. Pass `--upload-ttl` with a Go duration (e.g.
`720h`; `1d` is invalid) to change it.

Then construct the preview link and include it in your last message (and in the
PR, if you're opening one):

```
https://console.limrun.com/preview?asset=${ASSET_NAME}&platform=ios
```

## Gotchas

- **Build errors are part of the job.** If a build fails, read the error output, fix the code, and rebuild before reporting back.
- **The embedded Xcode sandbox is gone.** The TypeScript SDK (0.54.0+) and
  `lim` (0.35.0+) no longer create an Xcode sandbox inside an iOS instance.
  Symptoms after an upgrade: `'sandbox' does not exist in type 'Spec'` on
  `iosInstances.create`, `Property 'sandbox' does not exist on type 'Status'`
  where code reads `status.sandbox.xcode.url`, or `Expected an Xcode instance
  (sandbox_...), got ios_...` from a `lim xcode` command. Create the Xcode
  sandbox on its own and attach the simulator: `lim ios create --xcode`, or
  `lim xcode create --attach --simulator-id <ios-instance-id>` for an existing
  simulator; in the SDK, `xcodeInstances.create` then `attachNewSimulator()` or
  `attachSimulator(iosInstance)` on its client. Pass the `sandbox_` ID to
  `lim xcode` commands and the `ios_` ID to `lim ios` commands. Details:
  https://docs.limrun.com/docs/ios/build-with-xcode#moving-off-the-embedded-xcode-sandbox
- **Instance ID for `lim ios` commands.** They resolve the current instance
  from the git worktree of your cwd and can fail with `No instance ID provided
  and no recent ios instance found`. Get the ID from `lim xcode get` and pass
  `--id <ios-instance-id>`; full recipe in limrun-ios-simulator's "Targeting
  the right instance" section.
- **Bundle ID discovery.** If you don't know the bundle ID, check the Xcode
  project files or run `lim ios list-apps` after a successful build.
- **Auth errors** on an authenticated command mean the session expired or
  `LIM_API_KEY` is wrong; `lim login` on the user's machine renews the session.
- **Build settings override Limrun's defaults.** `--build-setting KEY=VALUE`
  accepts any environment-style key and replaces the managed value with the
  same key. Device builds already use standard architectures (an embedded
  watch app keeps `arm64_32`) and disable coverage instrumentation, so App
  Store uploads need no extra settings.
- **Artifact not found after a successful build.** The server resolves the
  built .app on its own, including when the scheme name differs from the
  product name (scheme "MyApp Dev" building MyApp-dev.app). If an upload
  still fails with `built artifact not found`, pass the full bundle filename
  explicitly with `--artifact-name MyApp-dev.app` (including the .app
  extension); the server then takes that name from the build products
  verbatim.
- **Keep synced files small.** A single ~2MB+ file can fail the client-side
  sync with ENOMEM before the build starts; compress large assets.
- **Symlinks sync when relative and in-root.** A symlink whose target is an
  absolute path is skipped with a warning; recreate it with a relative target
  if the build needs it. A relative link escaping the synced folder fails the
  sync; `--ignore` it or sync from the repo root that contains the target.
- **Signing failures are loud and specific.** `Unknown issuer hash` means the
  p12 lacks its CA chain, so re-export it with the chain; `code signature
  verification failed` means the platform's post-sign check rejected the
  artifact, which is not a code problem, so retry or report it.
