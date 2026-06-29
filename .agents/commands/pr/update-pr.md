---
description: Update the existing pull request for the current branch (agent-driven, one-click)
---

# Goal

Refresh the existing pull request for the current branch in one pass.
The user clicked the Update PR button in the diff-editor sidebar —
they expect commits to land on the PR's branch and the PR title/body
to reflect what's there now, without further prompting.

PR context is provided alongside this turn — **either as a file
attachment named `pr-context.md`, or fenced inline after the slash
command** (look for a `# PR context` heading). It contains:

- The PR number, URL, state (open/draft/closed/merged) and repo
- Current branch and base branch
- Whether the branch is published (has upstream)
- Commits ahead/behind upstream
- Whether there are uncommitted changes
- Required preconditions before the update can proceed

Read the PR context first. Use it as ground truth instead of
re-deriving the state yourself.

If the PR context contains a `## Project guidelines` section near the
end, treat its bullets as **non-negotiable preferences** for this
repo's PRs (e.g. title formats, required body sections, draft
defaults). Apply them when re-deriving the title and body in step 2.
Project guidelines override only stylistic defaults — they don't
relax any guardrails below.

# Workflow

## 1. Satisfy preconditions

In the order listed in the PR context under "Required preconditions":

- **Uncommitted changes**: generate a commit message from the staged
  diff (use `git diff --cached` and `git status`). If nothing is
  staged, `git add -A`. Then `git commit -m "<message>"`. Keep the
  message short and specific.
- **Unpushed commits on a published branch**: `git push`.
- **Behind upstream**: stop. Report to the user that they should sync
  first. Do not force-push. Do not rebase without asking.

If any push fails non-fast-forward, stop and report — never
force-push.

## 2. Refresh the PR title and body

Re-derive the title and body the same way you would for a fresh PR:

- Read commits with `git log "<base>..HEAD"` and the scope with
  `git diff "<base>...HEAD"`.
- Produce a short imperative title and a concise body (Summary +
  short Test Plan). Do not pad.

Compare against the current PR title/body
(`gh pr view <number> --json title,body`). If they have meaningfully
drifted (new commits, removed scope, different intent), update with:

```
gh pr edit <number> \
  --title "<new title>" \
  --body "<new body>"
```

If the title and body still accurately describe HEAD, leave them
alone and say so when reporting back. Don't churn the PR description
for no reason.

## 3. Ready for review (if draft)

If the PR is currently a draft AND the user explicitly asked to mark
it ready for review in this message, run:

```
gh pr ready <number>
```

Otherwise leave it as a draft.

## 4. Report back

Print the PR URL as a plain link on its own line, preceded by one
short sentence summarizing what changed (e.g. "Pushed 2 commits and
refreshed the description.", or "Nothing to update — PR is in sync.").
Do not paste the full body back.

# Guardrails

- Never force-push.
- Never skip pre-commit hooks (`--no-verify`) or signing.
- If a hook fails, report the failure; do not retry with `--no-verify`.
- Do not close, reopen, or convert the PR to draft. Only edits and the
  optional `gh pr ready` are allowed by this skill.
- Do not open a browser — the caller handles that.
