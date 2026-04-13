# V2 Workspace Setup Script Execution

## Problem

1. V2 workspace creation returns `initialCommands` (from `.superset/setup.sh`) but never executes them.
2. Presets race with shell init — commands fire before the shell is ready.

## Approach

One unified API: all initial commands go through `createTerminalSessionInternal({ initialCommand })`, gated behind `shellReadyPromise`. The renderer never writes commands — it only attaches to sessions.

1. OSC 133 (FinalTerm standard) for shell readiness detection
2. `initialCommand` on `createTerminalSessionInternal` — queues command behind `shellReadyPromise`
3. `ensureSession` gains optional `initialCommand`, passes through to `createTerminalSessionInternal`
4. Presets call `await ensureSession({ initialCommand })` before adding pane — no `initialCommand` on pane data
5. Setup scripts call `createTerminalSessionInternal({ initialCommand })` directly during workspace creation
6. `TerminalPane` simplified — just calls `ensureSession()` and attaches WebSocket. No command delivery logic.

Existing output buffering (`bufferOutput`/`replayBuffer`) handles the gap between session creation and WebSocket connect.

## Phase 1: Shell Readiness via OSC 133 ✅ DONE

Shell wrappers updated to emit OSC 133 A/C/D. Scanner + `shellReadyPromise` added to `terminal.ts`.

---

## Phase 2: `initialCommand` on Session Creation

### `createTerminalSessionInternal`

**File:** `packages/host-service/src/terminal/terminal.ts`

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

### `ensureSession` tRPC

**File:** `packages/host-service/src/trpc/router/terminal/terminal.ts`

Add optional `initialCommand` to input, pass through:

```typescript
ensureSession: protectedProcedure
  .input(z.object({
    terminalId: z.string(),
    workspaceId: z.string(),
    themeType: z.string().optional(),
    initialCommand: z.string().optional(),
  }))
  .mutation(({ ctx, input }) => {
    const result = createTerminalSessionInternal({
      terminalId: input.terminalId,
      workspaceId: input.workspaceId,
      themeType: parseThemeType(input.themeType),
      db: ctx.db,
      initialCommand: input.initialCommand,
    });
    // ...
  }),
```

### Update presets

**File:** `apps/desktop/.../useV2PresetExecution/useV2PresetExecution.ts`

Before adding the pane, create the session with the command:

```typescript
const terminalId = crypto.randomUUID();
await ensureSession({ terminalId, workspaceId, initialCommand: command });
store.addTab({ panes: [{ kind: "terminal", data: { terminalId } }] });
```

### Simplify TerminalPane

**File:** `apps/desktop/.../TerminalPane/TerminalPane.tsx`

Delete the `initialCommand` delivery effect (lines 119-133). `TerminalPane` only does: `ensureSession()` + attach WebSocket.

### Remove `initialCommand` from pane data

**File:** `apps/desktop/.../v2-workspace/$workspaceId/types.ts`

```typescript
export interface TerminalPaneData {
  terminalId: string;
  // initialCommand removed
}
```

---

## Phase 3: Create Setup Terminal During Workspace Creation

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

## Phase 4: Renderer Attaches to Pre-Started Terminals

- Add `terminals` to `pendingWorkspaceSchema`
- Before navigating to workspace, pre-populate `v2WorkspaceLocalState.paneLayout` with terminal panes referencing host-provided `terminalId`s
- `TerminalPane` mounts → `ensureSession` (idempotent, session exists) → WebSocket connects → buffered output replays

**Files:**
- `apps/desktop/.../dashboardSidebarLocal/schema.ts`
- `apps/desktop/.../pending/$pendingId/page.tsx`
- `apps/desktop/.../pending/$pendingId/buildSetupPaneLayout.ts` (new)

---

## Future: "Run in Current Terminal"

Not used in v2 today. When needed, add a `terminal.writeCommand` tRPC mutation.

---

## Attribution

Shell integration protocol vendored from:
- **WezTerm** (MIT License, Copyright 2018-Present Wez Furlong) — `assets/shell-integration/wezterm.sh`
- **FinalTerm semantic prompts spec** — https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md

Scanner pattern adapted from our v1 desktop terminal host (`apps/desktop/src/main/terminal-host/session.ts`).
