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

## Runtime Baseline Progress

- Added `apps/desktop/scripts/report-runtime-performance.ts`.
- Added package command:
  `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12`.
- The script:
  - Reuses `packages/desktop-mcp` `DesktopAutomation` directly instead of
    spawning one CLI process per action.
  - Captures current window URL/viewport, renderer navigation/resource/heap
    metadata, renderer console errors, route timings, and Superset process-tree
    CPU/memory samples.
  - Uses macOS `phys_footprint` through `@superset/macos-process-metrics` when
    available, falling back to RSS.
  - Writes markdown and JSON reports under
    `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/`
    by default.
  - Measures route changes with `window.__TSR_ROUTER__.navigate`, not the
    Desktop Automation CLI `navigate` command, because the CLI command reloads
    the page and measures a cold route-open path.
- Official baseline report:
  `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-00-02-930Z.md`.
- Official baseline JSON:
  `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-00-02-930Z.json`.
- Validation completed:
  - `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12 --route=/tasks --route=/settings/models --route=/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat`
  - `bun run lint:fix`
  - `bun run lint`
  - `bun run --cwd apps/desktop typecheck`
  - `bun run --cwd apps/desktop report:runtime -- --duration=0 --top=3 --markdown-out=.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke.md --json-out=.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke.json`
- Runtime baseline findings from the current dev app:
  - Workspace renderer JS heap is about 181 MB.
  - Electron renderer physical footprint is about 536 MB.
  - Electron main physical footprint is about 302 MB.
  - Host-service total physical footprint is about 460 MB across two
    processes.
  - Route timings, including 750 ms settle window, are about 0.84-0.98 seconds
    for Tasks, Models, and workspace Chat.
  - The local dev service graph dominates total memory and should be tracked
    separately from packaged app runtime: `electron-vite` about 2.3 GB,
    `workerd` about 3.7 GB, and `next-server` about 2.0 GB in this sample.

## Runtime Optimization Progress

- Startup/idle service changes:
  - `prewarmTerminalRuntime()` now prewarms only terminal environment data by
    default. Daemon connection/spawn is opt-in through
    `prewarmTerminalRuntime({ connectDaemon: true })`, so app startup no
    longer establishes terminal-host control/stream channels before the user
    opens a terminal.
  - `LocalWorkspaceRuntime` now injects the daemon backend factory into a
    lightweight `LocalTerminalRuntime`. Constructing the runtime, reading
    capabilities, or registering `terminalExit` listeners no longer creates the
    daemon backend.
  - `LocalTerminalRuntime` bridges EventEmitter listeners to the daemon only
    after the first real terminal operation, preserving existing terminal event
    behavior while avoiding eager backend setup.
  - `LocalHostServiceProvider` now starts host-service only for the active
    organization instead of starting one process for every organization in the
    synced organization list.
- Regression tests added:
  - `apps/desktop/src/main/lib/terminal/index.test.ts` verifies terminal
    prewarm does not connect the daemon by default and still supports explicit
    daemon prewarm.
  - `apps/desktop/src/main/lib/workspace-runtime/local.test.ts` verifies
    runtime construction/capability reads/listener registration do not create
    the daemon backend, and verifies backend event forwarding after first use.
  - `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/utils/getHostServiceOrganizationIdsToStart/getHostServiceOrganizationIdsToStart.test.ts`
    verifies only the active organization is selected for host-service startup,
    including the case where organization collection data is not ready yet.
- Post-change runtime report:
  `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-20-55-910Z.md`.
- Post-change runtime report JSON:
  `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-20-55-910Z.json`.
- Post-change desktop smoke:
  - Screenshot:
    `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-services.png`.
  - Report:
    `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-services.json`.
- Post-change idle report:
  `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-idle-after-lazy-services.md`.
- Post-change idle JSON:
  `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-idle-after-lazy-services.json`.
- Post-change findings from the running dev app:
  - Host-service dropped from about 460 MB across two processes to about
    210 MB in one active-organization process, a roughly 250 MB steady-state
    reduction for this account/session.
  - Idle CPU in the focused Code workspace was low after the change:
    renderer about 1.1% average, Electron main about 0.3%, and host-service
    about 0.5%.
  - Electron main remained about 302 MB, as expected; this pass did not target
    main-process heap/module loading yet.
  - Electron renderer was about 533 MB physical footprint and about 193 MB JS
    heap in the sampled Code/Models state. This was slightly higher than the
    earlier workspace-chat baseline and should be treated as state-dependent,
    not as a renderer improvement.
  - A pty-daemon process was already active from terminal work during the
    sample; it used about 14 MB and was not killed for measurement safety.
  - SPA route timings were effectively flat/noisy compared with baseline:
    `/tasks` about 1.08 s, `/settings/models` about 870 ms, workspace chat
    about 909 ms, all including the 750 ms settle window.
- Validation completed after the runtime optimization:
  - `bun test apps/desktop/src/main/lib/terminal/index.test.ts apps/desktop/src/main/lib/workspace-runtime/local.test.ts apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/utils/getHostServiceOrganizationIdsToStart/getHostServiceOrganizationIdsToStart.test.ts`
  - `bun run lint:fix`
  - `bun run lint`
  - `bun run --cwd apps/desktop typecheck`
  - `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12 --route=/tasks --route=/settings/models --route=/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat`
  - `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12 --markdown-out=.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-idle-after-lazy-services.md --json-out=.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-idle-after-lazy-services.json`
  - `bun run desktop:automation -- smoke --url-includes "#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87" --screenshot .trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-services.png --report .trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-services.json`

## Runtime Optimization Progress: Renderer Analytics And Startup Timeline

- Renderer analytics changes:
  - Replaced the eager `posthog-js/dist/module.full.no-external` import with a
    lightweight facade in `apps/desktop/src/renderer/lib/posthog.ts`.
  - Dynamic import now loads `posthog-js/dist/module.no-external` only when a
    real PostHog key is enabled.
  - The local disabled key `phc_local_dev_disabled` is treated as a no-op.
  - `PostHogProvider` no longer returns `null` while analytics initializes; the
    app renders immediately and analytics starts in the background.
  - Replaced direct `posthog-js/react` feature flag hooks with
    `apps/desktop/src/renderer/lib/posthog-feature-flags.ts`.
- Startup measurement changes:
  - Added `apps/desktop/src/shared/startup-performance.ts` for the IPC channel
    names and report types.
  - Added `apps/desktop/src/main/lib/startup-performance.ts` for main-process
    marks and timeline reporting.
  - Main process records Electron/app/window milestones and exposes them through
    `startup-performance:get`.
  - Renderer sends `renderer:boot-mounted` through preload IPC after the React
    root is mounted.
  - `apps/desktop/scripts/report-runtime-performance.ts` now captures and
    renders a Startup Timeline section.
- Regression tests added:
  - `apps/desktop/src/renderer/lib/posthog.test.ts` covers disabled analytics,
    queued facade operations, and local feature flag subscriptions.
  - `apps/desktop/src/main/lib/startup-performance.test.ts` covers timeline
    marks and adjacent durations.
- Production bundle validation:
  - `bun run --cwd apps/desktop compile:app` passed.
  - Production initial renderer `index-*.js` is now about 1.8 MB.
  - PostHog is split into lazy `module.no-external-*.js` of about 240 KB.
- Runtime artifacts:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-after-renderer-analytics-startup.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-routes-after-renderer-analytics-startup.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-final-startup-renderer-memory.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-renderer-analytics-startup.json`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-renderer-analytics-startup.png`
- Validation completed after renderer analytics/startup changes:
  - `bun test apps/desktop/src/renderer/lib/posthog.test.ts apps/desktop/src/main/lib/startup-performance.test.ts apps/desktop/src/renderer/lib/agent-session-orchestrator/agent-session-orchestrator.test.ts`
  - `bun run lint:fix`
  - `bun run lint`
  - `bun run --cwd apps/desktop typecheck`
  - `bun run --cwd apps/desktop compile:app`
  - `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12 --route=/tasks --route=/settings/models --route=/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat`
  - `bun run desktop:automation -- smoke --url-includes "#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87" --screenshot .trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-renderer-analytics-startup.png --report .trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-renderer-analytics-startup.json`
- Follow-up target:
  - Main-process import/evaluation is now visible as the largest measured cold
    start phase before `main:index-module-ready`. The next pass should inspect
    heavy main imports and move non-window-critical setup behind first show.

## Runtime Optimization Progress: Host-Service Chat/Mastra/AI Lazy Loading

- Host-service startup now avoids loading Chat/Mastra/Auth/model-gateway/AI
  naming code until the corresponding feature is used:
  - `packages/host-service/src/app.ts` exposes lazy `getAuth()` and `getChat()`
    accessors on `HostServiceRuntime`.
  - Chat and Auth routers now resolve those accessors inside each procedure
    instead of holding eager singleton instances.
  - `/model-gateway/*`, task draft generation, AI branch naming, and AI
    workspace naming/rename are dynamic imports.
  - `apps/desktop/src/main/host-service/index.ts` imports host-service runtime
    through narrow subpaths such as `@superset/host-service/app` and
    `@superset/host-service/providers/auth` instead of the root package
    barrel.
- Regression tests added:
  - `packages/host-service/src/app.lazy-runtime.test.ts`
  - `apps/desktop/src/main/host-service/index.test.ts`
- Production bundle evidence after `bun run --cwd apps/desktop compile:app`:
  - `dist/main/host-service.js` remains small at about 25 KB.
  - Chat/Auth/model-gateway/AI naming are split into separate chunks:
    `chat-service-*.js`, `gateway-*.js`, `ai-workspace-names-*.js`, and
    `ai-branch-name-*.js`.
  - The desktop host-service entry now loads the host-service app subpath chunk
    instead of the root `@superset/host-service` barrel chunk.
- Runtime reports:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-after-lazy-chat-ai.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-after-lazy-chat-ai-subpaths.md`
- Runtime findings from the running dev app:
  - Host-service measured about 192 MB after Chat/Mastra/AI lazy loading.
  - Host-service measured about 196 MB after the subpath import cleanup.
  - Compared with the previous 210-234 MB post-renderer/idle samples, this is
    a modest additional reduction rather than a new 100-200 MB reduction.
  - The earlier larger win remains the active-organization host-service change:
    about 460 MB across two processes down to one process around 200 MB.
  - The remaining 100 MB-class opportunity appears to require deeper
    host-service decomposition around all-router startup, GitWatcher,
    PullRequestRuntime, filesystem/native watcher initialization, or PR sync
    policy. That is higher-risk than this pass because it can affect Changes,
    PR freshness, event-bus behavior, and workspace state.
- Validation completed after this pass:
  - `bun test packages/host-service/src/app.lazy-runtime.test.ts apps/desktop/src/main/host-service/index.test.ts packages/host-service/test/integration/chat.integration.test.ts packages/host-service/test/integration/auth.integration.test.ts`
  - `bun run lint:fix`
  - `bun run lint`
  - `bun run --cwd packages/host-service typecheck`
  - `bun run --cwd apps/desktop typecheck`
  - `bun run --cwd apps/desktop compile:app`
  - `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12 --markdown-out=.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-after-lazy-chat-ai-subpaths.md --json-out=.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-after-lazy-chat-ai-subpaths.json`
  - `bun run desktop:automation -- smoke --url-includes "#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87" --screenshot .trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-chat-ai.png --report .trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-chat-ai.json`

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
