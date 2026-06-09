# Desktop Performance And Packaging Optimization Implementation Plan

## Phase 1: Baseline And Instrumentation

- Add or update a desktop package-size report script.
- Run it locally against current `apps/desktop/dist`.
- Capture current release asset sizes from `desktop-canary`.
- Record current CI step durations from the latest run.
- Add the report command to developer docs or package scripts.

Validation:

- `bun run --cwd apps/desktop <size-report-command>`
- The output lists total size and top contributors without requiring a full
  release build.

## Phase 2: macOS Signing And Tester Installability

- Add a signing status check to the macOS build path:
  - signed/notarized when required secrets are present.
  - explicitly unsigned when secrets are missing.
- Update canary release body to show whether the macOS artifacts are signed.
- If no-cost internal fallback remains allowed, ad-hoc sign the app bundle and
  include the internal quarantine workaround in the release body:
  - `xattr -dr com.apple.quarantine /Applications/Superset.app`
- When signing secrets are available, verify downloaded Apple Silicon artifact
  opens without the macOS "damaged" warning.
- Consider failing shared/tester Canary builds when macOS signing secrets are
  absent, while allowing an explicit `unsigned_internal` workflow mode.

Validation:

- `gh secret list --repo TwitterIsGood/superset` shows signing secret names
  before expecting a signed build.
- CI macOS build logs show signed/notarized path instead of unsigned fallback.
- On an Apple Silicon machine, download the arm64 DMG from GitHub Releases,
  install it, and launch without quarantine workaround.

## Phase 3: Fast Canary Scope

- Update `.github/workflows/build-desktop.yml` so macOS arch matrix and Linux
  build can be configured by caller.
- Update `.github/workflows/release-desktop-canary.yml` so quick canary builds
  macOS arm64 only.
- Keep a manual full canary option.
- Ensure release aggregation works when Linux and x64 artifacts are absent.

Validation:

- `gh workflow run "Release Desktop Canary" --repo TwitterIsGood/superset --ref main -f force_build=true`
- Confirm quick Canary uploads macOS arm64 DMG/ZIP and mac update manifest.
- Confirm no release step assumes Linux or x64 artifacts are present.

## Phase 4: Low-Risk Size Reductions

- Make production sourcemap packaging opt-in or separate from shipped artifacts.
- Remove repeated CLI bundling from the CI packaging path if the same artifact is
  already produced during `compile:app`.
- Audit `runtime-dependencies.ts` copy filters for obvious dev/test/docs bloat.
- Keep native runtime validation after changes.

Validation:

- `bun run lint`
- `bun run typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run --cwd apps/desktop compile:app`
- `bun run --cwd apps/desktop copy:native-modules`
- `bun run --cwd apps/desktop validate:native-runtime`
- `bun run --cwd apps/desktop check:pty-daemon-bundle`

## Phase 5: Desktop Smoke

- Run desktop automation smoke on the resulting dev app or packaged app path.
- Confirm login, workspace open, Chat/Code/Tasks/Models still work at smoke
  level.

Validation:

- Existing desktop automation smoke command, using the E2E account/workspace
  conventions established earlier.

## Phase 6: Compare And Report

- Compare before/after:
  - Canary total runtime.
  - macOS arm64 build job runtime.
  - Release asset size.
  - Local `dist` size.
  - Sourcemap shipped size.
- Update `prd.md` acceptance items with measured results.
- Commit and push.

## Current Progress

- Phases 1 through 4 have a first implementation pass:
  - Package-size reporting exists and is wired into desktop package scripts.
  - Canary workflow supports quick macOS arm64-only builds and full builds.
  - macOS signing mode is explicit: `auto`, `required`, or
    `unsigned_internal`.
  - Release notes now distinguish signed/notarized builds from ad-hoc signed
    internal builds and include the quarantine-removal workaround for internal
    testing.
  - Production sourcemaps are opt-in; packaged `.map` and test/spec files are
    broadly excluded.
  - CLI bundling is no longer repeated in `prepackage` when the bundled CLI
    already exists.
- Local validation completed:
  - `bun run --cwd apps/desktop validate:native-runtime`
  - `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "ok #{f}" }' .github/workflows/build-desktop.yml .github/workflows/release-desktop-canary.yml .github/actions/merge-mac-manifests/action.yml`
  - `AD_HOC_MAC_CODE_SIGNING=true CSC_IDENTITY_AUTO_DISCOVERY=false TARGET_ARCH=arm64 bun run --cwd apps/desktop package -- --publish never --config electron-builder.canary.ts --arm64`
  - `bun run --cwd apps/desktop report:size --top=12`
  - `bun run lint`
  - `bun run --cwd apps/desktop typecheck`
- Remaining work:
  - Continue broader startup, page-open, CPU, and memory measurements.
  - Continue deeper package-size work on Electron runtime, bundled CLI, DuckDB,
    and node-pty/native runtime payload.
  - Address GitHub Actions Node 20 deprecation warnings before Node 24 becomes
    the default runner action runtime.

## Risks

- GitHub Actions matrix expressions can be finicky in reusable workflows.
- Electron builder may rely on `prepackage`; removing duplicated work must not
  bypass native module materialization.
- A canary that builds successfully can still be unusable to testers if it is
  unsigned/unnotarized and downloaded with macOS quarantine.
- Sourcemap removal may affect Sentry debugging unless upload/private artifact
  handling is preserved.
- Narrowing native module copies can break packaged-only behavior; validate with
  native runtime checks and desktop smoke.
