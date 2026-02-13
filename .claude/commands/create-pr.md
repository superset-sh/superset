---
description: Analyze changes, generate structured PR title + body, and create a PR
allowed-tools: Bash, Read, Grep, Glob
---

Create a pull request for the current branch.

## Step 1: Validate

1. Confirm not on `main`/`master` branch
2. Check `gh auth status` works
3. Warn if uncommitted changes exist

## Step 2: Analyze Changes

First, determine the base branch to diff against:
- Run `git fetch origin main --quiet` to ensure the remote ref is up to date
- Use `origin/main` (not local `main`) as the base for all diff/log commands — local `main` may be stale

Run in parallel:
- `git log origin/main..HEAD --oneline` — commit history
- `git log origin/main..HEAD --format="%B---"` — full commit messages for context
- `git diff origin/main...HEAD --stat` — file change overview
- `git diff origin/main...HEAD` — full diff

Read the diff carefully to understand what changed and why.

## Step 3: Generate PR

Based on the actual diff and commit messages, draft:

**Title**: `<type>(<scope>): <description>` (under 72 chars)
- Types: feat, fix, chore, refactor, docs, test, perf, ci

**Body**:
```markdown
## Summary
<2-4 bullets: what changed and WHY>

## Changes
<Bulleted list of specific changes — group by area if touching multiple packages>

## Test Plan
- [ ] <specific verification steps>
```

## Step 4: Create

1. Push if needed: `git push -u origin HEAD`
2. Create PR: `gh pr create --title "..." --body "..."`
3. Return the PR URL

$ARGUMENTS
