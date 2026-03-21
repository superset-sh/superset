---
name: task
description: Create a task and assign it to me via Superset MCP
---

# Create Task

Create a new task in Superset and assign it to the current user.

## Input

The user provides:
- **Description** (required): The task title/description — this is the main text
- **Priority** (optional): One of `urgent`, `high`, `medium`, `low`, `none`. Defaults to `none` if not specified. The user may specify this naturally (e.g., "high priority", "p1", "urgent", etc.)

## Steps

1. Parse the input to extract the task description and optional priority
2. Generate a clear, concise task title from the description (imperative form, under 80 chars)
3. If the user provided more detail beyond a short title, include it as a markdown description on the task
4. Resolve the current user's member ID by calling `mcp__superset__list_members` and matching against the git user (run `git config user.email` to get the current user's email)
5. Create the task using `mcp__superset__create_task` with:
   - `title`: The generated title
   - `description`: Expanded detail if provided, otherwise omit
   - `priority`: Parsed priority or `none`
   - `assigneeId`: The resolved member ID from step 4

## Output

Confirm the task was created with its title, priority, and slug.
