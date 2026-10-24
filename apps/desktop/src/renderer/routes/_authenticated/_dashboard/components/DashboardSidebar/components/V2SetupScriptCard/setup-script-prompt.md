Set up [Superset workspace lifecycle scripts]({{DOCS_URL}}/setup-teardown-scripts) for this project.

## Goal

Create `.superset/config.toml` in the repository root with `[setup]` and `[archive]` commands tailored to this project, plus a `[terminals.dev]` entry if it has a dev server. First inspect the codebase to figure out the right commands: detect the package manager, how dependencies are installed, how the dev server starts, and any services (databases, Docker, etc.) that need to start and stop. Then write commands that match what you find. If the project already has `.superset/config.json`, convert it instead of starting over.

## What each section does

- **`[setup]`**: runs in a terminal every time a new workspace is created. Use it to install dependencies and prepare the workspace (install packages, copy env files, start required services). Keep it safe to run more than once.
- **`[archive]`**: runs when a workspace is archived. Undo what setup started outside the workspace (e.g. stop and remove containers, drop a database).
- **`[terminals.<name>]`** (optional): long-running commands such as dev servers. The one with `default = true` is what the Run button starts, in its own pane. Prefer this over putting servers in `[setup]`: they're restartable and don't block workspace creation.

Commands in a section run in order in the workspace directory and stop at the first failure. Each section takes `run` (a command or a list) and optionally `cwd` (relative to the workspace root). Unknown keys are errors.

## Format

```toml
[setup]
run = ["bun install", 'cp "$SUPERSET_ROOT_PATH/.env" .env']

[terminals.dev]
run = "bun dev"
default = true

[archive]
run = ["docker compose down"]
```

## Environment variables available to scripts

- `SUPERSET_ROOT_PATH`: path to the main checkout
- `SUPERSET_WORKSPACE_NAME`: current workspace name
- `SUPERSET_WORKSPACE_PATH`: path to the workspace worktree

## Examples

**Node.js**

```toml
[setup]
run = ["bun install", 'cp "$SUPERSET_ROOT_PATH/.env" .env']
```

**Docker**

```toml
[setup]
run = ["docker compose up -d", "bun run db:migrate"]

[archive]
run = ["docker compose down -v"]
```

## Tips

- Keep setup fast: it runs on every workspace creation.
- For anything non-trivial, put the logic in a shell script and call it: `run = "./.superset/setup.sh"` (create the script too).
- Commit `.superset/config.toml` so your team shares the same setup.

When you're done, briefly summarize what you configured and why.
