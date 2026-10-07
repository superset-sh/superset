# Local client packaging

The generic packaging modes build local desktop, CLI and iOS outputs using the
current upstream package commands. They do not install dependencies, publish artifacts,
upload to App Store Connect, change infrastructure or deploy a server. Versioned
releases still use the dedicated branch and [upstream runbook](../../scripts/release/README.md).

Use the checked-out `.bun-version` and lockfile. Install prerequisites separately.
Desktop native dependencies use its existing `bun run install:deps`; CLI native
prerequisites remain those documented by its upstream builder. Matching macOS
or Linux builders are required for desktop packaging. iOS needs macOS, Xcode
and the project's installed Expo executable. Signing identities remain operator
inputs in the existing environment/keychain. The launcher does not install keys.

Expo SDK 57 requires [Xcode 26.4 or newer](https://docs.expo.dev/versions/v57.0.0/#support-for-android-and-ios-versions)
for full iOS builds. The pinned ExpoModulesJSI dependency includes a backport of
[Expo's Swift 6.2 compatibility fix](https://github.com/expo/expo/pull/51040):
retained scheduler factories and Sendable pointer captures preserve the upstream
ownership contract. `bun test apps/mobile/expo-jsi-native.test.ts` checks genuine
Swift imports, copied-reference destruction with and without optimization, and
native scheduler dispatch under AddressSanitizer. This small fixture does not
replace a full iOS build or device acceptance.

```bash
bash scripts/build-desktop-selfhost.sh --env-file /absolute/public.env
bash scripts/package-desktop-selfhost.sh --env-file /absolute/public.env --mac --arm64
bash scripts/package-cli-selfhost.sh --env-file /absolute/public.env --target=darwin-arm64
bash scripts/package-cli-selfhost.sh --env-file /absolute/public.env --all
bash scripts/build-mobile-selfhost.sh --env-file /absolute/mobile.env --mode=config
bash scripts/build-mobile-selfhost.sh --env-file /absolute/mobile.env --mode=export --output-dir /absolute/new-export
bash scripts/build-mobile-selfhost.sh --env-file /absolute/mobile.env --mode=simulator --device SIMULATOR_ID
bash scripts/build-mobile-selfhost.sh --env-file /absolute/mobile.env --mode=device --device DEVICE_ID
```

CLI supports `darwin-arm64`, `darwin-x64`, `linux-arm64` and `linux-x64`;
repeat `--target` or use comma-separated targets. Its default is the builder's
native platform/architecture. Desktop supports `--mac`, `--linux`, `--arm64`,
`--x64` and explicit local `--unsigned`. The package command retains signing
discovery by default and always passes `--publish never`. Physical iOS builds
default to Release, simulators to Debug; `--configuration=Debug` or `Release`
selects explicitly.
Selected desktop architecture also reaches the bundled CLI/native build hooks
and the evidence record. Inapplicable or contradictory flags fail before dispatch.
The desktop after-pack module probe runs only when the target platform and
architecture match the builder. Foreign targets retain the package-file checks
and report `packaged-runtime-on-target` as pending acceptance. A universal macOS
package probes the builder's native slice and reports the other slice as pending;
both slices still need runtime acceptance on matching machines before publication.

Profiles contain public build inputs, parsed as dotenv data. They are never
sourced as shell scripts. Root `.env` stays untouched. The launcher passes
the absolute profile as `SUPERSET_BUILD_ENV_FILE` to the real desktop Vite,
bundled-CLI and Expo config entrypoints. Their existing dotenv precedence is
preserved: Vite/Expo override inherited values, bundled CLI does not. Unset or
empty selectors retain the original root `.env` fallback for direct commands.

Desktop profiles must explicitly set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`,
`NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`,
`NEXT_PUBLIC_DOWNLOAD_URL`, `RELAY_URL`, `REALTIME_URL`, `UPDATE_FEED_URL` and
`CLI_UPDATE_BASE_URL`. Optional CSP storage
origins are `SANDBOX_GATE_ORIGIN`, `R2_ENDPOINT`, `S3_PRESIGN_ENDPOINT` and
`S3_ENDPOINT`. CLI profiles require `SUPERSET_API_URL`, `SUPERSET_WEB_URL`,
`RELAY_URL` and explicit `CLI_UPDATE_BASE_URL`. The respective `NEXT_PUBLIC_`
API/web fields remain accepted fallbacks; optional `REALTIME_URL` also becomes
the CLI build default while preserving its runtime override. Conflicting explicit pairs fail before
dispatch. Desktop retains its existing mapping from `NEXT_PUBLIC_` API/web to
the bundled CLI. No feed suffix derives a CLI base. Existing runtime overrides and channel
refusal behavior stay intact.

Mobile profiles require `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`,
`EXPO_PUBLIC_RELAY_URL`, `EXPO_PUBLIC_REALTIME_URL`, `EXPO_PUBLIC_IOS_BUNDLE_ID`
and `APPLE_TEAM_ID`. Existing public provider, native identity, owned EAS,
signed OTA and Sentry config still applies. Owned OTA stays disabled unless
explicitly enabled through the existing config contract. Public profiles
accept the documented public prefixes/native settings; unsupported keys are
rejected. The accepted `MOBILE_` keys are exactly `MOBILE_SELF_HOST`,
`MOBILE_UPDATES_ENABLED`, `MOBILE_SIGNED_UPDATES`, `MOBILE_UPDATES_CERTIFICATE`
and `MOBILE_BUILD_NUMBER`. Existing nonsecret `SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_DSN_DESKTOP` and `SENTRY_DSN_HOST_SERVICE` are supported. Keep deployment
secrets and upload credentials outside these files.
URLs must use HTTPS/WSS without credentials, query strings, fragments or
loopback hosts; WSS is limited to relay/realtime inputs. API and update inputs
must agree on the existing upstream/owned deployment category. This validation
does not prove a service is deployed/reachable. Packaging children explicitly
blank `SENTRY_AUTH_TOKEN`, preventing ordinary dotenv loaders from refilling it,
so these launchers never upload source maps.

Before dispatch, the runner checks committed source coherence and invokes the
existing `scripts/release/check-versions.ts` once. Compile-only desktop mode
may record a dirty tree. It calls `clean:dev`, `generate:icons`, `compile:app`
and, for packaging, `package`; their upstream i18n and native hooks remain.
CLI calls `bun run build:dist`, preserving `prebuild:dist` and the upstream
runtime/native assembly. It requires host and chat migration directories,
adds `share/version.txt`, recreates the bare-root tarball and writes the updater's
`sha256sums.txt`/`version.txt`. Missing upstream chat migration packaging blocks
this step; adopt the upstream builder change rather than adding another assembler.

Each successful operation writes a small JSON record in ignored
`.cache/client-packaging/`, containing source revision/dirty status, version,
targets, public inputs, current Bun/Node versions and regular nonempty output
file sizes/SHA256 values. Desktop records compiled outputs and newly generated
or changed release-root package artifacts, excluding unchanged stale release
files and leaving normal app-framework symlinks to native acceptance. Digests
stream file bytes in bounded chunks. CLI
checks `--version` only on a matching native target; foreign runtime acceptance
remains pending. Mobile config verifies the actual generated native identity and
OTA state. Export mode checks the complete export file set for selected service
values and records all files. It requires an absent output directory.
CLI records its own package version, preserving upstream's permitted hotfix
lead over desktop. Mobile records the actual generated Expo application version
and the iOS target; the builder platform/architecture stays in toolchain metadata.

Every record has `acceptedForPublication: false`. These launchers provide local
orchestration and supporting byte/config checks. Desktop update YAML SHA512/size,
precise packaged app/resource closure, full baked origin/CSP checks, actual
backend/feed/update behavior, code signature, notarization and Gatekeeper still
need release acceptance. CLI still needs native addons/helpers, upstream smoke,
headless host/chat and mixed/bundled update controls on every required target.
Mobile still needs native entitlements/widget/signature, offline Release launch,
physical auth and TestFlight processing. Passing these source contract tests
does not establish those results. No publication follows automatically.

Server image deployment and database migrations are separate operations.
