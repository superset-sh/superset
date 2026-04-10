# V2 Workspace Creation Status — Design

## Concept

When the user creates a workspace, navigate immediately to a pending workspace page. The host-service writes progress to an in-memory map that the pending page polls for step-by-step detail. The create promise runs independently of component lifecycle (fire-and-forget from PromptGroup) and updates the `pendingWorkspaces` collection on resolve/reject.

Multiple workspaces can be creating simultaneously. Each has its own sidebar skeleton, clickable to view progress.

## Ownership

Three actors, each with a clear responsibility:

1. **PromptGroup** (fires create, owns the promise): inserts pending row into collection, fires `void createWorkspace(...)`, updates collection to `succeeded`/`failed` when the promise resolves/rejects. Runs independently of component lifecycle — the async closure keeps running after the modal unmounts. Only touches the collection (not React state), so no stale-component issues.

2. **Sidebar** (always visible): reads `pendingWorkspaces` via `useLiveQuery`. Shows skeleton + status. Clickable. Does not poll — just reacts to collection changes.

3. **Pending page** (optional progress viewer): polls `workspaceCreation.getProgress({ pendingId })` every 500ms for step-by-step detail. Only runs while the page is mounted. If user navigates away, polling stops but create continues. On `succeeded`, auto-navigates to real workspace.

## Data model: `pendingWorkspaces` local collection

Backed by `localStorageCollectionOptions` from `@tanstack/react-db`, same as `v2SidebarProjects`, `v2WorkspaceLocalState`, etc. Persists to localStorage, survives app restart.

```ts
export const pendingWorkspaceSchema = z.object({
    // Identity
    id: z.string().uuid(),             // renderer-generated, NOT the eventual workspace ID
    projectId: z.string().uuid(),

    // Draft data (preserved for retry on failure)
    name: z.string(),                  // resolved workspace display name
    branchName: z.string(),            // resolved branch name
    prompt: z.string(),
    compareBaseBranch: z.string().nullable(),
    runSetupScript: z.boolean(),
    linkedIssues: z.array(z.unknown()),
    linkedPR: z.unknown().nullable(),
    hostTarget: z.unknown(),           // WorkspaceHostTarget

    // Status (updated by PromptGroup's create promise)
    status: z.enum(["creating", "failed", "succeeded"]),
    error: z.string().nullable(),      // set when status === "failed"
    workspaceId: z.string().nullable(),// set when status === "succeeded"

    createdAt: persistedDateSchema,
});
```

**Lifecycle:**
1. On submit: insert row with `status: "creating"`
2. Promise resolves: set `status: "succeeded"`, `workspaceId: realId`
3. Promise rejects: set `status: "failed"`, `error: message`
4. On navigate to real workspace: delete the pending row
5. On retry (from failed page): reset `status: "creating"`, re-fire create
6. On dismiss: delete the pending row

## Progress polling

### Host-service: in-memory progress map

```ts
// Module-level (not persisted, not in DB)
const createProgress = new Map<string, { step: string }>();
```

The create mutation writes its current step as it progresses:

```ts
createProgress.set(input.pendingId, { step: "ensuring_repo" });
// ... clone/resolve ...
createProgress.set(input.pendingId, { step: "creating_worktree" });
// ... git worktree add ...
createProgress.set(input.pendingId, { step: "registering" });
// ... cloud API ...
createProgress.delete(input.pendingId); // done — tRPC response carries the result
```

### Host-service: query endpoint

```ts
workspaceCreation.getProgress({ pendingId })
// → { step: "creating_worktree" } | null (not found / already done)
```

### Pending page: polls with react-query

```ts
const { data: progress } = useQuery({
    queryKey: ["workspaceCreation", "getProgress", pendingId],
    queryFn: () => client.workspaceCreation.getProgress.query({ pendingId }),
    refetchInterval: 500,
    enabled: pendingWorkspace?.status === "creating",
});
```

~10 small queries over 5 seconds. Polling stops when status changes to `succeeded` or `failed` (detected via `useLiveQuery` on the collection).

## Flow

```
User clicks Create
    ↓
PromptGroup:
  1. Compute names (branch, workspace)
  2. Insert into pendingWorkspaces collection (status: "creating")
  3. Store attachments in IndexedDB
  4. Close modal
  5. Navigate to /v2-workspace/pending/$pendingId
  6. Fire void createWorkspace(...) — runs independently
    ↓
Pending page mounts, starts polling:
┌──────────────────────────────────────────┐
│ fix the login bug                        │
│ ⑂ fix-the-login-bug                     │
│                                          │
│ Creating workspace...                    │
│ ├─ Ensuring local repository      ✓     │
│ ├─ Creating worktree              ✓     │
│ ├─ Registering workspace          ●     │
│                                          │
└──────────────────────────────────────────┘
    ↓
PromptGroup's create promise resolves:
  → Updates collection: status: "succeeded", workspaceId: realId
    ↓
Pending page detects succeeded (via useLiveQuery):
  → Stops polling
  → Navigates to /v2-workspace/$workspaceId
  → Dispatches initialCommands to terminal pane
    ↓
Normal workspace UI (setup running in terminal)
```

**On failure:**
```
PromptGroup's create promise rejects:
  → Updates collection: status: "failed", error: message
    ↓
Pending page detects failed (via useLiveQuery):
  → Stops polling
  → Shows error + Retry + Dismiss
```

**If user navigates away from pending page:**
- Polling stops (component unmounts)
- Create promise still runs (it's a closure, not tied to React lifecycle)
- Collection still gets updated on resolve/reject
- Sidebar skeleton still reflects current status
- User can click skeleton to return to pending page

## Sidebar behavior

The sidebar renders pending workspaces from the `pendingWorkspaces` collection alongside real workspaces from `v2Workspaces`:

- **Creating:** workspace name + spinner + "Creating..." label
- **Failed:** workspace name + error badge
- **Succeeded:** brief flash, then replaced by the real workspace from collections

All states are clickable — navigate to `/v2-workspace/pending/$id`.

## Input schema update

Add `pendingId` to create input:

```ts
workspaceCreation.create({
    pendingId: z.string(),    // renderer-generated UUID for progress polling correlation
    projectId: z.string(),
    names: { ... },
    composer: { ... },
    linkedContext: { ... },
})
```

## Return shape update

Add `initialCommands`:

```ts
{
    workspace: { id, branch, ... },
    initialCommands: string[] | null,
    warnings: string[],
}
```

Host-service reads setup config, returns commands, does not execute them. Renderer dispatches to terminal pane.

## Pending workspace route

**Route:** `/v2-workspace/pending/$pendingId`

- Reads pending workspace from `pendingWorkspaces` collection via `useLiveQuery`
- Polls `workspaceCreation.getProgress` for step detail while `status === "creating"`
- Shows workspace name + branch name + step progress
- On `succeeded` (detected via collection): auto-navigate to `/v2-workspace/$workspaceId`
- On `failed` (detected via collection): error message + Retry + Dismiss

## Retry flow

From the failed pending page:
1. User clicks Retry
2. Update the pending row: `status: "creating"`, clear `error`
3. Re-fire `createWorkspace` with the same data from the pending row + attachments from IndexedDB
4. Same polling + collection-update flow as initial create

## Replaces

| Old | New |
|-----|-----|
| `pendingWorkspace` in zustand store (single item) | `pendingWorkspaces` local collection (multiple) |
| `stashedDraft` zustand atom | Draft data lives in the pending row itself |
| `setPendingWorkspace` / `clearPendingWorkspace` / `setPendingWorkspaceStatus` | Collection insert / update / delete |
| `restoreStashedDraft` (reopen modal) | Retry from pending page (no modal reopen) |

## Files to change

### Host-service
| File | Change |
|------|--------|
| `.../workspace-creation/workspace-creation.ts` | Accept `pendingId`, write to in-memory progress map, add `getProgress` query, remove `execSync`, return `initialCommands` |

### Renderer — data
| File | Change |
|------|--------|
| `.../CollectionsProvider/dashboardSidebarLocal/schema.ts` | Add `pendingWorkspaceSchema` |
| `.../CollectionsProvider/collections.ts` | Add `pendingWorkspaces` collection |
| `renderer/stores/new-workspace-modal.ts` | Remove `pendingWorkspace`, `stashedDraft` and related actions (moved to collection) |
| **New:** `renderer/lib/pending-attachment-store.ts` | IndexedDB wrapper for attachment blobs |

### Renderer — UI
| File | Change |
|------|--------|
| **New:** `.../v2-workspace/pending/$pendingId/page.tsx` | Pending workspace progress page (polls getProgress, navigates on success) |
| `.../PromptGroup/PromptGroup.tsx` | Insert into collection, store attachments in IndexedDB, fire-and-forget create, update collection on resolve/reject |
| `.../DashboardSidebar/...` | Query `pendingWorkspaces` collection, render skeletons |

## Attachments: IndexedDB blob storage

Attachments (images, PDFs, markdown files) can't go in the localStorage-backed collection — they're too large. Store raw blobs in IndexedDB alongside the pending workspace metadata.

### Storage pattern

```ts
// Key scheme: "pending-attachments/${pendingId}/${index}-${filename}"

// On import (user adds file in modal):
const blob = await fetch(blobUrl).then(r => r.blob());
await idb.put("pending-attachments", {
    blob,
    mediaType: file.mediaType,
    filename: file.filename,
}, `${pendingId}/${index}-${file.filename}`);

// On submit:
// Read blobs from IndexedDB → convert to data URLs → send in API payload

// On retry:
// Read same blobs → convert again

// On success or dismiss:
// Delete all entries matching pendingId prefix
```

### No compression

Images and PDFs are already compressed — gzipping saves 0-2%. IndexedDB has no practical size limit. These blobs are ephemeral (seconds to minutes). Not worth the CPU cost.

### Pending workspace row stores metadata only

The `pendingWorkspaces` collection row holds attachment metadata (not data):

```ts
attachments: z.array(z.object({
    filename: z.string(),
    mediaType: z.string(),
    size: z.number(),
})).default([]),
```

The actual blobs are in IndexedDB, keyed by `pendingId`.

### Files

| File | Change |
|------|--------|
| **New:** `renderer/lib/pending-attachment-store.ts` | IndexedDB wrapper: `storeAttachments(pendingId, files)`, `loadAttachments(pendingId)`, `clearAttachments(pendingId)` |
| `.../PromptGroup/PromptGroup.tsx` | Store attachments to IndexedDB on submit, load on retry |

## Not in scope

- Attachment compression (not needed — IndexedDB has no size limit, most files already compressed)
- Agent launch (Phase 2)
- AI workspace rename (dropped)
- Streaming setup output (setup runs in terminal pane — user sees it live)

## TODO: cleanup

- **Clean up module-level `createProgress` Map.** Entries are deleted on create completion, but if the process crashes mid-create or the promise is abandoned, stale entries leak. Add a TTL sweep (e.g. delete entries older than 5 minutes on each `getProgress` call) or use a `WeakRef`-based approach. Not urgent — the map holds tiny objects and the host-service restarts clear it.
