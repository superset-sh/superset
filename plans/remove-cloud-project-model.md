# Desktop local-first: eliminate cloud app-data queries

Origin: #5843 (project icons broken) exposed a class of bug — the local-first
desktop app still queries the CLOUD for app data. Icons were one instance;
chat, tasks, automations, secrets are others. This plan draws the hard line and
sequences the teardown.

**Principle:** the desktop queries the cloud ONLY for concerns that are
inherently cloud — auth/session, billing, org & team membership, GitHub app
integration, and cross-device coordination. All **app data** (projects, chat,
tasks, automations, workspaces, secrets, PRs) is local-first via the
host-service, which already owns a per-host SQLite DB.

Two cloud-query vectors exist and both were audited (2026-07-21):
1. Cloud tRPC `apiTrpcClient.*` (`renderer/lib/api-trpc-client.ts`).
2. Electric sync collections (`CollectionsProvider/collections.ts` → electric-proxy shapes).
   (`client.*` host-service and `electronTrpc.*` main-process IPC are LOCAL, not cloud.)

## The hard line

### MUST-STAY-CLOUD (leave alone)
- Auth/session, `apiKeys`, user profile/avatar/onboarding
- Billing / `subscriptions`
- Org + team membership: `organizations`, `members`, `users`, `invitations`, `teams`, `teamMembers`
- Integration credentials: `integrationConnections`, `integration.github`
- **Cross-device coordination: `v2Hosts`, `v2UsersHosts`, `device_presence`.** This
  is the rendezvous that lets the local-first fan-out discover other machines —
  coordination, not app content. Keep cloud (or later move to relay), do NOT
  naively localize.

### SHOULD-BE-LOCAL-FIRST (targets)
| Domain | Cloud today | Already local |
|---|---|---|
| Project icons | `v2Project.uploadIcon/resetIconToGitHub/removeIcon` | identity/name/repo (host fan-out) |
| Chat | `chat_sessions` Electric collection, `chat.createSession/updateTitle/uploadAttachment`, REST `/api/chat/*` | **messages + streaming (mastracode LibSQL on disk)** |
| Tasks | `tasks` + `task_statuses` collections, `task.byId/bySlug/create` | — |
| Automations | `automations` + `automation_runs` collections, whole `automation.*` router | — |
| Secrets | legacy `project.create` + `project.secrets.*` (incl. **decrypted** fetch) | — |
| Workspaces | `workspaces` / `v2Workspaces` collections, `workspace.ensure` | v2 workspace fan-out (host) |
| PRs / repos | `githubPullRequests`, `githubRepositories` collections | — |

### DEAD / legacy — delete now, no behavior change
- `v2Clients` collection — **zero consumers**; also drop `v2_clients` from electric-proxy `where.ts`.
- `v2Workspaces` collection — marked "deleted in R3", 1 lingering consumer.
- `v2_projects` electric-proxy shape — no desktop collection reads it (projects are host-local).
- Chat **durable-streams** provisioning (`PUT /api/chat/[sessionId]` create/delete) — no producer writes it; leftover from cloud-agent era.
- `workspace.ensure` + legacy chat Runtime A (`screens/main/.../ChatPane`) — only the old `/workspace` route; verify retired, then remove (v2 uses `WorkspaceChatInterface`).

## Cross-cutting hard part: identity joins
`users` is the single most-read collection (16 files) and MUST stay cloud.
Tasks, chat, and automations all join to it for assignee/author/creator display.
Going local-first for those isn't just moving a table — it needs an
identity-resolution story (denormalize/cache cloud user rows locally, or a
cloud identity lookup). Design this before Phases C/D.

## Phases (each independently shippable)

- **Phase 0 — Delete dead weight** (no behavior change): `v2Clients`,
  chat durable-streams provisioning, `v2_projects` proxy shape, and (after
  verifying the `/workspace` route is retired) legacy chat Runtime A +
  `workspace.ensure`.
- **Phase A — Project icons local-first** (fixes #5843): add icon column to host
  `projects` (like `host_agent_configs.icon_id`, data-URI/key, no cloud blob),
  `project.setIcon` host mutation via `updateLocalProject`, surface through
  list/get/snapshot/`HostProjectItem`, re-point `IconUploadField` at the host
  client, delete cloud icon procs. **Self-contained, no cross-app coordination.**
- **Phase B — Chat local-first** (you flagged this): host-service `chat_sessions`
  table + `chat.{list,create,update,delete,updateTitle}` router; local
  attachments; replace the Electric `chatSessions` collection with a local live
  query; redirect `generateAndSetTitle` to a local write. Messages already local.
- **Phase C — Tasks local-first**: host-service tasks + statuses; needs the
  identity-join story.
- **Phase D — Automations local-first**: whole `automation.*` router + collections;
  also resolves `automations.v2ProjectId` NOT-NULL cascade FK (repoint to
  host-local project id or make nullable + tolerant).
- **Phase E — Secrets local-first**: host-service encrypted secret store; stop
  fetching decrypted secrets from cloud. Retire the `settings/project/.../cloud/secrets` tree.
- **Phase F — Retire cloud tables/shapes** once no readers remain: `chat_sessions`,
  `tasks`, `task_statuses`, `automations`, `automation_runs`, `v2_projects`,
  `workspaces`, and the `v2Project`/legacy `project` routers. Adjust the
  `v2Workspace` router's project join.

## Coordination
Mobile + CLI also read some cloud tables (`v2_projects`, and likely tasks/chat)
via Electric/`v2Project.list` — cross-app parity required before dropping shapes
in Phase F. `v2Hosts`/`v2UsersHosts` remain the cloud coordination substrate.

## Recommendation
Ship **Phase 0** (dead-code deletion, low risk) and **Phase A** (icons, fixes
#5843) first — both self-contained. Then **Phase B** (chat). Phases C/D/E are
larger and gated on the identity-join design.
