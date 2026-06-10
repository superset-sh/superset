Set up [Superset workspace setup & teardown scripts](https://docs.superset.sh/setup-teardown-scripts) for this project.

## Goal

Create `.superset/config.json` in the repository root with `setup` and `teardown` commands tailored to this project — plus a `run` command if it has a dev server. First inspect the codebase to figure out the right commands: detect the package manager, how dependencies are installed, how the dev server starts, and any services (databases, Docker, etc.) that need to start and stop. Then write commands that match what you find.

## What each field does

- **setup** — runs in a terminal every time a new workspace is created. Use it to install dependencies and prepare the workspace (install packages, copy env files, start required services).
- **teardown** — runs when a workspace is deleted. Undo whatever setup started (e.g. stop and remove containers).
- **run** (optional) — an on-demand dev-server command launched by the Run button, in its own pane. Prefer this over putting long-running servers in `setup`: run commands are restartable and don't block workspace creation.

Setup and teardown commands run sequentially in the workspace directory.

## Format

```json
{
  "setup": ["bun ./.superset/setup.ts"],
  "teardown": ["docker compose down"],
  "run": ["bun run dev"]
}
```

## Environment variables available to scripts

- `SUPERSET_ROOT_PATH` — path to the root repository
- `SUPERSET_WORKSPACE_NAME` — current workspace name
- `SUPERSET_WORKSPACE_PATH` — path to the workspace worktree

## Examples

**Node.js**

```json
{ "setup": ["bun install"], "run": ["bun run dev"] }
```

**Docker**

```json
{
  "setup": ["docker compose up -d", "bun run db:migrate"],
  "teardown": ["docker compose down -v"]
}
```

## Tips

- Keep setup fast — it runs on every workspace creation.
- For anything non-trivial, prefer a portable Bun/Node script and call it: `"setup": ["bun ./.superset/setup.ts"]` (create the script too).
- If the project is platform-specific, use native script files for that platform: `.ps1`/`.cmd`/`.bat` on Windows, `.sh` on Unix shells.
- Commit `.superset/` so your team shares the same setup.

When you're done, briefly summarize what you configured and why.
