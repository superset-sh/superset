---
name: task-run
description: Create a task, workspace, and start an AI agent session to work on it
---

# Task Run

Create a new task in Superset, spin up a workspace, and start an AI agent session to work on it.

## Input

The user provides:
- **Description** (required): The task title/description — this is the main text
- **Priority** (optional): One of `urgent`, `high`, `medium`, `low`, `none`. Defaults to `none` if not specified. The user may specify this naturally (e.g., "high priority", "p1", "urgent", etc.)

## Steps

### 0. Resolve current user and environment

**Phase A** — run in parallel (no dependencies):
- Call `mcp__superset__list_members` and match against the git user email (`git config user.email`) to get the current user's member ID
- Call `mcp__superset__list_devices` and select the device owned by the current user

**Fail-fast**: If no matching member is found, abort with an error (e.g., "No Superset member matches git email `<email>`"). If no device is found for the current user, abort with an error (e.g., "No device found for member `<memberId>`").

**Phase B** — depends on Phase A (needs the resolved device):
- Call `mcp__superset__list_projects` for the resolved device and select the project matching the current git repo

**Fail-fast**: If no matching project is found on the device, abort with an error (e.g., "No project on device `<deviceId>` matches the current repo").

Do not proceed to any mutation calls (create_task, create_workspace, start_agent_session) until all three identifiers (memberId, deviceId, projectId) are resolved and validated.

### 1. Create the task

- Parse the arguments to extract the task description and optional priority
- Generate a clear, concise task title from the description (imperative form, under 80 chars)
- If the user provided more detail beyond a short title, include it as a markdown description on the task
- Create the task using `mcp__superset__create_task` with:
  - `title`: The generated title
  - `description`: Expanded detail if provided, otherwise omit
  - `priority`: Parsed priority or `none`
  - `assigneeId`: The resolved member ID from step 0

### 2. Create a workspace

- Use the device ID and project ID resolved in step 0
- Generate a kebab-case workspace name from the task title (short, max 4-5 words)
- Generate a branch name based on task type:
  - `fix/...` for bugs and defects
  - `feat/...` for new features
  - `chore/...` for maintenance, dependency updates, or configuration changes
  - `docs/...` for documentation-only changes
  - `refactor/...` for code refactors with no behavior change
  - Default to `feat/...` if the type is ambiguous
- Create the workspace using `mcp__superset__create_workspace`

### 3. Start AI agent session

- Start an AI agent session using `mcp__superset__start_agent_session` with the created task ID and workspace ID

## Output

Confirm with a summary:
- Task: title, priority, slug
- Workspace: name, branch
- Agent session: running
