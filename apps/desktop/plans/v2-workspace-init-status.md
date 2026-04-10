# V2 Workspace Creation Status — Design

## Concept

When the user creates a workspace, navigate immediately to a pending workspace page. The host-service streams creation progress via the existing EventBus. The pending page shows live step-by-step progress. On success, transition to the real workspace and dispatch setup commands to a terminal pane. On failure, show the error with a retry button — the full draft is preserved in the pending row.

Multiple workspaces can be creating simultaneously. Each has its own sidebar skeleton, clickable to view progress.

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

    // Status
    status: z.enum(["creating", "failed", "succeeded"]),
    step: z.string().nullable(),       // live progress step from EventBus
    error: z.string().nullable(),      // set when status === "failed"
    workspaceId: z.string().nullable(),// set when status === "succeeded"

    createdAt: persistedDateSchema,
});
```

**Lifecycle:**
1. On submit: insert row with `status: "creating"`
2. EventBus updates: update `step` as progress events arrive
3. On success: set `status: "succeeded"`, `workspaceId: realId`
4. On failure: set `status: "failed"`, `error: message`
5. On navigate to real workspace: delete the pending row
6. On retry (from failed page): reset `status: "creating"`, re-fire create
7. On dismiss: delete the pending row

## Flow

```
User clicks Create
    ↓
Renderer:
  1. Compute names (branch, workspace)
  2. Insert into pendingWorkspaces collection
  3. Subscribe to EventBus for workspace:creating events
  4. Close modal
  5. Navigate to /v2-workspace/pending/$pendingId
  6. Fire workspaceCreation.create (async)
    ↓
Pending workspace page shows:
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
    ↓ success
Pending page navigates to /v2-workspace/$workspaceId
Terminal pane receives initialCommands
    ↓ failure
┌──────────────────────────────────────────┐
│ fix the login bug                        │
│ ⑂ fix-the-login-bug                     │
│                                          │
│ ✗ Failed to create workspace             │
│   Cloud API returned no row              │
│                                          │
│ [Retry]  [Dismiss]                       │
└──────────────────────────────────────────┘
```

## Sidebar behavior

The sidebar renders pending workspaces from the `pendingWorkspaces` collection alongside real workspaces from `v2Workspaces`:

- **Creating:** workspace name + spinner + "Creating..." label
- **Failed:** workspace name + error badge
- **Succeeded:** brief flash, then replaced by the real workspace from collections

All states are clickable — navigate to `/v2-workspace/pending/$id`.

## EventBus: `workspace:creating` event

### Server → Client message

```ts
interface WorkspaceCreatingMessage {
    type: "workspace:creating";
    pendingId: string;
    step: "ensuring_repo" | "creating_worktree" | "registering" | "done" | "failed";
    workspaceId?: string;   // set when step === "done"
    error?: string;         // set when step === "failed"
}
```

Added to `ServerMessage` union in `packages/host-service/src/events/types.ts`.

### Host-service emits during create

The `workspaceCreation.create` mutation receives `pendingId` in its input and emits progress:

```ts
ctx.eventBus.emit({ type: "workspace:creating", pendingId, step: "ensuring_repo" });
// ... clone/resolve ...
ctx.eventBus.emit({ type: "workspace:creating", pendingId, step: "creating_worktree" });
// ... git worktree add ...
ctx.eventBus.emit({ type: "workspace:creating", pendingId, step: "registering" });
// ... cloud API ...
ctx.eventBus.emit({ type: "workspace:creating", pendingId, step: "done", workspaceId });
```

On failure at any step:
```ts
ctx.eventBus.emit({ type: "workspace:creating", pendingId, step: "failed", error: err.message });
```

### EventBus needs access in tRPC context

Add `eventBus: EventBus` to `HostServiceContext`. The app passes it when creating the tRPC context — one-line addition to the context factory.

### Client-side listener

Renderer subscribes before firing create. Updates the `pendingWorkspaces` collection row as events arrive:

```ts
const bus = getEventBus(hostUrl, getWsToken);
bus.on("workspace:creating", pendingId, (id, payload) => {
    if (payload.step === "done") {
        collections.pendingWorkspaces.update(pendingId, {
            status: "succeeded",
            workspaceId: payload.workspaceId,
            step: "done",
        });
    } else if (payload.step === "failed") {
        collections.pendingWorkspaces.update(pendingId, {
            status: "failed",
            error: payload.error,
            step: "failed",
        });
    } else {
        collections.pendingWorkspaces.update(pendingId, {
            step: payload.step,
        });
    }
});
```

## Input schema update

Add `pendingId` to create input:

```ts
workspaceCreation.create({
    pendingId: z.string(),    // renderer-generated UUID for EventBus correlation
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

Reads from `pendingWorkspaces` collection via `useLiveQuery`. Shows:
- Workspace name + branch name
- Step-by-step progress (from `step` field, updated by EventBus listener)
- On `succeeded`: auto-navigate to `/v2-workspace/$workspaceId`
- On `failed`: error message + Retry button + Dismiss button

## Retry flow

From the failed pending page:
1. User clicks Retry
2. Update the pending row: `status: "creating"`, clear `error` and `step`
3. Re-subscribe to EventBus
4. Re-fire `workspaceCreation.create` with the same data from the pending row
5. Same progress flow as initial create

## Replaces

| Old | New |
|-----|-----|
| `pendingWorkspace` in zustand store (single item) | `pendingWorkspaces` local collection (multiple) |
| `stashedDraft` zustand atom | Draft data lives in the pending row itself |
| `setPendingWorkspace` / `clearPendingWorkspace` / `setPendingWorkspaceStatus` | Collection insert / update / delete |
| `restoreStashedDraft` (reopen modal) | Retry from pending page (no modal reopen) |

## Files to change

### EventBus
| File | Change |
|------|--------|
| `packages/host-service/src/events/types.ts` | Add `WorkspaceCreatingMessage` |
| `packages/workspace-client/src/lib/eventBus.ts` | Add `workspace:creating` event type + dispatch |

### Host-service
| File | Change |
|------|--------|
| `packages/host-service/src/types.ts` | Add `eventBus` to `HostServiceContext` |
| `packages/host-service/src/app.ts` | Pass `eventBus` in context factory |
| `.../workspace-creation/workspace-creation.ts` | Accept `pendingId`, emit progress, remove `execSync`, return `initialCommands` |

### Renderer — data
| File | Change |
|------|--------|
| `.../CollectionsProvider/dashboardSidebarLocal/schema.ts` | Add `pendingWorkspaceSchema` |
| `.../CollectionsProvider/collections.ts` | Add `pendingWorkspaces` collection |
| `renderer/stores/new-workspace-modal.ts` | Remove `pendingWorkspace`, `stashedDraft` and related actions (moved to collection) |

### Renderer — UI
| File | Change |
|------|--------|
| **New:** `.../v2-workspace/pending/$pendingId/page.tsx` | Pending workspace progress page |
| `.../PromptGroup/PromptGroup.tsx` | Insert into collection, subscribe EventBus, navigate to pending page |
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
