# Type-Safe IPC in Electron

This guide explains how to use type-safe IPC (Inter-Process Communication) in the Superset desktop application.

## Overview

The type-safe IPC system ensures that:
- ✅ **Compile-time type checking** - TypeScript catches incorrect channel names and payloads
- ✅ **Autocomplete** - Your IDE suggests available channels and their parameters
- ✅ **Refactor-safe** - Renaming types updates all usages automatically
- ✅ **Self-documenting** - Types serve as inline documentation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     shared/ipc-channels.ts                    │
│                  (Single source of truth)                     │
│  • Define all IPC channels                                    │
│  • Define request/response types                              │
└─────────────────────────────────────────────────────────────┘
                    ▲                        ▲
                    │                        │
        ┌───────────┴──────────┐  ┌─────────┴──────────┐
        │   preload/index.ts   │  │  main/lib/*.ts     │
        │  (Type-safe wrapper) │  │  (IPC handlers)    │
        └───────────┬──────────┘  └────────────────────┘
                    │
        ┌───────────▼──────────┐
        │   renderer/**/*.tsx  │
        │  (React components)  │
        └──────────────────────┘
```

## How to Use

### 1. Define Your IPC Channel

Add your channel definition to `src/shared/ipc-channels.ts`:

```typescript
export interface IpcChannels {
  // Add your channel here
  "my-channel-name": {
    request: { userId: string; data: string };  // Input type
    response: { success: boolean; result: any }; // Output type
  };

  // For channels with no input, use void
  "get-all-users": {
    request: void;
    response: User[];
  };
}
```

### 2. Implement the Handler (Main Process)

In your IPC handler file (e.g., `src/main/lib/workspace-ipcs.ts`):

```typescript
import type { CreateWorktreeInput } from "shared/types";

// ✅ CORRECT: Accept object parameter
ipcMain.handle("worktree-create", async (_event, input: CreateWorktreeInput) => {
  return await workspaceManager.createWorktree(input);
});

// ❌ WRONG: Don't use positional parameters
ipcMain.handle("worktree-create", async (_event, workspaceId, branch, createBranch) => {
  // This won't match the typed renderer calls!
});
```

**Important:** Always accept **object parameters** (not positional), matching your type definition.

### 3. Call from Renderer (Type-Safe!)

In your React component:

```typescript
// ✅ Type-safe - TypeScript knows the input and output types
const result = await window.ipcRenderer.invoke("worktree-create", {
  workspaceId: currentWorkspace.id,
  branch: branchName.trim(),
  createBranch: true,
});

// TypeScript knows `result` has type: IpcResponse<Worktree>
if (result.success) {
  console.log("Created worktree:", result.data);
}

// ❌ TypeScript error - wrong parameter name
const result = await window.ipcRenderer.invoke("worktree-create", {
  wrongId: "123",  // Type error: workspaceId is required
});

// ❌ TypeScript error - channel name typo
const result = await window.ipcRenderer.invoke("worktree-crate", { ... });
//                                              ^^^^^^^^^^ Type error!
```

## Examples

### Example 1: Creating a Worktree (with request payload)

```typescript
// Renderer side
const result = await window.ipcRenderer.invoke("worktree-create", {
  workspaceId: workspace.id,
  branch: "feature-branch",
  createBranch: true,
});

// TypeScript knows:
// - result.success is boolean
// - result.data is Worktree | undefined
// - result.error is string | undefined
```

### Example 2: Listing Workspaces (no request payload)

```typescript
// Renderer side
const workspaces = await window.ipcRenderer.invoke("workspace-list");

// TypeScript knows: workspaces is Workspace[]
```

### Example 3: Getting a Workspace by ID (primitive request)

```typescript
// Renderer side
const workspace = await window.ipcRenderer.invoke("workspace-get", workspaceId);

// TypeScript knows: workspace is Workspace | null
```

## Migration Guide

### Before (Untyped)

```typescript
const result = (await window.ipcRenderer.invoke("worktree-create", {
  currentWorkspaceId: currentWorkspace.id,  // ❌ Typo: should be workspaceId
  branch: branchName.trim(),
  createBranch: true,
})) as { success: boolean; error?: string };  // ❌ Manual type assertion
```

**Problems:**
- Typo in `currentWorkspaceId` (should be `workspaceId`) - no error until runtime!
- Manual type assertion required
- No autocomplete
- Easy to break when refactoring

### After (Type-Safe)

```typescript
const result = await window.ipcRenderer.invoke("worktree-create", {
  workspaceId: currentWorkspace.id,  // ✅ Correct - TypeScript enforces this
  branch: branchName.trim(),
  createBranch: true,
});
```

**Benefits:**
- TypeScript error if you use `currentWorkspaceId` instead of `workspaceId`
- No manual type assertion needed
- Full autocomplete
- Refactor-safe

## Available Channels

See `src/shared/ipc-channels.ts` for the complete list of available channels.

### Workspace Operations
- `workspace-list` - Get all workspaces
- `workspace-get` - Get workspace by ID
- `workspace-create` - Create new workspace
- `workspace-update` - Update workspace
- `workspace-delete` - Delete workspace
- `workspace-get-last-opened` - Get last opened workspace
- `workspace-scan-worktrees` - Scan and import git worktrees
- `workspace-get-active-selection` - Get active selection
- `workspace-set-active-selection` - Set active selection

### Worktree Operations
- `worktree-create` - Create new worktree

### Tab Group Operations
- `tab-group-create` - Create new tab group
- `tab-group-reorder` - Reorder tab groups

### Tab Operations
- `tab-create` - Create new tab
- `tab-reorder` - Reorder tabs
- `tab-move-to-group` - Move tab to another group

## Adding New Channels

To add a new IPC channel:

1. **Define the channel** in `src/shared/ipc-channels.ts`
2. **Implement the handler** in `src/main/lib/workspace-ipcs.ts` (or relevant file)
3. **Use it** in your renderer components with full type safety

### Example: Adding a new channel

```typescript
// 1. Define in src/shared/ipc-channels.ts
export interface IpcChannels {
  "user-get-profile": {
    request: string; // user ID
    response: { name: string; email: string } | null;
  };
}

// 2. Implement handler in main process
ipcMain.handle("user-get-profile", async (_event, userId: string) => {
  return await userService.getProfile(userId);
});

// 3. Use in renderer
const profile = await window.ipcRenderer.invoke("user-get-profile", userId);
// TypeScript knows: profile is { name: string; email: string } | null
```

## Benefits Over Untyped IPC

| Feature | Untyped IPC | Type-Safe IPC |
|---------|-------------|---------------|
| Type checking | ❌ Runtime only | ✅ Compile-time |
| Autocomplete | ❌ No | ✅ Yes |
| Refactoring | ❌ Manual search | ✅ Automatic |
| Documentation | ❌ External docs | ✅ Types are docs |
| Error detection | ❌ At runtime | ✅ Before build |
| Parameter validation | ❌ Manual | ✅ TypeScript |

## Troubleshooting

### Error: "Argument of type 'X' is not assignable to parameter of type 'keyof IpcChannels'"

**Solution:** Add the channel to `src/shared/ipc-channels.ts`.

### Error: "Property 'X' is missing in type..."

**Solution:** Ensure your request object includes all required fields defined in the channel's request type.

### Error: "Expected 1 arguments, but got 2"

**Solution:** For channels with `request: void`, don't pass any arguments:

```typescript
// ❌ Wrong
await window.ipcRenderer.invoke("workspace-list", undefined);

// ✅ Correct
await window.ipcRenderer.invoke("workspace-list");
```

### Error: IPC calls work but functionality fails silently

**Symptom:** Type checking passes, but operations like reordering don't work.

**Cause:** Handler expects object parameters but receives positional parameters (or vice versa).

**Solution:** Ensure handlers accept **object parameters** matching the type definition:

```typescript
// ❌ WRONG: Positional parameters
ipcMain.handle("tab-reorder", async (_event, workspaceId, worktreeId, tabGroupId, tabIds) => {
  // Renderer sends: { workspaceId, worktreeId, tabGroupId, tabIds }
  // Handler receives: workspaceId = { workspaceId, worktreeId, ... }
  // Result: worktreeId, tabGroupId, tabIds are undefined!
});

// ✅ CORRECT: Object parameter
ipcMain.handle("tab-reorder", async (_event, input: { workspaceId, worktreeId, tabGroupId, tabIds }) => {
  return await workspaceManager.reorderTabs(
    input.workspaceId,
    input.worktreeId,
    input.tabGroupId,
    input.tabIds,
  );
});
```

## Best Practices

1. **Always define types in shared/ipc-channels.ts first** before implementing handlers
2. **Use object parameters, not positional** - Handlers must accept a single object parameter that matches the request type
3. **Use descriptive channel names** with kebab-case (e.g., `workspace-create`, not `ws-c`)
4. **Keep request/response types simple** - use types from `shared/types.ts`
5. **Document complex channels** with JSDoc comments in the interface
6. **Use IpcResponse wrapper** for operations that can fail:
   ```typescript
   response: IpcResponse<Workspace>; // { success, data?, error? }
   ```
7. **Test after adding channels** - Verify the handler receives the correct parameters

## Future Improvements

Potential enhancements to the type-safe IPC system:

- [ ] Add runtime validation using Zod schemas
- [ ] Generate API documentation from types
- [ ] Add typed events (not just invoke/handle)
- [ ] Create code generation tool for boilerplate
- [ ] Add request/response logging in dev mode

---

**Questions?** Check the implementation in:
- `src/shared/ipc-channels.ts` - Type definitions
- `src/preload/index.ts` - Type-safe wrapper
- `src/renderer/screens/main/components/Sidebar/Sidebar.tsx` - Usage example
