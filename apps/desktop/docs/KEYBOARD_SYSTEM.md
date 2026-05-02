# Keyboard Shortcut System

Layout-aware hotkey dispatch + display for the desktop renderer.

## What it does

- 50+ shipped default shortcuts (`apps/desktop/src/renderer/hotkeys/registry.ts`).
- User-customizable via Settings → Keyboard, persisted in `localStorage`.
- Each binding can match by **physical key position** (`event.code`) or **printed character** (`event.key`) so users on Dvorak / AZERTY / QWERTZ get shortcuts that follow the labels on their keyboard.
- Display refreshes on the fly when the user switches input source (macOS menu-bar picker, Cmd+Space).
- Terminal forwarding: app hotkeys bubble through xterm; `Ctrl+C/D/Z/S/Q/\` are reserved for the PTY.

## Public API

Everything consumers need is re-exported from `renderer/hotkeys`:

```ts
import {
  // dispatch
  useHotkey,                  // register a callback for a HotkeyId
  // read
  useBinding, getBinding,     // current binding (string | v2 object)
  getDispatchChord,           // imperative event.code-form chord (use for synthesizing KeyboardEvents)
  // display
  useHotkeyDisplay,           // formatted "⌘⇧P" for a HotkeyId
  useFormatBinding,           // formatted display for a binding shape (e.g. recording UI)
  HotkeyLabel,                // <Kbd>-rendering component
  // recorder
  useRecordHotkeys,           // capture flow for the Settings page
  // registry
  HOTKEYS, HotkeyId, PLATFORM,
} from "renderer/hotkeys";
```

Stay out of `stores/keyboardLayoutStore` and `utils/binding.ts` internals unless you're extending the system.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Electron Main process                                  │
│                                                         │
│  native-keymap (npm, Microsoft)                         │
│   ├─ getKeyMap() → IKeyboardMapping                     │
│   ├─ getCurrentKeyboardLayout() → IKeyboardLayoutInfo   │
│   └─ onDidChangeKeyboardLayout(cb)                      │
│       └─ macOS: kTISNotifySelectedKeyboardInputSourceChanged │
│                                                         │
│  apps/desktop/src/main/lib/keyboardLayout.ts            │
│   └─ EventEmitter wrapping native-keymap, lazy-init     │
│                                                         │
│  apps/desktop/src/lib/trpc/routers/keyboardLayout.ts    │
│   └─ get query + changes observable                     │
└──────────────────┬──────────────────────────────────────┘
                   │ tRPC subscription (observable per AGENTS.md)
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Electron Renderer                                      │
│                                                         │
│  hotkeys/stores/keyboardLayoutStore.ts                  │
│   └─ Zustand store: { map, layoutId }                   │
│       Self-restarting on subscription error             │
│                                                         │
│  hotkeys/utils/binding.ts → bindingToDispatchChord()    │
│   └─ Single source of truth for translating logical     │
│      bindings to event.code form. Used by:              │
│      - useHotkey (react-hotkeys-hook registration)      │
│      - useHotkeyDisplay / useFormatBinding (rendering)  │
│      - useRecordHotkeys (cross-mode conflict detection) │
│      - resolveHotkeyFromEvent (terminal forwarding)     │
│                                                         │
│  hotkeys/display.ts → formatHotkeyDisplay()             │
│   └─ Looks up event.code in layoutMap for printable     │
│      keys; falls back to KEY_DISPLAY (US-ANSI) for      │
│      special keys and when map is null                  │
└─────────────────────────────────────────────────────────┘
```

## Binding model

Each binding is a `ShortcutBinding`:

```ts
type ShortcutBinding =
  | string                                   // legacy / shipped default — implicitly physical
  | { version: 2; mode: BindingMode; chord: string };

type BindingMode = "physical" | "logical" | "named";
```

| Mode | Match against | Stored chord | Use |
|---|---|---|---|
| `physical` | `event.code` | scan-code-canonical (`"meta+p"` = physical KeyP) | Shipped registry defaults; preserves QWERTY muscle memory |
| `logical` | the produced character | the literal character (`"meta+p"` = the key labeled P) | Default for new user-recorded printable bindings; follows the printed letter across layouts |
| `named` | `event.code` (stable for named keys) | `"meta+enter"`, `"meta+arrowup"`, `"f5"` | Auto-applied to Enter/arrows/F-keys regardless of mode preference |

**Storage compactness**: physical-mode bindings serialize to bare strings (matches legacy shape, keeps the registry terse). Logical and named modes serialize to the v2 object form.

## Layout-aware translation

The single function that bridges modes is `bindingToDispatchChord(binding, layoutMap)`. For every consumer that needs the chord react-hotkeys-hook actually matches against, route through this function:

```
binding.mode === "physical"  → return chord unchanged
binding.mode === "named"     → return chord unchanged (event.code is stable)
binding.mode === "logical"   → translateLogicalChord(chord, layoutMap)
                                  → find scan code whose unshifted glyph
                                    matches the chord's letter,
                                    return chord with key replaced.
                                    Falls back to literal chord (US-correct)
                                    when layoutMap is null.
```

Example: a logical `meta+z` binding on German QWERTZ resolves to `meta+y` (because German's KeyY position prints "z"), so react-hotkeys-hook fires when the user presses the key labeled Z — same letter, different physical position.

## Recording flow

`useRecordHotkeys` captures both `event.code` (codeChord) and `event.key` (keyChord) on each keystroke, plus a classification:

- **fkey** / **named** → mode forced to `named` regardless of preference.
- **printable** → caller's `preferredMode` (default `"logical"`) decides; `+` falls back to physical to avoid colliding with the chord separator.

The Settings page passes `preferredMode: "logical"`. Conflict detection compares dispatch chords (post-translation), so logical and physical bindings that collide on the current layout are flagged.

## Cross-cutting guards

| Concern | Where | Why |
|---|---|---|
| **AltGr** (Linux/Windows) | `eventToChord` and `useHotkey.shouldIgnoreEvent` | Chromium reports AltGr as ctrlKey+altKey — without suppression, AltGr-typed printables on non-US layouts (`AltGr+E = €` on German) would false-trigger any `ctrl+alt+e` binding. |
| **IME composition** (CJK / dead keys) | `eventToChord` and `useHotkey.shouldIgnoreEvent` | `event.isComposing` and Safari's `keyCode === 229` short-circuit matching. Modifier+letter chords bypass IME on macOS by OS design. |
| **Terminal-reserved chords** | `TERMINAL_RESERVED_CHORDS` set | `Ctrl+C/D/Z/S/Q/\` always go to PTY; recorder rejects them with an error. |

## Migration

The v1→v2 hotkey storage migration was shipped April 2026 and removed in commit `16f0da83e` (3 months later, after every active user had the `hotkey-overrides-migrated-v2` marker). If a user genuinely hasn't launched the app since April, they see default bindings instead of their v1 customizations; v1 overrides remain in main-process state via the `uiState.hotkeys.get` tRPC endpoint and could be recovered if anyone asks.

## Decision history (brief)

- **April 2026** — Initial refactor. Unified everything on `event.code` (recorder, dispatch, terminal forwarding). Preserved the bare-string storage shape. See `plans/done/20260412-keyboard-recorder-ctrl-binding-fix.md`.
- **April 27, 2026** — Layout audit and Phase 0–2 plan. Briefly tried `navigator.keyboard.getLayoutMap()` to avoid the native-keymap dep; switched back after discovering Chromium's `layoutchange` event doesn't fire for macOS input-source switches. native-keymap hooks `kTISNotifySelectedKeyboardInputSourceChanged` directly, which fires reliably. See `plans/done/20260427-keyboard-layout-plan.md`.
- **April 28, 2026** — Phase 1 (native-keymap) + Phase 2 (dual-mode bindings) shipped. v1 migration removed.

## Known gaps / future work

| Item | Status |
|---|---|
| **Menu accelerator sync** — `main/lib/menu.ts` hardcodes `CmdOrCtrl+R/,//Shift+Q`; they shadow user rebinds | Demand-driven. The single concrete user-visible gap. |
| **v1 terminal handler** uses catch-all `ctrl/meta` skip → starves TUIs of unbound chords like Ctrl+R | Tracked in `plans/20260409-tui-hotkey-forwarding.md`; v2 already correct. |
| **AltGr first-class binding token** | Reserved but never wired. AltGr is suppressed at match time, but a user can't *record* `AltGr+E` as their own chord. Drop or implement on demand. |
| **Numpad / Digit disambiguation** | Collapsed: `Numpad1` and `Digit1` both canonicalize to `"1"`. No current need for separate bindings. |
| **Shifted-layer display** | We use the unshifted glyph + ⇧ symbol convention (macOS). `native-keymap` exposes `withShift` / `withAltGr` data we don't read. |
| **Physical/logical mode toggle in Settings UI** | Backend supports both modes; UI defaults new printable recordings to logical with no opt-in to physical. Add a toggle if a user requests it. |
| **Layout-id telemetry** | `layoutId` is in the store but never reported. Cheap if product wants the data. |
| **Multi-stroke chords** (`Ctrl+K Ctrl+S`) | No demand. |
| **When-clauses / context system** | No demand; per-component `useHotkey` registration is sufficient. |

## Out of scope

- VSCode-style `KeybindingResolver` / context engine.
- `globalShortcut` (system-wide hotkeys).
- Per-extension keybinding contributions.
- Vendoring VSCode's static layout files (only if `native-keymap` ever proves insufficient).

## Key files

```
apps/desktop/src/main/lib/keyboardLayout.ts                   # native-keymap wrapper
apps/desktop/src/lib/trpc/routers/keyboardLayout.ts           # tRPC bridge
apps/desktop/src/renderer/hotkeys/
├── registry.ts                                               # shipped defaults
├── types.ts                                                  # ShortcutBinding, BindingMode
├── display.ts                                                # formatHotkeyDisplay, glyphForCode
├── stores/
│   ├── hotkeyOverridesStore.ts                               # localStorage user overrides
│   └── keyboardLayoutStore.ts                                # tRPC mirror with retry
├── hooks/
│   ├── useBinding/                                           # binding + dispatch chord
│   ├── useHotkey/                                            # register a callback
│   ├── useHotkeyDisplay/                                     # formatted display
│   └── useRecordHotkeys/                                     # Settings recording flow
├── utils/
│   ├── binding.ts                                            # parse / serialize / translate
│   └── resolveHotkeyFromEvent.ts                             # canonicalization, terminal index
└── components/HotkeyLabel/                                   # <Kbd>-rendering component

apps/desktop/src/main/lib/menu.ts                             # ⚠ hardcoded; see "Known gaps"
apps/desktop/src/renderer/lib/terminal/                       # terminal forwarding integration
```

## References

- VSCode keyboardLayoutMainService: https://github.com/microsoft/vscode/blob/main/src/vs/platform/keyboardLayout/electron-main/keyboardLayoutMainService.ts
- `native-keymap`: https://github.com/microsoft/node-native-keymap
- MDN `KeyboardEvent.code`: https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
