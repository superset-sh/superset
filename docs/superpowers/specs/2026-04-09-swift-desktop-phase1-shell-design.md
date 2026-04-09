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
│  ├─ FitAddon + WebglAddon (optional) + Unicode11│
│  └─ superset-bridge.ts (fetch + postMessage)  │
└──────────────────────────────────────────────┘
```

### Data Flow

**PTY output → screen:**

```
PTY fd
  → DispatchSourceRead (16KB buffer reads)
  → OutputBatcher (accumulates 4-16KB, flushes on 12ms debounce or 16KB ceiling)
  → SupersetSchemeHandler.sendBatch() → task.didReceive(framed data)
  → WKWebView fetch() ReadableStream → reader.read()
  → frame parser → xterm.js term.write(data)
```

**Keyboard input → PTY:**

```
xterm.js onData
  → fetch("superset://terminal/input/{id}", POST, raw bytes)
  → SupersetSchemeHandler.handleInput()
  → PTYSession.write(fd) with backpressure handling
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
| `superset://terminal/stream/{sessionId}` | GET | Swift→JS | Length-prefixed binary frames (see below) | Long-lived (one per session) |
| `superset://terminal/input/{sessionId}` | POST | JS→Swift | Raw bytes (keyboard data) | Short-lived (one per keystroke batch) |

**Important:** This design depends on `fetch().body.getReader()` receiving incremental chunks from `task.didReceive()` calls before `task.didFinish()`. Implementation Step 0 is a spike to validate this assumption. If WebKit buffers custom-scheme responses fully, the fallback is `evaluateJavaScript` with base64-encoded batches — functionally equivalent but with higher per-call overhead.

### Stream Frame Format

The stream uses **length-prefixed binary frames** to cleanly separate PTY data from lifecycle events. Raw PTY output can contain any byte sequence, so in-band signaling (like JSON trailers in a raw stream) is unreliable.

```
[1 byte type][4 bytes big-endian payload length][payload bytes]
```

| Type byte | Name | Payload |
|-----------|------|---------|
| `0x01` | data | Raw PTY output bytes |
| `0x02` | exit | UTF-8 JSON: `{"code":N,"signal":N}` |
| `0x03` | error | UTF-8 error message string |

JS parser pseudocode:

```typescript
async function readFrames(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let buf = new Uint8Array(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf = concat(buf, value);
    while (buf.length >= 5) {
      const type = buf[0];
      const len = (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4];
      if (buf.length < 5 + len) break; // incomplete frame
      const payload = buf.slice(5, 5 + len);
      buf = buf.slice(5 + len);
      handleFrame(type, payload);
    }
  }
}
```

Swift sends frames via `OutputBatcher` which accumulates raw PTY bytes and wraps them in `0x01` data frames on flush. Exit and error frames are sent directly by `SupersetSchemeHandler`.

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

Each flush wraps accumulated bytes in a `0x01` data frame (5-byte header + payload). Multiple flushes produce multiple frames in the same chunked response.

## Project Structure

```
apps/desktop-swift/
├── SupersetShell.xcodeproj/               # Xcode project (source of truth for builds)
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
│       └── OutputBatcher.swift            # Accumulate + debounce PTY output, frame wrapping
├── Resources/WebContent/                  # Built by esbuild (not checked in, .gitignored)
│   ├── index.html
│   ├── terminal.js
│   └── xterm.css
├── web-src/                               # JS source
│   ├── terminal-bridge.ts                 # xterm.js init, session lifecycle
│   ├── superset-bridge.ts                 # fetch/postMessage protocol layer + frame parser
│   └── esbuild.config.ts                 # Build config
├── Tests/
│   ├── PTYSessionTests.swift
│   └── OutputBatcherTests.swift
└── package.json                           # Monorepo integration (xterm.js deps, build scripts)
```

**Build ownership:** Xcode app target is the source of truth. No `Package.swift` — all Swift sources live directly in the Xcode project. Resource bundling and code signing go through Xcode. For CI: `xcodebuild -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Release build`.

## Components

### PTYSession

Wraps `forkpty()` from Darwin. Manages one pseudo-terminal session.

- **Creation:** `forkpty(&fd, nil, nil, &winsize)` → child `execve(shell)`, parent gets `masterFd`
- **Reading:** `DispatchSourceRead` on `masterFd`, reads up to 16KB per event, forwards to `OutputBatcher`
- **Writing:** see "Write Backpressure" below
- **Resize:** `ioctl(masterFd, TIOCSWINSZ, &winsize)` → kernel sends `SIGWINCH` to child
- **Exit detection:** `DispatchSourceProcess(.exit)` on `childPid` → `waitpid` → state transition
- **State:** `.active` | `.exited(code, signal)` | `.disposed`
- **fd is non-blocking:** `fcntl(fd, F_SETFL, O_NONBLOCK)` after fork

#### Write Backpressure

PTY master fd is non-blocking. `Darwin.write()` may return partial writes or `EAGAIN`:

- **Partial write:** immediately retry the remaining bytes
- **`EAGAIN`:** enqueue data in a per-session write buffer (max 64KB), arm a `DispatchSourceWrite` on `masterFd` to drain when writable
- **Write buffer overflow (>64KB):** drop oldest enqueued data, log warning via `os_log`. This handles pathological scenarios like pasting megabytes of text.
- **Write after exit:** silently dropped (`PTYSession` checks `.active` state before writing)

### PTYSessionManager

Singleton registry. Thread-safe via `NSLock`.

- `createSession(id, cwd, onBatchReady)` → creates `PTYSession` + `OutputBatcher`, wires them together
- `session(for: id)` → lookup
- `destroySession(id)` → kill child, cancel sources, remove from registry

**Multi-session by design:** The manager and protocol support multiple concurrent sessions. This is an intentional investment for Phase 2 compatibility. Phase 1 UI creates exactly one session at launch, but the infrastructure is session-multiplexed from the start.

### ShellEnvironment

Resolves login shell and builds a clean environment. Ports logic from `packages/host-service/src/terminal/clean-shell-env.ts`:

- Shell: `$SHELL` or `/bin/zsh`
- Args: `["--login", "-i"]`
- Env: bootstrap keys only (`HOME`, `USER`, `PATH`, `LANG`, `SHELL`, etc.), augmented with Homebrew paths
- Terminal: `TERM=xterm-256color`, `COLORTERM=truecolor`
- Anti-tmux: `ZSH_TMUX_AUTOSTART=false`

**Known Phase 1 limitation:** The Electron app resolves a full login shell environment by spawning a shell and capturing its env vars. Phase 1 uses a simpler bootstrap approach — some user shell-init behavior (custom env vars set in `.zshrc`/`.bash_profile`) may not carry over. Full env capture is a Phase 2 enhancement.

### SupersetSchemeHandler

Implements `WKURLSchemeHandler`. Routes requests by URL path.

- **stream:** Sends `HTTPURLResponse` with `Content-Type: application/octet-stream`, keeps task alive. On connection, flushes the session's replay buffer as the first `didReceive` call. Subsequent `sendBatch()` calls append framed data chunks. `finishStream()` sends an exit frame (`0x02`) and calls `task.didFinish()`.
- **input:** Reads `httpBody`, writes to PTY (with backpressure handling), returns 204.
- **error delivery:** Sends an error frame (`0x03`) through the stream for create/write failures. `evaluateJavaScript` is reserved only for fatal startup errors (WebContent failed to load).
- Thread safety: `activeStreams` dict protected by lock.

### OutputBatcher

Per-session accumulator. Configured with:
- `maxFlushBytes = 16384` (16KB)
- `debounceInterval = 0.012` (12ms)
- `replayBufferLimit = 262144` (256KB)

Uses `DispatchSourceTimer` on a `.userInteractive` QoS queue. Timer is created on first `append()`, cancelled on `flush()`.

**Replay buffer:** The batcher maintains a circular replay buffer (last 256KB of PTY output). When a new stream consumer connects (initial connection or after WebView crash recovery), the replay buffer is flushed as the first delivery. This ensures the first shell prompt and early output are never lost, regardless of timing between PTY creation and stream attachment.

**Frame wrapping:** On each flush, raw accumulated bytes are wrapped in a `0x01` data frame (5-byte header prepended) before delivery to the scheme handler.

### ControlMessageHandler

Handles `WKScriptMessage` from JS `postMessage`. Dispatches by `action` field to `PTYSessionManager`.

### MainWindowController

- Creates `NSWindow` with `setFrameAutosaveName` for position persistence
- Configures `WKWebViewConfiguration` with scheme handler and message handler
- Loads `WebContent/index.html` from bundle via `loadFileURL`
- Implements `WKNavigationDelegate` for crash recovery (see Error Handling)
- Triggers terminal creation via `evaluateJavaScript("__superset.initTerminal(...)")` after session is ready

### JS Bundle

**Dependencies:**
- `@xterm/xterm` ~6.1.0-beta
- `@xterm/addon-fit`
- `@xterm/addon-webgl` (optional — loaded in try/catch, canvas fallback is automatic)
- `@xterm/addon-unicode11`

WebglAddon is an optimization, not a requirement. If WebGL context creation fails (unsupported GPU, resource limits), xterm.js falls back to its default canvas renderer automatically. The JS code wraps addon loading in try/catch.

**superset-bridge.ts** — protocol layer:
- `postControlMessage(msg)` — wraps `webkit.messageHandlers.superset.postMessage`
- `connectOutputStream(id, onData, onExit, onError)` — `fetch` + `ReadableStream` reader loop with frame parser
- `sendInput(id, data)` — `fetch` POST with raw body

**terminal-bridge.ts** — terminal management:
- `initTerminal(sessionId, container)` — creates Terminal, loads addons, wires input/output via bridge
- `destroyTerminal(sessionId)` — disposes Terminal
- Exposes `window.__superset` for Swift to call
- Sends `ready` message on load

**Build:** esbuild, target `safari17`, ESM format, minified, sourcemapped. Output: `Resources/WebContent/terminal.js`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| PTY exits | DispatchSourceProcess fires → flush batcher → send `0x02` exit frame → JS shows `[Process exited with code N]`. Session stays in registry (exited state) — does not block future reconnect or restart. |
| forkpty fails | PTYError thrown → `0x03` error frame sent through stream if connected, otherwise `evaluateJavaScript` fallback → JS displays error |
| WebView crash | See "WebView Crash Recovery" below |
| Write to exited PTY | Silently dropped (PTYSession checks state) |
| Write EAGAIN | Enqueued in write buffer, drained via DispatchSourceWrite (see Write Backpressure) |
| App termination | SIGHUP all child processes, cancel DispatchSources, close fds |

### WebView Crash Recovery

Scope: **WebContent-process loss only.** If the Swift app process itself exits, all PTY sessions are lost. App-relaunch persistence is not a Phase 1 goal.

When the WebKit WebContent process crashes:

1. `webViewWebContentProcessDidTerminate(_:)` fires on `MainWindowController`
2. Swift invalidates all `activeStreams` entries (the `WKURLSchemeTask` objects are dead)
3. Swift calls `webView.reload()` to restart the WebContent process
4. After reload, JS sends `ready` → Swift responds by calling `evaluateJavaScript("__superset.initTerminal(...)")` for each session still in `.active` state
5. JS reconnects by fetching `superset://terminal/stream/{id}` → Swift delivers the replay buffer (last 256KB) as the first chunk, then resumes live streaming
6. Batches emitted during the reload window (between crash and reconnect) are lost, but the replay buffer covers the gap — user sees continuous terminal history

This is testable: force-kill the WebContent process via Activity Monitor, verify terminal reappears with history intact.

## Constraints

- **macOS 15 (Sequoia) minimum** — Swift 6, Safari 18 WebKit
- **No external Swift dependencies** — Foundation, WebKit, Darwin are sufficient
- **No React** — JS bundle is pure xterm.js + bridge
- **No host-service** — Phase 3 concern
- **Single terminal UI** — multi-terminal UI is Phase 2 (but session manager is multi-session from the start)
- **AppKit for windowing** — SwiftUI for native UI comes in Phase 4
- **Simplified shell env** — bootstrap keys only, full login-shell env capture is Phase 2

## Build Integration

**package.json scripts:**
- `build:web` — esbuild → `Resources/WebContent/`
- `build:swift` — `xcodebuild -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Release build`
- `build` — both in sequence
- `dev:web` — esbuild `--watch`

**Xcode:** Run Script build phase calls `bun run build:web` before "Compile Sources". WebContent directory is a folder reference in "Copy Bundle Resources".

**Turbo:** `@superset/desktop-swift#build` depends on `build:web` output.

## Verification

### Happy Path

1. **Build:** `bun run build:web` produces `Resources/WebContent/terminal.js` without errors
2. **Launch:** Swift app opens a window, WKWebView loads, JS sends `ready` message
3. **Terminal:** Type `echo hello` → see output. Type `ls -la` → see file listing. Colors work (`TERM=xterm-256color`)
4. **Resize:** Drag window corner → terminal reflows (FitAddon + SIGWINCH)
5. **Exit:** Type `exit` → see `[Process exited with code 0]`
6. **Performance:** `cat` a 1MB file → output streams smoothly without freezing

### Edge Cases

7. **Startup output:** First shell prompt is visible immediately — no lost output between PTY creation and stream attachment (replay buffer)
8. **Large paste:** Paste 100KB of text into terminal → arrives without truncation (write backpressure handles partial writes)
9. **WebView crash recovery:** Force-kill WebContent process via Activity Monitor → WebView reloads, terminal reappears with history, typing resumes
10. **Session exit lifecycle:** After `exit`, session is in exited state but not destroyed — no crashes or errors on subsequent UI interactions

### Spike (Step 0)

11. **WKURLSchemeHandler streaming validation:** Minimal Swift app confirms that `task.didReceive(data)` called multiple times before `task.didFinish()` delivers incremental chunks to JS `ReadableStream.read()`. If this fails, switch to `evaluateJavaScript` + base64 fallback and update the spec.

## Reference Files

- `packages/host-service/src/terminal/clean-shell-env.ts` — shell env sanitization logic to port
- `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` — xterm.js config reference
- `apps/desktop/src/renderer/lib/terminal/appearance/index.ts` — terminal font/theme defaults
- `apps/desktop/src/main/lib/terminal/session.ts` — legacy in-process PTY reference
- `apps/desktop/src/main/lib/terminal-host/types.ts` — terminal protocol types reference
