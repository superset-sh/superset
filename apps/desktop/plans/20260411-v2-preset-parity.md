# V2 Preset Execution Mode Parity

## Problem

`V2PresetsBar.openPresetInNewTab()` ignores `executionMode` -- always creates 1 tab with 1 pane and joins all commands with `" && "`. V1 supports three execution modes that produce different layouts:

- **`split-pane`**: N commands -> N panes in the active tab
- **`new-tab`**: N commands -> N separate tabs
- **`new-tab-split-pane`**: N commands -> 1 new tab with N split panes

V2's pane store already has multi-pane `addTab()` (with balanced tree) and `addPane()`. The infrastructure exists; it's just not wired up in the preset path.

Preset hotkeys (OPEN_PRESET_1-9) also show labels in the V2 UI but have no handlers.

## Design Decisions

### 1. Extract execution logic into a `useV2PresetExecution` hook

Both bar clicks and hotkeys need the same execution function. Currently the logic is inline in `V2PresetsBar` as a `useCallback`. Extracting it:

- Lets `useWorkspaceHotkeys` call the same function without duplicating the query or logic
- Keeps `V2PresetsBar` focused on rendering
- Makes the execution logic testable

### 2. Reuse V1's `getPresetLaunchPlan()`

37 lines of pure logic with no V1 store dependency. Takes `{ mode, target, commandCount, hasActiveTab }` and returns one of 5 launch plans. No reason to duplicate it.

### 3. Both clicks and hotkeys follow the preset's `executionMode`

No separate `target` override. The preset's `executionMode` determines the behavior:

- `split-pane` -> adds panes to the active tab (falls back to new tab with splits if no active tab)
- `new-tab` -> creates separate tabs, one per command
- `new-tab-split-pane` -> creates one new tab with N split panes

This means we always pass `target: "active-tab"` to `getPresetLaunchPlan` for `split-pane` mode presets, and the function handles the fallback internally via `hasActiveTab`.

### 4. Rename `onOpenInNewTab` -> `onExecutePreset`

Descriptive: the callback executes the preset according to its configured mode.

## Implementation

### New: `useV2PresetExecution` hook

`v2-workspace/$workspaceId/hooks/useV2PresetExecution/useV2PresetExecution.ts`

- Accepts `store`, `workspaceId`, `projectId`
- Queries presets via `useLiveQuery` + `filterMatchingPresetsForProject`
- Exposes `executePreset(preset)` and `matchedPresets`
- Derives the `target` from the preset's `executionMode`:
  - `split-pane` -> `target: "active-tab"`
  - `new-tab` / `new-tab-split-pane` -> `target: "new-tab"`
- Maps `getPresetLaunchPlan()` result to V2 store calls:

| Plan | Store Call |
|---|---|
| `new-tab-single` | `addTab({ panes: [1 pane] })` |
| `new-tab-multi-pane` | `addTab({ panes: [N panes] })` (auto balanced tree) |
| `new-tab-per-command` | `addTab()` x N, 1 pane each |
| `active-tab-single` | `addPane({ tabId, pane })`, fallback to new-tab |
| `active-tab-multi-pane` | `addPane()` x N, fallback to new-tab |

Each command gets its own pane with `initialCommand` (no `&&` joining).

### Modify: `V2PresetsBar.tsx`

- Remove inline `openPresetInNewTab`, preset querying, `matchedPresets` derivation
- Receive `executePreset` and `matchedPresets` via props from `WorkspaceContent` (which calls `useV2PresetExecution`)
- Pass `executePreset` to `V2PresetBarItem` as `onExecutePreset`

### Modify: `V2PresetBarItem.tsx`

- Rename `onOpenInNewTab` prop to `onExecutePreset`
- Context menu label: "Open in new tab" -> "Run preset"

### Modify: `useWorkspaceHotkeys.ts`

- Accept `matchedPresets` and `executePreset` as params
- Add `useHotkey("OPEN_PRESET_N", () => executePreset(matchedPresets[N-1]))` x 9

### Modify: `page.tsx`

- Call `useV2PresetExecution({ store, workspaceId, projectId })` in `WorkspaceContent`
- Pass results to `V2PresetsBar` and `useWorkspaceHotkeys`

## File Summary

| File | Action |
|---|---|
| `.../hooks/useV2PresetExecution/useV2PresetExecution.ts` | Create |
| `.../hooks/useV2PresetExecution/index.ts` | Create |
| `.../V2PresetsBar/V2PresetsBar.tsx` | Simplify, use hook |
| `.../V2PresetBarItem/V2PresetBarItem.tsx` | Rename prop + label |
| `.../useWorkspaceHotkeys/useWorkspaceHotkeys.ts` | Add preset hotkeys |
| `.../v2-workspace/$workspaceId/page.tsx` | Wire hook |
| `renderer/stores/tabs/preset-launch.ts` | Reuse as-is |

## Verification

1. `bun run typecheck && bun run lint:fix`
2. Manual: multi-command presets with each mode, hotkeys Ctrl+1-9, single/empty edge cases
