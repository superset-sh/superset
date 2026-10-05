# Reclaiming leaked terminal input modes on a live kill (#4949)

## The bug

An in-terminal TUI (mastracode/pi-tui, Claude Code, …) arms input-reporting modes
on startup — the **kitty keyboard protocol**, **mouse tracking**, **focus
reporting** — and disarms them on clean exit. Killed uncleanly (`kill -9`, crash,
OOM) while its pane is attached, it never writes the restore sequences, so the
shell that reclaims the pty inherits them:

- **kitty keyboard** (the severe one): every keystroke reaches the shell CSI-u
  encoded — `Ctrl+C` → `^[[99;5u`, `whoami` → `^[[119;1:3u…` → `command not found` —
  so the pane is unusable by keyboard until `reset`.
- **mouse / focus**: pointer moves and focus changes spray escape junk into the
  prompt.

xterm arms the kitty protocol because the terminal advertises it
(`vtExtensions: { kittyKeyboard: true }`).

## Why it wasn't already handled

v2 workspace terminals stream PTY output straight to the renderer xterm; they do
**not** route through the host-side `HeadlessEmulator`, so its foreground-reclaim
never runs for them. The existing renderer disarm (`disarmStaleInputModes`) only
fires on **cold restore** and **terminal restart** — not on a TUI killed while the
pane stays attached.

## The fix

A renderer reclaimer installed on every xterm in `createTerminal`:

- `shared/leaked-input-mode-reclaim.ts` — a transport-agnostic core
  (`createLeakedInputModeReclaimer`: `noteArm` / `noteShellReady` / `collectDisarm`)
  holding only the decision logic: a **shell-owned epoch** (modes armed before the
  first prompt marker belong to shell init and are never reclaimed) and a
  **mark-then-recheck flush** (a mode re-armed before the flush keeps its state).
  Reusable by any surface that observes the stream (a host-side VT scanner later).
- `renderer/lib/terminal/terminalInputModeReclaimer.ts` — a thin xterm-parser
  adapter: handlers for kitty (`CSI >/=/< u`), mouse (`?1000/1002/1003`), focus
  (`?1004`), and the `OSC 777;superset-shell-ready` marker feed the core; the
  disarm is written back on a microtask.

**Marker choice:** reclaim keys on `OSC 777;superset-shell-ready` (emitted only by
Superset's shell wrappers), **not** the co-emitted FinalTerm `OSC 133;A` — `133;A`
is also produced by third-party shell integrations and forwarded by tmux, so
disarming on it would clear a live tmux's own modes.

**Guard:** the reclaimer only acts at a shell prompt (when no TUI owns the
foreground) and re-checks at flush, so a live/suspended/racing TUI keeps its modes.
The re-check only saves a TUI that re-arms right after the marker; one that armed
earlier and then went quiet had nothing to re-arm, which is why the screen itself is
the signal. `noteShellReady({ alternateScreen })` therefore ignores a marker that
landed on the **alternate screen**: a shell prompt never lives there, so it came from
a shell nested inside a live TUI. Honoring it disarmed opencode/agy's mouse tracking
mid-session, after which every wheel event reached them as arrow keys and cycled
their prompt history (#7681). The rule lives in the core, not the adapters, which
only report the screen they already track.

**tmux, and what this gives up:** tmux owns the alternate screen, so a prompt inside
it reports as alternate and its marker is ignored. That is the safe side of the
trade — the same reasoning as the marker choice above, where disarming on a
tmux-forwarded sequence would clear tmux's own modes. The cost is that a TUI killed
uncleanly *inside* tmux is no longer healed by reclaim; recovering it still needs
`reset`.

## Reproduction

1. Open a v2 workspace terminal; run a kitty-keyboard TUI (`mastracode`).
2. `kill -9 $(pgrep -f 'bin/mastracode')` from another shell.
3. Before the fix: `Ctrl+C` prints `^[[99;5u` and can't interrupt; typing is junk;
   only `reset` recovers. After the fix: `Ctrl+C` interrupts and typing works with
   no `reset`.

CDP-verified with trusted key events (mastracode killed while attached): `whoami`
→ `kietho`, `Ctrl+C` → `^C`, no reset; a live mastracode still receives keystrokes.

## Scope

Covers the input-mode leak (kitty / mouse / focus). A leaked **alternate screen**
from a live-killed full-screen TUI is not exited by this path (cold-restore/restart
handle alt-screen) — separate follow-up.
