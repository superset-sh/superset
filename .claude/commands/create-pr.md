---
description: Analyze changes, generate structured PR title + body, and create a PR with approval
allowed-tools: Bash, Read, Grep, Glob
---

Create a pull request for the current branch.

## Step 1: Validate

1. Confirm not on `main`/`master` branch
2. Check `gh auth status` works
3. Warn if uncommitted changes exist

## Step 2: Analyze Changes

Run in parallel:
- `git log main..HEAD --oneline` — commit history
- `git log main..HEAD --format="%B---"` — full commit messages for context
- `git diff main...HEAD --stat` — file change overview
- `git diff main...HEAD` — full diff

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

## Step 4: Get Approval

Show the title and body, then ask: **"Create this PR? (yes/no or feedback)"**

Do NOT proceed without explicit approval.

## Step 5: Create

1. Push if needed: `git push -u origin HEAD`
2. Create PR: `gh pr create --title "..." --body "..."`
3. Open in browser: `gh pr view --web`

$ARGUMENTS
