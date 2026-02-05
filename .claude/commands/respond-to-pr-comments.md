---
description: Fetch PR review comments, prioritize them, and address each one
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

Fetch and address all review comments on the current branch's pull request.

## Step 1: Context Validation

Run these checks and stop if any fail:

1. **Auth check**: Run `gh auth status`. If not authenticated, stop and tell the user to run `gh auth login`.
2. **PR check**: Run `gh pr view --json number,title,url,state` to find the PR for the current branch. If no PR exists, stop and suggest the user create one first (or use `/create-pr`).
3. **PR state check**: If the PR is merged or closed, stop and inform the user.

## Step 2: Fetch All Review Comments

Run these commands in parallel:

1. `gh pr view --json reviews` — top-level reviews with their verdicts
2. `gh pr view --json comments` — general PR comments
3. Use the GitHub API for inline review comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate
   ```

Extract the PR number, owner, and repo from `gh pr view`.

## Step 3: Enumerate & Categorize Comments

List every comment with this structure:

```
### Comment #N [PRIORITY]
**From**: @reviewer
**File**: path/to/file:line (if inline) or "General" (if top-level)
**Status**: Pending / Resolved
**Comment**: <the actual review comment>
```

Categorize each comment into one of these priorities:
- **BLOCKER** — Requests a required change, points out a bug, or flags a security/correctness issue
- **SUGGESTION** — Optional improvement, style preference, or alternative approach
- **QUESTION** — Asks for clarification or context
- **NITPICK** — Minor style/formatting issue
- **PRAISE** — Positive feedback (no action needed)

Sort comments: BLOCKERs first, then SUGGESTIONs, QUESTIONs, NITPICKs, PRAISE last.

## Step 4: Present Summary

Display a summary table:

```
## PR Review Summary: <PR title> (#<number>)

| Priority   | Count |
|------------|-------|
| BLOCKER    | N     |
| SUGGESTION | N     |
| QUESTION   | N     |
| NITPICK    | N     |
| PRAISE     | N     |

### Action Required
<List only comments that need a response or code change>
```

## Step 5: Address Comments

For each non-PRAISE comment, starting with BLOCKERs:

1. **Read the relevant code** around the commented file/line to understand the full context
2. **Determine the right action**:
   - Code change needed → make the edit and explain what you changed
   - Clarification needed → draft a reply explaining the reasoning
   - Disagreement → present both perspectives and let the user decide
3. **Show the user what you plan to do** before making changes for BLOCKERs
4. After addressing all comments, display a summary of changes made

## Step 6: Final Summary

After addressing all comments:

```
## Resolution Summary

### Changes Made
- <file>: <what changed and why>

### Replies Drafted
- Comment #N: <brief summary of reply>

### Needs User Input
- Comment #N: <why manual decision is needed>
```

Suggest the user review the changes, then push and mark conversations as resolved on GitHub.

$ARGUMENTS
