# Task identifiers: `{teamKey}-{number}` over `tasks.slug`

Replace the inconsistent `tasks.slug` column with a stable `{teamKey}-{number}` identifier owned by a team-level counter. Successor plan to `20260501-linear-team-entity.md`, rewritten against the world after PR α (#4403) shipped the teams primitive.

## Already shipped (PR α, merged on `main`)

- `auth.teams` table: `id`, `name`, `slug`, `organizationId`, `createdAt`, `updatedAt`. Unique `(organizationId, slug)`.
- `auth.team_members` table: `id`, `teamId`, `userId`, `organizationId` (denormalized via BEFORE INSERT trigger), `createdAt`. Unique `(teamId, userId)`.
- Lifecycle: `afterCreateOrganization` seeds a default team. `afterAddMember` auto-adds to oldest team. `beforeRemoveMember` cleans memberships. `beforeRemoveTeamMember` blocks orphaning. `beforeDeleteTeam` re-homes orphans into the next-oldest team. `allowRemovingAllTeams: false` keeps ≥1 team per org.
- Backfill: every existing org got a default team (named/slugged after the org). All existing members backfilled into it.
- Settings → Teams UI: list, create, rename, edit slug, member CRUD, leave team, delete team.
- tRPC `team.addMember` / `team.removeMember` for membership mutations.
- Electric collections + `useLiveQuery` for reads.

## Context (the actual problem)

`tasks.slug` is `text NOT NULL` + `unique(organizationId, slug)`. Two writers populate it inconsistently:

- **Local creation** (`packages/trpc/src/router/task/task.ts` via `generateBaseTaskSlug` / `generateUniqueTaskSlug` in `packages/shared/src/task-slug.ts`) → kebab-case-from-title with numeric suffix on collision. Agent-authored titles produce 30+ char nonsense slugs.
- **Linear sync** (`apps/api/.../sync-task/route.ts`, `apps/api/.../initial-sync/utils.ts`, `apps/api/.../webhook/route.ts`) → overwrites with Linear's `issue.identifier` (`ENG-237`).

Same column carries two semantically different things. The hybrid space is unpredictable for users and hard to reference.

## Goal

Tasks get a canonical, human-readable identifier `{teamKey}-{number}` (e.g. `SUPER-103`). Per-team monotonic numbering, allocated atomically. Linear's identifier becomes metadata (`tasks.externalKey`), not the primary handle.

## Non-goals

- Multi-team UI for assigning tasks to teams. Every task gets the org's default team for now; per-task team assignment can come later.
- Team-key rename history with redirecting links. Rename is deferred until a `team_keys` history table is added.
- Auto-mirroring Linear teams 1:1 into our teams.
- Auto-detecting Linear team-key renames (Linear emits no Team webhook events).

---

## Schema additions

### `auth.teams` — extend with key + counter + linkage

```ts
key: text("key").notNull(),                                  // identifier prefix, e.g. "SUPER"
lastTaskNumber: integer("last_task_number").notNull().default(0),
archivedAt: timestamp("archived_at"),

externalProvider: integrationProvider("external_provider"),  // "linear"
externalId: text("external_id"),                             // Linear team UUID
externalKey: text("external_key"),                           // Linear's prefix, e.g. "ENG"
```

Indexes/constraints:

- `unique(organizationId, key)` — our key per org
- `unique(organizationId, externalProvider, externalId)` — at most one mapping to each Linear team per org

**Counter discipline:** `lastTaskNumber` is the source of truth. Never recompute from `MAX(tasks.number)`; hard-deleting the highest task would otherwise silently reuse numbers. The schema enforces this — only allocators ever increment it.

`teams.key` is *our* prefix, `teams.externalKey` is Linear's. Independent: an admin can link our `SUPER` to Linear's `ENG`; tasks render as `SUPER-103` in our UI and `ENG-42` in Linear, with `ENG-42` stored on `tasks.externalKey`.

### `tasks` — add teamId + number, dual-write slug for one release

```ts
teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
number: integer("number").notNull(),
// existing: slug, externalKey
```

Unique `(teamId, number)`. Keep `slug` writable for one release (dual-write), drop in a follow-up once readers are migrated.

## Migration sequence

This is intentionally three small migrations rather than one large flip:

1. **Schema-only.** Add new columns nullable. Add new indexes (but not yet `NOT NULL`).
2. **Backfill.**
   - For each org's default team (shipped in PR α), generate a `key` from the team name — uppercase first 4–5 letters of the slug, dedupe across the org if needed. Set `lastTaskNumber = 0` initially.
   - For each task, assign `teamId = default team for org` and `number = row_number() OVER (PARTITION BY organizationId ORDER BY createdAt)`.
   - Set `teams.lastTaskNumber = MAX(number)` per team (this is the one place the recomputation rule is broken, and it's safe because no concurrent writers exist mid-migration).
   - Then `ALTER TABLE` to make `teamId`/`number`/`key` NOT NULL.
3. **Cutover.** Switch creation paths to allocate from the counter. Linear sync writes `externalKey` instead of `slug`.

## Code surfaces to update

### Allocation

- `packages/shared/src/task-slug.ts` → replace with `packages/shared/src/task-identifier.ts`:
  ```ts
  // Atomic allocation: SELECT … FOR UPDATE + UPDATE lastTaskNumber, return new identifier
  export async function allocateTaskIdentifier(db, teamId): Promise<{ number: number; identifier: string }>
  ```
- Single transaction per allocation. Concurrent task creates serialize on the row lock — acceptable given expected per-team write volume.

### Writers

- `packages/trpc/src/router/task/task.ts` (local create): allocate identifier instead of slug; set `teamId` from active-org default team for now.
- `apps/api/.../sync-task/route.ts`, `apps/api/.../initial-sync/utils.ts`, `apps/api/.../webhook/route.ts` (Linear sync):
  - Look up linked team via `(externalProvider, externalId)` on `teams`.
  - If no linked team → ignore the issue (don't fabricate one).
  - Allocate a local `number` for new issues, store Linear's identifier in `tasks.externalKey`.
  - For updates, match on `externalKey` rather than `slug`.

### Readers

- Anywhere we display `task.slug`, switch to a `task.identifier` derived field (`{team.key}-{task.number}`). Likely a SQL view or a small TS helper called at projection time.
- URLs that today use `slug` (e.g. `/tasks/$slug`) become `/tasks/$identifier`. Keep the `slug` route active for one release with a redirect to the identifier.
- Linear deep-links continue to use `externalKey`.

### UI

- **Team settings (per team):** add a "Key" field. Validated as uppercase ASCII 2–5 chars, unique per org.
- **Integrations → Linear:** dropdown linking each of our teams to a Linear team. Reuse the integration team picker pattern. Persisting writes `externalProvider`, `externalId`, `externalKey` on the team row.
- **Task detail / list:** identifier replaces slug everywhere it surfaces.

## PR sequencing

- **PR β** — Schema migration 1 (additive, nullable), `key` field UI in Team settings, backfill migration 2 (sets defaults, then `NOT NULL`s), no behavior change yet. Tasks still keyed off `slug` at runtime; new columns populated and read-ready.
- **PR γ** — Cutover. Switch all readers/writers to identifier. Drop `slug` writes from Linear sync; store identifier in `externalKey`. Dual-read URLs.
- **PR δ** — Integration linkage UI + filter Linear sync to linked teams only.
- **PR ε** — Drop `tasks.slug` and the redirect.

## Open questions

- **Default team key derivation.** What if two teams in an org would derive the same key (e.g. both start with "PRO")? Suffix with `-2`, fall back to first-N-of-name, or block migration until admin picks. Suggest: derive `key = upper(left(slug, 4))`, append a numeric suffix on collision; admins can rename later. Cheap, deterministic.
- **Per-task team assignment UX.** v1 lands every task in the default team. Eventually users want to move tasks between teams (Linear lets you reassign). Deferred to a follow-up — but model it now (FK on task points to team) so the data shape doesn't change later.
- **Identifier format in URLs.** `SUPER-103` is URL-safe. Lowercase or preserve case? Linear preserves case. Suggest match Linear: `/tasks/SUPER-103`.
