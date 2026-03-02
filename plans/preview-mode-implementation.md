# File Preview Mode Implementation Plan

Replace the current lock/unlock paradigm for file viewer panes with a VS Code/Cursor-style preview mode system.

## Current Behavior

The current implementation uses an explicit lock mechanism:
- `isLocked: boolean` on `FileViewerState` (`tabs-types.ts:90`)
- Users manually toggle lock via a button in `FileViewerToolbar.tsx`
- When `addFileViewerPane` is called, it searches for an unlocked pane to reuse (`store.ts:384-393`)
- Lock icons: `HiMiniLockClosed` / `HiMiniLockOpen`

**Problem**: This requires explicit user action and isn't intuitive. Users must remember to lock files they want to keep open.

## Desired Behavior (VS Code/Cursor Style)

| Action | Result |
|--------|--------|
| Single-click file in sidebar | Opens in preview mode (italicized name, can be replaced) |
| Single-click same file again | **Pins** the preview (converts to permanent) |
| Double-click file in sidebar | Opens pinned (normal name, permanent) |
| Edit a preview file | Auto-pins the file |
| Close preview file | Just closes normally |
| Click another file with preview open | Replaces the preview pane content |
| Click another file with NO preview open (all pinned) | Opens new pane in preview mode |

**Key behavior**: Pinned panes are NEVER replaced. Single-click only reuses an existing unpinned (preview) pane. If no preview pane exists, a new pane is created. Clicking the same file twice pins it.

**Visual indicators**:
- Preview tabs show filename in *italics*
- Preview tabs show "preview" label with tooltip "Click again or double-click to pin"
- Pinned tabs show normal text (no label)

## Implementation Steps

### Phase 1: Type Changes

**File**: `apps/desktop/src/shared/tabs-types.ts`

1. Rename `isLocked` to `isPinned` in `FileViewerState` interface:
   ```typescript
   export interface FileViewerState {
     // ...existing fields
     /** If false, this is a preview pane that can be replaced by new file clicks */
     isPinned: boolean;  // was: isLocked
     // ...
   }
   ```

### Phase 2: Store Logic Updates

**File**: `apps/desktop/src/renderer/stores/tabs/store.ts`

1. Update `addFileViewerPane` to search for unpinned (`!isPinned`) panes instead of unlocked
2. When reusing an unpinned pane, keep `isPinned: false`
3. Add a new action `pinPane(paneId: string)` that sets `isPinned: true`

**File**: `apps/desktop/src/renderer/stores/tabs/utils.ts`

1. Update `createFileViewerPane` to use `isPinned: false` by default (preview mode)

### Phase 3: Pin-on-Edit Logic

**File**: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/FileViewerPane.tsx`

1. When `isDirty` becomes true (user made edits), auto-pin the pane:
   ```typescript
   useEffect(() => {
     if (isDirty && !fileViewer?.isPinned) {
       // Auto-pin when user edits
       pinPane(paneId);
     }
   }, [isDirty, fileViewer?.isPinned, paneId]);
   ```

### Phase 4: Double-Click to Pin from Sidebar

**File**: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ChangesView/components/FileItem/FileItem.tsx`

1. Add `onDoubleClick` prop to `FileItemProps`:
   ```typescript
   interface FileItemProps {
     // ...existing
     onClick: () => void;
     onDoubleClick?: () => void;  // NEW
   }
   ```

2. Handle both click types on the button:
   ```typescript
   <button
     type="button"
     onClick={onClick}
     onDoubleClick={(e) => {
       e.preventDefault();
       onDoubleClick?.();
     }}
   >
   ```

**Files to update** (pass through `onDoubleClick`):
- `FileListGrouped.tsx`
- `FileListTree.tsx`
- `FileList.tsx`
- Parent components in `ChangesView`

### Phase 5: Update Click Handlers in Parent Components

**File**: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ChangesView/ChangesView.tsx` (or wherever `onFileSelect` originates)

1. Current: Single handler `onFileSelect(file)`
2. New: Two handlers:
   - `onFileClick(file)` - opens in preview mode
   - `onFileDoubleClick(file)` - opens pinned

These should call `addFileViewerPane` with different options:
```typescript
// Single click - preview mode (default)
addFileViewerPane(workspaceId, { filePath, isPinned: false, ... });

// Double click - pinned
addFileViewerPane(workspaceId, { filePath, isPinned: true, ... });
```

### Phase 6: Visual Indicator (Italic Tab/Pane Name)

**File**: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/components/FileViewerToolbar/FileViewerToolbar.tsx`

1. Apply italic styling when `!isPinned`:
   ```tsx
   <span className={cn(
     "truncate text-xs text-muted-foreground",
     !isPinned && "italic"
   )}>
     {fileName}
   </span>
   ```

2. Remove the lock/unlock button entirely (or repurpose as a manual pin button)

### Phase 7: Update Props and Remove Lock UI

**File**: `FileViewerToolbar.tsx`

1. Replace `isLocked` prop with `isPinned`
2. Remove or modify the lock toggle button:
   - **Option A**: Remove entirely (double-click or edit to pin)
   - **Option B**: Keep as "Pin" button that only pins (no unpinning - close to unpin)

   Recommendation: Remove entirely for simplicity. Users can:
   - Double-click to open pinned
   - Edit to auto-pin
   - Close and single-click to get preview again

**File**: `FileViewerPane.tsx`

1. Update `handleToggleLock` to `handlePin` (one-way action, or remove if following Option A)
2. Update all references from `isLocked` to `isPinned`

### Phase 8: Migration

**File**: `apps/desktop/src/renderer/stores/tabs/store.ts`

Add a migration in the persist middleware:
```typescript
migrate: (persistedState, version) => {
  const state = persistedState as TabsState;
  if (version < 3 && state.panes) {
    // Migrate isLocked → isPinned
    for (const pane of Object.values(state.panes)) {
      if (pane.fileViewer) {
        // @ts-expect-error - old schema
        const wasLocked = pane.fileViewer.isLocked;
        pane.fileViewer.isPinned = wasLocked ?? true; // Default old panes to pinned
        // @ts-expect-error - old schema
        delete pane.fileViewer.isLocked;
      }
    }
  }
  return state;
},
```

Don't forget to bump the version number.

## Files to Modify (Summary)

| File | Changes |
|------|---------|
| `shared/tabs-types.ts` | Rename `isLocked` → `isPinned` |
| `stores/tabs/store.ts` | Update logic, add `pinPane`, add migration |
| `stores/tabs/utils.ts` | Update `createFileViewerPane` default |
| `FileViewerPane.tsx` | Auto-pin on edit, update prop names |
| `FileViewerToolbar.tsx` | Italic styling, remove/modify lock button |
| `FileItem.tsx` | Add `onDoubleClick` handler |
| `FileListGrouped.tsx` | Pass through `onDoubleClick` |
| `FileListTree.tsx` | Pass through `onDoubleClick` |
| `FileList.tsx` | Pass through `onDoubleClick` |
| `ChangesView.tsx` (or parent) | Implement double-click → pinned logic |

## Testing Checklist

- [ ] Single-click opens file in preview mode (italic name + "preview" label)
- [ ] Single-click another file replaces preview pane
- [ ] **Single-click same file again pins it** (italic → normal, "preview" label disappears)
- [ ] Double-click opens file pinned (normal name)
- [ ] Double-click another file opens in new pane (doesn't replace pinned)
- [ ] Editing a preview file auto-pins it
- [ ] Existing pinned files remain open when clicking new files
- [ ] Multiple pinned files can coexist
- [ ] **Single-click when all panes are pinned creates a NEW preview pane** (doesn't replace any pinned pane)
- [ ] Persisted state migrates correctly from old `isLocked` format
- [ ] Preview indicator (italics + "preview" label) renders correctly in toolbar
- [ ] Tooltip on "preview" label shows "Click again or double-click to pin"

## Open Questions / Decisions

1. **Should users be able to unpin?**
   - VS Code: No explicit unpin, close and re-open as preview
   - Could add context menu "Unpin" option later if needed

2. **What about the lock button?**
   - Recommendation: Remove it entirely for cleaner UX
   - Alternative: Keep as "Pin" button (one-way, no unpin)

3. **Tab bar behavior?**
   - If tabs show file names, should preview tabs also be italic there?
   - Current implementation: File name only shows in pane toolbar

4. **Keyboard shortcut to pin?**
   - VS Code uses `Cmd+K Enter` to pin preview
   - Could add this later as enhancement
