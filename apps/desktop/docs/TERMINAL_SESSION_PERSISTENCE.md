# Terminal Session Persistence Enhancement

## Summary

Add the ability to restore CLI sessions on app restart through:

1. **CWD Persistence** - Track CWD via OSC-7 in main process, use saved CWD on restore
2. **Process Persistence** (Optional) - tmux integration for true process survival

## Decisions Made

- **Backend**: tmux only for initial release (shpool deferred - see [Deferred: shpool](#deferred-shpool-backend))
- **tmux config**: Ship minimal `superset.tmux.conf` (disabled prefix, clean isolation)
- **Scope**: Phase 1 (CWD persistence) + Phase 2 (process persistence with tmux)
- **Feature flag**: Environment variable initially, settings UI as tech debt

## Current State

### What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| Scrollback persistence | `terminal-history.ts` | Saves to `~/.superset/terminal-history/{workspaceId}/{paneId}/scrollback.bin` |
| Metadata storage | `terminal-history.ts` | `meta.json` includes cwd, cols, rows, startedAt, endedAt, exitCode |
| Recovery function | `session.ts:17-40` | `recoverScrollback()` loads up to 500KB, but **ignores metadata.cwd** |
| Renderer replay | `Terminal.tsx:240` | Calls `xterm.write(scrollback)` on restore |
| OSC-7 parsing | `parseCwd.ts` in renderer | Exists but only used client-side |
| CWD state | `Terminal.tsx:72-95` | Tracks `terminalCwd` and `cwdConfirmed` states |
| Directory navigator | `DirectoryNavigator.tsx` | Uses CWD from Zustand store |

### Gaps to Fill

1. **CWD not restored** - `HistoryReader` returns `metadata.cwd` but `createSession()` ignores it
2. **CWD not updated** - Main process doesn't track CWD changes via OSC-7
3. **Process dies on quit** - No way to keep agents running across restarts
4. **Bug in recoverScrollback()** - Early return at lines 22-24 skips reading `meta.json`

---

## Implementation Plan

### Phase 1: CWD Persistence (Low-Risk, High-Value)

**Goal**: Track CWD via OSC-7 and restore it on session recreation.

**Estimated effort**: 2-3 hours

#### 1.1 Move OSC-7 Parser to Shared Module

**Move**: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/parseCwd.ts`
**To**: `apps/desktop/src/shared/parse-cwd.ts`

- No Node.js dependencies in shared code (verified - current implementation is pure JS)
- Import from both main + renderer
- Update renderer import path

**Prerequisite check**: OSC-7 must be emitted by user's shell!

| Shell | OSC-7 Support |
|-------|---------------|
| zsh | Emits by default (via `chpwd_functions` or `precmd`) |
| bash | May need `PROMPT_COMMAND` hook |
| fish | Emits by default |

**Action items**:
1. Verify Superset's zsh wrapper already emits OSC-7 (check `apps/desktop/src/main/lib/agent-setup/`)
2. Add OSC-7 emission to shell wrappers if missing
3. Document that CWD tracking requires OSC-7 support

**Verification step** (before proceeding with implementation):

```bash
# Check if zsh wrapper emits OSC-7
grep -r "OSC.*7\|\\\\e\]7\|\\x1b\]7" apps/desktop/src/main/lib/agent-setup/

# If not found, add to zsh wrapper (e.g., zshrc template):
# precmd() { print -Pn "\e]7;file://${HOST}${PWD}\a" }
```

If shell wrappers don't emit OSC-7, Phase 1 CWD tracking will not work. This is a **prerequisite check**, not implementation.

#### 1.2 Fix recoverScrollback() to Always Return Saved CWD

**File**: `apps/desktop/src/main/lib/terminal/session.ts:17-40`

**Bug**: Current early-return at lines 22-24 skips reading `meta.json`:

```typescript
if (existingScrollback) {
  return { scrollback: existingScrollback, wasRecovered: true };  // Never reads metadata!
}
```

**Split into two sub-tasks for easier review**:

##### 1.2a: Add readMetadata() to HistoryReader

```typescript
// In terminal-history.ts
class HistoryReader {
  async readMetadata(): Promise<SessionMetadata | null> {
    try {
      const metaPath = getMetadataPath(this.workspaceId, this.paneId);
      const metaContent = await fs.readFile(metaPath, "utf-8");
      return JSON.parse(metaContent);
    } catch {
      return null;
    }
  }
}
```

##### 1.2b: Fix recoverScrollback() to use it

```typescript
// In session.ts - always read metadata, even with existingScrollback
export async function recoverScrollback(...): Promise<{
  scrollback: string;
  wasRecovered: boolean;
  savedCwd?: string;
}> {
  const historyReader = new HistoryReader(workspaceId, paneId);
  const metadata = await historyReader.readMetadata();  // Always read metadata!

  if (existingScrollback) {
    return {
      scrollback: existingScrollback,
      wasRecovered: true,
      savedCwd: metadata?.cwd,  // Now we have it
    };
  }

  const history = await historyReader.read();
  if (history.scrollback) {
    const MAX_SCROLLBACK_CHARS = 500_000;
    const scrollback =
      history.scrollback.length > MAX_SCROLLBACK_CHARS
        ? history.scrollback.slice(-MAX_SCROLLBACK_CHARS)
        : history.scrollback;
    return { scrollback, wasRecovered: true, savedCwd: history.metadata?.cwd };
  }

  // IMPORTANT: Return savedCwd even when no scrollback exists
  // Handles case where session had metadata but empty/cleared scrollback
  return { scrollback: "", wasRecovered: false, savedCwd: metadata?.cwd };
}
```

#### 1.3 Handle Split OSC-7 Sequences in setupDataHandler()

**File**: `apps/desktop/src/main/lib/terminal/session.ts:152`

**Problem**: OSC-7 can be split across PTY chunks. Single-chunk parsing misses updates.

**Solution**: Use rolling buffer with raw data (not `dataToStore`):

```typescript
let osc7Buffer = '';
const OSC7_BUFFER_SIZE = 4096;

session.pty.onData((data) => {
  let dataToStore = data;

  if (containsClearScrollbackSequence(data)) {
    session.scrollback = "";
    onHistoryReinit().catch(() => {});
    dataToStore = extractContentAfterClear(data);
  }

  session.scrollback += dataToStore;
  session.historyWriter?.write(dataToStore);

  // MUST use raw `data`, not `dataToStore` - don't miss OSC-7 sequences
  osc7Buffer = (osc7Buffer + data).slice(-OSC7_BUFFER_SIZE);
  const newCwd = parseCwd(osc7Buffer);
  if (newCwd && newCwd !== session.cwd) {
    session.cwd = newCwd;
    session.historyWriter?.updateCwd(newCwd);  // Persist immediately
  }

  // ... rest of handler
});
```

#### 1.4 Persist CWD Updates Immediately (Crash Safety)

**File**: `apps/desktop/src/main/lib/terminal-history.ts`

**Problem**: `meta.json` only written on `close()` (line 87). CWD lost on crash.

**Solution**: Debounced writes with proper cleanup:

```typescript
class HistoryWriter {
  private pendingMetadataWrite: ReturnType<typeof setTimeout> | null = null;

  updateCwd(cwd: string): void {
    this.metadata.cwd = cwd;
    this.debouncedWriteMetadata();
  }

  private debouncedWriteMetadata(): void {
    if (this.pendingMetadataWrite) {
      clearTimeout(this.pendingMetadataWrite);
    }

    this.pendingMetadataWrite = setTimeout(async () => {
      this.pendingMetadataWrite = null;
      try {
        await fs.writeFile(this.metaPath, JSON.stringify(this.metadata, null, 2));
      } catch (error) {
        // Log but don't throw - crash safety shouldn't crash the app
        console.warn('[HistoryWriter] Failed to write metadata:', error);
      }
    }, 1000);  // Write at most once per second

    // IMPORTANT: unref() so pending write can't keep Node alive on shutdown
    this.pendingMetadataWrite.unref();
  }

  async close(exitCode?: number): Promise<void> {
    // MUST: Cancel pending debounced write to prevent writes-after-close
    if (this.pendingMetadataWrite) {
      clearTimeout(this.pendingMetadataWrite);
      this.pendingMetadataWrite = null;
    }

    // ... existing stream close logic ...

    this.metadata.endedAt = new Date().toISOString();
    this.metadata.exitCode = exitCode;
    try {
      await fs.writeFile(this.metaPath, JSON.stringify(this.metadata, null, 2));
    } catch {
      // Ignore metadata write errors on shutdown
    }
  }
}
```

#### 1.5 Use Recovered CWD with Directory Guard

**File**: `apps/desktop/src/main/lib/terminal/session.ts:61-139`

**Critical**: `fs.promises` doesn't expose constants! Import from `node:fs` directly:

```typescript
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";

// Determine working directory with fallbacks
let workingDir = params.cwd ?? recoveredCwd ?? os.homedir();

// Guard: verify directory is accessible
// Use readdir() as a more reliable test than X_OK (handles SIP/sandboxing on macOS)
try {
  const stats = await fs.stat(workingDir);
  if (!stats.isDirectory()) {
    throw new Error('Not a directory');
  }
  // Actually test we can use the directory
  await fs.readdir(workingDir);
} catch {
  console.warn(`[session] CWD ${workingDir} not accessible, falling back to homedir`);
  workingDir = os.homedir();
}
```

**Note**: Using `readdir()` instead of `access(X_OK)` because:
- `X_OK` on directories doesn't guarantee `cd` access on macOS with SIP
- `readdir()` is a more reliable "can we actually use this directory" test

#### 1.6 Tests to Add/Update

| File | Test |
|------|------|
| `session.test.ts` | Assert `recoverScrollback()` returns `savedCwd` even when `existingScrollback` provided |
| `terminal-history.test.ts` | Assert `updateCwd()` updates `meta.json` (debounced) |
| `terminal-history.test.ts` | Assert `close()` cancels pending metadata writes |
| New test file | OSC-7 split across chunks is correctly parsed |

#### Files to Modify (Phase 1)

| File | Change |
|------|--------|
| `shared/parse-cwd.ts` | Move from renderer (no Node deps) |
| `renderer/.../parseCwd.ts` | Delete, update imports |
| `session.ts` | Fix `recoverScrollback()`, add rolling buffer, use recovered CWD with guard |
| `terminal-history.ts` | Add `updateCwd()` with debounced write, add `readMetadata()` |
| `types.ts` | (Phase 2 prep) Document that `isPersistentBackend`, `isExpectedDetach`, `cleanupTimeout` will be added |
| `session.test.ts` | Add tests for CWD recovery |
| `terminal-history.test.ts` | Add tests for `updateCwd()` |

---

### Phase 2: Process Persistence (tmux)

**Goal**: Keep terminal processes alive across app restarts.

**Estimated effort**: 1-2 days

#### 2.0 Feature Flag & OS Gate

- **Default**: OFF (opt-in)
- **OS Gate**: macOS + Linux only (not Windows)
- **Initial**: Environment variable `SUPERSET_TERMINAL_PERSISTENCE=1`
- **Future**: Settings UI toggle (tracked as tech debt)

**Tech debt to track**:
- [ ] Add `processPersistence: { enabled: boolean }` to settings schema
- [ ] Add migration or default value handling
- [ ] Add UI toggle in settings
- [ ] Update IPC types in `ipc-channels.ts` if needed

#### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│  App Start                                               │
│  ├─ Check feature flag + OS gate                        │
│  ├─ Detect backend: tmux > none                         │
│  ├─ Check for existing sessions (superset-*)            │
│  ├─ If found: capture scrollback + attach               │
│  └─ If not: create new persistent session               │
├─────────────────────────────────────────────────────────┤
│  Normal Operation                                        │
│  ├─ PTY attached to tmux session                        │
│  ├─ Data flows: tmux → node-pty → xterm                 │
│  └─ Layer 1 scrollback persistence continues            │
├─────────────────────────────────────────────────────────┤
│  App Quit                                                │
│  ├─ DETACH clients (don't kill sessions!)               │
│  └─ Sessions survive in tmux                            │
├─────────────────────────────────────────────────────────┤
│  "Close Tab/Pane" (UI action)                            │
│  └─ DETACH only - session keeps running                 │
├─────────────────────────────────────────────────────────┤
│  "Kill Terminal" (explicit action)                       │
│  └─ KILL backend session (tmux kill-session)            │
├─────────────────────────────────────────────────────────┤
│  App Restart                                             │
│  ├─ Find existing session by name                       │
│  ├─ Capture scrollback (bounded, best-effort)           │
│  ├─ Write to xterm (visual restore)                     │
│  └─ Attach to running session                           │
└─────────────────────────────────────────────────────────┘
```

#### 2.2 Session Naming Convention

**Problem**: `workspaceId`/`paneId` may contain tmux-unsafe chars. Need to support "kill by workspace" for workspace deletion.

**Solution**: Structured hash preserving workspace prefix:

```typescript
import crypto from "node:crypto";

function getSessionName(workspaceId: string, paneId: string): string {
  const wsHash = crypto.createHash('md5')
    .update(workspaceId)
    .digest('hex')
    .slice(0, 8);
  const paneHash = crypto.createHash('md5')
    .update(paneId)
    .digest('hex')
    .slice(0, 8);
  return `superset-w${wsHash}-p${paneHash}`;  // e.g., superset-wa1b2c3d4-p5f6e7d8
}

// Kill all sessions for a workspace
async killByWorkspace(workspaceId: string): Promise<void> {
  const wsHash = crypto.createHash('md5')
    .update(workspaceId)
    .digest('hex')
    .slice(0, 8);
  const sessions = await this.listSessions(`superset-w${wsHash}-`);
  for (const session of sessions) {
    await this.killSession(session);
  }
}
```

**Alternative**: Store mapping in `meta.json`:

```json
{
  "cwd": "/path/to/dir",
  "tmuxSessionName": "superset-wa1b2c3d4-p5f6e7d8"
}
```

Max length: 32 chars (tmux limit is 256, but keep short).

#### 2.3 tmux Isolation

**Problem**: Must not interfere with user's tmux sessions/config.

**Solution**: Dedicated socket + config under `SUPERSET_HOME_DIR`:

```typescript
// CRITICAL: Use SUPERSET_HOME_DIR from app-environment.ts (env-aware)
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { join } from "node:path";

// Socket path (dedicated tmux server)
const TMUX_SOCKET = join(SUPERSET_HOME_DIR, "tmux.sock");

// Config path
const TMUX_CONFIG = join(SUPERSET_HOME_DIR, "tmux.conf");
```

**DO NOT hardcode** `~/.superset` - dev environment uses `.superset-dev`!

All tmux commands use:

```bash
tmux -S "$TMUX_SOCKET" -f "$TMUX_CONFIG" ...
```

**Critical**: Strip `TMUX` env var when spawning:

```typescript
const env = { ...process.env };
delete env.TMUX;  // Use delete, not undefined (avoids spawn env type issues)
```

**Config hot-reload issue**: `tmux -f <conf>` only applies when server starts!

**Solution**: First-start detection + set-option fallback with error handling:

```typescript
async ensureServerConfig(): Promise<void> {
  const serverRunning = await this.isServerRunning();
  if (!serverRunning) {
    // First start - server will use our -f config
    return;
  }
  
  // Server exists - set critical options directly
  // Wrapped in try-catch since session may not exist yet or options already set
  const criticalOptions = [
    'set-option -g prefix None',
    'set-option -g status off',
  ];
  
  for (const opt of criticalOptions) {
    try {
      await exec(`tmux -S ${shellQuote(TMUX_SOCKET)} ${opt}`);
    } catch (error) {
      // Log but don't fail - options may already be set or server just started
      console.debug(`[TmuxBackend] Could not set option (may be fine): ${opt}`, error);
    }
  }
}
```

**Config file**: `${SUPERSET_HOME_DIR}/tmux.conf`

```bash
# Superset tmux config - minimal, non-conflicting
set -g prefix None           # Disable prefix entirely
unbind C-b                   # Remove default prefix binding
set -g mouse off             # Let xterm.js handle mouse
set -g status off            # No status bar (Superset has its own UI)
set -g history-limit 50000   # Large scrollback
set -g escape-time 0         # No escape delay
set -g default-terminal "xterm-256color"
set -ga terminal-overrides ",xterm-256color:Tc"
```

**MANUAL TEST REQUIRED**: Verify `set -g prefix None` works:
- Open vim in Superset terminal
- Press Ctrl-b → should move cursor back, NOT trigger tmux prefix

#### 2.4 Backend Interface

**New file**: `apps/desktop/src/main/lib/terminal/persistence/types.ts`

```typescript
import type pty from "node-pty";

export interface PersistenceBackend {
  name: 'tmux';

  // Detection
  isAvailable(): Promise<boolean>;

  // Session management
  sessionExists(sessionName: string): Promise<boolean>;
  listSessions(prefix: string): Promise<string[]>;

  // Lifecycle
  createSession(opts: {
    name: string;
    cwd: string;
    shell: string;
    env: Record<string, string>;  // Full env - backend decides safe subset for disk
  }): Promise<void>;

  attachSession(name: string): Promise<pty.IPty>;
  detachSession(name: string): Promise<void>;
  killSession(name: string): Promise<void>;

  // Scrollback
  captureScrollback(name: string): Promise<string>;

  // Orphan cleanup (optional)
  getSessionLastActivity?(name: string): Promise<number | null>;
}
```

#### 2.5 tmux Backend

**New file**: `apps/desktop/src/main/lib/terminal/persistence/tmux-backend.ts`

**Key commands**:

```bash
# Check available
which tmux

# List sessions (using our socket)
tmux -S "$TMUX_SOCKET" list-sessions -F '#{session_name}' 2>/dev/null | grep '^superset-'

# Capture scrollback - bounded, preserve ANSI
tmux -S "$TMUX_SOCKET" capture-pane -t "$name" -p -e -S -50000

# Detach current client
tmux -S "$TMUX_SOCKET" detach-client -s "$name"

# Kill session
tmux -S "$TMUX_SOCKET" kill-session -t "$name"
```

**Attach implementation**:

```typescript
const env = { ...process.env };
delete env.TMUX;  // Use delete, not undefined
return pty.spawn('tmux', ['-S', TMUX_SOCKET, 'attach-session', '-t', name], { env });
```

**Per-pane environment variables**:

**Problem**: tmux server env is inherited at server start, not per-session.

**Solution**: Wrapper script with SAFE env subset only:

```typescript
// SECURITY: Only persist safe, non-secret env vars to disk
const SAFE_ENV_KEYS = [
  // Superset-specific
  'SUPERSET_PANE_ID',
  'SUPERSET_WORKSPACE_ID',
  'SUPERSET_WORKSPACE_NAME',
  'SUPERSET_WORKSPACE_PATH',
  'SUPERSET_ROOT_PATH',
  'SUPERSET_TAB_ID',
  // Shell config
  'ZDOTDIR',
  'SUPERSET_ORIG_ZDOTDIR',
  // Terminal basics
  'TERM',
  'COLORTERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'SHELL',
];

function buildSafeEnvForScript(fullEnv: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    SAFE_ENV_KEYS.filter(k => fullEnv[k]).map(k => [k, fullEnv[k]])
  );
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
```

**Wrapper script creation**:

```typescript
const safeEnv = buildSafeEnvForScript(buildTerminalEnv(params));

const wrapperScript = `#!/bin/sh
${Object.entries(safeEnv).map(([k, v]) => `export ${k}=${shellQuote(v)}`).join('\n')}
exec ${shellQuote(shell)} ${getShellArgs(shell).map(shellQuote).join(' ')}
`;

const sessionsDir = join(SUPERSET_HOME_DIR, 'tmux-sessions');
await fs.mkdir(sessionsDir, { recursive: true });
const scriptPath = join(sessionsDir, `${sessionName}.sh`);
await fs.writeFile(scriptPath, wrapperScript, { mode: 0o755 });

// Create tmux session
await exec(`tmux -S ${shellQuote(TMUX_SOCKET)} -f ${shellQuote(TMUX_CONFIG)} new-session -d -s ${shellQuote(name)} -c ${shellQuote(cwd)} ${shellQuote(scriptPath)}`);
```

**Script cleanup** (on kill, not on create - avoid race condition):

```typescript
async killSession(name: string): Promise<void> {
  await exec(`tmux -S ${shellQuote(TMUX_SOCKET)} kill-session -t ${shellQuote(name)}`);
  
  // Clean up wrapper script with proper logging
  const scriptPath = join(SUPERSET_HOME_DIR, 'tmux-sessions', `${name}.sh`);
  try {
    await fs.rm(scriptPath);
  } catch (error) {
    // Log failure but don't throw - script may not exist or be already cleaned
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[TmuxBackend] Failed to clean wrapper script ${scriptPath}:`, error);
    }
  }
}
```

**Orphaned script cleanup on startup**:

```typescript
async cleanupOrphanedScripts(): Promise<void> {
  const sessionsDir = join(SUPERSET_HOME_DIR, 'tmux-sessions');
  try {
    const scripts = await fs.readdir(sessionsDir);
    const activeSessions = await this.listSessions('superset-');
    for (const script of scripts) {
      const sessionName = script.replace('.sh', '');
      if (!activeSessions.includes(sessionName)) {
        await fs.rm(join(sessionsDir, script)).catch(() => {});
      }
    }
  } catch {
    // Directory may not exist yet
  }
}
```

#### 2.6 ProcessPersistence Manager

**New file**: `apps/desktop/src/main/lib/terminal/persistence/manager.ts`

**Critical**: Initialize lazily after `app.whenReady()`:

```typescript
class ProcessPersistence {
  private backend: PersistenceBackend | null = null;
  private _enabled: boolean = false;
  private initialized: boolean = false;

  get enabled(): boolean {
    return this._enabled;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Check feature flag
    if (!process.env.SUPERSET_TERMINAL_PERSISTENCE) {
      return;
    }

    // OS gate: macOS + Linux only
    if (process.platform === 'win32') {
      return;
    }

    // Detect tmux
    const tmux = new TmuxBackend();
    if (await tmux.isAvailable()) {
      this.backend = tmux;
      await this.copyTmuxConfig();
      await this.backend.cleanupOrphanedScripts();
      this._enabled = true;
    }
  }

  private async copyTmuxConfig(): Promise<void> {
    const configPath = join(SUPERSET_HOME_DIR, 'tmux.conf');
    try {
      await fs.access(configPath);
    } catch {
      // Copy from resources
      const resourcePath = join(__dirname, '../resources/superset.tmux.conf');
      await fs.copyFile(resourcePath, configPath);
    }
  }

  // Delegate methods to backend...
}

export const processPersistence = new ProcessPersistence();
```

**In `apps/desktop/src/main/index.ts`**:

#### 2.6a Update TerminalSession Interface

**File**: `apps/desktop/src/main/lib/terminal/types.ts`

Add the following fields to `TerminalSession`:

```typescript
export interface TerminalSession {
  // ... existing fields ...
  
  /** True if session is backed by tmux/persistent backend */
  isPersistentBackend?: boolean;
  
  /** True when detach() was called (vs unexpected exit) */
  isExpectedDetach?: boolean;
  
  /** Tracks cleanup timeout for cancellation on reattach */
  cleanupTimeout?: ReturnType<typeof setTimeout>;
}
```

**In `apps/desktop/src/main/index.ts`**:

```typescript
await app.whenReady();
// ... existing init code ...
await processPersistence.initialize();
```

#### 2.7 Integration with TerminalManager

**File**: `apps/desktop/src/main/lib/terminal/manager.ts`

**Key changes**:

1. Add `isPersistentBackend` and `isExpectedDetach` flags to session
2. Make `detach()` async
3. Skip fallback shell logic for persistent backends
4. Handle cleanup timeout race condition

**Updated TerminalSession interface** (in `types.ts`):

```typescript
interface TerminalSession {
  // ... existing fields
  isPersistentBackend?: boolean;
  isExpectedDetach?: boolean;
  cleanupTimeout?: ReturnType<typeof setTimeout>;  // Track for cancellation
}
```

**Updated detach() - NOW ASYNC**:

```typescript
async detach(params: { paneId: string }): Promise<void> {
  const session = this.sessions.get(paneId);
  if (!session) return;

  if (session.isPersistentBackend && session.isAlive) {
    // Cancel any pending cleanup timeout from previous exits
    if (session.cleanupTimeout) {
      clearTimeout(session.cleanupTimeout);
      session.cleanupTimeout = undefined;
    }

    // Mark as expected detach BEFORE killing PTY
    session.isExpectedDetach = true;

    // Close history streams without writing endedAt
    await closeSessionHistoryForDetach(session);

    session.pty.kill();  // Triggers onExit, but we suppress the emit
    // Delete from map immediately
    this.sessions.delete(paneId);
  } else {
    // Regular PTY: just update lastActive (existing behavior)
    session.lastActive = Date.now();
  }
}
```

**New function in session.ts**:

```typescript
export async function closeSessionHistoryForDetach(session: TerminalSession): Promise<void> {
  if (session.historyWriter) {
    await session.historyWriter.closeForDetach();
    session.historyWriter = undefined;
  }
}
```

**Add to HistoryWriter** (uses existing field names from `terminal-history.ts`):

```typescript
/**
 * Close history streams for detach (not termination).
 * - Closes file stream to release handles
 * - Writes current metadata (preserves cwd)
 * - Does NOT write endedAt/exitCode since session continues in backend
 */
async closeForDetach(): Promise<void> {
  // Cancel pending metadata writes
  if (this.pendingMetadataWrite) {
    clearTimeout(this.pendingMetadataWrite);
    this.pendingMetadataWrite = null;
  }

  // Close stream without writing endedAt/exitCode (session still running in backend)
  if (this.stream && !this.streamErrored) {
    try {
      await new Promise<void>((resolve) => {
        this.stream?.end(() => resolve());
      });
    } catch {
      // Ignore close errors
    }
  }
  this.stream = null;

  // Write current metadata (preserves cwd, but no endedAt since session continues)
  try {
    await fs.writeFile(this.metaPath, JSON.stringify(this.metadata, null, 2));
  } catch {
    // Ignore
  }
}
```

**Updated exit handler**:

```typescript
session.pty.onExit(async ({ exitCode, signal }) => {
  session.isAlive = false;
  flushSession(session);

  // For persistent backends with expected detach, skip everything
  if (session.isPersistentBackend && session.isExpectedDetach) {
    return;
  }

  // SKIP fallback shell for persistent backends
  if (session.isPersistentBackend) {
    await closeSessionHistory(session, exitCode);
    this.emit(`exit:${paneId}`, exitCode, signal);
    return;
  }

  // ... existing fallback logic for regular PTY ...
});
```

**Updated createOrAttach**:

```typescript
async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
  const sessionName = getSessionName(params.workspaceId, params.paneId);

  if (processPersistence.enabled) {
    try {
      if (await processPersistence.sessionExists(sessionName)) {
        const backendScrollback = await this.captureScrollbackBounded(sessionName);
        const ptyProcess = await processPersistence.attachSession(sessionName);

        return this.setupSession(ptyProcess, params, {
          scrollback: backendScrollback,
          wasRecovered: true,
          isPersistentBackend: true,
        });
      }
    } catch (error) {
      console.warn('[TerminalManager] Failed to attach:', error);
      
      // Kill orphaned session before falling back to prevent duplicates
      // Session exists but we can't attach - it's in a bad state
      try {
        await processPersistence.killSession(sessionName);
        console.log('[TerminalManager] Killed orphaned session:', sessionName);
      } catch {
        // Ignore - session may have already died
      }
    }

    try {
      await processPersistence.createSession({
        name: sessionName,
        cwd: params.cwd ?? os.homedir(),
        shell: getDefaultShell(),
        env: buildTerminalEnv(params),
      });
      const ptyProcess = await processPersistence.attachSession(sessionName);
      return this.setupSession(ptyProcess, params, {
        scrollback: '',
        wasRecovered: false,
        isPersistentBackend: true,
      });
    } catch (error) {
      console.warn('[TerminalManager] Persistence failed, falling back:', error);
    }
  }

  return this.doCreateSession(params);
}

private async captureScrollbackBounded(sessionName: string): Promise<string> {
  const MAX_SCROLLBACK_CHARS = 500_000;
  try {
    const scrollback = await Promise.race([
      processPersistence.captureScrollback(sessionName),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000)
      ),
    ]);
    return scrollback.length > MAX_SCROLLBACK_CHARS
      ? scrollback.slice(-MAX_SCROLLBACK_CHARS)
      : scrollback;
  } catch {
    return '';
  }
}
```

**Add detachAll()**:

```typescript
async detachAll(): Promise<void> {
  for (const [paneId, session] of this.sessions.entries()) {
    if (session.isPersistentBackend && session.isAlive) {
      session.isExpectedDetach = true;
      await closeSessionHistoryForDetach(session);
      session.pty.kill();
    } else {
      await this.kill({ paneId });
    }
  }
  this.sessions.clear();
}
```

#### 2.8 App Lifecycle Hooks

**File**: `apps/desktop/src/main/index.ts`

**Problem**: Two before-quit handlers exist (lines 96 and 149) that need consolidation.

**Solution**: Single handler with state machine:

```typescript
type QuitState = 'idle' | 'cleaning' | 'ready-to-quit';
let quitState: QuitState = 'idle';
let isQuitting = false;

app.on('before-quit', async (event) => {
  isQuitting = true;

  if (quitState === 'ready-to-quit') return;
  if (quitState === 'cleaning') {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  quitState = 'cleaning';

  try {
    if (processPersistence.enabled) {
      await terminalManager.detachAll();
    } else {
      await terminalManager.cleanup();
    }
    await posthog?.shutdown();
  } finally {
    quitState = 'ready-to-quit';
    app.quit();
  }
});
```

**MUST REMOVE** the existing handler at line 148:

```typescript
// REMOVE THIS - it unconditionally calls cleanup()
app.on("before-quit", async () => {
  await Promise.all([terminalManager.cleanup(), posthog?.shutdown()]);
});
```

**ALSO REMOVE** the empty handler in `apps/desktop/src/lib/electron-app/factories/app/setup.ts` line 67:

```typescript
// REMOVE THIS - empty handler serves no purpose
app.on("before-quit", () => {
  // Currently empty
});
```

If this handler is needed for future use, consolidate into the main quit handler in `index.ts`.

**Update tRPC router** (`apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`):

```typescript
detach: publicProcedure
  .input(z.object({ paneId: z.string() }))
  .mutation(async ({ input }) => {
    await terminalManager.detach(input);  // Now awaits
  }),
```

#### 2.9 Orphan Session Cleanup

**Problem**: Crashed app leaves tmux sessions as orphans.

**Approach**: Age-based cleanup (conservative 72h threshold):

```typescript
async cleanupOrphanedSessions(): Promise<void> {
  if (!this.backend) return;

  const MAX_ORPHAN_AGE_MS = 72 * 60 * 60 * 1000;  // 72 hours (conservative)

  try {
    const backendSessions = await this.backend.listSessions('superset-');
    const knownPanes = await this.getKnownPaneIds();

    for (const session of backendSessions) {
      const isKnown = knownPanes.some(p => getSessionName(p.wsId, p.id) === session);
      if (isKnown) continue;

      if (this.backend.getSessionLastActivity) {
        const lastActivity = await this.backend.getSessionLastActivity(session);
        if (lastActivity === null) {
          console.log(`[ProcessPersistence] Keeping orphan (unknown age): ${session}`);
          continue;
        }
        const age = Date.now() - lastActivity;

        if (age > MAX_ORPHAN_AGE_MS) {
          console.log(`[ProcessPersistence] Cleaning stale orphan: ${session}`);
          await this.backend.killSession(session).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.warn('[ProcessPersistence] Orphan cleanup failed:', error);
  }
}
```

**tmux backend implementation**:

```typescript
async getSessionLastActivity(name: string): Promise<number | null> {
  try {
    const result = await exec(
      `tmux -S "${TMUX_SOCKET}" display-message -p -t "${name}" '#{session_activity}'`
    );
    const timestamp = parseInt(result.stdout.trim(), 10);
    return isNaN(timestamp) ? null : timestamp * 1000;  // tmux uses seconds
  } catch {
    return null;
  }
}
```

#### 2.10 Files to Create (Phase 2)

| File | Purpose |
|------|---------|
| `persistence/types.ts` | Backend interface |
| `persistence/tmux-backend.ts` | tmux implementation |
| `persistence/manager.ts` | Detection, delegation |
| `resources/superset.tmux.conf` | Minimal tmux config |

#### 2.11 Files to Modify (Phase 2)

| File | Change |
|------|--------|
| `manager.ts` | Integrate ProcessPersistence, add `detachAll()`, make `detach()` async |
| `index.ts` | Consolidate quit handlers, initialize persistence |
| `session.ts` | Add `closeSessionHistoryForDetach()` |
| `terminal-history.ts` | Add `closeForDetach()` method |
| `types.ts` | Add `isPersistentBackend`, `isExpectedDetach`, `cleanupTimeout` to session |
| `terminal/terminal.ts` (tRPC) | Update to await `detach()` |
| `setup.ts` | Remove empty before-quit handler |

---

## Edge Cases & Error Handling

### Backend Not Available

- Log warning, continue without persistence
- Layer 1 (scrollback to disk) still works
- Feature flag off = never attempt persistence

### Session Attach Fails

- Log error, fall through to create new session
- Do NOT trigger fallback shell logic
- Don't block app startup

### Nested tmux

- Use dedicated socket to isolate
- Strip TMUX env var when spawning
- Our sessions completely separate from user's tmux

### Workspace Deletion

- Kill all backend sessions for workspace via hash prefix
- Clean up Layer 1 history files (existing behavior)

### Security

- Do NOT persist full env to disk
- Only safe subset written to wrapper scripts
- No AWS_*, GITHUB_TOKEN, API keys in scripts

### Scrollback Capture

- Bounded to 500k chars
- 2 second timeout
- Best-effort, don't block UI

---

## Deferred: shpool Backend

**Reason**: shpool lacks scrollback capture, providing degraded UX compared to tmux.

**Limitations**:
- Process survives restart
- Output produced while app closed is lost
- Users expect to see what happened while away

**Recommendation**: Add shpool support in a future iteration if users request it, with clear documentation of the limitation.

---

## Implementation Order

### Phase 1: CWD Persistence (~2-3 hours)

1. 1.1 Move OSC-7 parser to shared module
2. 1.2a Add `readMetadata()` to HistoryReader
3. 1.2b Fix `recoverScrollback()` to use it
4. 1.3 Add rolling buffer for split OSC-7 sequences
5. 1.4 Add `updateCwd()` with debounced write
6. 1.5 Use recovered CWD with directory guard
7. 1.6 Add tests

### Phase 2: Process Persistence (~1-2 days)

1. 2.0 Add feature flag + OS gate
2. 2.2-2.3 Session naming + tmux isolation
3. 2.4-2.5 Backend interface + tmux implementation
4. 2.6 ProcessPersistence manager
5. 2.7 TerminalManager integration
6. 2.8 App lifecycle hooks
7. 2.9 Orphan cleanup

---

## Manual Acceptance Checklist

### Phase 1: CWD Persistence

- [ ] `cd /some/path`, quit app, relaunch → new shell starts in `/some/path`
- [ ] OSC-7 split across chunks (rapid cd commands) → CWD still tracked correctly
- [ ] CWD directory deleted → falls back to homedir gracefully
- [ ] App crash (`kill -9`) → CWD still persisted (debounced write)
- [ ] Existing scrollback with metadata → `savedCwd` returned (not skipped by early return)
- [ ] Empty scrollback but valid metadata → `savedCwd` still returned
- [ ] Verify shell wrappers emit OSC-7 (`echo -e "\e]7;file://$(hostname)$(pwd)\a"` in terminal shows no visible output but CWD updates)
- [ ] Test with bash (requires PROMPT_COMMAND setup) and fish (should work by default)

### Phase 2: Process Persistence (tmux)

- [ ] Start long-running command (e.g., `sleep 300`)
- [ ] Quit app, relaunch → command still running, output visible
- [ ] "Kill Terminal" button → tmux session killed, process dies
- [ ] "Close Tab/Pane" (X button) → session detaches but process keeps running
- [ ] Close tab shows NO "Process exited" message for persistent sessions
- [ ] tmux not installed → falls back to Layer 1 (visual restore only)
- [ ] User's tmux sessions → unaffected (isolated socket)
- [ ] vim Ctrl-b test: cursor moves back, NOT tmux prefix
- [ ] Orphaned sessions: stale ones (>72h) cleaned, recent ones preserved
- [ ] Per-pane SUPERSET_* env vars correct in tmux session
- [ ] Workspace deletion kills all associated tmux sessions
- [ ] Attach fails on corrupted session → session killed, new one created (no duplicates)
- [ ] Wrapper script removed after killSession (check `~/.superset/tmux-sessions/`)
- [ ] No empty before-quit handlers remain in codebase

---

## DON'T SHIP WITHOUT (Critical Checks)

Before releasing Phase 2, these MUST all pass:

### 1. tmux env correctness (per pane)

- [ ] `echo $SUPERSET_PANE_ID` in tmux session shows correct value
- [ ] Multiple panes have different SUPERSET_* values
- [ ] Env vars set BEFORE shell starts (not after)

### 2. Detach really detaches

- [ ] Close tab → `tmux list-sessions` still shows session
- [ ] Reopen tab → reconnects to same session
- [ ] `terminal.detach()` kills PTY, not tmux session
- [ ] Close tab shows NO "Process exited" message

### 3. Quit handlers don't kill persistent sessions

- [ ] Quit app → `tmux list-sessions` still shows sessions
- [ ] Relaunch app → all sessions reconnect
- [ ] No quit loop (app actually exits)
- [ ] State machine prevents re-entry

### 4. History streams closed on detach

- [ ] Close tab on persistent session → no open file handles (check with `lsof`)
- [ ] `closeForDetach()` writes metadata but not `endedAt`

### 5. Safe env subset

- [ ] Wrapper scripts in `${SUPERSET_HOME_DIR}/tmux-sessions/` contain ONLY safe vars
- [ ] No AWS_*, GITHUB_TOKEN, API keys in wrapper scripts

### 6. Robust quoting for paths with spaces

- [ ] Test with SUPERSET_HOME_DIR containing space (e.g., `/Users/John Doe/.superset-dev`)
- [ ] Test with workspace path containing space
- [ ] `shellQuote()` used for all tmux command arguments

### 7. Cleanup timeout race condition

- [ ] Reopen tab within 5s of previous exit → session not deleted by old timeout
- [ ] `cleanupTimeout` tracked and cancelled on new attach

### 8. Third-party quit handlers removed

- [ ] Empty handler in `setup.ts` removed or consolidated
- [ ] Only ONE before-quit handler exists (the state machine in `index.ts`)
- [ ] `grep -r "before-quit" apps/desktop/src/` shows only the consolidated handler

---

## Tech Debt Tracking

- [ ] Settings UI for process persistence toggle
- [ ] IPC type updates in `ipc-channels.ts` if new channels needed
- [ ] shpool backend (deferred - see rationale above)
- [ ] Consider making orphan age configurable
- [ ] Verify shell wrappers emit OSC-7 for all supported shells
