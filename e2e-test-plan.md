# E2E Manual Test Plan — Task Refs & Linear Sync Hardening

## Prerequisites

- [ ] Linear integration connected with at least one team containing issues
- [ ] Superset desktop app built from this branch (`bun dev`)
- [ ] API running locally (`apps/api`)
- [ ] At least one project configured in Superset

---

## Test 1: Initial Sync — Display IDs

**What changed:** Initial sync now uses `writeLinearTaskWithSlugRetry` per-task instead of batch insert, and passes `issue.identifier` as the preferred slug.

### Steps

1. Disconnect Linear integration (Settings → Integrations → Disconnect)
2. Reconnect Linear integration (triggers initial sync)
3. Open Tasks view in Superset desktop

### Verify

- [ ] Tasks appear with Linear identifiers (e.g., `ENG-123`) in the slug/ID column, NOT internal UUIDs or hashed slugs
- [ ] All synced tasks have correct titles, statuses, and assignees
- [ ] No duplicate tasks appear
- [ ] Console logs show no `tasks_org_slug_unique` constraint violations

---

## Test 2: Slug Collision Handling

**What changed:** When two tasks would have the same slug (e.g., from different Linear teams), the system now appends `-1`, `-2`, etc.

### Steps

1. Ensure a locally-created task exists with slug matching a Linear issue identifier (e.g., create a task with slug `ENG-100` before sync)
2. Trigger initial sync (disconnect → reconnect Linear)

### Verify

- [ ] The Linear-synced task gets slug `ENG-100-1` (or similar suffix)
- [ ] The display ID still shows `ENG-100` (externalKey) in the UI, not the suffixed slug
- [ ] Both tasks are accessible and distinct

---

## Test 3: Webhook — Issue Create

**What changed:** Webhook handler now looks up existing task before writing, uses `writeLinearTaskWithSlugRetry`, and uses SHA-256 body hash for event IDs.

### Steps

1. Create a new issue in Linear
2. Wait a few seconds for the webhook to fire

### Verify

- [ ] New task appears in Superset Tasks view
- [ ] Display ID shows the Linear identifier (e.g., `ENG-456`)
- [ ] Task has correct title, status, priority, assignee

---

## Test 4: Webhook — Issue Update

### Steps

1. Update an existing Linear issue (change title, status, or assignee)
2. Wait for webhook

### Verify

- [ ] Task in Superset updates to reflect the change
- [ ] Display ID remains the Linear identifier
- [ ] No duplicate task is created

---

## Test 5: Webhook — Idempotency

**What changed:** Event ID is now SHA-256 of raw body (was `orgId-timestamp`). Legacy events are migrated on replay.

### Steps

1. Create an issue in Linear (triggers webhook)
2. Note the task appears in Superset
3. If possible, replay the same webhook payload (e.g., via Linear's webhook retry or manual curl)

### Verify

- [ ] Second delivery does NOT create a duplicate task
- [ ] Console shows `[linear/webhook] Event already processed: <hash>`

---

## Test 6: Task Display ID — UI Surfaces

**What changed:** All UI surfaces now use `getTaskDisplayId(task)` which prefers `externalKey` over `slug`.

### Steps

For a Linear-synced task (e.g., `ENG-123`), check each surface:

### Verify

- [ ] **Tasks table:** Slug column shows `ENG-123`
- [ ] **Task detail page:** Header shows `ENG-123`
- [ ] **Context menu → Copy ID:** Copies `ENG-123` to clipboard
- [ ] **History dropdown:** Shows `ENG-123` for task entries
- [ ] **Issue link command:** Search by `ENG-123` finds the task, displays `ENG-123`
- [ ] **Linked task chip:** Renders correctly when linked by externalKey
- [ ] **Run in Workspace popover:** Task list shows `ENG-123`
- [ ] **New workspace modal → Issues list:** Shows `ENG-123`

---

## Test 7: Task Search by External Key

**What changed:** Fuse.js search now includes `externalKey` field with high weight.

### Steps

1. Open Tasks view
2. Type a Linear identifier in the search box (e.g., `ENG-123`)

### Verify

- [ ] Task is found by its Linear identifier
- [ ] Task is also found by its internal slug (if different, e.g., `ENG-123-1`)

---

## Test 8: Task Navigation by External Key

**What changed:** Task detail page and linked task chip now resolve by `externalKey` in addition to `id` and `slug`.

### Steps

1. Navigate to a task detail page using the Linear identifier in the URL (e.g., `/tasks/ENG-123`)

### Verify

- [ ] Task loads correctly
- [ ] Also works with the internal UUID
- [ ] Also works with the internal slug (even if different from externalKey)

---

## Test 9: Open in Workspace — Branch Derivation

**What changed:** Branch names are derived from `getTaskBranchCandidates()` which uses the display ID, and workspace creation checks `existingBranchAliases` for existing workspace matching.

### Steps

1. Open a Linear-synced task (e.g., `ENG-123` with title "Fix login bug")
2. Click "Open in Workspace"

### Verify

- [ ] Branch name is derived from Linear identifier: `eng-123-fix-login-bug`
- [ ] Workspace name shows `ENG-123` (not internal slug)

---

## Test 10: Open in Workspace — Existing Workspace Detection

**What changed:** Workspace creation now checks multiple branch name candidates (externalKey-derived, slug-derived, short-id-derived) to find existing workspaces.

### Steps

1. Open a task and create a workspace (from Test 9)
2. Close/navigate away from the workspace
3. Go back to the task and click "Open in Workspace" again

### Verify

- [ ] Existing workspace is found and opened (not a new one created)
- [ ] Shows "Open ↵" hint in the issues list, not "Create ↵"

---

## Test 11: Open in Workspace — Legacy Branch Detection

**What changed:** `existingBranchAliases` allows matching workspaces created before this PR (which used the old branch naming).

### Steps

1. If you have a workspace created from a task before this PR (using the old slug-based branch name), try opening the same task via "Open in Workspace"

### Verify

- [ ] The existing workspace is found via branch alias matching
- [ ] No duplicate workspace is created

---

## Test 12: MCP — Task Reference Resolution

**What changed:** MCP tools (`get_task`, `update_task`, `delete_task`) now use `resolveTaskReference` which checks `externalKey` in addition to UUID and slug.

### Steps

1. Using MCP, call `get_task` with a Linear identifier (e.g., `ENG-123`)
2. Call `update_task` with the same Linear identifier
3. Call `get_task` with the internal UUID of the same task

### Verify

- [ ] `get_task` resolves the task by Linear identifier
- [ ] `update_task` resolves and updates the task by Linear identifier
- [ ] `get_task` still works with UUID
- [ ] `get_task` still works with internal slug

---

## Test 13: MCP — Create Task with Sync

**What changed:** `create_task` now uses shared `createTasks()` from `@superset/trpc/tasks` which enqueues a Linear sync after creation.

### Steps

1. Call `create_task` via MCP with a title and description
2. Check the task appears in Superset
3. If Linear integration is connected with a team configured for new tasks, check Linear

### Verify

- [ ] Task is created with an auto-generated slug
- [ ] Task appears in the Tasks view
- [ ] If Linear sync is configured, task syncs to Linear and gains an `externalKey`

---

## Test 14: MCP — Delete Task

**What changed:** `delete_task` now uses shared `deleteTasks()` and `resolveTaskReference`.

### Steps

1. Call `delete_task` via MCP with a Linear identifier (e.g., `ENG-123`)

### Verify

- [ ] Task is soft-deleted (no longer appears in Tasks view)
- [ ] Response contains the deleted task ID

---

## Test 15: Batch Run in Workspace

**What changed:** The batch "Run in Workspace" popover now uses `getTaskDisplayId` and `getTaskBranchCandidates`.

### Steps

1. Select multiple Linear-synced tasks in the Tasks table
2. Click "Run in Workspace"
3. Select a project

### Verify

- [ ] Each task shows its Linear identifier in the batch status list
- [ ] Workspaces are created with branch names derived from Linear identifiers
- [ ] Existing workspaces are detected and reused

---

## Test 16: Notification Server — resolvePaneId

**What changed:** `resolvePaneId` was moved from `resolve-pane-id.ts` to `server.ts` (where `appState` is available).

### Steps

1. Start an agent session in a workspace
2. Let it complete (triggers hook notification)

### Verify

- [ ] Agent lifecycle notifications still work (status badge updates, attention indicators)
- [ ] No console errors about `appState` not being initialized
