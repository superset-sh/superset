---
description: Fetch PR review comments, prioritize them, and address each one
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

Address all review comments on the current branch's PR.

## Step 1: Fetch Comments

1. Get PR info: `gh pr view --json number,title,url,state,reviews,comments`
2. Get inline comments: `gh api repos/{owner}/{repo}/pulls/{number}/comments`

Stop if no PR exists or it's closed/merged.

## Step 2: List & Prioritize

List each comment with: reviewer, file/line (if inline), and the comment text.

Mark as **BLOCKER** if it requests a required change or flags a bug. Everything else is lower priority.

Address BLOCKERs first.

## Step 3: Address Each

For each comment:
1. Read the relevant code for context
2. Either make the fix, or draft a reply if it needs discussion
3. For BLOCKERs, confirm with user before making changes

Summarize what you changed and any replies needed.

$ARGUMENTS
