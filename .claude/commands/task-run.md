---
description: Create a task, workspace, and start a Claude Code session to work on it
allowed-tools: mcp__superset__create_task, mcp__superset__list_task_statuses, mcp__superset__list_devices, mcp__superset__list_projects, mcp__superset__create_workspace, mcp__superset__start_claude_session
---

Create a new task in Superset, spin up a workspace, and start a Claude Code session to work on it.

## Input

Parse `$ARGUMENTS` for:
- **Description** (required): The task title/description — this is the main text
- **Priority** (optional): One of `urgent`, `high`, `medium`, `low`, `none`. Defaults to `none` if not specified. The user may specify this naturally (e.g., "high priority", "p1", "urgent", etc.)

## Steps

### 1. Create the task

- Parse the arguments to extract the task description and optional priority
- Generate a clear, concise task title from the description (imperative form, under 80 chars)
- If the user provided more detail beyond a short title, include it as a markdown description on the task
- Create the task using `mcp__superset__create_task` with:
  - `title`: The generated title
  - `description`: Expanded detail if provided, otherwise omit
  - `priority`: Parsed priority or `none`
  - `assigneeId`: `2dacb80b-7af1-41c4-8611-1e1e425ef720`

### 2. Create a workspace

- Device ID: `2918d81578e8e4035a630f0eca401d7b` (Kiets-Macbook-Pro)
- Project ID: `WfSZYEbP5ncqATcrE4Yin` (superset)
- Generate a kebab-case workspace name from the task title (short, max 4-5 words)
- Generate a branch name in the format `fix/...` for bugs or `feat/...` for features, based on the task type
- Create the workspace using `mcp__superset__create_workspace`

### 3. Start Claude Code session

- Start a Claude Code session using `mcp__superset__start_claude_session` with the created task ID and workspace ID

## Output

Confirm with a summary:
- Task: title, priority, slug
- Workspace: name, branch
- Claude Code: running

$ARGUMENTS
