---
description: Generate a .superset/config.json with setup and teardown scripts for a project
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

Help the user create a `.superset/config.json` file in the current working directory so that Superset workspaces automatically run setup and teardown commands.

This skill always operates on the current working directory. Any arguments passed are treated as additional context from the user (e.g., "I need Docker" or "skip teardown").

## Context

Superset runs setup commands when creating a workspace and teardown commands when deleting one. The config lives at `.superset/config.json` in the project root.

**Available environment variables in scripts:**

| Variable | Description |
|---|---|
| `SUPERSET_ROOT_PATH` | Path to the root repository |
| `SUPERSET_WORKSPACE_NAME` | Current workspace name |

**Config resolution order** (first found wins — no merging between levels):

1. `~/.superset/projects/<project-name>/config.json` — user override (not committed)
2. `<worktree>/.superset/config.json` — worktree-specific
3. `<repo>/.superset/config.json` — project default (commit this one to share with team)

This skill writes to the **repo-level** `.superset/config.json` so it can be committed and shared.

## Steps

1. **Detect the project type.** Use a single Glob call to check for all signals at once (e.g., `{package.json,bun.lock,bun.lockb,yarn.lock,pnpm-lock.yaml,package-lock.json,Cargo.toml,go.mod,requirements.txt,pyproject.toml,Pipfile,Gemfile,docker-compose.yml,docker-compose.yaml,Makefile,.env,.env.example}`). Then interpret the results:
   - `package.json` → Node.js project (use the lock file to determine the package manager: `bun.lock`/`bun.lockb` → Bun, `yarn.lock` → Yarn, `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm)
   - `Cargo.toml` → Rust project
   - `go.mod` → Go project
   - `requirements.txt` / `pyproject.toml` / `Pipfile` → Python project
   - `Gemfile` → Ruby project
   - `docker-compose.yml` / `docker-compose.yaml` → Docker project
   - `Makefile` → Check for common targets (`install`, `setup`, `build`)
   - `.env` or `.env.example` → Environment file that may need copying
   - Check for multiple signals — projects often combine them (e.g., Node.js + Docker)

2. **Check for an existing config.** If `.superset/config.json` already exists, show the user the current config and ask if they want to replace or update it. If they want to keep it, stop.

3. **Propose a concrete config.** Based on what you detected, build a specific `setup` and `teardown` array and present it to the user. For example, if you detected a Bun project with a `.env` file:

   > I detected a **Bun + Node.js** project with a `.env` file. Here's what I'd suggest:
   > ```json
   > {
   >   "setup": ["bun install", "cp \"$SUPERSET_ROOT_PATH/.env\" .env"],
   >   "teardown": []
   > }
   > ```

   Then use AskUserQuestion to let them confirm or adjust. Ask about specific additions only when the detection is ambiguous — don't ask open-ended questions about every possible feature. The goal is a working config with minimal back-and-forth. Note: `teardown` can be omitted entirely if there's nothing to clean up — don't include an empty array just for completeness.

4. **Generate the config.** Write `.superset/config.json` with the agreed-upon commands.

5. **Optionally generate helper scripts.** If the setup or teardown logic requires conditional logic (`if/else`, error handling, variable interpolation beyond the provided env vars), suggest creating `.superset/setup.sh` and/or `.superset/teardown.sh` shell scripts instead of inline commands. A few simple sequential commands (install, copy env, run migrations) are fine inline — only extract to scripts when the logic genuinely benefits from shell control flow. If the user agrees, create the scripts and reference them from the config:
   ```json
   {
     "setup": ["./.superset/setup.sh"],
     "teardown": ["./.superset/teardown.sh"]
   }
   ```
   Make sure to set the scripts as executable with `chmod +x`.

6. **Show the final result.** Print the generated config and any scripts for the user to review.

## Tips to Mention

- Keep setup fast — it runs every time a workspace is created.
- Commit `.superset/` to share the config with the team.
- Users can override project scripts locally at `~/.superset/projects/<project-name>/config.json` without creating git noise.

$ARGUMENTS
