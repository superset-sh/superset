# Free Solo — a free-form terminal board

**Date:** 2026-08-18
**Status:** Design, pending implementation plan

## Goal

One board where terminals from *any* workspace — across projects and hosts — sit
side by side, freely positioned and resized. It exists so a session spent
watching three things at once (a dev server here, an agent there, a scratch
shell) stops being a sequence of workspace switches.

Terminals only in v1. A card frame that doesn't know what it contains, so other
pane kinds can land later without reshaping the board.

## Decisions settled up front

| Question | Decision | Why |
| --- | --- | --- |
| Card vs. workspace pane | **Mirror**, not move | The runtime registry already keys on `(terminalId, instanceId)`; move semantics would be a new subsystem |
| Card contents in v1 | **Terminals only** | Matches the ask; file/diff/chat panes each need three more per-workspace providers |
| Number of boards | **One** | Singleton row answers the localStorage bound question outright |
| Where it lives | **A dashboard route**, not a second window | Board and workspace never share the screen, which is what makes mirroring free |

## Why mirroring costs nothing

Three existing facts make a second view of a live terminal a non-feature:

- `terminal-runtime-registry.ts` keys entries by `(terminalId, instanceId)`, not
  by `terminalId`. Each entry owns its own xterm runtime *and* its own WebSocket
  transport.
- `serializeExistingRuntime(terminalId, excludedInstanceId)` seeds a new
  runtime's buffer from a live sibling. Written for exactly this case.
- host-service holds `session.sockets` as a `Set` and replays scrollback
  (`sendSeqAttach` / `replayBuffer`) to every socket that attaches.

So a board card is just another `instanceId` for a `terminalId`. No host
changes, no changes to how workspace panes work, no "this terminal is checked
out" state to keep coherent across crashes.

**Known ceiling.** One PTY has one winsize, and `resize` is last-write-wins
across attached clients. Two views at different sizes would fight, and the
smaller one would show broken reflow. This stays theoretical while the board and
the workspace are separate routes — only one view is on screen at a time, so the
handoff is the same one that already happens when switching between workspaces
of different widths. If the board ever becomes a second window or a split, the
fix is a size owner: the focused view dictates winsize, others scroll. Mark the
constant with a `ponytail:` note pointing here.

The one case where the board could make that fight real is two cards pointing at
the same terminal, which would sit on screen together at different sizes. So
`terminalId` is unique across cards: the store rejects a duplicate and the
picker shows an already-boarded session as disabled rather than addable.

## Data model

```ts
interface BoardCard {
  id: string;          // stable; doubles as instanceId in terminalRuntimeRegistry
  workspaceId: string;
  terminalId: string;
  createOnAttach?: boolean;  // card added as "new terminal", session spawns on WS attach
  x: number; y: number; w: number; h: number;
  z: number;
}

interface BoardState {
  cards: BoardCard[];
  activeCardId: string | null;  // not persisted; a reload starts with nothing focused
}
```

Three non-obvious properties:

- **`id` is the runtime key.** It must survive a reload, or a restored card
  loses its scrollback and re-pulls it as a fresh attach.
- **Pixels, not percentages.** The board scrolls; it does not scale to the
  window. Reflowing cards on window resize would change every terminal's
  cols/rows for no reason.
- **`createOnAttach` mirrors the pane data flag.** Adding a *new* terminal mints
  a UUID client-side and lets the WebSocket attach create the session host-side
  (`?create=1`), the same optimistic path v2 panes use to avoid queueing behind
  Chromium's 6-per-origin HTTP pool. No launcher, no provider, no awaited
  mutation at add time.

### Persistence

zustand + `persist`, one key (`free-solo-board`), following
`stores/sidebar-sections-collapse.ts`. Registered in
`lib/persisted-keys/persisted-key-registry.test-data.ts` — CI fails otherwise.

Answering the three questions `apps/desktop/AGENTS.md` requires of every writer:

1. **What bounds it?** A single board with a hard cap of `MAX_CARDS = 16`. Each
   card is a live xterm plus a WebSocket, so the cap is a resource limit before
   it is a storage one. Past it, the add button disables with a reason.
2. **Who deletes it?** Cards are reconciled against live state on board load
   (see *Dead cards*). Removing a card removes the entry outright, never writes
   `null`.
3. **What when the feature dies?** The key moves to `DEAD_KEYS` in the same PR
   that removes the writer.

## Rendering a card

```
<BoardCard>                            frame, title bar, drag + resize affordances
  <WorkspaceProvider workspace={ws}>   resolves hostUrl, mounts the tRPC client
    <TerminalPane ctx={stub} … />      existing component
```

`WorkspaceProvider` is reusable as-is: it takes a workspace, resolves the host
URL through `useHostWorkspaces().cache` (which already knows sandbox and relay
addressing), and mounts `WorkspaceClientProvider`. Mounting it outside the
workspace route has precedent — `V2SessionsSection` in terminal settings does
it.

Two properties fall out for free:

- **Host failure is scoped to the card.** `WorkspaceHostGate` renders its
  unreachable state as `absolute inset-0` inside its own relative container and
  deliberately keeps children mounted. Inside a card that means: one project's
  host goes down, that card is covered, the rest of the board keeps running.
- **Clients are shared per workspace.** `WorkspaceClientProvider` caches on
  `cacheKey:hostUrl` with `cacheKey = workspace.id`, so three cards from one
  workspace share a tRPC client and a query client.

Two small additions are needed:

1. **A stub `RendererContext`.** `TerminalPane` (549 lines) touches only
   `pane.data`, `pane.id`, `isActive`, and `store`. The card supplies
   `pane.id = card.id`, `pane.data = { terminalId, createOnAttach }`,
   `isActive = (card.id === activeCardId)`, and its own
   `createWorkspaceStore()`. Exactly one card is active — `isActive` gates the
   search and rich-input hotkeys, and two terminals must not answer `⌘F` at
   once.
2. **An optional `onOpenUrl` prop on `TerminalPane`.** The single place the
   component reads `store` is the link-click handler, which opens URLs as a
   browser tab in the workspace via `openUrlInV2Workspace`. The board has no
   such tab, so it passes "open externally". Default keeps today's behaviour, so
   the workspace path is untouched. File and folder clicks need no change:
   `useOpenInExternalEditor(workspaceId)` and `useRevealInFinder(workspaceId)`
   are meaningful on the board too.

### The card frame

The title bar carries what tells two cards apart when they come from different
projects: project name, workspace name, and the session title (the same
reactive title source workspace tabs use). Plus a close button. It is also the
drag handle.

An empty board shows a single call to action that opens the same picker as "+".

## Interaction

- **Move** — pointer events on the card's title bar: `setPointerCapture`,
  translate by delta, clamp to the board, commit to the store on `pointerup`
  (intermediate positions stay in local state so a drag isn't 60 writes/sec to
  localStorage).
- **Resize** — native CSS `resize: both` on the card body with `min-width` /
  `min-height`, plus a `ResizeObserver` to persist the final size. No resize
  code at all, and the terminal's own `ResizeObserver` (installed by
  `attachToContainer`) already refits xterm through its existing debounced
  scheduler. The card body reserves a few pixels of padding around the terminal
  so the bottom-right corner belongs to the card and not to xterm's screen,
  which otherwise captures the pointer there — **verify the grip is grabbable
  as the first implementation step**; if it isn't, resize falls back to the same
  pointer-events pattern as drag. *Ceiling:* the native grip only resizes from
  the bottom-right. Resizing from the top or left edge (which has to move
  `x`/`y` too) needs custom handles — add them when someone asks.
- **Stacking** — clicking a card raises it (`z = max + 1`) and makes it active.
  `z` values are renormalized to `0..n-1` on load so they can't drift upward
  forever across sessions.
- **Focus** — the active card focuses its xterm. Clicking the empty board
  deactivates all cards, so global hotkeys aren't captured by a terminal.

Explicitly not in v1: canvas zoom/pan (the board scrolls), snapping, grouping,
alignment guides, saved layouts.

## Adding cards

One "+" button with three sources:

1. **An existing terminal.** `terminal.list` takes an *optional* `workspaceId`;
   omitting it returns every live session on that host. The picker mounts one
   invisible `WorkspaceClientProvider` per unique host URL among the user's
   workspaces (the `V2SessionsSection` pattern), issues one `terminal.list({})`
   per host, and groups the results by workspace and project using
   `useHostWorkspaces`. Sessions already on the board are shown as such.
2. **A new terminal in a chosen workspace.** Mint `crypto.randomUUID()`, insert
   a card with `createOnAttach: true`. The WebSocket creates the session.
3. **An empty scratch session.** Session workspaces (`projectId: null`) already
   exist — the "session" arm of the new-workspace flow. The board calls the same
   `useCreateWorkspace` path with `isSession: true`, then drops a
   `createOnAttach` card pointing at the new workspace. That workspace is real
   and appears in the sidebar; removing the card does **not** delete it. The
   board never deletes workspaces — the sidebar owns that.

Sessions already on the board appear disabled in the picker (see the uniqueness
rule above).

## Error handling

| Situation | Behaviour |
| --- | --- |
| Workspace deleted elsewhere (CLI, another machine) | Reconcile on load against `useHostWorkspaces`: card becomes a "workspace is gone" tile with *Remove* |
| Terminal closed in its workspace pane | Reconcile against `terminal.list`: card becomes a "session closed" tile with *Remove* and *Start a new terminal here* |
| Host offline | `WorkspaceHostGate`'s overlay covers that card only; recovers on its own |
| Session exits while shown | Existing `TerminalPane` exit handling, unchanged |
| Card cap reached | Add button disabled, reason in the tooltip |

Reconciliation waits for `useHostWorkspaces` to report `hostsSettled` — an early
read is incomplete, and reconciling against it would flash the dead tile on
every card at boot. It also never deletes silently: a card the user placed does
not vanish because a host was briefly unreachable during a poll. Removal is
always a click.

## Testing

Unit (bun):

- Board store: add / move / resize / raise / remove, cap enforcement, `z`
  renormalization on load, reconciliation marking cards dead without dropping
  them.
- Drag math: delta → clamped position, isolated from React like
  `terminal-runtime-eviction.ts` is.
- The persisted-key registry test already fails on an unregistered writer; the
  new key must be added there.

End-to-end: CDP verification per `.agents/skills/cdp-verification/SKILL.md` —
two cards from two different projects, both attached and echoing input, a drag
and a resize surviving a reload, and a card whose terminal was closed from its
workspace showing the dead-card tile.

## Out of scope

Multiple boards, non-terminal cards, a separate window, canvas zoom, sharing a
board between machines, and reordering/tabbing inside a card. Each is additive
against this data model.
