# Usage Examples

## Quick Start

```typescript
import { LowdbAdapter } from "./storage";
import {
  EnvironmentOrchestrator,
  WorkspaceOrchestrator,
  ProcessOrchestrator,
  ChangeOrchestrator
} from "./orchestrators";
import { WorkspaceType, ProcessType, AgentType } from "../types";

// Initialize storage (creates ~/.superset/cli/db.json)
const storage = new LowdbAdapter();

// Create orchestrators
const envOrch = new EnvironmentOrchestrator(storage);
const workspaceOrch = new WorkspaceOrchestrator(storage);
const processOrch = new ProcessOrchestrator(storage);
const changeOrch = new ChangeOrchestrator(storage);
```

## Complete Workflow Example

```typescript
// 1. Create an environment
const environment = await envOrch.create();
console.log("Environment created:", environment.id);

// 2. Create a local workspace
const workspace = await workspaceOrch.create(
  environment.id,
  WorkspaceType.LOCAL,
  "/Users/username/projects/my-app"
);
console.log("Workspace created:", workspace.id);

// 3. Create an agent process
const agent = await processOrch.create(
  ProcessType.AGENT,
  workspace,
  AgentType.CLAUDE
);
console.log("Agent started:", agent.id);

// 4. Create a change record
const change = await changeOrch.create({
  workspaceId: workspace.id,
  summary: "Implemented user authentication feature",
  createdAt: new Date()
});
console.log("Change recorded:", change.id);

// 5. Add file diffs to the change
await storage.set("fileDiffs", "diff-1", {
  id: "diff-1",
  changeId: change.id,
  path: "src/auth/login.ts",
  status: "added",
  additions: 150,
  deletions: 0,
  patch: "@@ -0,0 +1,150 @@\n+export function login() { ... }"
});

// 6. Update the process
await processOrch.update(agent.id, {
  title: "Claude AI Agent - Authentication Work"
});

// 7. List all data
const environments = await envOrch.list();
const workspaces = await workspaceOrch.list(environment.id);
const processes = await processOrch.list(workspace.id);
const changes = await changeOrch.list(workspace.id);

console.log(`Total: ${environments.length} envs, ${workspaces.length} workspaces`);

// 8. Stop the agent
await processOrch.stop(agent.id);
console.log("Agent stopped");

// 9. Cleanup (cascade deletes everything)
await envOrch.delete(environment.id);
console.log("Environment and all child data deleted");
```

## Working with Processes

```typescript
// Create different process types
const terminal = await processOrch.create(ProcessType.TERMINAL, workspace);
const claudeAgent = await processOrch.create(
  ProcessType.AGENT,
  workspace,
  AgentType.CLAUDE
);
const codexAgent = await processOrch.create(
  ProcessType.AGENT,
  workspace,
  AgentType.CODEX
);

// List all processes in workspace
const allProcesses = await processOrch.list(workspace.id);
console.log(`Running ${allProcesses.length} processes`);

// Update agent status
await processOrch.update(claudeAgent.id, {
  status: "running"
});

// Stop a specific process
await processOrch.stop(terminal.id);

// Stop all agents (not terminals)
await processOrch.stopAll();

// Note: terminal won't be stopped by stopAll (only agents are stopped)
// To check if an agent was stopped:
const agent = await processOrch.create(ProcessType.AGENT, workspace, AgentType.CLAUDE);
await processOrch.stopAll();
const stopped = await processOrch.get(agent.id);
console.log("Ended at:", stopped.endedAt); // Date object
```

## Working with Changes and Diffs

```typescript
// Create a change
const change = await changeOrch.create({
  workspaceId: workspace.id,
  summary: "Refactored authentication system",
  createdAt: new Date()
});

// Add multiple file diffs
const diffs = [
  {
    id: "diff-1",
    changeId: change.id,
    path: "src/auth/login.ts",
    status: "modified" as const,
    additions: 20,
    deletions: 15
  },
  {
    id: "diff-2",
    changeId: change.id,
    path: "src/auth/register.ts",
    status: "added" as const,
    additions: 80,
    deletions: 0
  },
  {
    id: "diff-3",
    changeId: change.id,
    path: "src/auth/old-auth.ts",
    status: "deleted" as const,
    additions: 0,
    deletions: 120
  }
];

for (const diff of diffs) {
  await storage.set("fileDiffs", diff.id, diff);
}

// List all changes in workspace
const allChanges = await changeOrch.list(workspace.id);

// Update change summary
await changeOrch.update(change.id, {
  summary: "Refactored and modernized authentication system"
});

// Delete change (cascade deletes all file diffs)
await changeOrch.delete(change.id);
```

## Working with Multiple Environments

```typescript
// Create multiple environments
const devEnv = await envOrch.create();
const prodEnv = await envOrch.create();

// Create workspaces in different environments
const devWorkspace1 = await workspaceOrch.create(
  devEnv.id,
  WorkspaceType.LOCAL,
  "/Users/username/dev/project1"
);

const devWorkspace2 = await workspaceOrch.create(
  devEnv.id,
  WorkspaceType.LOCAL,
  "/Users/username/dev/project2"
);

const prodWorkspace = await workspaceOrch.create(
  prodEnv.id,
  WorkspaceType.CLOUD
);

// List workspaces per environment
const devWorkspaces = await workspaceOrch.list(devEnv.id);
const prodWorkspaces = await workspaceOrch.list(prodEnv.id);

console.log(`Dev: ${devWorkspaces.length}, Prod: ${prodWorkspaces.length}`);

// Delete entire environment (cascade deletes all workspaces and children)
await envOrch.delete(devEnv.id);
```

## Direct Storage Access (Advanced)

For operations not covered by orchestrators:

```typescript
// Read entire database
const db = await storage.read();
console.log("All data:", db);

// Get specific collection
const allProcesses = await storage.getCollection("processes");
Object.entries(allProcesses).forEach(([id, process]) => {
  console.log(`${id}: ${process.title}`);
});

// Check if entity exists
const exists = await storage.has("environments", "env-id");

// Clear all data (useful for testing)
await storage.clear();
```

## Error Handling

```typescript
try {
  // Get non-existent entity
  const env = await envOrch.get("non-existent-id");
} catch (error) {
  console.error(error.message); // "Environment with id non-existent-id not found"
}

try {
  // Update non-existent change
  await changeOrch.update("non-existent-id", { summary: "New summary" });
} catch (error) {
  console.error(error.message); // "Change with id non-existent-id not found"
}
```

## Testing

```typescript
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Create isolated test storage
const tempDir = await mkdtemp(join(tmpdir(), "cli-test-"));
const dbPath = join(tempDir, "test-db.json");
const storage = new LowdbAdapter(dbPath);

// Run tests...

// Cleanup
await rm(tempDir, { recursive: true, force: true });
```

## Migration Example

When you're ready to scale beyond Lowdb:

```typescript
import { StorageAdapter } from "./storage/adapter";
import type { Database } from "./storage/types";

// Implement new adapter
class PostgresAdapter implements StorageAdapter {
  constructor(private connectionString: string) {}

  async get<K extends keyof Database>(
    collection: K,
    id: string
  ): Promise<Database[K][string] | undefined> {
    // Query PostgreSQL
    const result = await this.query(
      `SELECT * FROM ${collection} WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  // ... implement other methods
}

// Switch adapters (no other code changes needed!)
const storage = new PostgresAdapter(process.env.DATABASE_URL);
const envOrch = new EnvironmentOrchestrator(storage);
// Everything works the same!
```
