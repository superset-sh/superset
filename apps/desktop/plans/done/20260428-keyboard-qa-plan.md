# Keyboard Shortcut System — Manual QA Plan

**Date:** 2026-04-28
**Branch:** `keyboard-shortcut-analysi`
**Covers:** Phases 0–2 of `apps/desktop/plans/20260427-keyboard-layout-plan.md` (commits `eaf066364` → `5749f28b3`).

This plan validates user-facing behavior. **Dev server is fine** — the renderer code paths exercised here behave identically to a packaged build. (We empirically verified `navigator.keyboard.getLayoutMap()` works in `file://` Electron 40, and `native-keymap` is loaded the same way in both modes once `bun run install:deps` has run.) A packaged build is only needed for final pre-release sign-off / bundle-size checks.

---

## Setup

### Required
- macOS with US (ABC) input source active
- A second input source: **German** (preferred, exercises Y/Z swap + ü/ö/ä) or **French (AZERTY)** (exercises punctuation more)
- App running (`bun dev` or packaged build — either works)

### Optional but valuable
- Linux or Windows machine with a non-US layout for AltGr testing
- Japanese / Korean input source for IME testing
- Dvorak layout for the most dramatic logical-binding test

### Quick switching
On macOS, add input sources via *System Settings → Keyboard → Input Sources*. Toggle via the menu-bar input picker (or `⌃Space` / `⌃⌥Space` if assigned).

---

## 1. Smoke regression (US baseline)

**Must pass before anything else.** If any of these fail, stop and revert.

- [ ] App launches; no console errors related to `native-keymap`, `keyboardLayout`, or hotkeys.
- [ ] `Cmd+Shift+P` opens Quick Open.
- [ ] `Cmd+T` opens a new terminal tab.
- [ ] `Cmd+,` opens Settings.
- [ ] Settings → Keyboard renders all categories. Glyphs match what they did before this work (e.g. `⌘[`, `⌘]`, `⌘,`, `⌘P`).
- [ ] Click any hotkey row → recording → press a new combo → save. Reload app — binding persists.
- [ ] `Reset all` clears overrides and restores defaults.

---

## 2. Layout-aware display (Phase 1)

Verifies `native-keymap` is feeding live data and the display refreshes on the fly.

### 2.1 Display swap on input-source change

- [ ] US active. Settings → Keyboard. Note the glyph for **Navigate Back** (should be `⌘[`) and **Navigate Forward** (should be `⌘]`).
- [ ] Switch to **German** via menu-bar picker. **Without reloading or reopening Settings:**
  - [ ] **Navigate Back** display updates to `⌘Ü`
  - [ ] **Navigate Forward** display updates to `⌘+`
  - [ ] Update happens within ~1 second
- [ ] Switch back to US. Glyphs revert to `⌘[` and `⌘]`.

### 2.2 Layout-stable keys don't change

- [ ] Arrow-key bindings (e.g. any `⌘↑`-style binding) display the same on every layout — they're named keys, immune to layout.
- [ ] **Open Settings** (`⌘,`) still dispatches correctly on every layout (the comma key is at the same physical position on US/UK/German). On AZERTY the comma is at a different physical position and the displayed glyph may change accordingly — verify it dispatches when pressing the actual comma key, regardless of label.

### 2.3 Live-data sanity (DevTools, optional)

In renderer DevTools console:
```js
JSON.stringify([
  ["KeyA", await navigator.keyboard.getLayoutMap().then(m => m.get("KeyA"))],
  ["KeyZ", await navigator.keyboard.getLayoutMap().then(m => m.get("KeyZ"))],
])
```
On German: `KeyZ` should be `"y"`. On US: `"z"`. (We use `native-keymap` internally, not this API, but it's a quick sanity check that the OS *is* reporting different layouts.)

---

## 3. Logical bindings (Phase 2 — the feature)

Verifies that bindings can be recorded by **printed character** and follow that character across layouts.

### 3.1 Record a logical binding

- [ ] US active. Settings → Keyboard. Pick any printable shortcut (e.g. one of the workspace bindings).
- [ ] Click its current binding to start recording.
- [ ] Press `Cmd+Shift+J` (or any unused chord). Save.
- [ ] Settings shows the new binding as `⌘⇧J`.
- [ ] Reload the app — binding persists, fires correctly when pressed.
- [ ] Inspect `localStorage.getItem("hotkey-overrides")` — the override is a v2 object: `{ version: 2, mode: "logical", chord: "meta+shift+j" }`.

### 3.2 The cross-layout payoff

This is what Phase 2 was built for. Demonstrates that a binding follows the *printed character*, not the *physical position*.

- [ ] Switch to **German**.
- [ ] In Settings → Keyboard, find the binding you recorded above (`⌘⇧J`). It still displays as `⌘⇧J`.
- [ ] Press the **key labeled `J`** on your German layout. The binding fires.
  - On a German keyboard, the J key is at the same physical position as US, so this is unremarkable. The interesting test:
- [ ] Re-record any letter binding by pressing **the key labeled Z** on German (which is physical KeyY). E.g. record as `⌘Z`.
- [ ] Settings shows `⌘Z`.
- [ ] Switch back to **US**. The binding still displays as `⌘Z`.
- [ ] Press US's `Z` (physical KeyZ). The binding fires.
- [ ] **Before Phase 2, this was impossible** — the binding would have been bound to physical KeyY on German, so on US it would fire when pressing Y, not Z.

### 3.3 Default registry bindings stay physical

The shipped defaults preserve today's behavior — only *new user recordings* default to logical.

- [ ] On US, Settings → Keyboard. The default `Cmd+P` (Quick Open) display is `⌘P`.
- [ ] Switch to **German**. Display becomes `⌘P` still — same physical key (P is at the same position on German anyway).
- [ ] But for a default that uses a key whose position differs (none today, since registry doesn't bind Y or Z): the display would update via the layout map. This is layout-aware *display*, not mode-switching.

### 3.4 Named keys are layout-immune

- [ ] Re-record a binding to use `Cmd+ArrowUp`. Save.
- [ ] Switch to German. Display unchanged: `⌘↑`.
- [ ] Press `Cmd+ArrowUp`. Fires.
- [ ] Same test for an F-key binding.

### 3.5 Conflict detection across modes

- [ ] On US, record any binding as `Cmd+Shift+K`.
- [ ] Try to record a *different* hotkey to the same `Cmd+Shift+K`. Conflict dialog should appear.
- [ ] "Reassign" should move the binding to the new hotkey, clear the old.

---

## 4. Edge cases & defensive guards (Phase 0)

### 4.1 IME composition guard

Mac with Japanese (Hiragana) input source.

- [ ] Switch to Japanese. Type into any text field (chat input, settings search). Composition underline appears.
- [ ] Press Enter — composition commits as Japanese characters. ✓ correct macOS behavior.
- [ ] Press `Cmd+P` mid-composition — Quick Open opens. ✓ correct macOS behavior (Cmd bypasses IME).
- [ ] No console errors during any of this.

The guard prevents bare-key (no-modifier) hotkeys from firing during composition. We don't have any bare-key bindings, so this is mostly preventive — main thing is no regressions.

### 4.2 AltGr guard (Linux/Windows w/ German, optional)

On a Linux or Windows machine with German layout:

- [ ] Press `AltGr+E` in a text field. `€` is typed. No app hotkey fires.
- [ ] Confirms `ctrl+alt+e` bindings (if any) don't fire on AltGr-typed printables.

Skip if you don't have a Linux/Windows test machine.

### 4.3 Migration is fail-closed (Mac with v1 overrides, optional)

If you have a Mac with the old v1 hotkey storage (pre-April migration):

- [ ] On a non-US Mac (e.g. German active), launch the app.
- [ ] Watch console for `[hotkeys] Migrated N override(s), dropped K invalid`.
- [ ] Specifically, v1 entries that look like Mac-Option dead-key glyphs (e.g. `meta+alt+å`) should be **dropped**, not silently rewritten to wrong physical keys.

Skip if you're already on v2 (most likely).

### 4.4 Terminal forwarding still works

- [ ] Open a terminal pane. Run `nvim` or `htop` or any TUI.
- [ ] `Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+S`, `Ctrl+Q`, `Ctrl+\` all reach the TUI/PTY (terminal-reserved).
- [ ] `Cmd+T`, `Cmd+Shift+P` etc. still trigger app hotkeys even with terminal focused.
- [ ] Rebind a hotkey to `Ctrl+R`, then in a terminal press `Ctrl+R` — should trigger the app hotkey, not reach the shell. (Phase 2 dispatch into the terminal-forwarding reverse index.)

### 4.5 Shifted glyphs

- [ ] Record a binding to `Cmd+Shift+/` (US: `?`). Display: `⌘⇧/` (we use unshifted-glyph + ⇧ symbol convention, not `⌘⇧?`).

---

## 5. Storage shape (sanity check)

Open DevTools, paste:
```js
JSON.parse(localStorage.getItem("hotkey-overrides") || "{}")
```

- [ ] Existing physical / shipped-default overrides remain bare strings: `"meta+shift+j"`.
- [ ] New logical overrides are v2 objects: `{ version: 2, mode: "logical", chord: "meta+shift+j" }`.
- [ ] Explicitly unassigned hotkeys are `null`.
- [ ] No `undefined` values, no malformed entries.

---

## 6. Performance / no-regression

- [ ] App launch time feels normal (no perceptible delay added by `native-keymap` lazy-init or layout subscription).
- [ ] Settings → Keyboard scrolls smoothly with all bindings rendered.
- [ ] Switching input sources doesn't cause UI lag or stutter.
- [ ] Heavy typing in the chat / editor doesn't show input lag (the keydown listener at document level for hotkey dispatch is cheap, but worth checking).

---

## What to do if something fails

| Symptom | Likely cause | Where to look |
|---|---|---|
| Display doesn't swap on layout change | `native-keymap` IPC not flowing | Main process logs; `apps/desktop/src/main/lib/keyboardLayout.ts` |
| Logical binding fires for wrong key | `translateLogicalChord` misbehaving | `apps/desktop/src/renderer/hotkeys/utils/binding.ts` |
| Default hotkey stops firing | Registry / migration regression | `apps/desktop/src/renderer/hotkeys/registry.ts`, `migrate.ts` |
| Storage corruption | `setOverride` / `serializeBinding` writing wrong shape | `stores/hotkeyOverridesStore.ts`, `utils/binding.ts` |
| Terminal swallows app hotkey | Reverse index not subscribing to layout changes | `utils/resolveHotkeyFromEvent.ts` |
| Console error mentioning `keymapping.node` | `electron-rebuild` didn't run for native-keymap | `bun run install:deps` in `apps/desktop` |

---

## Sign-off criteria

- [ ] Section 1 (smoke) all green.
- [ ] Section 2 (display) all green on at least US + one non-US layout.
- [ ] Section 3 (logical bindings) — at least 3.1 + 3.2 green; 3.3–3.5 if time.
- [ ] Section 4 (edge cases) — 4.1 + 4.4 green; 4.2/4.3 if you have the environment.
- [ ] Section 5 (storage) green.
- [ ] No console errors throughout.

If all of the above pass, the keyboard system is ready to ship.
