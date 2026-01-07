# GitHub App Integration Review

## Overall Rating: 6.5/10

**What's good:**
- ✅ Solid database schema with proper indexes
- ✅ Webhook handlers are comprehensive and well-structured
- ✅ Using GitHub App (not OAuth/PAT) - correct architecture choice
- ✅ Initial sync job logic is sound
- ✅ Electric SQL collections configured in desktop app
- ✅ Type-safe webhook event handlers

**What needs work:**
- ❌ Storing unused access tokens
- ❌ Electric SQL not configured to sync GitHub tables
- ❌ No replacement for `gh` CLI queries
- ❌ Missing repository-to-PR lookup logic
- ❌ No UI for connecting the integration

---

## Critical Issues

### 1. **Unnecessary Token Storage** (Priority: Medium)

**Problem:** We're fetching and storing installation access tokens in the database but never using them.

**Location:** `apps/api/src/app/api/integrations/github/callback/route.ts:64-72, 100-104, 114-117`

```typescript
// ❌ Current: Fetching token we don't need
const tokenResult = await octokit.request("POST /app/installations/{installation_id}/access_tokens", {
  installation_id: Number(installationId),
});
// ... storing it in DB
accessToken: token.token,
tokenExpiresAt: token.expires_at ? new Date(token.expires_at) : null,
```

**Why it's wrong:** `githubApp.getInstallationOctokit()` generates fresh tokens on-demand using the app's private key. These tokens expire in 1 hour and we'd need token refresh logic to keep them valid.

**Solution:** Remove token fetching and storage. The schema fields `accessToken`, `tokenExpiresAt`, `refreshToken` can be removed entirely.

**Impact:** Simplifies code, removes unnecessary API call, eliminates token expiry concerns.

---

### 2. **Electric SQL Not Configured for GitHub Tables** (Priority: CRITICAL)

**Problem:** `github_repositories` and `github_pull_requests` tables won't sync to desktop because they're not in the Electric SQL proxy configuration.

**Location:** `apps/api/src/app/api/electric/[...path]/utils.ts:13-18, 41-114`

```typescript
// ❌ Missing cases
export type AllowedTable =
  | "tasks"
  | "repositories"
  | "auth.members"
  | "auth.organizations"
  | "auth.users";
  // Missing: "github_repositories" | "github_pull_requests"

// buildWhereClause() has no cases for GitHub tables
```

**Solution:** Add cases to filter by organization:

```typescript
export type AllowedTable =
  | "tasks"
  | "repositories"
  | "github_repositories"
  | "github_pull_requests"
  | "auth.members"
  | "auth.organizations"
  | "auth.users";

// In buildWhereClause:
case "github_repositories": {
  // Find installations for this org, then filter repos by those installations
  const [installation] = await db
    .select({ id: githubInstallations.id })
    .from(githubInstallations)
    .where(eq(githubInstallations.organizationId, organizationId))
    .limit(1);

  if (!installation) {
    return { fragment: "1 = 0", params: [] };
  }

  return build(githubRepositories, githubRepositories.installationId, installation.id);
}

case "github_pull_requests": {
  // Filter PRs by repos belonging to org's installation
  // More complex - need to join through repositories
  const [installation] = await db
    .select({ id: githubInstallations.id })
    .from(githubInstallations)
    .where(eq(githubInstallations.organizationId, organizationId))
    .limit(1);

  if (!installation) {
    return { fragment: "1 = 0", params: [] };
  }

  const repos = await db
    .select({ id: githubRepositories.id })
    .from(githubRepositories)
    .where(eq(githubRepositories.installationId, installation.id));

  if (repos.length === 0) {
    return { fragment: "1 = 0", params: [] };
  }

  const repoIds = repos.map((r) => r.id);
  const whereExpr = inArray(
    sql`${sql.identifier(githubPullRequests.repositoryId.name)}`,
    repoIds,
  );
  const qb = new QueryBuilder();
  const { sql: query, params } = qb
    .select()
    .from(githubPullRequests)
    .where(whereExpr)
    .toSQL();
  const fragment = query.replace(/^select .* from .* where\s+/i, "");
  return { fragment, params };
}
```

**Impact:** Without this, the desktop app can't access GitHub data at all. Collections will remain empty.

---

### 3. **No Replacement for `gh` CLI Logic** (Priority: CRITICAL)

**Problem:** Desktop app still uses `gh` CLI to fetch PR status via tRPC. We built the GitHub App integration to replace this, but didn't replace the consumer.

**Location:**
- `apps/desktop/src/lib/trpc/routers/workspaces/workspaces.ts:1451-1490` - tRPC procedure
- `apps/desktop/src/lib/trpc/routers/workspaces/utils/github/github.ts:23-72` - CLI implementation

**Current flow:**
```
usePRStatus hook → trpc.workspaces.getGitHubStatus → fetchGitHubPRStatus → gh CLI
```

**Target flow:**
```
usePRStatus hook → Electric SQL query → githubPullRequests collection
```

**Solution:** Replace the tRPC procedure with a hook that queries the Electric SQL collection:

```typescript
// New: apps/desktop/src/renderer/hooks/useWorkspacePR.ts
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { useWorkspace } from "./useWorkspace";

export function useWorkspacePR(workspaceId: string) {
  const { githubPullRequests, githubRepositories } = useCollections();
  const workspace = useWorkspace(workspaceId);

  // Get git remote URL and branch from workspace
  const repoFullName = extractRepoFromRemote(workspace?.gitRemoteUrl);
  const branchName = workspace?.currentBranch;

  // Find repository
  const repo = githubRepositories.rows.find(
    (r) => r.fullName === repoFullName
  );

  // Find PR by repo + branch
  const pr = githubPullRequests.rows.find(
    (pr) => pr.repositoryId === repo?.id && pr.headBranch === branchName
  );

  return { pr, repo, isLoading: !workspace };
}
```

**Challenges:**
1. Need to store `gitRemoteUrl` and `currentBranch` in workspace (local SQLite)
2. Need helper to extract `owner/repo` from git remote URL
3. Need to handle case where workspace's repo isn't connected to GitHub App

---

### 4. **Missing Repository Identification Logic** (Priority: HIGH)

**Problem:** No way to map a workspace's git remote URL to a `githubRepository` record.

**What we have:**
- Workspace has: git directory → can get remote URL
- `githubRepositories` has: `fullName` (e.g., "superset-sh/superset")

**What we need:**
```typescript
function extractRepoFromRemote(remoteUrl: string): string | null {
  // Input: "git@github.com:superset-sh/superset.git"
  // Output: "superset-sh/superset"

  // Input: "https://github.com/superset-sh/superset.git"
  // Output: "superset-sh/superset"

  const sshMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
  const httpsMatch = remoteUrl.match(/github\.com\/(.+?)(?:\.git)?$/);

  return sshMatch?.[1] || httpsMatch?.[1] || null;
}
```

**Location to add:** `apps/desktop/src/lib/git-utils.ts` (or similar)

---

### 5. **Webhook Payload Fields Not Always Available** (Priority: LOW)

**Problem:** Webhook handlers assume `additions`, `deletions`, `changedFiles` exist on all PR webhook events. They don't - only available on individual PR GET requests.

**Location:** `apps/api/src/app/api/integrations/github/webhook/webhooks.ts:115-120`

```typescript
// ❌ These fields don't exist in webhook payloads
additions: pr.additions ?? 0,
deletions: pr.deletions ?? 0,
changedFiles: pr.changed_files ?? 0,
```

**Solution:** Set to 0 in webhooks (they'll be populated by initial sync which uses the full PR endpoint).

**Status:** Already fixed in initial sync (we set to 0), just need to verify webhooks do the same.

---

### 6. **No Periodic Sync Mechanism** (Priority: MEDIUM)

**Problem:** We only sync on initial install. If webhooks fail or get out of sync, data gets stale.

**Solution:** Add a cron job that runs every 5-10 minutes:
```typescript
// apps/api/src/app/api/cron/github-sync/route.ts
export async function GET(request: Request) {
  // Verify cron secret
  if (request.headers.get("Authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find installations that haven't synced in 10+ minutes
  const staleInstallations = await db
    .select()
    .from(githubInstallations)
    .where(
      and(
        eq(githubInstallations.suspended, false),
        // lastSyncedAt < 10 minutes ago
      )
    );

  // Queue sync jobs
  for (const installation of staleInstallations) {
    await qstash.publishJSON({
      url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/github/jobs/sync`,
      body: { installationId: installation.id },
    });
  }

  return Response.json({ synced: staleInstallations.length });
}
```

**Note:** Need to add `lastSyncedAt` to `githubInstallations` table.

---

### 7. **No UI for Managing Integration** (Priority: HIGH)

**Problem:** Users can't connect/disconnect the GitHub App from the UI.

**Needed components:**
1. Settings page at `/settings/integrations`
2. "Connect GitHub" button → redirects to install route
3. Connected state showing:
   - Account name
   - Number of repos synced
   - Last sync time
   - "Disconnect" button
4. Repository selection (enable/disable specific repos)

**Location to create:** `apps/web/src/app/(dashboard)/settings/integrations/github/page.tsx`

---

## Schema Issues

### 8. **Unused Fields in Schema** (Priority: LOW)

**Fields to remove from `githubInstallations`:**
- `accessToken` - Never used (we generate tokens on-demand)
- `tokenExpiresAt` - Never used
- `refreshToken` - GitHub App tokens don't have refresh tokens
- `webhookId` - Not set anywhere
- `webhookSecret` - We use a global webhook secret, not per-installation

**Fields to add:**
- `lastSyncedAt` - For tracking sync freshness

---

## Missing Features

### 9. **No Support for Multiple Installations per Org** (By design)

**Current:** One installation per organization (enforced by unique constraint on `organizationId`)

**Is this correct?** Yes, for most cases. A GitHub App can only be installed once per GitHub account. However, if users have personal repos AND org repos, they'd need separate installations.

**Decision:** Keep current design. Document that users should install to their organization, not personal account.

---

## Testing Gaps

### 10. **No Test Coverage** (Priority: MEDIUM)

**Missing tests:**
- OAuth flow (install → callback → sync)
- Webhook handling (all event types)
- Token generation
- Electric SQL query building
- Repository identification logic

**Recommendation:** Add integration tests for critical flows before deploying.

---

## Summary of Required Changes

### Must Fix Before Deploy:
1. ✅ Add Electric SQL configuration for GitHub tables
2. ✅ Replace `gh` CLI logic with Electric SQL queries
3. ✅ Add repository identification helper
4. ✅ Create UI for connecting/managing integration

### Should Fix Soon:
5. Remove unused token storage
6. Add periodic sync cron job
7. Add comprehensive error handling

### Nice to Have:
8. Add test coverage
9. Add repository enable/disable UI
10. Add sync status indicators

---

## Estimated Effort

- **Critical fixes (1-4):** 4-6 hours
- **Should fix (5-7):** 2-3 hours
- **Nice to have (8-10):** 4-6 hours

**Total:** 10-15 hours to production-ready
