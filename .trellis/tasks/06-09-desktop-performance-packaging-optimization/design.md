# Desktop Performance And Packaging Optimization Design

## Scope

First milestone: reduce Desktop Canary feedback-loop time and package size.
Runtime startup/page/CPU/memory optimization remains part of the parent
performance task, but this first milestone focuses on the measurable CI and
artifact-size bottlenecks.

## Architecture Boundaries

- GitHub Actions:
  - `.github/workflows/release-desktop-canary.yml`
  - `.github/workflows/build-desktop.yml`
- Desktop build configuration:
  - `apps/desktop/package.json`
  - `apps/desktop/electron.vite.config.ts`
  - `apps/desktop/electron-builder.ts`
  - `apps/desktop/electron-builder.canary.ts`
  - `apps/desktop/runtime-dependencies.ts`
  - `apps/desktop/scripts/*`
- Verification surfaces:
  - Existing desktop typecheck, lint, native runtime validation, pty-daemon
    bundle validation, and desktop automation smoke.

## Current Bottlenecks

- The current canary runs three platform jobs in parallel, but the overall run is
  limited by the slowest job plus release aggregation.
- The slowest job in the latest run was macOS x64 at about 23 minutes.
- The largest step in macOS jobs is `Build Electron app`, dominated by packaging,
  compression, and large app bundle contents.
- Artifacts are 500 MB+ each, so package size affects:
  - Electron builder time.
  - Artifact upload/download time.
  - Release creation time.
  - User download/update time.
  - Local app disk footprint.
- Local `dist` contains production sourcemaps and a 63 MB bundled CLI.
- The workflow likely repeats CLI bundling because `compile:app` bundles the CLI,
  then `prepackage` runs before `electron-builder package`.
- Current macOS Canary artifacts are unsigned when signing secrets are missing.
  This keeps CI green but creates a Gatekeeper failure for normal downloaded
  testing: macOS can present the app/DMG as "damaged" on Apple Silicon because
  the downloaded artifact is quarantined and not Developer ID signed/notarized.

## Proposed First-Milestone Design

### 1. Fast Canary Targeting

Add configurable build targets to the reusable desktop build workflow.

- Default/full behavior should preserve current platform coverage.
- Desktop Canary should use macOS arm64 only by default.
- A manual full-canary path should remain available for broader artifact checks.

Possible workflow shape:

- `build-desktop.yml` adds inputs:
  - `build_macos`
  - `macos_arches_json`
  - `build_linux`
- `release-desktop-canary.yml` adds `build_scope` workflow_dispatch input:
  - `quick`: macOS arm64 only.
  - `full`: macOS arm64/x64 + Linux x64.
- Scheduled canary can use `quick` initially unless the user later wants a daily
  full canary.

### 2. macOS Signing And Notarization Gate

Separate "build succeeded" from "tester-installable artifact".

- If Developer ID signing/notarization secrets are configured:
  - Sign and notarize macOS Canary.
  - Verify signature/notarization status in CI where possible.
  - Release notes should show signed/notarized status.
- If secrets are missing:
  - Continue allowing an ad-hoc signed internal artifact only if explicitly
    permitted.
  - Mark the release body as ad-hoc signed and non-notarized.
  - Include temporary internal workaround:
    `xattr -dr com.apple.quarantine /Applications/Superset.app`
  - Prefer not to present unsigned artifacts as normal tester-ready downloads.

Required GitHub secrets:

- `MAC_CERTIFICATE`
- `MAC_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `APPLE_TEAM_ID`

The certificate should be a Developer ID Application certificate exported as a
base64-encoded p12 for electron-builder `CSC_LINK`.

### 3. Package Size Baseline

Add a script that reports package-size contributors after `compile:app` and/or
after `electron-builder` output exists.

Minimum report:

- `dist` total size.
- Largest `dist` files.
- Sourcemap total size.
- Bundled CLI size.
- Resources size.
- Native module copy candidates from `runtime-dependencies.ts`.
- Release artifact sizes when `release/` exists.

The report should be usable locally and in CI.

### 4. Low-Risk Size Reductions

Start with changes that do not alter runtime behavior:

- Do not ship production sourcemaps inside packaged app by default.
- Preserve sourcemaps for debugging through separate artifacts or Sentry upload
  if configured.
- Avoid repeated CLI bundling in the packaging pipeline.
- Audit whether broad native module copy filters can be narrowed safely.
- Avoid copying dev-only/test/docs files from native/runtime modules when not
  needed.

### 5. Guardrails

Add non-blocking first, then optionally blocking thresholds:

- CI summary of package-size report.
- CI summary of build step timings.
- Later threshold examples:
  - Canary arm64 DMG size must not grow by more than a configured budget.
  - `dist` sourcemap files must not be included in packaged artifacts unless a
    debug flag is enabled.

## Compatibility

- Do not change full/stable release platform support.
- Do not remove update manifests.
- Do not remove the bundled CLI in this milestone.
- Do not remove native runtime modules until each has a usage proof and
  acceptance test.
- Do not publish unsigned macOS artifacts as if they were normal installable
  tester builds.

## Rollback Strategy

- Fast Canary targeting can be reverted by switching workflow inputs back to full
  platform coverage.
- Signing/notarization changes can be rolled back by removing required-signing
  enforcement and returning to explicit ad-hoc signed internal releases.
- Sourcemap packaging changes should be gated by env/config so debug builds can
  re-enable sourcemaps.
- Native module copy narrowing must be small and individually testable.
