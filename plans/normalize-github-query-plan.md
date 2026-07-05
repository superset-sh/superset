# Plan: Shared GitHub Query Normalization for PRs and Issues

> Unify URL parsing, `#N` shorthand, bare number detection, and cross-repo validation into a shared normalizer used by both `searchPullRequests` and `searchGitHubIssues`.

## Current State

### PRs (`searchPullRequests`)
- **Done**: `normalizePullRequestQuery` in `normalize-pull-request-query.ts` handles URL paste, `#N`, bare numbers, cross-repo validation. Direct lookup via `octokit.pulls.get()`. Text search without `in:title`. 36 tests.

### Issues (`searchGitHubIssues`)
- **Missing**: No URL parsing, no `#N` shorthand, no bare number direct lookup, no debounce handling on client, no cross-repo validation.
- Uses `in:title,body` for text search (fine, keep this).
- Lists open issues with `octokit.issues.listForRepo()` when no query (fine, keep this).

## Shared vs Different

The URL structure is the only real difference:
- PR:    `github.com/:owner/:repo/pull/:number`
- Issue: `github.com/:owner/:repo/issues/:number`

Everything else is identical: `#N` stripping, bare number detection, cross-repo owner/repo comparison, `NormalizedQuery` shape.

## Plan

### Step 1: Generalize normalizer → `normalize-github-query.ts`

Rename `normalize-pull-request-query.ts` → `normalize-github-query.ts`. Make it handle both PR and issue URLs with a `kind` parameter.

```typescript
type GitHubEntityKind = "pull" | "issue";

// Matches both /pull/123 and /issues/123 — the `kind` param controls which path to accept
const GITHUB_URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)(?:[/?#].*)?$/i;

export function normalizeGitHubQuery(
  raw: string,
  repo: { owner: string; name: string },
  kind: GitHubEntityKind,
): NormalizedQuery {
  if (!raw) return { query: "", repoMismatch: false, isDirectLookup: false };

  // Full GitHub URL — accept both /pull/ and /issues/ URLs
  const urlMatch = raw.match(GITHUB_URL_RE);
  if (urlMatch) {
    const urlOwner = urlMatch[1] as string;
    const urlRepo = urlMatch[2] as string;
    const urlKind = urlMatch[3] as string; // "pull" or "issues"
    const number = urlMatch[4] as string;

    // Map URL path to kind: "pull" → "pull", "issues" → "issue"
    const urlEntityKind = urlKind === "pull" ? "pull" : "issue";

    // Wrong entity type (e.g. issue URL pasted in PR search)
    if (urlEntityKind !== kind) {
      return { query: raw, repoMismatch: false, isDirectLookup: false };
    }

    const isSameRepo =
      urlOwner.toLowerCase() === repo.owner.toLowerCase() &&
      urlRepo.toLowerCase() === repo.name.toLowerCase();
    return {
      query: isSameRepo ? number : "",
      repoMismatch: !isSameRepo,
      isDirectLookup: isSameRepo,
    };
  }

  // `#123` shorthand
  if (/^#\d+$/.test(raw)) {
    return { query: raw.slice(1), repoMismatch: false, isDirectLookup: true };
  }

  // Bare number
  if (/^\d+$/.test(raw)) {
    return { query: raw, repoMismatch: false, isDirectLookup: true };
  }

  return { query: raw, repoMismatch: false, isDirectLookup: false };
}
```

Key behavior: if you paste an issue URL into the PR search (or vice versa), it falls through to plain text search rather than blocking or extracting the number for the wrong entity type.

### Step 2: Update `searchPullRequests` procedure

Replace import:
```diff
-import { normalizePullRequestQuery } from "./normalize-pull-request-query";
+import { normalizeGitHubQuery } from "./normalize-github-query";
```

Replace call:
```diff
-const normalized = normalizePullRequestQuery(raw, repo);
+const normalized = normalizeGitHubQuery(raw, repo, "pull");
```

No other changes to this procedure.

### Step 3: Update `searchGitHubIssues` procedure

Wire in the same normalizer + direct lookup:

```typescript
const raw = input.query?.trim() ?? "";
const normalized = normalizeGitHubQuery(raw, repo, "issue");

if (normalized.repoMismatch) {
  return { issues: [], repoMismatch: `${repo.owner}/${repo.name}` };
}

const effectiveQuery = normalized.query;

// Direct lookup by issue number
if (normalized.isDirectLookup) {
  const issueNumber = Number.parseInt(effectiveQuery, 10);
  const { data: issue } = await octokit.issues.get({
    owner: repo.owner,
    repo: repo.name,
    issue_number: issueNumber,
  });
  // issues.get returns PRs too — filter them out
  if (issue.pull_request) {
    return { issues: [] };
  }
  return {
    issues: [{
      issueNumber: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state,
      authorLogin: issue.user?.login ?? null,
    }],
  };
}

// Text search (keep existing `in:title,body`)
if (effectiveQuery) {
  const q = `repo:${repo.owner}/${repo.name} is:issue is:open ${effectiveQuery}`;
  // ... existing search logic
}

// No query — list open issues (keep existing)
```

Note: `octokit.issues.get()` can return PRs (GitHub treats PRs as issues). Filter with `issue.pull_request` check.

Also remove `in:title,body` from the text search query — same rationale as PRs. GitHub search without `in:` qualifiers searches title + body by default, so `in:title,body` is redundant.

### Step 4: Update `GitHubIssueLinkCommand` client

Same pattern as `PRLinkCommand`:
- Add `isPendingDebounce` handling
- Read `repoMismatch` from response
- Update empty state messages

```diff
+const trimmedQuery = searchQuery.trim();
+const debouncedTrimmed = debouncedQuery.trim();
+const isPendingDebounce = trimmedQuery !== debouncedTrimmed;

 // ... useQuery uses debouncedTrimmed

+const repoMismatch = data && "repoMismatch" in data ? data.repoMismatch : null;
+const isLoading = debouncedTrimmed || trimmedQuery
+  ? isFetching || isPendingDebounce
+  : isFetching;

 // ... CommandEmpty:
-{isLoading ? "Loading issues..." : "No open issues found."}
+{isLoading
+  ? debouncedTrimmed ? "Searching..." : "Loading issues..."
+  : repoMismatch
+    ? `Issue URL must match ${repoMismatch}.`
+    : debouncedTrimmed
+      ? "No issues found."
+      : "No open issues found."}
```

### Step 5: Update tests

Rename test file to `normalize-github-query.test.ts`. Expand to cover:
- All existing PR URL test cases, updated to pass `kind: "pull"`
- New issue URL test cases (`/issues/123`, `/issues/123?q=1`, cross-repo)
- Cross-entity: PR URL in issue search → plain text fallback
- Cross-entity: issue URL in PR search → plain text fallback
- `#N` and bare number cases for both kinds (same behavior)

### Step 6: Delete old file

Remove `normalize-pull-request-query.ts` and `normalize-pull-request-query.test.ts`.

## Files

| File | Action |
|------|--------|
| `normalize-github-query.ts` | **Create** — generalized normalizer with `kind` param |
| `normalize-github-query.test.ts` | **Create** — expanded tests for both PR and issue URLs |
| `workspace-creation.ts` | **Edit** — wire normalizer into both `searchPullRequests` + `searchGitHubIssues` |
| `normalize-pull-request-query.ts` | **Delete** |
| `normalize-pull-request-query.test.ts` | **Delete** |
| `GitHubIssueLinkCommand.tsx` (V2 client) | **Edit** — add debounce + repoMismatch handling |
