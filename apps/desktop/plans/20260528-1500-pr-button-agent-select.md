# Create PR button — agent select

Status: in design (UI interactions locked)
Owner: desktop
Related: PR #4966 (inline agent-comment composer on v2 DiffPane), v2 `PRActionHeader`

Mirror the agent-pick affordance we shipped on the DiffPane comment
composer into the top-right "Create PR" entry point, so the user can
hand PR authoring off to either a running agent session or a freshly
launched one — without losing the one-click fast path.

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
┌───────────────────┬───┐
│ ⤴  Create PR      │ ▾ │
└───────────────────┴───┘
```

- Primary region (icon + "Create PR" label) → fires the **current**
  programmatic flow (`dispatch({ state, draft: false })`). Keeps ⌘⇧P
  bound to this fast path.
- Chevron region → opens a `DropdownMenu` anchored bottom-end.

Tooltip on primary stays "Create Pull Request" (with `⌘⇧P` kbd hint).
The button only shows in the existing `create-pr-dropdown` variant of
`ActionSlot` — the disabled / unavailable / cancel-busy variants are
unchanged.

### Dropdown contents

```
Create PR              ⌘⇧P
Create draft PR
────────────────────────
Create with agent       ▸
                          ┌───────────────────────┐
                          │ Active sessions       │
                          │   🟢 claude  pane 1   │
                          │   🟢 codex   pane 2   │
                          │ ───────────────────── │
                          │ Start new             │
                          │   + claude            │
                          │   + codex             │
                          │   + cursor            │
                          └───────────────────────┘
```

- `Create PR` — same as the primary action; kept in menu so the
  shortcut is discoverable.
- `Create draft PR` — `dispatch({ state, draft: true })`. Existing
  reducer already supports it; just no UI for it today.
- `Create with agent ▸` — hover/focus opens a nested submenu. **One
  click = send**; no composer popover, no textarea.

### Agent submenu

Grouped exactly like `AgentPickerSelect`:

- **Active sessions** — every running terminal agent for this
  workspace, rendered with its preset icon and pane label. Source:
  same hook the comment composer uses (`useTerminalAgentBindings` /
  whatever the `AgentPickerSelect` reads from). Click → send to that
  terminal via `sendToTerminalAgent`.
- **Start new** — every available `HostAgentConfig` for this
  workspace, prefixed with `+`. Click → launch a new agent session
  with the configured placement.

Empty states:
- No active sessions and no presets configured → submenu reads
  "No agents available — open Settings to add a preset" (disabled
  link item). Reachable but never blocking; the direct-create entries
  above stay functional.
- No active sessions only → the "Active sessions" header is omitted;
  show only "Start new".

### Placement & persistence (Start new)

Reuse the comment-composer hook pattern (new hook,
`usePRCreateAgentTarget`, that wraps the same primitives):

- Remembers last picked **existing terminalId** and last picked
  **new configId** in localStorage, keyed separately from the comment
  composer (so PR picks don't bleed into comment picks and vice
  versa).
- New sessions default to **split-pane** placement, matching the
  comment composer. No inline placement toggle in the menu — keep it
  one-click. Power users who want new-tab can move via the existing
  pane controls after launch.
- Validation + fallbacks mirror `useDiffCommentTarget`: if a
  remembered terminal is gone or a config was deleted, fall back to
  "most recent active session" → "first config" — never silently
  send to the wrong target.

### Agent payload

Each click in the agent submenu produces a single structured prompt
sent to the chosen agent (either via `sendToTerminalAgent` or as the
launch prompt for a new session). The payload contains:

- A canned instruction line: "Create a pull request for the current
  branch using `gh pr create`."
- Branch context: source branch, base branch, repo slug.
- Diff context: short stat / summary of `git diff base...HEAD`
  (filenames + counts; full diff is too noisy to paste into a chat).
- Suggested title pulled from the existing PR-flow logic that already
  generates one (the same source `dispatch({ state, draft: false })`
  uses today) — agent is free to override.

The agent runs the actual `gh pr create` itself. The desktop side
does **not** create the PR in parallel; clicking "Create with agent"
is a handoff, not a hybrid.

### Edge cases

- `createPREnabled === false` → existing "Create PR coming soon"
  muted icon stays as-is; no split button, no chevron.
- `cancel-busy` / `retry` / `disabled-tooltip` variants → unchanged.
- Submenu opened while a session is mid-launch → debounce: the
  selected item shows a spinner; ignore additional clicks until the
  dispatch resolves.
- Keyboard: `⌘⇧P` keeps firing the primary direct-create action; menu
  is mouse/keyboard navigable but no per-agent shortcuts in v1.

## Component plan

Mirror the comment-composer layout, scoped to PR creation:

```
PRActionHeader/
  components/
    CreatePRSplitButton/
      CreatePRSplitButton.tsx        # split button + dropdown root
      index.ts
      components/
        CreatePRMenu/
          CreatePRMenu.tsx           # direct + draft + agent submenu items
          index.ts
        AgentSubmenu/
          AgentSubmenu.tsx           # active-sessions + start-new groups
          index.ts
      hooks/
        usePRCreateAgentTarget/      # localStorage persistence + validation
          usePRCreateAgentTarget.ts
          usePRCreateAgentTarget.test.ts
          index.ts
        useCreatePRWithAgent/        # builds prompt + routes to existing/new
          useCreatePRWithAgent.ts
          useCreatePRWithAgent.test.ts
          index.ts
```

`CreatePRIconButton` (the current icon-only button) is replaced
in-place inside `ActionSlot` by `CreatePRSplitButton`. The reducer
contract (`PRFlowDispatch`) is unchanged — direct/draft paths still
go through `dispatch({ state, draft })`. Agent paths bypass the
reducer and go straight to terminal/host APIs (the agent owns the
create call from there).

Reusable bits we are **not** duplicating:
- `AgentPickerSelect` itself — the menu uses `DropdownMenu` items,
  not a Radix select, so we render the same data through a different
  shell. Extract the data source (the hook that lists active sessions
  + available configs) if it isn't already extracted from
  `AgentPickerSelect`.
- The `EXISTING_PREFIX` / `NEW_PREFIX` encoding — not needed; the
  menu has typed callbacks per item.

## Phasing

1. **Split button + direct/draft items** — visual shell, no agent
   submenu yet. Validates the screenshot and frees ⌘⇧P discovery.
2. **Agent submenu, existing sessions only** — narrowest useful
   handoff: send PR-create instruction to the running agent. No
   persistence yet.
3. **Start new sessions** — wire `usePRCreateAgentTarget` + launch
   path; add localStorage persistence + validation/fallbacks.
4. **Polish** — empty states, mid-launch spinner, submenu icons,
   tooltips on long-named items.

## Open questions

- Do we want the agent prompt to be visible to the user before send
  (e.g. a transient toast "Asked claude to create the PR")? Probably
  yes — keeps it discoverable that the agent is doing it, not us.
- Should we surface "Create draft PR" inside the agent submenu too
  (e.g. via a Shift-click modifier), or is draft-vs-final the agent's
  call once it's running? Default: agent decides, don't double-up.
- The diff summary in the prompt — generated client-side from the
  same data PR-flow already has, or asked of the agent's own shell
  via `gh`? Lean client-side to keep handoff self-contained.
