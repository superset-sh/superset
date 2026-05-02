# Keyboard Recorder — Ctrl Binding & event.code Unification

**Date:** 2026-04-12 · **Scope:** `apps/desktop/src/renderer/hotkeys/*` (+ 1 terminal file) · **PR:** #3391

## TL;DR

User couldn't bind Ctrl-based shortcuts in Settings → Keyboard. Root cause: the
recorder filtered modifier keys using the wrong string (`"ctrl"` vs the actual
`event.key === "Control"`). Investigation surfaced a cluster of related bugs
all rooted in the recorder using `event.key` while the rest of the system
(registry, library dispatch, resolver) uses `event.code`. Consolidated on
`event.code` via shared helpers.

## What was broken

| # | Bug                                                                          | Fix                                                          |
|---|------------------------------------------------------------------------------|--------------------------------------------------------------|
| 1 | Lone Ctrl auto-committed `ctrl+control` before the user pressed key 2        | Filter against `"control"` (the lowercased `event.key` name) + lock keys + altgraph |
| 2 | Recorder used `event.key`, resolver/registry use `event.code` → Shift+digit, Alt+letter on Mac, punctuation, non-US layouts silently unmatchable | Unified recorder on `event.code` via shared `normalizeToken` |
| 3 | `===` string compares missed equivalent chords (`meta+alt+up` ≠ `alt+meta+arrowup`) | Added `canonicalizeChord`; apply at conflict/reset/reserved lookups |
| 4 | Terminal forwarding used a frozen default-only reverse index → rebinds swallowed, freed defaults eaten | Reverse index subscribes to override store and rebuilds on change; `null` overrides drop from index |
| 5 | Migration blindly copied old corrupt overrides into localStorage             | Sanitizer canonicalizes and drops entries that don't parse to one word-char key |
| 6 | Terminal helpers (`isTerminalReservedEvent`, `matchesKey`) used event.key and a duplicated `TERMINAL_RESERVED` | Exported `eventToChord` + `matchesChord` + `TERMINAL_RESERVED_CHORDS` as single source of truth; deleted duplicate |

## Key code changes

### Shared helpers (`utils/resolveHotkeyFromEvent.ts`)

Exposes the canonical normalizer and matcher used everywhere:

```ts
export function normalizeToken(token: string): string;   // code/key → canonical
export function isIgnorableKey(normalized: string): boolean;  // modifier + lock keys
export function canonicalizeChord(chord: string): string;     // stable compare form
export function eventToChord(event: KeyboardEvent): string | null;
export function matchesChord(event: KeyboardEvent, chord: string): boolean;
export const TERMINAL_RESERVED_CHORDS: Set<string>;           // canonical form
export const MODIFIERS: Set<string>;
```

Reverse index is now live (Bug 4):

```ts
let registeredAppChords = buildRegisteredAppChords(
    useHotkeyOverridesStore.getState().overrides,
);
useHotkeyOverridesStore.subscribe((state) => {
    registeredAppChords = buildRegisteredAppChords(state.overrides);
});
```

### Recorder (`hooks/useRecordHotkeys/useRecordHotkeys.ts`)

Bug 1 + 2 in one:

```ts
if (event.code === undefined) return null;          // synthetic / autofill guard
const key = normalizeToken(event.code);              // event.code, not event.key
if (isIgnorableKey(key)) return null;                // catches Control/Shift/Alt/Meta/lock
const isFKey = /^f([1-9]|1[0-2])$/.test(key);
if (!isFKey && !event.ctrlKey && !event.metaKey) return null;
// …emit in registry MODIFIER_ORDER to stay string-comparable with defaults.
```

Bug 3: `canonicalizeChord` on both sides of every comparison (reset-to-default,
conflict detection, reserved-list lookup). `TERMINAL_RESERVED_CHORDS` imported
from the shared module — no more duplicate.

### Migration (`migrate.ts`)

Bug 5: sanitize each migrated value. Drops garbage (`ctrl+control`,
`ctrl+shift+@`, `meta+[`) and logs the count. Preserves `null` (explicit
unassignment).

```ts
const canonical = canonicalizeChord(value);
const keys = canonical.split("+").filter((p) => !MODIFIERS.has(p));
if (keys.length !== 1) return undefined;
if (!/^[a-z0-9]+$/.test(keys[0])) return undefined;
return canonical;
```

### Terminal helpers

Bug 6: `utils/utils.ts` and `Terminal/helpers.ts` now use `matchesChord` +
shared `TERMINAL_RESERVED_CHORDS`:

```ts
// utils/utils.ts
export function isTerminalReservedEvent(event: KeyboardEvent): boolean {
    const chord = eventToChord(event);
    return chord != null && TERMINAL_RESERVED_CHORDS.has(chord);
}

// Terminal/helpers.ts — was: matchesKey(event, keys)
if (clearKeys && matchesChord(event, clearKeys)) { … }
```

### Display (`display.ts`)

Runs each chord part through `normalizeToken` and extends `KEY_DISPLAY` to
cover both short (`up`) and canonical (`arrowup`) arrow names plus common
punctuation (`backslash`, `semicolon`, `quote`, `period`, `minus`, `equal`).

## Library audit — nothing else missed

Checked every `react-hotkeys-hook` usage against upstream docs:

| Option                          | Our use                                     |
|---------------------------------|---------------------------------------------|
| `useKey` (default false → code) | default (matches our `event.code` path)     |
| `splitKey` / `sequenceSplitKey` | not used (no `,` multi-binds, no `>` chords)|
| `mod` alias                     | skipped — per-platform registry covers it   |
| `scopes` / `HotkeysProvider`    | not used (global `*` scope)                 |
| `keyup` / `keydown`             | default (keydown only)                      |
| `preventDefault`                | default false; callbacks handle when needed |
| `ignoreModifiers`               | not used                                    |
| `enableOnFormTags: true`        | set in our `useHotkey` helper               |

Registry defaults already use event.code-canonical tokens (`bracketleft`,
`comma`, `slash`, `arrowup`). No hardcoded chord strings found outside
`hotkeys/` that need canonicalization.

## Decisions taken

- **Meta (Win/Super) on non-Mac — kept allowed.** Originally blocked; flipped
  after review. Power users on tiling WMs / custom Windows configs can bind
  Super-based chords. Extended `OS_RESERVED` on Windows with common shell
  intercepts (`meta+d/e/l/r/tab`) so users get a "Reserved by OS" *warning*
  instead of a silent block.
- **`mod` alias — skipped.** Registry's per-platform `{mac,windows,linux}`
  covers the same ground without adding a parsing rule.
- **Migration: dropping invalid entries is better than carrying them.**
  Silent corruption is worse than a visible drop count in console.

## Testability

Everything fixed is in pure functions over primitives. **62 tests across 4
files**, no React/DOM harness needed (plain KeyboardEvent stubs):

| File                                            | Covers                                              |
|-------------------------------------------------|-----------------------------------------------------|
| `utils/resolveHotkeyFromEvent.test.ts`          | `normalizeToken`, `isIgnorableKey`, `canonicalizeChord`, `eventToChord`, `matchesChord`, live override index, `isTerminalReservedEvent` parity |
| `utils/overrideSanitizer.test.ts`               | migration validation (Bug 5)                        |
| `hooks/useRecordHotkeys/useRecordHotkeys.test.ts` | recorder capture — all 3 bug classes                |
| `display.test.ts`                               | display formatting parity (short + canonical forms) |

Only untested branch: non-Mac `PLATFORM` path in the recorder's OS-reserved
warning. Would need module-mocking `PLATFORM`; not worth the harness.

## Files changed

```
apps/desktop/plans/20260412-keyboard-recorder-ctrl-binding-fix.md  (this doc)
apps/desktop/src/renderer/hotkeys/
    display.ts
    display.test.ts                                       (new)
    migrate.ts
    hooks/useRecordHotkeys/useRecordHotkeys.ts
    hooks/useRecordHotkeys/useRecordHotkeys.test.ts       (new)
    utils/resolveHotkeyFromEvent.ts
    utils/resolveHotkeyFromEvent.test.ts                  (new)
    utils/utils.ts
    utils/overrideSanitizer.test.ts                       (new)
    utils/index.ts                                        (barrel)
    index.ts                                              (barrel)
apps/desktop/src/renderer/screens/.../Terminal/helpers.ts
```

## Test plan (manual QA)

- [ ] macOS: Settings → Keyboard → Record, press Cmd alone → no auto-commit, still recording
- [ ] Press Ctrl alone → no auto-commit (was the reported bug)
- [ ] Press Ctrl+Shift+2 → captures `ctrl+shift+2`, not `ctrl+shift+@`
- [ ] Press Meta+[ → captures `meta+bracketleft`
- [ ] Rebind a hotkey, press the new chord inside a terminal pane → fires
- [ ] Press the OLD default of a rebound hotkey in terminal → not swallowed
- [ ] Unassign (Backspace while recording) → old chord no longer swallowed in terminal
- [ ] Rebind CLEAR_TERMINAL to `ctrl+shift+bracketleft`, press it → clears (Bug 6)
- [ ] Windows: try binding Win+R → allowed with "Reserved by OS" warning

## Sources

- [react-hotkeys-hook GitHub](https://github.com/JohannesKlauss/react-hotkeys-hook)
- [`parseHotkeys.ts`](https://raw.githubusercontent.com/JohannesKlauss/react-hotkeys-hook/main/packages/react-hotkeys-hook/src/lib/parseHotkeys.ts) — upstream modifier table + `mapCode`
- [`useRecordHotkeys.ts`](https://raw.githubusercontent.com/JohannesKlauss/react-hotkeys-hook/main/packages/react-hotkeys-hook/src/lib/useRecordHotkeys.ts) — upstream uses `event.code` by default and guards `event.code === undefined`
- [`useHotkeys` docs](https://react-hotkeys-hook.vercel.app/docs/api/use-hotkeys) — all options reviewed
- [MDN — KeyboardEvent.key values](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values) (`"Control"` not `"Ctrl"`)
- [MDN — KeyboardEvent.code values](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values)
