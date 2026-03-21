# GitHub Issues Sync PR Plan

## Goal

Ship one-way GitHub Issues -> Superset Tasks sync.

Scope:

- per-repo opt-in
- initial import of recent issues
- webhook-driven updates
- no outbound GitHub sync
- no GitHub-specific statuses

## Product Rules

- Sync is off by default for all repos.
- Enabling sync imports recent issues for that repo.
- PRs returned by the issues API must be skipped.
- Imported tasks use:
  - `externalProvider = "github"`
  - `externalId = GitHub issue id`
  - `externalKey = #<issue number>`
  - `externalUrl = issue URL`
- Use shared task statuses, not GitHub-owned statuses.
- GitHub is the source of truth for synced fields.
- This PR is inbound-only. No two-way GitHub sync.

## Must Decide Before Merge

1. Local edit behavior:
   - allow edits and let GitHub overwrite later
   - or treat synced fields as effectively read-only in the UI
2. Initial import window:
   - keep current bounded window
   - or change it intentionally

## Locked Decisions

- Do not create GitHub-specific statuses in this PR.
- Do not add two-way GitHub sync in this PR.
- On GitHub disconnect:
  - delete GitHub-imported tasks
  - delete the installation/connection
  - do not seed statuses
  - do not remap statuses

## Current PR Problems

1. Status mapping is too narrow.
   - The current code only looks at statuses where `externalProvider` is null.
   - That works only if the org still has default local statuses.
   - It breaks orgs that already migrated to Linear-backed statuses, because
     Linear sync can delete those default statuses.
   - Result: GitHub issue import and webhooks can silently no-op even when sync
     is enabled.
2. Outbound task sync is too broad.
   - Updating a GitHub-imported task can queue Linear sync.
   - That can create unintended Linear issues.
3. Disconnect semantics are undefined.
4. Coverage is missing for the risky mixed-provider cases.

## Required Implementation

### 1. Status Resolution

- Resolve statuses by generic type, not by `externalProvider IS NULL` only.
- GitHub issue state mapping for this PR:
  - open issue -> `unstarted`
  - closed issue -> `completed`
- Resolution rule for each needed type:
  - prefer a non-external status of that type
  - otherwise fall back to the first status of that type by `position`,
    regardless of provider
- Share this logic between initial sync and webhooks.
- If no status of the required type exists at all, log and skip.

Files:

- `apps/api/src/app/api/github/lib/issue-sync.ts`

### 2. Outbound Sync Isolation

- Make task sync provider-aware.
- Rules:
  - local task: may sync to providers that support local-task creation
  - Linear task: sync to Linear only
  - GitHub task: do not queue outbound sync in this PR
- Put this rule in one helper, not scattered branching.

Files:

- `packages/trpc/src/lib/integrations/sync/tasks.ts`
- `packages/trpc/src/router/task/task.ts` if needed

### 3. Initial Sync And Webhooks

- Keep PR sync and issue sync logically separate.
- Keep issue mapping and upsert logic shared.
- Webhooks should:
  - ignore repos not opted in
  - ignore PR-shaped issue events
  - upsert on issue lifecycle changes
  - soft-delete on issue deleted

Files:

- `apps/api/src/app/api/github/jobs/initial-sync/route.ts`
- `apps/api/src/app/api/github/webhook/webhooks.ts`
- `apps/api/src/app/api/github/lib/issue-sync.ts`

### 4. Disconnect Behavior

- Delete GitHub-imported tasks on disconnect.
- Delete the installation/connection.
- Do not seed default statuses.
- Do not remap task statuses.

Files:

- `packages/trpc/src/router/integration/github/github.ts`

### 5. Keep The Existing Data Model

- Keep `github_repositories.issue_sync_enabled`
- Keep imported task identity in the shared `tasks` table
- Do not add GitHub-specific task tables in this PR

Files:

- `packages/db/src/schema/github.ts`
- `packages/db/drizzle/0029_add_issue_sync_enabled_to_github_repos.sql`

## Validation

- migration applies cleanly
- enabling sync imports recent issues
- PRs do not create tasks through the issues path
- close and reopen map correctly to task completion state
- matched assignees resolve to org members when possible
- unmatched assignees keep external snapshot fields
- orgs with only default local statuses import GitHub issues correctly
- orgs with Linear connected still import GitHub issues correctly
- editing a GitHub-backed task does not create a Linear issue
- disabling sync stops webhook-driven updates
- disconnect deletes GitHub-imported tasks only
- disconnect does not reseed or remap statuses

## Files In Scope

- `packages/db/src/schema/github.ts`
- `packages/db/drizzle/0029_add_issue_sync_enabled_to_github_repos.sql`
- `packages/trpc/src/router/integration/github/github.ts`
- `apps/web/src/app/(dashboard)/integrations/github/components/RepositoryList/RepositoryList.tsx`
- `apps/api/src/app/api/github/jobs/initial-sync/route.ts`
- `apps/api/src/app/api/github/webhook/webhooks.ts`
- `apps/api/src/app/api/github/lib/issue-sync.ts`
- `packages/trpc/src/lib/integrations/sync/tasks.ts`
- `packages/trpc/src/router/task/task.ts`

## Merge Bar

Do not merge as complete until:

1. mixed GitHub + Linear orgs work
2. GitHub-backed tasks cannot create Linear issues
3. disconnect behavior is explicit
4. focused regression coverage exists
