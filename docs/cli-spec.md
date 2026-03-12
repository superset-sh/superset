# Superset CLI Specification

## Overview

The `superset` CLI lets users interact with the Superset desktop app from the terminal. Instead of switching to the app to open a project, create a worktree, or check status, users can do it inline from their shell.

**Scope:** macOS first. Other platforms are future work.

## Architecture

```text
┌──────────────┐         superset://          ┌──────────────────┐
│  superset    │  ──── deep link protocol ──► │  Desktop App     │
│  CLI binary  │                              │  (Electron)      │
│              │  ◄─── local SQLite reads ──  │                  │
└──────────────┘                              └──────────────────┘
```

Two layers:

1. **CLI layer** — parses arguments, resolves paths, constructs intent. Lives in `packages/scripts/`.
2. **Desktop bridge** — communicates with the desktop app via the `superset://` deep link protocol (already registered in `apps/desktop/electron-builder.ts` and handled in `apps/desktop/src/main/index.ts`). Read-only queries (status, list) go directly against the local SQLite database via `@superset/local-db`.

The CLI does not embed application logic. It translates user intent into either a deep link (for actions that need the desktop app) or a local DB query (for read-only info).

## Package

| Field | Value |
|-------|-------|
| Location | `packages/scripts/` |
| Package name | `@superset/cli` |
| Binary name | `superset` |
| Entry point | `src/bin.ts` |
| Runtime | Bun |

Follows the existing `@superset/desktop-mcp` pattern: `bin` field in `package.json` points directly to a `.ts` file with a `#!/usr/bin/env bun` shebang.

### Dependencies

- `@superset/local-db` — read project/worktree/workspace data from local SQLite
- Lightweight arg parser (e.g., `arg`) or manual parsing — the command surface is small enough either way
- `open` (or `Bun.spawn` with macOS `open` command) — to trigger `superset://` URLs

## Command Reference

### `superset .` / `superset <path>`

Open a project in the desktop app.

```bash
superset .                  # open cwd
superset ~/Projects/myapp   # open specific path
```

**Flow:**
1. Resolve the path to an absolute directory
2. Query local SQLite `projects` table for a matching `mainRepoPath`
3. If found → deep link to focus that project
4. If not found → deep link to create and open it from the given path

**Output:** `Opening in Superset...` then exit (fire-and-forget).

---

### `superset worktree <name> [path]`

Open a project with a named worktree workspace. Path defaults to cwd.

```bash
superset worktree my-feature
superset worktree hotfix-auth ~/Projects/myapp
```

**Flow:**
1. Resolve path to project (same as `superset .`)
2. Signal the desktop app to open or create a worktree-type workspace with the given name
3. Desktop app creates the git worktree on disk if it doesn't exist

This creates a full git worktree — a separate working directory with its own checked-out branch.

---

### `superset branch <name> [path]`

Open a project with a branch-type workspace. Path defaults to cwd.

```bash
superset branch feature/onboarding
superset branch fix/typo ~/Projects/myapp
```

**Flow:**
1. Resolve path to project
2. Signal desktop app to open or create a branch-type workspace

Unlike `worktree`, this is lightweight — no separate directory on disk, just a branch switch within the existing working tree.

---

### `superset dev [port]`

Open the built-in browser pane for the current workspace's dev server. Equivalent to pressing `cmd+shift+b` in the app, but pre-navigated to the detected (or specified) port.

```bash
superset dev         # auto-detect running dev server port
superset dev 3001    # open browser to localhost:3001
```

**Flow:**
1. Resolve cwd to a project and workspace (match against `mainRepoPath` or worktree `path`)
2. Signal the desktop app to open a browser pane in that workspace
3. If a port is specified, navigate to `localhost:<port>`
4. If no port specified, the app uses its port manager (which scans for listening TCP ports via `lsof` every 2.5s) to detect the dev server
5. If no port detected yet, opens browser to `about:blank` — the port badge appears once the server is up

---

### `superset login`

Initiate authentication.

```bash
superset login
```

**Flow:**
1. Deep link to the desktop app's auth/login flow
2. Desktop app handles OAuth
3. CLI prints `Opening login...` and exits

---

### `superset logout`

Clear the current auth session.

```bash
superset logout
```

**Flow:**
1. Deep link to the desktop app's logout/session-clear flow
2. CLI prints `Logged out.` and exits

---

### `superset status`

Show project and workspace info for the current directory. This is a read-only command — it queries the local SQLite database directly without needing the desktop app to be running.

```bash
superset status
```

**Example output:**
```text
Project:    myapp
Path:       ~/Projects/myapp
Branch:     main
Workspaces: 3 (2 worktree, 1 branch)
  ● my-feature  worktree  ~/.superset/worktrees/myapp/my-feature
  ● hotfix-auth  worktree  ~/.superset/worktrees/myapp/hotfix-auth
  ○ staging      branch
```

**Flow:**
1. Resolve cwd to absolute path
2. Query `projects` table by `mainRepoPath`, falling back to `worktrees` table by `path` (supports running from inside a worktree directory)
3. Query `workspaces` and `worktrees` tables by `projectId`
4. Print formatted output

If no project found: `No Superset project found for this directory.`

---

### `superset list`

List all known projects. Read-only, queries local SQLite directly.

```bash
superset list
```

**Example output:**
```text
Projects:
  myapp         ~/Projects/myapp          last opened 2h ago
  website       ~/Projects/website        last opened 1d ago
  api-server    ~/Projects/api-server     last opened 3d ago
```

---

### `superset pr`

Open the PR view for the current branch's workspace.

```bash
superset pr
```

**Flow:**
1. Resolve cwd to project and detect current git branch
2. Deep link to open the PR view for that branch in the desktop app

---

### `superset open <url>`

Open a Superset URL directly in the desktop app. Useful for opening shared links (e.g., from Slack or a browser) in the native app instead of the web.

```bash
superset open https://app.superset.sh/workspace/abc123
superset open superset://project/xyz
```

**Flow:**
1. If the URL is an `https://app.superset.sh/...` URL, extract the path and convert to a deep link
2. If the URL is already a `superset://` protocol URL, pass it through directly
3. Open via deep link — desktop app navigates to the appropriate view

---

### `superset config`

View and manage CLI configuration.

```bash
superset config                  # show current config
superset config set <key> <val>  # set a config value
superset config get <key>        # get a config value
superset config reset            # reset to defaults
```

**Config options:**

| Key | Default | Description |
|-----|---------|-------------|
| `default-workspace-type` | `worktree` | Default type for new workspaces (`worktree` or `branch`) |
| `auto-open` | `true` | Whether to launch the desktop app if not running |
| `output` | `text` | Output format (`text` or `json`) for status/list commands |

**Storage:** Config is stored in `~/.superset/cli.json`. The CLI reads this on every invocation.

---

## Installation

The CLI should be auto-installed to `/usr/local/bin/superset` as part of the desktop app's install process, similar to how VS Code installs the `code` command.

**Implementation approach:**
- During the Electron app build (`electron-builder.ts`), include a post-install step that symlinks or copies the CLI binary to `/usr/local/bin/superset`
- The binary should be a small shell wrapper or bun-compiled binary that invokes the CLI entry point
- For development: `bun link` in `packages/scripts/` makes the command available globally

**Considerations:**
- `/usr/local/bin/` may require elevated permissions — handle gracefully with a prompt or fall back to `~/.local/bin/`
- Provide a manual install command in the app's settings (like VS Code's "Install 'code' command in PATH")

## Desktop-Side Requirements

The desktop app needs to handle CLI-originated intents. The specific protocol routes and IPC mechanisms are internal implementation details. At minimum, the desktop app must support:

- **Open project by path** — given a filesystem path, create or focus the project
- **Open worktree workspace** — given a project + worktree name, create or focus the worktree workspace
- **Open branch workspace** — given a project + branch name, create or focus the branch workspace
- **Open browser pane** — given a workspace (+ optional port), open the built-in browser
- **Auth flows** — login and logout triggered externally
- **PR view** — navigate to PR view for a given branch
- **URL routing** — accept `app.superset.sh` URLs and navigate to the corresponding view

The existing deep link infrastructure (`processDeepLink` in `apps/desktop/src/main/index.ts`, renderer IPC via `deep-link-navigate`) provides the foundation. Route handling on the renderer side (TanStack Router) will need new routes or query params to support these intents.

## Key Existing Infrastructure

| Component | Location | Relevance |
|-----------|----------|-----------|
| Deep link protocol | `apps/desktop/electron-builder.ts:114-118` | `superset://` scheme registration |
| Deep link handler | `apps/desktop/src/main/index.ts:59-92` | Processes incoming protocol URLs |
| Local DB schema | `packages/local-db/src/schema/schema.ts` | projects, worktrees, workspaces tables |
| Port manager | `apps/desktop/src/main/lib/terminal/port-manager.ts` | Dev server port detection |
| Browser hotkey | `apps/desktop/src/shared/hotkeys.ts:552-556` | `meta+shift+b` → NEW_BROWSER |
| Existing CLI pattern | `packages/desktop-mcp/src/bin.ts` | Reference for bin entry structure |

## Future Considerations

- `superset task <description>` — create a task from the terminal
- Windows/Linux support
- Shell completions (bash, zsh, fish)
