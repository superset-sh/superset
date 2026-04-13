# Keyboard Recorder — Ctrl Binding & event.code Unification

**Date:** 2026-04-12
**Scope:** `apps/desktop/src/renderer/hotkeys/*`
**Status:** shipped

## Problem

User reported that the Settings → Keyboard recorder would not allow binding
chords that begin with Ctrl. Investigation found three compounding bugs in the
recorder and its comparison/display logic.

---

## Bug 1 — Ctrl press auto-committed an invalid binding

### Before

`useRecordHotkeys.ts:13-15` filtered pure-modifier keydowns using lowercased
`event.key`:

```ts
const key = event.key.toLowerCase();
if (["shift", "ctrl", "alt", "meta", "dead", "unidentified"].includes(key))
    return null;
```

### Why it broke

`KeyboardEvent.key` for the Control key is the string `"Control"`, not `"Ctrl"`.
Lowercased, that's `"control"` — which does **not** match `"ctrl"` in the
ignore list. Result: pressing Ctrl alone (the normal first half of any Ctrl
chord) passed the filter, `event.ctrlKey` was true, and
`captureHotkeyFromEvent` immediately returned and saved `ctrl+control` as the
binding before the user could press the second key.

Shift/Alt/Meta worked because their `event.key` values lowercase to `"shift"`,
`"alt"`, `"meta"` — matching the filter.

### Source citation

[MDN KeyboardEvent.key values](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values#modifier_keys)
specifies:

> `"Control"` — The Control (Ctrl) key.

The repo already aliases `ControlLeft`/`ControlRight` → `ctrl` in
`resolveHotkeyFromEvent.ts` for `event.code` input, which hid the mismatch — it
only surfaces when someone uses `event.key`.

### Fix

Filter against the actual lowercased `event.key` value, plus other modifier-ish
keys that should never commit a binding on their own.

```ts
// apps/desktop/src/renderer/hotkeys/utils/resolveHotkeyFromEvent.ts
export const MODIFIERS = new Set(["meta", "ctrl", "control", "alt", "shift"]);
const LOCK_KEYS = new Set(["capslock", "numlock", "scrolllock"]);

export function isIgnorableKey(normalized: string): boolean {
    return !normalized || MODIFIERS.has(normalized) || LOCK_KEYS.has(normalized);
}
```

Also added `altgraph` (AltGr on European keyboards) coverage via the broader
rewrite below.

---

## Bug 2 — Recorder and resolver used different key sources

### Before

- **Resolver** (`resolveHotkeyFromEvent.ts:59`, `eventToChord`): used
  `event.code`, normalized via `CODE_ALIASES` (the same alias table as
  `react-hotkeys-hook`).
- **Recorder** (`useRecordHotkeys.ts:13`): used `event.key`.
- **Registry defaults** (`registry.ts`): written in `event.code` form
  (`bracketleft`, `comma`, `slash`, `backspace`, etc.).

### Why it broke

`event.key` depends on layout and other held modifiers; `event.code` is a
stable physical-key identifier. They diverge in common cases:

| Chord pressed     | Recorder saved (`event.key`) | Registry/library form (`event.code`) | Match? |
| ----------------- | ---------------------------- | ------------------------------------ | ------ |
| Ctrl+Shift+2      | `ctrl+shift+@`               | `ctrl+shift+2`                       | ❌     |
| Alt+L on Mac      | `alt+¬`                      | `alt+l`                              | ❌     |
| Ctrl+/ on DE kbd  | `ctrl+-`                     | `ctrl+slash`                         | ❌     |
| Meta+[            | `meta+[`                     | `meta+bracketleft`                   | ❌     |

The saved override string was fed into `useHotkeys(keys, …)`, which internally
re-parses via `mapCode`. Since `mapCode` is code-aware, an override string like
`ctrl+shift+@` would never match the `event.code` `"Digit2"`.

### Source citation

Upstream `react-hotkeys-hook` uses `event.code` by default
([`packages/react-hotkeys-hook/src/lib/useRecordHotkeys.ts`](https://raw.githubusercontent.com/JohannesKlauss/react-hotkeys-hook/main/packages/react-hotkeys-hook/src/lib/useRecordHotkeys.ts)):

```ts
// react-hotkeys-hook/packages/react-hotkeys-hook/src/lib/useRecordHotkeys.ts
const handler = useCallback(
    (event: KeyboardEvent) => {
        if (event.code === undefined) {
            // Synthetic event (e.g., Chrome autofill).  Ignore.
            return
        }
        event.preventDefault()
        event.stopPropagation()
        setKeys((prev) => {
            const newKeys = new Set(prev)
            newKeys.add(mapCode(useKey ? event.key : event.code))
            return newKeys
        })
    },
    [useKey],
)
```

And `parseHotkeys.ts` aliases `event.code` values like `ControlLeft` → `ctrl`,
`ShiftLeft` → `shift`, and strips `/key|digit|numpad/` so `KeyA` → `a`,
`Digit1` → `1`:

```ts
// react-hotkeys-hook/packages/react-hotkeys-hook/src/lib/parseHotkeys.ts
const mappedKeys: Record<string, string> = {
    esc: 'escape', return: 'enter',
    left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown',
    ShiftLeft: 'shift', ShiftRight: 'shift',
    AltLeft: 'alt', AltRight: 'alt',
    MetaLeft: 'meta', MetaRight: 'meta',
    OSLeft: 'meta', OSRight: 'meta',
    ControlLeft: 'ctrl', ControlRight: 'ctrl',
}

export function mapCode(key: string): string {
    return (mappedKeys[key.trim()] || key.trim()).toLowerCase().replace(/key|digit|numpad/, '')
}
```

### Fix

Export the existing `normalizeToken` (and `isIgnorableKey`) from
`resolveHotkeyFromEvent.ts` and reuse it in the recorder so both sides speak
the same language:

```ts
// apps/desktop/src/renderer/hotkeys/hooks/useRecordHotkeys/useRecordHotkeys.ts
import {
    canonicalizeChord,
    isIgnorableKey,
    normalizeToken,
} from "../../utils/resolveHotkeyFromEvent";

function captureHotkeyFromEvent(event: KeyboardEvent): string | null {
    if (event.code === undefined) return null; // matches upstream guard
    const key = normalizeToken(event.code);
    if (isIgnorableKey(key)) return null;

    const isFKey = /^f([1-9]|1[0-2])$/.test(key);
    if (!isFKey && !event.ctrlKey && !event.metaKey) return null;
    if (PLATFORM !== "mac" && event.metaKey) return null;

    const modifiers = new Set<string>();
    if (event.metaKey) modifiers.add("meta");
    if (event.ctrlKey) modifiers.add("ctrl");
    if (event.altKey) modifiers.add("alt");
    if (event.shiftKey) modifiers.add("shift");

    const ordered = MODIFIER_ORDER.filter((m) => modifiers.has(m));
    return [...ordered, key].join("+");
}
```

---

## Bug 3 — String comparisons didn't canonicalize

### Before

```ts
// useRecordHotkeys.ts (before)
if (TERMINAL_RESERVED.has(keys))            // raw string lookup
if (OS_RESERVED[PLATFORM].includes(keys))   // raw string lookup
if (effective === keys) return id;           // raw string comparison (conflict)
if (captured === defaultKey) resetOverride();// raw string comparison (reset-to-default)
```

### Why it broke

The recorder produces strings in `MODIFIER_ORDER` (`meta+ctrl+alt+shift`), the
registry author orders them however reads naturally (`meta+alt+up`), and the
resolver sorts alphabetically (`alt+meta+arrowup`). All three forms mean the
same chord but fail `===` comparison.

Examples that silently misbehaved:

- User rebinds `PREV_WORKSPACE` to its own default (`meta+alt+up`). Recorder
  saves `meta+alt+arrowup`; `captured === defaultKey` is false so we write an
  override instead of resetting.
- User tries to bind `meta+alt+up` while `NEXT_WORKSPACE` already has
  `meta+alt+down` — conflict check runs string `===` between canonical-ish
  recorder output and registry-authored defaults, producing false negatives on
  overlapping overrides.

### Fix

Introduce a single canonical form and use it for all comparisons.

```ts
// apps/desktop/src/renderer/hotkeys/utils/resolveHotkeyFromEvent.ts
export function canonicalizeChord(chord: string): string {
    // sorts modifiers, normalizes control→ctrl, up→arrowup, bracketleft stays, etc.
    return normalizeChord(chord);
}
```

Applied at the three comparison sites in `useRecordHotkeys.ts`:

```ts
function checkReserved(keys: string) {
    const canonical = canonicalizeChord(keys);
    if (TERMINAL_RESERVED.has(canonical)) return { reason: "Reserved by terminal", severity: "error" };
    if (OS_RESERVED[PLATFORM].includes(canonical)) return { reason: "Reserved by OS", severity: "warning" };
    return null;
}

function getHotkeyConflict(keys: string, excludeId: HotkeyId) {
    const canonicalKeys = canonicalizeChord(keys);
    for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
        if (id === excludeId) continue;
        const effective = id in overrides ? overrides[id] : HOTKEYS[id].key;
        if (effective && canonicalizeChord(effective) === canonicalKeys) return id;
    }
    return null;
}

// reset-to-default detection
if (canonicalizeChord(captured) === canonicalizeChord(defaultKey)) {
    resetOverride(recordingId);
} else {
    setOverride(recordingId, captured);
}
```

`TERMINAL_RESERVED` had `"ctrl+\\"` — canonicalization leaves the backslash
alone, but the recorder produces `ctrl+backslash` from `event.code === "Backslash"`.
Changed the constant to `"ctrl+backslash"` so the set membership check matches
what the recorder emits.

---

## Display parity (`display.ts`)

The display layer rendered symbols from a static table keyed on short names
(`up`, `comma`) and never normalized input. Overrides stored in canonical form
(`arrowup`) would render as `"ARROWUP"`. Fix:

```ts
// apps/desktop/src/renderer/hotkeys/display.ts
import { normalizeToken } from "./utils/resolveHotkeyFromEvent";

const KEY_DISPLAY: Record<string, string> = {
    enter: "↵", backspace: "⌫", delete: "⌦", escape: "⎋", tab: "⇥",
    up: "↑", down: "↓", left: "←", right: "→",
    arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
    space: "␣",
    slash: "/", backslash: "\\", comma: ",", period: ".",
    semicolon: ";", quote: "'", backquote: "`",
    minus: "-", equal: "=",
    bracketleft: "[", bracketright: "]",
};

export function formatHotkeyDisplay(keys: string | null, platform: Platform): HotkeyDisplay {
    if (!keys) return { keys: ["Unassigned"], text: "Unassigned" };
    const parts = keys.toLowerCase().split("+").map(normalizeToken);
    // …rest unchanged; uses KEY_DISPLAY[key] ?? key.toUpperCase()
}
```

---

## Decisions deliberately not taken

### `mod` modifier alias

Upstream `react-hotkeys-hook` supports `mod` as "meta on macOS, ctrl elsewhere"
([`parseHotkeys.ts` reserved list](https://raw.githubusercontent.com/JohannesKlauss/react-hotkeys-hook/main/packages/react-hotkeys-hook/src/lib/parseHotkeys.ts)):

```ts
const reservedModifierKeywords = ['shift', 'alt', 'meta', 'mod', 'ctrl', 'control']
```

Our registry already stores per-platform bindings:

```ts
// apps/desktop/src/renderer/hotkeys/registry.ts
QUICK_OPEN: {
    key: { mac: "meta+p", windows: "ctrl+shift+p", linux: "ctrl+shift+p" },
    ...
}
```

Adding `mod` would duplicate that capability without simplifying existing
definitions. Skipped.

---

## Testability

Everything the fix touches is now isolated in **pure functions** that take
primitives and return primitives. All three bugs are testable without React or
a DOM:

| Unit                                                | Pure? | Inputs                 | Test harness         |
| --------------------------------------------------- | ----- | ---------------------- | -------------------- |
| `normalizeToken(event.code \| alias)`               | ✅    | string                 | `bun:test` direct    |
| `isIgnorableKey(normalized)`                        | ✅    | string                 | `bun:test` direct    |
| `canonicalizeChord(chord)`                          | ✅    | string                 | `bun:test` direct    |
| `eventToChord(event)` / `resolveHotkeyFromEvent`    | ✅    | `KeyboardEventInit`    | `new KeyboardEvent`  |
| `captureHotkeyFromEvent(event)`                     | ✅\*  | `KeyboardEventInit`    | `new KeyboardEvent`  |
| `formatHotkeyDisplay(keys, platform)`               | ✅    | string, `Platform`     | `bun:test` direct    |

\* `captureHotkeyFromEvent` references `PLATFORM` (imported from `registry.ts`),
which is computed once from `navigator.platform`. To test non-Mac branches,
either export a `_captureHotkeyFromEventWithPlatform(event, platform)` variant
or module-mock `PLATFORM`. For the initial test pass we cover the current host
platform and construct events for the paths that don't depend on `PLATFORM`.

The hook integration (`useRecordHotkeys`) is better covered with a smoke test
using `@testing-library/react` + `userEvent.keyboard`, but the pure helpers
cover all three bug classes deterministically.

### Test file

See co-located tests:
- `apps/desktop/src/renderer/hotkeys/utils/resolveHotkeyFromEvent.test.ts`
- `apps/desktop/src/renderer/hotkeys/hooks/useRecordHotkeys/useRecordHotkeys.test.ts`
- `apps/desktop/src/renderer/hotkeys/display.test.ts`

---

## Sources

- [react-hotkeys-hook — GitHub](https://github.com/JohannesKlauss/react-hotkeys-hook)
- [`parseHotkeys.ts` (main)](https://raw.githubusercontent.com/JohannesKlauss/react-hotkeys-hook/main/packages/react-hotkeys-hook/src/lib/parseHotkeys.ts)
- [`useRecordHotkeys.ts` (main)](https://raw.githubusercontent.com/JohannesKlauss/react-hotkeys-hook/main/packages/react-hotkeys-hook/src/lib/useRecordHotkeys.ts)
- [MDN — KeyboardEvent.key values](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values)
- [MDN — KeyboardEvent.code values](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values)
- VSCode's terminal hotkey forwarding pattern (referenced in
  `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts:19-22` comment
  citing `terminalInstance.ts:1116-1175`)
