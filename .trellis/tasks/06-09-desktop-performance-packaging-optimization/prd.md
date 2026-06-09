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
  notarized, or the release must explicitly label them as unsigned internal
  builds with quarantine-removal instructions.
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

- [ ] A baseline report exists with current package size, top packaged
      contributors, CI step durations, cold start timing, key route timings,
      idle CPU/memory, and active workflow CPU/memory.
- [ ] A repeatable command or script can generate the package-size report.
- [ ] A repeatable command or script can generate desktop startup and route-open
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
  `SKIP_MAC_CODE_SIGNING=true CSC_IDENTITY_AUTO_DISCOVERY=false TARGET_ARCH=arm64 bun run --cwd apps/desktop package -- --publish never --config electron-builder.canary.ts --arm64`.
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
  current macOS releases remain unsigned internal builds.
- Without Apple Developer Program / Developer ID credentials, the viable
  no-cost path is internal testing with quarantine removal, for example:
  `xattr -dr com.apple.quarantine /Applications/Superset\ Canary.app`.
  This does not provide a normal consumer-grade double-click install experience.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- This is a complex task. Add `design.md` and `implement.md` before
  `task.py start`.
