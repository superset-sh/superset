# V2 Launch Context — Body-Fetching Gaps

Companion to `V2_LAUNCH_CONTEXT.md`. Tracks remaining work to make
linked issues / PRs / tasks useful to the agent.

## Current state (2026-04-15)

Claude receives titles only — no bodies:

```
<user prompt>

# <task title>

# <issue title>

# PR #<n> — <pr title>
Branch `<branch>` is checked out in this workspace — commits you make continue this PR.

# Attached files
...
- .superset/attachments/<file>
```

Bodies are empty because `buildResolveCtxFromPending` stubs return
empty strings. The pipeline otherwise works end-to-end.

## Design decisions (locked)

1. **Inline in prompt.** Bodies go directly into the prompt via
   `{{issues}}` / `{{prs}}` / `{{tasks}}` template variables. No file
   writes for linked context. Only user-uploaded attachments write to
   `.superset/attachments/`.
2. **PR checkout is true.** The fork-from-PR flow checks out the PR's
   head branch. Prompt says so.
3. **No body truncation** (or very high cap, e.g. 200 KB/source). Modern
   context windows are large. Don't cap aggressively.
4. **No sanitization.** Prompt goes into a heredoc with a random
   delimiter (no shell injection). Agent reads raw text, no HTML parser
   downstream. V1's entity escaping was unnecessary.
5. **Attachments framing.** The `{{attachments}}` block includes a short
   header cueing the agent to read the files. Just paths; agent handles
   the rest.
6. **Issue/PR comments.** Defer. Note in the follow-ups.
7. **Per-agent framing.** Don't over-engineer. Give the path; agent
   figures it out.

## Work plan

### 1. Host-service `getIssueContent`

Add to `workspaceCreation` router (same GitHub auth path as
`searchGitHubIssues`):

```ts
getIssueContent: protectedProcedure
  .input(z.object({ projectId: z.string(), issueNumber: z.number() }))
  .query(async ({ ctx, input }) => {
    const repo = await resolveGithubRepo(ctx, input.projectId);
    const octokit = await ctx.github();
    const { data } = await octokit.issues.get({
      owner: repo.owner, repo: repo.name, issue_number: input.issueNumber,
    });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? "",
      url: data.html_url,
      state: data.state,
      author: data.user?.login ?? null,
    };
  }),
```

### 2. Host-service `getPullRequestContent`

Same router, wraps `octokit.pulls.get`:

```ts
getPullRequestContent: protectedProcedure
  .input(z.object({ projectId: z.string(), prNumber: z.number() }))
  .query(async ({ ctx, input }) => {
    const repo = await resolveGithubRepo(ctx, input.projectId);
    const octokit = await ctx.github();
    const { data } = await octokit.pulls.get({
      owner: repo.owner, repo: repo.name, pull_number: input.prNumber,
    });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? "",
      url: data.html_url,
      state: data.state,
      branch: data.head.ref,
      baseBranch: data.base.ref,
      author: data.user?.login ?? null,
    };
  }),
```

### 3. Internal-task body source

Find the API for task details. V1 uses Electron IPC; V2 has
collections in the task view (live-query from cloud). Options:

- `apiTrpcClient.tasks.get.query({ id })` if such a procedure exists.
- Read from the existing `collections.tasks` live-query data (already
  in renderer memory from the task view).
- Host-service proxies the Superset API.

Need to inspect the task view's data source to find the right shape.
The pending row already has `{ id, slug, title }` from the picker;
the missing field is `description` (and potentially
`acceptanceCriteria`, `comments`, `labels`).

### 4. Swap stubs in `buildResolveCtxFromPending`

`apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/buildForkAgentLaunch.ts`

Replace the three fake fetchers in `buildResolveCtxFromPending` with
real calls to host-service via `getHostServiceClientByUrl(hostUrl)`:

```ts
fetchIssue: async (url) => {
  const match = pending.linkedIssues.find(i => i.url === url);
  if (!match?.number) throw notFound(url);
  const data = await client.workspaceCreation.getIssueContent.query({
    projectId: pending.projectId,
    issueNumber: match.number,
  });
  return {
    number: data.number,
    url: data.url,
    title: data.title,
    body: data.body,
    slug: match.slug,
  };
},
```

Same pattern for PR (using `match.prNumber`) and task (using task API).

### 5. Pass `hostUrl` to `buildForkAgentLaunch`

Currently the function doesn't have the host-service client. Thread
`hostUrl` (or the client itself) through `BuildForkAgentLaunchInputs`
so the resolvers can make real calls.

## Target prompt (after fixes)

```
<user prompt>

# Task TASK-42 — Refactor auth middleware

Split session-token storage from request handling so we can encrypt
at rest. Keep the public API shape stable.

Acceptance criteria:
- Sessions encrypted at rest
- No public-API shape change
- Migration for existing sessions

# Issue #123 — Auth middleware stores tokens in plaintext

Legal flagged this. Sessions written to disk without encryption. We
need to move to an encrypted KV before the compliance deadline.

The token-issuance path sets kid=k_primary but the active signing
key rotated to k_2026q1 last quarter. Decrypt falls back to
legacy plaintext which is the compliance violation...

# PR #200 — Rewrite auth middleware

Branch `fix/auth-encryption` is checked out in this workspace —
commits you make continue this PR.

Replaces plaintext token storage with encrypted KV. Migrates
existing sessions on first request...

# Attached files

The user attached these files alongside the prompt. They've been
written into the worktree at `.superset/attachments/`. Read them
to understand the request.

- .superset/attachments/trace.log
- .superset/attachments/notes.md
```

## Sequence

1. `getIssueContent` host-service procedure + stub swap → issue bodies flow.
2. `getPullRequestContent` procedure + stub swap → PR bodies + branch.
3. Task body source (scope the API first).
4. Thread `hostUrl` into `buildForkAgentLaunch` inputs.

## Deferred

- Issue/PR comments (phase 2).
- Body truncation (revisit if agents hit context limits in practice).
- Attach-as-file mode (not needed; inline works).
