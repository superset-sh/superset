# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after source edits.
- Run `bun run lint` and focused tests before pushing.
- Run `bun run typecheck` for shared type, router, schema, or package export changes.
- Use focused unit tests for schemas, routers, and helpers that branch on user or runtime state.
- When backend/main-process changes affect desktop startup, auth persistence, host-service coordination, terminal/runtime processes, or route availability, include the relevant Desktop Automation CLI acceptance path from `.trellis/spec/guides/desktop-acceptance-tdd.md` or document why it is not required.

## Review Checklist

- Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.
- Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.
- Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.
- Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.
- Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.
- Tests should sit next to risky behavior: `.test.ts` for unit tests, `.node-test.ts` for real Node/PTY flows, integration tests for cross-layer contracts.
- Desktop Automation CLI acceptance assertions should be deterministic first and visual second: logs, route state, IPC/service readiness, files, visible roles/labels, and `wait-for` checks are gates; screenshots/reports are evidence for human or model visual inspection.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`

## Desktop Packaging And Canary Signing

### 1. Scope / Trigger

- Trigger: changes to Electron packaging, Desktop Canary GitHub Actions,
  macOS signing/notarization, package-size optimization, bundled CLI packaging,
  or native runtime validation.
- Goal: avoid producing a macOS artifact that builds successfully but fails for
  downloaded Apple Silicon users with a Gatekeeper "damaged app/package" style
  error.

### 2. Signatures

- Reusable workflow:
  `.github/workflows/build-desktop.yml`
  - `build_macos: boolean`
  - `macos_arches_json: string` JSON array, for example `["arm64"]`
  - `build_linux: boolean`
  - `mac_signing: "auto" | "required" | "unsigned_internal"`
- Canary workflow:
  `.github/workflows/release-desktop-canary.yml`
  - `build_scope: "quick" | "full"`
  - `mac_signing: "auto" | "required" | "unsigned_internal"`
- Desktop package scripts:
  - `bun run --cwd apps/desktop report:size --top=<n>`
  - `bun run --cwd apps/desktop ensure:cli`
  - `bun run --cwd apps/desktop validate:native-runtime`

### 3. Contracts

- `mac_signing=auto`: sign and notarize when all macOS signing secrets are
  present; otherwise build an ad-hoc signed internal artifact without
  notarization.
- `mac_signing=required`: fail the macOS build if any signing/notarization
  secret is missing.
- `mac_signing=unsigned_internal`: always skip Developer ID
  signing/notarization, even if secrets are configured, but still ad-hoc sign
  the `.app` bundle with `identity: "-"` so Apple Silicon can launch it after
  quarantine removal.
- Required signing secrets for normal tester-ready macOS downloads:
  `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`,
  `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID`.
- Non-notarized macOS artifacts are internal-only. Release notes must say they
  are ad-hoc signed, not Developer ID notarized, and include the
  quarantine-removal workaround:
  `xattr -dr com.apple.quarantine /Applications/Superset\ Canary.app`.
- Native runtime validation must not require production sourcemaps. Sourcemap
  scans are extra evidence; JS output scans and native package presence checks
  remain mandatory when sourcemaps are disabled for package-size reasons.

### 4. Validation & Error Matrix

- `mac_signing=required` + missing secret -> fail before packaging upload with
  a clear GitHub Actions error listing required secrets.
- `mac_signing=auto` + missing secrets -> warning plus ad-hoc signed internal
  release notes; do not describe the artifact as normal tester-installable.
- `mac_signing=unsigned_internal` + secrets present -> warning plus ad-hoc
  signed package without notarization; this mode must not accidentally use
  Developer ID credentials.
- `mac_signing=unsigned_internal` + `codesign --verify --deep --strict` fails
  with `code has no resources but signature indicates they must be present` ->
  build is invalid; ensure the workflow exports `AD_HOC_MAC_CODE_SIGNING=true`,
  not `SKIP_MAC_CODE_SIGNING=true`.
- No `dist/main/index.js.map` -> native validation warns and skips sourcemap
  origin checks, then still scans `dist/main/**/*.js`.
- Missing native binding in packaged app -> fail the packaging workflow before
  artifact upload.

### 5. Good/Base/Bad Cases

- Good: quick canary builds macOS arm64 only, reports package size, verifies
  native bindings, and either Developer ID signs/notarizes or ad-hoc signs the
  internal bundle and labels it as non-notarized.
- Base: no signing secrets exist, but the app bundle passes
  `codesign --verify --deep --strict`, and the release body clearly states
  ad-hoc/internal status with quarantine instructions.
- Bad: CI uploads a macOS artifact whose `.app` fails
  `codesign --verify --deep --strict`, even if the release notes say it is for
  internal testing.
- Bad: package-size optimization disables sourcemaps and breaks
  `validate:native-runtime` even though JS output checks could still run.

### 6. Tests Required

- Parse changed workflow YAML:
  `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "ok #{f}" }' .github/workflows/build-desktop.yml .github/workflows/release-desktop-canary.yml .github/actions/merge-mac-manifests/action.yml`
- Run desktop package validation:
  `bun run --cwd apps/desktop validate:native-runtime`.
- For macOS packaging changes, run at least one local ad-hoc signed arm64
  package build:
  `AD_HOC_MAC_CODE_SIGNING=true CSC_IDENTITY_AUTO_DISCOVERY=false TARGET_ARCH=arm64 bun run --cwd apps/desktop package -- --publish never --config electron-builder.canary.ts --arm64`.
- Verify the packaged app signature:
  `codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac-arm64/Superset\ Canary.app`.
- Run size reporting after compile/package:
  `bun run --cwd apps/desktop report:size --top=12`.
- Run repo quality gates before commit:
  `bun run lint`, `bun run --cwd apps/desktop typecheck`, and
  `bun run typecheck` when package/workflow scripts or shared types changed.

### 7. Wrong vs Correct

#### Wrong

```yaml
run: |
  if [[ -n "${MAC_CERTIFICATE:-}" ]]; then
    echo "signed"
  else
    echo "building unsigned"
  fi
```

#### Correct

```yaml
run: |
  if [[ "$MAC_SIGNING_MODE" == "unsigned_internal" ]]; then
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    export AD_HOC_MAC_CODE_SIGNING=true
  elif [[ -n "${MAC_CERTIFICATE:-}" && -n "${MAC_CERTIFICATE_PASSWORD:-}" && -n "${MAC_APPLE_ID:-}" && -n "${MAC_APPLE_ID_PASSWORD:-}" && -n "${MAC_APPLE_TEAM_ID:-}" ]]; then
    export CSC_LINK="$MAC_CERTIFICATE"
    export CSC_KEY_PASSWORD="$MAC_CERTIFICATE_PASSWORD"
  elif [[ "$MAC_SIGNING_MODE" == "required" ]]; then
    exit 1
  else
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    export AD_HOC_MAC_CODE_SIGNING=true
  fi
```
