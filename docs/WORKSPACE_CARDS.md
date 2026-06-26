# Workspace Cards

Sidebar workspace items are multi-line cards. Which lines render is driven per project by the `workspaceCard` block of the repo's `.superset/config.json` — the same in-repo config surface as `setup`/`teardown` scripts. An agent (or a human) can edit the file directly; the app picks up changes live via a main-process file watcher.

## Resolution order

1. **Per-machine override** — stored in the app state when the user diverges from the file through the in-app card settings. Cleared automatically when a save matches the file again, or explicitly via "Reset to repo config".
2. **Repo config** — `<repo>/.superset/config.json`, `workspaceCard` key. Resolved through the local DB for v1 projects and through the host-service DB (`~/.superset/host/<orgId>/host.db`) for v2 cloud projects with a local checkout.
3. **Defaults** — everything on, no custom lines.

## Schema

```jsonc
{
  "workspaceCard": {
    "prTitle": true,        // PR title under the workspace name
    "prChecks": true,       // CI check status + review decision next to the PR title
    "diffStats": true,      // added/removed line counts
    "status": true,         // agent status line (working / permission / review)
    "linearTicket": true,   // ticket key + state from the synced task
    "customLines": []       // extra lines, see below
  }
}
```

All boolean fields default to `true`. `customLines` entries come in two shapes, discriminated by `type`:

### Command lines (`type: "command"`, the default)

```jsonc
{
  "id": "last-commit",      // unique per line
  "type": "command",        // optional — omitted means "command" (back-compat)
  "label": "last",          // optional prefix shown before the output
  "command": "git log -1 --format=%s",
  "enabled": true           // optional, defaults to true
}
```

The command runs in the workspace folder through `/bin/sh -lc` (5s timeout, 30s result cache) and the first line of its output renders on the card. Same trust model as the project's setup/run scripts — the user authored the command.

### Component lines (`type: "component"`)

```jsonc
{
  "id": "my-pomodoro",
  "type": "component",
  "label": "",              // optional prefix
  "component": "pomodoro",  // registry key, see below
  "enabled": true
}
```

`component` names a built-in React widget from the renderer-side registry (`WorkspaceCardLineComponents`). Components receive `{ workspaceId, projectId, branch, workspaceName }` and have full app API access. Unknown keys render nothing, so configs stay forward- and backward-compatible.

| Key | Renders |
| --- | --- |
| `pomodoro` | Elapsed time since the workspace was created as 25-minute pomodoro cycles: `⏱ 2h13m · 🍅 8/25m · pomo #6`. Ticks locally every 30s. |
| `clock` | Current local time, `HH:MM`. Ticks locally every 30s. |
| `pr-checks-inline` | Compact PR checks summary (passing/failing/running + approval mark). Renders nothing when the workspace has no PR. |

## Example configs

Pomodoro component line plus the default built-ins:

```json
{
  "workspaceCard": {
    "customLines": [
      { "id": "pomo", "type": "component", "component": "pomodoro" }
    ]
  }
}
```

Trimmed-down card with a shell command line:

```json
{
  "workspaceCard": {
    "prTitle": true,
    "prChecks": true,
    "diffStats": false,
    "status": true,
    "linearTicket": false,
    "customLines": [
      {
        "id": "last-commit",
        "label": "last",
        "command": "git log -1 --format=%s"
      }
    ]
  }
}
```

## Where things live

- Schema + parsing: `apps/desktop/src/shared/workspace-card-config.ts`
- Config resolution (v1/v2) + file watching: `apps/desktop/src/lib/trpc/routers/config/workspace-card-source.ts`
- tRPC procedures: `apps/desktop/src/lib/trpc/routers/config/config.ts` (`getWorkspaceCardConfig`, `updateWorkspaceCardConfig`, `resetWorkspaceCardConfig`, `getWorkspaceCardConfigSource`, `watchWorkspaceCardConfig`)
- Command-line execution: `apps/desktop/src/lib/trpc/routers/workspaces/procedures/card-lines.ts`
- Card rendering: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/WorkspaceCardLines.tsx`
- Component registry: `.../WorkspaceListItem/WorkspaceCardLineComponents.tsx`
