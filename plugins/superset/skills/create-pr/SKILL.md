---
name: create-pr
description: Open a pull request for the current branch in one pass: review the commits against the base branch, write a conventional-commit title and a structured description, commit and push what is pending, then create the PR. Use when the user clicks Create PR in Superset or asks to open a PR for the branch they are on.
argument-hint: optional --draft
allowed-tools: Bash(git:*) Bash(gh:*)
---

# Create PR

The user clicked Create PR. They expect the pull request to exist when you
are done, without being asked to confirm anything along the way. Edit this
file to change how your PRs are titled and described; Superset re-sends
these instructions with every click.

A `<pr-context>` block follows these instructions. It carries the branch and
base names, the commits ahead of the base, a per-file diffstat, and a
size-capped patch. Treat it as ground truth for what the branch contains;
only re-derive with `git` when the block says it was truncated and a file
you need is missing.

## 1. Understand the change

Read every commit subject and body, then the diffstat and patch. Decide what
the branch does as a whole: one PR describes one change, even when it took
several commits to land. Generated files (lockfiles, translation catalogs,
snapshots) are excluded from the patch and marked in the diffstat; do not
describe them unless they are the point of the change.

## 2. Write the title

Conventional-commit form, lowercase type, imperative mood, no trailing period,
under 72 characters:

    <type>(<scope>): <what changed>

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`,
`ci`. The scope is the app or package that changed (`desktop`, `host-service`,
`web`, `mobile`, `cli`, …); omit it when the change spans the repo. Say what
the user gets, not which files moved.

## 3. Write the description

Markdown, proportionate to the change. Skip a section rather than padding it.

    ## Summary
    One to three bullets: what changed and why it matters.

    ## Why
    The problem or motivation, with context a reviewer six months from now
    will need. Link the issue or ticket when a commit message names one.

    ## How it works
    The approach at a high level: decisions, trade-offs, anything non-obvious
    in the diff. Omit for trivial changes.

    ## Testing
    What was actually run (commands, manual checks). Say "not run" for anything
    you did not verify; never claim a test you did not see pass.

Never invent behaviour the diff does not show. If the commits are terse, the
patch is your source; describe what the code does.

## 4. Commit and push if needed

Run `git status --porcelain` and `git status -sb`:

- Uncommitted changes: stage them (`git add -A`) and commit with a short
  conventional-commit message derived from the diff. Do not write the PR
  description into the commit.
- No upstream: `git push -u origin HEAD`.
- Commits ahead of upstream: `git push`.
- Behind or diverged from upstream: stop and report it. Do not force-push, do
  not rebase, do not pull.

If a push or hook fails, stop and report the failure. Never retry with
`--no-verify` or `--force`.

## 5. Create the pull request

    gh pr create --base <base> --title "<title>" --body "$(cat <<'EOF'
    <description>
    EOF
    )"

`<base>` is the base branch named in `<pr-context>`. Add `--draft` when the
instructions that follow ask for a draft. If `gh` reports that a PR already
exists for this branch, report its URL instead of creating another.

## 6. Report

Reply with one sentence saying what you did and the PR URL on its own line.
Do not paste the description back.

## Guardrails

- Never force-push, rebase, or rewrite history.
- Never skip hooks or signing.
- Never change git config or the base branch.
- Do not open a browser; the app shows the PR once it exists.
