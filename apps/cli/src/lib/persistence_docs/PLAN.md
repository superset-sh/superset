# JSON Persistence Module Implementation Plan

## Architecture Decision

**Hierarchical with single file** - Best of both worlds:
- Single `db.json` for atomic writes and simplicity
- Lowdb collections organized hierarchically: `{ environments: {...}, workspaces: {...}, processes: {...}, changes: {...}, fileDiffs: {...}, agentSummaries: {...} }`
- Data relationships maintained through IDs (environmentId, workspaceId, changeId, etc.)

## File Structure

```
apps/cli/src/
├── lib/
│   ├── storage/
│   │   ├── adapter.ts           # Storage adapter interface (abstraction layer)
│   │   ├── lowdb-adapter.ts     # Lowdb implementation of adapter
│   │   ├── types.ts             # Storage-specific types
│   │   └── config.ts            # Path resolution (~/.superset/cli/db.json)
│   └── orchestrators/
│       ├── change-orchestrator.ts      # Implements ChangeOrchestrator
│       ├── workspace-orchestrator.ts   # Implements WorkspaceOrchestrator
│       ├── process-orchestrator.ts     # Implements ProcessOrchestrator
│       └── environment-orchestrator.ts # Implements EnvironmentOrchestrator
└── lib/storage/__tests__/
    ├── lowdb-adapter.test.ts
    ├── change-orchestrator.test.ts
    ├── workspace-orchestrator.test.ts
    ├── process-orchestrator.test.ts
    └── environment-orchestrator.test.ts
```

## Implementation Steps

1. **Install dependencies** - Add `lowdb` to package.json
2. **Storage adapter layer** - Generic interface with Lowdb implementation
3. **Path utilities** - ~/.superset/cli/ directory creation and management
4. **Orchestrator implementations** - All 4 types with full CRUD
5. **Unit tests** - Comprehensive Bun tests with temp file fixtures
6. **Date serialization** - Handle Date <-> ISO string conversion for JSON

## Key Features

- **Type-safe** - All operations fully typed matching existing Orchestrator interfaces
- **Atomic writes** - Lowdb handles JSON file writes atomically
- **Easy migration path** - Swap `LowdbAdapter` for `PostgresAdapter` later
- **Relationship integrity** - Cascade deletes (e.g., deleting workspace deletes its processes/changes)
- **Test isolation** - Each test uses temporary JSON file, cleaned up after

## Data Schema

```typescript
interface Database {
  environments: Record<string, Environment>;
  workspaces: Record<string, Workspace>;
  processes: Record<string, Process>;
  changes: Record<string, Change>;
  fileDiffs: Record<string, FileDiff>;
  agentSummaries: Record<string, AgentSummary>;
}
```

## Storage Location

- **Path**: `~/.superset/cli/db.json`
- **Auto-create**: Directory structure created on first use
- **Permissions**: User-only read/write

## Migration Strategy

When migrating to a scaled solution (PostgreSQL, SQLite, etc.):

1. Create new adapter implementing `StorageAdapter` interface
2. Update dependency injection in orchestrators
3. Optional: Write migration script to convert JSON → new DB
4. No changes needed to orchestrator consumers

## Type Relationships

```
Environment (id)
  └── Workspace (environmentId)
      ├── Process (workspaceId)
      │   └── Agent/Terminal
      └── Change (workspaceId)
          ├── FileDiff (changeId)
          └── AgentSummary (agentId)
```

## Cascade Delete Rules

- **Delete Environment** → Delete all child Workspaces, Processes, Changes, FileDiffs, AgentSummaries
- **Delete Workspace** → Delete all child Processes and Changes (+ their FileDiffs/AgentSummaries)
- **Delete Process (Agent)** → Delete all child AgentSummaries
- **Delete Change** → Delete all child FileDiffs
