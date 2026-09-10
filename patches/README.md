# Patched dependencies

Applied by bun at install time via `patchedDependencies` in the root
`package.json`. **Keys are pinned to exact versions** — bumping a patched
package makes its patch stop matching, and the fix silently disappears while
everything still builds. Every patch listed here must have a CI guard test
that fails when its markers vanish from the installed package.

## metro (`metro@<version>.patch`)

**Why:** `apps/mobile` runs worklets Bundle Mode (`react-native-streamdown`, see
`apps/mobile/babel.config.js`). Its Babel plugin writes each worklet to
`node_modules/react-native-worklets/.worklets/<hash>.js` *during* the transform
pass — after Metro has crawled the filesystem — so a one-shot bundle can't hash
files that didn't exist at crawl time and dies with `Failed to get the SHA-1`.
The dev server survives on re-crawls; `expo export` and every EAS build fail
100% of the time from a clean install, which is what errored the first two
production builds (2026-08-13). Upgrading worklets does not fix it — 0.11.4
fails identically.

**What it changes** (`src/node-haste/DependencyGraph.js`): `getOrComputeSha1`
returns a synthetic hash for any path under `react-native-worklets/.worklets`
instead of consulting the file map. Taken verbatim from upstream —
[`bundleMode/patches/patch-package/metro`](https://github.com/software-mansion/react-native-reanimated/tree/main/packages/react-native-worklets/bundleMode/patches)
— and documented as the recommended fix in the [Bundle Mode setup
guide](https://docs.swmansion.com/react-native-worklets/docs/bundleMode/setup/).
Temporary until the change lands in Metro.

**Guard test:** `apps/mobile/metro-worklets-patch.test.ts`.

**Regenerating after a version bump** (~5 min): upstream keeps one patch per
Metro version. Find yours with `bun why metro --top`, then:

```bash
bun patch metro
curl -L "https://github.com/software-mansion/react-native-reanimated/raw/main/packages/react-native-worklets/bundleMode/patches/patch-package/metro/metro%2B<version>.patch" | git apply
bun patch --commit 'node_modules/metro'
bun test apps/mobile/metro-worklets-patch.test.ts
```

If upstream has no patch for the new Metro yet, the previous version's patch
usually still applies — the touched function is stable. Verify with a cold
bundle: delete `node_modules/react-native-worklets/.worklets/*.js`, then
`npx expo export --platform ios --clear` from `apps/mobile`.

Worklets also publishes a `metro-runtime` patch that extends Fast Refresh to
worklet runtimes. Not applied here — it's dev-only ergonomics, not a build fix.

## @xterm/addon-webgl (`@xterm%2Faddon-webgl@<version>.patch`)

**Why:** SUPER-1793 / PR #6352. Truecolor-heavy TUI output (e.g. Claude Code's
animated shimmer) mints a new glyph-atlas entry per distinct RGB color. The
addon's intended `FORCED_MAX_TEXTURE_SIZE = 4096` clamp is dead code, so atlas
pages merge-double toward `gl.MAX_TEXTURE_SIZE` (16384² = 1 GiB of RGBA per
page) and orphaned page canvases only free on lazy GC. Measured: GPU process
grew to ~11 GB in 90 s; with the patch it plateaus at ~2 GB (video evidence on
the PR).

**What it changes** (in `lib/addon-webgl.js`, `lib/addon-webgl.mjs`, and the
matching `src/` files for readability — bundles are what run):

1. `GlyphRenderer`: `TextureAtlas.maxTextureSize = Math.min(4096, gl.MAX_TEXTURE_SIZE)`.
2. `WebglRenderer`: same clamp on `_deviceMaxTextureSize` (feeds the
   oversized-glyph overflow page allocation in `TextureAtlas`).
3. `TextureAtlas`: zero `canvas.width/height` for merged-away and evicted
   pages so backing stores free immediately instead of waiting for GC.

An app-side safety net lives in
`apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` (atlas reset after
32 page-add events) and works without the patch, but the patch is what keeps
worst-case pages at 64 MiB instead of 1 GiB.

**Guard test:**
`apps/desktop/src/webgl-atlas-patch.test.ts` asserts the
patch markers in the installed bundles. If it fails after a version bump,
regenerate the patch — don't delete the test.

**Regenerating after a version bump** (~10 min):

```bash
bun patch @xterm/addon-webgl@<new-version>
# edit node_modules/@xterm/addon-webgl per the three changes above:
#   - both lib bundles are minified; find `getParameter(<gl>.MAX_TEXTURE_SIZE)`
#     (2 sites) and wrap each in Math.min(4096, ...)
#   - find `_onRemoveTextureAtlasCanvas.fire(<p>.canvas)` (merge path) and the
#     `_evictAllPages` loop; add `<p>.canvas.width=0,<p>.canvas.height=0`
#   - mirror the edits in src/GlyphRenderer.ts, src/WebglRenderer.ts,
#     src/TextureAtlas.ts
bun patch --commit 'node_modules/@xterm/addon-webgl'
bun test apps/desktop/src/webgl-atlas-patch.test.ts
```

Before regenerating, check whether the new version made the patch obsolete:
upstream already absorbed the render-loop page-count clamp and `_evictAllPages`
from the SUPER-1793 report into 0.20.0-beta.297, and hunks 1–3 are candidates
for upstreaming. If upstream ships them, delete the patch, the
`patchedDependencies` entry, and update (not delete) the guard test.

## @xterm/xterm (`@xterm%2Fxterm@<version>.patch`)

**Why:** SUPER-2120 / DESKTOP-12J. `Terminal.resize()` drains the write queue
through `WriteBuffer.flushSync()`, which ignores the promise an async parser
handler returns and then re-enters the parser without the continuation token
it needs. `@xterm/addon-image` decodes inline images asynchronously (cursor-agent
draws them with the kitty protocol because we identify as kitty), so a re-fit
landing mid-decode put the parser in its FAIL state: every later write throws,
the pane never renders again while the program keeps running, and only
recreating the pane recovers. `flushSync` also drained from index 0 regardless
of `_bufferOffset`, re-parsing chunks a sliced `_innerWrite` had already
applied — duplicated output on a resize during heavy output.

**What it changes** (`lib/xterm.js`, `lib/xterm.mjs`, and
`src/common/input/WriteBuffer.ts` for readability — bundles are what run):

1. `flushSync` returns early while a chunk is paused in an async handler
   (`_asyncPending`), drains from `_bufferOffset` instead of index 0, and when a
   chunk it applies returns a promise, hands the queue to the same continuation
   `_innerWrite` uses instead of dropping the promise.
2. That continuation lives in a new `_resumeAfterAsync`, which also cancels a
   scheduled write loop so it cannot touch the paused chunk before the handler
   settles.
3. `RenderDebouncer` (DESKTOP-27 / DESKTOP-CS; also `src/browser/RenderDebouncer.ts`):
   `dispose()` cancelled the pending frame but left the viewport and decoration
   refresh callbacks queued for it, and `refresh()` or `addRefreshCallback()` on
   the disposed debouncer re-armed a frame that ran them against the renderer
   slot `dispose()` had already emptied — "Cannot read properties of undefined
   (reading 'dimensions')" from requestAnimationFrame. `Terminal.dispose()`
   does this to itself: it disposes the core before the addons, and
   `@xterm/addon-ligatures` deregisters its character joiner on dispose, which
   xterm answers with a full `refresh()`. The debouncer now records disposal,
   drops the queued callbacks, ignores refresh and callback requests, and stops
   running callbacks once one of them disposes the terminal. Still present on
   upstream master.

**Guard tests:** `apps/desktop/src/xterm-flushsync-patch.test.ts` asserts the
hunk 1–2 markers in both bundles and reproduces the failure against the real
build: an image chunk plus a text chunk, then `resize()`, must not throw and
must render both once the handler settles.
`apps/desktop/src/xterm-render-debouncer-patch.test.ts` does the same for
hunk 3: markers, then a real terminal opened under happy-dom with a
joiner-holding addon, disposed with a viewport sync queued — no frame may be
scheduled and nothing may throw.

**Regenerating after a version bump** (~10 min), unless upstream has absorbed
it (check `WriteBuffer.flushSync` for `_asyncPending` or an equivalent guard,
and `RenderDebouncer.dispose` for a disposed flag or callback clearing; drop
whichever hunks upstream carries, and delete the patch, the
`patchedDependencies` entry, and the tests only once both are gone):

```bash
bun patch @xterm/xterm@<new-version>
# edit node_modules/@xterm/xterm per the three changes above — in both lib
# bundles find `flushSync(){` and the `if(<promise>){...}` branch inside
# `_innerWrite`, and the class holding `_runRefreshCallbacks(){`; mirror the
# edits in src/common/input/WriteBuffer.ts and src/browser/RenderDebouncer.ts
bun patch --commit 'node_modules/@xterm/xterm'
bun test apps/desktop/src/xterm-flushsync-patch.test.ts apps/desktop/src/xterm-render-debouncer-patch.test.ts
```

## trpc-electron (`trpc-electron@<version>.patch`)

**Why:** DESKTOP-16T / DESKTOP-K8. `createIPCHandler` attaches a
`did-start-navigation` listener to every window's webContents to abort the
subscriptions belonging to the frame that is navigating away, and reads
`frame.routingId` unconditionally. Electron types that field as
`WebFrameMain | null` — "May be `null` if accessed after the frame has either
navigated or been destroyed" — and reading *any* property of a `WebFrameMain`
whose render frame has been disposed throws `Render frame was disposed before
WebFrameMain could be accessed`. trpc-electron was written against Electron 25,
where `frame` was non-nullable, and is unmaintained (0.1.2 is the latest
release, published 2025-01-06).

A frame torn down as its navigation starts therefore throws out of
`webContents.emit` in the main process: an unhandled `fatal` in Sentry, and no
subscription is aborted for that navigation (the throw happens while building
the argument object). Verified against Electron 41.10.3 — the runtime from the
reports — that a disposed frame answers `isDestroyed() === true` without
throwing while `routingId` throws that exact message. Rare: two events in 90
days, one under a main-frame `reloadIgnoringCache()` from the app menu.

**What it changes** (`dist/main.mjs`, `dist/main.cjs`, and
`src/main/createIPCHandler.ts` for readability — bundles are what run; the
production stack traces come from `dist/main.mjs`): the
`did-start-navigation` listener skips cleanup when `frame` is null or
`frame.isDestroyed()`. There is nothing to scope the cleanup to in that case,
and those subscriptions are reaped by the existing `destroyed` handler when the
webContents goes away — which is already what happens today, minus the throw.

**Guard test:** `apps/desktop/src/trpc-electron-frame-patch.test.ts`.

**Regenerating after a version bump** (~5 min):

```bash
bun patch trpc-electron@<new-version>
# in node_modules/trpc-electron, in the did-start-navigation listener of both
# dist bundles and src/main/createIPCHandler.ts, require the frame to be
# non-null and !frame.isDestroyed() before reading frame.routingId
bun patch --commit 'node_modules/trpc-electron'
bun test apps/desktop/src/trpc-electron-frame-patch.test.ts
```

**Removing:** delete the patch, the `patchedDependencies` entry and the guard
test if trpc-electron ever ships a release that handles a missing frame, or if
the app stops depending on it.

## node-pty (`node-pty@<version>.patch`)

**Why:** DESKTOP-101 / DESKTOP-107 / DESKTOP-10J. The desktop main process
initialises the Sentry Electron SDK, whose `SentryMinidump` integration starts
Electron's `crashReporter`. On macOS that points the *task* Mach exception port
at Crashpad's handler, and macOS inherits task exception ports across
fork/exec — including into grandchildren. Superset is terminal-centric, so every
shell, coding agent, compiler and test runner a user starts is a descendant of
the app and reports its crashes to our handler, which writes a minidump into our
Crashpad database. The SDK then uploads it under our DSN as a fatal Superset
crash. Measured over seven days: 4960 of 5141 minidump events (96.5%) came from
processes that are not ours, ~700/day, each carrying an unrelated program's
memory, file paths and command line.

**What it changes** (`src/unix/spawn-helper.cc`): node-pty `posix_spawn`s a
small `spawn-helper` executable which sets up the controlling terminal and then
`execvp`s the real command — the one point that is inside the pty child and
before the user's program. The patch clears the inherited task exception ports
there. The masks are named explicitly rather than using `EXC_MASK_ALL`, which
deliberately excludes `EXC_MASK_CRASH` and would therefore compile, run, and
silently do nothing. Clearing to `MACH_PORT_NULL` does not cost the user their
own crash logs — macOS still writes its usual report to
`~/Library/Logs/DiagnosticReports`.

The boundary is process ancestry, not a tag or heuristic. Two launch points
detach a subtree, and both go through this helper:

- **pty children.** Everything launched into a terminal.
- **host-service and everything under it.** `host-service-coordinator.ts`
  launches host-service through the same `spawn-helper`
  (`spawn-helper "" <electron> host-service.js`), so its login-shell env probe,
  git and the hooks git runs, `gh`, the agent CLIs it runs for workspace naming
  and chat, and the pty daemon it supervises all start without the port. Measured
  2026-09-07, two weeks after the pty patch shipped (1.24.2): about half of the
  minidumps from patched releases were still foreign, and the host-service tree
  was the one remaining path our code reaches. host-service's own crashes keep
  reaching Sentry through the coordinator's exit handler (`host-service crashed
  (signal …)`, with the output tail), which already carried ~6x more events than
  its minidumps did. The pty daemon's native crashes are no longer captured by
  anything.

Electron's own main, renderer, GPU and utility processes, and the terminal-host
daemon (its only children are the pty subprocesses, which go through node-pty),
keep reporting exactly as before. Two paths stay leaky and are not ours to fix
here: Squirrel.Mac unzips updates with an in-process `ditto`, and a detached
daemon started by a pre-1.24.2 install keeps its old handler until the machine
reboots. A Superset binary a user runs *themselves* in a terminal (e.g. the
bundled `superset` CLI) is on the detached side.

`spawn-helper` is compiled from this source by the node-gyp rebuild that
`bun run install:deps` and electron-builder's `npmRebuild` perform, and
node-pty's loader prefers `build/Release` over the bundled `prebuilds/`, so the
patched helper is the one that ships.

**Guard test:** `apps/desktop/src/pty-crash-ports-patch.test.ts`.

**Regenerating after a version bump** (~5 min):

```bash
bun patch node-pty@<new-version>
# in node_modules/node-pty/src/unix/spawn-helper.cc, before execvp():
#   task_set_exception_ports(mach_task_self(),
#                            EXC_MASK_CRASH | EXC_MASK_RESOURCE | EXC_MASK_GUARD,
#                            MACH_PORT_NULL, EXCEPTION_DEFAULT, THREAD_STATE_NONE);
#   guarded by #if defined(__APPLE__), with #include <mach/mach.h>
bun patch --commit 'node_modules/node-pty'
bun test apps/desktop/src/pty-crash-ports-patch.test.ts
```

**Removing:** upstream could do this properly for every embedder by setting the
ports on the spawn attributes it already builds in `pty_posix_spawn`
(`posix_spawnattr_setexceptionports_np`). If node-pty ships that, the pty side
no longer needs the patch, but `host-service-coordinator.ts` still needs a
port-clearing exec trampoline; keep the patched helper (or ship our own) for it.
