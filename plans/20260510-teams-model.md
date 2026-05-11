# Teams as a product feature

Reference for how teams work in Superset — data model, invariants, membership semantics, permissions, lifecycle, and PR sequencing.

## Goal

Teams are a first-class organizational unit *inside* an organization. They serve as:

- **Identifier namespace for tasks** (PR β). Task identifiers become `{teamKey}-{number}`.
- **Linkage anchor for external integrations** (PR γ). Linear teams map 1:1 to our teams.
- **Future ownership scope** for workspaces, devices, and per-team permissions (post-PR γ).

Teams are *not* an access-control mechanism for visibility. Org members see all of their org's content regardless of team membership. team membership signals interest, preference, and grouping — same model as Linear/GitHub/Notion teamspaces.

## Data model

Better-auth's organization plugin owns the team primitive. We extend it via `additionalFields` per PR.

### `auth.teams`

Better-auth defaults: `id`, `name`, `organizationId`, `createdAt`, `updatedAt`. Custom fields added per PR:

| Field | PR | Notes |
|---|---|---|
| `key` text | β | Identifier prefix, e.g. `SUPER`. Unique per org. |
| `lastTaskNumber` integer | β | Atomic counter for per-team task numbering. |
| `externalProvider` integration_provider | β | Linear linkage (added in same PR that adds outbound sync routing through team). |
| `externalId` text | β | Linear team UUID. |
| `externalKey` text | β | Linear team key (denormalized for display). |

No `isDefault` column — Linear doesn't model a default team either, and the only invariant we need is "at least one team exists," which better-auth's `allowRemovingAllTeams: false` already enforces.

### `auth.team_members`

Better-auth defaults: `id`, `teamId`, `userId`, `createdAt`. No custom fields.

## Invariants

1. **Every organization has at least one team.** Enforced via `afterCreateOrganization` hook (creates a team for new orgs) + migration backfill (creates a team for existing orgs). Better-auth's `allowRemovingAllTeams: false` blocks deletion of the last team.
2. **Tasks belong to exactly one team** (PR β). `tasks.team_id` NOT NULL, FK to `auth.teams`.
3. **Team identifier prefix is unique within an org** (PR β). `unique(organizationId, key)` via additionalFields uniqueness.
4. **`team_members` is opt-in.** Org members are auto-added to their org's first team for convenience, but can leave any team freely. Org membership is what grants visibility.
5. **Removing an org member removes all their `team_members` rows in that org.** Enforced via `beforeRemoveMember` hook (no FK cascade because `team_members.userId` references `users`, not `members`).

## Membership semantics

- **Auto-add on org join:** When a user joins an org (signup, invite acceptance, admin add), they're added to that org's first (and initially only) team. Via `afterAddMember` hook.
- **Manual leave/join:** Once multi-team UI ships (PR α), users can join and leave teams freely. No "at least one team" check.
- **Org leave cascade:** When a user is removed from an org, all their `team_members` rows in that org are deleted. Via `beforeRemoveMember` hook.

## Permission model

Inherits better-auth's org-level RBAC. Team management permissions are tied to org role:

- `team:create` — owner + admin (members cannot create teams)
- `team:update` — owner + admin
- `team:delete` — owner + admin

**No per-team roles in PR α/β.** Every `team_members` row is just a membership marker; there is no `team-scoped admin` vs `team-scoped member` distinction. If we ever need delegated team leadership (e.g., "ENG lead can rename ENG and add members without being an org admin"), add a `role` column to `auth.team_members` via better-auth's `additionalFields` and define team-scoped roles via better-auth's permission extension. Strictly additive.

Visibility is org-scoped:

- Task lists show all tasks in the user's org regardless of team membership.
- `team_members` does not gate read access.
- Future team-scoped private teams (à la Notion private teamspaces) would be a deliberate opt-in feature, not the default.

## Lifecycle hooks

| Hook | When | Action |
|---|---|---|
| `afterCreateOrganization` | New org created | Insert first team named after the org |
| `afterAddMember` | User added to org | Insert `team_members` row into the org's first team |
| `beforeRemoveMember` | User removed from org | Delete all `team_members` rows for that user in teams belonging to this org |

No default-team protection hooks. `allowRemovingAllTeams: false` is the only invariant we enforce — any team is deletable except the last one.

`setActiveTeam` is intentionally not used. The complexity of session-level "current team" state isn't worth it until we have a team-scoped UI surface that demands it. In PR β, task creation can default to the user's most-recently-used team via a `member.lastUsedTeamId` (or similar) rather than an active-team primitive.

## Industry context

Similar patterns in shipping products:

- **Linear:** workspace members are in 0+ teams. Org membership grants visibility. Team membership controls notification scope and "My teams" views.
- **GitHub orgs:** members are in 0+ teams. Teams gate repository permissions but not org membership.
- **Notion:** "teamspaces" can be public (auto-add new org members) or private (invite-only). Org members are in 0+ teamspaces.
- **Asana:** team membership is opt-in; tasks are project-scoped and projects belong to teams.

Common shape: team membership is opt-in, additive, and orthogonal to org-level visibility. Our model matches this.

## PR sequencing

### PR α — Teams as a manageable product feature

- Enable `teams: { enabled: true, maximumTeams: 25, allowRemovingAllTeams: false }` in better-auth org plugin.
- Mirror `auth.teams` and `auth.team_members` in our drizzle schema (matching better-auth's CLI-generated nullability spec).
- Migration creates the tables and backfills:
  - One team per existing organization (name = organization name).
  - One `team_members` row per (org member, that org's team) pair.
- `afterCreateOrganization` hook seeds the team for new orgs.
- `afterAddMember` hook seeds team_members for new org members.
- `beforeRemoveMember` hook cleans up team_members on org leave.
- Settings → Teams CRUD UI: list, create, rename, delete. Uses better-auth's team API endpoints.
- No `isDefault`, no active team, no task changes, no Linear changes.

### PR β — Slug refactor + per-team task numbering + per-team Linear linkage

- Add `key`, `lastTaskNumber`, `externalProvider`, `externalId`, `externalKey` to `auth.teams` via `additionalFields`.
- Migration backfills `key` (from `org.slug`, uppercase + sanitized, fallback `TASK`), `lastTaskNumber = 0`, Linear linkage from existing `linearConfig.newTasksTeamId` for orgs that have it set.
- Add `team_id`, `number` to `tasks`. Backfill per-team `number` via `ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at, id)`. Skip Linear-synced tasks (`team_id` and `number` nullable; canonical identifier for those rows stays `external_key`).
- Rewrite `createTask` with atomic `lastTaskNumber + 1` counter, defaulting to the user's most-recently-used team in the org.
- Replace `byIdOrSlug` with `byIdOrKey` resolver: UUID OR `{teamKey}-{number}` OR `external_key` fallback.
- Outbound Linear sync uses `task.team.externalId` instead of `linearConfig.newTasksTeamId`. Inbound webhook routes to the Superset team whose `externalId` matches.
- Integrations UI revamp: replace `newTasksTeamId` picker with per-team Linear linkage (managed in team settings).
- Soft-delete `tasks` + `task_statuses` on Linear disconnect. Webhook UPSERT resets `deletedAt = null` on reconnect.
- Drop slug column in PR β+1 after SDK/CLI consumers roll.

### Future (post-β)

- Workspaces team-scoped: add `team_id` to `v2_workspaces`.
- Devices team-scoped: add `team_id` to relevant device tables.
- Permissions: per-team roles via better-auth permission extension. Defer until concrete use case.
- Active team switcher (`setActiveTeam`-based): add only if user feedback shows people want a persistent "I'm in team X" context. Linear-style sidebar UX.
- Archive (`archivedAt`) on teams: defer indefinitely. Hard delete with `allowRemovingAllTeams: false` is sufficient for most use cases.

## Open questions

- **`maximumTeams` value.** Currently 25 static. Should become async function reading from `subscriptions.plan` once we want plan-tier team caps.
- **Task creation team default.** PR β candidates: `member.lastUsedTeamId` (per-user, updated on every task create), or "first team in user's team_members" (simpler, less personalized). Decide during PR β implementation.
- **Public vs private teams.** Notion-style "private teamspaces" not yet modeled. If we want them, add `isPrivate boolean` and gate visibility for non-members at query time.
