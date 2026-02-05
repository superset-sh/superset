---
description: Analyze changes, generate structured PR title + body, and create a PR with approval
allowed-tools: Bash, Read, Grep, Glob
---

Create a pull request for the current branch by analyzing actual changes and generating a structured description.

## Step 1: Context Validation

Run these checks in parallel and stop if any fail:

1. **Branch check**: Run `git branch --show-current`. If the branch is `main` or `master`, stop and tell the user: "You're on the main branch. Switch to a feature branch first."
2. **Auth check**: Run `gh auth status`. If not authenticated, stop and tell the user to run `gh auth login`.
3. **Clean state check**: Run `git status --porcelain`. If there are uncommitted changes, warn the user and ask if they want to continue or commit first.
4. **Remote check**: Run `git log @{u}.. --oneline 2>/dev/null`. If the branch has no upstream or has unpushed commits, note that you'll need to push before creating the PR.

## Step 2: Gather Change Context

Run these commands in parallel to understand the full scope of changes:

1. `git log main..HEAD --oneline` — commit history since branching
2. `git diff main...HEAD --stat` — file change summary
3. `git diff main...HEAD` — full diff of all changes
4. `git log main..HEAD --format="%B---"` — full commit messages

Read the actual diff carefully. Understand what changed and why.

## Step 3: Generate PR Content

Based on the real diff and commit history (NOT summaries), draft:

### Title
- Under 72 characters
- Format: `<type>(<scope>): <description>` where type is one of: feat, fix, chore, refactor, docs, test, perf, ci
- Be specific about what changed — e.g., `feat(desktop): add workspace rename support` not `update desktop app`

### Body
Use this exact structure:

```markdown
## Summary
<2-4 bullet points describing what changed and WHY, based on the actual diff>

## Changes
<Bulleted list of specific, meaningful changes — group by area if touching multiple packages>

## Test Plan
- [ ] <Specific testing steps someone can follow to verify the changes>
- [ ] <Include edge cases worth checking>
```

## Step 4: Human Approval Gate

Display the generated title and full body to the user clearly formatted. Then ask:

**"Does this PR look good? Reply 'yes' to create it, or provide feedback to adjust."**

Do NOT proceed until the user explicitly approves.

## Step 5: Create the PR

Once approved:

1. If unpushed commits exist, run: `git push -u origin HEAD`
2. Create the PR using `gh pr create` with a HEREDOC for the body:
```bash
gh pr create --title "the title" --body "$(cat <<'EOF'
## Summary
...

## Changes
...

## Test Plan
...
EOF
)"
```
3. Run `gh pr view --web` to open the PR in the browser.
4. Display the PR URL to the user.

$ARGUMENTS
