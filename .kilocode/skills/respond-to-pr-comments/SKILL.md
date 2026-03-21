---
name: respond-to-pr-comments
description: Fetch PR review comments, prioritize them, and address each one
---

# Respond to PR Comments

Address all review comments on the current branch's PR.

## Step 1: Fetch Comments

1. Get PR info and extract the repo and PR number:
   ```
   gh pr view --json number,url,title,state,reviews,comments
   ```
   Parse the `number` field and the repository `owner/repo` from the `url` field (or use `gh repo view --json nameWithOwner -q .nameWithOwner`).

2. Using the resolved values, get inline review comments:
   ```
   gh api repos/{owner}/{repo}/pulls/{number}/comments
   ```
   Replace `{owner}/{repo}` and `{number}` with the concrete values from step 1.

Stop if no PR exists or it's closed/merged.

## Step 2: List & Prioritize

List each comment with: reviewer, file/line (if inline), and the comment text.

Categorize each:
- **BLOCKER** — requests a required change or flags a bug/security issue
- **QUESTION** — asks for clarification (needs a reply)
- **SUGGESTION** — optional improvement (may ignore or adopt)
- **NITPICK** — minor style issue (fix quickly or ignore)

Address BLOCKERs first, then QUESTIONs.

## Step 3: Address Each

For each comment:
1. Read the relevant code for context
2. Either make the fix, or draft a reply if it needs discussion
3. **For BLOCKERs: show the user what you plan to change before editing**

Summarize what you changed and any replies needed.
