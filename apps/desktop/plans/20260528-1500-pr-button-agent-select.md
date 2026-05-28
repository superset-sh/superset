# PR action button — agent select

Status: phase 1 shipped (split-button shell), phase 2 starting (agent picker)
Owner: desktop
Related: PR #4966 (inline agent-comment composer on v2 DiffPane), v2 `PRActionHeader`

Mirror the agent-pick affordance we shipped on the DiffPane comment
composer into the top-right PR action slot, so the user can hand PR
authoring off to either a running agent session or a freshly launched
one — without losing the one-click default.

The PR flow already runs through an agent (the current Create PR opens
a new chat tab with a slash command + `pr-context.md`). This work
gives the user control over **which** agent runs it, plus extends the
same affordance to Update PR (pr-exists state) and lets the project
ship per-repo prompt customizations.

## Current state

`apps/desktop/.../WorkspaceSidebar/components/PRActionHeader/PRActionHeader.tsx`
renders `CreatePRIconButton` (lines 155–177): an icon-only button
(`VscGitPullRequest`) wrapped in a tooltip. Clicking it dispatches
`{ state, draft: false }` into the `PRFlowDispatch` reducer, which
runs the existing programmatic create-PR flow. No label, no chevron,
no agent handoff.

The DiffPane comment composer (`AgentCommentComposer`, shipped in
#4966) gives us the pattern we want to reuse:
- `AgentPickerSelect` — Radix select grouped into **Active sessions**
  (`existing:<terminalId>`) + **Start new** (`new:<configId>`).
- `useDiffCommentTarget` — selection state, localStorage persistence
  for both existing/new picks, validation + fallbacks (dead session,
  deleted config).
- `AgentPlacementToggle` — split-pane vs new-tab, only when `kind === "new"`.
- Submit routing: `existing` → `sendToTerminalAgent`; `new` →
  `onCreateNewAgentSession({ configId, placement, prompt })`.

## UI interactions (locked)

### Split-button shape

```
┌──────────────────┬───┐
│ 📥  Create PR    │ ▾ │
└──────────────────┴───┘
```

The button is a **bordered pill** mirroring the v1 PRButton / v2
`PRStatusGroup` styling — `rounded border border-border bg-muted/40`
container, primary region with icon + label, vertical divider, then a
chevron region. Sits to the right of `PRStatusGroup` so the action
header reads as one visual family.

- Primary region → runs the *default* agent (today: a new chat tab
  with the `/pr/{create,update}-pr` slash command + the
  `pr-context.md` attachment; later, the last-picked agent from the
  dropdown).
- Chevron region → opens a `DropdownMenu` anchored bottom-end. The
  dropdown is **purely** the agent picker — there is no separate
  "direct vs agent" distinction. Every click runs an agent.

One component (`PRActionSplitButton`) covers both verbs via a `kind`
prop. Labels swap to **"Update PR"** with a `VscEdit` icon when a PR
already exists.

### All-states behaviour

| `PRFlowState` | Slot rendering |
|---|---|
| `loading` | empty (no anchor) |
| `unavailable` | muted `VscGitPullRequest` icon + tooltip with reason |
| `no-pr` | **Create PR** pill |
| `pr-exists` | **Update PR** pill + `PRStatusGroup` (`#N` + merge dropdown) |
| `busy` (no PR yet) | **Create PR** pill, primary disabled, icon → spinner, label "Creating…" |
| `busy` (PR exists) | **Update PR** pill (busy) + `PRStatusGroup` |
| `error` | retry icon |

### Dropdown contents

```
ACTIVE SESSIONS
  🟢 claude   pane 1
  🟢 codex    pane 2
─────────────────────
START NEW
  + claude
  + codex
  + cursor
─────────────────────
✎ Edit PR prompt…
```

Two groups grouped exactly like `AgentPickerSelect`, plus a tail item
that opens the project-prompt Dialog.

- **Active sessions** — every running terminal agent for this
  workspace, rendered with preset icon and pane label. Source: the
  same hook the comment composer uses. Click → send the
  PR-flow payload to that terminal via `sendToTerminalAgent`, and
  bring focus to its pane.
- **Start new** — every available `HostAgentConfig` for this
  workspace, prefixed with `+`. Click → launch a new agent session
  (split-pane placement) and seed it with the PR-flow payload.
- **Edit PR prompt…** — opens a Dialog (see below).

Empty states:
- No active sessions and no presets configured → both groups read
  "No agents available — open Settings to add a preset" as disabled
  items. The button itself stays clickable (primary still works via
  the legacy chat path until the last-picked agent is established).
- No active sessions only → "Active sessions" group header reads
  "No active sessions" (disabled item), "Start new" lists configs.

### Placement & persistence (Start new)

Reuse the comment-composer hook pattern. New hook
`usePRActionAgentTarget` lives next to the split button and wraps the
same primitives as `useDiffCommentTarget`:

- Remembers last picked existing terminalId and last picked new
  configId in localStorage, **keyed separately** from the comment
  composer so PR picks and comment picks don't trample each other.
- New sessions default to **split-pane** placement (matches the
  comment composer). No inline placement toggle in the menu — power
  users can move the pane afterwards.
- Validation + fallbacks mirror `useDiffCommentTarget`: if a
  remembered terminal is gone or a config was deleted, fall back to
  "most recent active session" → "first config" → "open new chat tab"
  (the legacy default). Never silently send to the wrong target.

The remembered pick **is** the "default agent" used by the primary
button. Click an item in the dropdown to switch defaults; the next
primary click goes there.

### Agent payload

Each invocation sends the same payload — the chosen agent only varies
the *transport*. The payload is:

- The **invocation string**: `/pr/create-pr` (or `--draft`) for
  no-pr, `/pr/update-pr` for pr-exists.
- The **`pr-context.md` attachment**: branch + sync snapshot, PR
  metadata when one exists, and the "## Project guidelines" section
  (see Custom prompt below).

Transports per target kind:
- **Chat tab (legacy default + new chat fallback)** — existing
  `onOpenChat({ initialPrompt, initialFiles })` path.
- **Existing terminal agent** — `sendToTerminalAgent` posts the
  invocation string as a single user message. The pr-context content
  is inlined into the message (terminal agents can't carry separate
  file attachments through the xterm channel).
- **New terminal preset launch** — host launches the preset with the
  same inlined invocation + context as the seed prompt.

The agent runs the actual `gh pr create`/`gh pr edit` itself. The
desktop side does not create or edit the PR in parallel; clicking is
a handoff.

### Custom prompt (per-project)

Storage: `.superset/pr-prompt.md`, checked into the project repo.
Optional — when absent or empty, behaviour is unchanged.

Edit surface: a **Dialog** opened from the "Edit PR prompt…" item at
the bottom of the chevron dropdown. The dialog shows the file path,
a multi-line textarea seeded from the file's current contents, a
short explainer ("Will be applied to both Create and Update"), and
Save/Cancel. A secondary "Open in editor" link deep-links the file
into a v2 file editor tab for power editing.

Composition: **appended, not replaced**. `buildPRContext` reads the
file at dispatch time (via the file system tRPC the renderer already
has) and, if non-empty, appends it as a `## Project guidelines`
section at the end of `pr-context.md`. The canonical slash command in
`.agents/commands/pr/*.md` keeps owning mechanics (preconditions, gh
syntax, formatting); the project file just carries opinions
("title format: `feat(scope): …`", "always include a Test Plan
section", "default to draft"). One file covers both verbs.

The slash command body needs a one-line addition telling the agent
to honor any `## Project guidelines` section in `pr-context.md`.

### Edge cases

- `createPREnabled` gate is gone; the kill-switch served its purpose
  during phase 1 and the always-true state is the new default.
- Submenu opened while a launch is mid-flight → the selected item
  shows a spinner; ignore additional clicks until the dispatch
  resolves.
- Keyboard: ⌘⇧P stays bound to the global `OPEN_PR` hotkey (opens
  the PR on GitHub). No new shortcut binding.
- The project prompt file is read every dispatch (no caching) so the
  user sees updates without a reload.

## Component plan

```
PRActionHeader/
  components/
    PRActionSplitButton/             # shipped (phase 1)
      PRActionSplitButton.tsx
      index.ts
      components/
        PRAgentPickerMenu/            # phase 2 — dropdown content
          PRAgentPickerMenu.tsx
          index.ts
        PRPromptEditDialog/           # phase 3 — Edit prompt dialog
          PRPromptEditDialog.tsx
          index.ts
      hooks/
        usePRActionAgentTarget/       # phase 2 — persistence + validation
          usePRActionAgentTarget.ts
          usePRActionAgentTarget.test.ts
          index.ts
        usePRActionDispatch/          # phase 2 — routes target → transport
          usePRActionDispatch.ts
          usePRActionDispatch.test.ts
          index.ts
```

`PRFlowDispatch` keeps the chat-tab transport for the legacy default;
the new `usePRActionDispatch` wraps it and adds terminal + new-pane
transports, branching on `target.kind`.

### Reuse strategy (vs. comment composer)

The comment composer code under `DiffPane/components/AgentCommentComposer`
ships three reusable concerns we want to share, plus one we don't:

| Piece | Decision |
|---|---|
| Data source: list active terminal agents + available `HostAgentConfig`s for a workspace | **Refactor & lift.** Today this is co-located inside `AgentPickerSelect.tsx`. Extract to a shared hook under a non-DiffPane path (`apps/desktop/src/renderer/hooks/agents/useWorkspaceAgentTargets/`) so both surfaces consume it. |
| Selection model + localStorage persistence (`useDiffCommentTarget`) | **Refactor.** Generalise into `createAgentTargetStore({ storageKey, defaultPlacement })` and have both `useDiffCommentTarget` and `usePRActionAgentTarget` wrap it. Keys stay distinct so picks don't bleed across surfaces. |
| Submit routing (`useDiffCommentComposer`) | **Re-implement, don't share.** The comment flow sends a freeform user message; the PR flow sends a slash command + attachment. Different payloads, similar shape — copy the routing skeleton. |
| `AgentPickerSelect` Radix Select widget | **Do not reuse.** PR menu uses `DropdownMenu` items, not a select. Same data, different shell. |
| `AgentPlacementToggle` (split-pane / new-tab) | **Not surfaced in v1.** PR flow defaults to split-pane silently. The toggle lives in the comment composer only. |

This gives one canonical answer per concern and keeps the comment
composer's shape intact — the DiffPane work stays a thin wrapper
around the same shared primitives.

### Transports

The shared dispatch hook picks transport from `target.kind`:

- `chat-tab` (default fallback) — existing `onOpenChat({ initialPrompt, initialFiles })`.
- `existing` — `sendToTerminalAgent(terminalId, message)`, where
  `message` is the slash command followed by the `pr-context.md`
  contents fenced inline (terminal agents can't take separate file
  attachments through xterm). Focus the target pane.
- `new` — launch the preset via the host with a seed prompt built the
  same way as `existing`.

## Phasing

1. ✅ **Split button shell** — bordered pill, all-states routing,
   Create + Update + busy + spinner. Shipped in `29a20e127`.
2. **Agent picker (this phase)** — extract shared data hook + target
   store from the comment composer, render the dropdown, wire
   existing + new transports, persist last pick.
3. **Custom prompt** — `.superset/pr-prompt.md` read on dispatch,
   appended to `pr-context.md`; "Edit PR prompt…" Dialog at the tail
   of the dropdown; slash command body learns to honor the section.
4. **Polish** — mid-launch spinner per item, empty states, telemetry
   on which transport users actually pick.

## Open questions

- Should `sendToTerminalAgent` get a small "PR handoff" toast so the
  user knows the agent has been pinged in a (possibly off-screen)
  pane? Leaning yes.
- For the prompt Dialog's "Open in editor" link, do we open a v2
  file tab (`addTab({ kind: "file", path })`) or just shell out
  through the existing PathActions menu? Pick whichever has a
  one-call surface.
