# Per-Organization PGlite Database Refactor

## Goal
Refactor from single PGlite database to per-organization databases, eliminating the need for `organization_id` filtering in queries. Similar to Linear's architecture.

## Current State
- Single PGlite: `idb://superset`
- All org data in one DB, filtered by `organization_id`
- Active org stored in `local_settings` table within PGlite
- Electric sync filters by org at API proxy level

## Target State
- Registry: `superset_database_registry` (plain IndexedDB - just DB metadata + active org ID)
- Per-org DBs: `idb://superset_{orgId}` (PGlite - all data for that org)
- Queries don't need `organization_id` parameter - implicit from which DB you're in

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Registry (Plain IndexedDB)                  │
│              superset_database_registry                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ databases: [                                        │    │
│  │   { name, orgId, createdAt, schemaVersion }         │    │
│  │ ]                                                   │    │
│  │ settings: { activeOrgId }                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ activeOrgId
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Per-Org DB (PGlite)                       │
│                   idb://superset_{orgId}                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ organizations: org info for this org                │    │
│  │ users: users in this org                            │    │
│  │ organization_members: memberships                   │    │
│  │ tasks: tasks (NO org_id filter needed!)             │    │
│  │ local_settings: org-specific preferences            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Files to Modify

### Core PGlite Layer
- `src/renderer/lib/pglite/database.ts` - Split into registry + org DB factories
- `src/renderer/lib/pglite/sync.ts` - Separate sync for registry vs org data
- `src/renderer/lib/pglite/PGliteProvider.tsx` - Manage both DB lifecycles
- `src/renderer/lib/pglite/hooks.ts` - Remove org_id params from queries
- `src/renderer/lib/pglite/schema/` - Split schemas (registry vs org)

### Migrations
- `src/renderer/lib/pglite/migrations/` - Separate migration sets

### Components
- `src/renderer/screens/main/components/TasksView/TasksView.tsx` - Simplify, remove org passing
- `src/renderer/screens/main/components/TasksView/components/OrganizationSwitcher/` - Trigger DB switch

### Delete
- `src/renderer/contexts/ActiveOrganizationProvider.tsx` - No longer needed

## Implementation Steps

### Step 1: Create Simple Registry (Plain IndexedDB)
Create a lightweight registry using `idb` library or raw IndexedDB:
- `src/renderer/lib/registry.ts` - Simple key-value store
  - `getDatabases()` - List of org DBs
  - `addDatabase(orgId)` - Register a new org DB
  - `getActiveOrgId()` / `setActiveOrgId(id)` - Track active org
- No PGlite, no Electric sync - just local metadata

### Step 2: Refactor PGlite to Per-Org
Update existing PGlite code to be org-scoped:
- `src/renderer/lib/pglite/database.ts` - Factory: `createOrgDatabase(orgId)` → `idb://superset_{orgId}`
- `src/renderer/lib/pglite/sync.ts` - Sync all tables (orgs, users, members, tasks) to org DB
- `src/renderer/lib/pglite/hooks.ts` - Remove org params: `useTasks()`, `useOrganizations()`, `useUsers()`

### Step 3: Update Provider Structure
```tsx
<RegistryProvider>        {/* Reads from plain IndexedDB, provides activeOrgId */}
  <OrgPGliteProvider>     {/* Creates PGlite for activeOrgId, provides DB context */}
    {children}
  </OrgPGliteProvider>
</RegistryProvider>
```

- `RegistryProvider`: Sync reads active org from IndexedDB, handles org switching
- `OrgPGliteProvider`: Creates/manages PGlite instance for the active org

### Step 4: Update Hooks API
Before:
```typescript
useTasks(organizationId: string)
useOrganizations(userId: string)
useActiveOrganizationIdQuery()
```

After:
```typescript
useTasks()           // Reads from active org's PGlite (implicit)
useOrganizations()   // Reads from active org's PGlite
useActiveOrgId()     // Reads from registry (plain IndexedDB)
setActiveOrgId(id)   // Writes to registry, triggers DB switch
```

### Step 5: Handle Org Switching
When `setActiveOrgId(newOrgId)` is called:
1. Write `newOrgId` to registry
2. Close current PGlite instance
3. Open/create `idb://superset_{newOrgId}`
4. Run migrations if needed
5. Start Electric sync for new org
6. React context updates, components re-render with new data

### Step 6: Clean Up Components
- Remove all `organizationId` prop drilling
- Delete `ActiveOrganizationProvider` context
- Simplify `TasksView` - just call `useTasks()`
- Simplify `OrganizationSwitcher` - just call `setActiveOrgId()`

### Step 7: Bootstrap Flow (First Load / No Orgs Yet)
1. App starts, reads registry → no active org
2. Fetch user's orgs from API (`trpc.user.me`)
3. User picks an org (or auto-select first)
4. Create org DB, start sync, set as active
5. Register in registry for next time

## API Changes Needed
None - Electric sync proxy already filters by org. Each per-org PGlite syncs all its data (orgs, users, members, tasks) scoped to that org.

## Decisions
1. **DB caching**: Close immediately when switching orgs (simpler, acceptable delay)
2. **Migration**: Start fresh - delete old `idb://superset`, let Electric re-sync
3. **Org removal**: Delete org DB on next sync if user not in org list

## Future: Per-Org Auth & RLS

Once we implement org-scoped authentication:

**Clerk Setup:**
- Enable Clerk Organizations feature
- Active org stored in session, included in JWT as `org_id` claim
- Switching orgs updates JWT automatically

**API Writes with RLS:**
```typescript
// Current: org passed explicitly
api.tasks.create({ title: "...", organizationId: "..." })

// Future: org implicit from JWT
api.tasks.create({ title: "..." })  // org_id extracted from session
```

**Postgres RLS:**
```sql
-- Set org context from JWT in API middleware
SET app.current_org_id = '<org_id_from_jwt>';

-- RLS policy on tasks table
CREATE POLICY tasks_org_isolation ON tasks
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

This creates full symmetry:
- **Reads (local)**: Implicit from which PGlite DB you're in
- **Writes (API)**: Implicit from JWT org claim + RLS
