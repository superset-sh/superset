# UX Polish: Linear-style Bubble Menu, Kanban View, and Multi-Account Switcher

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md.

## Purpose / Big Picture

After this change, three user-facing capabilities exist that did not exist before:

1. **Bubble Menu**: When a user selects text in the task description editor, a floating toolbar appears above the selection showing formatting options (Bold, Italic, Strikethrough, Underline, Code, Heading picker, Link, Blockquote, Code block, and List picker). This mirrors Linear's editor experience and eliminates the need to memorize keyboard shortcuts.

2. **Kanban Board View**: Users can toggle between the existing table view and a new board view on the tasks page. The board view shows columns for each status group with task cards that can be dragged between columns to change status. This works with both Linear-synced and local tasks.

3. **Multi-Account Switcher**: Desktop users can sign into multiple accounts simultaneously. An account switcher in the sidebar lets them switch between accounts without signing out and back in.

## Assumptions

- The `@tiptap/extension-bubble-menu` package (v3.17.1) already installed in `apps/desktop/package.json` is compatible with the current TipTap setup and provides the `BubbleMenu` React component.
- The `@dnd-kit/core` (v6.3.1) and `@dnd-kit/sortable` (v10.0.0) packages already installed are sufficient for Kanban drag-and-drop.
- Better Auth's `multiSession` plugin can be added server-side without database migrations (it uses the existing `sessions` table).
- The existing tRPC `task.update` procedure supports updating a task's `statusId` field for Kanban column moves.

## Open Questions

None remaining — all decisions made during discovery are recorded in the Decision Log below.

## Progress

- [x] (2026-03-18 14:00Z) Discovery and orientation — read all key files
- [x] (2026-03-18 14:30Z) Plan drafted
- [x] (2026-03-18 15:00Z) Milestone 1: Bubble Menu for Task Editor — BubbleMenuToolbar component + BubbleMenu integration
- [x] (2026-03-18 15:15Z) Milestone 2: Kanban Board View — useTasksData hook, KanbanCard, KanbanColumn, TasksBoardView, view toggle in TopBar
- [x] (2026-03-18 15:30Z) Milestone 3: Multi-Account Switcher — multiSession plugin, multi-token storage, account switcher UI
- [x] (2026-03-18 15:40Z) Validation: typecheck (20/20 pass), lint (0 errors), all clean

## Surprises & Discoveries

- Observation: TipTap v3.18 (installed version) uses Floating UI instead of Tippy.js for BubbleMenu positioning. The `tippyOptions` prop no longer exists; replaced by `options` with Floating UI config (placement, offset, flip, shift, etc.).
  Evidence: `@tiptap/extension-bubble-menu` v3.18.0 imports from `@floating-ui/dom` instead of `tippy.js`.

- Observation: The biome linter auto-expands React effect dependency arrays to be exhaustive. The `biome-ignore` comment for `useExhaustiveDependencies` was automatically removed by the linter when all dependencies were present.
  Evidence: After `bun run lint:fix`, the AuthProvider's `useEffect` dep array was updated to include `sessionData.user` and `updateAccountMetaMutation.mutate`.

## Decision Log

- Decision: Use `@tiptap/react`'s `BubbleMenu` component rather than building a custom floating toolbar with Tippy.js.
  Rationale: The package is already installed and provides proper positioning, show/hide logic, and editor integration out of the box. It also handles edge cases like not showing when the selection is inside a code block.
  Date: 2026-03-18

- Decision: Avoid Radix DropdownMenu inside BubbleMenu; use custom dropdown panels with `onMouseDown` + `e.preventDefault()`.
  Rationale: The task description calls this out explicitly — Radix portals steal focus from the editor, causing the selection to collapse and the BubbleMenu to disappear. Using `onMouseDown` with `preventDefault()` keeps editor focus intact.
  Date: 2026-03-18

- Decision: Use `@dnd-kit` (already installed) for Kanban drag-and-drop instead of `react-dnd` (also installed).
  Rationale: `@dnd-kit` is the more modern library with better accessibility support and a cleaner API. Both are installed but neither is currently used for tasks.
  Date: 2026-03-18

- Decision: Store view mode preference ("table" or "board") in the existing `useTasksFilterStore` Zustand store.
  Rationale: Co-locates view state with other task UI state. No persistence needed — table view is the default on every session.
  Date: 2026-03-18

- Decision: For multi-account on desktop, store tokens as a JSON array in the same encrypted file rather than creating per-account files.
  Rationale: Keeps the single-file pattern. The array approach is simpler and the encrypted file already uses AES-256-GCM. The account list is small (typically 2-3 accounts).
  Date: 2026-03-18

## Outcomes & Retrospective

All three features implemented and passing typecheck + lint:

1. **Bubble Menu**: Selection-based toolbar with Bold, Italic, Underline, Strikethrough, Code, Heading picker (Paragraph/H1/H2/H3), Link, Blockquote, Code block, and List picker (Bullet/Numbered/Checklist). Uses Floating UI positioning via `@tiptap/react/menus`. Custom dropdown panels avoid Radix focus issues.

2. **Kanban Board**: Table/board view toggle in TasksTopBar. Board view uses `@dnd-kit` for drag-and-drop between status columns. New `useTasksData` hook extracts data fetching from `useTasksTable` for reuse. Status columns ordered by workflow position.

3. **Multi-Account Switcher**: `multiSession` plugin added to Better Auth server + clients. Desktop token storage refactored from single token to array format with backward-compatible migration. Account switcher added to OrganizationDropdown with switch, add, and sign-out actions. AuthProvider updates account metadata on session fetch.

## Context and Orientation

This work targets the **desktop app** (`apps/desktop`) and the **auth package** (`packages/auth`). No other apps are affected.

### Apps and Packages Involved

- **`apps/desktop`** — Electron app where all three features are implemented. Uses a renderer process (browser environment, React) and a main process (Node.js). Communication between them uses tRPC over Electron IPC (`trpc-electron`).
- **`packages/auth`** — Shared Better Auth configuration (server at `src/server.ts`, client at `src/client.ts`). Used by the API backend and referenced by the desktop auth client.

### Key Files

**Bubble Menu:**
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/TaskMarkdownRenderer/TaskMarkdownRenderer.tsx` — The task description TipTap editor. This is where the BubbleMenu will be added.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/TaskMarkdownRenderer/components/SlashCommand/SlashCommand.tsx` — Existing slash command menu (reference for popup patterns).

**Kanban View:**
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.tsx` — Main tasks view container. Will add view toggle and conditionally render table or board.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTableView/TasksTableView.tsx` — Current table view (reference for task rendering).
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksTable/useTasksTable.tsx` — Task data query + table config. The data query portion will be extracted for reuse by board view.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/TasksTopBar.tsx` — Top bar with tabs and search. Will add view toggle buttons.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state.ts` — Zustand store for filter state. Will add `viewMode` field.

**Multi-Account Switcher:**
- `packages/auth/src/server.ts` — Better Auth server config. Add `multiSession()` plugin.
- `packages/auth/src/client.ts` — Web auth client. Add `multiSessionClient()` plugin.
- `apps/desktop/src/renderer/lib/auth-client.ts` — Desktop auth client. Add `multiSessionClient()` plugin.
- `apps/desktop/src/lib/trpc/routers/auth/index.ts` — Desktop auth tRPC router. Refactor for multi-token storage.
- `apps/desktop/src/lib/trpc/routers/auth/utils/auth-functions.ts` — Token storage functions. Refactor from single token to token array.
- `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx` — Auth hydration provider. Handle active account switching.

### Terms

- **BubbleMenu**: A floating toolbar that appears above/below selected text in a TipTap editor, offering formatting buttons.
- **TipTap**: A headless rich-text editor framework for React built on ProseMirror.
- **@dnd-kit**: A drag-and-drop toolkit for React with accessibility support.
- **Better Auth**: The authentication library used by Superset. `multiSession` is a built-in plugin that allows multiple concurrent sessions.
- **tRPC**: Type-safe RPC framework. In the desktop app, tRPC runs over Electron IPC (via `trpc-electron`).
- **Zustand**: Lightweight state management library used throughout the app.

## Plan of Work

### Milestone 1: Bubble Menu for Task Editor

This milestone adds a selection-based floating toolbar to the task description editor. After completion, selecting text in a task description shows a toolbar with formatting options.

**Step 1.1: Create the BubbleMenuToolbar component**

Create a new file at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/TaskMarkdownRenderer/components/BubbleMenuToolbar/BubbleMenuToolbar.tsx`.

This component receives the TipTap `editor` instance as a prop and renders inside the `<BubbleMenu>` component from `@tiptap/react`. The toolbar contains:

- **Inline formatting buttons**: Bold (Cmd+B), Italic (Cmd+I), Strikethrough, Underline (Cmd+U), Code
- **Heading picker**: A button that shows current text type (Paragraph, H1, H2, H3). Clicking it toggles a dropdown panel (not a Radix component) with options.
- **Link button**: Toggles link on selection (prompts for URL via `window.prompt` for simplicity)
- **Blockquote button**: Toggles blockquote
- **Code block button**: Toggles code block
- **List picker**: Button that shows a dropdown with Bullet list, Numbered list, Checklist

Each button uses `onMouseDown` with `e.preventDefault()` to prevent the editor from losing focus. Buttons show an active state when their corresponding mark/node is active in the current selection.

The dropdown panels (heading picker, list picker) are simple `div` elements positioned absolutely below the button, toggled by local React state. They are NOT Radix DropdownMenu components.

**Step 1.2: Create barrel export**

Create `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/TaskMarkdownRenderer/components/BubbleMenuToolbar/index.ts` exporting the component.

**Step 1.3: Integrate into TaskMarkdownRenderer**

In `TaskMarkdownRenderer.tsx`:
1. Import `BubbleMenu` from `@tiptap/react` (it re-exports from the extension package)
2. Import the `BubbleMenuToolbar` component
3. Add the `<BubbleMenu>` component inside the existing `<div className="w-full">` wrapper, before `<EditorContent>`. Pass `editor`, `tippyOptions` for positioning, and a `shouldShow` callback that returns false when inside code blocks.
4. Render `<BubbleMenuToolbar editor={editor} />` as the child of `<BubbleMenu>`.

**Acceptance:**

    bun run typecheck
    # No errors

    bun dev
    # Open desktop app, navigate to a task, click the description editor
    # Select some text — a floating toolbar appears
    # Click Bold — selected text becomes bold
    # Click the heading dropdown — shows H1/H2/H3 options
    # Click H2 — paragraph becomes heading 2


### Milestone 2: Kanban Board View

This milestone adds a board view alongside the existing table view. Users toggle between views using buttons in the top bar.

**Step 2.1: Add viewMode to filter store**

In `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state.ts`, add:
- `viewMode: "table" | "board"` field (default: `"table"`)
- `setViewMode` setter

**Step 2.2: Extract task data hook**

The current `useTasksTable` hook in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksTable/useTasksTable.tsx` mixes data fetching with table configuration. Extract the data-fetching portion into a new `useTasksData` hook at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksData/useTasksData.tsx`.

The `useTasksData` hook returns `{ data: TaskWithStatus[], isLoading: boolean }` after applying tab filtering, search, and assignee filtering. The `useTasksTable` hook will import and use `useTasksData` internally, keeping backward compatibility.

**Step 2.3: Create KanbanColumn component**

Create `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksBoardView/components/KanbanColumn/KanbanColumn.tsx`.

Each column represents one task status. It renders:
- A header with the status icon, name, and task count
- A droppable container (using `@dnd-kit/core`'s `useDroppable`)
- Task cards inside the column

**Step 2.4: Create KanbanCard component**

Create `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksBoardView/components/KanbanCard/KanbanCard.tsx`.

Each card shows: task slug, title, priority icon, assignee avatar, and labels. Uses `@dnd-kit/sortable`'s `useSortable` for drag behavior.

**Step 2.5: Create TasksBoardView component**

Create `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksBoardView/TasksBoardView.tsx`.

This component:
1. Takes `data: TaskWithStatus[]` and `onTaskClick` callback as props
2. Groups tasks by status (using status name as key, ordered by status position)
3. Wraps everything in `<DndContext>` from `@dnd-kit` with `onDragEnd` handler
4. Renders a horizontal scrollable container with `KanbanColumn` components
5. On drag end, calls the tRPC `task.update` mutation to change the task's `statusId`

**Step 2.6: Add view toggle to TasksTopBar**

In `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/TasksTopBar.tsx`:
1. Add `viewMode` and `onViewModeChange` props
2. Add two icon buttons (table icon, board icon) on the right side next to the search input
3. Active view button gets a highlighted style

**Step 2.7: Wire up in TasksView**

In `TasksView.tsx`:
1. Import the `useTasksFilterStore` viewMode state
2. Conditionally render `TasksTableView` or `TasksBoardView` based on viewMode
3. Pass the view toggle handler to `TasksTopBar`

**Acceptance:**

    bun run typecheck
    # No errors

    bun dev
    # Open desktop app, go to Tasks page
    # See table/board toggle buttons in the top bar
    # Click the board icon — view switches to Kanban columns
    # Drag a task card from one column to another — task status updates
    # Click a card — navigates to task detail page


### Milestone 3: Multi-Account Switcher

This milestone adds support for multiple simultaneous accounts in the desktop app.

**Step 3.1: Add multiSession plugin to server**

In `packages/auth/src/server.ts`:
1. Import `multiSession` from `better-auth/plugins`
2. Add `multiSession()` to the `plugins` array

**Step 3.2: Add multiSessionClient to auth clients**

In `packages/auth/src/client.ts`:
1. Import `multiSessionClient` from `better-auth/client/plugins`
2. Add `multiSessionClient()` to the plugins array

In `apps/desktop/src/renderer/lib/auth-client.ts`:
1. Import `multiSessionClient` from `better-auth/client/plugins`
2. Add `multiSessionClient()` to the plugins array

**Step 3.3: Refactor desktop token storage for multiple accounts**

In `apps/desktop/src/lib/trpc/routers/auth/utils/auth-functions.ts`:
1. Change `StoredAuth` to an array type: `StoredAuth[]` where each entry has `{ token, expiresAt, userId }` (userId is used to identify which account a token belongs to)
2. Update `loadToken()` to return the first (active) token from the array
3. Add `loadAllTokens()` that returns the full array
4. Update `saveToken()` to append to or update the array (matching by userId)
5. Add `removeToken(userId)` to remove a specific account
6. Add `setActiveToken(userId)` to reorder the array so the specified user is first

**Step 3.4: Update auth tRPC router**

In `apps/desktop/src/lib/trpc/routers/auth/index.ts`:
1. Add `getAllStoredTokens` query that returns all stored tokens
2. Add `switchAccount` mutation that calls `setActiveToken(userId)` and emits a token-saved event
3. Add `removeAccount` mutation that calls `removeToken(userId)` and emits appropriate events
4. Update `signOut` to clear only the active account or all accounts (add `all: boolean` input)

**Step 3.5: Update AuthProvider for multi-account**

In `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx`:
- No structural changes needed. The existing hydration flow picks up the active token. Account switching triggers `onTokenChanged` subscription which already handles re-hydration.

**Step 3.6: Create AccountSwitcher UI component**

Create `apps/desktop/src/renderer/components/AccountSwitcher/AccountSwitcher.tsx`.

This component:
1. Fetches all stored tokens via `electronTrpc.auth.getAllStoredTokens.useQuery()`
2. For each token, shows the user's name/email/avatar (fetched from the session data)
3. Shows a checkmark next to the active account
4. Click an account → calls `electronTrpc.auth.switchAccount.useMutation()`
5. "Add account" button at the bottom → calls `electronTrpc.auth.signIn.useMutation()`
6. Each account has a "Sign out" option → calls `electronTrpc.auth.removeAccount.useMutation()`

Create barrel export at `apps/desktop/src/renderer/components/AccountSwitcher/index.ts`.

**Step 3.7: Integrate AccountSwitcher into sidebar**

Find the sidebar component that contains the current user menu/sign-out button and add the AccountSwitcher dropdown there. The exact location depends on the sidebar structure — look for the component that renders the user avatar and sign-out button.

**Acceptance:**

    bun run typecheck
    # No errors

    bun dev
    # Open desktop app, sign in with account A
    # Click account menu in sidebar → shows account A with checkmark
    # Click "Add account" → browser opens for OAuth
    # Sign in with account B → desktop now shows account B as active
    # Click account menu → shows both accounts, B has checkmark
    # Click account A → switches to account A, session refreshes
    # Click "Sign out" on account B → account B removed, only A remains


## Concrete Steps

All commands run from the monorepo root unless noted.

    # After all code changes
    bun run typecheck
    # Expected: No errors across all packages

    bun run lint:fix
    # Expected: All auto-fixable issues resolved

    bun dev
    # Expected: Desktop app starts, all three features functional

## Validation and Acceptance

1. **Bubble Menu**: Open a task, click description, select text. Floating toolbar appears. Click Bold — text becomes bold. Click heading dropdown, select H2 — paragraph becomes H2. Select text in a code block — bubble menu does NOT appear.

2. **Kanban Board**: Go to Tasks page. Click board icon in top bar. Columns appear grouped by status. Drag a card from "Backlog" to "In Progress" — card moves, status updates. Click a card — navigates to task detail.

3. **Multi-Account**: Sign in with one account. Click account menu. Click "Add account". Sign in with second account. See both accounts listed. Click first account to switch. Click "Sign out" on second account.

Run validation:

    bun run typecheck   # No type errors
    bun run lint        # No lint errors

## Idempotence and Recovery

All steps are safe to repeat. File writes are idempotent — writing the same content to the same file produces the same result. The multi-account token storage migration handles both old (single token) and new (array) formats gracefully — `loadToken()` detects the format and adapts.

## Artifacts and Notes

### BubbleMenu Component Pattern

The BubbleMenu from `@tiptap/react` wraps a div and positions it near the text selection:

    import { BubbleMenu } from "@tiptap/react/menus";

    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: { mainAxis: 8 } }}
      shouldShow={({ editor }) => !editor.isActive("codeBlock")}
    >
      <BubbleMenuToolbar editor={editor} />
    </BubbleMenu>

### Kanban DnD Pattern

    import { DndContext, type DragEndEvent } from "@dnd-kit/core";
    import { useDroppable } from "@dnd-kit/core";
    import { useSortable } from "@dnd-kit/sortable";

    function onDragEnd(event: DragEndEvent) {
      const { active, over } = event;
      if (!over) return;
      // active.id = task ID, over.id = target status ID
      updateTaskStatus(active.id, over.id);
    }

### Multi-Account Token Format

    // Old format (single token):
    { "token": "abc", "expiresAt": "2026-04-17T..." }

    // New format (multi-account):
    [
      { "token": "abc", "expiresAt": "2026-04-17T...", "userId": "user-1" },
      { "token": "def", "expiresAt": "2026-04-17T...", "userId": "user-2" }
    ]

## Interfaces and Dependencies

### Bubble Menu

No new packages needed. Uses `@tiptap/extension-bubble-menu` (already installed) and `BubbleMenu` from `@tiptap/react`.

### Kanban Board

No new packages needed. Uses:
- `@dnd-kit/core` (already installed, v6.3.1)
- `@dnd-kit/sortable` (already installed, v10.0.0)
- `@dnd-kit/utilities` (already installed, v3.2.2)

### Multi-Account

No new packages needed. Uses `multiSession` from `better-auth/plugins` and `multiSessionClient` from `better-auth/client/plugins` (both part of the already-installed `better-auth` package).
