# Phase 1: Swift Desktop Shell — Design Spec

## Context

Superset's desktop app currently runs on Electron (apps/desktop/). We are replacing it with a native macOS Swift application. This is Phase 1 of 5 — the foundation layer ("Shell") that establishes:

- Native Swift window with WKWebView hosting xterm.js
- PTY management in Swift via `forkpty()`
- High-performance data bridge via `WKURLSchemeHandler`
- Minimal JS bundle (xterm.js only, no React)

The goal is a working single-terminal app that proves out the Swift ↔ JS bridge architecture before adding multi-terminal, native sidebar, and full UI in later phases.

## Phased Roadmap (for context)

1. **Shell** ← this spec — Swift app, WKWebView, PTY, bridge, one terminal
2. **Multi-terminal** — Session registry, workspace switching, native sidebar
3. **Host-service sidecar** — Launch/monitor/restart Node.js host-service process, SQLite local state
4. **Native UI** — SwiftUI sidebar, settings, diff viewer, file browser
5. **Chat/AI** — SwiftUI chat interface with tool calls

## Architecture

### Process Model

```
┌──────────────────────────────────────────────┐
│  Swift App Process                            │
│  ├─ NSWindow + WKWebView                      │
│  ├─ PTYSessionManager (forkpty, DispatchSource)│
│  ├─ OutputBatcher (4-16KB, 12ms debounce)     │
│  └─ SupersetSchemeHandler (chunked HTTP)       │
└──────────────┬───────────────────────────────┘
               │  superset:// custom URL scheme
               ▼
┌──────────────────────────────────────────────┐
│  WKWebView (local bundle)                     │
│  ├─ xterm.js Terminal                         │
│  ├─ FitAddon + WebglAddon + Unicode11Addon    │
│  └─ superset-bridge.ts (fetch + postMessage)  │
└──────────────────────────────────────────────┘
```

### Data Flow

**PTY output → screen:**

```
PTY fd
  → DispatchSourceRead (16KB buffer reads)
  → OutputBatcher (accumulates 4-16KB, flushes on 12ms debounce or 16KB ceiling)
  → SupersetSchemeHandler.sendBatch() → task.didReceive(data)
  → WKWebView fetch() ReadableStream → reader.read()
  → xterm.js term.write(data)
```

**Keyboard input → PTY:**

```
xterm.js onData
  → fetch("superset://terminal/input/{id}", POST, raw bytes)
  → SupersetSchemeHandler.handleInput()
  → PTYSession.write(fd) → Darwin.write()
```

**Control messages (resize, create, destroy):**

```
JS postMessage({action, ...})
  → WKScriptMessageHandler ("superset")
  → ControlMessageHandler → PTYSessionManager
```

## Swift ↔ JS Protocol

### Data Plane (WKURLSchemeHandler, `superset://` scheme)

| Endpoint | Method | Direction | Payload | Lifecycle |
|----------|--------|-----------|---------|-----------|
| `superset://terminal/stream/{sessionId}` | GET | Swift→JS | Chunked raw bytes. Final chunk: `{"exit":N,"signal":N}\n` | Long-lived (one per session) |
| `superset://terminal/input/{sessionId}` | POST | JS→Swift | Raw bytes (keyboard data) | Short-lived (one per keystroke batch) |

The stream endpoint returns a chunked HTTP response. JS reads it via `fetch().body.getReader()`. The response stays open until the PTY exits, at which point a JSON exit trailer is sent and the response finishes.

### Control Plane (WKScriptMessageHandler, `"superset"` handler)

| Action | Payload | When |
|--------|---------|------|
| `createSession` | `{ sessionId: string, cwd: string }` | Before connecting stream |
| `destroySession` | `{ sessionId: string }` | User closes terminal |
| `resize` | `{ sessionId: string, cols: number, rows: number }` | Container resize |
| `ready` | `{}` | JS bundle loaded |

### Batching Strategy

The `OutputBatcher` accumulates PTY output and flushes to the WKURLSchemeHandler on two triggers:

- **Size threshold:** 16KB ceiling → immediate flush
- **Time threshold:** 12ms debounce → flush accumulated data

This means:
- Burst output (e.g., `cat large-file`) delivers 16KB chunks at full speed
- Interactive output (e.g., typing) delivers within 12ms — below perceptible latency
- IPC crossings reduced by 100-1000x vs per-read delivery

The 12ms debounce aligns with one frame at ~83Hz, keeping terminal animation smooth.

## Project Structure

```
apps/desktop-swift/
├── Sources/
│   ├── App/
│   │   ├── SupersetApp.swift              # @main, NSApplicationDelegate
│   │   └── MainWindowController.swift     # NSWindow + WKWebView setup
│   ├── PTY/
│   │   ├── PTYSession.swift               # forkpty(), DispatchSourceRead, DispatchSourceProcess
│   │   ├── PTYSessionManager.swift        # Session registry, create/destroy/lookup
│   │   └── ShellEnvironment.swift         # Login shell resolution, env var sanitization
│   └── Bridge/
│       ├── SupersetSchemeHandler.swift     # WKURLSchemeHandler — data plane
│       ├── ControlMessageHandler.swift    # WKScriptMessageHandler — control plane
│       └── OutputBatcher.swift            # Accumulate + debounce PTY output
├── Resources/WebContent/                  # Built by esbuild (not checked in)
│   ├── index.html
│   ├── terminal.js
│   └── xterm.css
├── web-src/                               # JS source
│   ├── terminal-bridge.ts                 # xterm.js init, session lifecycle
│   ├── superset-bridge.ts                 # fetch/postMessage protocol layer
│   └── esbuild.config.ts                 # Build config
├── Tests/
│   ├── PTYSessionTests.swift
│   └── OutputBatcherTests.swift
├── Package.swift                          # SPM (no external deps)
└── package.json                           # Monorepo integration (xterm.js deps, build scripts)
```

## Components

### PTYSession

Wraps `forkpty()` from Darwin. Manages one pseudo-terminal session.

- **Creation:** `forkpty(&fd, nil, nil, &winsize)` → child `execve(shell)`, parent gets `masterFd`
- **Reading:** `DispatchSourceRead` on `masterFd`, reads up to 16KB per event, forwards to `OutputBatcher`
- **Writing:** `Darwin.write(masterFd, data)` — synchronous, called from scheme handler thread
- **Resize:** `ioctl(masterFd, TIOCSWINSZ, &winsize)` → kernel sends `SIGWINCH` to child
- **Exit detection:** `DispatchSourceProcess(.exit)` on `childPid` → `waitpid` → state transition
- **State:** `.active` | `.exited(code, signal)` | `.disposed`
- **fd is non-blocking:** `fcntl(fd, F_SETFL, O_NONBLOCK)` after fork

### PTYSessionManager

Singleton registry. Thread-safe via `NSLock`.

- `createSession(id, cwd, onBatchReady)` → creates `PTYSession` + `OutputBatcher`, wires them together
- `session(for: id)` → lookup
- `destroySession(id)` → kill child, cancel sources, remove from registry

### ShellEnvironment

Resolves login shell and builds a clean environment. Ports logic from `packages/host-service/src/terminal/clean-shell-env.ts`:

- Shell: `$SHELL` or `/bin/zsh`
- Args: `["--login", "-i"]`
- Env: bootstrap keys only (`HOME`, `USER`, `PATH`, `LANG`, `SHELL`, etc.), augmented with Homebrew paths
- Terminal: `TERM=xterm-256color`, `COLORTERM=truecolor`
- Anti-tmux: `ZSH_TMUX_AUTOSTART=false`

### SupersetSchemeHandler

Implements `WKURLSchemeHandler`. Routes requests by URL path.

- **stream:** Sends `HTTPURLResponse` with `Transfer-Encoding: chunked`, keeps task alive. `sendBatch()` calls `task.didReceive(data)` to append chunks. `finishStream()` sends exit trailer and calls `task.didFinish()`.
- **input:** Reads `httpBody`, writes to PTY, returns 204.
- Thread safety: `activeStreams` dict protected by lock.

### OutputBatcher

Per-session accumulator. Configured with:
- `minFlushBytes = 4096` (4KB)
- `maxFlushBytes = 16384` (16KB)
- `debounceInterval = 0.012` (12ms)

Uses `DispatchSourceTimer` on a `.userInteractive` QoS queue. Timer is created on first `append()`, cancelled on `flush()`.

### ControlMessageHandler

Handles `WKScriptMessage` from JS `postMessage`. Dispatches by `action` field to `PTYSessionManager`.

### MainWindowController

- Creates `NSWindow` with `setFrameAutosaveName` for position persistence
- Configures `WKWebViewConfiguration` with scheme handler and message handler
- Loads `WebContent/index.html` from bundle via `loadFileURL`
- Triggers terminal creation via `evaluateJavaScript("__superset.initTerminal(...)")` after session is ready

### JS Bundle

**Dependencies:**
- `@xterm/xterm` ~6.1.0-beta
- `@xterm/addon-fit`
- `@xterm/addon-webgl`
- `@xterm/addon-unicode11`

**superset-bridge.ts** — protocol layer:
- `postControlMessage(msg)` — wraps `webkit.messageHandlers.superset.postMessage`
- `connectOutputStream(id, onData, onExit)` — `fetch` + `ReadableStream` reader loop, detects exit trailer
- `sendInput(id, data)` — `fetch` POST with raw body

**terminal-bridge.ts** — terminal management:
- `initTerminal(sessionId, container)` — creates Terminal, loads addons, wires input/output
- `destroyTerminal(sessionId)` — disposes Terminal
- Exposes `window.__superset` for Swift to call
- Sends `ready` message on load

**Build:** esbuild, target `safari17`, ESM format, minified, sourcemapped. Output: `Resources/WebContent/terminal.js`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| PTY exits | DispatchSourceProcess fires → flush batcher → send exit trailer → JS shows `[Process exited with code N]` |
| forkpty fails | PTYError thrown → logged via os_log → JS notified via evaluateJavaScript fallback |
| WebView crashes | `webViewWebContentProcessDidTerminate` → reload WebView → reconnect to still-alive PTY sessions |
| Write to exited PTY | Silently dropped (PTYSession checks state) |
| App termination | SIGHUP all child processes, cancel DispatchSources, close fds |

## Constraints

- **macOS 15 (Sequoia) minimum** — Swift 6, Safari 18 WebKit
- **No external Swift dependencies** — Foundation, WebKit, Darwin are sufficient
- **No React** — JS bundle is pure xterm.js + bridge
- **No host-service** — Phase 3 concern
- **Single terminal** — multi-terminal is Phase 2
- **AppKit for windowing** — SwiftUI for native UI comes in Phase 4

## Build Integration

**package.json scripts:**
- `build:web` — esbuild → `Resources/WebContent/`
- `build:swift` — xcodebuild
- `build` — both in sequence
- `dev:web` — esbuild `--watch`

**Xcode:** Run Script build phase calls `bun run build:web` before "Compile Sources". WebContent directory is a folder reference in "Copy Bundle Resources".

**Turbo:** `@superset/desktop-swift#build` depends on `build:web` output.

## Verification

1. **Build:** `bun run build:web` produces `Resources/WebContent/terminal.js` without errors
2. **Launch:** Swift app opens a window, WKWebView loads, JS sends `ready` message
3. **Terminal:** Type `echo hello` → see output. Type `ls -la` → see file listing. Colors work (`TERM=xterm-256color`)
4. **Resize:** Drag window corner → terminal reflows (FitAddon + SIGWINCH)
5. **Exit:** Type `exit` → see `[Process exited]` message
6. **Performance:** `cat` a 1MB file → output streams smoothly without freezing
7. **WebView crash recovery:** Force-kill WebContent process via Activity Monitor → WebView reloads, terminal reconnects

## Reference Files

- `packages/host-service/src/terminal/clean-shell-env.ts` — shell env sanitization logic to port
- `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` — xterm.js config reference
- `apps/desktop/src/renderer/lib/terminal/appearance/index.ts` — terminal font/theme defaults
- `apps/desktop/src/main/lib/terminal/session.ts` — legacy in-process PTY reference
- `apps/desktop/src/main/lib/terminal-host/types.ts` — terminal protocol types reference
