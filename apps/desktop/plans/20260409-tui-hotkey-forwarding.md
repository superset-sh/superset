# TUI hotkey forwarding (v2 terminals)

## Problem

Since enabling `vtExtensions: { kittyKeyboard: true }` on v2 terminals
(`Terminal/config.ts:36`, commit 89d79037e), app-level hotkeys like `Cmd+T`,
`Cmd+K`, `Cmd+F`, `Ctrl+1`, `Ctrl+Tab` stop working while focus is inside a
terminal running a TUI. The TUI program "swallows" them — they end up in the
PTY instead of firing the Superset action.

## Root cause

**v2 `TerminalPane.tsx` does not install a `customKeyEventHandler` on the
xterm instance.** Grep for `attachCustomKeyEventHandler` across v2 returns
only the v1 path (`Terminal/helpers.ts:684`, called from
`useTerminalLifecycle.ts:713`). The v2 runtime wires xterm through
`terminal-runtime.ts` with no keyboard gate.

Here is xterm.js's `_keyDown`
(`node_modules/@xterm/xterm/src/browser/CoreBrowserTerminal.ts:843-929`),
reduced to the parts that matter:

```ts
protected _keyDown(event: KeyboardEvent): boolean | undefined {
  if (this._customKeyEventHandler && this._customKeyEventHandler(event) === false) {
    return false; // ← bails before evaluateKeyDown, no preventDefault
  }
  // ...
  const result = this._keyboardService.evaluateKeyDown(event);
  // With vtExtensions.kittyKeyboard + PTY having enabled kitty protocol via CSI,
  // KeyboardService.evaluateKeyDown() returns a CSI u encoded sequence for
  // nearly every modifier chord (see KeyboardService.ts:42-43).
  // ...
  this.coreService.triggerDataEvent(result.key, !wasModifierOnly); // → PTY
  // ...
  if (!this.optionsService.rawOptions.screenReaderMode || event.altKey || event.ctrlKey) {
    event.preventDefault();    // ← kills bubbling to document
    event.stopPropagation();
    return false;
  }
}
```

Without a custom handler, every modifier chord follows the bottom path:
xterm encodes it via the Kitty protocol, delivers the CSI u sequence to the
PTY, then calls `preventDefault + stopPropagation`. The event never reaches
`document`, so `react-hotkeys-hook` (which powers `useHotkey`) never fires.

This matches the behavior VSCode describes verbatim in
`terminalInstance.ts:1136-1139`:

> The metaKey check is needed because when a shell like fish enables the kitty
> keyboard protocol, xterm.js encodes Meta-modified keys as CSI u sequences
> and consumes them via preventDefault. The (non-kitty) traditional xterm.js
> handler already skips Meta keys so they bubble up naturally, but the kitty
> handler does not.

Before the Kitty flag landed, xterm.js's traditional path also eats chords,
but macOS `Cmd+*` happened to fall into the "bubble up naturally" branch
(`_isThirdLevelShift` / composing checks), masking the missing gate on v2.
Turning on Kitty made the break visible everywhere.

## How VSCode handles it

Verified against
`vscode/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts:1116-1175`.
The key event handler is an **allow-list gate**:

```ts
xterm.raw.attachCustomKeyEventHandler((event) => {
  if (this._isExiting) return false;

  const resolveResult = this._keybindingService.softDispatch(event, target);

  if (this._keybindingService.inChordMode || isValidChord) {
    event.preventDefault();
    return false;
  }

  // Eat the chord iff it resolves to a registered command AND that command
  // is on the skip list (or Meta/Cmd — always belongs to app).
  if (!sendKeybindingsToShell
      && resolveResult.kind === KbFound
      && resolveResult.commandId
      && (event.metaKey || this._skipTerminalCommands.includes(resolveResult.commandId))) {
    event.preventDefault();
    return false;
  }

  // ...mnemonics, tab focus, shift+tab, alt+f4...
  return true; // default: forward to PTY (kitty encoder etc.)
});
```

Supporting pieces:

- **`softDispatch`** (`abstractKeybindingService.ts:143-160`) is read-only.
  It asks the keybinding registry "does this chord resolve to a command
  right now?" and returns `{ kind: KbFound, commandId }` without firing.
- **Returning `false`** from the handler is what makes xterm.js bail at
  line 847 — no kitty encoding, no `preventDefault`, event bubbles to
  document, the normal keybinding dispatch runs the command.
- **`DEFAULT_COMMANDS_TO_SKIP_SHELL`** (`common/terminal.ts:499-646`) is a
  hardcoded allow-list of ~150 command IDs: Command Palette, zoom, editor
  focus, tab navigation, terminal focus-next, debug start/stop, etc. User
  `commandsToSkipShell` merges on top; `-command` entries remove defaults
  (`terminalInstance.ts:1929-1934`).
- Config defaults: `sendKeybindingsToShell = false`, `allowChords = true`,
  `allowMnemonics = false`.
- `terminalAltBufferActive` is a context key refreshed on
  `xterm.raw.buffer.onBufferChange` (`terminalInstance.ts:854, 1264-1266`).
  It is **not** consulted in the custom key handler — only exposed for
  individual bindings to opt out via `when` clauses.

## Recommendation

Mirror VSCode. In concrete Superset terms:

### 1. Install a `customKeyEventHandler` on the v2 terminal

In `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` (or wherever
the v2 xterm instance is created), call `xterm.attachCustomKeyEventHandler`
with a handler whose default is `return true` and that returns `false` only
for chords Superset owns. Without this, the v1 gate can never apply to v2.

### 2. Build a `chord → HotkeyId` reverse index from `HOTKEYS_REGISTRY`

`apps/desktop/src/renderer/hotkeys/registry.ts` already owns the canonical
definitions. At registry init, flatten `HOTKEYS[id].key` into a
`Map<normalizedChord, HotkeyId>` once. Expose `resolveHotkeyFromEvent(event)`
that normalizes an event into the same chord format and returns the matching
`HotkeyId | null` — this is Superset's `softDispatch`.

### 3. Gate in the handler

```ts
const handler = (event: KeyboardEvent): boolean => {
  if (event.type !== "keydown") return true;

  // existing macOS ANSI translations (Cmd+Left → \x01, etc.) run first

  // Terminal-reserved chords must reach the PTY regardless
  if (isTerminalReservedEvent(event)) return true;

  // Always skip on Meta — matches VSCode's line 1140, and covers the kitty
  // case where Cmd+letter would otherwise get CSI-u encoded.
  if (event.metaKey) {
    const id = resolveHotkeyFromEvent(event);
    return id ? false : false; // bubble either way; Cmd almost never belongs to a TUI
  }

  // Non-Meta: only eat if it resolves to an app hotkey
  const id = resolveHotkeyFromEvent(event);
  if (id) return false;

  return true; // default → PTY (kitty encoder runs, TUI gets the key)
};
xterm.attachCustomKeyEventHandler(handler);
```

Nothing else changes — existing `useHotkey(...)` registrations keep working
because the event bubbles to document the moment the handler returns `false`.
No direct `softDispatch`-style command execution needed.

### 4. Keep the v1 handler (`Terminal/helpers.ts:530`)

The v1 handler has the same bug structurally (`line 677-679` bubbles on the
denylist), but v1 was working before Kitty because xterm's traditional path
let Meta keys bubble. Now that Kitty is on for v1 too (`config.ts:36`), v1
should migrate to the same resolver-based gate. Share the implementation.

### 5. Optional escape hatches (later)

- `sendKeybindingsToShell`-style preference: disables every non-Meta skip
  entry, for users who want everything to reach the shell.
- Use `isAlternateScreenRef` from `useTerminalModes.ts:33` (or subscribe to
  `xterm.buffer.onBufferChange` — VSCode's approach at
  `terminalInstance.ts:854`) to shrink the skip list while a TUI owns the
  alt screen, so e.g. `FIND_IN_TERMINAL` (`Cmd+F`) can still reach `nvim`.

## Minimum viable fix

1. In `terminal-runtime.ts`, wire `xterm.attachCustomKeyEventHandler((event) => {
   if (event.type !== "keydown") return true;
   if (isTerminalReservedEvent(event)) return true;
   if (event.metaKey) return false;
   if (resolveHotkeyFromEvent(event)) return false;
   return true;
   });` after the xterm instance is created.
2. Add `resolveHotkeyFromEvent` to `renderer/hotkeys` — ~30 lines to build the
   reverse index at module load and match events against it.

That restores all `Cmd+*` hotkeys in v2 terminals under Kitty, and any
`Ctrl+*`/`Alt+*` chords that resolve to a registered Superset hotkey. Steps
4-5 generalize from v2 to v1 and add escape hatches.
