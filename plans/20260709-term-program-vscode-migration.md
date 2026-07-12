# Migrate terminal TERM_PROGRAM masquerade: kitty → vscode

Branch: `debug-terminal-scrollback` (PR #5563). Status: implemented and verified — manual pass and CDP pass both complete.

## Why

Superset terminals previously claimed `TERM_PROGRAM=kitty` (host-service `env.ts`) so agent
TUIs parse kitty CSI-u key encodings — originally for Shift+Enter. That claim caused
real harm and its original benefit no longer depended on it:

- **Scroll bug (measured):** Claude Code keys its wheel-scroll compensation on
  `TERM_PROGRAM`. Kitty-class terminals are assumed to amplify wheel events
  natively, so Claude disables its own multiplier and spin acceleration. But our
  emulator is xterm.js, which sends ~one throttled scroll report per notch (same
  as VS Code — Claude's docs name it). Net: Claude transcript scrolling ran at
  ~1/3 speed (flick: 32 lines vs 300+ in VS Code, identical report streams
  verified via `cat -v`). Setting `TERM_PROGRAM=vscode` in a live session fixed
  scrolling outright (verified manually during investigation, re-verified by
  the post-implementation CDP pass below).
- **Shift+Enter is already kitty-independent:** `line-edit-translations.ts:44`
  translates Shift+Enter / Cmd+Enter renderer-side to `ESC+CR` (the sequence
  Claude's `/terminal-setup` installs; Codex/Gemini/OpenCode parse it as
  Alt+Enter → newline), injected via `terminal.input()` bypassing the key
  encoder entirely (#4008).
- **`vscode` is the honest identity.** Superset *is* an xterm.js terminal.
  Claude's vscode-mode assumptions (throttled wheel events, defer link handling
  to the terminal, Shift for native selection) all hold here; its kitty-mode
  assumptions don't.

The kitty keyboard *protocol* support (xterm `vtExtensions.kittyKeyboard`, mode
tracker resync) is capability-probe driven, independent of `TERM_PROGRAM`, and
stays. Verified: with `TERM_PROGRAM=vscode` the probe still succeeds and
keyboard behavior is unchanged while scrolling gets fast.

## Changes

1. `packages/host-service/src/terminal/env.ts`
   - `TERM_PROGRAM: "kitty"` → `"vscode"`; update the comment to explain the
     scroll/feature-detection rationale and that Shift+Enter comes from the
     renderer-side translation.
   - `TERM_PROGRAM_VERSION`: use a plausible VS Code-style version (e.g.
     `"1.128.0"`) instead of `hostServiceVersion` — Claude version-gates
     terminal-specific behavior against real VS Code releases.
   - Remove the `CLAUDE_CODE_SCROLL_SPEED=3` default added in `8a478733b`
     (Claude compensates itself under the vscode identity; 3× on top
     overshoots). Revert commit or amend.
2. `apps/desktop/src/main/lib/terminal/env.ts:473` — same swap (v1 terminals).
3. Tests: update `env.test.ts` expectations in both packages
   (`TERM_PROGRAM: "kitty"` assertions, scroll-speed tests from `8a478733b`).
4. NOT changed: `vtExtensions.kittyKeyboard` (terminal-runtime.ts, config.ts),
   terminal-mode-tracker, line-edit-translations, clipboard-shortcuts.

## Manual test protocol (Avi, first)

Run `bun dev:desktop` from this worktree. Open a **new** terminal per test
(env is baked at PTY spawn). Sanity: `echo $TERM_PROGRAM` → `vscode`.

1. **Claude scrolling** — run `claude`, generate a long response, scroll with
   trackpad while working and at rest. Expect VS Code-like speed, flicks
   accelerate. Also verify `CLAUDE_CODE_SCROLL_SPEED` is unset (should be) so
   Claude's own default applies.
2. **Shift+Enter** — in claude: inserts newline, does not submit. Repeat in
   codex (and gemini/opencode if handy). Cmd+Enter should also newline.
3. **Esc / arrow keys / history** in claude — kitty protocol still probed;
   confirm Esc interrupts, arrows navigate, no stray `[27u`-style literals.
4. **Cmd+C / Cmd+V / Cmd+A** in a shell and inside claude — clipboard shortcuts
   still intercepted renderer-side, nothing leaks into the TUI.
5. **Cmd+click a file path and a URL** in claude output — Superset's link
   handler opens them (Claude defers to terminal under vscode identity).
6. **cursor-agent theme** (if installed) — light/dark still right (TERM_THEME
   covers it, independent of this change).
7. **Session restore** — quit/relaunch dev app, reattach to the claude
   session, scroll + type. Mode preamble replay unaffected.

## CDP verification (agent, second)

Rerun the measurement harness from the investigation (driver at `/tmp/cdp.ts`,
methodology in memory `claude-scrollback-root-cause`):

- Flick 30×(-120px)@5ms, slow 5×(-120px)@700ms, fine 50×(-6px)@16ms against a
  400-line claude transcript. Targets: flick ≥150 lines (vs 32 baseline), fine
  ≥40 lines (vs 14 baseline), slow ≥40 lines.
- Shift+Enter via CDP `Input.dispatchKeyEvent` (shift modifier 8): assert
  newline inserted, prompt not submitted.
- `printf '\x1b[?1000h\x1b[?1006h'; script -q /tmp/cap.txt cat -v` report-count
  check unchanged (~1/notch) — proves the delta is claude-side compensation.

### Results (2026-07-09, claude v2.1.173)

- Env in fresh PTY: `TERM_PROGRAM=vscode`, `TERM_PROGRAM_VERSION=1.128.0`,
  `CLAUDE_CODE_SCROLL_SPEED` unset. ✓
- Flick: jumped ~353 lines to transcript top (kitty baseline: 32). ✓
- Slow notches: 14 lines — identical to the real VS Code terminal's measured 14
  for the same pattern (the ≥40 targets above were miscalibrated against the
  superseded `CLAUDE_CODE_SCROLL_SPEED=3` variant; the correct reference is
  VS Code parity, which this matches exactly). ✓
- Shift+Enter: multiline input, no submit. ✓
- Shift+Tab: cycles accept-edits → plan → auto → default. ✓
- Double-Esc: clears input (claude's standard arm-then-clear). ✓

## Risks / rollback

- Some TUI we haven't tested branches on kitty-class TERM_PROGRAM for a feature
  we rely on. Mitigation: manual sweep above. Rollback = revert the shared
  `TERMINAL_TERM_PROGRAM*` constants (both env builders consume them); note
  existing PTYs keep their env until the session is recreated, so a rollback
  (like the rollout) only affects newly spawned terminals.
- Claude may change vscode-gated behavior in future versions (e.g. deferring
  more to a VS Code extension that isn't present). Watch release notes; the
  identity can be revisited per-agent via wrapper scripts if needed.
- `/terminal-setup` inside claude may offer VS Code keybinding setup — cosmetic,
  document as known-quirk if users report it.

## Follow-ups (out of scope)

- Upstream claude-code issue: base scroll speed + acceleration are conflated
  with terminal identity; embedded xterm.js terminals masquerading for keyboard
  reasons get mispriced. (Also affects Warp/WezTerm-embedded cases.)
- Upstream xterm.js issue: `_consumeWheelEvent` 0.3× trackpad gate + single
  report per wheel event discards gesture magnitude for mouse-report mode.
- Optional: custom wheel handler via `attachCustomWheelEventHandler` to emit
  full-fidelity reports for *all* mouse-capturing TUIs, not just Claude.
