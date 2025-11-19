# Drag-and-Drop Backend Unification (HTML5Backend)

Problem: Multiple HTML5 backends were created at runtime, triggering:

Error: Cannot have two HTML5 backends at the same time.

This occurred because our app used React DnD directly while `react-mosaic-component` and `react-arborist` also rely on React DnD. If any of them creates its own `DndProvider`/backend, we end up with multiple HTML5 backends in the same window.

## Goals

- Enforce a single, shared DragDropManager/HTML5 backend for the entire renderer.
- Keep Mosaic and Arborist interoperable by reusing the same manager.
- Prevent regressions by documenting the pattern and providing a shared utility.

## High-Level Plan

- Create a shared DnD manager via `createDndContext(HTML5Backend)`.
- Use a single top-level `DndProvider` wired to that manager.
- Pass the same manager to any library that can optionally create its own provider (e.g., `react-arborist`’s `Tree` via `dndManager`).
- Remove/avoid any nested `DndProvider` instances that initialize their own HTML5 backend.

## Implementation Details

1) Shared manager utility
- File: `apps/desktop/src/renderer/lib/dnd.ts`
- Exports: `dragDropManager` created once via `createDndContext(HTML5Backend)`.

2) Top-level provider uses the shared manager
- File: `apps/desktop/src/renderer/screens/main/MainScreen.tsx`
- Change: Replace `backend={HTML5Backend}` with `manager={dragDropManager}` on `DndProvider`.

3) Arborist uses the shared manager
- Files:
  - `apps/desktop/src/renderer/screens/main/components/Sidebar/components/WorktreeList/components/WorktreeItem/WorktreeItem.tsx`
  - `apps/desktop/src/renderer/screens/main/components/Sidebar/components/WorktreeList/components/WorktreeItem/WorktreeItemArborist.tsx`
- Change: Add `dndManager={dragDropManager}` to `<Tree />` and import the manager from `renderer/lib/dnd`.

4) Mosaic
- `react-mosaic-component` internally mounts its own `DndProvider` using `react-dnd-multi-backend`.
- To avoid multiple MultiBackends, pass the shared manager via `dragAndDropManager={dragDropManager}` to `<Mosaic />`.
- This makes its internal provider reuse the shared manager rather than creating a new MultiBackend instance.

## What Changed (Summary)

- Added `apps/desktop/src/renderer/lib/dnd.ts` exporting a singleton `dragDropManager`.
- Updated top-level DnD provider in `MainScreen.tsx` to use `manager={dragDropManager}`.
- Updated all Arborist `Tree` usages to pass `dndManager={dragDropManager}`.

## Validation

- Typecheck/lint: `bun run typecheck` and `bun run lint:check` at repo root.
- Manual: Open the Desktop app and interact with Mosaic panes and the Arborist trees (dragging, dropping, splitting). No console errors about multiple HTML5 backends should appear.

## Regression Guardrails

- Do not add additional `DndProvider` instances in the renderer. If a subtree must have a provider for scoping, pass `manager={dragDropManager}` to reuse the shared manager.
- For `react-arborist`, always provide `dndManager={dragDropManager}` to `<Tree />`.
- Centralize DnD concerns in `renderer/lib/dnd.ts`. If backend options change (e.g., `rootElement`), update only this file.

## Notes & Alternatives

- If drag-and-drop is needed within portals or iframes, configure backend `options` (e.g., `rootElement`) in `renderer/lib/dnd.ts` and ensure every consumer still reuses the same manager.
- This approach avoids multi-backend solutions and keeps complexity low by standardizing on one HTML5 backend across the renderer.
