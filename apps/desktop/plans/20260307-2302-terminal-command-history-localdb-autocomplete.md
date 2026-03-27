# Terminal Command History + Autocomplete (`localDb`-Backed)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` should be updated as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` and the existing `apps/desktop/plans/` documents.


## Purpose / Big Picture

Add terminal command history persistence and autocomplete that:

1. Survives renderer reloads and app restarts.
2. Uses `localDb` as the source of truth instead of daemon-owned memory.
3. Feels closer to shell-native autosuggestions than a renderer-side guesser.
4. Preserves the current terminal architecture: shell remains authoritative for the live prompt; the app stores history and serves suggestions.

This is intentionally not a full custom shell completion engine. The goal is persistent command-history suggestions plus path-aware autocomplete, with zsh-first integration.


## Problem Statement

Today the desktop terminal only has a renderer-local `commandBufferRef` in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`. That buffer is best-effort only and exists mainly to help rename tabs after `Enter`.

That is not strong enough for:

1. Persistent command history across restarts.
2. Reliable capture of accepted shell commands.
3. `oh-my-zsh`-style autosuggestions that stay in sync with the real shell buffer.

The daemon is also the wrong persistence boundary for this feature. Terminal sessions are transient runtime infrastructure; command history is user data and should live in durable local storage.


## Goals

This work should deliver:

1. Accepted terminal commands are persisted in `localDb`.
2. The history model supports filtering by `workspaceId`, shell, cwd, prefix, recency, and frequency.
3. App-sent commands and shell-accepted commands both land in the same history store.
4. Autocomplete suggestions are served from main process APIs, not renderer memory.
5. Zsh gets the first high-quality integration path.


## Non-Goals

This plan does not attempt to:

1. Replace native shell completion for all shells.
2. Make the daemon the source of truth for command history.
3. Infer command history purely from xterm keypresses.
4. Achieve bash/fish parity in the first iteration.
5. Hand-edit `packages/local-db/drizzle/` migration files.


## Context / Orientation

Relevant existing pieces:

1. Terminal input is written directly to the PTY from the renderer via `terminal.write` and `xterm.onData`.
2. Shell environment injection already exists via `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts`.
3. The app already exposes a localhost hook channel via `SUPERSET_PORT` in `apps/desktop/src/main/lib/terminal/env.ts`.
4. `localDb` is already used for persistent autocomplete-style data via `browser_history` in `packages/local-db/src/schema/schema.ts` and `apps/desktop/src/lib/trpc/routers/browser-history/index.ts`.

Design implication:

The clean capture path is shell hook -> app endpoint -> `localDb`, not renderer keypress sniffing and not daemon session state.


## Proposed Architecture

### Source of Truth

Use `localDb` SQLite as the canonical store for terminal command history.

Optional future hardening:

- Add an append-only JSONL journal under `~/.superset/` only as a recovery/fallback mechanism, not the query surface.

### Capture Paths

There are two legitimate ways commands enter history:

1. App-sent commands
   - Presets
   - Launch flows
   - Programmatic `writeCommandInPane` / `writeCommandsInPane`

2. Shell-accepted commands
   - Captured by shell integration after the shell accepts the line
   - Not inferred from renderer-local keystroke buffers

### Suggestion Paths

Suggestions should come from main-process queries over `localDb`, optionally merged with path results from the filesystem router.

### Shell Ownership

The shell remains authoritative for:

1. The live editable buffer
2. Cursor position
3. Acceptance semantics
4. Native completion behavior

The app owns:

1. Persistent history storage
2. Ranking and retrieval
3. Optional ghost suggestion rendering
4. Cross-session survival


## Data Model

Add a new `localDb` table, tentatively:

`terminal_command_history`

Recommended columns:

1. `id`
2. `workspaceId`
3. `paneId` nullable
4. `shell`
5. `cwd`
6. `command`
7. `normalizedCommand`
8. `source` (`typed`, `preset`, `programmatic`)
9. `lastUsedAt`
10. `useCount`
11. `exitCode` nullable

Recommended indexes:

1. `(workspaceId, lastUsedAt desc)`
2. `(workspaceId, normalizedCommand)`
3. `(workspaceId, cwd)`
4. `(lastUsedAt desc)`

Notes:

1. `normalizedCommand` should support dedupe and prefix matching.
2. `cwd` should preserve the real shell cwd at submission time when available.
3. `paneId` is metadata, not identity.


## API Shape

Add a new desktop tRPC router, for example `terminalHistory`.

Read operations:

1. `getRecent({ workspaceId, limit })`
2. `getSuggestions({ workspaceId, cwd, shell, prefix, limit })`
3. `search({ workspaceId, query, limit })`

Write operations:

1. `recordAcceptedCommand({ workspaceId, paneId, shell, cwd, command, source })`
2. `recordCommandResult({ workspaceId, paneId, command, exitCode })`
3. `clear({ workspaceId? })`

Behavior:

1. Writes should upsert on normalized command where appropriate.
2. Reads should rank by prefix match first, then frequency/recency.
3. Empty-prefix lookups should return recent commands only.


## Capture Strategy

### App-Sent Commands

Record directly at the call sites that already know the command string:

1. `apps/desktop/src/renderer/lib/terminal/launch-command.ts`
2. Any preset execution flow that bypasses that helper, if found

This is straightforward and low risk.

### Typed Commands

Do not use renderer-local `commandBufferRef` as the source of truth.

Instead:

1. Extend the zsh wrapper generated by `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts`.
2. Add a lightweight shell-side hook that runs when the shell accepts a command.
3. Send `workspaceId`, `paneId`, `cwd`, `shell`, and `command` to a local app endpoint over localhost.

Why:

1. Shell acceptance is the correct semantic boundary.
2. This avoids guessing through terminal redraws, history traversal, and cursor edits.
3. It matches the existing hook pattern already used elsewhere in the app.


## Zsh-First Integration

Scope the first implementation to zsh.

Plan:

1. Add a small zsh integration script through the existing wrapper chain.
2. Capture accepted commands using shell-native hooks/widgets.
3. Query app suggestions from `localDb`.
4. Start with history-based suggestions before path completion.

Important constraint:

This should augment zsh, not fight it. Avoid a first version that hijacks `Tab` globally and regresses native completion behavior.

Recommended first UX:

1. Inline ghost suggestion or lightweight suggestion overlay
2. Acceptance on a non-destructive keybinding
3. Native shell completion still available


## Path Completion

Path suggestions should be a second layer, not the first milestone.

Implementation direction:

1. Use current cwd from shell-side capture or existing terminal cwd tracking.
2. Query the filesystem router for directory entries.
3. Merge path candidates with history candidates in one ranked response.

Keep the first version narrow:

1. End-of-line token completion only
2. No full shell parsing
3. No attempt at shell-specific option completion


## Milestones

### Milestone 1: `localDb` Schema + Router

Work:

1. Add `terminal_command_history` to `packages/local-db/src/schema/schema.ts`.
2. Generate migration via Drizzle.
3. Add a desktop router for read/write operations.
4. Register the router in the desktop tRPC root.

Acceptance:

1. `bun run typecheck`
2. Router tests for insert, upsert, prefix lookup, and clear

### Milestone 2: Record App-Sent Commands

Work:

1. Record commands from `launch-command.ts`.
2. Ensure presets and programmatic sends are persisted.
3. Prevent duplicate writes for obvious retries.

Acceptance:

1. Programmatic terminal sends appear in recent history after restart.
2. Tests cover newline normalization and dedupe behavior.

### Milestone 3: Zsh Accepted-Command Capture

Work:

1. Extend zsh wrapper generation.
2. Add a local hook endpoint for accepted command ingestion.
3. Persist shell-accepted commands with cwd and shell metadata.

Acceptance:

1. A typed command accepted in zsh appears in `localDb`.
2. Restarting the app preserves the history.
3. Existing shell startup behavior is not regressed.

### Milestone 4: Suggestion Retrieval

Work:

1. Build ranked `getSuggestions`.
2. Return history-based results for prefix lookups.
3. Add workspace-aware ranking.

Acceptance:

1. Exact/prefix matches outrank older unrelated commands.
2. Recency and frequency both influence ordering in predictable ways.

### Milestone 5: Renderer Integration

Work:

1. Add a terminal autocomplete controller in the renderer.
2. Request suggestions from main process APIs.
3. Render suggestion UI without making the renderer the source of truth.

Acceptance:

1. Suggestions survive renderer remounts and app restarts.
2. Turning the UI on/off does not affect stored history.

### Milestone 6: Path Suggestions

Work:

1. Merge history suggestions with cwd-relative filesystem suggestions.
2. Add simple escaping/quoting rules for inserted paths.
3. Keep scope to end-of-line completion.

Acceptance:

1. Path suggestions work in normal workspace directories.
2. Large directories degrade gracefully.


## Risks and Mitigations

### Risk: Shell integration breaks user startup behavior

Mitigation:

1. Reuse the existing wrapper pattern.
2. Keep zsh integration additive and minimal.
3. Add integration tests around generated wrapper content and startup order.

### Risk: Query performance degrades with large history

Mitigation:

1. Add indexes up front.
2. Normalize aggressively.
3. Cap suggestion result counts.

### Risk: App-sent and shell-sent commands double-record

Mitigation:

1. Store `source`.
2. Normalize and coalesce near-duplicate writes.
3. Prefer idempotent upsert behavior over append-only duplication.

### Risk: Path completion expands scope into a shell parser project

Mitigation:

1. Ship history suggestions first.
2. Restrict first path version to simple terminal suffix completion.
3. Do not promise shell-native parity initially.


## Validation

Required:

1. `bun run typecheck`
2. Targeted tests for the new `localDb` schema/router behavior
3. Targeted tests for zsh wrapper generation

Manual checks:

1. Programmatic preset command persists and is queryable after restart.
2. Typed zsh command persists and is queryable after restart.
3. Suggestion ranking favors recent relevant commands.
4. Existing terminal startup and shell wrappers still function normally.


## Decision Log

1. Use `localDb` as the source of truth for terminal command history.
2. Do not make daemon memory or daemon persistence the canonical store.
3. Do not rely on renderer `commandBufferRef` for accepted-command history.
4. Ship zsh-first integration before considering bash/fish parity.


## Progress

1. Initial plan written.


## Surprises & Discoveries

1. The repo already has the right persistence pattern in `browser_history`; terminal command history should follow that model instead of inventing a new storage system.
2. The shell-wrapper and localhost-hook infrastructure already exists, which makes shell-side accepted-command capture far cleaner than renderer-side inference.


## Outcomes & Retrospective

Not started.
