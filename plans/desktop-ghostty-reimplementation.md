# Desktop Ghostty Reimplementation Plan

## Objective

Reimplement the desktop terminal integration around `ghostty-web` in small, controlled phases.

The goal is to ship a terminal that:

- renders through Ghostty, not xterm.js rendering
- types correctly and immediately
- keeps the cursor aligned with the rendered cell
- looks sharp and consistent across machines
- preserves terminal themes and app hotkeys
- avoids content bleed between terminals
- avoids tab-switch reattach churn
- remains maintainable and easy to debug

## Why We Are Restarting

The previous attempt changed too many things at once.

We mixed together:

- renderer migration
- tab lifecycle changes
- restore/reattach changes
- font delivery
- hotkey forwarding
- session safety
- agent hook integration
- tab strip overflow/perf cleanup

That made regressions hard to isolate.

The fresh-start rule is:

**each phase should solve one class of problems and avoid changing adjacent architecture unless it is strictly required.**

## Ground Rules

- Keep PRs small and single-purpose.
- Do not change tab or pane lifecycle in the renderer migration phase.
- Do not change transport/session semantics unless a reproducible bug requires it.
- Do not mount broad hidden UI trees just to keep terminals alive.
- Do not add recovery layers for bugs we have not reproduced.
- Prefer renderer-level fixes before architectural changes.
- Add focused tests for every non-trivial behavior change.
- Manual runtime validation is required for every phase touching terminal UX.

## Non-Goals For Early Phases

These should not be part of Phase 1 or Phase 2 unless they are absolute blockers:

- full tab keepalive
- hidden full-tab rendering
- broad store subscription cleanup outside terminal hot paths
- large naming/refactor passes across the whole codebase
- agent hook rewrites unrelated to terminal correctness
- generalized performance cleanup across unrelated panes

## Success Criteria

The final result should satisfy all of the following:

- typing works in fresh terminals, split terminals, and restored terminals
- the cursor is positioned correctly
- terminal text is crisp and glyphs render correctly
- app hotkeys work while terminal is focused
- terminal output never mixes between panes or sessions
- switching tabs does not visibly rebuild or replay the terminal session
- TUIs repaint correctly when a terminal becomes visible again
- codepaths are simpler than the current workaround-heavy approach

## External References

Use these as implementation references, not as excuses to copy entire architecture blindly.

- Mux terminal view: <https://github.com/coder/mux/blob/main/src/browser/components/TerminalView/TerminalView.tsx>
- ghostty-web README: <https://github.com/coder/ghostty-web/blob/main/README.md>
- Claude hooks docs: <https://docs.anthropic.com/en/docs/claude-code/hooks>
- CMUX notifications docs: <https://github.com/manaflow-ai/cmux/blob/main/docs/notifications.md>

## Phase 0: Baseline And Guardrails

### Scope

Capture current expected behavior and make debugging cheap before changing implementation.

### Deliverables

- A short baseline matrix covering:
  - typing
  - cursor position
  - tab switching
  - split pane
  - noisy terminal output
  - TUI repaint
  - hotkeys
  - fonts/glyphs
- Minimal instrumentation switches for terminal lifecycle logging.
- A list of existing terminal-specific tests and gaps.

### Must Not Change

- terminal renderer
- tab lifecycle
- session transport

### Acceptance

- We can reproduce failures intentionally.
- We have a stable checklist to run after every later phase.

## Phase 1: Minimal Ghostty Renderer Migration

### Scope

Replace terminal rendering with `ghostty-web` while preserving the existing app lifecycle as much as possible.

### Deliverables

- Centralized Ghostty runtime bootstrap as a singleton.
- Terminal component backed by Ghostty runtime.
- Existing session attach/write/resize flows wired into Ghostty.
- Theme application working with Ghostty.
- Basic focus and typing working.

### Implementation Notes

- Keep the existing tab and pane mount/unmount behavior untouched in this phase.
- Add a small Ghostty adapter boundary for:
  - runtime renderer access
  - input textarea access
  - focus/blur
  - canvas access for coordinate mapping
- Remove only the xterm-specific rendering assumptions that directly block Ghostty.
- Keep the transport/session model unchanged unless Ghostty exposes a concrete incompatibility.

### Must Not Change

- tab keepalive strategy
- restore architecture
- hotkey routing beyond what is needed to type
- bundled font delivery
- agent hooks

### Acceptance

- Fresh terminal opens.
- Typing works reliably.
- Scrolling and output render.
- Theme colors apply.
- App still builds and typechecks.

## Phase 2: Ghostty Correctness

### Scope

Fix the core Ghostty integration bugs that usually appear immediately after a naive renderer swap.

### Deliverables

- Correct focus handling for the real Ghostty input surface.
- Correct click-to-cursor translation using the rendered canvas, not the wrapper box.
- Clean mount/unmount behavior with no stale DOM stacking.
- PTY-first resize path.
- Reliable blur behavior for inactive terminals.

### Implementation Notes

- Focus the Ghostty textarea/input, not just the outer element.
- Clear the host container before opening Ghostty.
- Dispose synchronously on unmount.
- Use PTY-first resize everywhere.
- Use visible/active pane state to decide whether to focus or blur.

### Must Not Change

- tab persistence strategy
- restore/reconnect strategy
- fonts
- hooks

### Acceptance

- Cursor is aligned.
- No “cannot type” regression.
- No stale double-cursor or layered DOM.
- Resizing works without wrapping drift.

## Phase 3: Fonts And Theme Polish

### Scope

Make the terminal look good and deterministic across machines.

### Deliverables

- Bundled mono Nerd Font shipped with the desktop app.
- Runtime font-family resolution with clean fallback behavior.
- Font preloading before application.
- Ghostty font remeasure after font changes.
- PTY-first resize after font remeasure.
- Settings UI updated to reflect the bundled default.

### Implementation Notes

- Use a bundled font in the JetBrains Mono Nerd Font Mono class.
- Include Nerd Font glyph coverage for prompt icons.
- Keep user-configurable font overrides, but make the bundled font the default fallback.
- Make prompt glyph fallback deterministic instead of relying on host-installed symbols fonts.

### Must Not Change

- tab lifecycle
- transport/session semantics
- agent hooks

### Acceptance

- Text is crisp.
- Prompt icons render correctly.
- Font changes do not desync the cursor grid.
- Appearance is consistent on clean machines.

## Phase 4: Hotkeys And Clipboard

### Scope

Make focused-terminal behavior feel like the rest of the app.

### Deliverables

- App-level hotkeys forwarded out of terminal focus.
- Terminal-native typing and control sequences preserved.
- Clipboard copy/paste behavior correct for platform conventions.
- Pane split shortcuts working from the terminal.

### Implementation Notes

- Intercept app-level hotkey chords in the terminal key handler.
- Prevent Ghostty from consuming those app-level chords.
- Forward them into the shared app hotkey layer.
- Leave terminal-reserved chords in the terminal.
- Respect platform-specific copy/paste expectations where possible.

### Must Not Change

- tab persistence strategy
- restore strategy
- agent hooks

### Acceptance

- Split pane hotkeys work from focused terminal.
- Tab/global app shortcuts work from focused terminal.
- Clipboard behavior is not regressed.

## Phase 5: Session Safety And Real Restore

### Scope

Fix only the restore/reconnect problems that still exist after the renderer is stable.

### Deliverables

- Stable session incarnation tracking.
- Stale event dropping on the renderer side.
- Safe reconnect behavior.
- Restore timeout so UI cannot hang forever.
- Frontend reset before replaying restored content.

### Implementation Notes

- Add `sessionGeneration` or equivalent session incarnation token.
- Include it in data/exit/error frames.
- Renderer should reject stale events and stale buffered writes.
- Use restore logic only for real reconnect/cold-restore cases.
- Do not use snapshot replay as a substitute for tab persistence.

### Must Not Change

- broad tab UI architecture unless Phase 6 is also being implemented

### Acceptance

- No cross-terminal content bleed.
- No old session events affecting a new session.
- Reconnect cannot leave the UI permanently stuck.

## Phase 6: Terminal Persistence Across Tab Switches

### Scope

Only after Phases 1 through 5 are stable, remove tab-switch reattach churn.

### Recommended Strategy

**Use a terminal-only keepalive model.**

### Deliverables

- Active tab UI stays active-only.
- Terminal instances remain mounted offscreen after first mount.
- Hidden terminals move to an offscreen host.
- Visible terminals move back into the active pane host.
- Visibility changes trigger only blur or forced PTY-first resize plus refocus.

### Implementation Notes

- Do not mount every hidden full tab UI.
- Do not mount hidden browser/chat/file pane chrome just to keep terminals alive.
- Maintain a pane host registry so a persistent terminal can reattach to the active DOM host without recreating the Ghostty instance.
- Keep hidden terminals non-interactive and blurred.
- Keep the same terminal instance alive across tab switches.

### Must Not Do

- full hidden-tab rendering
- hidden browser/chat/file UI keepalive
- tab-switch detach/reattach
- tab-switch snapshot replay

### Acceptance

- Switching between tabs does not visibly rebuild the terminal.
- Busy terminals remain hot while hidden.
- Non-terminal panes do not create hidden mounted UI churn.

## Phase 7: Agent Hooks And Notifications

### Scope

Make current Claude hook behavior and notification mapping work correctly.

### Deliverables

- Current Claude `Notification` hook payloads supported.
- Permission / idle / elicitation flows mapped correctly.
- Hook payload normalization hardened.
- Server-side notification mapping aligned with current hook shapes.

### Implementation Notes

- Treat this as a separate feature track unless terminal work blocks on it.
- Avoid mixing hook work into renderer-correctness PRs.

### Acceptance

- Hooks fire for the expected agent lifecycle events.
- Permission and idle notifications are mapped correctly.

## Phase 8: Cleanup And Refactor

### Scope

Only once behavior is stable, make the code cleaner.

### Deliverables

- Rename misleading `xterm` terminology to neutral `terminal` naming.
- Split oversized helper files by concern.
- Remove remaining dead xterm-era compatibility code.
- Narrow obvious broad store subscriptions in terminal-adjacent paths.

### Implementation Notes

- This phase should not change behavior.
- If a cleanup changes behavior, it belongs in an earlier functional phase, not here.

### Acceptance

- Cleaner architecture.
- Same behavior.
- Smaller mental model.

## PR Breakdown Recommendation

Use separate PRs.

Suggested PR order:

1. Phase 1 and Phase 2 together if small enough.
2. Phase 3.
3. Phase 4.
4. Phase 5.
5. Phase 6.
6. Phase 7.
7. Phase 8.

If any phase grows too large, split it again.

## Manual Test Matrix

Run this after every phase that touches terminal behavior.

- Open a fresh terminal and type immediately.
- Split the terminal pane from keyboard and from toolbar.
- Switch tabs rapidly.
- Keep one tab running a noisy command such as `bun i`.
- Return to that tab and confirm it stayed live.
- Run a TUI and hide/show its tab.
- Verify cursor position and click-to-cursor accuracy.
- Verify prompt icons and Nerd Font glyphs.
- Verify copy/paste.
- Verify app hotkeys while terminal is focused.
- Verify reconnect/cold-restore behavior if that phase touched it.

## Automated Test Expectations

At a minimum, maintain tests for:

- font-family resolution
- hotkey forwarding
- stale session event rejection
- terminal helper behavior
- tab strip overflow logic
- any new persistence/visibility helper introduced later

## Final Decision Framework

Before starting a change, ask:

- Is this necessary for the current phase?
- Is there a smaller change that proves the same thing?
- Does this alter lifecycle, transport, renderer, and UI all at once?
- Can we validate it independently?

If the answer to the third question is yes, the scope is too large.
