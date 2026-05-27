# terminalAgents (host-service module)

Branch: `agent-session-tracking`

## Scope

In-process tracker on host-service for which agent (claude/codex/cursor/opencode/droid/custom) is currently alive in which terminal. No consumers wired yet — this PR builds the module and the tRPC surface only. Consumers (renderer "send another message" button, automation reuse) come later.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Storage | In-mem `Map`. No SQLite, no migration. |
| 2 | Granularity | One binding per `terminalId`. Agent swap overwrites. |
| 3 | Exit | Delete on exit. Absence is the only signal. |
| 4 | Ambiguous lookup | Tie-break by latest `lastEventAt`. |
| 5 | API shape | Primitives only: `findActive` + `getOrCreate`. Callers compose with existing `terminal.writeInput`. |
| 6 | Name | `terminalAgents`. |

## What exists (do not touch)

- `notifications.hook` (`packages/host-service/src/trpc/router/notifications/notifications.ts:54`) — normalizes hook POST, broadcasts `agent:lifecycle`. This PR adds a sibling call to `store.recordEvent`.
- Terminal-exit path (`packages/host-service/src/trpc/router/terminal/terminal.ts:157`, `disposeSessionAndWait`) — this PR adds a sibling call to `store.markTerminalExited`.
- `terminal.createSession` (`packages/host-service/src/trpc/router/terminal/terminal.ts:98`) — used by `getOrCreate`.
- `terminal.writeInput` (`packages/host-service/src/trpc/router/terminal/terminal.ts:138`) — not called by this module; callers use it directly.

## Surface

```ts
// packages/host-service/src/terminal-agents/types.ts
export interface TerminalAgentBinding {
  terminalId: string;
  workspaceId: string;
  agentId: BuiltinAgentId | "droid";
  agentSessionId?: string;
  definitionId?: AgentDefinitionId;
  startedAt: number;
  lastEventAt: number;
  lastEventType: string;
}
```

```ts
// packages/host-service/src/terminal-agents/store.ts
export class TerminalAgentStore extends EventEmitter {
  // Write — called by hook receiver and terminal-exit path.
  recordEvent(input: {
    terminalId: string;
    workspaceId: string;
    eventType: string;
    agentId?: BuiltinAgentId | "droid";
    agentSessionId?: string;
    definitionId?: AgentDefinitionId;
    occurredAt: number;
  }): void;
  markTerminalExited(terminalId: string): void;

  // Read — called by tRPC router.
  get(terminalId: string): TerminalAgentBinding | undefined;
  listByWorkspace(workspaceId: string, filter?: {
    agentId?: BuiltinAgentId | "droid";
    definitionId?: AgentDefinitionId;
  }): TerminalAgentBinding[];
  findActive(
    workspaceId: string,
    agentId: BuiltinAgentId | "droid",
    definitionId?: AgentDefinitionId,
  ): TerminalAgentBinding | undefined; // tie-break: latest lastEventAt

  // Subscribe — emits "change", workspaceId after every mutation.
}
```

```ts
// packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts
terminalAgents.listByWorkspace({ workspaceId, agentId?, definitionId? })
  → TerminalAgentBinding[]

terminalAgents.findActive({ workspaceId, agentId, definitionId? })
  → TerminalAgentBinding | null

terminalAgents.getOrCreate({
  workspaceId,
  agentId,
  definitionId?,
  // launch params used only if no active binding matches:
  initialCommand?: string,
  cwd?: string,
}) → { binding: TerminalAgentBinding, created: boolean }
  // Reuses findActive; otherwise calls existing terminal.createSession and
  // returns once the row appears (or after a 10s timeout).

terminalAgents.onWorkspaceChange({ workspaceId })
  → observable<{ kind: "snapshot" | "change", bindings: TerminalAgentBinding[] }>
  // observable (not async generator) per apps/desktop/AGENTS.md
```

Module also exports the bare `TerminalAgentStore` and `getOrCreate` helper for host-side callers (future automation) to use without a tRPC round-trip.

## Behavior

`recordEvent`:
- `start` / `attach` → upsert binding, set `startedAt` if new, update `lastEventAt`/`lastEventType`. If existing binding has a different `agentId` or `agentSessionId`, overwrite (decision #2).
- intermediate (`tool_use`, `awaiting_input`, …) → update `lastEventAt` + `lastEventType` only.
- `exit` / `error` → delete the binding (decision #3).
- Event-type mapping reuses existing `mapEventType` from `packages/host-service/src/events`.

`markTerminalExited(terminalId)` → delete the binding if present.

`getOrCreate`:
1. `findActive(workspaceId, agentId, definitionId)` — return if hit, `created: false`.
2. Else, call `terminal.createSession` (existing) with `initialCommand` and `cwd`.
3. Wait for `store.emit("change", workspaceId)` until a binding matching `(workspaceId, agentId, definitionId, terminalId === newTerminalId)` appears. Timeout: 10s → throw typed `AgentStartTimeout`.
4. Return `{ binding, created: true }`.

## Wire-points

- `notifications.hook` — after the existing `broadcastAgentLifecycle`, also call `ctx.terminalAgentStore.recordEvent(...)` with the same fields. Same trigger, same payload shape.
- Terminal-exit path — wherever `disposeSessionAndWait` finalizes, call `ctx.terminalAgentStore.markTerminalExited(terminalId)`. One line.
- tRPC root — register `terminalAgents` router.
- Store instantiation — single instance on `ctx`, alongside `eventBus`.

## Edge cases

- **Hook never fires** — no binding appears; `findActive` returns null and `getOrCreate` falls through to create.
- **Host-service restart** — Map empties. Active agents reappear on their next event; idle agents stay unknown until they emit. Accepted.
- **Agent swap inside same pty** (claude `/exit` → codex) — second `start` event overwrites the binding's `agentId`/`agentSessionId`/`startedAt`. Old identity is gone (decision #3 — absence is the signal).
- **Multiple matches for `findActive`** — tie-break by latest `lastEventAt` (decision #4).
- **Two agents in same pty** (tmux split) — out of scope; one foreground agent per terminal.
- **Cross-machine** — out of scope; host-service-local.

## Files

New:
- `packages/host-service/src/terminal-agents/store.ts`
- `packages/host-service/src/terminal-agents/store.test.ts`
- `packages/host-service/src/terminal-agents/types.ts`
- `packages/host-service/src/terminal-agents/index.ts`
- `packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts`
- `packages/host-service/src/trpc/router/terminal-agents/terminal-agents.test.ts`
- `packages/host-service/src/trpc/router/terminal-agents/index.ts`

Touched:
- `packages/host-service/src/trpc/router/notifications/notifications.ts` — one call after `broadcastAgentLifecycle`.
- `packages/host-service/src/trpc/router/terminal/terminal.ts` — one call in the exit path.
- tRPC root router file — register `terminalAgents`.
- ctx factory — instantiate the singleton store.

## Tests

Store unit tests:
- start → binding visible to `get` / `listByWorkspace` / `findActive`.
- intermediate event updates `lastEventAt` / `lastEventType` only.
- exit → binding gone.
- agent swap overwrites in place.
- `findActive` tie-break picks latest `lastEventAt`.
- `markTerminalExited` removes binding.

Router integration tests:
- `notifications.hook` → row appears in `listByWorkspace`.
- terminal exit → row removed.
- `getOrCreate` reuse path returns existing without spawning.
- `getOrCreate` miss path calls `terminal.createSession` and resolves when the binding appears.
- `getOrCreate` miss path times out cleanly when no hook fires.
- `onWorkspaceChange` emits snapshot then deltas.

## Out of scope

- Automation rewire (`runTerminalAgent` keeps always-create for now).
- SQLite persistence.
- History / audit of past bindings.
- Per-agent `supportsReuse` flag (decide when first reuse-consumer ships).
- Submit-sequence map (callers write whatever terminator they want; this module doesn't format input).

## For the next consumer ("send message to active agent")

When wiring the first reuse consumer, expect to make these calls. Update this list as decisions land.

1. **Input formatting** — `terminal.writeInput` is raw bytes. Each agent has its own submit sequence (claude: text + `\r`; codex/cursor/opencode may differ; some need a leading clear). First consumer ships per-agent formatting; second consumer = extract to `formatAgentInput(agentId, text)`. Decide whether it lives in `terminal-agents/` or `@superset/shared/agent-catalog`.
2. **Readiness vs. attached** — `getOrCreate` resolves on the first lifecycle hook (`Attached`/`SessionStart`), not on prompt-readiness. Sending input the next tick can race the REPL. Either confirm the hook fires post-ready or add a "ready" event type and a second wait.
3. **Busy/idle signal** — `lastEventType` is recorded but consumers don't know the catalog. If "send message" should queue or refuse while the agent is mid-turn, add a derived `state: "idle" | "working" | "awaiting_input"` on `TerminalAgentBinding` (or an `isIdle` helper) rather than re-deriving in each caller.

Already handled in this PR (no action needed):

- Concurrent `getOrCreate` for the same `(workspaceId, agentId, definitionId)` is coalesced via an in-flight map — second caller awaits the first.
- `getOrCreate` timeout disposes the spawned terminal so retries don't leak ptys.
