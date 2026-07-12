# [mobile] Live chat runtime

> **Scope: legacy Mastra chat only.** This is not the ACP live-session design.
> Current ACP behavior is documented in
> `packages/host-service/docs/acp-sessions.md`; ACP follow-ups are in
> `plans/acp-session-follow-ups.md`.

Status: implemented for the Mastra-backed mobile chat path; static validation has passed.
Repeat the live host/relay E2E before merge.

## Scope

Mobile can render and drive an existing host-owned mastracode chat session:

- list sessions from synced `chat_sessions` metadata;
- open a thread and poll the owning host's runtime snapshot over the relay;
- send messages and answer approvals, questions, and plan approvals;
- show live terminal-agent rows as read-only status while the host is online.

Mobile still does not create sessions or persist chat messages to the cloud.

## Data Flow

| Data | Source | Mobile path |
|---|---|---|
| Chat session metadata | Cloud Postgres | Electric collection |
| Chat messages and streaming state | Host-service mastracode runtime | Relay tRPC, `chat.getSnapshot` |
| Chat send / approval / question / plan responses | Host-service runtime | Relay tRPC, `chat.*` mutations |
| Terminal-agent status | Host SQLite binding store | Interim relay tRPC, `terminalAgents.listByWorkspace` |

The relay URL is `${EXPO_PUBLIC_RELAY_URL}/hosts/<orgId>:<machineId>/trpc`.
`v2Workspaces.hostId` is the host machine id, and `v2Hosts.isOnline` is the
liveness signal.

## Decisions

### D1. Host runtime remains authoritative for message content.

Message history is not in cloud Postgres or Electric today; it lives in the
host-service process. Mobile therefore requires the owning host to be online and
tunnelled. This keeps the first implementation small, but it means no offline
chat history and no push/subscription yet.

### D2. Mobile uses a small hand-written host tRPC facade.

`apps/mobile/lib/trpc/host-chat-types.ts` defines only the host procedures and
payload shapes mobile calls. This avoids importing the full host-service router
type graph into React Native, but it is intentionally lossy and not enforced by
TypeScript against the server. Live E2E is the contract check until a normalized
chat protocol package exists.

### D3. Titles are seeded from the first host send.

Host `chat.sendMessage` fire-and-forgets a cloud `chat.updateSession` with the
first 80 characters of the message. Cloud update uses `COALESCE(existing, new)`
so the fallback title only fills an empty title and does not clobber a later
desktop-generated title.

### D4. Terminal rows are an interim host query.

Mobile mixes chat rows and terminal-agent rows in one workspace list. Terminal
rows come from `terminalAgents.listByWorkspace` while the host is online. The
longer-term fix is to sync terminal session/status rows to cloud and Electric;
see `plans/cross-client-session-tab-sync.md`.

### D5. Workspace route uses a stack, not the old floating tab bar.

The native Chat/Changes tab bar overlapped the thread composer. The workspace
route is now a plain stack; `changes` remains reachable only by explicit
navigation until that surface is real.

### D6. Local relay directory fallback is dev-only.

`apps/relay/src/directory.ts` uses an in-memory owner map when
`FLY_MACHINE_ID === "local"`. This avoids local Upstash placeholder failures
when running a single relay process. Production still uses the Redis directory.

## Known Gaps

- `EXPO_PUBLIC_RELAY_URL` is optional in env parsing but host-client creation
  currently throws if it is unset. Fix before treating unset relay config as a
  supported boot path.
- Snapshot polling should be gated by host liveness to avoid noisy 250ms errors
  while offline.
- Send failures are currently silent: the optimistic message is removed and the
  composer does not render retry/edit state.
- The mobile host facade can drift from host-service procedure types.
- Terminal rows are not shared across clients when the host is offline.

## Verification

Static checks run on this branch:

- `bun run --cwd apps/mobile typecheck`
- `bun run --cwd apps/mobile lint`
- `git diff --check`

Live E2E to repeat before merge:

1. Run API, Electric proxy, and relay locally.
2. Start desktop signed in as the same user, with host-service exposed through
   the relay.
3. Create a real workspace and chat session on desktop.
4. Run mobile with `EXPO_PUBLIC_RELAY_URL` pointing at the relay.
5. Confirm the workspace and session appear through Electric.
6. Open the mobile thread, send a message, and verify desktop receives it.
7. Trigger an approval or question and answer it from mobile.
8. Stop the desktop host and verify mobile shows the offline path.
