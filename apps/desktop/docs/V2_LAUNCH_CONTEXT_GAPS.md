# V2 Launch Context — Body-Fetching Gaps

Companion to `V2_LAUNCH_CONTEXT.md`. Tracks the remaining work to make
linked issues / PRs / tasks actually useful to the agent.

## Current state (manual-test observation 2026-04-15)

Claude receives titles only — no issue bodies, no PR descriptions, no
task specs. The prompt looks like:

```
<user prompt>
# <task title>
# <issue title>
# <PR title>
Branch: ``
- .superset/attachments/<file>
```

Per section:

- **User prompt** — ✓ works.
- **Attachment files** — ✓ bytes written to worktree, path refs inline.
- **Linked issues** — ✗ title only, body empty.
- **Linked PRs** — ✗ title only, body empty, branch empty.
- **Linked internal tasks** — ✗ title only, description empty.

## Why — the resolver stubs

`buildForkAgentLaunch.ts` → `buildResolveCtxFromPending` fakes the
three fetchers by reading **only** what the pending row already carries
(`title`, `url`, `number`, `slug`). The pending row is populated at
modal-submit time from linked-issue picker results, which also only
carry metadata. No network fetch happens anywhere in the V2 path.

## How V1 did it (issues only)

`apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx:834-944`.

1. Electron-IPC call `utils.client.projects.getIssueContent.query({ projectId, issueNumber })`.
2. Returns full `{ number, title, body, url, state, author, createdAt, updatedAt }`.
3. HTML-entity sanitize + URL protocol validation.
4. 50 KB body truncation.
5. Formatted as markdown; encoded as base64 data URL.
6. Attached as a **file** named `github-issue-<n>.md` (not inlined in
   the prompt text).

V1 did **not** fetch PR bodies or task descriptions — same gap as V2
for those kinds.

## Constraints for V2

- **No Electron IPC.** `electronTrpc.projects.getIssueContent` is off-
  limits. We talk to host-service over HTTP via
  `getHostServiceClientByUrl(hostUrl)` in the pending page /
  dispatchForkLaunch.
- **Same sanitization rules apply.** HTML entities, URL protocols,
  50 KB truncation, sanitize author strings.
- **Same output shape options.** Either attach as a
  `github-issue-<n>.md` file (V1 parity) or inline the body into the
  prompt via the existing `{{issues}}` / `{{prs}}` / `{{tasks}}`
  template variables.

## Proposed fixes

### 1. Add host-service body-fetch procedures

Host-service already has `searchGitHubIssues` + `searchPullRequests`
returning metadata only. Extend to include body endpoints:

- `workspaceCreation.getIssueContent({ projectId, issueNumber })`
  → `{ number, title, body, url, state, author, createdAt, updatedAt }`.
  Thin wrapper over `octokit.issues.get(...)`. Mirror V1's response shape.
- `workspaceCreation.getPullRequestContent({ projectId, prNumber })`
  → `{ number, title, body, url, state, author, createdAt, updatedAt, branch, headSha, baseBranch, isDraft }`.
  Wraps `octokit.pulls.get(...)`. Includes `branch` which V2 doesn't
  currently have.
- `workspaceCreation.getInternalTaskContent({ projectId, taskId })`
  → `{ id, slug, title, description, acceptanceCriteria?, status, labels }`.
  Uses whatever internal task API the app already talks to (likely via
  `apiTrpcClient`, not host-service). If the task source lives on the
  Superset API server rather than host-service, wire it through there
  instead — host-service shouldn't need to re-proxy.

### 2. Replace the stubs in `buildForkAgentLaunch.ts`

`buildResolveCtxFromPending` currently returns empty bodies. Swap
its three fetchers for real calls:

```ts
fetchIssue: async (url) => {
  // parse number out of the url (we have the pending row's number too)
  const { data } = await client.workspaceCreation.getIssueContent.query({
    projectId,
    issueNumber,
  });
  return {
    number: data.number,
    url: data.url,
    title: data.title,
    body: sanitizeAndTruncate(data.body, 50_000),
    slug: data.slug ?? slugify(data.title),
  };
},
```

Same shape for PR and task. Errors → return current pending-row fallback
so the launch degrades to title-only instead of failing outright.

### 3. Decide — attach as file vs inline in prompt

V1 attaches as `github-issue-<n>.md`; our V2 pipeline currently inlines
via the `{{issues}}` / `{{prs}}` / `{{tasks}}` template variables.

| | Inline (current V2) | Attach as file (V1) |
|---|---|---|
| Prompt length | Grows with bodies | Stays small |
| Agent discovery | Automatic (in prompt) | Agent must read file |
| Token caching | Harder to hit | Better: file path is stable |
| File list on disk | Only real attachments | Every linked thing |
| User clarity | See content in prompt | Just a file ref |

Recommendation: **inline for phase 1, add attach-as-file for phase 2**
(as a user setting or agent-config flag). Inline is simpler, matches
the current template structure, and makes body-fetching immediately
useful.

### 4. Fix the pending-row schema for PR branch

`PendingLinkedPR` schema in the dashboard-sidebar schema has no
`branch` field. Host-service's `searchPullRequests` doesn't return it
either — current consumers don't need it. Either:
- Add `branch` to the pending-row schema + populate at link-add time
  from a second PR-detail API call.
- Or derive it at dispatch time by calling
  `getPullRequestContent` (now we'd fetch for a different reason too).

The second option is less work — we already need the body fetch.

### 5. Sanitization helpers

Port V1's `sanitizeText` / `sanitizeUrl` / 50-KB-truncate into a shared
util and use from the dispatch path. Don't reinvent per-contributor.

Probably lives at `packages/shared/src/text-sanitize.ts` (used by host-
service + renderer).

## Order of work

1. **Host-service `getIssueContent` procedure** — smallest,
   most-visible win. Drop-in for existing `searchGitHubIssues` auth
   path. Ship that, wire the stub replacement, and body content starts
   flowing.
2. **Host-service `getPullRequestContent`** — same pattern. Unblocks
   the empty `Branch:` line.
3. **Internal-task body source** — depends on where tasks live
   (Superset API? separate service?). Scope out before committing to a
   shape.
4. **Sanitization shared util** — required for #1 and #2 but can land
   with whichever ships first.
5. **Attach-as-file mode** — optional, user/agent-config setting.
   Deferred to phase 2.

## Acceptance criteria

After this work, a multi-source launch (prompt + task + 2 issues +
PR + attachment) should render a prompt like:

```
<user prompt>

# Task <id> — <title>
<description>

# Issue #<n> — <title>
**URL:** ...  **State:** open  **Author:** ...
<body, up to 50 KB>

# Issue #<m> — <title>
...

# PR #<p> — <title>
**Branch:** `feature/xyz`  **Base:** main
<body>

- .superset/attachments/<file>
```

No placeholder empty `Branch: ` lines. No naked titles without bodies.

## Out of scope

- Comments on issues/PRs (V1 didn't fetch them either).
- Diff content for linked PRs (agent can `gh pr diff` itself).
- Cross-repo linked PRs (already handled by
  `normalizeGitHubQuery.repoMismatch` at search time).
