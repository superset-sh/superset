# V2 Workspace Setup Script Execution

## Problem

V2 workspace creation returns `initialCommands` (from `.superset/setup.sh`) but never executes them. Additionally, the preset system races with shell init — commands fire before the shell is ready.

## Approach

1. Adopt OSC 133 (FinalTerm standard) for shell readiness detection
2. Gate WebSocket input on the host-service behind shell readiness (fixes presets, zero renderer changes)
3. Add `initialCommand` to `createTerminalSessionInternal` for setup scripts (no renderer connected)

## Phase 1: Shell Readiness via OSC 133 ✅ DONE

Shell wrappers updated to emit OSC 133 A/C/D. Scanner added to `terminal.ts`.

---

## Phase 2: Gate WebSocket Input Behind Shell Readiness

The existing terminal creation flow (button, hotkey, preset) works the same way:

```
store.addTab({ panes: [{ terminalId: uuid, initialCommand? }] })
  → TerminalPane mounts → ensureSession → WebSocket attaches
  → TerminalPane writes initialCommand via WebSocket { type: "input" }
```

The race is that the renderer writes the command before the shell is ready. Fix: the host-service queues WebSocket `input` messages while the shell is pending, flushes when ready.

### Changes

**`packages/host-service/src/terminal/terminal.ts`** — WebSocket `onMessage` handler (line 529):

```typescript
// Before:
if (message.type === "input") {
  session.pty.write(message.data);
}

// After:
if (message.type === "input") {
  if (session.shellReadyState === "pending") {
    if (!message.data.startsWith("\x1b")) {
      session.preReadyWriteQueue.push(message.data);
    }
    return;
  }
  session.pty.write(message.data);
}
```

Add `preReadyWriteQueue: string[]` to `TerminalSession`. Flush in `resolveShellReady`:

```typescript
const queue = session.preReadyWriteQueue;
session.preReadyWriteQueue = [];
for (const data of queue) {
  session.pty.write(data);
}
```

Drop escape sequences while pending (v1 pattern) — stale terminal query responses that would appear as typed text.

**No changes to:** `ensureSession`, `TerminalPane`, `useV2PresetExecution`, `TerminalPaneData`.

---

## Phase 3: `initialCommand` on `createTerminalSessionInternal`

Setup scripts create terminals during workspace creation — no renderer is connected. The command must be delivered server-side.

### Changes

**`packages/host-service/src/terminal/terminal.ts`**:

```typescript
interface CreateTerminalSessionOptions {
  // ...existing...
  initialCommand?: string;
}

// After PTY creation + shell ready setup:
if (initialCommand) {
  session.shellReadyPromise.then(() => {
    if (!session.exited) {
      pty.write(initialCommand.endsWith("\n") ? initialCommand : `${initialCommand}\n`);
    }
  });
}
```

Output buffers automatically while no WebSocket is attached. Replays on connect.

---

## Phase 4: Create Setup Terminal During Workspace Creation

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

Replace command resolution (lines 462-469) with terminal creation. Return terminal descriptors:

```typescript
const terminals: Array<{ id: string; role: string; label: string }> = [];

if (input.composer.runSetupScript) {
  const setupScriptPath = join(worktreePath, ".superset", "setup.sh");
  if (existsSync(setupScriptPath)) {
    const terminalId = crypto.randomUUID();
    const result = createTerminalSessionInternal({
      terminalId,
      workspaceId: cloudRow.id,
      db: ctx.db,
      initialCommand: `bash "${setupScriptPath}"`,
    });
    if (!("error" in result)) {
      terminals.push({ id: terminalId, role: "setup", label: "Workspace Setup" });
    }
  }
}

return { workspace: cloudRow, terminals, warnings: [] as string[] };
```

---

## Phase 5: Renderer Attaches to Pre-Started Terminals

- Add `terminals` to `pendingWorkspaceSchema`
- Before navigating to workspace, pre-populate `v2WorkspaceLocalState.paneLayout` with terminal panes referencing host-provided `terminalId`s
- `TerminalPane` mounts → `ensureSession` (idempotent) → WebSocket connects → buffered output replays

**Files:**
- `apps/desktop/.../dashboardSidebarLocal/schema.ts`
- `apps/desktop/.../pending/$pendingId/page.tsx`
- `apps/desktop/.../pending/$pendingId/buildSetupPaneLayout.ts` (new)

---

## Future: "Run in Current Terminal"

Not used in v2 today. When needed, add a dedicated `terminal.writeCommand` tRPC mutation.

---

## Attribution

Shell integration protocol vendored from:
- **WezTerm** (MIT License, Copyright 2018-Present Wez Furlong) — `assets/shell-integration/wezterm.sh`
- **FinalTerm semantic prompts spec** — https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md

Scanner pattern adapted from our v1 desktop terminal host (`apps/desktop/src/main/terminal-host/session.ts`).
