# CLI Persistence Layer

JSON-based persistence module for the Superset CLI using Lowdb with an abstracted storage adapter pattern.

## Architecture

### Storage Adapter Pattern

The persistence layer uses an adapter pattern to abstract the underlying storage mechanism:

```
┌─────────────────────────────────────────┐
│         Orchestrators                    │
│  (EnvironmentOrchestrator, etc.)        │
└─────────────────┬───────────────────────┘
                  │
                  │ Uses
                  ▼
┌─────────────────────────────────────────┐
│       StorageAdapter Interface          │
│  (Generic CRUD operations)              │
└─────────────────┬───────────────────────┘
                  │
                  │ Implements
                  ▼
┌─────────────────────────────────────────┐
│         LowdbAdapter                    │
│  (JSON file persistence)                │
└─────────────────────────────────────────┘
```

This makes it easy to swap Lowdb for a more scalable solution (e.g., PostgreSQL, SQLite) later.

## File Structure

```
src/lib/
├── storage/
│   ├── adapter.ts              # StorageAdapter interface
│   ├── lowdb-adapter.ts        # Lowdb implementation
│   ├── types.ts                # Database schema types
│   ├── config.ts               # Path configuration (~/.superset/cli/)
│   ├── index.ts                # Barrel exports
│   └── __tests__/
│       └── lowdb-adapter.test.ts
└── orchestrators/
    ├── environment-orchestrator.ts
    ├── workspace-orchestrator.ts
    ├── process-orchestrator.ts
    ├── change-orchestrator.ts
    ├── index.ts
    └── __tests__/
        ├── environment-orchestrator.test.ts
        ├── workspace-orchestrator.test.ts
        ├── process-orchestrator.test.ts
        └── change-orchestrator.test.ts
```

## Data Model

All data is stored in a single JSON file at `~/.superset/cli/db.json`:

```typescript
{
  environments: Record<string, Environment>,
  workspaces: Record<string, Workspace>,
  processes: Record<string, Process>,
  changes: Record<string, Change>,
  fileDiffs: Record<string, FileDiff>,
  agentSummaries: Record<string, AgentSummary>
}
```

### Type Relationships

```
Environment (id)
  └── Workspace (environmentId)
      ├── Process (workspaceId)
      │   └── Agent/Terminal
      └── Change (workspaceId)
          ├── FileDiff (changeId)
          └── AgentSummary (agentId)
```

## Features

### Date Serialization

The `LowdbAdapter` automatically handles Date ↔ ISO string conversion:

```typescript
// Write with Date objects
await adapter.set("processes", "id", {
  createdAt: new Date(),
  updatedAt: new Date()
});

// Read returns Date objects
const process = await adapter.get("processes", "id");
process.createdAt instanceof Date // true
```

### Cascade Deletes

All orchestrators implement cascade delete logic:

- **Delete Environment** → Deletes all child Workspaces, Processes, Changes, FileDiffs, AgentSummaries
- **Delete Workspace** → Deletes all child Processes and Changes (+ their FileDiffs/AgentSummaries)
- **Delete Process (Agent)** → Deletes all child AgentSummaries
- **Delete Change** → Deletes all child FileDiffs

### Type Safety

All operations are fully typed using the existing type definitions from `src/types/`:

```typescript
import { LowdbAdapter } from "./lib/storage";
import { EnvironmentOrchestrator } from "./lib/orchestrators";

const adapter = new LowdbAdapter();
const orchestrator = new EnvironmentOrchestrator(adapter);

// Fully typed CRUD operations
const env = await orchestrator.create();
const environments = await orchestrator.list();
await orchestrator.update(env.id, { /* ... */ });
await orchestrator.delete(env.id);
```

## Usage

### Basic Setup

```typescript
import { LowdbAdapter } from "./lib/storage";
import {
  EnvironmentOrchestrator,
  WorkspaceOrchestrator,
  ProcessOrchestrator,
  ChangeOrchestrator
} from "./lib/orchestrators";

// Initialize storage
const storage = new LowdbAdapter(); // Uses ~/.superset/cli/db.json

// Create orchestrators
const environments = new EnvironmentOrchestrator(storage);
const workspaces = new WorkspaceOrchestrator(storage);
const processes = new ProcessOrchestrator(storage);
const changes = new ChangeOrchestrator(storage);
```

### Creating Data

```typescript
// Create environment
const env = await environments.create();

// Create workspace
const workspace = await workspaces.create(
  env.id,
  WorkspaceType.LOCAL,
  "/path/to/workspace"
);

// Create process
const process = await processes.create(
  ProcessType.AGENT,
  workspace,
  AgentType.CLAUDE
);

// Create change
const change = await changes.create({
  workspaceId: workspace.id,
  summary: "Added authentication",
  createdAt: new Date()
});
```

### Querying Data

```typescript
// Get by ID
const env = await environments.get("env-id");

// List all
const allEnvs = await environments.list();

// List filtered
const workspacesInEnv = await workspaces.list(env.id);
const processesInWorkspace = await processes.list(workspace.id);
const changesInWorkspace = await changes.list(workspace.id);
```

### Updating Data

```typescript
await environments.update(env.id, { /* updates */ });
await processes.update(process.id, { title: "New Title" });
await processes.stop(process.id); // Sets endedAt
await processes.stopAll(); // Stops all running agents (not terminals)
```

### Deleting Data

```typescript
// Cascade deletes all child data
await environments.delete(env.id);
await workspaces.delete(workspace.id);
await processes.delete(process.id);
await changes.delete(change.id);
```

## Testing

All components have comprehensive unit tests using Bun test:

```bash
# Run all persistence tests
bun test src/lib/

# Run specific test file
bun test src/lib/storage/__tests__/lowdb-adapter.test.ts
bun test src/lib/orchestrators/__tests__/environment-orchestrator.test.ts
```

Tests use temporary directories and are fully isolated:
- **58 tests** across 5 test files
- **107 expect() calls**
- Full coverage of CRUD operations, cascade deletes, and date serialization

## Configuration

### Custom Storage Path

Override the default storage location with an environment variable:

```bash
export SUPERSET_CLI_DATA_DIR=/custom/path
```

### Test Setup

For tests, pass a custom path to `LowdbAdapter`:

```typescript
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "test-"));
const dbPath = join(tempDir, "test-db.json");
const adapter = new LowdbAdapter(dbPath);
```

## Migration Path

To migrate to a more scalable storage solution:

1. **Create new adapter** implementing `StorageAdapter` interface:
   ```typescript
   class PostgresAdapter implements StorageAdapter {
     async get<K extends keyof Database>(collection: K, id: string) { /* ... */ }
     async set<K extends keyof Database>(collection: K, id: string, value) { /* ... */ }
     // ... implement other methods
   }
   ```

2. **Update instantiation**:
   ```typescript
   // Before
   const storage = new LowdbAdapter();

   // After
   const storage = new PostgresAdapter(connectionString);
   ```

3. **No changes needed** to orchestrators or consumers!

## Performance Considerations

- **Current**: Lowdb reads/writes entire JSON file on each operation
- **Suitable for**: Development, small-scale CLI usage
- **Scale limit**: Thousands of records
- **Future**: Migrate to SQLite or PostgreSQL for production use

## Contributing

When adding new types to persist:

1. Add type definition to `src/types/`
2. Add collection to `Database` schema in `src/lib/storage/types.ts`
3. Create orchestrator in `src/lib/orchestrators/`
4. Implement cascade delete logic if needed
5. Write comprehensive unit tests
