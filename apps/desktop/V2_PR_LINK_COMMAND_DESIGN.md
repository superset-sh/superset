# V2 PRLinkCommand — Design Doc

> Porting V1's GitHub PR URL paste + cross-repo validation into the V2 workspace creation modal.

## Context

V2's `PRLinkCommand` uses the host-service `searchPullRequests` endpoint for text-based PR search. V1 additionally supports pasting full GitHub PR URLs and validates them against the selected project's repo. This is a frontend-only change — no backend work needed.

### File References

| | Path |
|---|---|
| **V1 PRLinkCommand** | `src/renderer/components/NewWorkspaceModal/components/PromptGroup/components/PRLinkCommand/PRLinkCommand.tsx` |
| **V2 PRLinkCommand** | `src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/components/PRLinkCommand/PRLinkCommand.tsx` |
| **V2 PromptGroup** | `…/DashboardNewWorkspaceForm/PromptGroup/PromptGroup.tsx` |
| **V2 ProjectOption type** | `…/DashboardNewWorkspaceForm/PromptGroup/types.ts` |
| **V2 ModalContent** | `…/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceModalContent/DashboardNewWorkspaceModalContent.tsx` |

---

## Gap A: No GitHub PR URL Paste Support

**V1**: User pastes `https://github.com/owner/repo/pull/123` into the search field. V1 parses it with `parseGitHubPullRequestUrl()`, extracts the PR number, and uses that as the search query.

**V2**: Only does plain text search via `client.workspaceCreation.searchPullRequests`. Pasting a URL returns no results.

## Gap B: No Cross-Repo Validation

**V1**: Receives `githubOwner` and `repoName` as props. Compares the parsed URL's `owner/repo` against these values. If they don't match, it blocks selection and shows: _"PR URL must match owner/repo."_

**V2**: `PRLinkCommand` has no `githubOwner`/`repoName` props. However, this data **is already available** — `ProjectOption` in `types.ts` has `githubOwner` and `githubRepoName`, and `DashboardNewWorkspaceModalContent` resolves them from the `githubRepositories` collection. The data just isn't threaded through to `PRLinkCommand`.

## Gap C: No Debounce Loading State

**V1**: Tracks `isPendingDebounce` by comparing `trimmedQuery !== debouncedTrimmed`. Shows loading state during the debounce window instead of briefly flashing "No results" before the query fires.

**V2**: No debounce gap handling. There's a brief flash of empty state between typing and the debounced query firing.

---

## Research: V1 vs VS Code vs GitHub Desktop

### V1 (Superset)

A single regex that only matches full HTTPS GitHub.com PR URLs:

```
/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i
```

**Handles:** `https://github.com/owner/repo/pull/123`, trailing slashes, query params, hash fragments, `www.` prefix.

**Does not handle:**
- Shorthand like `#123` or bare `123` — always requires the full URL
- `owner/repo#123` cross-reference syntax
- GitHub Enterprise domains
- SSH-style URLs

The parsed result extracts the PR number, which becomes the search query. If the URL's `owner/repo` doesn't match the selected project, selection is blocked with _"PR URL must match owner/repo."_

### VS Code

VS Code does **not** parse PR URLs from user input in search fields at all. It solves a different problem:

1. **Git remote URL parsing** (`parseRemoteUrl` in `gitService.ts`) — normalizes SSH shorthand, aliases, ports, HTTPS URLs into canonical form. Supports GitHub Enterprise via `ghe.com` host matching.

2. **PR detection via branch** (`PullRequestDetectionService`) — discovers PRs by querying GitHub API with the current branch name, not by parsing URLs. Uses exponential backoff retry.

Not applicable to our use case — VS Code never asks users to paste PR URLs.

### GitHub Desktop

GitHub Desktop also **does not** support pasting PR URLs in its search. Its approach:

1. **PR list is pre-fetched** — all open PRs for the current repo are loaded from the GitHub API upfront. No server-side search endpoint.

2. **Client-side fuzzy filtering** (`pull-request-list.tsx:358-366`) — uses `fuzzaldrin-plus` library for fuzzy matching. Each PR is indexed as:
   ```typescript
   text: [pr.title, `#${pr.pullRequestNumber} opened ${timeAgo} by ${author}`]
   ```
   So typing `#123` or `123` or part of a title all work through fuzzy match — no URL parsing needed.

3. **Git remote parsing** (`remote-parsing.ts`) — parses repository URLs via multiple regex patterns covering HTTPS, SSH (`git@`), SSH with GHE domains (`*.ghe.com`), `git:` protocol, and `ssh://` protocol. Also supports `owner/repo` shorthand via `parseRepositoryIdentifier()`.

4. **Cross-repo validation** (`repository-matching.ts:74-119`) — `repositoryMatchesRemote()` compares a PR's GitHub repository against local git remotes by parsing both URLs and comparing hostname, owner, and name (case-insensitive). Uses the same `parseRemote()` for both sides.

**Key takeaway:** GitHub Desktop sidesteps the URL paste problem entirely by pre-loading all PRs and doing client-side fuzzy search. The `#123` syntax works naturally because the subtitle string includes `#${prNumber}`. Their remote parsing is comprehensive (5 regex patterns, GHE support) but only used for git remotes, not browser URLs.

### Other Superset Parsers

The codebase has several git remote URL parsers, none for PR URLs:

| Utility | Location | Purpose |
|---------|----------|---------|
| `parseGitHubRemote` | `packages/host-service` | SSH + HTTPS git remote → `{ owner, name }` |
| `normalizeGitHubRepoUrl` | `apps/desktop/.../changes/utils` | Git remote → normalized HTTPS URL |
| `normalizeGitHubUrl` | `apps/desktop/.../repo-context` | Git remote → `owner/repo` string |

### Recommendation for V2

Neither VS Code nor GitHub Desktop solve this exact problem — both avoid PR URL parsing in search fields entirely (VS Code uses branch detection, GitHub Desktop uses pre-fetched fuzzy search).

V1's regex is the right approach for our use case: parsing browser URLs pasted by users into a server-side search field. It covers all realistic browser-pasted URLs.

V2 should improve on V1 in one way: **strip `#` from shorthand like `#123`**. GitHub Desktop gets this for free via fuzzy matching (the subtitle includes `#123`). Our backend does server-side search, so we should normalize `#123` → `123` before sending the query to ensure it reliably matches by number. V1 sends `#123` as-is and hopes the backend text search handles it.

GitHub Enterprise isn't supported anywhere in the codebase, so adding it here would be inconsistent. The `owner/repo#123` cross-reference syntax adds complexity for a pattern nobody uses in a PR link popover.

---

## Design

### 1. Thread `githubOwner` + `repoName` to PRLinkCommand

`PromptGroup` already receives `selectedProject: ProjectOption` which has `githubOwner` and `githubRepoName`. Pass them through:

**`PromptGroup.tsx`** — update `<PRLinkCommand>` usage:
```diff
 <PRLinkCommand
   open={prLinkOpen}
   onOpenChange={setPRLinkOpen}
   onSelect={setLinkedPR}
   projectId={projectId}
   hostTarget={hostTarget}
   anchorRef={plusMenuRef}
+  githubOwner={selectedProject?.githubOwner ?? null}
+  repoName={selectedProject?.githubRepoName ?? null}
 />
```

### 2. Add URL parser and `#` shorthand detection

Port `parseGitHubPullRequestUrl()` from V1 and add `#123` shorthand stripping:

```typescript
function parseGitHubPullRequestUrl(query: string): {
  owner: string;
  repo: string;
  prNumber: string;
} | null {
  const match = query.match(
    /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2], prNumber: match[3] };
}

/** Strip leading `#` from shorthand like `#123` so the backend searches by number. */
function normalizeSearchQuery(query: string): string {
  const stripped = query.replace(/^#/, "");
  return stripped;
}
```

### 3. Add cross-repo validation + query resolution

Port V1's derived state logic and wire in the shorthand normalization:

```typescript
// New props
githubOwner: string | null;
repoName: string | null;

// Derived state
const parsedPullRequestUrl = useMemo(
  () => parseGitHubPullRequestUrl(debouncedTrimmed),
  [debouncedTrimmed],
);

const selectedRepositoryLabel = useMemo(() => {
  if (!githubOwner || !repoName) return null;
  return `${githubOwner}/${repoName}`;
}, [githubOwner, repoName]);

const pastedRepository = useMemo(() => {
  if (!parsedPullRequestUrl) return null;
  return `${parsedPullRequestUrl.owner}/${parsedPullRequestUrl.repo}`.toLowerCase();
}, [parsedPullRequestUrl]);

const isCrossRepositoryUrl = Boolean(
  selectedRepositoryLabel &&
    pastedRepository &&
    pastedRepository !== selectedRepositoryLabel.toLowerCase(),
);

// Priority: full URL → cross-repo block → shorthand-normalized text search
const effectiveQuery = parsedPullRequestUrl
  ? isCrossRepositoryUrl
    ? ""
    : parsedPullRequestUrl.prNumber
  : normalizeSearchQuery(debouncedTrimmed) || undefined;
```

Pass `effectiveQuery` into the existing `searchPullRequests` call. Disable the query when `isCrossRepositoryUrl` is true.

### 4. Add debounce gap handling

Track `isPendingDebounce` to avoid the empty state flash:

```typescript
const trimmedQuery = searchQuery.trim();
const debouncedTrimmed = debouncedQuery.trim();
const isPendingDebounce = trimmedQuery !== debouncedTrimmed;

// Update isLoading to include debounce state
const isLoading = isCrossRepositoryUrl
  ? false
  : (debouncedTrimmed || trimmedQuery)
    ? isFetching || isPendingDebounce
    : isFetching;
```

### 5. Update empty state messaging

Add cross-repo error to `CommandEmpty`:

```typescript
<CommandEmpty>
  {isLoading
    ? debouncedTrimmed
      ? "Searching..."
      : "Loading pull requests..."
    : isCrossRepositoryUrl
      ? `PR URL must match ${selectedRepositoryLabel}.`
      : debouncedTrimmed
        ? "No pull requests found."
        : "No open pull requests."}
</CommandEmpty>
```

---

## What Stays the Same

- Fetching via `getHostServiceClientByUrl` + `client.workspaceCreation.searchPullRequests` (not switching to V1's electron tRPC)
- `hostTarget` prop for host URL resolution
- State normalization via `normalizeState(state, isDraft)` (V2's approach is correct — host-service returns raw state + `isDraft` separately)
- Return type shape (`{ pullRequests: [...] }`)

## Files to Modify

| File | Change |
|------|--------|
| `…/PRLinkCommand/PRLinkCommand.tsx` (V2) | Add `githubOwner`/`repoName` props, URL parser, cross-repo validation, `isPendingDebounce` |
| `…/PromptGroup/PromptGroup.tsx` (V2) | Pass `githubOwner` + `repoName` to `<PRLinkCommand>` |
