# Input Lag Performance Fixes

This document outlines the root causes of input lag in the desktop app and the fixes implemented.

## Problem Summary

Users experienced noticeable lag when typing in:
1. Terminal components
2. NewWorkspaceModal input fields

## Root Causes Identified

### 1. Global Zustand Store Re-renders (HIGH IMPACT)

**Location:** `TabsContent/index.tsx:17-19`

```typescript
const allTabs = useTabsStore((s) => s.tabs);
const panes = useTabsStore((s) => s.panes);
const activeTabIds = useTabsStore((s) => s.activeTabIds);
```

**Problem:** The entire `panes` object is passed as a prop to `TabView`. Any change to any pane triggers a re-render of the entire component tree:
1. `updatePaneCwd` or `setPaneStatus` updates the store
2. This changes the `panes` object reference
3. `TabsContent` re-renders → `TabView` re-renders → all `Terminal` components re-render

### 2. Terminal Component: Multiple Store Selectors (HIGH IMPACT)

**Location:** `Terminal.tsx:31, 48-53`

```typescript
const panes = useTabsStore((s) => s.panes);
const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
```

**Problem:** Each Terminal subscribes to the entire `panes` and `focusedPaneIds` objects instead of selecting just its own data. Any terminal update triggers ALL terminals to re-render.

### 3. CWD Updates on Every Terminal Data Event (MEDIUM IMPACT)

**Location:** `Terminal.tsx:159-161`

```typescript
useEffect(() => {
    updatePaneCwd(paneId, terminalCwd, cwdConfirmed);
}, [terminalCwd, cwdConfirmed, paneId, updatePaneCwd]);
```

**Problem:** Combined with `updateCwdFromData` being called on every stream event, this creates frequent Zustand store updates that propagate to all subscribers.

### 4. NewWorkspaceModal: No Input Debouncing (MEDIUM IMPACT)

**Location:** `NewWorkspaceModal.tsx:269-270`

```typescript
onChange={(e) => setTitle(e.target.value)}
```

**Problem:** Every keystroke triggers:
1. `title` state update
2. `useEffect` that updates `branchName`
3. `useMemo` that recalculates `filteredBranches`
4. Full modal re-render

## Fixes Implemented

### Fix 1: Granular Selectors in Terminal ✅

Changed Terminal component to select only its own pane data instead of all panes:

```typescript
// Before
const panes = useTabsStore((s) => s.panes);
const pane = panes[paneId];
const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);

// After
const pane = useTabsStore((s) => s.panes[paneId]);
const focusedPaneId = useTabsStore((s) =>
    s.focusedPaneIds[s.panes[paneId]?.tabId ?? ""]
);
```

### Fix 2: Avoid Passing `panes` Object as Prop ✅

Changed `TabsContent` to only select pane IDs for the active tab, and have `TabView` select its own panes internally:

```typescript
// TabsContent - no longer passes panes prop
<TabView tab={tabToRender} />

// TabView - selects its own pane data
const paneIds = useMemo(() => extractPaneIdsFromLayout(tab.layout), [tab.layout]);
```

### Fix 3: Debounce CWD Updates ✅

Added debouncing to the CWD store sync:

```typescript
const debouncedUpdatePaneCwd = useRef(
    debounce((paneId: string, cwd: string | null, confirmed: boolean) => {
        updatePaneCwd(paneId, cwd, confirmed);
    }, 150)
);
```

### Fix 4: Debounce Title Input in NewWorkspaceModal ✅

Added debouncing to the title input with immediate local state for responsive typing:

```typescript
const [localTitle, setLocalTitle] = useState("");
const debouncedSetTitle = useMemo(
    () => debounce((value: string) => setTitle(value), 150),
    []
);

const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalTitle(value); // Immediate update for responsive typing
    debouncedSetTitle(value); // Debounced update for derived state
};

// In render - uses localTitle for immediate feedback
<Input value={localTitle} onChange={handleTitleChange} />
```

## Future Improvements (Deferred)

### Fix 5: React.memo Wrappers

Wrap frequently re-rendered components with `React.memo`:
- `Terminal` component
- `TabView` component
- `TabPane` component
- `NewWorkspaceModal` component

This was deferred pending testing of fixes 1-4.

## Testing

To verify the fixes work:

1. **Terminal typing test:** Open multiple terminals and type rapidly in one - the others should not re-render
2. **CWD update test:** Navigate directories in terminal - should not cause lag
3. **NewWorkspaceModal test:** Type rapidly in the title field - should feel responsive

Use React DevTools Profiler to verify reduced re-renders.
