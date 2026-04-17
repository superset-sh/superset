# CLI — Implementation TODOs

## Infrastructure changes (before CLI can be built)

- [ ] **Host service writes `~/.superset/device.json`** on startup with `{ deviceId, deviceName }` for CLI auto-detection
- [ ] **Move port scanner to host service** — currently lives in Electron (`apps/desktop/src/main/lib/terminal/port-manager.ts`). Host service needs its own port scanning so headless/CLI-driven terminals get port detection too
- [ ] **Add `ports` table to host service SQLite** — track detected and claimed ports per workspace/terminal session
- [ ] **Consolidate device identity** — `device_presence` (text `deviceId`) vs `v2_devices` (UUID `id`). CLI needs one consistent identifier. Decide which to retire
- [ ] **Add `chat.list` tRPC query** — currently no server-side list for chat sessions (desktop uses Electric sync). CLI needs this
- [ ] **CDP target mapping** — add a way to map `paneId` → CDP `webSocketDebuggerUrl` so external tools can connect to specific browser panes. Likely a new tRPC procedure on `browser` router
- [ ] **CDP in production** — currently gated to `NODE_ENV === "development"`. Need a strategy for production (selective enable? proxy through BrowserManager?)

## New schemas

- [ ] **`crons` table** (cloud, Neon) — `id, organization_id, device_id, name, schedule, prompt, enabled, created_by_user_id, last_run_at, next_run_at`
- [ ] **`cron_runs` table** (cloud, Neon) — `id, cron_id, organization_id, status, started_at, completed_at, output, error`
- [ ] **`ports` table** (host service SQLite) — `port, workspace_id, terminal_id, url, detected_at, claimed_at`

## Desktop app changes

- [ ] **Sidebar sections** — does the concept of sidebar sections exist today? If not, need to add data model + UI
- [ ] **Websocket command routing** — CLI spec says device commands route via API → websocket → host service. Is this path built? Or does it still go through `agentCommands` + Electric SQL polling?

## CLI package

- [ ] Scaffold `packages/cli/`
- [ ] Auth flow (`login` / `logout` / `whoami`)
- [ ] Cloud commands (`tasks`, `devices`, `chat`)
- [ ] Device commands (`workspaces`, `projects`, `agent`)
- [ ] UI commands (`focus`, `sidebar`, `tabs`, `panes`)
- [ ] Pane-type commands (`terminal send/read`, `browser navigate/cdp-url`, `chat send/read`)
- [ ] Port commands (`list`, `claim`, `release`)
- [ ] Cron commands (`list`, `create`, `update`, `delete`, `logs`, `run`)
