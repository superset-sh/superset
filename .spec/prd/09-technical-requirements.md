---
stability: CONSTITUTION
last_validated: 2026-05-19
prd_version: 1.0.0
---

# Technical Requirements

These requirements are pulled directly from the file:line traces and approach sections in each Linear ticket. They are CONSTITUTION-stable for the duration of Cycle 28 — changes here require architecture review.

## System Components

| Component | Role | Used by |
|-----------|------|---------|
| `packages/chat` (server + client + shared) | v2 chat package: server-side trpc service, client-side hooks (`use-chat-display`, `useChat`), shared `ChatEvent` types, builtin slash commands | UC-CHAT-01, UC-CHAT-02, UC-CHAT-04 |
| `packages/host-service` | OS host-side process that connects to relay + cloud; owns `JwtApiAuthProvider`, `tunnel.connectRelay`, host-side `workspaces.create` trpc router | UC-CHAT-01, UC-CLI-01, UC-AUTO-02 |
| `packages/cli` | `superset` CLI binary: `auth login`, `start`, `lib/auth.ts`, `lib/host/spawn.ts`, `lib/resolve-auth.ts` | UC-CLI-01, UC-CLI-02 |
| `packages/trpc` | Cloud-side tRPC: chat router (`router/chat/chat.ts`), automation router (`router/automation/{schema,dispatch,relay-client}.ts`) | UC-CHAT-01, UC-AUTO-01, UC-AUTO-02 |
| `apps/desktop` (renderer) | Electron renderer: v1 + v2 chat panes, browser panes, automations UI, diff viewer, hotkeys registry | UC-CHAT-02, UC-CHAT-03, UC-CHAT-04, UC-AUTO-01, UC-AUTO-02, UC-UX-01, UC-UX-02 |
| `apps/desktop/src/main` | Electron main process: application menu, `BrowserManager` registry, persistent-webview wiring | UC-UX-01 |

## Data Schema

| Entity | Key Properties | Notes |
|--------|----------------|-------|
| **`ChatEvent`** | seq, kind, sessionId, payload | Canonical transport message defined in UC-CHAT-01. Shape MUST be identical across local host-service and cloud worker runtimes. Consumed via `applyEvent` and `replayEvents(sessionId, fromSeq, toSeq)`. |
| **`ChatSession`** | id, workspaceId, fromSeq, toSeq, status | Backed by existing `chat_mastra_sessions` table (Drizzle / Neon). UC-CHAT-01 must keep the table shape compatible or document a migration. |
| **`Automation`** | id, name, v2ProjectId, v2WorkspaceId (nullish), targetHostId (nullish) | `packages/trpc/src/router/automation/schema.ts:33,50` — `createAutomationSchema .refine` requires `v2ProjectId || v2WorkspaceId`. UC-AUTO-02 requires `v2ProjectId` when `v2WorkspaceId` is null. |
| **`AutomationRun`** | id, automationId, status, error (full string, not clipped) | UC-AUTO-01 requires the full dispatch error string be stored and surfaced. |
| **`AuthSession` / OAuth tokens** | accessToken, refreshToken, expiresAt | Today: a frozen `AUTH_TOKEN` env var (`packages/cli/src/lib/host/spawn.ts:106-121`). UC-CLI-01 requires a refreshable credential reachable from the detached host process. |

## API / IPC Endpoints

| Endpoint | Type | Definition | Used in |
|----------|------|------------|---------|
| `session.watch` | tRPC subscription (observable, desktop) | New under UC-CHAT-01 / UC-CHAT-04 | Replaces `getDisplayState` + `listMessages` polling |
| `workspace.watch` | tRPC subscription | New under UC-CHAT-01 | Workspace-level event watch |
| `session.applyEvent` | tRPC mutation | New under UC-CHAT-01 | Applies a `ChatEvent` to the log |
| `session.replayEvents(sessionId, fromSeq, toSeq)` | tRPC query | New under UC-CHAT-01 | Catch-up read for reconnects |
| `automation.create` | tRPC mutation | `packages/trpc/src/router/automation/schema.ts:33,50` | UC-AUTO-02 requires stricter `v2ProjectId` validation when `v2WorkspaceId` is null |
| `automation.dispatch` | tRPC mutation (cloud) | `packages/trpc/src/router/automation/dispatch.ts:100-134,281-336` | UC-AUTO-01 / UC-AUTO-02 — must surface full error string, must succeed end-to-end against null `v2WorkspaceId` |
| `workspaces.create` | Relay mutation → host trpc | `relay-client.ts` (relay) + `packages/host-service/src/trpc/router/workspaces/workspaces.ts:60-80` (host); default relay timeout 25s, `createWorkspaceOnHost` overrides to 90s | UC-AUTO-02 |
| `auth.login` | CLI command flow | `packages/cli/src/commands/auth/login/command.ts:175-246`, `packages/cli/src/lib/auth.ts:296-403` | UC-CLI-02 |
| Host-service `getSessionToken` | Internal callback in `JwtApiAuthProvider` | `packages/host-service/src/serve.ts:29-32` | UC-CLI-01 — must actually rotate, not return the frozen env var |

## Architecture Diagram (ASCII)

```
                      ┌──────────────────────────────┐
                      │   User / Remote User (UI)    │
                      │  apps/desktop  +  superset   │
                      │      (browser panes,         │
                      │       chat panes,            │
                      │       automations UI,        │
                      │       diff viewer)           │
                      └──┬──────────┬──────────┬─────┘
                         │ Cmd+W    │ chat     │ auth login
                         │ UC-UX-01 │ UC-CHAT  │ UC-CLI-02
            ┌────────────▼────┐     │          │
            │  Electron main  │     │          │
            │  + BrowserMgr   │     │          │
            └─────────────────┘     │          │
                                    │          ▼
                          ┌─────────▼──────┐   ┌──────────────┐
                          │ packages/chat  │   │ packages/cli │
                          │  (server+      │   │  lib/auth    │
                          │   client)      │   │  lib/host/   │
                          │  session.watch │   │  spawn       │
                          └────┬───────┬───┘   └──────┬───────┘
                               │       │              │
                               │       │   AUTH_TOKEN │ refresh creds
                               │       │   (today frozen, UC-CLI-01 makes refreshable)
                               │       ▼              ▼
                               │   ┌──────────────────────┐
                               │   │ packages/host-service │
                               │   │  JwtApiAuthProvider   │
                               │   │  tunnel.connectRelay  │
                               │   │  workspaces.create    │
                               │   └──────────┬───────────┘
                               │              │ relay
                               ▼              ▼
                       ┌────────────────────────────────┐
                       │     packages/trpc (cloud)      │
                       │  chat router │ automation/     │
                       │              │  dispatch       │
                       │              │  relay-client   │
                       └───────────────────┬────────────┘
                                           │
                                           ▼
                            ┌────────────────────────────┐
                            │  Mastracode harness        │
                            │  event stream (push src    │
                            │  for UC-CHAT-04 ChatEvent) │
                            └────────────────────────────┘
                                           │
                                           ▼
                            ┌────────────────────────────┐
                            │  {OAuth provider}          │
                            │  {Neon / Drizzle}          │
                            │  {Relay tunnel}            │
                            └────────────────────────────┘
```

## External Dependencies

| Dependency | Component | Reason | Documentation |
|------------|-----------|--------|---------------|
| Electron | `apps/desktop` | Main + renderer processes, `<webview>` panes, application menu accelerators | https://www.electronjs.org/docs/latest/ |
| tRPC + `trpc-electron` | `packages/chat`, `apps/desktop` | Subscriptions must use the observable pattern (NOT async generators) per `apps/desktop/AGENTS.md` — relevant to UC-CHAT-04 | https://trpc.io/docs |
| Mastracode harness | `packages/host-service`, `packages/chat` | Push event source for the new `ChatEvent` stream under UC-CHAT-04 | Internal (`.mastracode/` + plans) |
| Ink + `@clack/prompts` | `packages/cli/src/commands/auth/login` | Terminal UI for paste flow under UC-CLI-02 | https://github.com/vadimdemedes/ink ; https://github.com/natemoo-re/clack |
| OAuth provider (`superset-cli` client) | `packages/cli`, `packages/host-service` | Loopback + paste flows; refresh tokens for UC-CLI-01 | Internal (hand-managed client row) |
| `react-hotkeys-hook` | `apps/desktop` renderer | Existing `CLOSE_PANE` / `CLOSE_TERMINAL` registrations in `hotkeys/registry.ts` — must continue working under UC-UX-01 | https://react-hotkeys-hook.vercel.app/ |
| Drizzle + Neon (PostgreSQL) | `packages/db` (consumed via `packages/trpc`) | `chat_mastra_sessions`, automations, auth tables | https://orm.drizzle.team/ + Neon |

## UI Infrastructure

| Surface | Reused Components | New Components |
|---------|------------------|----------------|
| Chat composer (UC-CHAT-03) | `ModelPicker`, `PermissionModePicker`, `ThinkingToggle`, `PromptInputTools`, `PILL_BUTTON_CLASS` | One consolidated `ChatComposerSettingsMenu` trigger + popover |
| Chat pane (UC-CHAT-04) | `ChatPaneInterface`, `useChatDisplay` (re-written internals) | Client-side reducer over `session.watch` events |
| Slash commands (UC-CHAT-02) | `SlashCommandMenu`, `SlashCommandPreviewPopover`, `useSlashCommandExecutor`, `BUILTIN_COMMANDS` | (Optional) builtin / MCP management surface |
| Automations runs (UC-AUTO-01) | `PreviousRunsList` | Non-clipped error-reason affordance + notification |
| Workspace picker (UC-AUTO-02) | `WorkspacePicker`, `CreateAutomationDialog`, `AutomationDetailSidebar` | (Validation only) — no new component |
| Browser panes (UC-UX-01) | `BrowserPane`, `usePersistentWebview`, `BrowserManager` | Main-process `before-input-event` listener + per-pane close event |
| Diff viewer (UC-UX-02) | Existing diff-viewer component | (Bugfix only) — no new component |
| CLI login (UC-CLI-02) | Ink `LoginUI.tsx`, `@clack/prompts` fallback | Cross-device-aware copy + `--no-browser` flag |

## Cross-Cutting Constraints

- **Desktop tRPC subscriptions MUST use the observable pattern** — `trpc-electron` rejects async generators (per `apps/desktop/AGENTS.md`). This binds UC-CHAT-04's `session.watch` implementation.
- **Host service is a detached process** — env vars are immutable for its lifetime, so UC-CLI-01 must give it a credential it can actively refresh rather than re-snapshot.
- **Persistent-webview re-parenting changes `webContentsId`** — UC-UX-01's `before-input-event` listener must be re-attached on every `BrowserManager.register(...)` call.
- **`v1` and `v2` workspace close paths differ** — `requestPaneClose` vs `closePane`; UC-UX-01 must cover both.
- **`createWorkspaceOnHost` derives branch names** from automation name + timestamp; UC-AUTO-02 should not break the `automation-<timestamp>` fallback for empty / odd names.
- **The cloud-backed EventLog (Durable Object) path** scopes the host-service's authority down slightly compared to the local-only path — UC-CHAT-01 must define that split explicitly.
