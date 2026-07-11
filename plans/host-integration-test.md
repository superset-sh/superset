# Host integration test — drive the host through a shared client

Status: **proposed / not started** (deliberately punted; plan only)

## Why

Today the only way to exercise the ACP session surface end to end is to boot
the full app stack (desktop app → host-service child, relay, redis/SRH, api,
mobile app or a hand-rolled script). That loop is minutes long and every layer
adds its own failure modes (stale electron env, tunnel no-retry, Metro cache).
During M4 of `plans/session-harness-acp.md` we effectively hand-built this
test twice as scratchpad scripts — it caught real bugs (missing
user_message_chunk journaling, env-injected fake API key, getMessages zod
limits). It should be a checked-in integration test that runs in seconds,
without driving the full app.

## Target layering

Three layers, dependency arrows only point down:

```text
host client   (packages/host-client — exists; mobile consumes it, desktop + web to follow)
    │  imports
host protocol (packages/session-protocol — exists: envelope, fold, state, AcpSessionsApi)
    ▲  imports
host          (packages/host-service — exists: creates the server, satisfies the protocol)
```

- **host protocol** — already `packages/session-protocol`: envelope/frame
  types, `foldEnvelopes`, `AcpSessionsApi` interface, `subscribeToSession`.
  No transport, no server. (Optional later rename to `host-protocol`; not
  worth the churn now.)
- **host client** — `packages/host-client` (extracted; shipped). The transport
  that used to live only in `apps/mobile/lib/host/client.ts` (SuperJSON
  GET/POST envelope over `${RELAY_URL}/hosts/<routingKey>/trpc/*`, WS stream
  URL builder, auth-retry) is now a platform-neutral package (fetch +
  WebSocket only, injected `getToken`/`baseUrl`), and mobile consumes it.
  Still to do: migrate desktop and `apps/web/src/trpc/host-client.ts`, and
  delete the `apps/mobile/lib/host` vs `apps/mobile/lib/host-service`
  duplication.
- **host** — `packages/host-service`. Already builds standalone (the desktop
  just bundles and spawns it). Add a type-level conformance check that the
  acpSessions router satisfies `AcpSessionsApi` so protocol drift fails
  typecheck, not runtime.

**The integration test is: host + client.** Boot the real host-service HTTP
server in-process, point the real host client at it, and assert on what the
client observes. Never call manager methods directly — if the client can't
see it, it doesn't count.

## Test doubles: fake agent adapter

Spawning the real `claude-agent-acp` needs credentials, a network, and a
model — slow, flaky, non-deterministic. `AcpSessionManager` already takes
`resolveWorkspaceCwd` + `journalCapacity` via options; add an injectable
`adapterEntry` (path to the adapter JS spawned per session, defaulting to the
real `resolveAdapterEntry()`).

Write a **scripted ACP peer** (`packages/host-service/test/fake-adapter.ts`,
~150 lines, JSON-RPC over stdio) that:

- answers `initialize` / `session/new`
- on `session/prompt`, replays a scenario keyed by the prompt text:
  - `scenario:simple` — N `agent_message_chunk`s → `end_turn`
  - `scenario:permission` — tool_call update → `session/request_permission`
    → honors the outcome (completed vs cancelled tool) → `end_turn`
  - `scenario:slow` — streams until `session/cancel` (tests interrupt)
  - `scenario:crash` — exits mid-turn (tests dead-session semantics)
- never touches the network; writes to cwd only when the scenario says so

Keep one opt-in **live smoke test** (`SUPERSET_LIVE_ACP=1`) that uses the real
adapter + real Claude Code login for release confidence; CI skips it.

## Environment tiers ("smart env setup")

Set up the *full* environment where it's cheap, fake only the model:

- **Tier 1 — direct (default, every `bun test` run):** in-process
  host-service HTTP server on an ephemeral port + fake adapter + temp git
  worktree as the workspace cwd. No docker, no relay, no db. Client talks to
  the host directly (same wire format the relay forwards verbatim). Auth:
  host-service JWT validation gets a test-signed key (see open question 1).
- **Tier 2 — tunneled (opt-in `SUPERSET_IT_RELAY=1`, CI nightly):** same
  test suite, but the client goes through a real relay + redis/SRH
  (docker compose services already exist per-worktree: redis :3076,
  SRH :3077, relay :3073). A shared `integration-env.ts` helper starts —
  or reuses, in dev — those services idempotently, registers the host
  tunnel, and returns `{ baseUrl, routingKey, stop() }`. The suite is
  transport-parametrized: the SAME sequences run against both tiers.
- **Tier 3 — live smoke (`SUPERSET_LIVE_ACP=1`, manual):** tier 1 or 2 with
  the real adapter and a one-liner prompt. Not in CI.

The scratchpad script from M4 (`e2e-mobile-transport.ts`, now all-green) is
the seed for the tier-2 suite — check it in, replacing hardcoded ids with the
env helper.

## Test sequence (the canonical flow, per transport)

1. `create` returns the caller's sessionId, `status=idle`; re-`create` with
   the same id is idempotent; same id + different workspace → error.
2. `list` includes the session; pagination cursor works; dead sessions drop
   out of `list` but `get`/`getMessages` still serve them.
3. Two independent `subscribeToSession` clients connect (since=0).
4. `prompt` (scenario:permission): user message is journaled first
   (adapter doesn't echo it — host synthesizes `user_message_chunk`).
5. Both subscribers see `permission_requested`; `get` shows
   `awaiting_permission`.
6. `respondToPermission` (allow_once) → `permission_resolved`; tool_call
   completes; turn ends with `end_turn`.
7. Both subscribers: gapless seq from 1, identical folded timelines
   (message / tool_call+resolved permission / message).
8. Late joiner (since=0) replays an identical prefix; a since=N joiner gets
   exactly the suffix.
9. `getMessages` pages (walking beforeSeq backwards) reunion to the same
   fold as the live stream — state frames are stream-only by design.
10. `cancel` mid-turn (scenario:slow) → `stopReason=cancelled`, status back
    to `idle`, composer-visible state consistent.
11. Adapter crash mid-turn (scenario:crash) → session marked dead, in-flight
    prompt rejects, journal retained, `list` drops it.
12. Permission denied (reject_once) → tool_call ends
    failed/cancelled, turn still terminates cleanly.
13. Auth: bad/expired JWT → 401 from stream and trpc paths; client's
    one-shot refresh-retry works.
14. Journal ring overflow (tiny `journalCapacity`): late joiner past the
    ring start gets `reset` frame and resyncs via `getMessages`.

## Milestones

- **IT1 — extract `packages/host-client`** from `apps/mobile/lib/host/client.ts` —
  **done** (package exists; mobile consumes it). Remaining follow-up: web
  consumption and deleting the `apps/mobile/lib/host-service/client.ts`
  duplication.
- **IT2 — fake adapter + adapterEntry injection**; tier-1 suite covering
  sequences 1–12 (bun test, no docker).
- **IT3 — integration-env helper + tier-2 relay run** of the same suite
  (sequences 1–14); wire into CI as a separate job.
- **IT4 — live smoke** behind `SUPERSET_LIVE_ACP=1`; document in
  host-service README.

## Open questions

1. **JWT validation in tier 1** — how does host-service verify tokens when
   there's no api? Options: inject a JWKS/public key into host config and
   sign test tokens locally (preferred), or boot the api in tier 2 only and
   relax tier 1 to a test-mode verifier. Needs a look at
   `packages/host-service` auth middleware before IT2.
2. **Where the suite lives** — `packages/host-client/integration/` (tests the
   contract from the consumer side, needs host-service as devDependency) vs
   `packages/host-service/integration/` (avoids a dev-dep cycle). Decide at
   IT1 based on which direction the dep graph allows.
3. **tRPC vs raw envelope** — the mobile client hand-rolls the SuperJSON
   envelope instead of using `createTRPCClient` (to avoid importing the host
   AppRouter into mobile's typecheck). Keep hand-rolled in `host-client`
   (typed by the protocol interface), or publish a slim router-type-only
   entrypoint from host-service? Leaning hand-rolled — it's what runs today.
4. **simctl/Maestro UI smoke** — out of scope here; UI-level flow stays a
   dev-loop tool (see `plans/session-harness-acp.md` M4 evidence), not CI.
