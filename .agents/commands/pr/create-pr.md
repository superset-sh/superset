---
description: Create a pull request for the current branch (agent-driven, one-click)
argumentHint: "[--draft]"
---

# Goal

Create a pull request for the current branch in one pass. The user
clicked the Create PR button in the diff-editor sidebar — they expect
the PR to be created without further prompting.

An attachment named `pr-context.md` is included with this turn. It
contains:

- Current branch and base branch
- Whether the branch is published (has upstream)
- Commits ahead/behind upstream
- Whether there are uncommitted changes
- Required preconditions the user's branch must satisfy before
  `gh pr create` will succeed

Read `pr-context.md` first. Use it as ground truth instead of re-deriving
the state yourself.

# Arguments

- `--draft` — create the PR as a draft. Pass `--draft` through to the
  `gh pr create` call.

Parse the arguments from the user's prompt (everything after the skill
name). Do not ask the user to confirm the draft flag — it came from
their button click.

# Workflow

## 1. Satisfy preconditions

In the order listed in `pr-context.md` under "Required preconditions":

- **Uncommitted changes**: generate a commit message from the staged
  diff (use `git diff --cached` and `git status`). If nothing is
  staged, `git add -A`. Then `git commit -m "<message>"`. Keep the
  message short and specific — do not write a PR-body-style
  description here.
- **Unpublished branch**: `git push -u origin -- "<branch>"` — quote `<branch>`
  to avoid shell injection on names with metacharacters.
- **Unpushed commits on a published branch**: `git push`.
- **Behind upstream**: stop. Report to the user that they should sync
  first. Do not force-push. Do not rebase without asking.

If any push fails non-fast-forward, stop and report — never
force-push.

## 2. Draft the PR body

Use `git log "<base>..HEAD"` to read the commits, `git diff "<base>...HEAD"`
for the scope of changes. Produce:

- **Title**: short, imperative, derived from the most recent commit
  message or the scope of the diff.
- **Body**: concise. Summary + a short Test Plan checklist. Skip
  sections that have nothing meaningful to say — do not pad.

## 3. Create the PR

```
gh pr create \
  --base <defaultBranch> \
  --title "<title>" \
  --body "<body>"
```

If `--draft` was passed, add `--draft`.

## 4. Report back

Print the PR URL as a plain link on its own line. One short sentence
above it summarizing what you did (e.g. "Published `feature-x` and
opened draft PR."). Do not paste the full body back.

# Guardrails

- Never force-push.
- Never skip pre-commit hooks (`--no-verify`) or signing.
- If a hook fails, report the failure; do not retry with `--no-verify`.
- Do not open a browser — the caller handles that.
- Do not run a full `AGENTS.md` standards review in this skill. The
  button is a fast path; use `/create-pr` (the general-purpose skill)
  for the gated review flow.
