# TanStack DB + Electric Migration Plan

## Current Architecture Summary

**Data Layer:**
- **Cloud:** PostgreSQL (Neon) via Drizzle ORM
- **Desktop Local:** SQLite (`~/.superset/local.db`) via Drizzle ORM
- **Desktop Browser:** PGlite (IndexedDB per org) with Electric SQL sync
- **Sync:** Electric SQL bidirectional sync (Cloud PostgreSQL ↔ Browser PGlite)
- **State:** Zustand for UI state, direct PGlite queries for data

**Current Desktop Data Flow:**
```
Cloud PostgreSQL → Electric Sync → PGlite (idb://superset_{orgId})
                                        ↓
                                   Drizzle ORM
                                        ↓
                                 useLiveDrizzle()
                                        ↓
                                   React Components
```

## Target Architecture

**New Data Flow:**
```
Cloud PostgreSQL → Electric Shapes → TanStack DB Collections
                                           ↓
                                    useLiveQuery()
                                           ↓
                                    React Components
```

**Key Changes:**
1. ❌ Remove PGlite (no need for client-side Postgres)
2. ❌ Remove direct Drizzle queries in renderer
3. ✅ Add `@tanstack/react-db` + `@tanstack/electric-db-collection`
4. ✅ Electric Shapes instead of full database replication
5. ✅ TanStack DB collections replace PGlite queries
6. ✅ Keep tRPC for mutations (write path)
7. ✅ Keep Zustand for UI state only

---

## Migration Steps

### Phase 1: Install Dependencies

```bash
# Remove
bun remove @electric-sql/pglite @electric-sql/pglite-sync

# Add
bun add @tanstack/react-db @tanstack/electric-db-collection @tanstack/db
bun add idb-keyval  # For local storage examples
```

### Phase 2: Create Collection Definitions

**File:** `apps/desktop/src/renderer/collections/index.ts`

```typescript
import { createCollection, Collection } from '@tanstack/react-db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { localStorageCollectionOptions } from '@tanstack/local-storage-db-collection';

// Types (from existing schema)
import type { Task, Organization, User, Repository } from '@superset/db/schema';

// ============================================
// ELECTRIC COLLECTIONS (Synced per-org)
// ============================================

export const createOrgCollections = ({
  orgId,
  electricUrl,
  apiUrl,
}: {
  orgId: string;
  electricUrl: string;
  apiUrl: string;
}) => {
  // Tasks Collection
  const tasks = createCollection(
    electricCollectionOptions<Task>({
      id: `tasks-${orgId}`,
      shapeOptions: {
        url: electricUrl,
        params: {
          table: 'tasks',
          where: `organization_id = '${orgId}'`,
        },
      },
      getKey: (item) => item.id,

      // Write operations via tRPC
      onInsert: async ({ transaction }) => {
        const item = transaction.mutations[0].modified;
        const response = await fetch(`${apiUrl}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        const { txid } = await response.json();
        return { txid };
      },

      onUpdate: async ({ transaction }) => {
        const { original, modified } = transaction.mutations[0];
        const response = await fetch(`${apiUrl}/tasks/${original.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modified),
        });
        const { txid } = await response.json();
        return { txid };
      },

      onDelete: async ({ transaction }) => {
        const item = transaction.mutations[0].original;
        const response = await fetch(`${apiUrl}/tasks/${item.id}`, {
          method: 'DELETE',
        });
        const { txid } = await response.json();
        return { txid };
      },
    })
  );

  // Repositories Collection
  const repositories = createCollection(
    electricCollectionOptions<Repository>({
      id: `repositories-${orgId}`,
      shapeOptions: {
        url: electricUrl,
        params: {
          table: 'repositories',
          where: `organization_id = '${orgId}'`,
        },
      },
      getKey: (item) => item.id,

      onInsert: async ({ transaction }) => {
        const item = transaction.mutations[0].modified;
        const response = await fetch(`${apiUrl}/repositories`, {
          method: 'POST',
          body: JSON.stringify(item),
        });
        const { txid } = await response.json();
        return { txid };
      },

      onUpdate: async ({ transaction }) => {
        const { original, modified } = transaction.mutations[0];
        const response = await fetch(`${apiUrl}/repositories/${original.id}`, {
          method: 'PATCH',
          body: JSON.stringify(modified),
        });
        const { txid } = await response.json();
        return { txid };
      },
    })
  );

  // Users Collection (read-only, filtered by org membership)
  const users = createCollection(
    electricCollectionOptions<User>({
      id: `users-${orgId}`,
      shapeOptions: {
        url: electricUrl,
        params: {
          table: 'organization_members',
          where: `organization_id = '${orgId}'`,
        },
      },
      getKey: (item) => item.userId,
    })
  );

  return {
    tasks,
    repositories,
    users,
  };
};

// ============================================
// USER COLLECTIONS (Synced per-user, cross-org)
// ============================================

export const createUserCollections = ({
  userId,
  electricUrl,
  apiUrl,
}: {
  userId: string;
  electricUrl: string;
  apiUrl: string;
}) => {
  // User Settings (synced across all devices)
  const userSettings = createCollection(
    electricCollectionOptions<UserSetting>({
      id: `user-settings-${userId}`,
      shapeOptions: {
        url: electricUrl,
        params: {
          table: 'user_settings',
          where: `user_id = '${userId}'`,
        },
      },
      getKey: (item) => item.id,

      onInsert: async ({ transaction }) => {
        const item = transaction.mutations[0].modified;
        const response = await fetch(`${apiUrl}/user-settings`, {
          method: 'POST',
          body: JSON.stringify(item),
        });
        const { txid } = await response.json();
        return { txid };
      },

      onUpdate: async ({ transaction }) => {
        const { original, modified } = transaction.mutations[0];
        const response = await fetch(`${apiUrl}/user-settings/${original.id}`, {
          method: 'PATCH',
          body: JSON.stringify(modified),
        });
        const { txid } = await response.json();
        return { txid };
      },
    })
  );

  return {
    userSettings,
  };
};

// ============================================
// DEVICE COLLECTIONS (LocalStorage)
// ============================================

export interface DeviceSetting {
  key: string;
  value: any;
}

export const createDeviceCollections = () => {
  // Device Settings (never synced - this machine only)
  const deviceSettings = createCollection(
    localStorageCollectionOptions<DeviceSetting>({
      id: 'device-settings',
      getKey: (item) => item.key,
      storage: localStorage,
    })
  );

  return {
    deviceSettings,
  };
};

// ============================================
// TYPES
// ============================================

export interface UserSetting {
  id: string;
  userId: string;
  key: string;
  value: any;
  createdAt: Date;
  updatedAt: Date;
}

export type OrgCollections = ReturnType<typeof createOrgCollections>;
export type UserCollections = ReturnType<typeof createUserCollections>;
export type DeviceCollections = ReturnType<typeof createDeviceCollections>;
```

### Phase 3: Replace PGliteProvider with TanStackDbProvider

**File:** `apps/desktop/src/renderer/providers/TanStackDbProvider.tsx`

```typescript
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createOrgCollections,
  createUserCollections,
  createDeviceCollections,
  type OrgCollections,
  type UserCollections,
  type DeviceCollections,
} from '@/collections';
import { trpc } from '@/lib/trpc';

interface TanStackDbContextValue {
  // Current context
  userId: string;
  organizationId: string | null;

  // Collections
  orgCollections: OrgCollections | null;
  userCollections: UserCollections;
  deviceCollections: DeviceCollections;

  // Actions
  switchOrganization: (orgId: string) => void;

  // Status
  isInitializing: boolean;
  error: Error | null;
}

const TanStackDbContext = createContext<TanStackDbContextValue | null>(null);

// Query client for TanStack DB (required even though we're using Electric)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60, // 1 hour
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export function TanStackDbProvider({
  children,
  userId,
  initialOrganizationId,
}: {
  children: ReactNode;
  userId: string;
  initialOrganizationId?: string;
}) {
  const [organizationId, setOrganizationId] = useState<string | null>(
    initialOrganizationId ?? null
  );
  const [orgCollections, setOrgCollections] = useState<OrgCollections | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Get Electric URL from environment
  const electricUrl = import.meta.env.VITE_ELECTRIC_URL || 'http://localhost:3000/v1/shape';
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // Device collections (created once, never change)
  const deviceCollections = useMemo(() => createDeviceCollections(), []);

  // User collections (created once per user, don't change with org)
  const userCollections = useMemo(
    () =>
      createUserCollections({
        userId,
        electricUrl,
        apiUrl,
      }),
    [userId, electricUrl, apiUrl]
  );

  // Create org collections when org changes
  const switchOrganization = useCallback(
    (newOrgId: string) => {
      console.log('[TanStackDB] Switching to organization:', newOrgId);

      try {
        // Create new collections for this org
        const newCollections = createOrgCollections({
          orgId: newOrgId,
          electricUrl,
          apiUrl,
        });

        setOrgCollections(newCollections);
        setOrganizationId(newOrgId);
        setError(null);

        // Persist active org to localStorage
        localStorage.setItem('superset_active_organization_id', newOrgId);
      } catch (err) {
        console.error('[TanStackDB] Failed to switch organization:', err);
        setError(err as Error);
      }
    },
    [electricUrl, apiUrl]
  );

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Load stored org ID or use initial
        const storedOrgId = localStorage.getItem('superset_active_organization_id');
        const targetOrgId = storedOrgId || initialOrganizationId;

        if (targetOrgId) {
          switchOrganization(targetOrgId);
        }
      } catch (err) {
        console.error('[TanStackDB] Initialization failed:', err);
        setError(err as Error);
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, [initialOrganizationId, switchOrganization]);

  const value: TanStackDbContextValue = {
    userId,
    organizationId,
    orgCollections,
    userCollections,
    deviceCollections,
    switchOrganization,
    isInitializing,
    error,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TanStackDbContext.Provider value={value}>
        {children}
      </TanStackDbContext.Provider>
    </QueryClientProvider>
  );
}

export const useTanStackDb = () => {
  const context = useContext(TanStackDbContext);
  if (!context) {
    throw new Error('useTanStackDb must be used within TanStackDbProvider');
  }
  return context;
};

// Convenience hooks
export const useOrgCollections = () => {
  const { orgCollections } = useTanStackDb();
  if (!orgCollections) {
    throw new Error('No organization selected');
  }
  return orgCollections;
};

export const useUserCollections = () => {
  const { userCollections } = useTanStackDb();
  return userCollections;
};

export const useDeviceCollections = () => {
  const { deviceCollections } = useTanStackDb();
  return deviceCollections;
};
```

### Phase 4: Update App Entry Point

**File:** `apps/desktop/src/renderer/App.tsx`

```diff
- import { PGliteProvider } from './providers/PGliteProvider';
+ import { TanStackDbProvider } from './providers/TanStackDbProvider';
  import { AuthProvider } from './providers/AuthProvider';

  export function App() {
    return (
      <AuthProvider>
-       <PGliteProvider>
+       {({ userId }) => (
+         <TanStackDbProvider
+           userId={userId}
+           initialOrganizationId={organizations[0]?.id}
+         >
            <Router />
+         </TanStackDbProvider>
+       )}
-       </PGliteProvider>
      </AuthProvider>
    );
  }
```

### Phase 5: Migrate Components

**Before (PGlite):**

```typescript
// apps/desktop/src/renderer/components/TaskList.tsx
import { useDb } from '@/providers/PGliteProvider';
import { useLiveDrizzle } from '@electric-sql/pglite-react';

export function TaskList() {
  const db = useDb();

  // Direct Drizzle query
  const { rows: tasks } = useLiveDrizzle(
    db.query.tasks.findMany({
      where: (tasks, { eq }) => eq(tasks.organizationId, currentOrgId),
      orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
    })
  );

  return (
    <div>
      {tasks.map(task => (
        <TaskItem key={task.id} task={task} />
      ))}
    </div>
  );
}
```

**After (TanStack DB):**

```typescript
// apps/desktop/src/renderer/components/TaskList.tsx
import { useLiveQuery } from '@tanstack/react-db';
import { useOrgCollections } from '@/providers/TanStackDbProvider';
import { eq, desc } from '@tanstack/db';

export function TaskList() {
  const { tasks } = useOrgCollections();

  // TanStack DB live query
  const { data: taskList = [], isLoading } = useLiveQuery((q) =>
    q
      .from({ task: tasks })
      .orderBy(({ task }) => desc(task.createdAt))
      .select(({ task }) => task)
  );

  const handleCreateTask = (title: string) => {
    // Optimistic insert - UI updates instantly
    tasks.insert({
      id: crypto.randomUUID(),
      title,
      status: 'pending',
      organizationId: currentOrgId,
      createdAt: new Date(),
    });
    // onInsert handler fires automatically → API → Electric sync
  };

  const handleUpdateTask = (taskId: string, changes: Partial<Task>) => {
    tasks.update(taskId, (draft) => {
      Object.assign(draft, changes);
    });
    // onUpdate handler fires automatically
  };

  const handleDeleteTask = (taskId: string) => {
    tasks.delete(taskId);
    // onDelete handler fires automatically
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      {taskList.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          onUpdate={(changes) => handleUpdateTask(task.id, changes)}
          onDelete={() => handleDeleteTask(task.id)}
        />
      ))}
      <button onClick={() => handleCreateTask('New task')}>
        Add Task
      </button>
    </div>
  );
}
```

### Phase 6: Settings Migration Example

**Before (SQLite + Zustand):**

```typescript
// Settings stored in SQLite
const { data: settings } = trpc.settings.get.useQuery();
const updateSettings = trpc.settings.update.useMutation();

// UI state in Zustand
const { theme, setTheme } = useAppState();
```

**After (Multi-Level Settings):**

```typescript
// hooks/useSettings.ts
import { useLiveQuery } from '@tanstack/react-db';
import { useDeviceCollections, useUserCollections, useOrgCollections } from '@/providers/TanStackDbProvider';

export const useSettings = () => {
  const { deviceSettings } = useDeviceCollections();
  const { userSettings } = useUserCollections();
  const { orgSettings } = useOrgCollections();

  // Get setting with precedence: org > user > device > default
  const getSetting = <T,>(key: string, defaultValue: T): T => {
    const { data: deviceData } = useLiveQuery((q) =>
      q.from({ s: deviceSettings }).where(({ s }) => eq(s.key, key))
    );

    const { data: userData } = useLiveQuery((q) =>
      q.from({ s: userSettings }).where(({ s }) => eq(s.key, key))
    );

    const { data: orgData } = useLiveQuery((q) =>
      q.from({ s: orgSettings }).where(({ s }) => eq(s.key, key))
    );

    return (
      orgData?.[0]?.value ??
      userData?.[0]?.value ??
      deviceData?.[0]?.value ??
      defaultValue
    );
  };

  const setDeviceSetting = (key: string, value: any) => {
    const existing = deviceSettings.getAll().find(s => s.key === key);
    if (existing) {
      deviceSettings.update(key, (draft) => { draft.value = value; });
    } else {
      deviceSettings.insert({ key, value });
    }
  };

  const setUserSetting = (key: string, value: any) => {
    const existing = userSettings.getAll().find(s => s.key === key);
    if (existing) {
      userSettings.update(existing.id, (draft) => { draft.value = value; });
    } else {
      userSettings.insert({
        id: crypto.randomUUID(),
        userId: currentUserId,
        key,
        value,
      });
    }
  };

  return {
    getSetting,
    setDeviceSetting,
    setUserSetting,
  };
};

// Usage in components
function SettingsPanel() {
  const { getSetting, setDeviceSetting, setUserSetting } = useSettings();

  const theme = getSetting('theme', 'light'); // Device-only
  const notifications = getSetting('notifications', true); // User-level

  return (
    <div>
      <select
        value={theme}
        onChange={(e) => setDeviceSetting('theme', e.target.value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>

      <input
        type="checkbox"
        checked={notifications}
        onChange={(e) => setUserSetting('notifications', e.target.checked)}
      />
    </div>
  );
}
```

### Phase 7: Database Schema Updates

Add new tables to cloud PostgreSQL:

```sql
-- packages/db/src/schema/schema.ts

-- User settings (synced across devices)
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, key)
);

CREATE INDEX idx_user_settings_user ON user_settings(user_id);

-- Org settings (shared across org)
CREATE TABLE org_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, key)
);

CREATE INDEX idx_org_settings_org ON org_settings(organization_id);
```

### Phase 8: tRPC Mutation Updates

Update tRPC routes to return `txid` for Electric sync matching:

```typescript
// packages/trpc/src/routers/tasks.ts
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { tasks } from '@superset/db/schema';
import { sql } from 'drizzle-orm';

export const tasksRouter = router({
  create: publicProcedure
    .input(z.object({
      title: z.string(),
      organizationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Use transaction to get txid
      const result = await ctx.db.transaction(async (tx) => {
        // Insert task
        const [task] = await tx.insert(tasks).values({
          id: crypto.randomUUID(),
          title: input.title,
          organizationId: input.organizationId,
          status: 'pending',
          createdAt: new Date(),
        }).returning();

        // Get transaction ID (CRITICAL: same transaction!)
        const [{ txid }] = await tx.execute(
          sql`SELECT pg_current_xact_id()::xid::text as txid`
        );

        return { task, txid: parseInt(txid, 10) };
      });

      return result;
    }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      status: z.enum(['pending', 'in_progress', 'completed']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const result = await ctx.db.transaction(async (tx) => {
        const [task] = await tx
          .update(tasks)
          .set(updates)
          .where(eq(tasks.id, id))
          .returning();

        const [{ txid }] = await tx.execute(
          sql`SELECT pg_current_xact_id()::xid::text as txid`
        );

        return { task, txid: parseInt(txid, 10) };
      });

      return result;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        await tx.delete(tasks).where(eq(tasks.id, input.id));

        const [{ txid }] = await tx.execute(
          sql`SELECT pg_current_xact_id()::xid::text as txid`
        );

        return { txid: parseInt(txid, 10) };
      });

      return result;
    }),
});
```

---

## Migration Checklist

### Remove
- [ ] `@electric-sql/pglite`
- [ ] `@electric-sql/pglite-sync`
- [ ] `@electric-sql/pglite-react`
- [ ] `apps/desktop/src/renderer/providers/PGliteProvider.tsx`
- [ ] Direct Drizzle queries in renderer components
- [ ] SQLite settings table (migrate to user_settings/org_settings)

### Add
- [ ] `@tanstack/react-db`
- [ ] `@tanstack/electric-db-collection`
- [ ] `@tanstack/local-storage-db-collection`
- [ ] `idb-keyval` (for future cache if needed)
- [ ] `apps/desktop/src/renderer/collections/index.ts`
- [ ] `apps/desktop/src/renderer/providers/TanStackDbProvider.tsx`

### Update
- [ ] All components using `useLiveDrizzle` → `useLiveQuery`
- [ ] All components using `useDb()` → `useOrgCollections()`
- [ ] tRPC mutations to return `{ txid }` from Postgres
- [ ] Database schema to add `user_settings` and `org_settings` tables
- [ ] Organization switching logic to use TanStack DB collections

### Keep Unchanged
- [ ] tRPC setup (still used for mutations)
- [ ] Zustand stores for UI state (app-state, tabs, sidebar)
- [ ] Cloud PostgreSQL schema (add new tables, keep existing)
- [ ] Electric SQL server (same sync engine)
- [ ] Authentication flow (Clerk/OAuth)

---

## Benefits After Migration

1. **Simpler Architecture**
   - No need for client-side Postgres (PGlite)
   - No Drizzle ORM in renderer
   - Unified data access via collections

2. **Better Performance**
   - Electric shapes are faster than full DB replication
   - Sub-millisecond live queries via differential dataflow
   - Less memory (no PGlite WASM runtime)

3. **Improved DX**
   - Type-safe collections
   - Automatic optimistic updates
   - Built-in rollback on errors
   - Mix synced + local collections easily

4. **Multi-Level Settings**
   - Device settings (localStorage)
   - User settings (synced across devices)
   - Org settings (shared across team)

5. **Less Code**
   - Remove PGlite setup/teardown logic
   - Remove manual DB initialization
   - Simpler org switching (just create new collections)

---

## Example: Full Feature Implementation

**Creating a task with all layers:**

```typescript
// Component
function TaskForm() {
  const { tasks } = useOrgCollections();
  const [title, setTitle] = useState('');

  const handleSubmit = () => {
    // 1. Optimistic insert (instant UI update)
    tasks.insert({
      id: crypto.randomUUID(),
      title,
      status: 'pending',
      organizationId: currentOrgId,
      createdAt: new Date(),
    });

    // 2. onInsert handler fires automatically
    // 3. POST /api/tasks → tRPC → Postgres
    // 4. Postgres returns { txid: 12345 }
    // 5. Electric detects change via WAL
    // 6. Electric streams { txid: 12345, ...data }
    // 7. TanStack DB matches txid → replaces optimistic with server data
    // 8. UI stays consistent (no flicker)

    setTitle('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="submit">Create Task</button>
    </form>
  );
}
```

The entire sync flow is automatic - no manual cache management!
