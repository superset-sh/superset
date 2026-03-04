# GitHub Issues → Tasks Sync

## Overview

One-way sync from GitHub issues into Superset tasks. GitHub issues are mapped directly into the `tasks` table using `externalProvider='github'`, reusing the same external sync infrastructure built for Linear.

## Prior Art

The Linear integration (`apps/api/src/app/api/integrations/linear/webhook/route.ts`) serves as the reference implementation. It handles bidirectional sync with Linear issues via webhooks and the `tasks` table's external sync fields (`externalId`, `externalKey`, `externalUrl`, `lastSyncedAt`).

## Architecture

### Data Flow

```
GitHub Issue Event
    ↓
GitHub Webhook (POST /api/github/webhook)
    ↓
Signature verification + idempotent event storage (webhookEvents)
    ↓
webhooks.on("issues.*") handler
    ↓
processGithubIssueEvent()
    ↓
Upsert into `tasks` table (externalProvider='github')
```

### Initial Sync Flow

```
User installs GitHub App / triggers manual sync
    ↓
QStash job → POST /api/github/jobs/initial-sync
    ↓
For each repo: octokit.rest.issues.listForRepo({ state: 'open' })
    ↓
Filter out PRs (GitHub issues API includes PRs)
    ↓
Map each issue → task via mapGithubIssueToTask()
    ↓
Batch upsert into `tasks` with onConflictDoUpdate
```

## Field Mapping

| GitHub Issue Field | Task Field | Notes |
|---|---|---|
| `issue.id` | `externalId` | GitHub's numeric ID (as string) |
| `#${issue.number}` | `externalKey` | e.g., `#42` |
| `issue.title` | `title` | |
| `issue.body` | `description` | |
| `issue.html_url` | `externalUrl` | |
| `issue.state` | `statusId` | Mapped via `taskStatuses.type` lookup |
| `issue.assignee.login` | `assigneeId` | Matched by email; null if no match |
| `issue.labels[].name` | `labels` | Array of label name strings |
| `"github"` | `externalProvider` | |
| `{repo-name}#{issue.number}` | `slug` | e.g., `superset#42` |

## Status Mapping

Rather than creating GitHub-specific task statuses, issues map to existing org statuses by type:

- `open` → first `taskStatuses` entry with `type='unstarted'`
- `closed` → first `taskStatuses` entry with `type='completed'`

If no matching status type is found, the issue sync is skipped with a warning log.

## Webhook Events Handled

| Event | Action |
|---|---|
| `issues.opened` | Create task |
| `issues.edited` | Update title/description |
| `issues.closed` | Update status to completed |
| `issues.reopened` | Update status to unstarted |
| `issues.assigned` | Update assignee |
| `issues.unassigned` | Clear assignee |
| `issues.labeled` | Update labels |
| `issues.unlabeled` | Update labels |
| `issues.deleted` | Soft-delete task |

## Configuration

The `integrationConnections` table stores a `GithubConfig` in its `config` JSON column:

```typescript
type GithubConfig = {
  provider: "github";
  syncIssues?: boolean; // defaults to true
};
```

Webhook handlers and initial sync check `syncIssues` before processing. This allows orgs to use the GitHub integration for PRs only without syncing issues.

## Idempotency

- Webhook events are stored in `webhookEvents` with `(provider, eventId)` uniqueness before processing
- Task upserts use `onConflictDoUpdate` on `(organizationId, externalProvider, externalId)`
- Duplicate webhook deliveries are safely handled

## Future Considerations

- **Bidirectional sync**: Task changes → GitHub issue updates (create, close, reopen)
- **GitHub login column**: Add `githubLogin` to `users` table for better assignee matching
- **Milestone mapping**: Map GitHub milestones to task groups or projects
- **Comment sync**: Sync issue comments as task comments
- **Closed issue sync**: Optionally sync closed issues during initial sync
