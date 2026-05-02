# Keyboard Layout & Shortcut Plan

**Date:** 2026-04-27
**Branch:** `keyboard-shortcut-analysi`
**Scope:** `apps/desktop` keyboard shortcut matching, recording, display, migration, terminal forwarding, and Electron menu accelerators.
**Supersedes:** drafts of `20260427-keyboard-layout-options.md` and `20260427-keyboard-shortcut-system-audit.md`.
**Builds on:** `apps/desktop/plans/20260412-keyboard-recorder-ctrl-binding-fix.md` (April refactor — established `event.code` baseline) and `apps/desktop/plans/20260409-tui-hotkey-forwarding.md` (xterm forwarding).

## Objective

Make Superset's desktop keyboard handling correct on every keyboard layout — Dvorak, AZERTY, QWERTZ, Spanish, CJK IME — without regressing existing US-QWERTY users' muscle memory.

## TL;DR

Three phases:

1. **Phase 0 — Correctness fixes (~1 day):** AltGr guard, IME composition guard, fail-closed dead-key sanitizer, `event.key` discipline in `line-edit-translations.ts`. No new deps. **Status: shipped.**
2. **Phase 1 — Layout service via `native-keymap` (~half day):** Microsoft's `native-keymap` in the Electron main process; expose live `{ layoutId, keymap }` to the renderer via tRPC observable; layout-aware display + reliable on-the-fly switching. Matching stays on `event.code`.
3. **Phase 2 — Versioned dual-mode bindings (~1–2 weeks):** Each binding declares `matchMode: "physical" | "logical"`. Existing bindings migrate as `physical` (preserves muscle memory); new user-recorded printable bindings default to `logical`. `react-hotkeys-hook`'s `useKey: true` option does the matching — no custom matcher needed.

Phase 3 is demand-driven (menu accelerator sync, multi-stroke chords, when-clauses).

## Decision history: browser API → native-keymap

We initially planned Phase 1 with `native-keymap`, briefly switched to `navigator.keyboard.getLayoutMap()` after verifying it returned data in our packaged Electron 40 `file://` build, then switched back to `native-keymap` after empirical testing showed the browser API can't observe macOS input-source switches in real time.

What we learned, in order:

1. **Browser API returns data in Electron `file://`** (verified: 48-entry map with correct US glyphs). The codebase comment claiming otherwise was stale.
2. **Browser API only exposes the unshifted glyph per code** (`Map<code, char>`); native-keymap exposes 4 layers plus dead-key flags. For *display* we don't need the extra layers.
3. **`layoutchange` doesn't fire for macOS input-source switches.** Empirically tested: switching ABC → German via the menu-bar input picker did not trigger the listener. The browser API treats input-source changes as IME events, not layout changes.
4. **VSCode solves this with `native-keymap`** — its mac implementation hooks `kTISNotifySelectedKeyboardInputSourceChanged` (Apple distributed notification) which fires for *every* input-source change. See `~/workplace/native-keymap/src/keyboard_mac.mm:182-189` and `~/workplace/vscode/src/vs/platform/keyboardLayout/electron-main/keyboardLayoutMainService.ts:48-60`.
5. **The desktop already ships native modules** (`better-sqlite3`, `node-pty`, `@parcel/watcher`) — `electron-rebuild` infrastructure is in place; native-keymap is one more dep in an existing pipeline. Native-binding risk is essentially zero.
6. **Hand-rolled alternatives create bug surface:** focus / visibilitychange / keydown-mismatch heuristics, US-fingerprint detection that false-positives on UK, two parallel detection paths (boot probe + runtime store). Adopting native-keymap lets us **delete** these instead of accumulating workarounds.

Net of the swap: ~175 LOC + several heuristic edge cases removed; ~160 LOC + tests added; single source of truth; reliable runtime updates.

## Design principle: physical vs logical key identity

The central design question is *how a binding identifies a key*. Two valid identities:

- **Physical** (`event.code`): the hardware position. The QWERTY-`P` slot is `KeyP` on every layout.
- **Logical** (`event.key` or layout-resolved character): the character the active layout produces. On Dvorak, the physical `KeyR` slot produces `p`.

Picking only one globally creates bad behavior for some users. Today we are physical-only:

- ✅ Stable: `Cmd+Shift+P` works regardless of the user's layout.
- ❌ Unintuitive: a Dvorak user pressing the key labeled `P` on their keyboard does *not* trigger Quick Open — they must press the key labeled `L` (the QWERTY-`P` position).
- ❌ UI lies on non-US layouts: the Settings page shows "⌘P" but on QWERTZ that's the wrong glyph for the physical slot.

The fix is **per-binding match mode**, defaulting to physical for shipped defaults (preserves today's behavior for everyone) and logical for new user-recorded printable bindings (matches what users expect from their printed keys).

## Current state (brief)

Hotkeys live in `apps/desktop/src/renderer/hotkeys/`. The April 2026 refactor (PR #3391) unified the system on `event.code`:

- Registry of 50+ per-platform defaults — `registry.ts:29-571`
- Canonical normalization — `utils/resolveHotkeyFromEvent.ts:42-89`
- Customization UI with conflict detection — `routes/_authenticated/settings/keyboard/page.tsx`
- Zustand + localStorage overrides — `stores/hotkeyOverridesStore.ts`
- v1→v2 migration with sanitizer — `migrate.ts`, `utils/sanitizeOverride.ts`
- Terminal forwarding via xterm `customKeyEventHandler` — `lib/terminal/terminal-runtime.ts`
- 62 unit tests across 4 files

What's missing — addressed by this plan:

| Gap | Severity | Phase |
|---|---|---|
| `MAC_US_DEAD_KEYS` rewrites apply when layout is unknown (fails open) | medium-high | 0 |
| AltGr (`event.getModifierState("AltGraph")`) treated as Ctrl+Alt | medium | 0 |
| No IME `event.isComposing` guard | low–medium | 0 |
| `line-edit-translations.ts` uses `event.key` without a discipline note | low (latent) | 0 |
| `navigator.keyboard.getLayoutMap()` is unreliable in Electron `file://`; layout never re-detected | medium-high | 1 |
| Display uses hardcoded US glyphs regardless of layout | medium | 1 |
| Bindings can only match physical position | medium | 2 |
| Hardcoded menu accelerators in `main/lib/menu.ts:13-100` shadow user bindings | medium | 3 |
| v1 terminal handler returns `false` for all `ctrl/meta` (starves TUIs) | medium | 3 (already in `20260409-tui-hotkey-forwarding.md`) |

## Library decision: `native-keymap`

- **Microsoft, MIT, v3.3.9 (Jan 2026), actively maintained**, ~125k weekly downloads. Same library VSCode ships.
- API:
  ```ts
  import {
    getKeyMap,
    getCurrentKeyboardLayout,
    onDidChangeKeyboardLayout,
  } from "native-keymap";
  ```
- `getKeyMap()` returns `{ ScanCodeName: { value, withShift, withAltGr, withShiftAltGr, valueIsDeadKey, ... } }` for the current OS layout.
- Constraints:
  - Native node-gyp addon → must run after `electron-rebuild`. Ships prebuilt binaries for major Electron ABIs.
  - **Main-process only.** Wire to renderer via tRPC observable per `apps/desktop/AGENTS.md` (`trpc-electron` requires observables, not async generators).
  - Linux dev/CI needs `libx11-dev` + `libxkbfile-dev`.

Conceptual role: a supplementary lookup table answering *"on this user's current OS layout, what character is printed at physical position `KeyZ`?"* It does **not** replace `event.code` matching. Phase 1 uses it for display + reliable layout detection; Phase 2 uses its `value` field to resolve logical bindings.

## Considered alternatives (rejected)

- **`keyboard-layout` (Atom):** archived 2022, dead `nan` dep.
- **`mousetrap` / `hotkeys-js`:** match on deprecated `keyCode`; layout-unaware.
- **`tinykeys`:** no layout features beyond what `react-hotkeys-hook` already gives us.
- **Vendor full VSCode keybinding engine (`KeyCodeUtils`, `KeybindingResolver`):** long import tail; overkill.
- **Browser-only via `navigator.keyboard.getLayoutMap()`:** unreliable in Electron `file://`; current fallback behavior already proves the risk.
- **Vendor VSCode `keyboardLayouts/*.ts` static tables:** 70+ files, MIT, but custom layouts uncovered. Keep as future fallback if `native-keymap` ever proves insufficient.

## Cross-cutting requirements (checklist for every phase)

- **AltGr:** check `event.getModifierState("AltGraph")`; do not treat AltGr as Ctrl+Alt unless a binding explicitly opts in.
- **IME composition:** ignore matching during composition: `event.isComposing || event.keyCode === 229`.
- **Dead keys:** never rewrite a composed/dead-key glyph without layout certainty. Fail closed.
- **Numpad:** decide explicitly whether `Numpad1` and `Digit1` collapse (today: yes, via `normalizeToken` stripping `Digit`/`Numpad`). Phase 2 may differentiate for power users.
- **Special keys:** Enter, Escape, Backspace, Delete, F-keys, arrows, Home/End/PageUp/PageDown match by stable named-key (`event.code` is stable for these regardless of layout).
- **Conflict detection:** must run in the same mode used at runtime (physical-vs-physical, logical-vs-logical, mixed flagged).
- **Electron menus:** generate accelerators from effective bindings where representable; omit native accelerator otherwise rather than showing a wrong one.

---

## Phase 0 — Correctness fixes

**Goal:** close existing layout-related bugs without changing matching semantics or adding deps.
**Effort:** ~1 day.
**Owner:** anyone.

### Implementation

#### 0.1 AltGr guard in `eventToChord`

`apps/desktop/src/renderer/hotkeys/utils/resolveHotkeyFromEvent.ts:71-82`

Add an `altGr` modifier flag derived from `event.getModifierState("AltGraph")`. When true on Linux/Windows, do not also set `ctrl` and `alt` from `event.ctrlKey`/`event.altKey` — Chromium reports both for AltGr. Bindings must opt in to AltGr explicitly via an `altgr+` token (none today; reserved for Phase 2).

```ts
export function eventToChord(event: KeyboardEvent): string | null {
  if (event.code === undefined) return null;
  if (event.isComposing || event.keyCode === 229) return null; // see 0.2
  const key = normalizeToken(event.code);
  if (isIgnorableKey(key)) return null;

  const altGr = event.getModifierState?.("AltGraph") === true;
  const mods: string[] = [];
  if (event.metaKey) mods.push("meta");
  if (event.ctrlKey && !altGr) mods.push("ctrl");
  if (event.altKey && !altGr) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  if (altGr) mods.push("altgr"); // dropped on match unless binding opts in
  mods.sort();
  return [...mods, key].join("+");
}
```

`canonicalizeChord` strips unknown `altgr` tokens for backward compatibility until Phase 2 adds first-class support. Net effect today: `Ctrl+Alt+E` typed via AltGr+E on a German layout no longer matches a US `Ctrl+Alt+E` binding. (Today it matches and surprises users.)

#### 0.2 IME composition guard

Same file, top of `eventToChord` (shown above). Returns `null` during composition so `react-hotkeys-hook` doesn't fire.

#### 0.3 Fail-closed dead-key sanitizer

`apps/desktop/src/renderer/hotkeys/utils/sanitizeOverride.ts:47-80, 98-121`
`apps/desktop/src/renderer/hotkeys/utils/detectUSLayout.ts:21-43`
`apps/desktop/src/renderer/hotkeys/migrate.ts:36`

Today `isUSCompatibleLayout()` returns `true` when `navigator.keyboard.getLayoutMap()` is unavailable (common in Electron `file://`) — so the US-Mac dead-key rewrite table runs on non-US Macs.

Flip the fallback:

```ts
// detectUSLayout.ts
export async function isUSCompatibleLayout(): Promise<boolean | "unknown"> {
  const keyboard = (navigator as Navigator & { keyboard?: Keyboard }).keyboard;
  if (!keyboard?.getLayoutMap) return "unknown";
  try { /* probe ... */ } catch { return "unknown"; }
}
```

In `migrate.ts`, treat `"unknown"` as "do not apply US dead-key rewrites" — pass `assumeUSMacLayout: false`. Sanitizer drops the entry instead (existing behavior for invalid entries; user gets a console message and sees the binding empty, which is recoverable). Phase 1 deletes this file entirely.

#### 0.4 `event.key` discipline in `line-edit-translations.ts`

`apps/desktop/src/renderer/lib/terminal/line-edit-translations.ts:21-42`

Add a top-of-file comment:

```ts
// CONTRACT: only check event.key for stable named keys
// (Backspace, ArrowLeft/Right, Home, End, ...). Never event.key for printable
// characters — those vary by layout and break non-US users. Use event.code
// via resolveHotkeyFromEvent for printable keys.
```

No code change today; the comment exists to prevent regression.

### Tests

| Test | File | What it covers |
|---|---|---|
| AltGr does not double-match Ctrl+Alt bindings | `utils/resolveHotkeyFromEvent.test.ts` (new case) | Synthetic `KeyboardEvent` with `getModifierState("AltGraph") === true`, `ctrlKey: true`, `altKey: true` → chord excludes `ctrl` and `alt` |
| `event.isComposing` short-circuits matching | `utils/resolveHotkeyFromEvent.test.ts` (new case) | `eventToChord` returns `null` when `isComposing` is true |
| `event.keyCode === 229` short-circuits matching | same | covers Safari IME path |
| Sanitizer fails closed on unknown layout | `utils/overrideSanitizer.test.ts` (new case) | `assumeUSMacLayout: false` drops entries that match `MAC_US_DEAD_KEYS` keys |
| `isUSCompatibleLayout()` returns `"unknown"` when API absent | new file `utils/detectUSLayout.test.ts` | mock `navigator.keyboard = undefined` |

### Manual QA

- [ ] Linux QWERTZ: type `Ctrl+Alt+E` via AltGr+E in a textarea — does **not** trigger any app hotkey bound to `ctrl+alt+e`.
- [ ] macOS, US-EN keyboard active, Japanese input source available: switch to Japanese, type `かな` in a chat input — no hotkeys fire mid-composition.
- [ ] Fresh install on German Mac: v1→v2 migration drops legacy `meta+option+@` rather than rewriting it to a wrong physical slot. Console logs the drop count.

### Acceptance

- All Phase 0 tests pass; existing 62 tests still pass.
- Manual QA above all green.
- No new runtime deps added.

---

## Phase 1 — Layout service via `native-keymap`

**Goal:** non-US users see the printed glyph of the physical key bound; on-the-fly input-source switches reflect immediately.
**Effort:** ~half day.
**Depends on:** Phase 0.
**Outcome:** Settings page and tooltips show "⌘Y" instead of "⌘Z" on QWERTZ for the default `meta+z` (physical KeyZ) binding. Switching between ABC and German via the macOS menu-bar input picker updates the display without app reload. Matching semantics unchanged.

### Architecture (mirrors VSCode)

```
┌──────────────────────────────────────────────┐
│  Electron Main process                       │
│                                              │
│  native-keymap (npm)                         │
│   ├─ getKeyMap() → IKeyboardMapping          │
│   ├─ getCurrentKeyboardLayout() → IKeyboardLayoutInfo │
│   └─ onDidChangeKeyboardLayout(cb)           │
│       └─ macOS: kTISNotifySelectedKeyboardInputSourceChanged │
│                                              │
│  apps/desktop/src/main/lib/keyboardLayout.ts │
│   └─ EventEmitter wrapping native-keymap     │
└──────────────────┬───────────────────────────┘
                   │ tRPC observable (per AGENTS.md)
                   ▼
┌──────────────────────────────────────────────┐
│  Electron Renderer process                   │
│                                              │
│  apps/desktop/src/renderer/hotkeys/stores/   │
│    keyboardLayoutStore.ts                    │
│   └─ Zustand store, subscribed to tRPC       │
│       └─ flattens IKeyMapping → Map<code, char> │
│                                              │
│  display.ts → formatHotkeyDisplay(chord, platform, layoutMap) │
└──────────────────────────────────────────────┘
```

### Implementation

#### 1.1 Add the dependency

```bash
cd apps/desktop && bun add native-keymap
```

`electron-rebuild` is already in the pipeline (we ship `better-sqlite3`, `node-pty`, `@parcel/watcher`). Linux dev/CI: ensure `libx11-dev` + `libxkbfile-dev` are installed.

#### 1.2 Main-process wrapper

```
apps/desktop/src/main/lib/keyboardLayout.ts
```

Wraps `native-keymap`. Lazy-init on first call. Exposes `getSnapshot()` and `onChange(cb): unsubscribe` via a single EventEmitter. Mirrors VSCode's `keyboardLayoutMainService.ts`.

#### 1.3 tRPC router

```
apps/desktop/src/lib/trpc/routers/keyboardLayout.ts
```

`get` query + `changes` subscription. Subscription **must** be an `observable` (`apps/desktop/AGENTS.md` — `trpc-electron` rejects async generators). Mount under root router in `routers/index.ts`.

#### 1.4 Renderer store

```
apps/desktop/src/renderer/hotkeys/stores/keyboardLayoutStore.ts
```

Replace the `navigator.keyboard.getLayoutMap` probe + `layoutchange` listener with a tRPC subscription. Flatten `IKeyMapping` (4 fields per code) to `Map<code, value>` so consumers (display.ts) don't change. No focus / visibilitychange listeners. No debug shims.

#### 1.5 Deletions (sweep)

- `apps/desktop/src/renderer/hotkeys/utils/detectUSLayout.ts` — superseded by `keyboardLayoutStore.layoutId`. The 6-key fingerprint heuristic also false-positives on UK; the layout id is authoritative.
- `apps/desktop/src/renderer/hotkeys/utils/detectUSLayout.test.ts` — goes with it.
- `migrate.ts` — read layout id from store instead of probing.
- The window debug shims (`__hotkeyLayoutMap`, `__refreshHotkeyLayout`).

#### 1.6 No change

- `display.ts` — already accepts `layoutMap: ReadonlyMap<string, string> | null` (Phase 1 first attempt). The IPC just feeds the same shape.
- `useHotkey` / `useHotkeyDisplay` — unchanged.
- `formatHotkeyDisplay` consumers — unchanged.

### Tests

| Test | File | Covers |
|---|---|---|
| `glyphForCode("z", null)` → `null` | `display.test.ts` (extended) | falls back to KEY_DISPLAY when API unavailable |
| `glyphForCode("z", usMap)` → `"Z"` | same | US baseline |
| `glyphForCode("z", qwertzMap)` → `"Y"` | same | QWERTZ — physical Z slot prints Y |
| `glyphForCode("slash", azertyMap)` → glyph from map | same | non-letter punctuation |
| `glyphForCode("arrowup", anyMap)` → `null` | same | special keys bypass keymap |
| `formatHotkeyDisplay("meta+z", "mac", qwertzMap)` → `"⌘Y"` | same | end-to-end display swap |
| `formatHotkeyDisplay("meta+z", "mac", null)` matches today's output | same | regression guard |

### Manual QA

| Layout | Action | Expected |
|---|---|---|
| US QWERTY | Open Settings → Keyboard | Glyphs identical to today |
| German QWERTZ (or any non-US, e.g. UK) | Open Settings → Keyboard | Default `meta+z`-style binding shows the printed key glyph for the user's physical KeyZ slot |
| Switch layout mid-session | Watch Settings page | Display refreshes within ~1 second (native-keymap `onDidChangeKeyboardLayout`, hooked to the OS distributed notification) |

### Acceptance

- All tests pass.
- Manual QA on US (regression) + at least one non-US layout (verifies the swap).
- One new native dep (`native-keymap`); `electron-rebuild` already runs for `better-sqlite3` / `node-pty` so no new build-pipeline work.

---

## Phase 2 — Versioned dual-mode bindings

**Goal:** allow each binding to declare physical vs logical match. Existing bindings stay physical; new printable user bindings default to logical.
**Effort:** ~1–2 weeks.
**Depends on:** Phase 1 (layout service).
**Outcome:** Dvorak / AZERTY / QWERTZ users get shortcuts that follow their printed keys.

### Binding shape

```ts
// apps/desktop/src/renderer/hotkeys/types.ts
export type ShortcutBinding =
  | string // legacy v1; treated as { version: 1, matchMode: "physical", chord: string }
  | {
      version: 2;
      matchMode: "physical" | "logical" | "named";
      modifiers: {
        meta?: boolean;
        ctrl?: boolean;
        alt?: boolean;
        altGr?: boolean;
        shift?: boolean;
      };
      // exactly one of:
      code?: string;       // matchMode: "physical" — e.g. "KeyP"
      key?: string;        // matchMode: "logical"  — e.g. "p"
      named?: NamedKey;    // matchMode: "named"    — e.g. "Enter", "ArrowUp", "F5"
      // for display only; recorder fills these in:
      recordedAt?: { layoutId: string; glyph: string };
    };
```

`named` covers Enter, Escape, Backspace, Delete, arrows, F-keys, Home/End/PageUp/PageDown — keys whose `event.code` *is* the right identity regardless of layout.

### Match algorithm

```ts
function matches(event: KeyboardEvent, b: ShortcutBinding, keymap: Keymap): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  if (typeof b === "string") return matchesPhysical(event, parseLegacy(b));
  if (!modifiersMatch(event, b.modifiers)) return false;
  switch (b.matchMode) {
    case "physical": return event.code === b.code;
    case "named":    return event.code === b.named;
    case "logical": {
      // Prefer event.key when it's a single printable char; fall back to keymap lookup.
      const produced = isSinglePrintable(event.key)
        ? event.key.toLowerCase()
        : keymap[event.code]?.value?.toLowerCase();
      return produced === b.key?.toLowerCase();
    }
  }
}
```

### Migration

- v1 string bindings → `{ version: 2, matchMode: "physical", code: <upgrade(token)>, modifiers: ... }`. Codified in `migrate.ts`. Default registry follows the same shape.
- All shipped defaults stay `matchMode: "physical"` — preserves muscle memory for everyone on day 1.
- Recorder writes `matchMode: "named"` for Enter/Escape/etc., `matchMode: "logical"` for printable-with-modifier (the common case for new bindings), `matchMode: "physical"` if the user toggles the advanced "by physical position" option.

### Recorder & UI

- `useRecordHotkeys` captures `{ code, key, modifiers, layoutId }` simultaneously.
- Settings → Keyboard adds an "advanced" disclosure on the recording row showing the captured `code`, `key`, and a toggle. Default is logical for printable, physical only when toggled.
- Conflict detection runs per match-mode pair:
  - physical vs physical → string compare
  - logical vs logical → string compare
  - physical vs logical → resolve via current keymap; if they collide on this layout, warn but allow
- Display:
  - logical / named → show the bound character / named key directly
  - physical → show `glyphForCode(code, ..., keymap)` with a small "physical" badge

### Tests

#### Unit

| Test | File | Covers |
|---|---|---|
| `matches` returns true for physical binding hitting same code on any layout | `utils/match.test.ts` (new) | regression of today's behavior |
| `matches` for logical binding on Dvorak: typing the key labeled `p` (physical KeyR) triggers `{ key: "p" }` | same | the new capability |
| `matches` for named binding: ArrowUp triggers regardless of any layout-shifted glyph | same | named is layout-immune |
| Conflict detector: physical `meta+p` and logical `meta+p` collide on US, not on Dvorak | `utils/conflicts.test.ts` (new) | per-mode honesty |
| Migration: legacy string `"meta+p"` becomes `{ matchMode: "physical", code: "KeyP" }` | `migrate.test.ts` (extended) | preserves muscle memory |
| Recorder default for `Cmd+Shift+P` → `matchMode: "logical"`, `key: "p"` | `useRecordHotkeys.test.ts` (extended) | new bindings follow printed keys |
| Recorder for `Cmd+ArrowUp` → `matchMode: "named"`, `named: "ArrowUp"` | same | named keys recognized |
| AltGr binding: `altGr+e` on a layout where AltGr+E is `€` matches that key | `utils/match.test.ts` | AltGr first-class |
| Logical binding with shift fallback via keymap when `event.key` is a dead-key replacement | same | fallback path |

#### Integration

| Test | Covers |
|---|---|
| Headless Electron: load app on simulated German layout, register a logical `meta+z` binding, dispatch synthetic event with `code: "KeyZ", key: "y"` → does not fire | logical mode honors layout |
| Same setup, dispatch `code: "KeyY", key: "z"` → fires | logical match |
| US layout: same logical `meta+z` fires for `code: "KeyZ", key: "z"` | US baseline |
| Storage roundtrip: save v2 binding → reload app → matches & displays correctly | persistence |

#### Manual QA matrix (Phase 2)

For each of {US QWERTY, Dvorak, German QWERTZ, French AZERTY, Spanish, Japanese with US fallback}:

| Action | Expected |
|---|---|
| Default `Cmd+Shift+P` (Quick Open) — physical | Same physical key as today |
| Record new logical binding `Cmd+J` for some action | Pressing the key labeled `J` on the user's keyboard fires; UI shows "⌘J" |
| Record physical binding via advanced toggle on same chord | Pressing the QWERTY-`J` slot fires; UI shows the layout's glyph for that slot with "physical" badge |
| Conflict warning when both above coexist on the same layout | Visible warning; both still saved |
| Default `Cmd+ArrowUp` — named | Always fires regardless of layout |
| Type a sentence with the bound character in a text field | Hotkey does **not** fire (input focus + IME guard work) |
| Switch system layout mid-session | Display refreshes; physical bindings unchanged; logical bindings now match the new printed keys |

### Acceptance

- All v1 bindings continue to work for existing users (regression suite of the 62 April tests passes unchanged).
- Phase 2 tests pass.
- Manual QA matrix complete on at least US, German, AZERTY, and Dvorak.
- No localStorage corruption — old format reads cleanly, new format roundtrips.

---

## Phase 3 — Menu sync & advanced (demand-driven)

Each item is independently scoped; pick up only when warranted.

| Item | Why |
|---|---|
| Generate `main/lib/menu.ts` accelerators from effective bindings | Today `Reload`, `Show Hotkeys`, `Open Settings`, `Quit` are hardcoded and silently shadow user rebinds |
| Migrate v1 terminal `Terminal/helpers.ts:677-679` to `resolveHotkeyFromEvent` | Already in `20260409-tui-hotkey-forwarding.md`; lets v1 TUIs receive unbound `Ctrl+R` etc. |
| Multi-stroke chords (`Ctrl+K Ctrl+S`) | Ship if a feature actually needs the keyspace |
| When-clauses / context system | Ship if global conflicts get hard to reason about |
| Vendor selected VSCode `keyboardLayouts/*.ts` files | Only if `native-keymap` proves insufficient on a real user's machine |

## Out of scope

- VSCode-style `KeybindingResolver` / context engine.
- Global system shortcuts via `globalShortcut` (we have no use case).
- Configurable shortcut scopes per pane / per mode (works today via per-component `useHotkey`).
- Per-extension keybinding contributions (no extension surface).

## References

- April 2026 baseline: `apps/desktop/plans/20260412-keyboard-recorder-ctrl-binding-fix.md`
- TUI forwarding: `apps/desktop/plans/20260409-tui-hotkey-forwarding.md`
- `native-keymap` on npm: https://www.npmjs.com/package/native-keymap
- `native-keymap` source: https://github.com/microsoft/node-native-keymap
- VSCode `KeyboardLayoutMainService` (architecture reference, not vendored): https://github.com/microsoft/vscode/blob/main/src/vs/platform/keyboardLayout/electron-main/keyboardLayoutMainService.ts
- VSCode `keyboardLayouts/` data files (vendor candidate, MIT): https://github.com/microsoft/vscode/tree/main/src/vs/workbench/services/keybinding/browser/keyboardLayouts
- MDN `KeyboardEvent.code`: https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
- MDN `KeyboardEvent.getModifierState`: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState
