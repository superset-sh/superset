# Notes Pane Goal And Polish

## Goal
Ship a new Notes pane that feels native in the workspace tab system, and fix visual regressions that made it look broken:

1. A weird black border in Notes pane/editor states.
2. A weird black border in Mosaic drag/split preview states.
3. Fragile Notes save/hydration behavior that risked missed or stale writes.

## What Was Implemented
1. Added Notes pane routing, state shape, creation flow, and persistence wiring through the desktop UI state and notes tRPC router.
2. Implemented Notes editor with TipTap + markdown storage in `.superset/notes/<file>.md`.
3. Hardened Notes editor styling to remove unexpected focus/border chrome.
4. Refined Notes editor save lifecycle:
   - Debounced writes with explicit target tracking (`worktreePath` + `filePath`).
   - Safe hydration per note file.
   - Flush pending writes on unmount/switch.
5. Overrode Mosaic preview/drop-target defaults so drag/split previews no longer fall back to black default borders.

## Validation
1. `bunx biome check` on touched files passes.
2. `bun run --cwd apps/desktop typecheck` passes.

## Outcome
Notes pane now behaves and looks consistent with the rest of the workspace panes, and Mosaic preview overlays are themed correctly instead of showing default black borders.
