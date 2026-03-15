You are working on task "Fix presets cwd directory being ignored in worktrees" (fix-presets-cwd-directory-being-ignored-in-worktre).

Priority: high
Status: In Progress

## Task Description

Presets are not respecting the configured `cwd` (current working directory) setting, particularly when working in git worktrees. This causes commands to execute in the wrong directory context.

Related issues in other tools suggest this is often caused by:
- Working directory inheritance not being properly set when spawning processes
- Worktree paths not being correctly resolved
- CWD being overridden by parent process or default behavior

Need to investigate:
- How presets currently handle `cwd` configuration
- Whether this is specific to worktree contexts or affects all presets
- Ensure `cwd` is properly passed through to spawned processes

## Instructions

You are running fully autonomously. Do not ask questions or wait for user feedback — make all decisions independently based on the codebase and task description.

1. Explore the codebase to understand the relevant code and architecture
2. Create a detailed execution plan for this task including:
   - Purpose and scope of the changes
   - Key assumptions
   - Concrete implementation steps with specific files to modify
   - How to validate the changes work correctly
3. Implement the plan
4. Verify your changes work correctly (run relevant tests, typecheck, lint)
5. When done, use the Superset MCP `update_task` tool to update task "989b3018-b07d-4d4d-9689-380580a528bc" with a summary of what was done