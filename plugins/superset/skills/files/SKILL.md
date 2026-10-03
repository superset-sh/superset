---
name: files
description: Open a file in a pane of the user's Superset workspace, beside the terminal the agent runs in, optionally scrolled to a line. Use when the user says "open that file", "show me the file", "pull it up", "open it at line N", or when the agent wants to put a file it just changed in front of the user.
argument-hint: file path, optionally with a line number
allowed-tools: Bash(superset:*)
---

# Open files in Superset panes

`superset files open` puts a file in a file pane of the user's workspace in the
desktop app. The pane opens beside the active pane of the active tab, which is
where the terminal you run in usually is. If the workspace is not on screen,
the desktop switches to it first. The command prints the pane id of each file.

## Usage

```bash
superset files open src/app.ts                     # beside the active pane
superset files open src/app.ts --line 120          # scrolled to a line (one file only)
superset files open a.ts b.ts c.ts                 # one request, three panes side by side
superset files open README.md --new-tab            # in its own tab
superset files open --workspace <id> /abs/path.ts  # a workspace other than the cwd's
```

Pass `--json` for `{ workspaceId, paths, paneIds }`.

## Rules

- Relative paths resolve against your current directory. Every path must name
  an existing file on the host; directories and missing files are refused.
- The workspace defaults to the one whose worktree contains your current
  directory, then `$SUPERSET_WORKSPACE_ID`. When neither applies, pass
  `--workspace <id>` from `superset workspaces list --local --json`, and
  `--host <id>` for a remote host.
- One file opens as a preview, like a click in the file tree: the next
  single-file open replaces it unless the user pinned the pane. Several files
  in one command stay open side by side.
- `--line` takes a single file; open several files without it.
- The desktop app must be running and signed in. A host with no desktop
  attached (a standalone `superset start`) has no panes and the command errors
  clearly; report that instead of retrying.
- Open a file when the user asked to see it, or to show them a change you
  made that they should review. Do not open files they did not ask about.
