# Kaleidoscope-style Git Diff Viewer Implementation Plan

## Overview
Implement a git diff viewer in the desktop app's "Changes" tab, similar to Kaleidoscope. Uses `simple-git` (already installed) and Monaco Editor for syntax-highlighted side-by-side diffs.

## Key Features
- **Against Main**: View all changes between current branch and main/default branch
- **Committed**: Browse individual commit diffs on the branch
- **Staged**: View changes in git index
- **Unstaged**: View working tree modifications
- **Side-by-side diff** (default) with inline mode toggle
- **Auto-refresh** via polling (2-3 second interval)

---

## Phase 1: Types and Data Models

### Create: `apps/desktop/src/shared/changes-types.ts`
```typescript
// File status from git
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';

// Change categories
export type ChangeCategory = 'against-main' | 'committed' | 'staged' | 'unstaged';

// A changed file entry
export interface ChangedFile {
  path: string;
  oldPath?: string;  // for renames
  status: FileStatus;
  additions: number;
  deletions: number;
}

// A commit summary
export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: Date;
  files: ChangedFile[];
}

// Full git changes status
export interface GitChangesStatus {
  branch: string;
  defaultBranch: string;
  againstMain: ChangedFile[];       // All files changed vs main
  commits: CommitInfo[];            // Individual commits on branch
  staged: ChangedFile[];
  unstaged: ChangedFile[];
  untracked: ChangedFile[];
  ahead: number;
  behind: number;
}

// View modes
export type DiffViewMode = 'side-by-side' | 'inline';
```

---

## Phase 2: tRPC Router for Git Operations

### Create: `apps/desktop/src/lib/trpc/routers/changes/`
```
changes/
├── changes.ts      # Main router
├── index.ts        # Barrel export
└── utils/
    ├── parse-status.ts   # Transform git status
    └── parse-diff.ts     # Parse diff output
```

### Router Procedures (`changes.ts`)

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `getStatus` | query | `{ worktreePath }` | Full status: staged, unstaged, untracked, commits, against-main |
| `getFileDiff` | query | `{ worktreePath, filePath, category, commitHash? }` | Diff for a specific file |
| `getFileContents` | query | `{ worktreePath, filePath, category, commitHash? }` | Old/new content for Monaco |
| `stageFile` | mutation | `{ worktreePath, filePath }` | `git add <file>` |
| `unstageFile` | mutation | `{ worktreePath, filePath }` | `git reset HEAD <file>` |
| `discardChanges` | mutation | `{ worktreePath, filePath }` | `git checkout -- <file>` |
| `stageAll` | mutation | `{ worktreePath }` | `git add -A` |
| `unstageAll` | mutation | `{ worktreePath }` | `git reset HEAD` |

### Git Commands Used
- `git status` - Get working tree status
- `git diff` - Unstaged changes
- `git diff --cached` - Staged changes
- `git diff <main>..HEAD` - Against main branch
- `git log <main>..HEAD` - Commits on branch
- `git show <hash>:<file>` - File at specific commit
- `git show <hash>` - Commit diff

### Modify: `apps/desktop/src/lib/trpc/routers/index.ts`
Add `changes: createChangesRouter()` to the router.

---

## Phase 3: Zustand Store

### Create: `apps/desktop/src/renderer/stores/changes/`
```
changes/
├── store.ts    # Main store
├── types.ts    # Store-specific types
└── index.ts    # Barrel export
```

### Store State
```typescript
interface ChangesState {
  // Selected category (against-main, committed, staged, unstaged)
  selectedCategory: ChangeCategory;

  // Selected file within category
  selectedFile: ChangedFile | null;

  // For committed: selected commit hash
  selectedCommitHash: string | null;

  // View mode toggle
  viewMode: DiffViewMode;

  // Section expansion states
  expandedSections: Record<ChangeCategory, boolean>;

  // Actions
  selectCategory: (cat: ChangeCategory) => void;
  selectFile: (file: ChangedFile | null) => void;
  selectCommit: (hash: string | null) => void;
  setViewMode: (mode: DiffViewMode) => void;
  toggleSection: (section: ChangeCategory) => void;
}
```

---

## Phase 4: Sidebar Component (ChangesView)

### Restructure: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ChangesView/`
```
ChangesView/
├── ChangesView.tsx           # Main container
├── index.ts
├── components/
│   ├── ChangesHeader/
│   │   ├── ChangesHeader.tsx  # Refresh button, branch info
│   │   └── index.ts
│   ├── CategorySection/
│   │   ├── CategorySection.tsx # Collapsible section (Against Main, Committed, etc.)
│   │   └── index.ts
│   ├── FileTreeItem/
│   │   ├── FileTreeItem.tsx   # Single file row with status icon
│   │   └── index.ts
│   ├── CommitItem/
│   │   ├── CommitItem.tsx     # Commit entry with message, author
│   │   └── index.ts
│   └── FileStatusBadge/
│       ├── FileStatusBadge.tsx # A/M/D/R status indicator
│       └── index.ts
└── hooks/
    └── useChangesPolling.ts   # Auto-refresh hook
```

### UI Structure
```
┌─────────────────────────────┐
│ Branch: feature-x    [↻]    │  <- ChangesHeader
├─────────────────────────────┤
│ ▼ Against Main (12 files)   │  <- CategorySection
│   ├─ src/app.tsx       M    │  <- FileTreeItem
│   ├─ src/utils.ts      A    │
│   └─ ...                    │
├─────────────────────────────┤
│ ▼ Commits (3)               │
│   ├─ abc123 Fix bug...      │  <- CommitItem
│   │   ├─ file1.ts      M    │  <- (nested files when expanded)
│   │   └─ file2.ts      A    │
│   └─ ...                    │
├─────────────────────────────┤
│ ▼ Staged (2 files)          │
│   └─ src/new.ts        A    │
├─────────────────────────────┤
│ ▼ Unstaged (1 file)         │
│   └─ src/app.tsx       M    │
└─────────────────────────────┘
```

---

## Phase 5: Content Component (ChangesContent)

### Restructure: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/ChangesContent/`
```
ChangesContent/
├── ChangesContent.tsx        # Main container
├── index.ts
├── components/
│   ├── DiffViewer/
│   │   ├── DiffViewer.tsx    # Monaco DiffEditor wrapper
│   │   └── index.ts
│   ├── DiffToolbar/
│   │   ├── DiffToolbar.tsx   # View mode toggle, stage/unstage buttons
│   │   └── index.ts
│   ├── FileHeader/
│   │   ├── FileHeader.tsx    # File path, +/- stats, status
│   │   └── index.ts
│   └── EmptyState/
│       ├── EmptyState.tsx    # "No file selected" / "No changes"
│       └── index.ts
└── hooks/
    └── useFileDiff.ts        # tRPC query for selected file diff
```

### UI Layout
```
┌────────────────────────────────────────────────┐
│ src/app.tsx  M  +24 -12        [Inline ▾] [⊕]  │ <- FileHeader + DiffToolbar
├────────────────────────────────────────────────┤
│ ┌──────────────────┬──────────────────┐        │
│ │   Original       │   Modified       │        │ <- Monaco DiffEditor
│ │                  │                  │        │
│ │  1 function foo  │  1 function foo  │        │
│ │  2   return 1;   │  2   return 2;   │        │
│ │                  │                  │        │
│ └──────────────────┴──────────────────┘        │
└────────────────────────────────────────────────┘
```

---

## Phase 6: Monaco Editor Integration

### Install dependency
```bash
cd apps/desktop && bun add @monaco-editor/react
```

### DiffViewer Implementation
```typescript
import { DiffEditor } from '@monaco-editor/react';

// Key props:
// - original: string (old content)
// - modified: string (new content)
// - language: string (auto-detected from file extension)
// - options.renderSideBySide: boolean (toggle with viewMode)
// - options.readOnly: true
// - theme: sync with app theme (vs-dark / light)
```

### Language Detection
Map file extensions to Monaco language IDs:
- `.ts`, `.tsx` → `typescript`
- `.js`, `.jsx` → `javascript`
- `.json` → `json`
- `.md` → `markdown`
- `.css` → `css`
- `.html` → `html`
- etc.

---

## Phase 7: Auto-refresh Polling

### Hook: `useChangesPolling.ts`
```typescript
// Use React Query's refetchInterval option
const { data } = trpc.changes.getStatus.useQuery(
  { worktreePath },
  { refetchInterval: 2500 } // 2.5 seconds
);
```

---

## Implementation Order

### Step 1: Foundation
1. Create `shared/changes-types.ts`
2. Create `lib/trpc/routers/changes/` router with `getStatus` procedure
3. Register router in `routers/index.ts`
4. Create basic Zustand store

### Step 2: Sidebar UI
1. Restructure `ChangesView` into folder structure
2. Implement `CategorySection` with collapsible sections
3. Implement `FileTreeItem` and `CommitItem` components
4. Wire up tRPC query with polling
5. Implement file selection → store update

### Step 3: Diff Viewer
1. Install `@monaco-editor/react`
2. Implement `getFileContents` tRPC procedure
3. Create `DiffViewer` component with Monaco DiffEditor
4. Implement `FileHeader` and `DiffToolbar`
5. Wire up view mode toggle

### Step 4: Actions
1. Implement `stageFile`, `unstageFile`, `discardChanges` mutations
2. Add action buttons to `DiffToolbar`
3. Add context menu to `FileTreeItem` (stage/unstage/discard)
4. Implement `stageAll`/`unstageAll`

### Step 5: Polish
1. Empty states (no changes, no file selected)
2. Loading states
3. Error handling
4. Theme sync for Monaco
5. Keyboard shortcuts

---

## Files to Create
- `apps/desktop/src/shared/changes-types.ts`
- `apps/desktop/src/lib/trpc/routers/changes/changes.ts`
- `apps/desktop/src/lib/trpc/routers/changes/index.ts`
- `apps/desktop/src/lib/trpc/routers/changes/utils/parse-status.ts`
- `apps/desktop/src/lib/trpc/routers/changes/utils/parse-diff.ts`
- `apps/desktop/src/renderer/stores/changes/store.ts`
- `apps/desktop/src/renderer/stores/changes/index.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ChangesView/ChangesView.tsx` (restructure)
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ChangesView/components/*`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/ChangesContent/ChangesContent.tsx` (restructure)
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/ChangesContent/components/*`

## Files to Modify
- `apps/desktop/src/lib/trpc/routers/index.ts` - Add changes router
- `apps/desktop/package.json` - Add @monaco-editor/react dependency

---

## Dependencies
- `simple-git` - Already installed (v3.30.0)
- `@monaco-editor/react` - To be installed

---

## Existing Code Reference

### Placeholder files to replace:
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ChangesView.tsx` - Simple "Coming soon..." placeholder
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/ChangesContent.tsx` - Simple "Coming soon..." placeholder

### Existing git utilities (can reference patterns from):
- `apps/desktop/src/lib/trpc/routers/workspaces/utils/git.ts` - Has helpers for worktree operations, default branch detection

### tRPC router pattern:
```typescript
// In apps/desktop/src/lib/trpc/routers/index.ts
export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
  return router({
    // ... existing routers
    changes: createChangesRouter(), // Add this
  });
};
```

### Store pattern (follow existing stores):
- `apps/desktop/src/renderer/stores/sidebar-state.ts` - Example Zustand store with devtools
- `apps/desktop/src/renderer/stores/tabs/store.ts` - More complex store example
