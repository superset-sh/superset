# Desktop Performance And Packaging Optimization

## Goal

Make the Superset desktop app feel fast and stay fast as the product grows.
This task covers measurable improvements to package size, cold start, route
open latency, runtime CPU/memory, and GitHub Actions packaging speed.

The user explicitly called this "software fundamentals": if the app gets slower,
larger, or more CPU-heavy as features are added, users will leave. Optimization
work should therefore create both immediate wins and durable guardrails.

## Confirmed Baseline Facts

- The latest Desktop Canary run completed successfully:
  - Run: https://github.com/TwitterIsGood/superset/actions/runs/27183821700
  - Triggered at `2026-06-09T04:26:59Z`
  - Completed at `2026-06-09T04:52:08Z`
  - End-to-end duration: about 25 minutes.
- Build job durations from that run:
  - Linux x64: about 8 minutes 17 seconds.
  - macOS arm64: about 18 minutes 51 seconds.
  - macOS x64: about 23 minutes 10 seconds.
  - Final canary release update: about 1 minute 37 seconds.
- The slowest CI phase is macOS `Build Electron app`, not dependency install:
  - macOS arm64 `Build Electron app`: about 11 minutes 10 seconds.
  - macOS x64 `Build Electron app`: about 12 minutes 33 seconds.
  - Linux `Build Electron app`: about 3 minutes 1 second.
- Canary release assets are large:
  - macOS arm64 DMG: about 543 MB.
  - macOS arm64 ZIP: about 521 MB.
  - macOS x64 DMG: about 591 MB.
  - macOS x64 ZIP: about 568 MB.
  - Linux AppImage: about 549 MB.
- Local desktop `dist` is already about 108 MB before Electron runtime and
  installer packaging.
- Known large local `dist` entries:
  - `apps/desktop/dist/resources/bin/superset`: about 63 MB.
  - `apps/desktop/dist/main/chunks/get-small-model-*.js`: about 7.7 MB.
  - `apps/desktop/dist/main/chunks/get-small-model-*.js.map`: about 14 MB.
  - `apps/desktop/dist/main/index.js.map`: about 7.1 MB.
- Production builds currently set `sourcemap: true` for main and renderer in
  `apps/desktop/electron.vite.config.ts`.
- `apps/desktop/package.json` scripts currently create some repeated work:
  - `compile:app` runs `electron-vite build`, `bundle:cli`, and pty-daemon checks.
  - `prepackage` runs `bundle:cli`, `copy:native-modules`, and runtime validation.
  - CI runs `compile:app` and then `bun run package`, so CLI bundling is likely
    repeated before packaging.
- `apps/desktop/runtime-dependencies.ts` copies several native/runtime modules
  wholesale or near-whole into the packaged app, including `better-sqlite3`,
  `node-pty`, `native-keymap`, `@ast-grep`, `@parcel/watcher`, `libsql`,
  `@mastra/duckdb`, and support modules.
- Initial local size checks showed notable runtime module sizes:
  - `node-pty`: about 63 MB.
  - `@mastra`: about 56 MB.
  - `better-sqlite3`: about 12 MB.
  - `@parcel`: about 12 MB.
  - `mastracode`: about 7.5 MB.
  - Workspace symlink sizes are not reliable as package-size evidence because
    following symlinks can traverse the whole monorepo.
- A user reported that the arm64 Canary downloaded from
  https://github.com/TwitterIsGood/superset/releases shows a macOS
  "package/app is damaged" style error on an Apple Silicon Mac.
- Repository secrets do not currently include macOS signing/notarization inputs
  such as `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`,
  `APPLE_ID_PASSWORD`, or `APPLE_TEAM_ID`.
- The current workflow intentionally falls back to unsigned macOS artifacts when
  signing secrets are missing. Those artifacts can build successfully but may be
  blocked by Gatekeeper after download because they are unsigned/unnotarized and
  quarantined.

## Requirements

- First milestone priority: package size and GitHub Actions packaging speed.
- macOS Canary installability/signing is part of the first milestone and should
  be fixed together with package size and packaging speed.
- Establish repeatable baseline measurements before making optimizations:
  package contents, artifact sizes, build step timings, cold start, route-open
  latency, CPU/memory while idle, CPU/memory during active terminal/chat/task
  workflows, and desktop smoke behavior.
- Reduce packaged artifact size without breaking native modules, bundled CLI,
  auto-update manifests, terminal persistence, host-service, pty-daemon, or
  Trellis-backed task workflows.
- Reduce GitHub Actions Desktop Canary build time, especially macOS
  `Build Electron app`.
- First-pass Canary builds should target macOS arm64 only for fast internal
  validation. Full/stable release workflows may continue producing macOS x64 and
  Linux artifacts.
- macOS Canary artifacts intended for normal user testing must be signed and
  notarized, or the release must explicitly label them as ad-hoc signed
  internal builds with quarantine-removal instructions.
- Internal no-cost macOS Canary artifacts must still be ad-hoc signed so the
  `.app` bundle is valid on disk. Fully skipping bundle signing can produce an
  Apple Silicon "app is damaged" error even before Developer ID notarization is
  considered.
- Improve app startup and first workspace open time; avoid delaying the first
  usable frame on services that can be lazily initialized.
- Improve route/page open performance for the main surfaces: Chat, Code, Tasks,
  Models, Settings, and Workspace creation.
- Reduce idle CPU and memory footprint, especially background polling, terminal
  services, Electric/TanStack sync, model provider state, and renderer work that
  does not need to run before the user opens a surface.
- Add guardrails so regressions are visible in CI or local quality gates:
  package size report, build timing report, and desktop automation smoke checks.
- Keep V2-only product direction and existing shipped features intact.

## Acceptance Criteria

- [x] A baseline report exists with current package size, top packaged
      contributors, CI step durations, cold start timing, key route timings,
      idle CPU/memory, and active workflow CPU/memory.
- [ ] A repeatable command or script can generate the package-size report.
- [x] A repeatable command or script can generate desktop startup and route-open
      performance measurements.
- [ ] Canary package size has a clearly measured reduction target and a measured
      result after implementation.
- [ ] Desktop Canary build time has a clearly measured reduction target and a
      measured result after implementation.
- [ ] The app cold start and first workspace open have measured before/after
      timings.
- [ ] Idle CPU and memory usage have measured before/after values.
- [ ] Existing workflows still pass: login, workspace open, Chat, Code terminal,
      Tasks, model/provider selection, Trellis task sync, and desktop automation
      smoke.
- [ ] The CI/release process publishes the chosen first-pass Canary artifact set
      with update manifests.
- [ ] Full release or explicitly requested full Canary builds can still produce
      macOS x64 and Linux artifacts.
- [ ] macOS arm64 Canary can be opened on Apple Silicon after downloading from
      GitHub without showing "app/package is damaged" when signing credentials
      are configured.
- [ ] If signing credentials are not configured, the release page and CI summary
      make the unsigned status explicit and include a temporary internal-testing
      workaround.

## Initial Hypotheses

- The biggest CI bottleneck is macOS installer packaging/compression of very
  large app bundles.
- The biggest package-size contributors are likely Electron runtime, bundled CLI,
  sourcemaps, native runtime modules, and whole-module copies in
  `runtime-dependencies.ts`.
- Some production sourcemaps are being packaged locally and may not need to ship
  inside the final app if Sentry upload or private CI artifacts can preserve
  debugging value.
- `compile:app` / `prepackage` duplication likely wastes CI time.
- Some services can be lazy-started after the first visible window rather than
  during initial app boot.
- Some route-level code can be split more aggressively, especially large editor,
  markdown, model provider, and task/terminal surfaces.

## Out Of Scope For The First Pass

- Replacing Electron as the desktop shell.
- Removing core shipped surfaces such as Chat, Code, Tasks, Models, or Settings.
- Dropping macOS x64 or Linux support from full/stable release builds.
- Disabling auto-update manifests.
- Removing the bundled CLI unless a replacement distribution strategy is
  explicitly approved.

## Open Product Decisions

- Is it acceptable for canary builds to skip some expensive artifacts when the
  goal is fast internal verification, while full release keeps all artifacts?

## Decisions

- First milestone: package size and GitHub Actions packaging speed.
- First-pass Canary artifact scope: macOS arm64 only.
- macOS signing/installability should be fixed in the same milestone rather than
  postponed.

## Milestone 1 Progress: Canary Packaging

- Added a repeatable package-size report command:
  `bun run --cwd apps/desktop report:size --top=12`.
- Local unsigned macOS arm64 package validation passed with:
  `AD_HOC_MAC_CODE_SIGNING=true CSC_IDENTITY_AUTO_DISCOVERY=false TARGET_ARCH=arm64 bun run --cwd apps/desktop package -- --publish never --config electron-builder.canary.ts --arm64`.
- Local arm64 Canary artifact size after low-risk cleanup:
  - DMG: about 440 MB.
  - ZIP: about 423 MB.
  - Compared with the prior release assets recorded above, this is roughly
    100 MB smaller for both DMG and ZIP.
- Production `dist` sourcemaps are no longer generated by default unless Sentry
  upload or `DESKTOP_INCLUDE_SOURCEMAPS=true` is configured.
- Packaged release sourcemaps are down to 19 files / about 64 KB, all from
  external `node-pty` unpacked runtime files; they are no longer a meaningful
  package-size contributor.
- `prepackage` now reuses an already bundled desktop CLI when present instead
  of running the CLI bundle step a second time.
- Desktop Canary workflow can now run a quick macOS arm64-only build while still
  keeping a manual full build path for macOS arm64/x64 and Linux.
- GitHub secrets for Developer ID signing/notarization are currently absent, so
  current macOS releases remain ad-hoc signed internal builds without
  notarization.
- Without Apple Developer Program / Developer ID credentials, the viable
  no-cost path is internal testing with quarantine removal, for example:
  `xattr -dr com.apple.quarantine /Applications/Superset\ Canary.app`.
  This does not provide a normal consumer-grade double-click install experience.
- Updated quick Canary CI run completed successfully:
  - Run: https://github.com/TwitterIsGood/superset/actions/runs/27187755251
  - Commit: `08e9e6b87`
  - Triggered at `2026-06-09T06:18:20Z`.
  - Completed at `2026-06-09T06:30:29Z`.
  - End-to-end duration: about 12 minutes 9 seconds.
  - macOS arm64 build job duration: about 10 minutes 54 seconds.
  - macOS `Build Electron app` duration: about 5 minutes 50 seconds.
  - Linux job was skipped by quick canary scope.
  - Release assets:
    - arm64 DMG: 452,760,757 bytes.
    - arm64 ZIP: 435,477,572 bytes.
  - Release notes state `macOS signing mode: unsigned_internal`; this was later
    refined to report `macOS signing status: Ad-hoc signed internal build`.
- Follow-up from user testing:
  - The first quick Canary still showed "app is damaged" on Apple Silicon.
  - Downloaded DMG inspection confirmed the packaged app failed:
    `codesign --verify --deep --strict` with
    `code has no resources but signature indicates they must be present`.
  - Root cause: `unsigned_internal` set `SKIP_MAC_CODE_SIGNING=true`, which
    skipped bundle signing instead of ad-hoc signing the `.app`.
  - Fix: `unsigned_internal` and missing-secret `auto` builds should use
    `AD_HOC_MAC_CODE_SIGNING=true` and `identity: "-"`, disabling Developer ID
    notarization while still sealing the app bundle.
- Updated ad-hoc signed Canary validation:
  - Run: https://github.com/TwitterIsGood/superset/actions/runs/27189409464
  - Commit: `de42cdd28`
  - Completed successfully at `2026-06-09T07:14:09Z`.
  - CI `Verify macOS code signing status` passed
    `codesign --verify --deep --strict`.
  - Downloaded release DMG
    `Superset-Canary-1.12.4-canary.20260609065812-arm64.dmg` was mounted and
    the contained `Superset Canary.app` passed:
    `codesign --verify --deep --strict --verbose=2`.
  - The mounted release app reports `Signature=adhoc`,
    `Identifier=com.superset.desktop.canary`, and
    `Sealed Resources version=2`.
  - `spctl --assess` still rejects the app, as expected for a non-notarized
    internal build; users must remove quarantine after copying the app to
    `/Applications`.

## Milestone 2 Progress: Runtime Baseline

- Added a repeatable desktop runtime performance report command:
  `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12`.
- The command connects to the currently running Electron app through the
  project Desktop Automation implementation, captures renderer performance
  metadata, samples Superset process CPU/memory, and writes markdown/json
  artifacts under the Trellis task artifacts directory.
- The route-open measurement uses the in-app TanStack Router instance
  (`window.__TSR_ROUTER__`) rather than reload-based hash navigation, so it
  measures SPA route transitions plus an explicit settle window.
- Official runtime baseline captured at:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-00-02-930Z.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-00-02-930Z.json`
- Current running-dev baseline highlights:
  - Workspace renderer JS heap: about 181 MB.
  - Electron renderer physical footprint: about 536 MB.
  - Electron main physical footprint: about 302 MB.
  - Two host-service processes combined: about 460 MB.
  - Electron GPU process peak: about 377 MB during the sampled route pass.
  - SPA route timings, including 750 ms settle window:
    - `/tasks`: about 977 ms.
    - `/settings/models`: about 843 ms.
    - Workspace chat route: about 848 ms.
  - Development service overhead is large and should be separated from packaged
    user-app optimization:
    - `electron-vite dev --watch`: about 2.3 GB.
    - Cloudflare `workerd`: about 3.7 GB.
    - `next-server` from the local API graph: about 2.0 GB.

## Milestone 2 Progress: Runtime Optimization Pass 1

- Reduced eager startup work without removing user-facing features:
  - Terminal runtime environment still prewarms at startup, but daemon
    connection/spawn is no longer part of default startup prewarm.
  - Workspace terminal runtime is now a lightweight lazy EventEmitter bridge;
    registering main-window terminal lifecycle listeners no longer initializes
    the daemon backend.
  - Desktop now starts host-service only for the active organization. Other
    organizations start on demand when they become active.
- Post-change runtime report captured at:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-20-55-910Z.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-performance-2026-06-09T08-20-55-910Z.json`
- Post-change highlights:
  - Host-service: reduced from about 460 MB across two processes to about
    210 MB in one active-organization process.
  - Idle CPU in the focused Code workspace after the change: renderer about
    1.1% average, Electron main about 0.3%, and host-service about 0.5%.
  - Electron main: about 302 MB, essentially unchanged.
  - Electron renderer: about 533 MB physical footprint and about 193 MB JS heap
    in the sampled Code/Models state; renderer memory still needs a separate
    follow-up pass.
  - SPA route timings were roughly flat/noisy: `/tasks` about 1.08 s,
    `/settings/models` about 870 ms, workspace chat about 909 ms, all including
    the 750 ms settle window.
  - The sample had an already-active pty-daemon from terminal work; it used
    about 14 MB and was left running to avoid disrupting active work.
- Idle report captured at:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-idle-after-lazy-services.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-idle-after-lazy-services.json`
- Desktop smoke evidence:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-services.png`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-services.json`

## Milestone 2 Progress: Runtime Optimization Pass 2

- Renderer analytics is now lazy and non-blocking:
  - `posthog-js/dist/module.full.no-external` is no longer statically imported
    by the renderer startup bundle.
  - Renderer `PostHogProvider` no longer blocks the app behind device-id lookup
    or analytics initialization; children render immediately.
  - Local/dev `NEXT_PUBLIC_POSTHOG_KEY=phc_local_dev_disabled` is treated as a
    no-op, so the PostHog SDK is not loaded for that disabled key.
  - Feature flag reads now go through the local lightweight
    `renderer/lib/posthog-feature-flags.ts` hook instead of
    `posthog-js/react`, preserving flag behavior without pulling the React
    PostHog package into common renderer paths.
- Production renderer bundle evidence after `bun run --cwd apps/desktop
  compile:app`:
  - Initial renderer `index-*.js`: about 1.8 MB.
  - Previous recorded initial renderer `index-*.js`: about 2.5 MB and included
    the PostHog full bundle.
  - PostHog now appears as a lazy `module.no-external-*.js` chunk of about
    240 KB and is reached only through dynamic import when analytics is
    enabled.
- Added cold-start timeline instrumentation:
  - Shared IPC contract: `shared/startup-performance.ts`.
  - Main-process marks: process start, Electron ready, app-state init,
    persistence init, network logger, webview extension, terminal reconcile,
    terminal prewarm, window creation, renderer load, first show.
  - Renderer mark: `renderer:boot-mounted` with renderer elapsed time and
    current URL.
  - `report:runtime` now includes a Startup Timeline section and JSON payload.
- Final short startup/runtime report:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-final-startup-renderer-memory.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-final-startup-renderer-memory.json`
- Route/runtime report after renderer analytics pass:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-routes-after-renderer-analytics-startup.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-routes-after-renderer-analytics-startup.json`
- Idle/runtime report after renderer analytics pass:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-after-renderer-analytics-startup.md`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-after-renderer-analytics-startup.json`
- Desktop smoke evidence after renderer analytics/startup instrumentation:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-renderer-analytics-startup.png`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-renderer-analytics-startup.json`
- Measurement notes:
  - Running dev app idle snapshot after analytics pass showed renderer JS heap
    about 158 MB and renderer physical footprint about 509 MB in one sample.
    Dev numbers remain state-dependent and are not a production memory
    guarantee.
  - Final short startup report in dev showed process start to first show about
    2.12 s, with about 1.34 s before `main:index-module-ready`; the next cold
    start optimization target is main-process import/evaluation cost.
  - Route timing after route chunk loads remains noisy: `/tasks` about 2.33 s
    on the measured pass, `/settings/models` about 1.36 s, and workspace chat
    about 910 ms, all including the 750 ms settle window.

## Milestone 2 Progress: Runtime Optimization Pass 3

- Host-service Chat/Mastra/AI startup work is now lazy:
  - Chat runtime and provider auth singleton creation moved behind
    `HostServiceRuntime.getChat()` / `getAuth()`.
  - Model gateway handling, AI task draft gateway calls, AI branch naming, and
    AI workspace naming/rename moved to dynamic imports.
  - The desktop host-service process now imports `@superset/host-service`
    through narrow subpaths instead of the root barrel for runtime startup.
- Bundle evidence:
  - `dist/main/host-service.js` is about 25 KB after compile.
  - Chat/Mastra/model-gateway/AI naming paths are emitted as separate chunks,
    not part of the host-service entry chunk.
- Runtime evidence:
  - `runtime-after-lazy-chat-ai.md`: host-service about 192 MB.
  - `runtime-after-lazy-chat-ai-subpaths.md`: host-service about 196 MB.
  - This is a modest additional reduction over the prior 210-234 MB samples,
    not a fresh 100-200 MB reduction. The stable low-risk win for this round is
    keeping Chat/Mastra/AI code out of idle host-service startup.
- Desktop smoke after the pass:
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-chat-ai.png`
  - `.trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts/runtime-smoke-after-lazy-chat-ai.json`
- Follow-up:
  - A new 100 MB-class host-service reduction likely requires a separate design
    pass around GitWatcher, PullRequestRuntime, event-bus startup, all-router
    eager imports, or native watcher policy. Those are more coupled to Changes,
    PR freshness, workspace state, and real-time event behavior, so they should
    not be mixed into this low-risk pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- This is a complex task. Add `design.md` and `implement.md` before
  `task.py start`.
