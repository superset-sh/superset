# How v2 workspace diff views work

An explainer for every place the UI shows "what changed" for a workspace, what comparison runs under the hood, and why.

Written for people who don't know git. If you do know git: this doc maps each UI surface to the specific git command and explains why we picked that comparison over the alternatives.

Each surface below has a matching `describe` block in `packages/host-service/src/trpc/router/git/v2-diff-surfaces.integration.test.ts` (titled `Surface A`, `Surfaces B/C`, etc.) that spins up a real on-disk repo and verifies the behavior described here.

---

## The setup (what git is actually doing)

Git tracks your project as a chain of **snapshots**. Every time you commit, you add a new snapshot. The chain the whole team agrees is "the real version" is usually called **main**.

When you start work, you don't modify main directly. You make a parallel chain starting from main — add your own snapshots to it — and later merge them back. The spot on main where your parallel chain started is your **fork point**.

(Unrelated to "fork a GitHub repo." Confusingly the same word. Different meaning.)

A picture of what's on disk after you've made some commits:

```text
main:        A — B — C — D — E         ← main keeps advancing because
                     \                   other people merge their stuff
your branch:          X — Y — Z        ← you added X, Y, Z
```

- Your **fork point** is `C`.
- Your branch's latest snapshot is `Z`.
- Main's latest snapshot is `E` (it moved forward while you worked).

### Local vs. "real"

Your laptop has its own copy of main. GitHub has the actual main. These drift: your laptop's main might still think the latest is `C` while GitHub already has `E`. When your laptop is out of date we call that **stale**. The up-to-date version (on GitHub or wherever) is the **source of truth**.

A complication: some people contribute to someone else's project by first copying the whole project onto their own GitHub account (this IS what "fork a GitHub repo" means). In that case, the project on their own GitHub account goes out of date the moment they stop syncing it, and the actual source of truth is someone else's GitHub account entirely. So we can't just assume "the remote called `origin` is fresh main" — for those users, it isn't.

**The old code assumed `origin` was always the real main.** That was wrong for anyone contributing from a fork. The code now reads git's configured "which remote is this branch actually tracking" setting, which is always correct.

---

## The three ways we compare

When we show you "what changed," we pick one of three comparison flavors under the hood.

### Flavor 1 — "current main vs. current me"
Compare main's latest snapshot directly to your branch's latest snapshot, and show every line that differs between them.

**Problem:** if someone else merged to main while you were working, their changes show up as if *you* deleted them (because their changes are on main but not on your branch). Your "I changed X files" number would grow every time someone else merged, even though you did nothing.

This is what v2 used before the fix. That's why users saw the number creep up.

### Flavor 2 — "me since I forked"
Compare the snapshot at your fork point to your branch's latest snapshot. Ignore everything main did after you forked.

This is what GitHub shows on a pull request's "Files changed" tab. It's stable — the number only changes when *you* change things.

**This is what v2 uses now.**

### Flavor 3 — "list of my new commits"
Not a line-level diff — just a list of your new snapshots. "Show me the commits I added that aren't on main."

---

## Where each flavor shows up

### A. Creating a new workspace

**What you see:** You hit "Create" in the new workspace modal. A new folder appears on disk.

**What git does:** Starts your new branch from a specific point.

**Before:** We used your laptop's copy of main, which might be days behind the real main.

**Now:** We use the real, up-to-date main from the server. For most people that's just `origin/main`. For people contributing from a GitHub fork, it's the actual source repo (not their outdated copy).

**Why it matters:** Starting from a stale version means your workspace begins behind before you do anything. You'll hit merge conflicts later because main has moved on while you were "behind" the whole time.

**Code:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts` `create` procedure.

---

### B. The small number badge next to each workspace in the left sidebar (and "+N −N" on hover)

**What you see:** A count of changed files in the left nav, and on hover a breakdown of added/removed lines.

**Flavor:** "Me since I forked" (Flavor 2), against real main.

**Before:** Flavor 1 against your laptop's copy of main. The number drifted upward as main advanced, and for fork-a-repo users it was comparing against their own stale fork, not the real project.

**Now:** Stable. Only changes when you change things.

**Code path:** `apps/desktop/src/renderer/hooks/host-service/useDiffStats/useDiffStats.ts` → `git.getStatus` → reads `againstBase` response field.

---

### C. The "Changes" tab inside a workspace (file list + totals at the top)

**What you see:** Inside a workspace, the Changes tab: list of files, each with "+N −N," and a header showing totals.

**What git does:** Three separate comparisons merged into one list:

1. **Files different from main, since you forked** (Flavor 2) — same as B.
2. **Staged** — files you've told git you're ready to commit but haven't yet (you ran `git add` on them).
3. **Unstaged** — files you've edited but haven't told git about yet.

If the same file appears in multiple buckets, the most recent reality wins.

**Code path:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/hooks/useChangeset/useChangeset.ts` → `git.getStatus` → merges `againstBase`, `staged`, `unstaged`.

---

### D. Clicking a file in Changes tab to see the actual diff

**What you see:** Click a file → side-by-side or inline view of the old and new content.

**Flavor:** Flavor 2 — the "original" side is the file's content at your fork point, not at main's current tip.

**Why:** Matches what the file list (C) already filters by. If main happened to also modify that same file in some unrelated way after you forked, we don't show those unrelated changes as part of your diff. (This differs from the pre-fix version which used Flavor 1 — sometimes noisy for files both branches had touched.)

**Code:** `git.getDiff` with category `against-base` → runs `git merge-base <base> HEAD` to find the fork-point commit, then shows `<fork-point>:<path>` against `HEAD:<path>`.

---

### E. The "Commits" section inside a workspace

**What you see:** A list of commits you've added on this branch since forking.

**Flavor:** Flavor 3 (list of my new commits), against real main.

**Code:** `git.listCommits` → `git log <realMain>..HEAD`.

---

### F. Ahead/behind counts in branch lists

**What you see:** Branch rows in the picker sometimes show "3 ahead, 1 behind main."

**What git does:** Counts commits on each side of the fork point that the other doesn't have.

**Fix:** Same story as everywhere else — the "main" in "ahead/behind main" is now the real main, not the hardcoded `origin` copy.

**Code:** `git.listBranches` → `buildBranch` → `git rev-list --left-right --count`.

---

### G. Clicking a specific commit to see its files

**What you see:** Click a commit in the list → see which files that one commit changed.

**What git does:** Compares the commit to the one immediately before it. Not a branch-vs-branch comparison, so no "which main?" question.

**Status:** Already correct before this PR. Untouched.

**Code:** `git.getCommitFiles`.

---

## Separately: renamed files

Unrelated to the main/upstream stuff above. If you renamed a file (e.g. `foo.ts` → `bar.ts`) and changed some lines during the rename, the sidebar used to show `+0 −0` for that file.

**Why it was wrong:** Git has two output formats for line counts. The text format represents renames as a single entry labeled `foo.ts => bar.ts`. The old code was trying to look up "bar.ts" in a map whose key was literally `foo.ts => bar.ts`, so it never matched and we'd get zero.

**Fix:** Switched to git's binary-safe output format (`--numstat -z`), which separates the old and new names into distinct fields. The parser now records line counts under both names. Renamed files show their real line counts.

**Code:** `parseNumstat` in `packages/host-service/src/trpc/router/git/utils/git-helpers.ts`.

---

## Edge cases

- **No configured upstream on local main** (very rare — someone manually untracked the branch). We fall back to `origin/<branch>` — same behavior as before the fix. These users are no worse off than before, but also don't benefit from fork-aware comparisons.
- **Disconnected histories** (local main and upstream main share no commits). `git merge-base` returns nothing; the per-file diff (D) falls back to comparing against the base tip directly. Would only happen in broken repos.
- **Workspace branch name matches a remote branch incidentally** (e.g. you named your workspace branch `main`). The workspace creation path guards against this by keying on the picker's "is this a local branch or remote-only" hint.

---

## Summary table

| Surface | What git does | Base ref |
| --- | --- | --- |
| A. New workspace start-point | `git worktree add` from a specific commit | Real main (branch's configured upstream) |
| B. Sidebar badge + hover totals | Flavor 2 file-level diff | Real main |
| C. Changes tab list + totals | Flavor 2 + staged + unstaged, merged | Real main |
| D. Per-file diff view | Flavor 2 content comparison (via merge-base) | Real main |
| E. Commits section | Flavor 3 commit listing | Real main |
| F. Ahead/behind counts | Symmetric commit count | Real main |
| G. Per-commit file list | Parent-to-commit content comparison | N/A (commit-to-commit) |

"Real main" throughout means: the remote-tracking branch that your local default branch is configured to track (e.g. `upstream/main` for fork contributors, `origin/main` for everyone else).
