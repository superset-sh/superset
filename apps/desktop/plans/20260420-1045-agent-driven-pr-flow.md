# Agent-driven PR flow for the V2 diff editor sidebar

Status: proposed
Owner: @AviPeltz
Date: 2026-04-20

## Summary

Replace direct-mutation PR actions in the V2 workspace sidebar with an
agent-driven dispatch model. The top of the right sidebar shows a single
context-aware action button; clicking it computes the current PR flow
state, picks a skill, builds a synthesized markdown context attachment,
and opens (or reuses) a chat pane with the skill pre-invoked and the
attachment loaded. The agent performs the actual git/GitHub work via its
existing tools.

## Motivation

- V2 currently has a read-only PR header (`PRHeader.tsx`) and no way to
  create, update, merge, or resolve a PR without leaving the app.
- V1's `PRButton` (in `screens/main/.../ChangesView/.../PRButton.tsx`) does
  this via direct tRPC mutations and a cascade of `if` branches. The logic
  is split across `getPRActionState`, `getPrimaryAction`, and inline
  conditionals, and has no single place to reason about all the states.
- Moving the "what to do next" logic into markdown skills makes the flow
  forkable per-repo, reviewable in PRs, and lets the agent handle
  conversational edge cases (rebase conflicts, failing checks, review
  comments) that a direct mutation can't.

## Current state (verified)

**V1, full PR UI** — `apps/desktop/src/renderer/screens/main/.../ChangesView/`
- `components/ChangesHeader/components/PRButton/PRButton.tsx` — renders
  create/link/merge states
- `utils/pr-action-state.ts` — pure reducer:
  `{hasRepo, hasExistingPR, hasUpstream, pushCount, pullCount, isDefaultBranch}`
  → `{canCreatePR, blockedReason}`
- `components/CommitInput/utils/getPrimaryAction.ts` — commit/sync/push/pull
  cascade
- `utils/auto-create-pr-after-publish.ts` — auto-triggers PR create after
  publishing a new branch
- `renderer/screens/main/hooks/useCreateOrOpenPR/useCreateOrOpenPR.ts` —
  wraps `electronTrpc.changes.createPR` with a "behind upstream" confirm+retry

**V2, read-only** — `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/`
- `hooks/useReviewTab/useReviewTab.tsx` — pulls `git.getPullRequest` +
  `git.getPullRequestThreads`, normalizes to `NormalizedPR` with
  `state`, `reviewDecision`, `checksStatus`, `checks[]`
- `hooks/useReviewTab/components/PRHeader/PRHeader.tsx` — title + review
  decision pill, no actions
- `components/SidebarHeader/SidebarHeader.tsx:64` — tabs have an `actions`
  slot on the right that is not currently used by the review tab
- No `mergeable` field, no branch-sync data, no PR-creation wiring

**Backend** — `apps/desktop/src/lib/trpc/routers/changes/`
- `git-operations.ts` — `push`, `createPR`, `mergePR` already exist and
  are what the agent will call as tools
- `utils/pull-request-discovery.ts` — `findExistingOpenPRUrl`,
  `buildNewPullRequestUrl`

**Chat plumbing in V2** (verified available for dispatch)
- `packages/panes/src/core/store/store.ts` — `addTab(...)`, `openPane(...)`
- `apps/desktop/src/shared/tabs-types.ts` — `ChatLaunchConfig` with
  `initialPrompt: string` + `initialFiles: Array<{data, mediaType, filename}>`
- Attachments accept `data:text/markdown;base64,...` — no disk write needed
- Skills live in `.agents/commands/` (with `.claude/commands` and
  `.cursor/commands` as symlinks — AGENTS.md rule 3). `packages/chat`
  discovers them from `.claude/commands`.
- There is no programmatic `executeSlashCommand()`; we invoke a skill by
  setting `initialPrompt: "/<skill-name>"` on the chat pane's launch config.

## Architecture

The header has three regions, left to right:

- **PR link button** (left). Always rendered whenever a PR exists, in any
  state (draft, open, merged, closed). Shows `#NNN` with a state icon and
  an external-link chevron; clicking opens `pr.url` in the browser. Hidden
  only when there is no PR for the current branch.
- **Status badge** (middle). Derived from `PRFlowState`.
- **Action button** (right). Context-aware; described in the Button
  states section below.

```
┌─────────────────────────────────────────┐
│ PRActionHeader (new)                    │   top of right sidebar
│  [#NNN ↗pr-link]  [status]    [▶action] │
└──────────────────┬──────────────────────┘
               │ click
               ▼
┌───────────────────────────────┐
│ getPRFlowState (pure)         │   reducer over PR + branch + checks
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ usePRFlowDispatch             │
│  1. build pr-context.md       │   buildPRContext (pure)
│  2. data-URL encode           │
│  3. ensureChatPane            │   new tab OR reuse
│  4. addTab / openPane with    │
│     ChatLaunchConfig          │
└──────────────┬────────────────┘
               ▼
        chat pane opens with
        initialPrompt = "/<skill>"
        initialFiles = [pr-context.md]
               ▼
   agent runs skill, calling existing
   tRPC mutations + gh CLI as tools
```

The direct-mutation endpoints (`changes.createPR`, `changes.mergePR`,
`changes.push`) stay — they become the agent's tools, not the UI's.

## Data layer changes

`NormalizedPR` is missing the fields that distinguish the more nuanced
states (mergeable=conflicting, mergeable=behind, etc.), and V2 has no
branch-sync query. Without these the state machine can't disambiguate
states 13, 21, 22, 23 in the table below.

### `getPullRequest` router (extend)

File: `apps/desktop/src/lib/trpc/routers/changes/git-operations.ts`

Surface GitHub's `mergeStateStatus` on the PR output. Normalize to:

```ts
mergeable: "clean" | "conflicting" | "behind" | "blocked" | "unknown"
```

Mapping from GitHub's enum:
- `CLEAN` → `"clean"`
- `DIRTY` | `CONFLICTING` → `"conflicting"`
- `BEHIND` → `"behind"`
- `BLOCKED` (branch protection) → `"blocked"`
- `UNKNOWN` | `DRAFT` | anything else → `"unknown"`

### New router: `getBranchSyncStatus`

File: same. Input: `{ workspaceId }`. Output:

```ts
{
  hasRepo: boolean,
  hasUpstream: boolean,
  pushCount: number,
  pullCount: number,
  isDefaultBranch: boolean,
  hasUncommitted: boolean,
  isDetached: boolean,
  ghAuthenticated: boolean,
  online: boolean,
}
```

V1 has the pieces of this scattered across `useGitChangesStatus` and
ad-hoc checks; we consolidate them into one query. Poll at ~10s (same
cadence as `getPullRequest`).

### `NormalizedPR` (extend)

File: `useReviewTab/types.ts` — add `mergeable`, `isDraft`.

## State machine

Design principle: **main states are coarse; the agent handles
preconditions.** Everything that blocks PR creation (uncommitted,
unpublished, unpushed, out-of-sync) collapses into one `no-pr` state
with a single **Create PR ▾** split button. The skill decides whether
to commit, publish, or push before calling `gh pr create`. The UI does
not need a separate state for each precondition.

Post-PR states only fork when the next user action genuinely differs
(resolve conflicts ≠ fix checks ≠ address review ≠ merge).

```ts
// getPRFlowState.ts
export type PRFlowState =
  // system / gating
  | { kind: "loading" }
  | { kind: "unavailable"; reason: UnavailableReason }
  // pre-PR  (collapsed; one button covers all of these)
  | { kind: "no-pr";                          sync: BranchSyncStatus;
                                              hasUncommitted: boolean }
  // PR exists
  | { kind: "pr-draft";                       pr: NormalizedPR }
  | { kind: "pr-checks-pending";              pr: NormalizedPR }
  | { kind: "pr-checks-failing";              pr: NormalizedPR }
  | { kind: "pr-review-pending";              pr: NormalizedPR }
  | { kind: "pr-changes-requested";           pr: NormalizedPR }
  | { kind: "pr-ready-to-merge";              pr: NormalizedPR }
  | { kind: "pr-behind";                      pr: NormalizedPR }
  | { kind: "pr-conflicts";                   pr: NormalizedPR }
  | { kind: "pr-blocked";                     pr: NormalizedPR }
  | { kind: "pr-merged";                      pr: NormalizedPR;
                                              localBranchExists: boolean }
  | { kind: "pr-closed";                      pr: NormalizedPR }
  // transient
  | { kind: "busy";                           pr: NormalizedPR | null }
  | { kind: "error";                          pr: NormalizedPR | null;
                                              message: string };

type UnavailableReason =
  | "no-repo"
  | "offline"
  | "gh-unauthenticated"
  | "default-branch"
  | "detached-head"
  | "no-changes"
  | "mergeability-unknown";

export function getPRFlowState(input: {
  pr: NormalizedPR | null;
  sync: BranchSyncStatus | null;
  hasUncommitted: boolean;
  isAgentRunning: boolean;
  loadError: Error | null;
}): PRFlowState;
```

15 main states, down from 33. Precedence (short-circuit in this order):

1. `error` if `loadError` and no last-known data
2. `loading` if queries are still fetching first time
3. `busy` if there's an in-flight chat turn dispatched from this header
4. `unavailable` for all hard gates (no-repo, offline, gh-unauth,
   default-branch, detached-head, no-changes, mergeability-unknown)
5. `pr` present → route into one of the PR states
6. No PR → always `no-pr` (the single pre-PR state)

### Button states (action button only)

Fewer action-button variants than main states: the split buttons
(`create-pr-dropdown`, `merge-dropdown`) each serve one main state but
offer two or three options. The action button is independent of the PR
link button on the left, which is always shown when a PR exists.

| Variant id            | Rendering                      | Enabled | Options / on click                                                            |
|-----------------------|--------------------------------|---------|-------------------------------------------------------------------------------|
| `hidden`              | not rendered                   | —       | —                                                                             |
| `disabled-tooltip`    | greyed out, tooltip `reason`   | no      | —                                                                             |
| `sign-in`             | **Sign in**                    | yes     | dispatch `pr/gh-auth`                                                         |
| `create-pr-dropdown`  | **Create PR ▾** (split button) | yes     | primary: `pr/create-pr`; dropdown: "Create draft PR" → `pr/create-pr --draft` |
| `mark-ready`          | **Mark ready**                 | yes     | dispatch `pr/mark-ready`                                                      |
| `view-checks`         | **View checks**                | yes     | dispatch `pr/watch-checks`                                                    |
| `fix-checks`          | **Fix checks**                 | yes     | dispatch `pr/fix-checks`                                                      |
| `request-review`      | **Request review**             | yes     | dispatch `pr/request-review`                                                  |
| `address-review`      | **Address review**             | yes     | dispatch `pr/address-review`                                                  |
| `update-from-base`    | **Update from base**           | yes     | dispatch `pr/update-branch`                                                   |
| `resolve`             | **Resolve**                    | yes     | dispatch `pr/resolve-conflicts`                                               |
| `view-rules`          | **View rules**                 | yes     | dispatch `pr/branch-protection`                                               |
| `merge-dropdown`      | **Merge ▾** (split button)     | yes     | primary: repo default; dropdown: squash / merge / rebase → `pr/merge`         |
| `clean-up`            | **Clean up**                   | yes     | dispatch `pr/cleanup-merged`                                                  |
| `reopen`              | **Reopen**                     | yes     | dispatch `pr/reopen`                                                          |
| `retry`               | **Retry**                      | yes     | refetch queries (no agent dispatch)                                           |
| `cancel-busy`         | spinner + **Cancel**           | yes     | cancel the current chat turn                                                  |

16 variants, down from 25. `disabled-tooltip` carries a `reason` prop
for the tooltip text. Split buttons (`create-pr-dropdown`,
`merge-dropdown`) render a primary label plus a chevron opening a
dropdown of alternates.

**`pr/create-pr` is one skill** that receives the full branch state in
`pr-context.md` and decides internally whether to commit, publish (set
upstream + push), or just push before calling `gh pr create`. The UI
passes `--draft` as a CLI-style arg in the `initialPrompt` when the
dropdown option is chosen; the skill parses it and adds `--draft` to
the `gh` call.

### PR link button states (always visible when a PR exists)

| Variant id        | Rendering                         | On click                |
|-------------------|-----------------------------------|-------------------------|
| `none`            | not rendered (no PR for branch)   | —                       |
| `pr-link-open`    | `#NNN` + open-PR icon + ↗         | open `pr.url`           |
| `pr-link-draft`   | `#NNN` + draft-PR icon + ↗        | open `pr.url`           |
| `pr-link-merged`  | `#NNN` + merged-PR icon + ↗       | open `pr.url`           |
| `pr-link-closed`  | `#NNN` + closed-PR icon + ↗       | open `pr.url`           |

Icons reuse the existing `PRIcon` component at
`renderer/screens/main/components/PRIcon`. The link button is shown in
every PR-present flow state, including all `busy-agent-running` and
`error-stale` variants where a PR exists — so the user can always jump
to GitHub regardless of what the agent is doing.

### Full state × action table

15 main states. Every row names: PR link button (left), status badge
(middle), action button (right), and — for dispatchable actions — the
skill invoked and the `pr-context.md` payload.

| #  | State                   | PR link           | Status badge                | Action button         | Skill                       | Attachment contents                                              |
|----|-------------------------|-------------------|-----------------------------|-----------------------|-----------------------------|------------------------------------------------------------------|
| 1  | `loading`               | `none`            | spinner                     | `hidden`              | —                           | —                                                                |
| 2  | `unavailable`           | if PR: open link  | reason-specific label †     | `disabled-tooltip` or `sign-in` ‡ | `pr/gh-auth` (only for gh-unauth) | env diagnostics (only for gh-unauth)                |
| 3  | `no-pr`                 | `none`            | branch-sync summary §       | `create-pr-dropdown`  | `pr/create-pr` (`--draft` opt) | branch, commits since base, uncommitted status, push/pull counts, suggested title/body |
| 4  | `pr-draft`              | `pr-link-draft`   | "Draft"                     | `mark-ready`          | `pr/mark-ready`             | PR number, checks summary                                        |
| 5  | `pr-checks-pending`     | `pr-link-open`    | "Checks running"            | `view-checks`         | `pr/watch-checks`           | running check names + URLs                                       |
| 6  | `pr-checks-failing`     | `pr-link-open`    | "Checks failing"            | `fix-checks`          | `pr/fix-checks`             | failing check names + log URLs + last diff                       |
| 7  | `pr-review-pending`     | `pr-link-open`    | "Review pending"            | `request-review`      | `pr/request-review`         | PR URL, suggested reviewers                                      |
| 8  | `pr-changes-requested`  | `pr-link-open`    | "Changes requested"         | `address-review`      | `pr/address-review`         | unresolved comments (path, line, body)                           |
| 9  | `pr-ready-to-merge`     | `pr-link-open`    | "Ready to merge"            | `merge-dropdown`      | `pr/merge`                  | PR number, strategy, post-merge cleanup flag                     |
| 10 | `pr-behind`             | `pr-link-open`    | "Update branch"             | `update-from-base`    | `pr/update-branch`          | base branch, merge-base sha                                      |
| 11 | `pr-conflicts`          | `pr-link-open`    | "Merge conflicts"           | `resolve`             | `pr/resolve-conflicts`      | conflict file list, base sha, branch sha, merge command          |
| 12 | `pr-blocked`            | `pr-link-open`    | "Branch protected"          | `view-rules`          | `pr/branch-protection`      | protection reason                                                |
| 13 | `pr-merged`             | `pr-link-merged`  | "Merged"                    | `clean-up` or `hidden` ¶ | `pr/cleanup-merged`      | branch to delete, switch-to target                               |
| 14 | `pr-closed`             | `pr-link-closed`  | "Closed"                    | `reopen`              | `pr/reopen`                 | PR number, close reason                                          |
| 15 | `busy`                  | if PR: open link  | "Agent working…"            | `cancel-busy`         | (cancel current chat turn)  | —                                                                |
| 16 | `error`                 | if PR: open link  | "Failed to refresh — retry" | `retry`               | —                           | —                                                                |

† Unavailable labels: "No GitHub repo" / "Offline" / "Sign in to GitHub" /
"On default branch" / "Detached HEAD" / "No changes" /
"Checking mergeability".

‡ `unavailable` renders `disabled-tooltip` for every reason except
`gh-unauthenticated`, which renders `sign-in`.

§ `no-pr` status badge text collapses branch-sync variants into one
short label: "Not published" / "N to push" / "N to pull" / "Diverged" /
"Uncommitted changes" / "Ready". All paths fire the same
`create-pr-dropdown` button.

¶ `pr-merged` shows `clean-up` when the local branch still exists,
`hidden` when it's already been deleted.

## New / changed files

### New (code)

- `.../useReviewTab/utils/getPRFlowState.ts` + `.test.ts`
- `.../useReviewTab/utils/buildPRContext.ts` + `.test.ts`
- `.../WorkspaceSidebar/hooks/usePRFlowDispatch/usePRFlowDispatch.ts` + `index.ts`
- `.../WorkspaceSidebar/components/PRActionHeader/PRActionHeader.tsx` + `index.ts`
- `.../WorkspaceSidebar/components/PRActionHeader/components/MergeStrategyDropdown/MergeStrategyDropdown.tsx` + `index.ts`
- `renderer/shared/utils/ensureChatPane/ensureChatPane.ts` + `.test.ts` + `index.ts`

### Modified

- `apps/desktop/src/lib/trpc/routers/changes/git-operations.ts` — surface
  `mergeable` on `getPullRequest`
- `apps/desktop/src/lib/trpc/routers/changes/index.ts` — add
  `getBranchSyncStatus` procedure
- `useReviewTab/types.ts` — `mergeable`, `isDraft` on `NormalizedPR`
- `useReviewTab/useReviewTab.tsx` — normalize `mergeable`, surface
  `actions` (the `<PRActionHeader/>` element) for `SidebarHeader`'s
  `actions` slot, or mount inside `ReviewTabContent` above `PRHeader`
- `ReviewTabContent.tsx` — mount `PRActionHeader`

### V1 untouched

V1 `PRButton` stays as-is. This plan is V2-only. We do not back-port the
agent flow.

## Skills to author

Location: `.agents/commands/pr/` (nested; existing skills at
`.agents/commands/` are flat — we namespace to keep the PR set together).
Symlinks already make them visible under `.claude/commands/pr/` and
`.cursor/commands/pr/`.

Each skill is a markdown file with YAML frontmatter (`description`) and
a short body describing the goal and the allowed tool calls. The agent
consumes `pr-context.md` as an attachment.

Skills to write (12):

- `pr/create-pr.md` — one skill for the whole pre-PR path (commit,
  publish, push, `gh pr create`). Accepts `--draft`.
- `pr/gh-auth.md`
- `pr/mark-ready.md`
- `pr/watch-checks.md`
- `pr/fix-checks.md`
- `pr/request-review.md`
- `pr/address-review.md`
- `pr/update-branch.md`
- `pr/resolve-conflicts.md`
- `pr/merge.md`
- `pr/branch-protection.md`
- `pr/cleanup-merged.md`
- `pr/reopen.md`

Example (`pr/create-pr.md`):

```markdown
---
description: Create a pull request for the current branch
---

You are creating a PR. `pr-context.md` has branch name, base branch,
commits since base, whether the branch is published, uncommitted file
status, suggested title/body, and push/pull counts.

Arguments:
- `--draft`  create the PR as a draft

Steps, in order, only doing what's needed:
1. If there are uncommitted changes, stage + commit them with a
   message derived from the diff (confirm with user first).
2. If the branch has no upstream, `git push -u origin <branch>`.
   Otherwise if `pushCount > 0`, `git push`.
3. If `pullCount > 0`, stop and tell the user to sync first.
4. `gh pr create --title "..." --body "..." --base <default>`,
   adding `--draft` if the flag was passed.
5. Print the PR URL.

Never force-push. If push fails non-fast-forward, stop and report.
```

## Dispatcher behavior

```ts
function dispatchPRAction(state: PRFlowState) {
  const action = primaryActionFor(state);
  if (!action) return;

  const markdown = buildPRContext(state);
  const attachment = {
    data: `data:text/markdown;base64,${btoa(markdown)}`,
    mediaType: "text/markdown",
    filename: "pr-context.md",
  };

  const launchConfig: ChatLaunchConfig = {
    initialPrompt: `/${action.skill}`,
    initialFiles: [attachment],
  };

  const existing = findExistingChatPane(paneStore.getState());
  if (existing) {
    focusPane(existing.id);
    // see open question 1
    enqueueFollowUpTurn(existing.id, launchConfig);
  } else {
    paneStore.getState().addTab({
      panes: [{ kind: "chat", data: { sessionId: null, launchConfig } }],
    });
  }
}
```

### Reuse vs new tab

Two options:

- **(a) Always open a new chat tab.** Simplest. Matches how
  `useConsumePendingLaunch` already works. Multiple clicks = multiple
  tabs. Ship this first.
- **(b) Reuse the existing chat pane.** Requires a new
  `enqueueFollowUpTurn(sessionId, launchConfig)` on the chat session store
  so subsequent clicks feed into the same conversation.

Recommendation: ship (a), add (b) after skills stabilize.

## Testing

- **Unit (pure):** `getPRFlowState` table-driven test covering every
  discriminant. Input shape is small (PR + sync + flags) so snapshot
  coverage is cheap. Mirrors the style of
  `pr-action-state.test.ts`.
- **Unit (pure):** `buildPRContext` per-state snapshot tests — the
  markdown is the contract between UI and skill, so it needs regression
  coverage.
- **Integration (renderer):** mock `getPullRequest` returning each
  `mergeStateStatus` and assert `PRActionHeader` renders the right button
  label.
- **Integration (dispatch):** stub the pane store; click each button;
  assert `addTab` called with the right `initialPrompt` and a
  base64-decodable `pr-context.md`.
- **Manual:** unpublished branch → click **Publish & Create PR** →
  verify chat pane opens with `/pr/publish-and-create` + attachment and
  the agent completes the flow.

## Phasing

MVP ships the `no-pr` path only (states 1–3 and 15–16). Everything else
lands incrementally.

1. **MVP backend.** Add `getBranchSyncStatus`. No UI change yet.
2. **MVP pure layer.** `getPRFlowState` covering only `loading`,
   `unavailable`, `no-pr`, `busy`, `error`. `buildPRContext` for `no-pr`.
3. **MVP skill.** `pr/create-pr.md` with `--draft` arg support.
4. **MVP dispatcher.** `ensureChatPane` + `usePRFlowDispatch` using
   option (a) (new tab per click).
5. **MVP UI.** `PRActionHeader` in `ReviewTabContent` with the
   `create-pr-dropdown` and PR link button. This is the first shippable
   cut: user sees **Create PR ▾** on any pre-PR branch, dropdown offers
   "Create draft PR".
6. **Post-PR states.** Add `mergeable` to `getPullRequest`. Expand
   `getPRFlowState` to cover states 4–14 one at a time, each with its
   own skill.
7. **Reuse existing chat pane** — option (b) — with a follow-up turn
   API. Optional polish.

## Open questions

1. **New chat tab per click, or reuse existing pane?** Recommended: new
   tab first, optimize later.
2. **Auto-execute the skill, or land user at a pre-typed prompt they
   confirm?** Auto-execute is one-click but riskier for destructive
   actions (merge, force-push paths). Option: auto-execute for
   non-destructive states, confirm for destructive.
3. **`busy-agent-running` cancel button** — is there already an API to
   cancel the current chat turn, or do we need one?
4. **Skill namespace**: `.agents/commands/pr/*.md` (nested) vs flat like
   existing `.agents/commands/create-pr.md`. Recommend nested for grouping.
5. **`resolve-conflicts` UX** — does the agent run `git merge origin/<base>`
   locally and leave conflict markers in the worktree for in-app
   resolution, or does it send the user to GitHub's web conflict editor?
   Recommend local-first.
6. **Draft PRs** — should the draft path also auto-create as a draft
   (extra `--draft` flag on `gh pr create`) from a dedicated button, or
   is "mark ready" always a post-creation step?

## Non-goals

- Back-porting to V1.
- Replacing `changes.createPR` / `changes.mergePR` tRPC endpoints — they
  stay as the agent's tools.
- A generic skill-invocation API outside the PR flow. If that gets built
  later, this dispatcher becomes its first caller.
