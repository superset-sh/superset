# Phase 1: Swift Desktop Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native macOS Swift app with one WKWebView hosting xterm.js, PTY in Swift via `forkpty()`, and a high-throughput `WKURLSchemeHandler` bridge — proving the architecture before Phase 2.

**Architecture:** Single-process Swift app. NSWindow holds a WKWebView that renders xterm.js terminals. PTY sessions live in Swift (`forkpty` + `DispatchSourceRead`). Data flows through a custom `superset://` URL scheme with length-prefixed binary framing. Control messages (create/resize/destroy) go through `WKScriptMessageHandler`.

**Tech Stack:** Swift 6, AppKit, WebKit (WKWebView), Darwin (`forkpty`), esbuild, xterm.js 6.1.0-beta

**Spec:** `docs/superpowers/specs/2026-04-09-swift-desktop-phase1-shell-design.md`

---

## File Map

```
apps/desktop-swift/
├── SupersetShell.xcodeproj/           # Task 2 creates this
├── Sources/
│   ├── App/
│   │   ├── SupersetApp.swift          # Task 3: @main entry, NSApplicationDelegate
│   │   └── MainWindowController.swift # Task 9: NSWindow + WKWebView setup + crash recovery
│   ├── PTY/
│   │   ├── PTYSession.swift           # Task 4: forkpty wrapper, read/write/resize/exit
│   │   ├── PTYSessionManager.swift    # Task 5: session registry, create/destroy/lookup
│   │   └── ShellEnvironment.swift     # Task 6: shell resolution, env sanitization
│   └── Bridge/
│       ├── OutputBatcher.swift        # Task 7: accumulate + debounce + frame wrapping
│       ├── SupersetSchemeHandler.swift # Task 8: WKURLSchemeHandler, stream + input endpoints
│       └── ControlMessageHandler.swift# Task 9: WKScriptMessageHandler, dispatches to manager
├── Resources/WebContent/              # Task 2 creates dir, Task 10 populates via build
│   ├── index.html                     # Task 10
│   ├── terminal.js                    # Task 10 (esbuild output)
│   └── xterm.css                      # Task 10
├── web-src/                           # Task 10-11: JS source
│   ├── superset-bridge.ts             # Task 10: frame parser + fetch/postMessage protocol
│   ├── terminal-bridge.ts             # Task 11: xterm.js init, session lifecycle
│   ├── esbuild.config.ts             # Task 10: build config
│   └── tsconfig.json                  # Task 10
├── Tests/
│   ├── OutputBatcherTests.swift       # Task 7
│   └── PTYSessionTests.swift          # Task 4
├── package.json                       # Task 2: monorepo integration
└── .gitignore                         # Task 2
```

---

## Task 0: WKURLSchemeHandler Streaming Spike

**Purpose:** Validate that `task.didReceive(data)` called multiple times before `task.didFinish()` delivers incremental chunks to JS `ReadableStream.read()`. This is the critical assumption the entire bridge design rests on.

**Files:**
- Create: `apps/desktop-swift/spike/SpikeApp.swift`
- Create: `apps/desktop-swift/spike/spike.html`

- [ ] **Step 1: Create spike directory**

```bash
mkdir -p apps/desktop-swift/spike
```

- [ ] **Step 2: Write the spike Swift app**

Write `apps/desktop-swift/spike/SpikeApp.swift`:

```swift
import AppKit
import WebKit

final class SpikeSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }

        if url.path == "/stream" {
            let response = HTTPURLResponse(
                url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/octet-stream"]
            )!
            urlSchemeTask.didReceive(response)

            // Send 5 chunks with 100ms delay between each
            var count = 0
            Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
                count += 1
                let chunk = "chunk-\(count)\n".data(using: .utf8)!
                urlSchemeTask.didReceive(chunk)
                if count >= 5 {
                    timer.invalidate()
                    urlSchemeTask.didFinish()
                }
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class SpikeDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SpikeSchemeHandler(), forURLScheme: "spike")

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 400),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered, defer: false
        )
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        window.contentView!.addSubview(webView)

        let html = try! String(contentsOfFile: Bundle.main.bundlePath + "/spike.html", encoding: .utf8)
        webView.loadHTMLString(html, baseURL: URL(string: "spike://host/")!)
        window.center()
        window.makeKeyAndOrderFront(nil)
    }
}

let app = NSApplication.shared
let delegate = SpikeDelegate()
app.delegate = delegate
app.run()
```

- [ ] **Step 3: Write the spike HTML**

Write `apps/desktop-swift/spike/spike.html`:

```html
<!DOCTYPE html>
<html>
<body>
<pre id="log"></pre>
<script>
const log = document.getElementById("log");
function addLog(msg) { log.textContent += msg + "\n"; }

async function testStream() {
  addLog("Starting fetch...");
  const response = await fetch("spike://host/stream");
  addLog("Got response, reading stream...");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) { addLog("Stream finished."); break; }
    addLog("RECEIVED: " + decoder.decode(value).trim());
  }
  addLog("RESULT: If you see 5 separate RECEIVED lines, streaming works!");
}

testStream().catch(e => addLog("ERROR: " + e.message));
</script>
</body>
</html>
```

- [ ] **Step 4: Build and run the spike**

```bash
cd apps/desktop-swift/spike
swiftc -framework AppKit -framework WebKit SpikeApp.swift -o spike_test
# Copy spike.html into same directory as binary
./spike_test
```

- [ ] **Step 5: Evaluate result**

Expected output in the window:
```
Starting fetch...
Got response, reading stream...
RECEIVED: chunk-1
RECEIVED: chunk-2
RECEIVED: chunk-3
RECEIVED: chunk-4
RECEIVED: chunk-5
Stream finished.
RESULT: If you see 5 separate RECEIVED lines, streaming works!
```

If you see all 5 chunks arriving incrementally: **streaming works**, proceed with the plan as-is.

If all chunks arrive at once after `didFinish()`: **WebKit buffers custom-scheme responses**. In that case, stop and switch to the `evaluateJavaScript` + base64 fallback described in the spec. Update `SupersetSchemeHandler` to call `evaluateJavaScript("__superset.receiveBatch(sessionId, base64Data)")` instead of using chunked responses.

- [ ] **Step 6: Clean up spike**

```bash
rm -rf apps/desktop-swift/spike
```

- [ ] **Step 7: Commit**

```bash
git add -A apps/desktop-swift/
git commit -m "spike: validate WKURLSchemeHandler incremental streaming"
```

---

## Task 1: Scaffold JS Build System

**Purpose:** Set up the esbuild pipeline that produces `Resources/WebContent/` from `web-src/`. This must work before any Swift code needs it.

**Files:**
- Create: `apps/desktop-swift/package.json`
- Create: `apps/desktop-swift/web-src/tsconfig.json`
- Create: `apps/desktop-swift/web-src/esbuild.config.ts`
- Create: `apps/desktop-swift/web-src/index.html`
- Create: `apps/desktop-swift/web-src/xterm.css`
- Create: `apps/desktop-swift/.gitignore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/desktop-swift/web-src apps/desktop-swift/Resources/WebContent
```

- [ ] **Step 2: Write package.json**

Write `apps/desktop-swift/package.json`:

```json
{
  "name": "@superset/desktop-swift",
  "private": true,
  "scripts": {
    "build:web": "bun run web-src/esbuild.config.ts",
    "dev:web": "bun run web-src/esbuild.config.ts --watch",
    "build:swift": "xcodebuild -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Release build",
    "build": "bun run build:web && bun run build:swift",
    "clean": "rm -rf Resources/WebContent/*.js Resources/WebContent/*.js.map"
  },
  "dependencies": {
    "@xterm/xterm": "6.1.0-beta.195",
    "@xterm/addon-fit": "0.12.0-beta.195",
    "@xterm/addon-webgl": "0.20.0-beta.194",
    "@xterm/addon-unicode11": "0.10.0-beta.195"
  },
  "devDependencies": {
    "esbuild": "0.25.4",
    "typescript": "5.9.3"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

Write `apps/desktop-swift/web-src/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 4: Write esbuild config**

Write `apps/desktop-swift/web-src/esbuild.config.ts`:

```typescript
import { build, context } from "esbuild";
import { cpSync } from "node:fs";

const isWatch = process.argv.includes("--watch");
const outdir = "../Resources/WebContent";

// Copy static assets
cpSync("web-src/index.html", `${outdir}/index.html`);
cpSync("web-src/xterm.css", `${outdir}/xterm.css`);
// Also copy the xterm.js CSS from node_modules
cpSync("node_modules/@xterm/xterm/css/xterm.css", `${outdir}/xterm-lib.css`);

const options = {
  entryPoints: ["web-src/terminal-bridge.ts"],
  bundle: true,
  outfile: `${outdir}/terminal.js`,
  format: "esm" as const,
  target: "safari18.0",
  minify: !isWatch,
  sourcemap: true,
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(options);
  console.log("Build complete.");
}
```

- [ ] **Step 5: Write index.html**

Write `apps/desktop-swift/web-src/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="xterm-lib.css" />
  <link rel="stylesheet" href="xterm.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #151110; }
    #terminal-container { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="terminal-container"></div>
  <script type="module" src="terminal.js"></script>
</body>
</html>
```

- [ ] **Step 6: Write xterm.css overrides**

Write `apps/desktop-swift/web-src/xterm.css`:

```css
/* Custom overrides on top of xterm's built-in CSS */
.xterm {
  padding: 8px;
}
.xterm-viewport::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 7: Write placeholder terminal-bridge.ts for build verification**

Write `apps/desktop-swift/web-src/terminal-bridge.ts`:

```typescript
// Placeholder — replaced in Task 10-11
console.log("terminal-bridge loaded");
```

- [ ] **Step 8: Write .gitignore**

Write `apps/desktop-swift/.gitignore`:

```
# Built web assets
Resources/WebContent/terminal.js
Resources/WebContent/terminal.js.map
Resources/WebContent/xterm-lib.css

# Node
node_modules/

# Xcode
build/
DerivedData/
*.xcuserdata
*.xcworkspace

# macOS
.DS_Store
```

- [ ] **Step 9: Install dependencies and verify build**

```bash
cd apps/desktop-swift
bun install
bun run build:web
```

Expected: `Resources/WebContent/terminal.js` and `Resources/WebContent/index.html` exist.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop-swift/package.json apps/desktop-swift/web-src/ apps/desktop-swift/.gitignore apps/desktop-swift/Resources/WebContent/index.html apps/desktop-swift/Resources/WebContent/xterm.css
git commit -m "feat(desktop-swift): scaffold JS build system with esbuild + xterm.js"
```

---

## Task 2: Create Xcode Project Shell

**Purpose:** Create the Xcode project with correct targets, build phases, and a minimal app that opens a window. This is the skeleton everything else plugs into.

**Files:**
- Create: `apps/desktop-swift/SupersetShell.xcodeproj/` (via Xcode or `xcodegen`)
- Create: `apps/desktop-swift/Sources/App/SupersetApp.swift`

- [ ] **Step 1: Create Xcode project**

The simplest way is to generate it. If `xcodegen` is available:

Write `apps/desktop-swift/project.yml`:

```yaml
name: SupersetShell
options:
  bundleIdPrefix: sh.superset
  deploymentTarget:
    macOS: "15.0"
  xcodeVersion: "16.0"
settings:
  base:
    SWIFT_VERSION: "6.0"
    MACOSX_DEPLOYMENT_TARGET: "15.0"
    PRODUCT_BUNDLE_IDENTIFIER: sh.superset.shell
    PRODUCT_NAME: SupersetShell
    INFOPLIST_KEY_CFBundleDisplayName: Superset
    INFOPLIST_KEY_LSApplicationCategoryType: public.app-category.developer-tools
targets:
  SupersetShell:
    type: application
    platform: macOS
    sources:
      - Sources
    resources:
      - path: Resources/WebContent
        type: folder
    settings:
      base:
        CODE_SIGN_ENTITLEMENTS: ""
        ENABLE_APP_SANDBOX: false
    preBuildScripts:
      - name: Build Web Content
        script: |
          cd "$SRCROOT"
          if command -v bun &> /dev/null; then
            bun run build:web
          else
            echo "warning: bun not found, skipping web content build"
          fi
        basedOnDependencyAnalysis: false
```

```bash
cd apps/desktop-swift
xcodegen generate
```

If `xcodegen` is not available, create the project manually in Xcode:
1. File → New → Project → macOS → App → "SupersetShell"
2. Language: Swift, Interface: None (AppKit)
3. Set deployment target to macOS 15.0
4. Add `Sources/` as source group
5. Add `Resources/WebContent/` as folder reference
6. Add Run Script build phase before "Compile Sources": `cd "$SRCROOT" && bun run build:web`

- [ ] **Step 2: Write minimal app entry point**

Write `apps/desktop-swift/Sources/App/SupersetApp.swift`:

```swift
import AppKit

@main
struct SupersetApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Superset"
        window.center()
        window.setFrameAutosaveName("SupersetMainWindow")
        window.minSize = NSSize(width: 640, height: 480)
        window.makeKeyAndOrderFront(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
```

- [ ] **Step 3: Build and run**

```bash
cd apps/desktop-swift
xcodebuild -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Debug build
```

Expected: builds without errors, app launches and shows an empty window titled "Superset".

- [ ] **Step 4: Commit**

```bash
git add apps/desktop-swift/SupersetShell.xcodeproj apps/desktop-swift/Sources/App/SupersetApp.swift apps/desktop-swift/project.yml
git commit -m "feat(desktop-swift): create Xcode project with minimal app shell"
```

---

## Task 3: Implement PTYSession

**Purpose:** Core PTY wrapper: `forkpty()`, non-blocking reads via `DispatchSourceRead`, exit detection via `DispatchSourceProcess`, resize, write with backpressure.

**Files:**
- Create: `apps/desktop-swift/Sources/PTY/PTYSession.swift`
- Create: `apps/desktop-swift/Tests/PTYSessionTests.swift`

- [ ] **Step 1: Write PTYSession tests**

Write `apps/desktop-swift/Tests/PTYSessionTests.swift`:

```swift
import XCTest
@testable import SupersetShell

final class PTYSessionTests: XCTestCase {

    func testSessionProducesOutput() throws {
        let expectation = expectation(description: "Receives output")
        var receivedData = Data()

        let session = try PTYSession(
            sessionId: "test-1",
            shell: "/bin/echo",
            arguments: ["hello"],
            environment: ["PATH": "/usr/bin:/bin", "HOME": NSHomeDirectory()],
            cwd: NSTemporaryDirectory(),
            cols: 80,
            rows: 24,
            onOutput: { data in
                receivedData.append(data)
                if String(data: receivedData, encoding: .utf8)?.contains("hello") == true {
                    expectation.fulfill()
                }
            },
            onExit: { _, _ in }
        )

        wait(for: [expectation], timeout: 5.0)
        XCTAssertTrue(String(data: receivedData, encoding: .utf8)?.contains("hello") ?? false)
        _ = session // keep alive
    }

    func testSessionDetectsExit() throws {
        let exitExpectation = expectation(description: "Detects exit")
        var exitCode: Int32 = -1

        let session = try PTYSession(
            sessionId: "test-2",
            shell: "/usr/bin/true",
            arguments: [],
            environment: ["PATH": "/usr/bin:/bin", "HOME": NSHomeDirectory()],
            cwd: NSTemporaryDirectory(),
            cols: 80,
            rows: 24,
            onOutput: { _ in },
            onExit: { code, _ in
                exitCode = code
                exitExpectation.fulfill()
            }
        )

        wait(for: [exitExpectation], timeout: 5.0)
        XCTAssertEqual(exitCode, 0)
        if case .exited(let c, _) = session.state {
            XCTAssertEqual(c, 0)
        } else {
            XCTFail("Expected exited state")
        }
    }

    func testResize() throws {
        let session = try PTYSession(
            sessionId: "test-3",
            shell: "/bin/cat",
            arguments: [],
            environment: ["PATH": "/usr/bin:/bin", "HOME": NSHomeDirectory()],
            cwd: NSTemporaryDirectory(),
            cols: 80,
            rows: 24,
            onOutput: { _ in },
            onExit: { _, _ in }
        )

        // Should not crash
        session.resize(cols: 120, rows: 40)
        session.resize(cols: 20, rows: 5)

        session.kill()
    }

    func testWriteToSession() throws {
        let expectation = expectation(description: "Echo back input")
        var receivedData = Data()

        let session = try PTYSession(
            sessionId: "test-4",
            shell: "/bin/cat",
            arguments: [],
            environment: ["PATH": "/usr/bin:/bin", "HOME": NSHomeDirectory()],
            cwd: NSTemporaryDirectory(),
            cols: 80,
            rows: 24,
            onOutput: { data in
                receivedData.append(data)
                if String(data: receivedData, encoding: .utf8)?.contains("testinput") == true {
                    expectation.fulfill()
                }
            },
            onExit: { _, _ in }
        )

        session.write("testinput".data(using: .utf8)!)
        wait(for: [expectation], timeout: 5.0)
        session.kill()
    }

    func testWriteAfterExitIsIgnored() throws {
        let exitExpectation = expectation(description: "Exit")

        let session = try PTYSession(
            sessionId: "test-5",
            shell: "/usr/bin/true",
            arguments: [],
            environment: ["PATH": "/usr/bin:/bin", "HOME": NSHomeDirectory()],
            cwd: NSTemporaryDirectory(),
            cols: 80,
            rows: 24,
            onOutput: { _ in },
            onExit: { _, _ in exitExpectation.fulfill() }
        )

        wait(for: [exitExpectation], timeout: 5.0)
        // Should not crash
        session.write("data after exit".data(using: .utf8)!)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/desktop-swift
xcodebuild test -project SupersetShell.xcodeproj -scheme SupersetShell 2>&1 | tail -20
```

Expected: compilation errors — `PTYSession` does not exist yet.

- [ ] **Step 3: Implement PTYSession**

Write `apps/desktop-swift/Sources/PTY/PTYSession.swift`:

```swift
import Darwin
import Foundation
import os

enum PTYSessionState: Sendable {
    case active
    case exited(code: Int32, signal: Int32)
    case disposed
}

enum PTYError: Error {
    case forkFailed(errno: Int32)
}

final class PTYSession: @unchecked Sendable {
    let sessionId: String
    let masterFd: Int32
    let childPid: pid_t

    private(set) var state: PTYSessionState = .active
    private let readSource: DispatchSourceRead
    private let waitSource: DispatchSourceProcess
    private let outputCallback: @Sendable (Data) -> Void
    private let exitCallback: @Sendable (Int32, Int32) -> Void

    // Write backpressure
    private var writeBuffer = Data()
    private var writeSource: DispatchSourceWrite?
    private let writeLock = NSLock()
    private static let maxWriteBuffer = 65536 // 64KB

    private let logger = Logger(subsystem: "sh.superset.shell", category: "PTY")

    init(
        sessionId: String,
        shell: String,
        arguments: [String],
        environment: [String: String],
        cwd: String,
        cols: UInt16 = 80,
        rows: UInt16 = 24,
        onOutput: @escaping @Sendable (Data) -> Void,
        onExit: @escaping @Sendable (Int32, Int32) -> Void
    ) throws {
        self.sessionId = sessionId
        self.outputCallback = onOutput
        self.exitCallback = onExit

        var ws = winsize(ws_row: rows, ws_col: cols, ws_xpixel: 0, ws_ypixel: 0)
        var fd: Int32 = -1
        let pid = forkpty(&fd, nil, nil, &ws)

        guard pid >= 0 else {
            throw PTYError.forkFailed(errno: errno)
        }

        if pid == 0 {
            // Child process
            if chdir(cwd) != 0 {
                // Fall back to home directory
                let home = environment["HOME"] ?? "/"
                chdir(home)
            }

            // Build argv
            let allArgs = [shell] + arguments
            let cArgs = allArgs.map { strdup($0) } + [nil]
            defer { cArgs.forEach { $0.map { free($0) } } }

            // Build envp
            let cEnv = environment.map { strdup("\($0.key)=\($0.value)") } + [nil]
            defer { cEnv.forEach { $0.map { free($0) } } }

            execve(cArgs[0], cArgs, cEnv)
            _exit(1) // only reached if execve fails
        }

        // Parent process
        self.masterFd = fd
        self.childPid = pid

        // Non-blocking fd
        let flags = fcntl(fd, F_GETFL)
        fcntl(fd, F_SETFL, flags | O_NONBLOCK)

        // Read source
        let queue = DispatchQueue(label: "sh.superset.pty.read.\(sessionId)", qos: .userInteractive)
        self.readSource = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        readSource.setEventHandler { [weak self] in
            self?.handleReadable()
        }
        readSource.setCancelHandler { [fd] in
            close(fd)
        }

        // Wait source for child exit
        self.waitSource = DispatchSource.makeProcessSource(identifier: pid, eventMask: .exit, queue: .main)
        waitSource.setEventHandler { [weak self] in
            self?.handleChildExit()
        }

        readSource.resume()
        waitSource.resume()
    }

    private func handleReadable() {
        var buffer = [UInt8](repeating: 0, count: 16384)
        let bytesRead = read(masterFd, &buffer, buffer.count)

        if bytesRead > 0 {
            let data = Data(buffer[..<bytesRead])
            outputCallback(data)
        } else if bytesRead == 0 {
            // EOF
            readSource.cancel()
        } else if errno != EAGAIN && errno != EINTR {
            readSource.cancel()
        }
    }

    private func handleChildExit() {
        var status: Int32 = 0
        waitpid(childPid, &status, 0)
        let exitCode: Int32
        let sig: Int32
        if (status & 0x7f) == 0 {
            // WIFEXITED
            exitCode = (status >> 8) & 0xff // WEXITSTATUS
            sig = 0
        } else {
            // WIFSIGNALED
            exitCode = -1
            sig = status & 0x7f // WTERMSIG
        }
        state = .exited(code: exitCode, signal: sig)
        readSource.cancel()
        waitSource.cancel()
        exitCallback(exitCode, sig)
    }

    func write(_ data: Data) {
        guard case .active = state else { return }

        writeLock.lock()

        if writeBuffer.isEmpty {
            // Try direct write first
            let written = data.withUnsafeBytes { ptr -> Int in
                guard let base = ptr.baseAddress else { return 0 }
                return Darwin.write(masterFd, base, ptr.count)
            }

            if written == data.count {
                writeLock.unlock()
                return
            }

            // Partial write or EAGAIN — buffer the rest
            if written > 0 {
                writeBuffer.append(data[written...])
            } else if errno == EAGAIN || errno == EINTR {
                writeBuffer.append(data)
            } else {
                writeLock.unlock()
                return // write error, drop
            }

            // Enforce max buffer
            if writeBuffer.count > Self.maxWriteBuffer {
                let overflow = writeBuffer.count - Self.maxWriteBuffer
                writeBuffer = writeBuffer.dropFirst(overflow).asData
                logger.warning("Write buffer overflow, dropped \(overflow) bytes for session \(self.sessionId)")
            }

            armWriteSource()
            writeLock.unlock()
        } else {
            // Already buffering — append
            writeBuffer.append(data)
            if writeBuffer.count > Self.maxWriteBuffer {
                let overflow = writeBuffer.count - Self.maxWriteBuffer
                writeBuffer = writeBuffer.dropFirst(overflow).asData
                logger.warning("Write buffer overflow, dropped \(overflow) bytes for session \(self.sessionId)")
            }
            writeLock.unlock()
        }
    }

    private func armWriteSource() {
        // Caller holds writeLock
        guard writeSource == nil else { return }
        let source = DispatchSource.makeWriteSource(fileDescriptor: masterFd, queue: .global(qos: .userInteractive))
        source.setEventHandler { [weak self] in
            self?.drainWriteBuffer()
        }
        source.setCancelHandler { /* nothing */ }
        writeSource = source
        source.resume()
    }

    private func drainWriteBuffer() {
        writeLock.lock()
        guard !writeBuffer.isEmpty else {
            writeSource?.cancel()
            writeSource = nil
            writeLock.unlock()
            return
        }

        let written = writeBuffer.withUnsafeBytes { ptr -> Int in
            guard let base = ptr.baseAddress else { return 0 }
            return Darwin.write(masterFd, base, min(ptr.count, 16384))
        }

        if written > 0 {
            writeBuffer = writeBuffer.dropFirst(written).asData
        }

        if writeBuffer.isEmpty {
            writeSource?.cancel()
            writeSource = nil
        }

        writeLock.unlock()
    }

    func resize(cols: UInt16, rows: UInt16) {
        guard case .active = state else { return }
        var ws = winsize(ws_row: rows, ws_col: cols, ws_xpixel: 0, ws_ypixel: 0)
        ioctl(masterFd, TIOCSWINSZ, &ws)
    }

    func kill() {
        guard case .active = state else { return }
        state = .disposed
        Darwin.kill(childPid, SIGHUP)
        readSource.cancel()
        waitSource.cancel()
        writeLock.lock()
        writeSource?.cancel()
        writeSource = nil
        writeLock.unlock()
    }
}

private extension Data.SubSequence {
    var asData: Data { Data(self) }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/desktop-swift
xcodebuild test -project SupersetShell.xcodeproj -scheme SupersetShell 2>&1 | tail -30
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-swift/Sources/PTY/PTYSession.swift apps/desktop-swift/Tests/PTYSessionTests.swift
git commit -m "feat(desktop-swift): implement PTYSession with forkpty and write backpressure"
```

---

## Task 4: Implement ShellEnvironment

**Purpose:** Resolve the user's login shell and build a sanitized environment. Ports logic from `packages/host-service/src/terminal/clean-shell-env.ts`.

**Files:**
- Create: `apps/desktop-swift/Sources/PTY/ShellEnvironment.swift`

- [ ] **Step 1: Write ShellEnvironment**

Write `apps/desktop-swift/Sources/PTY/ShellEnvironment.swift`:

```swift
import Foundation

enum ShellEnvironment {

    /// Bootstrap keys inherited from the app's process environment.
    /// Matches SHELL_BOOTSTRAP_KEYS in clean-shell-env.ts.
    private static let bootstrapKeys: Set<String> = [
        "HOME", "USER", "LOGNAME", "SHELL", "PATH", "TMPDIR",
        "LANG", "LC_ALL", "LC_CTYPE",
        "__CF_USER_TEXT_ENCODING", "Apple_PubSub_Socket_Render",
        // SSH (critical for git operations)
        "SSH_AUTH_SOCK", "SSH_AGENT_PID",
        // Proxy
        "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
        "NO_PROXY", "no_proxy",
        // Language managers
        "NVM_DIR", "PYENV_ROOT", "GOPATH", "GOROOT", "CARGO_HOME",
        "RUSTUP_HOME", "BUN_INSTALL", "VOLTA_HOME",
        // Homebrew
        "HOMEBREW_PREFIX", "HOMEBREW_CELLAR", "HOMEBREW_REPOSITORY",
        // XDG
        "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
        // Editor
        "EDITOR", "VISUAL",
        // TLS
        "SSL_CERT_FILE", "SSL_CERT_DIR",
        // Git config (not credentials)
        "GIT_SSH_COMMAND",
    ]

    private static let commonMacOSPaths = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
    ]

    static func resolveLoginShell() -> String {
        ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
    }

    static func shellLaunchArgs(shell: String) -> [String] {
        if shell.hasSuffix("/zsh") || shell.hasSuffix("/bash") {
            return ["--login", "-i"]
        }
        return ["-i"]
    }

    static func buildTerminalEnv(cwd: String) -> [String: String] {
        let processEnv = ProcessInfo.processInfo.environment
        var env: [String: String] = [:]

        // Copy bootstrap keys
        for key in bootstrapKeys {
            if let val = processEnv[key] { env[key] = val }
        }

        // Augment PATH with Homebrew locations
        let currentPath = env["PATH"] ?? ""
        let existing = Set(currentPath.split(separator: ":").map(String.init))
        let missing = commonMacOSPaths.filter { !existing.contains($0) }
        if !missing.isEmpty {
            env["PATH"] = (missing + [currentPath]).filter { !$0.isEmpty }.joined(separator: ":")
        }

        // Terminal identity
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"
        env["TERM_PROGRAM"] = "Superset"
        env["TERM_PROGRAM_VERSION"] = "1.0.0"

        // CWD
        env["PWD"] = cwd

        // Prevent tmux auto-start
        env["DISABLE_AUTO_UPDATE"] = "true"
        env["ZSH_TMUX_AUTOSTARTED"] = "true"
        env["ZSH_TMUX_AUTOSTART"] = "false"

        // Light/dark hint for TUI apps
        env["COLORFGBG"] = "15;0" // dark theme default

        return env
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/desktop-swift
xcodebuild build -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Debug 2>&1 | tail -5
```

Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/desktop-swift/Sources/PTY/ShellEnvironment.swift
git commit -m "feat(desktop-swift): implement ShellEnvironment with bootstrap keys and PATH augmentation"
```

---

## Task 5: Implement PTYSessionManager

**Purpose:** Thread-safe session registry. Creates PTYSession + OutputBatcher pairs, manages lifecycle.

**Files:**
- Create: `apps/desktop-swift/Sources/PTY/PTYSessionManager.swift`

- [ ] **Step 1: Write PTYSessionManager**

Write `apps/desktop-swift/Sources/PTY/PTYSessionManager.swift`:

```swift
import Foundation
import os

final class PTYSessionManager: @unchecked Sendable {
    static let shared = PTYSessionManager()

    private var sessions: [String: PTYSession] = [:]
    private var batchers: [String: OutputBatcher] = [:]
    private let lock = NSLock()
    private let logger = Logger(subsystem: "sh.superset.shell", category: "SessionManager")

    private init() {}

    /// Creates a new PTY session with an OutputBatcher.
    /// `onBatchReady` is called on a background queue when a framed batch is ready for delivery.
    @discardableResult
    func createSession(
        sessionId: String,
        cwd: String,
        onBatchReady: @escaping @Sendable (String, Data) -> Void,
        onExit: @escaping @Sendable (String, Int32, Int32) -> Void
    ) throws -> PTYSession {
        lock.lock()
        defer { lock.unlock() }

        if let existing = sessions[sessionId] {
            logger.info("Session \(sessionId) already exists, returning existing")
            return existing
        }

        let batcher = OutputBatcher(sessionId: sessionId) { sid, framedData in
            onBatchReady(sid, framedData)
        }

        let shell = ShellEnvironment.resolveLoginShell()
        let args = ShellEnvironment.shellLaunchArgs(shell: shell)
        let env = ShellEnvironment.buildTerminalEnv(cwd: cwd)

        let session = try PTYSession(
            sessionId: sessionId,
            shell: shell,
            arguments: args,
            environment: env,
            cwd: cwd,
            onOutput: { data in
                batcher.append(data)
            },
            onExit: { [weak self] code, signal in
                batcher.flush()
                onExit(sessionId, code, signal)
                self?.logger.info("Session \(sessionId) exited: code=\(code) signal=\(signal)")
            }
        )

        sessions[sessionId] = session
        batchers[sessionId] = batcher
        logger.info("Created session \(sessionId) with shell \(shell) in \(cwd)")
        return session
    }

    func session(for id: String) -> PTYSession? {
        lock.lock()
        defer { lock.unlock() }
        return sessions[id]
    }

    func batcher(for id: String) -> OutputBatcher? {
        lock.lock()
        defer { lock.unlock() }
        return batchers[id]
    }

    /// Returns all session IDs currently in the registry (any state).
    func activeSessionIds() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return sessions.filter { _, session in
            if case .active = session.state { return true }
            return false
        }.map(\.key)
    }

    func destroySession(_ id: String) {
        lock.lock()
        let session = sessions.removeValue(forKey: id)
        let batcher = batchers.removeValue(forKey: id)
        lock.unlock()

        batcher?.cancel()
        session?.kill()
        logger.info("Destroyed session \(id)")
    }

    func destroyAll() {
        lock.lock()
        let allSessions = sessions
        let allBatchers = batchers
        sessions.removeAll()
        batchers.removeAll()
        lock.unlock()

        for (_, batcher) in allBatchers { batcher.cancel() }
        for (_, session) in allSessions { session.kill() }
        logger.info("Destroyed all sessions")
    }
}
```

- [ ] **Step 2: Verify it compiles**

Note: this depends on `OutputBatcher` which doesn't exist yet. Add a temporary stub or implement Task 6 first. If building out of order, create a placeholder:

```swift
// Temporary placeholder — replaced in Task 6
final class OutputBatcher: @unchecked Sendable {
    let sessionId: String
    init(sessionId: String, onFlush: @escaping @Sendable (String, Data) -> Void) {
        self.sessionId = sessionId
    }
    func append(_ data: Data) {}
    func flush() {}
    func cancel() {}
    func replayBuffer() -> Data? { nil }
}
```

```bash
cd apps/desktop-swift
xcodebuild build -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Debug 2>&1 | tail -5
```

Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/desktop-swift/Sources/PTY/PTYSessionManager.swift
git commit -m "feat(desktop-swift): implement PTYSessionManager registry"
```

---

## Task 6: Implement OutputBatcher

**Purpose:** Accumulates PTY output, wraps in length-prefixed binary frames, flushes on size/time thresholds, maintains replay buffer for crash recovery.

**Files:**
- Create: `apps/desktop-swift/Sources/Bridge/OutputBatcher.swift`
- Create: `apps/desktop-swift/Tests/OutputBatcherTests.swift`

- [ ] **Step 1: Write OutputBatcher tests**

Write `apps/desktop-swift/Tests/OutputBatcherTests.swift`:

```swift
import XCTest
@testable import SupersetShell

final class OutputBatcherTests: XCTestCase {

    func testFlushProducesFramedData() {
        let expectation = expectation(description: "Flushed")
        var flushedData = Data()

        let batcher = OutputBatcher(sessionId: "test") { _, data in
            flushedData = data
            expectation.fulfill()
        }

        batcher.append("hello".data(using: .utf8)!)
        batcher.flush()

        wait(for: [expectation], timeout: 1.0)

        // Frame: [0x01][4 bytes length][payload]
        XCTAssertEqual(flushedData[0], 0x01) // data frame type
        let length = UInt32(flushedData[1]) << 24 | UInt32(flushedData[2]) << 16
                   | UInt32(flushedData[3]) << 8  | UInt32(flushedData[4])
        XCTAssertEqual(length, 5) // "hello" is 5 bytes
        XCTAssertEqual(String(data: flushedData[5...], encoding: .utf8), "hello")
    }

    func testAutoFlushOnMaxSize() {
        let expectation = expectation(description: "Auto-flushed")

        let batcher = OutputBatcher(sessionId: "test") { _, _ in
            expectation.fulfill()
        }

        // Append more than maxFlushBytes (16KB)
        let bigData = Data(repeating: 0x41, count: 20000)
        batcher.append(bigData)

        wait(for: [expectation], timeout: 1.0)
    }

    func testReplayBuffer() {
        let batcher = OutputBatcher(sessionId: "test") { _, _ in }

        batcher.append("first".data(using: .utf8)!)
        batcher.flush()
        batcher.append("second".data(using: .utf8)!)
        batcher.flush()

        let replay = batcher.replayBuffer()
        XCTAssertNotNil(replay)
        let replayString = String(data: replay!, encoding: .utf8)!
        XCTAssertTrue(replayString.contains("first"))
        XCTAssertTrue(replayString.contains("second"))
    }

    func testEmptyFlushDoesNothing() {
        var flushCount = 0
        let batcher = OutputBatcher(sessionId: "test") { _, _ in
            flushCount += 1
        }

        batcher.flush()
        // Give time for any async operation
        Thread.sleep(forTimeInterval: 0.1)
        XCTAssertEqual(flushCount, 0)
    }

    func testExitFrame() {
        let frame = OutputBatcher.makeExitFrame(code: 42, signal: 0)
        XCTAssertEqual(frame[0], 0x02) // exit frame type
        let length = UInt32(frame[1]) << 24 | UInt32(frame[2]) << 16
                   | UInt32(frame[3]) << 8  | UInt32(frame[4])
        let payload = frame[5..<(5 + Int(length))]
        let json = try! JSONSerialization.jsonObject(with: Data(payload)) as! [String: Any]
        XCTAssertEqual(json["code"] as? Int, 42)
        XCTAssertEqual(json["signal"] as? Int, 0)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/desktop-swift
xcodebuild test -project SupersetShell.xcodeproj -scheme SupersetShell 2>&1 | tail -10
```

Expected: compile errors or test failures (OutputBatcher stub doesn't have frame logic).

- [ ] **Step 3: Implement OutputBatcher**

Write `apps/desktop-swift/Sources/Bridge/OutputBatcher.swift` (replacing any placeholder):

```swift
import Foundation
import os

final class OutputBatcher: @unchecked Sendable {
    let sessionId: String

    private let onFlush: @Sendable (String, Data) -> Void
    private var buffer = Data()
    private var replay = Data()
    private let lock = NSLock()
    private var timer: DispatchSourceTimer?
    private var cancelled = false

    static let maxFlushBytes = 16384       // 16 KB
    static let debounceInterval: TimeInterval = 0.012  // 12ms
    static let replayBufferLimit = 262144  // 256 KB

    // Frame types
    static let frameTypeData: UInt8 = 0x01
    static let frameTypeExit: UInt8 = 0x02
    static let frameTypeError: UInt8 = 0x03

    private let timerQueue = DispatchQueue(label: "sh.superset.batcher", qos: .userInteractive)
    private let logger = Logger(subsystem: "sh.superset.shell", category: "Batcher")

    init(sessionId: String, onFlush: @escaping @Sendable (String, Data) -> Void) {
        self.sessionId = sessionId
        self.onFlush = onFlush
    }

    func append(_ data: Data) {
        lock.lock()
        buffer.append(data)
        // Also append to replay buffer (raw, unframed)
        replay.append(data)
        if replay.count > Self.replayBufferLimit {
            replay = replay.suffix(Self.replayBufferLimit)
        }
        let size = buffer.count
        lock.unlock()

        if size >= Self.maxFlushBytes {
            flush()
        } else {
            scheduleTimer()
        }
    }

    func flush() {
        lock.lock()
        guard !buffer.isEmpty else { lock.unlock(); return }
        let chunk = buffer
        buffer = Data()
        cancelTimer()
        lock.unlock()

        let framed = Self.makeDataFrame(chunk)
        onFlush(sessionId, framed)
    }

    /// Returns a framed replay of all buffered raw output (for reconnect after WebView crash).
    func replayBuffer() -> Data? {
        lock.lock()
        let raw = replay
        lock.unlock()
        guard !raw.isEmpty else { return nil }
        return Self.makeDataFrame(raw)
    }

    func cancel() {
        lock.lock()
        cancelled = true
        cancelTimer()
        lock.unlock()
    }

    private func scheduleTimer() {
        lock.lock()
        guard timer == nil, !cancelled else { lock.unlock(); return }
        let t = DispatchSource.makeTimerSource(queue: timerQueue)
        t.schedule(deadline: .now() + Self.debounceInterval)
        t.setEventHandler { [weak self] in
            self?.flush()
        }
        timer = t
        t.resume()
        lock.unlock()
    }

    private func cancelTimer() {
        // Caller holds lock
        timer?.cancel()
        timer = nil
    }

    // MARK: - Frame construction

    /// Wraps raw payload in a length-prefixed frame: [type:1][length:4 BE][payload]
    static func makeFrame(type: UInt8, payload: Data) -> Data {
        var frame = Data(capacity: 5 + payload.count)
        frame.append(type)
        let len = UInt32(payload.count)
        frame.append(UInt8((len >> 24) & 0xff))
        frame.append(UInt8((len >> 16) & 0xff))
        frame.append(UInt8((len >> 8) & 0xff))
        frame.append(UInt8(len & 0xff))
        frame.append(payload)
        return frame
    }

    static func makeDataFrame(_ payload: Data) -> Data {
        makeFrame(type: frameTypeData, payload: payload)
    }

    static func makeExitFrame(code: Int32, signal: Int32) -> Data {
        let json = "{\"code\":\(code),\"signal\":\(signal)}"
        return makeFrame(type: frameTypeExit, payload: json.data(using: .utf8)!)
    }

    static func makeErrorFrame(message: String) -> Data {
        makeFrame(type: frameTypeError, payload: message.data(using: .utf8)!)
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/desktop-swift
xcodebuild test -project SupersetShell.xcodeproj -scheme SupersetShell 2>&1 | tail -20
```

Expected: all OutputBatcher tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-swift/Sources/Bridge/OutputBatcher.swift apps/desktop-swift/Tests/OutputBatcherTests.swift
git commit -m "feat(desktop-swift): implement OutputBatcher with framing and replay buffer"
```

---

## Task 7: Implement SupersetSchemeHandler

**Purpose:** `WKURLSchemeHandler` that routes `superset://terminal/stream/{id}` and `superset://terminal/input/{id}`.

**Files:**
- Create: `apps/desktop-swift/Sources/Bridge/SupersetSchemeHandler.swift`

- [ ] **Step 1: Write SupersetSchemeHandler**

Write `apps/desktop-swift/Sources/Bridge/SupersetSchemeHandler.swift`:

```swift
import WebKit
import os

final class SupersetSchemeHandler: NSObject, WKURLSchemeHandler {

    private let sessionManager = PTYSessionManager.shared
    private var activeStreams: [String: WKURLSchemeTask] = [:]
    private let lock = NSLock()
    private let logger = Logger(subsystem: "sh.superset.shell", category: "SchemeHandler")

    // MARK: - WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(SchemeError.invalidURL)
            return
        }

        let path = url.path
        let segments = path.split(separator: "/").map(String.init)

        // superset://terminal/stream/{sessionId}
        // superset://terminal/input/{sessionId}
        guard segments.count >= 2, segments[0] == "terminal" else {
            fail(urlSchemeTask, status: 404)
            return
        }

        let action = segments[1]
        let sessionId = segments.count > 2 ? segments[2] : ""

        switch action {
        case "stream":
            handleStream(sessionId: sessionId, task: urlSchemeTask)
        case "input":
            handleInput(sessionId: sessionId, task: urlSchemeTask)
        default:
            fail(urlSchemeTask, status: 404)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        lock.lock()
        for (id, task) in activeStreams {
            if task === urlSchemeTask {
                activeStreams.removeValue(forKey: id)
                break
            }
        }
        lock.unlock()
    }

    // MARK: - Stream (PTY output → JS)

    private func handleStream(sessionId: String, task: WKURLSchemeTask) {
        guard sessionManager.session(for: sessionId) != nil else {
            fail(task, status: 404)
            return
        }

        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": "application/octet-stream",
                "Cache-Control": "no-cache, no-store",
            ]
        )!
        task.didReceive(response)

        // Deliver replay buffer if available
        if let replay = sessionManager.batcher(for: sessionId)?.replayBuffer() {
            task.didReceive(replay)
        }

        lock.lock()
        activeStreams[sessionId] = task
        lock.unlock()

        logger.info("Stream connected for session \(sessionId)")
    }

    /// Called by the batcher when a framed batch is ready.
    func sendBatch(sessionId: String, data: Data) {
        lock.lock()
        guard let task = activeStreams[sessionId] else {
            lock.unlock()
            return
        }
        lock.unlock()

        task.didReceive(data)
    }

    /// Sends an exit frame and finishes the stream response.
    func finishStream(sessionId: String, exitCode: Int32, signal: Int32) {
        lock.lock()
        guard let task = activeStreams.removeValue(forKey: sessionId) else {
            lock.unlock()
            return
        }
        lock.unlock()

        let exitFrame = OutputBatcher.makeExitFrame(code: exitCode, signal: signal)
        task.didReceive(exitFrame)
        task.didFinish()
        logger.info("Stream finished for session \(sessionId)")
    }

    /// Invalidates all active streams (e.g., after WebView crash).
    func invalidateAllStreams() {
        lock.lock()
        let count = activeStreams.count
        activeStreams.removeAll()
        lock.unlock()
        logger.info("Invalidated \(count) active streams")
    }

    // MARK: - Input (JS → PTY)

    private func handleInput(sessionId: String, task: WKURLSchemeTask) {
        guard let session = sessionManager.session(for: sessionId) else {
            fail(task, status: 404)
            return
        }

        if let body = task.request.httpBody, !body.isEmpty {
            session.write(body)
        }

        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: 204,
            httpVersion: "HTTP/1.1",
            headerFields: nil
        )!
        task.didReceive(response)
        task.didFinish()
    }

    // MARK: - Helpers

    private func fail(_ task: WKURLSchemeTask, status: Int) {
        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: nil
        )!
        task.didReceive(response)
        task.didFinish()
    }
}

enum SchemeError: Error {
    case invalidURL
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/desktop-swift
xcodebuild build -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Debug 2>&1 | tail -5
```

Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/desktop-swift/Sources/Bridge/SupersetSchemeHandler.swift
git commit -m "feat(desktop-swift): implement SupersetSchemeHandler for stream and input endpoints"
```

---

## Task 8: Implement ControlMessageHandler and MainWindowController

**Purpose:** Wire everything together: WKScriptMessageHandler for control plane, MainWindowController for window + WebView + crash recovery.

**Files:**
- Create: `apps/desktop-swift/Sources/Bridge/ControlMessageHandler.swift`
- Modify: `apps/desktop-swift/Sources/App/MainWindowController.swift` (new file)
- Modify: `apps/desktop-swift/Sources/App/SupersetApp.swift` (update to use MainWindowController)

- [ ] **Step 1: Write ControlMessageHandler**

Write `apps/desktop-swift/Sources/Bridge/ControlMessageHandler.swift`:

```swift
import WebKit
import os

final class ControlMessageHandler: NSObject, WKScriptMessageHandler {

    private let sessionManager = PTYSessionManager.shared
    private weak var schemeHandler: SupersetSchemeHandler?
    private let logger = Logger(subsystem: "sh.superset.shell", category: "ControlHandler")

    init(schemeHandler: SupersetSchemeHandler) {
        self.schemeHandler = schemeHandler
    }

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            logger.warning("Invalid control message: \(String(describing: message.body))")
            return
        }

        switch action {
        case "createSession":
            handleCreateSession(body)
        case "destroySession":
            handleDestroySession(body)
        case "resize":
            handleResize(body)
        case "ready":
            logger.info("WebView JS layer ready")
        default:
            logger.warning("Unknown control action: \(action)")
        }
    }

    private func handleCreateSession(_ body: [String: Any]) {
        guard let sessionId = body["sessionId"] as? String,
              let cwd = body["cwd"] as? String else {
            logger.error("createSession missing sessionId or cwd")
            return
        }

        do {
            try sessionManager.createSession(
                sessionId: sessionId,
                cwd: cwd,
                onBatchReady: { [weak self] id, data in
                    DispatchQueue.main.async {
                        self?.schemeHandler?.sendBatch(sessionId: id, data: data)
                    }
                },
                onExit: { [weak self] id, code, signal in
                    DispatchQueue.main.async {
                        self?.schemeHandler?.finishStream(sessionId: id, exitCode: code, signal: signal)
                    }
                }
            )
            logger.info("Session \(sessionId) created via control message")
        } catch {
            logger.error("Failed to create session \(sessionId): \(error.localizedDescription)")
        }
    }

    private func handleDestroySession(_ body: [String: Any]) {
        guard let sessionId = body["sessionId"] as? String else { return }
        sessionManager.destroySession(sessionId)
    }

    private func handleResize(_ body: [String: Any]) {
        guard let sessionId = body["sessionId"] as? String,
              let cols = body["cols"] as? Int,
              let rows = body["rows"] as? Int else { return }
        sessionManager.session(for: sessionId)?.resize(
            cols: UInt16(clamping: max(1, cols)),
            rows: UInt16(clamping: max(1, rows))
        )
    }
}
```

- [ ] **Step 2: Write MainWindowController**

Write `apps/desktop-swift/Sources/App/MainWindowController.swift`:

```swift
import AppKit
import WebKit
import os

final class MainWindowController: NSObject, WKNavigationDelegate {

    let window: NSWindow
    private(set) var webView: WKWebView!
    private let schemeHandler = SupersetSchemeHandler()
    private var controlHandler: ControlMessageHandler!
    private let sessionManager = PTYSessionManager.shared
    private let logger = Logger(subsystem: "sh.superset.shell", category: "Window")

    override init() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init()

        window.title = "Superset"
        window.center()
        window.setFrameAutosaveName("SupersetMainWindow")
        window.minSize = NSSize(width: 640, height: 480)

        setupWebView()
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "superset")

        controlHandler = ControlMessageHandler(schemeHandler: schemeHandler)
        config.userContentController.add(controlHandler, name: "superset")

        // Allow developer tools in debug builds
        #if DEBUG
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        window.contentView!.addSubview(webView)
    }

    func loadWebContent() {
        guard let resourceURL = Bundle.main.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "WebContent"
        ) else {
            logger.fault("WebContent/index.html not found in app bundle")
            return
        }

        let directoryURL = resourceURL.deletingLastPathComponent()
        webView.loadFileURL(resourceURL, allowingReadAccessTo: directoryURL)
    }

    /// Creates a terminal session and tells JS to initialize it.
    func createTerminal(sessionId: String, cwd: String) {
        do {
            try sessionManager.createSession(
                sessionId: sessionId,
                cwd: cwd,
                onBatchReady: { [weak self] id, data in
                    DispatchQueue.main.async {
                        self?.schemeHandler.sendBatch(sessionId: id, data: data)
                    }
                },
                onExit: { [weak self] id, code, signal in
                    DispatchQueue.main.async {
                        self?.schemeHandler.finishStream(sessionId: id, exitCode: code, signal: signal)
                    }
                }
            )
        } catch {
            logger.error("Failed to create PTY session: \(error.localizedDescription)")
            return
        }

        let escapedId = sessionId.replacingOccurrences(of: "\"", with: "\\\"")
        webView.evaluateJavaScript("""
            if (window.__superset) {
                window.__superset.initTerminal("\(escapedId)", document.getElementById("terminal-container"));
            }
        """)
    }

    // MARK: - WKNavigationDelegate (crash recovery)

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        logger.warning("WebContent process terminated — reloading")
        schemeHandler.invalidateAllStreams()
        webView.reload()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // After initial load or reload, restore active terminal sessions
        let activeIds = sessionManager.activeSessionIds()
        if !activeIds.isEmpty {
            logger.info("Restoring \(activeIds.count) terminal sessions after navigation")
            for sessionId in activeIds {
                let escapedId = sessionId.replacingOccurrences(of: "\"", with: "\\\"")
                webView.evaluateJavaScript("""
                    if (window.__superset) {
                        window.__superset.initTerminal("\(escapedId)", document.getElementById("terminal-container"));
                    }
                """)
            }
        }
    }
}
```

- [ ] **Step 3: Update SupersetApp.swift to use MainWindowController**

Replace `apps/desktop-swift/Sources/App/SupersetApp.swift`:

```swift
import AppKit

@main
struct SupersetApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowController: MainWindowController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        windowController = MainWindowController()
        windowController.loadWebContent()
        windowController.window.makeKeyAndOrderFront(nil)

        // Phase 1: single terminal session pointing to home directory
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let sessionId = UUID().uuidString

        // Delay to let WebView finish loading — didFinish navigation handles restore,
        // but for initial launch we trigger after a short delay.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.windowController.createTerminal(sessionId: sessionId, cwd: home)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        PTYSessionManager.shared.destroyAll()
    }
}
```

- [ ] **Step 4: Build**

```bash
cd apps/desktop-swift
xcodebuild build -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Debug 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-swift/Sources/Bridge/ControlMessageHandler.swift apps/desktop-swift/Sources/App/MainWindowController.swift apps/desktop-swift/Sources/App/SupersetApp.swift
git commit -m "feat(desktop-swift): implement ControlMessageHandler and MainWindowController with crash recovery"
```

---

## Task 9: Implement JS Bridge (superset-bridge.ts)

**Purpose:** The JS side of the protocol: frame parser, fetch-based stream connection, postMessage control.

**Files:**
- Create: `apps/desktop-swift/web-src/superset-bridge.ts`

- [ ] **Step 1: Write superset-bridge.ts**

Write `apps/desktop-swift/web-src/superset-bridge.ts`:

```typescript
// Frame types (must match Swift OutputBatcher constants)
const FRAME_DATA = 0x01;
const FRAME_EXIT = 0x02;
const FRAME_ERROR = 0x03;

// --- Control Plane (WKScriptMessageHandler) ---

export function postControlMessage(msg: Record<string, unknown>): void {
  (window as any).webkit.messageHandlers.superset.postMessage(msg);
}

export function requestCreateSession(sessionId: string, cwd: string): void {
  postControlMessage({ action: "createSession", sessionId, cwd });
}

export function requestDestroySession(sessionId: string): void {
  postControlMessage({ action: "destroySession", sessionId });
}

export function requestResize(sessionId: string, cols: number, rows: number): void {
  postControlMessage({ action: "resize", sessionId, cols, rows });
}

export function signalReady(): void {
  postControlMessage({ action: "ready" });
}

// --- Data Plane (WKURLSchemeHandler) ---

export async function sendInput(sessionId: string, data: string): Promise<void> {
  const encoded = new TextEncoder().encode(data);
  await fetch(`superset://terminal/input/${sessionId}`, {
    method: "POST",
    body: encoded,
  });
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export interface StreamCallbacks {
  onData: (data: Uint8Array) => void;
  onExit: (code: number, signal: number) => void;
  onError: (message: string) => void;
}

/**
 * Connects to the PTY output stream for a session.
 * Returns when the stream ends (PTY exit or error).
 */
export async function connectOutputStream(
  sessionId: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const response = await fetch(`superset://terminal/stream/${sessionId}`);

  if (!response.ok || !response.body) {
    callbacks.onError(`Stream connection failed: ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  let buf = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf = concat(buf, value);

    // Parse frames from buffer
    while (buf.length >= 5) {
      const type = buf[0];
      const len =
        (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4];

      if (buf.length < 5 + len) break; // incomplete frame, wait for more data

      const payload = buf.slice(5, 5 + len);
      buf = buf.slice(5 + len);

      switch (type) {
        case FRAME_DATA:
          callbacks.onData(payload);
          break;

        case FRAME_EXIT: {
          const json = JSON.parse(new TextDecoder().decode(payload));
          callbacks.onExit(json.code, json.signal);
          return;
        }

        case FRAME_ERROR: {
          const message = new TextDecoder().decode(payload);
          callbacks.onError(message);
          return;
        }

        default:
          console.warn("Unknown frame type:", type);
      }
    }
  }
}
```

- [ ] **Step 2: Rebuild web content**

```bash
cd apps/desktop-swift
bun run build:web
```

Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop-swift/web-src/superset-bridge.ts
git commit -m "feat(desktop-swift): implement JS bridge with frame parser and stream connection"
```

---

## Task 10: Implement JS Terminal Bridge (terminal-bridge.ts)

**Purpose:** xterm.js initialization, addon loading, wiring to superset-bridge for I/O.

**Files:**
- Modify: `apps/desktop-swift/web-src/terminal-bridge.ts`

- [ ] **Step 1: Write terminal-bridge.ts**

Replace `apps/desktop-swift/web-src/terminal-bridge.ts`:

```typescript
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import * as bridge from "./superset-bridge";

interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
  container: HTMLElement;
  resizeObserver: ResizeObserver;
}

const terminals = new Map<string, TerminalEntry>();

const FONT_FAMILY = [
  "JetBrains Mono",
  "JetBrainsMono Nerd Font",
  "MesloLGM Nerd Font",
  "MesloLGM NF",
  "Menlo",
  "Monaco",
  "Courier New",
  "monospace",
].join(", ");

function initTerminal(sessionId: string, container: HTMLElement): void {
  // Destroy existing if re-initializing (e.g., after WebView crash recovery)
  const existing = terminals.get(sessionId);
  if (existing) {
    existing.resizeObserver.disconnect();
    existing.term.dispose();
    terminals.delete(sessionId);
  }

  const fitAddon = new FitAddon();
  const term = new Terminal({
    cols: 80,
    rows: 24,
    cursorBlink: true,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    allowProposedApi: true,
    scrollback: 10000,
    macOptionIsMeta: false,
    cursorStyle: "block",
    cursorInactiveStyle: "outline",
  });

  term.loadAddon(fitAddon);

  const unicode11 = new Unicode11Addon();
  term.loadAddon(unicode11);
  term.unicode.activeVersion = "11";

  term.open(container);

  // WebGL addon — optional optimization, canvas fallback is automatic
  requestAnimationFrame(() => {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        term.refresh(0, term.rows - 1);
      });
      term.loadAddon(webgl);
    } catch {
      // WebGL not available, canvas renderer used automatically
    }
  });

  fitAddon.fit();

  // Wire keyboard input → Swift PTY
  term.onData((data) => {
    bridge.sendInput(sessionId, data);
  });

  // Wire resize → Swift PTY
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    bridge.requestResize(sessionId, term.cols, term.rows);
  });
  resizeObserver.observe(container);

  terminals.set(sessionId, { term, fit: fitAddon, container, resizeObserver });

  // Connect PTY output stream
  bridge.connectOutputStream(sessionId, {
    onData: (data) => term.write(data),
    onExit: (code, _signal) => {
      term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`);
    },
    onError: (message) => {
      term.writeln(`\r\n\x1b[31m[Error: ${message}]\x1b[0m`);
    },
  });

  // Send initial resize after stream is connecting
  bridge.requestResize(sessionId, term.cols, term.rows);
}

function destroyTerminal(sessionId: string): void {
  const entry = terminals.get(sessionId);
  if (entry) {
    entry.resizeObserver.disconnect();
    entry.term.dispose();
    terminals.delete(sessionId);
  }
}

// Expose to Swift for calling via evaluateJavaScript
(window as any).__superset = {
  initTerminal,
  destroyTerminal,
};

// Signal readiness to Swift
bridge.signalReady();
```

- [ ] **Step 2: Rebuild and verify**

```bash
cd apps/desktop-swift
bun run build:web
ls -la Resources/WebContent/terminal.js
```

Expected: `terminal.js` exists and is > 100KB (xterm.js is large).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop-swift/web-src/terminal-bridge.ts
git commit -m "feat(desktop-swift): implement terminal-bridge with xterm.js and addon loading"
```

---

## Task 11: End-to-End Integration and Verification

**Purpose:** Build and run the complete app. Verify all spec requirements.

**Files:**
- No new files — this is verification only.

- [ ] **Step 1: Full build**

```bash
cd apps/desktop-swift
bun run build:web
xcodebuild build -project SupersetShell.xcodeproj -scheme SupersetShell -configuration Debug 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED

- [ ] **Step 2: Run all tests**

```bash
cd apps/desktop-swift
xcodebuild test -project SupersetShell.xcodeproj -scheme SupersetShell 2>&1 | grep -E "Test (Suite|Case|.*passed|.*failed)"
```

Expected: all PTYSession and OutputBatcher tests pass.

- [ ] **Step 3: Manual verification — launch and basic terminal**

```bash
# Run the app
open build/Debug/SupersetShell.app
```

Verify:
- Window opens titled "Superset"
- Terminal appears with shell prompt
- Type `echo hello` → see "hello" output
- Type `ls -la` → see file listing with colors

- [ ] **Step 4: Manual verification — resize**

- Drag window corner to resize
- Terminal should reflow (text rewraps, prompt stays correct)
- Type `tput cols` → shows updated column count

- [ ] **Step 5: Manual verification — exit**

- Type `exit` in terminal
- Should see `[Process exited with code 0]` in gray text

- [ ] **Step 6: Manual verification — performance**

```bash
# In the terminal within the app:
cat /usr/share/dict/words
```

- Output should stream smoothly without freezing
- No visible lag between output chunks

- [ ] **Step 7: Manual verification — colors and special characters**

```bash
# In the terminal:
printf '\e[31mred\e[32mgreen\e[34mblue\e[0m\n'
echo "Unicode: 日本語 中文 한국어 🎉"
```

- Colors render correctly
- Unicode characters display properly

- [ ] **Step 8: Commit final state**

```bash
git add -A apps/desktop-swift/
git commit -m "feat(desktop-swift): Phase 1 complete — native Swift shell with xterm.js terminal"
```
