# Hotkey adaptive-layout toggle — manual smoke test

Verifies the full adaptive-layout pipeline after this branch:

- **A.** Toggle gates *every* dispatch consumer (registration, resolver,
  display, recorder conflict detector, imperative `getDispatchChord`).
- **B.** Shipped defaults are authored as `mode: "logical"`, so the toggle
  actually moves them on non-US layouts (previously it was a no-op for
  defaults because they were physical strings).
- **C.** `adaptiveLayoutEnabled` defaults to **true** for new installs.
  Matches macOS / VS Code / Chrome convention: `⌘Z` fires on the key
  labeled "Z" regardless of layout.

The original PR (#4078) wired the toggle through the resolver and display
hooks but missed the registration hook and the recorder; even with that
fixed, defaults were stored as physical strings so the toggle had no
effect on shipped bindings. This branch closes both gaps.

## Setup

1. Build & launch the desktop app: `cd apps/desktop && bun dev`.
2. Open DevTools (View → Toggle Developer Tools).
3. Run `localStorage.removeItem("keyboard-preferences")` and reload —
   guarantees you start on the **new default (toggle ON)**.

You'll need a non-US layout to exercise the bug. macOS:
System Settings → Keyboard → Input Sources → add **German – Standard
(QWERTZ)**. Switch via the menu-bar flag or Ctrl+Space.

QWERTZ swap to keep in mind: physical KeyZ prints **Y**, physical KeyY
prints **Z**.

## A. Toggle ON (new default) — labels rule

> Expected: every shortcut fires on the key whose **printed label**
> matches the binding, regardless of physical position.

1. Switch input source to **German (QWERTZ)**.
2. In the app:
   - Press `⌘Z` (the key labeled "Z" — physical KeyY) → bound `UNDO`-style
     hotkey fires. Pressing the key labeled "Y" (physical KeyZ) does
     **not** fire it.
   - Press `⌘P` (Open Command Palette) — opens. The labeled-P key works.
   - Settings → Keyboard: glyphs reflect QWERTZ (the printed character on
     the current layout).
3. Open the recorder for any shortcut, press `⌘Z` (labeled-Z key). The
   captured chord shows `⌘Z`. Saving doesn't flag a phantom conflict.
4. In DevTools console, dispatch synthesized events:
   ```js
   // physical KeyY (labeled Z on QWERTZ) — should fire
   document.activeElement.dispatchEvent(
     new KeyboardEvent("keydown", { code: "KeyY", metaKey: true, bubbles: true })
   );
   // physical KeyZ (labeled Y on QWERTZ) — should NOT fire
   document.activeElement.dispatchEvent(
     new KeyboardEvent("keydown", { code: "KeyZ", metaKey: true, bubbles: true })
   );
   ```

## B. Toggle OFF — positions rule

1. Settings → Keyboard → flip **Adaptive layout mapping** off.
2. Still on QWERTZ:
   - Press the key labeled "Y" (physical KeyZ) with ⌘ → `UNDO` fires.
   - Press the key labeled "Z" (physical KeyY) with ⌘ → does NOT fire.
   - Settings → Keyboard glyphs render exactly as authored ("⌘Z" stays
     "⌘Z"; no QWERTZ remap).
3. Recorder: press the key labeled "Y" (physical KeyZ) + ⌘ → captured
   chord shows `⌘Z`, saved as physical KeyZ internally.

## C. Live toggle flip

1. Toggle OFF → confirm physical KeyZ (labeled Y) fires Undo.
2. Flip toggle ON without reloading → physical KeyZ stops firing it,
   physical KeyY (labeled Z) starts firing it.
3. Flip back OFF → original positional behavior returns. No reload needed.

The resolver index, registration (`useHotkey`), display, and recorder
all subscribe to the preferences store, so a toggle flip propagates
through every consumer immediately.

## D. Default-direction migration

For a brand-new install (no persisted `keyboard-preferences` value), the
toggle initializes to **true**. Verify:

1. `localStorage.removeItem("keyboard-preferences")` + reload.
2. Open Settings → Keyboard. The Adaptive layout mapping switch is **on**.
3. On QWERTZ, Undo fires on the labeled-Z key out of the box.

Existing users who explicitly toggled OFF before this change keep their
saved value (persist middleware writes only on explicit `set()`). Users
who never opened the keyboard settings page get the new default ON on
upgrade — this is intentional (matches OS convention) and the only
behavior change they'll notice is on non-US layouts.

## E. Terminal reservation parity

With the toggle in either state, in a v2 terminal pane:

1. Press `Ctrl+C` — sent to the PTY (interrupts the running process).
2. Press the app's bound chord (e.g. `⌘P`) — opens the palette, doesn't
   leak into the terminal buffer.
3. On QWERTZ + toggle ON: press `⌘Z` on the labeled-Z key (physical
   KeyY). Undo should fire; the keystroke should not also leak to the PTY.

## Expected file touchpoints

If any of the above fails, the bug is almost certainly in one of:

- `apps/desktop/src/renderer/hotkeys/hooks/useHotkey/useHotkey.ts`
  (registration — main consumer; gated via `useActiveLayoutMap`)
- `apps/desktop/src/renderer/hotkeys/utils/resolveHotkeyFromEvent.ts`
  (reverse index used by terminal reservation)
- `apps/desktop/src/renderer/hotkeys/hooks/useHotkeyDisplay/useHotkeyDisplay.ts`
  (display — `useHotkeyDisplay` + `useFormatBinding`)
- `apps/desktop/src/renderer/hotkeys/hooks/useBinding/useBinding.ts`
  (`getDispatchChord`)
- `apps/desktop/src/renderer/hotkeys/hooks/useRecordHotkeys/useRecordHotkeys.ts`
  (`getHotkeyConflict`)
- `apps/desktop/src/renderer/hotkeys/registry.ts` (defaults must use
  `L()` for printable chords, bare strings only for named keys)
- `apps/desktop/src/renderer/hotkeys/stores/keyboardPreferencesStore.ts`
  (default `adaptiveLayoutEnabled: true`)

All five hook/util consumers must read the layout map through the
`adaptiveLayoutEnabled` gate. If a future consumer reads
`useKeyboardLayoutStore` directly it must do the same — consider a
`useEffectiveLayoutMap()` helper as a follow-up to make this
unmissable.
