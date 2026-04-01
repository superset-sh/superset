---
description: Create a Superset workspace via deep link
allowed-tools: Bash(open superset://*), Bash(sqlite3 ~/.superset/local.db *)
---

Create a new Superset workspace by opening a deep link that triggers the app's native workspace creation flow.

## Input

Parse `$ARGUMENTS` for:
- **prompt** (required): A description of what you'll work on — used for AI auto-naming and branch generation
- **project** (optional): Project name or ID. If omitted, auto-detect from the current git repo by matching `mainRepoPath` in the Superset DB
- **branch** (optional): Specific branch name. If omitted, one is auto-generated
- **base** (optional): Base branch to branch from. Defaults to project's configured base branch
- **existing** (optional): If the user says "existing branch" or "use existing", set `useExistingBranch=true`

## Steps

### 1. Resolve project

If no project was specified, detect it from the current repo:

```bash
sqlite3 ~/.superset/local.db "SELECT id, name FROM projects;"
```

Match against the current git remote or working directory to find the right project. If multiple projects exist and it's ambiguous, ask the user.

### 2. Build the deep link URL

Construct: `superset://workspaces/create?<params>`

Parameters (URL-encode all values):
- `projectName=<name>` or `projectId=<id>`
- `prompt=<description>` — the user's prompt/description
- `name=<workspace-name>` — optional, a short human-readable name derived from the prompt
- `branchName=<branch>` — optional, if user specified one
- `baseBranch=<base>` — optional, if user specified one
- `useExistingBranch=true` — only if user requested existing branch

If no `name` is provided but a `prompt` is, generate a short workspace name (3-5 words) from the prompt.

### 3. Open the deep link

```bash
open 'superset://workspaces/create?...'
```

## Output

Confirm with:
- Project name
- The deep link URL that was opened
- Note that the workspace will appear in Superset's sidebar

$ARGUMENTS
