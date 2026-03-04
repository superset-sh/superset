# MCP Server Tools

Superset MCP server exposing tools for task management and device orchestration.

## Authentication

API key passed via `X-API-Key` header. Key encodes:
- `userId` - who is making the request
- `organizationId` - which org context
- `defaultDeviceId` - default target for device commands (usually caller's own device)

## Device Targeting

Device commands can target **any device in the organization**:
- If `deviceId` not specified, defaults to `defaultDeviceId` from API key
- Any org member can run commands on any org device (permissions can be added later)
- Device must be online (heartbeat within last 60s) to receive commands

## Tool Categories

### Task Tools (Cloud - Immediate Execution)

#### `create_task`
Create a new task in the organization.

```typescript
const createTaskInput = z.object({
  title: z.string().min(1).describe("Task title"),
  description: z.string().optional().describe("Task description (markdown)"),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).default("none").describe("Task priority"),
  assigneeId: z.string().uuid().optional().describe("User ID to assign the task to"),
  statusId: z.string().uuid().optional().describe("Status ID (defaults to first backlog status)"),
  labels: z.array(z.string()).optional().describe("Array of label strings"),
  dueDate: z.string().datetime().optional().describe("Due date in ISO format"),
  estimate: z.number().int().positive().optional().describe("Estimate in points/hours"),
});

const createTaskOutput = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  // ... full task object
});
```

#### `update_task`
Update an existing task.

```typescript
const updateTaskInput = z.object({
  taskId: z.string().describe("Task ID or slug"),
  title: z.string().min(1).optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  assigneeId: z.string().uuid().nullable().optional().describe("New assignee (null to unassign)"),
  statusId: z.string().uuid().optional().describe("New status ID"),
  labels: z.array(z.string()).optional().describe("Replace labels"),
  dueDate: z.string().datetime().nullable().optional().describe("New due date (null to clear)"),
  estimate: z.number().int().positive().nullable().optional(),
});

const updateTaskOutput = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  // ... updated task object
});
```

#### `list_tasks`
List tasks with optional filters.

```typescript
const listTasksInput = z.object({
  statusId: z.string().uuid().optional().describe("Filter by status ID"),
  statusType: z.enum(["backlog", "unstarted", "started", "completed", "canceled"]).optional().describe("Filter by status type"),
  assigneeId: z.string().uuid().optional().describe("Filter by assignee"),
  assignedToMe: z.boolean().optional().describe("Filter to tasks assigned to current user"),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  search: z.string().optional().describe("Search in title/description"),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const listTasksOutput = z.object({
  tasks: z.array(taskSchema),
  total: z.number(),
  hasMore: z.boolean(),
});
```

#### `get_task`
Get a single task by ID or slug.

```typescript
const getTaskInput = z.object({
  taskId: z.string().describe("Task ID (uuid) or slug"),
});

const getTaskOutput = taskSchema; // Full task with relations
```

#### `delete_task`
Soft delete a task.

```typescript
const deleteTaskInput = z.object({
  taskId: z.string().describe("Task ID or slug"),
});

const deleteTaskOutput = z.object({
  success: z.boolean(),
  deletedAt: z.string().datetime(),
});
```

---

### Organization Tools (Cloud - Immediate Execution)

#### `list_members`
List members in the organization.

```typescript
const listMembersInput = z.object({
  search: z.string().optional().describe("Search by name or email"),
  limit: z.number().int().min(1).max(100).default(50),
});

const listMembersOutput = z.object({
  members: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    image: z.string().url().nullable(),
    role: z.enum(["owner", "admin", "member"]),
  })),
});
```

#### `list_task_statuses`
List available task statuses for the organization.

```typescript
const listTaskStatusesInput = z.object({});

const listTaskStatusesOutput = z.object({
  statuses: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    color: z.string(),
    type: z.enum(["backlog", "unstarted", "started", "completed", "canceled"]),
    position: z.number(),
  })),
});
```

---

### Device Tools (Routed to Desktop Executor)

These tools write to `agent_commands` table and poll for results.

#### `list_devices`
List online devices in the organization.

```typescript
const listDevicesInput = z.object({
  includeOffline: z.boolean().default(false).describe("Include recently offline devices"),
});

const listDevicesOutput = z.object({
  devices: z.array(z.object({
    deviceId: z.string(),
    deviceName: z.string(),
    deviceType: z.enum(["desktop", "mobile", "web"]),
    ownerId: z.string().uuid().describe("User who owns this device"),
    ownerName: z.string().describe("Name of device owner"),
    lastSeenAt: z.string().datetime(),
    isOnline: z.boolean(),
  })),
});
```

#### `list_workspaces`
List all workspaces/worktrees on a device.

```typescript
const listWorkspacesInput = z.object({
  deviceId: z.string().optional().describe("Target device (defaults to caller's device)"),
});

const listWorkspacesOutput = z.object({
  workspaces: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    path: z.string(),
    branch: z.string(),
    isActive: z.boolean(),
    repositoryId: z.string().uuid().nullable(),
  })),
});
```

#### `get_current_workspace`
Get the currently active workspace on a device.

```typescript
const getCurrentWorkspaceInput = z.object({
  deviceId: z.string().optional(),
});

const getCurrentWorkspaceOutput = z.object({
  workspace: z.object({
    id: z.string().uuid(),
    name: z.string(),
    path: z.string(),
    branch: z.string(),
    repositoryId: z.string().uuid().nullable(),
    // Additional context
    uncommittedChanges: z.number().int(),
    currentTask: taskSchema.nullable(),
  }).nullable(),
});
```

#### `create_worktree`
Create a new git worktree workspace.

```typescript
const createWorktreeInput = z.object({
  deviceId: z.string().optional(),
  name: z.string().optional().describe("Workspace name (auto-generated if not provided)"),
  branchName: z.string().optional().describe("Branch name (auto-generated if not provided)"),
  baseBranch: z.string().optional().describe("Branch to create from (defaults to main)"),
  taskId: z.string().optional().describe("Task ID to associate with workspace"),
});

const createWorktreeOutput = z.object({
  workspace: z.object({
    id: z.string().uuid(),
    name: z.string(),
    path: z.string(),
    branch: z.string(),
  }),
});
```

#### `switch_workspace`
Switch to a different workspace.

```typescript
const switchWorkspaceInput = z.object({
  deviceId: z.string().optional(),
  workspaceId: z.string().uuid().optional().describe("Workspace ID to switch to"),
  workspaceName: z.string().optional().describe("Workspace name to switch to"),
});

const switchWorkspaceOutput = z.object({
  success: z.boolean(),
  workspace: z.object({
    id: z.string().uuid(),
    name: z.string(),
    path: z.string(),
    branch: z.string(),
  }),
});
```

---

## Shared Schemas

```typescript
const taskSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]),
  status: z.object({
    id: z.string().uuid(),
    name: z.string(),
    color: z.string(),
    type: z.enum(["backlog", "unstarted", "started", "completed", "canceled"]),
  }),
  assignee: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }).nullable(),
  labels: z.array(z.string()),
  estimate: z.number().nullable(),
  dueDate: z.string().datetime().nullable(),
  branch: z.string().nullable(),
  prUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

---

## Implementation Notes

1. **Validation**: All inputs validated with Zod, converted to JSON Schema for MCP
2. **Device routing**: Device tools check `canRunTool(deviceType, toolName)` before routing
3. **Timeouts**: Device commands have 30s default timeout, configurable per-call
4. **Auth**: API key required, encodes user/org/device context
