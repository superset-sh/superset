# Configurable multi-line workspace cards

**Goal:** Sidebar workspace items become multi-line cards that surface PR title/status/checks, diff stats, agent status, and (optionally) the Linear ticket — visible at a glance instead of hover-only, with the field set configurable per project.

## Problem

Today `WorkspaceListItem` shows name, branch subtitle, diff counts, and a PR badge, but the PR title, check status, and review state only appear in the hover card. GitHub data is fetched lazily on hover (`useHoverGitHubStatus`, `githubQueryPolicy.ts` hover surfaces). Nothing about the row content is configurable, and there is no Linear integration at all.

## Design

### Config (per project, mirrors setup scripts)

A `workspaceCard` block in the project's `.superset/config.json`, managed through the existing config router (`src/lib/trpc/routers/config/config.ts`) the same way `setup`/`teardown` are:

```json
{ "workspaceCard": { "prTitle": true, "prChecks": true, "diffStats": true, "status": true, "linearTicket": true } }
```

All fields default to `true` (cards are multi-line out of the box). `getWorkspaceCardConfig` returns defaults when the block is absent; `updateWorkspaceCardConfig` merge-writes, preserving unrelated keys exactly like `updateConfig` does.

### Card rendering

`WorkspaceListItem` gains optional lines under the existing name/branch rows, each gated by config:

- **PR line** — PR title (truncated) plus check rollup / review decision badge. Data already exists on `getGitHubStatus` (`pr-resolution.ts` requests `title,…,reviewDecision,statusCheckRollup`).
- **Status line** — textual form of the existing pane-status aggregation (working / needs review / permission).
- **Linear line** — ticket key + state, when the integration is configured.
- **Diff stats** — existing `WorkspaceDiffStats`, now gated by the `diffStats` flag.

GitHub fetch policy: a new `workspace-card` surface in `githubQueryPolicy.ts` that is enabled eagerly (no hover requirement) but does not poll — long stale time, refetch on window focus, hover still triggers the existing refresh path. This keeps `gh` CLI calls bounded: one per visible workspace per staleness window.

### Custom script lines (user-created)

`workspaceCard.customLines` is an array of `{ id, label, command, enabled }`. Each command runs through `workspaces.getCardLineOutput` in the workspace folder (`/bin/sh -lc`, 5s timeout, 30s result cache in main) and the first line of its output renders on the card — e.g. `git log -1 --format=%s` for the last commit subject. Same trust model as setup/run scripts: the user authored the command.

### Context-menu configuration (primary surface)

Right-clicking any workspace card (v1 `WorkspaceContextMenu` and v2 `DashboardSidebarWorkspaceContextMenu`) offers:
- **Customize Card…** — opens `WorkspaceCardDialog` (screens/main/components): built-in line toggles + custom-line editor (add/toggle/remove).
- **Configure Card with Agent** — pre-fills the new-workspace prompt (`useConfigureCardWithAgent`, mirroring the setup/teardown flow via `useNewWorkspaceDraftStore` + `useNewWorkspaceModalStore`) and opens the creation modal; nothing starts until the user submits.

### Settings UI + agent shortcut

A "Workspace cards" section on `/settings/projects/$projectId` with a switch per field, writing through `updateWorkspaceCardConfig`. Next to it, a **Configure with agent** button opens a chat tab (`addChatTab(workspaceId, { launchConfig: { initialPrompt } })`) in the project's most recently active workspace, pre-prompted to edit the `workspaceCard` block of `.superset/config.json` — the same "agent configures the project file" pattern users know from setup scripts.

### Linear (via the existing org integration — no new API surface)

**Finding during implementation:** the app already syncs Linear through the org-level integration — the `tasks` table carries `externalProvider` / `externalKey` ("SUPER-172") / `externalUrl` / `branch` / `statusId`, and tasks arrive in the renderer through Electric collections (`CollectionsProvider`). So no API key, no new router, no direct Linear calls.

`useWorkspaceLinkedTask(branch)` resolves the ticket from the local tasks collection: primary match on the task's recorded `branch`, fallback on a ticket key extracted from the branch name (`/[a-z][a-z0-9]+-\d+/i`, uppercased). Status name joins from the synced `taskStatuses` collection. The card line renders the key + status when the field is enabled and a linked task exists.

### Component card lines (extension)

`customLines` entries are now a union discriminated by `type`: `"command"` (the original shape — `type` may be omitted, so pre-existing configs keep parsing) and `"component"`, where `component` names an entry in the renderer-side registry (`WorkspaceCardLineComponents.tsx`). Registered components receive `{ workspaceId, projectId, branch, workspaceName }` and may use electronTrpc hooks freely. Built-ins: `pomodoro` (elapsed since `workspaces.get` `createdAt`, 25-minute cycles, 30s local tick), `clock` (local HH:MM, 30s tick), `pr-checks-inline` (compact checks summary via the existing `useHoverGitHubStatus` workspace-card surface; renders nothing without a PR). Unknown keys render nothing. Full schema reference: `docs/WORKSPACE_CARDS.md`.

### v2 repo-config resolution (extension)

**Finding:** v2 cloud projects never enter the local `projects` table, but whenever any of their workspaces runs on this machine, the per-organization host service records the project's local checkout in its own DB — `~/.superset/host/<orgId>/host.db`, `projects.repo_path`, keyed by the cloud project id (see `persist-project.ts` in `packages/host-service`). `resolveWorkspaceCardRepoPath` (config router, `workspace-card-source.ts`) therefore resolves v1 via localDb `mainRepoPath` and v2 by opening each org's `host.db` read-only with better-sqlite3 and selecting `repo_path` by project id. Chosen over a host-service tRPC round trip because it needs no organizationId input, no auth token, and works while the service is stopped; the desktop app already links better-sqlite3 for its own local DB. Genuinely unresolvable projects (no local checkout) fall back to defaults as before.

### Live reload (extension)

Chosen path: main-process `fs.watch` pushed over an electron-trpc subscription — the codebase already uses `publicProcedure.subscription` + `observable` (e.g. `hostServiceCoordinator.onStatusChange`, `filesystem.watchPath`), so no new transport was introduced. `config.watchWorkspaceCardConfig` watches `<repo>/.superset` (or the repo root until `.superset` exists), debounced 250ms; `useWorkspaceCardConfigSync` subscribes once per project (mounted in `ProjectSection` and `DashboardSidebarProjectSection`) and invalidates the `getWorkspaceCardConfig`/`getWorkspaceCardConfigSource` queries. The stale-time/refetch-interval fallback was not needed; the 30s card-line output cache is untouched because a config edit changes the query key (`workspaceId` + `command`) anyway.

### Override shadowing fix (extension)

`updateWorkspaceCardConfig` previously stored the submitted config unconditionally, so opening the dialog and toggling nothing pinned pure defaults into appState and permanently shadowed later file edits. It now deletes the projectId key when the submitted config deep-equals the file-resolved one (`workspaceCardConfigsEqual` in shared/workspace-card-config.ts), keeping the file authoritative; `resetWorkspaceCardConfig` clears the override explicitly and the settings UI shows "Reset to repo config" whenever `getWorkspaceCardConfigSource` reports `"override"`.

## Non-goals

- Per-user (as opposed to per-project) card config — `.superset/config.json` is the single source, consistent with setup scripts.
- Linear ticket pickers/search; association is branch-name-driven only.
- Virtualized list support (the sidebar list isn't virtualized; rows already vary in height).

## Verification

- Unit: config defaults + merge preservation; ticket-key extraction.
- `bun test`, `bun run lint`, `bun run typecheck` clean.
- Live: toggles change card content; PR line shows without hover; hover refresh still works.
