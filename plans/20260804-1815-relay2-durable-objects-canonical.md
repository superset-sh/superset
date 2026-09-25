# relay2: canonical next-generation relay on Cloudflare Durable Objects

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template in `.agents/skills/create-plan/SKILL.md`.

## Purpose / Big Picture

Superset lets a user drive a coding agent on one machine (a "host" — their laptop, a cloud sandbox, an office desktop) from another device (the desktop app, web app, CLI, or phone). The piece that makes that possible is the relay: hosts sit behind NAT and firewalls, so the host opens an outbound WebSocket to a public relay server, and clients reach the host *through* that relay. Every remote terminal keystroke, every remote tRPC call, and every event-bus message crosses it.

Today's relay (`apps/relay`) is a fleet of 7 always-on Fly.io virtual machines with a hand-built distributed-routing layer (a Redis directory, Fly request-replay, machine-to-machine WebSocket bridging) and a hand-built stream multiplexer (JSON envelopes over a single WebSocket per host, base64-encoded binary, bespoke ping/liveness/drain protocols on both ends). It works, but the 2026-08-04 reliability audit showed the operational surface is large, several outage classes came from exactly this bespoke machinery, and clients carry Fly-specific workarounds (`primeRelayAffinity`) into the renderer.

This plan builds **relay2**: a ground-up relay on Cloudflare Workers + Durable Objects, developed completely independently of `apps/relay`, with a new host↔relay protocol designed around what Durable Objects make possible. After this plan is complete:

- The Fly fleet, the Redis directory, fly-replay, the 6PN bridge, the drain choreography, and the client-side affinity preflight are deleted.
- The stream multiplexer is deleted on both ends — each terminal/event stream is its own raw WebSocket spliced through the Durable Object, binary passthrough, no JSON envelope, no base64.
- Terminal sessions become **resumable**: a relay deploy, a laptop lid-close, or a network blip re-attaches and replays buffered output instead of killing the terminal.
- Which relay a host or client uses is served by the API, not resolved from a PostHog flag payload (the flag path failed twice during the 2026-08-04 canary; see Surprises & Discoveries).

A working prototype already validated the platform (PR #6165, `apps/relay-do`): keystroke echo through a Durable Object measured 121–125ms median vs 124ms through Fly on the identical host (a wash), a 1.49MB PTY burst streamed at 1.9MB/s with max frame 12.4KB (far under the platform's 1MB frame limit), and a `wrangler deploy` mid-session recovered the tunnel in under 10 seconds. The prototype was wire-compatible with the old protocol; relay2 is not — it is the protocol we would design if the DO had always existed.

## Assumptions

- The Cloudflare account currently hosting `electric-proxy.avi-6ac.workers.dev` (account `avi-6ac`) is acceptable for production relay traffic. The prod desktop app already allowlists and uses that Worker for Electric sync, so the precedent exists. If a company-owned account is preferred, only `wrangler.jsonc` account config and the hostname change.
- `*.workers.dev` hostnames are acceptable during development and the parallel-run rollout (Milestones 1–4). The canonical end-state hostname is `relay.superset.sh`, cut over to relay2 at Milestone 5 via a Cloudflare for SaaS custom hostname — superset.sh DNS stays on Vercel (see D-11/D-14).
- The org controls at least one spare domain that can be activated as a Cloudflare zone to host the SaaS fallback origin (the `superset-sh/domains` tooling manages a pool of them).
- Workers paid plan with Durable Objects (SQLite-backed classes) is enabled on the account. The prototype already deployed successfully, so this is effectively confirmed.
- `apps/mobile` (iOS) consumes the relay through the same `packages/host-client` path as web and can adopt relay2 with no mobile-specific work beyond a dependency bump.

## Open Questions

- Client-side predictive echo (mosh-style local echo in the terminal renderer) is the biggest lever for perceived typing latency and is intentionally **out of scope** here; does it get its own plan immediately after, or wait for relay2 to land? → Decision Log placeholder D-13.
- Cloudflare account rename off `avi-6ac` to a Superset-branded account (D-16) before `relay.superset.sh` and more CSPs bake the workers.dev host in — still not done; do it before the M5 cutover.

## Progress

- [x] (2026-08-04) Reliability audit of the Fly relay: fleet stable since Jul 25; all incidents were process/self-inflicted, not platform. Findings in memory and PR #6165 description.
- [x] (2026-08-04) Wire-compatible prototype `apps/relay-do` built, deployed to `superset-relay-do.avi-6ac.workers.dev`, and validated end-to-end in production with a sandbox host: latency parity with Fly, deploy-survival ≤10s, 1MB frame limit shown to be a non-issue. Results table in PR #6165 comment.
- [x] (2026-08-04) Desktop CSP gap discovered (packaged app blocks `workers.dev` fetches) and canary-channel fix shipped on branch `relay-do-prototype`.
- [x] (2026-08-04) `setOnline` write-race demonstrated in production (dying host's `false` clobbered new host's `true` → host showed offline while tunnel was live). Confirms the Fly relay's write-versioning is load-bearing and must exist in relay2.
- [x] (2026-08-05) Spike RESOLVED — partyserver adopted: `apps/relay2` built on `partyserver` (HostTunnel extends Server, hibernate: true, tags via getConnectionTags) + `partysocket/ws` for the host control channel. The dial-back shape fit the framework without friction; raw-DO fallback not needed.
- [x] (2026-08-05) Milestone 1 (canary scope): `apps/relay2` scaffolded, edge auth ported, deployed to `superset-relay2.avi-6ac.workers.dev`. Remaining from M1: CI deploy workflow with loud Slack failure (D-10), versioned `host.setOnline` API column (interim: version enforced inside the DO only).
- [x] (2026-08-05) Milestone 2 core COMPLETE: tunnel-v2 protocol (`packages/shared/src/tunnel-v2-protocol.ts`), ticketed dial-back streams spliced verbatim, HTTP-over-dial, hibernation auto-response pings, `TunnelClientV2` in host-service. Protocol selection: host probes relay `/health` for `proto: 2` (negotiation instead of config plumbing — supersedes the flag-payload `proto` idea). Client-facing routes wire-identical to v1, so desktop/web/CLI clients need zero changes pre-M3. E2E probe (`apps/relay2/scripts/e2e-probe.ts`) ALL PASS against the deployed Worker: text + 64KB binary splice intact, HTTP proxy with host-secret injection, offline detection.
- [x] (2026-08-05) Milestone 1 CI deploy: `deploy-relay2` job added to `deploy-production.yml` (mirrors electric-proxy; same CLOUDFLARE secrets). relay2 auto-deploys on every push to main. The loud health-gate variant was dropped — a fresh Worker serves 500s for ~1–2 min while propagating, so a fixed-window gate would flake; `wrangler deploy` already fails the job loudly on a bad upload.
- [x] (2026-08-10) Milestone 3 RESOLVED as not-needed for terminals: the terminal already has app-layer resumable catch-up (`host-service/src/terminal/terminal.ts` retained ring + `?seq=<epoch>:<n>` anchor; renderer `terminal-ws-transport.ts` tracks the anchor and reconnects with it). It is transport-agnostic, so it resumes gap-free through relay2's byte splice — verified by a live `wrangler deploy` mid-session: host reconnected on v2 in ~15s, zero `session-gone`. A relay-layer DO buffer (original D-7) would duplicate this; not building it. The event bus is the only stream without app-layer resume, but a dropped event just triggers a refetch — not worth a DO buffer.
- [x] (2026-08-10) Milestone 4 SHIPPED: v2 client + API-served relay config in stable desktop 1.20.2. `host.relayEndpoint` (jwtProcedure) is the single server-side resolver — the host-service asks for it after authenticating, killing the identify-race that stranded hosts on the wrong relay. Desktop renderer/main, CLI, web, and mobile all read it. Root cause of the rollout pain reproduced under controlled conditions (old code took the fallback relay, new code resolved the flag). Relay-consumer gap sweep merged: automation dispatch (#6337), trpc runNow + shared `resolveUserRelayUrl` + CLI resolveHostTarget + web CSP + mobile (#6340). Web CSP allowlists the relay2 origin.
- [ ] Milestone 4 remaining: internal team fully ported (flag = `@superset.sh`; Satya on relay2 and verified via live traffic; Kiet/Avi move on their next canary restart). Web CSP allowlist and all the per-consumer flag plumbing are cutover-temporary (see D-20).
- [ ] Milestone 5: rollout to all users + decommission `apps/relay` + Fly fleet + Upstash + rename `relay2` → `relay`. Strategy is the hostname cutover with **wait-for-drain**, not a v1 compat layer (D-20).

## Surprises & Discoveries

- Observation: The PostHog-flag relay-URL resolution is unreliable for hosts. During the 2026-08-04 canary, one daemonized host start silently missed the active flag payload and connected to the default relay; separately, the `RELAY_URL` env fallback never reaches the daemonized host-service process at all (`superset start --daemon` does not propagate it).
  Evidence: canary session logs; the sandbox host required a foreground start to pick up the override, and a later restart with the flag *off* plus `RELAY_URL` set still connected to Fly.
- Observation: A dying host-service's `setOnline(false)` can land after a replacement host's `setOnline(true)`, leaving a live tunnel marked offline in the product.
  Evidence: reproduced in production on 2026-08-04 when a killed sandbox raced a new sprite host with the same hostId; the desktop showed a gray (offline) dot while `_whoowns` returned 200.
- Observation: Sandbox providers that suspend on idle (Sprites) freeze the host-service silently; the relay ping-timeout then correctly tears the tunnel down. Any "demo host" used for testing must be held awake.
  Evidence: host log `no inbound traffic for 177484ms, forcing reconnect` after a sprite suspend.
- Observation: PTY output naturally chunks at ≤~12KB per WebSocket frame through the tunnel, so Durable Objects' 1MB message limit is irrelevant for terminal traffic.
  Evidence: 1.49MB burst → 1,628 frames, max 12,363 bytes (prototype test harness).
- Observation: A freshly deployed Worker + new DO class can serve 500 (Cloudflare error 1104) and route-level 404s for a minute or two after `wrangler deploy` while the deployment settles; the identical code passed all probes minutes later. Deploy verification (and the future CI health check) must retry before declaring failure.
  Evidence: first post-deploy probe of relay2 failed 5/7 checks; a re-run after redeploy passed 7/7 twice with only logging changed.
- Observation: `apps/electric-proxy` typecheck was already failing (23 drizzle table-variance errors in `src/where.ts`) on the base commit before any relay2 work — pre-existing breakage, not introduced here, but it makes root `bun run typecheck` red on this branch.
  Evidence: `git stash` → same 23 errors on the untouched tree.

## Decision Log

- Decision (D-1): Build relay2 as a new app `apps/relay2`, fully independent of `apps/relay`, and rename it to `apps/relay` only at decommission time.
  Rationale: independence lets the protocol change without wire-compatibility constraints; the rename-at-the-end mirrors the `packages/mcp-v2` → `packages/mcp` de-versioning already shipped in this repo (commit `3fd7204a6` era), so the end state has no version suffix.
  Date/Author: 2026-08-04 / Satya + Claude session.
- Decision (D-2): Target Cloudflare Workers + Durable Objects (one DO per host).
  Rationale: prototype proved latency parity with the Fly fleet, sub-10s deploy recovery, and deletion of the entire distributed-routing layer; Cloudflare's own Sandbox SDK ships terminals over exactly this architecture.
  Date/Author: 2026-08-04 / Satya + Claude session.
- Decision (D-3): New protocol ("tunnel v2") uses one small JSON control channel per host plus one raw WebSocket per proxied stream, dialed back by the host on demand. No multiplexing layer, no base64, binary passthrough.
  Rationale: the mux protocol (`ws:open/ws:frame/ws:close` envelopes, correlation maps, per-frame JSON parse) exists only because the old relay could not address per-stream connections to the same backend; a DO can. Deleting the mux removes the largest bespoke-code surface on both relay and host.
  Date/Author: 2026-08-04 / Claude session, from Satya's direction that hand-rolled WS handling is the smell to remove.
- Decision (D-4): Hosts and clients learn their relay endpoint from the API (a `relayEndpoint` served with host/session data), not from the `relay-url-override` PostHog flag payload.
  Rationale: the flag path failed twice during the canary (see Surprises); rollout control belongs server-side where it can be per-org/per-host, atomic with host registration, and observable.
  Date/Author: 2026-08-04 / Claude session.
- Decision (D-5): Liveness inverts direction: the **host** pings on an interval and the DO answers via the hibernation auto-response API (`setWebSocketAutoResponse`), so an idle host costs zero DO wake-ups. The DO learns of host death from the socket close event or on first failed stream-open, and the host learns of relay death from missed auto-responses.
  Rationale: the prototype's DO-initiated ping required a 30s alarm that defeats hibernation; auto-response answers without waking the object.
  Date/Author: 2026-08-04 / Claude session.
- Decision (D-6): `setOnline` writes carry a per-host monotonic version (kept in DO storage) and the API rejects stale versions.
  Rationale: the write-race was demonstrated in production on 2026-08-04 (gray-dot incident); the Fly relay's in-process versioning must become cross-process because DO teardown and replacement registration can interleave.
  Date/Author: 2026-08-04 / Claude session.
- Decision (D-7): Terminal and event streams are resumable: host→client frames carry sequence numbers, the DO keeps a capped ring buffer per stream (target 256KB) in DO storage, and clients re-attach with `resumeFrom=<seq>`.
  Rationale: this converts relay deploys, network blips, and laptop sleeps from "terminal wiped" into "replay from seq N", killing the cold-restore/`Connection lost` bug family; Cloudflare's Sandbox SDK validates the pattern (output buffering with replay on reconnect).
  Date/Author: 2026-08-04 / Satya (goal: drastic reliability/maintainability improvement) + Claude session.
- Decision (D-8): Auth model is unchanged: better-auth JWTs verified against `https://api.superset.sh/api/auth/jwks` at the Worker edge (issuer/audience = API URL), plus the cached `host.checkAccess` API call. All auth work happens in the stateless Worker before the DO is touched.
  Rationale: proven in the prototype; keeps the single-threaded DO free of slow I/O.
  Date/Author: 2026-08-04 / Claude session.
- Decision (D-9): HTTP proxying (remote tRPC to the host) rides tunnel v2 as a short-lived stream: the DO asks the host to dial back, sends one JSON header frame (method/path/headers), streams body bytes raw, and the host replies with one JSON header frame + raw body. The old JSON-blob `{type:"http"}` correlation protocol is not carried forward.
  Rationale: one stream primitive for everything; no request-size limits from JSON stringification; no pending-request correlation map in the DO.
  Date/Author: 2026-08-04 / Claude session.
- Decision (D-10): Deploys of relay2 must fail loudly: the deploy workflow posts to Slack on failure and the repo treats a red Deploy Relay2 run as a stop-the-line event.
  Rationale: the July 22–24 outage happened because Deploy Relay failed silently and the fleet stayed on a leaky build for two days; this was the single largest reliability lesson of the audit.
  Date/Author: 2026-08-04 / Claude session.
- Decision (D-11): `relay.superset.sh` — the existing canonical relay hostname — becomes relay2's production endpoint at the Milestone 5 cutover. relay2 runs on `workers.dev` only during development and the parallel-run rollout.
  Rationale: every shipped desktop build already allowlists `relay.superset.sh` in its CSP and every host-service default points at it, so cutting over on the same name means stale installed apps and un-updated daemons reach relay2 with zero client releases — the migration tail handles itself.
  Date/Author: 2026-08-04 / Satya.
- Decision (D-12): PR #6165's wire-compatible implementation (`apps/relay-do`) is not merged as a product; its code is reused inside relay2 as a v1-protocol compatibility layer mounted for the hostname cutover, so old daemons still speaking tunnel v1 keep working the day `relay.superset.sh` flips off the Fly fleet. The compat layer is deleted with the rest of the v1 surface once v1 connections hit zero.
  Rationale: the cutover in D-11 points old clients at relay2 whether or not they understand tunnel v2; serving v1 during the tail is strictly better than a dead hostname, and the prototype already is that implementation, validated in production on 2026-08-04.
  Date/Author: 2026-08-04 / Satya + Claude session.
- D-13: (open — predictive-echo follow-up plan, see Open Questions)
- Decision (D-17): The milestone split is rollout batching only, not engineering deferral — every architectural improvement whose blast radius is relay2 + host-service ships in the initial build. Applied 2026-08-05: Worker↔DO fake-URL fetches replaced with typed DO RPC (`prepareStream`/`isConnected`/`proxyHttp`; fetch only for WS upgrades), and client WS upgrades defer the 101 until the host's dial-back exists — offline/unresponsive hosts are a clean pre-handshake 503/504, never open-then-close. Buffering is conserved but shrinks to the ~ms dial→client-attach window on the dial side.
  Rationale: Satya: "make the best version of relay2 now"; the 101-deferral also restores v1's pre-upgrade 503 semantics that the first cut had regressed.
  Date/Author: 2026-08-05 / Satya + Claude session.
- Decision (D-18): HTTP-over-dial stays, as an isolated module (`http-exchange.ts`) — it is a product requirement, not v1 debt: serverless callers (SDK, MCP, the API's Slack-agent path) cannot hold WebSockets and need request/response HTTP into hosts. The tRPC-over-WS idea is therefore NOT adopted as a replacement; it could later become an additional client transport, but it cannot delete the HTTP path.
  Rationale: enumerating consumers of `/hosts/:id/trpc` showed WS-less callers on both server and edge runtimes; forcing wsLink onto a Vercel function is worse design than one contained exchange module.
  Date/Author: 2026-08-05 / Claude session, reviewed direction from Satya's "no debt" push.
- Decision (D-19): v1-era control messages (`drain`, `hello`) are removed from tunnel v2. DO restarts drop sockets and partysocket reconnects on ~1s backoff — deploy drain choreography was a Fly-ism; version telemetry can ride the control URL later if ever needed. `apps/relay-do` deleted from the tree (git history + PR #6165 retain it; the M5 cutover compat layer will be rebuilt from history if pursued).
  Date/Author: 2026-08-05 / Satya + Claude session.
- Decision (D-20): No v1 compatibility layer in relay2 — ever. The M5 all-users cutover is **ops-only, accept-the-churn**: rename the CF account (D-16), set up the Cloudflare-for-SaaS custom hostname (D-14), repoint `relay.superset.sh` → relay2, and delete the `relay-url-override` flag so the default relay IS relay2. No code. Satya (2026-08-10): relay usage is low enough that minor churn at cutover is fine — we do not need to carefully wait for full drain. The bounded, self-healing churn is: hosts still on a pre-v2 build (≤1.20.1) were pointed at `relay.superset.sh` (Fly) and now hit relay2, which they can't speak, so they show offline until they auto-update to ≥1.20.2. v2 hosts just reconnect from the workers.dev URL to `relay.superset.sh` (same protocol). Supersedes D-12 (compat layer) entirely; the ~350-line mux-in-DO port from `apps/relay/src/tunnel.ts` is never built.
  Rationale: 1.20.2 stable already speaks v2 and auto-update carries everyone there; the residual breakage is a handful of stale hosts self-healing on update, against low relay usage. A delicate DO state machine to prevent that is the wrong trade.
  Date/Author: 2026-08-10 / Satya + Claude session.
- Decision (D-21): Every server-and-client path that reaches a user's host must resolve the relay through the flag, not `env.RELAY_URL`. This is a *class* of bug, not one site: the automation break (host on relay2, dispatch dialing Fly) recurred across automation dispatch, trpc runNow, CLI resolveHostTarget, web CSP, and mobile. All fixed (#6337, #6340). But the class is inherent to per-relay flag targeting — every NEW reach-the-host path must resolve the flag. This is the strongest argument for D-20's hostname cutover: once relay2 answers on `relay.superset.sh`, every hardcoded `env.RELAY_URL` becomes correct automatically and this whole class evaporates.
  Date/Author: 2026-08-10 / Claude session.
- Decision (D-15): Buy-over-build is the explicit standard for relay2, with "cleanest end-state" as the tiebreaker. Milestone 1 opens with a timeboxed spike (1 day) building the control-channel + one dial-back stream on `partyserver` (Cloudflare's maintained PartyKit successor for Durable Objects) with `partysocket` on the host and client sides; if the result is cleaner than the raw-DO prototype shape, relay2 adopts the PartyKit stack fully — including replacing the three hand-rolled reconnect implementations (`tunnel-client`, `relaySocket`, event-bus) with `partysocket`. Only the irreducible core stays bespoke: reverse-tunnel dial-back semantics, auth against our API, and the resumable stream buffer. Raw DO APIs are the fallback only if the spike shows the framework fighting the dial-back shape.
  Rationale: Satya's direction (2026-08-05): converge on the cleanest end-state, full PartyKit if that is what's cleanest; the audit showed hand-rolled WS lifecycle code is where our outages lived.
  Date/Author: 2026-08-05 / Satya.
- Decision (D-16): The Cloudflare account is renamed from `avi-6ac` to a Superset-branded name (account renames are a dashboard settings operation; the `workers.dev` subdomain can also be changed, which alters dev-phase URLs — do this before Milestone 4's CSP entry so the allowlisted hostname is the final one). No account migration; it is the company account and keeps `electric-proxy`.
  Rationale: it is Superset's account, not Avi's personal one; the name should say so before it gets baked into CSPs, docs, and runbooks.
  Date/Author: 2026-08-05 / Satya.
- Decision (D-14): The hostname cutover uses a Cloudflare for SaaS custom hostname, not a superset.sh nameserver migration. Mechanics: activate one spare org-owned domain as a Cloudflare zone to serve as the SaaS "fallback origin"; on Vercel DNS, add the cert-validation TXT record and repoint the existing `relay.superset.sh` CNAME at the fallback origin; bind the relay2 Worker to the custom hostname. superset.sh's zone and all other records never move.
  Rationale: a full nameserver migration risks the production apex to serve one subdomain (and the July 2026 CNAME-loss incident showed how expensive DNS mistakes on this domain are); SaaS custom hostnames are the platform-supported way to serve an externally-DNS'd name, cost ~nothing at our scale, and pass WebSockets. A future zone move remains possible but is not required by this plan.
  Date/Author: 2026-08-04 / Satya + Claude session.

## Outcomes & Retrospective

(To be filled as milestones complete.)

## Context and Orientation

This is a Bun + Turborepo monorepo (see root `AGENTS.md`). The parts relevant to this plan:

- `apps/relay` — the **current** relay: a Hono HTTP/WebSocket server (Hono is the web framework used across this repo) running on 7 Fly.io machines. Key files: `src/index.ts` (routes), `src/tunnel.ts` (the per-host multiplexer state machine), `src/directory.ts` (Upstash Redis "which machine owns which host" directory with Lua scripts), `src/proxy.ts` (machine-to-machine WebSocket bridging over Fly's private IPv6 network), `src/auth.ts` (JWT verification via JWKS), `src/access.ts` (cached `host.checkAccess` authorization), `src/trpc-error.ts` (tRPC-shaped error envelopes). This app is **not modified** by this plan until Milestone 5 deletes it.
- `apps/relay-do` — the 2026-08-04 wire-compatible Durable Objects **prototype** (PR #6165). It speaks the old protocol. relay2 supersedes it; reference it for Workers/DO mechanics (hibernation API usage, Worker↔DO fetch patterns, wrangler config) but do not extend it.
- `packages/host-service` — the daemon running on every host. `src/tunnel/tunnel-client.ts` is the old-protocol client (single WS, JSON envelopes, reconnect/backoff/watchdog). `src/providers/auth/JwtAuthProvider/JwtAuthProvider.ts` mints the JWT the host presents to the relay (`GET {api}/api/auth/token` with `x-api-key` for API-key auth; OAuth access tokens pass through directly).
- `packages/shared/src/tunnel-protocol.ts` — the old protocol's message types. relay2 gets a new file, `packages/shared/src/tunnel-v2-protocol.ts`; the old file remains until Milestone 5.
- `packages/host-client` — the client-side library used by desktop/web/CLI to talk to hosts through the relay. `src/lib/relaySocket.ts` opens WebSockets; `src/lib/primeRelayAffinity.ts` is the Fly-specific HTTP preflight (delete in Milestone 5); `src/providers/WorkspaceClientProvider` builds host URLs.
- `apps/desktop` — Electron app. The renderer's Content-Security-Policy (a browser mechanism that whitelists which network origins a page may contact) is a `<meta>` tag in `src/renderer/src/../index.html`, substituted at build time; packaged apps cannot reach origins not listed there. `src/main/lib/relay-url/relay-url.ts` and `src/renderer/hooks/useRelayUrl/useRelayUrl.ts` resolve the relay URL today (PostHog flag → env fallback); both are replaced by API-served config in Milestone 4.
- `apps/api` — the Next.js API at `https://api.superset.sh`. Serves better-auth JWTs and JWKS, the `host.checkAccess` and `host.setOnline` tRPC procedures, and (new in this plan) the relay endpoint configuration.

Terms used throughout:

- **Durable Object (DO)**: a Cloudflare primitive — a single-threaded JavaScript object with a globally unique name; every request addressed to that name, from anywhere in the world, reaches the same instance. `HOST_TUNNEL.idFromName(hostId)` therefore *is* the routing layer. DOs support "WebSocket hibernation": the object can be evicted from memory while its WebSockets stay connected, and is re-instantiated when a message arrives.
- **hostId**: `<organizationId>:<machineId>` (see `packages/shared/src/host-routing.ts`, `parseHostRoutingKey`).
- **Control channel**: the one long-lived WebSocket a host keeps open to its DO, carrying only small JSON control messages.
- **Stream**: one proxied byte pipe (a terminal, the event bus, one HTTP exchange), carried on its own dedicated WebSocket pair spliced inside the DO.

## Plan of Work

The work is five milestones. Milestones 1–3 build and prove relay2 in isolation using a checked-in test harness and disposable sandbox hosts (no product surface changes). Milestone 4 wires the product to it behind server-side rollout control. Milestone 5 migrates traffic and deletes the old world.

### Spike (opens Milestone 1): partyserver/partysocket fit — 1 day timebox

Goal: determine whether the PartyKit stack is the cleanest implementation of tunnel v2 (D-15). Build, in a throwaway branch of `apps/relay2`: a `partyserver` Server class handling the host control channel (hibernation on, auto-response ping), the ticketed `stream:dial` flow, and one spliced terminal stream, with `partysocket` as the host-side dialer. Success criteria: the dial-back + splice shape fits `partyserver`'s `onConnect`/`onMessage` model without fighting it (no monkey-patching, no reaching around the framework for hibernation or tags), and the resulting code is smaller and clearer than the raw-DO prototype equivalent. Outcome recorded here and in the Decision Log; the losing shape is deleted.

### Milestone 1: scaffold, edge auth, DO skeleton, loud deploys

Create `apps/relay2` (package `@superset/relay2`) with the same toolchain shape as the prototype: `wrangler.jsonc` (worker name `superset-relay2`, `HOST_TUNNEL` DO binding with `new_sqlite_classes`, `NEXT_PUBLIC_API_URL` var = `https://api.superset.sh`), tsconfig extending `@superset/typescript/base.json` with `types: ["@cloudflare/workers-types"]` and `jsx: react-jsx` (the `@superset/trpc` type graph reaches React email templates), and exact-pinned deps (`hono`, `jose`, `lru-cache`, `superjson`, `@trpc/client`, workspace `@superset/shared` + `@superset/trpc`; dev: `wrangler`, `@cloudflare/workers-types`, respecting the repo's 3-day minimum-release-age rule in `bunfig.toml`).

Port unchanged from the prototype (they are protocol-agnostic): `auth.ts` (JWKS verify; do not log expired-token errors), `access.ts` (userId-keyed LRU allow/deny caches; per-isolate on Workers), `api-client.ts` (tRPC client factory taking `(token, apiUrl)`), `trpc-error.ts`.

Worker routes in `src/index.ts` (Hono): `GET /health` → `{ok, region:"cf", proto:2}`; `GET /control` (host control-channel upgrade — JWT + checkAccess, then forward to DO `/register`); `GET /dial` (host dial-back stream attach — authenticated by a one-time stream ticket, see Milestone 2); `GET /hosts/:hostId/_whoowns` (kept for client failure-reason probing; returns `{ok, region:"cf"}` / 503 / 403); client stream and HTTP routes are defined in Milestone 2. Auth failures on upgrades complete the handshake then close with code 1008 and a reason string ≤123 bytes (the only way browser clients can see *why*).

`HostTunnel` DO skeleton in `src/host-tunnel.ts`: hibernation-API sockets only; attachments are tiny type tags; session state (hostId, host JWT, setOnline version counter) in DO storage; `setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}','{"type":"pong"}'))` so host keepalives never wake the object (D-5). `setOnline` calls the API with a monotonic version from `storage.get/put("onlineVersion")` (D-6) — this requires a small API change: `host.setOnline` accepts an optional `version` and ignores writes older than the stored one (add `relayOnlineVersion` column via the db-migrations skill flow; schema in `packages/db/src/schema/`, never hand-edit `packages/db/drizzle/`).

CI: `.github/workflows/deploy-relay2.yml` — on push to `main` touching `apps/relay2/**`, run `bun install`, `wrangler deploy` (secret `CLOUDFLARE_API_TOKEN`), then curl `/health` and fail the run on non-200; on failure, post to the existing Slack failure webhook. This is D-10 and is not optional polish; it is the direct fix for the July silent-deploy outage class.

Acceptance: `bun run typecheck` and `bun run lint` clean at root; `cd apps/relay2 && bunx wrangler deploy --dry-run --outdir /tmp/relay2-dist` bundles; after real deploy, `curl https://superset-relay2.avi-6ac.workers.dev/health` returns `{"ok":true,"region":"cf","proto":2}` and an unauthenticated `curl .../hosts/x/_whoowns` returns 401.

### Milestone 2: tunnel v2 core — control channel + dial-back streams

Define `packages/shared/src/tunnel-v2-protocol.ts` (add a `./tunnel-v2-protocol` export to `packages/shared/package.json` mirroring the existing `./tunnel-protocol` entry). Control-channel messages, all small JSON:

    // DO → host
    { type: "stream:dial", ticket: string, kind: "ws" | "http",
      path: string, query?: string }        // open a stream: dial /dial?ticket=…
    { type: "drain", reason?: string }       // optional; DO restarts already reconnect fast
    // host → DO
    { type: "hello", protoVersion: 2, hostServiceVersion: string }
    { type: "ping" }                         // answered by hibernation auto-response, never wakes the DO

Stream lifecycle: a client hits `GET /hosts/:hostId/s/*` (WebSocket upgrade; `*` is the host-local path such as `/terminal/<id>` or `/events`). The Worker authenticates (JWT + cached checkAccess), then calls the DO. The DO accepts the client socket, generates a random one-time `ticket`, stores `{ticket → {clientSocketTag, path, query, expiresAt: now+10s}}` in storage, and sends `stream:dial` on the control channel. The host opens `wss://<relay2>/dial?ticket=…`; the Worker forwards to the DO, which validates and deletes the ticket and from then on **splices**: every frame arriving on either socket is forwarded verbatim to the other (string or binary — no parsing, no envelopes, no base64). Either side closing closes the other with the same code. If the host does not dial within the ticket TTL, the DO closes the client socket 1011 "Host did not answer" — that is also the host-death detector for streams (D-5).

HTTP proxying (D-9): `ALL /hosts/:hostId/trpc/*` in the Worker performs the same ticketed dial with `kind:"http"`, but instead of a client WebSocket the Worker holds the HTTP request open; the DO forwards one JSON header frame `{method, path, headers}` then raw body bytes then a finish frame on the dialed socket, and the host replies symmetrically (`{status, headers}` + raw body + finish); the Worker streams that back as the HTTP response. tRPC-shaped errors (`trpc-error.ts`) cover "host offline" (503 envelope) and dial-timeout (502 envelope).

Host side: new `packages/host-service/src/tunnel/tunnel-client-v2.ts` implementing the mirror: maintain the control channel (reconnect with the existing backoff/jitter/watchdog logic — port those constants, they encode real operational learning), send `ping` every 30s, treat 3 missed `pong`s as dead, handle `stream:dial` by opening the local WebSocket or HTTP call against `127.0.0.1:<port>` exactly as `tunnel-client.ts` does today (including the `hostServiceSecret` injection and the pending-frame buffer for connecting local sockets), and pipe bytes. Selection between v1 and v2 clients is a constructor argument; nothing chooses v2 in production yet. The old `tunnel-client.ts` is untouched (additive-then-subtractive).

Check the prototype's test harness into the repo as `apps/relay2/scripts/e2e-probe.ts` (Bun script): mints a JWT from `SUPERSET_API_KEY`, opens a terminal stream through relay2, measures keystroke-echo RTT (10 samples, report min/median/max), runs the `seq 1 200000` burst (report bytes, frames, max frame, throughput), and exits non-zero on failure. This is the acceptance instrument for every later milestone.

Acceptance: on a disposable OpenComputer sandbox host (recipe: install CLI via `curl -fsSL https://superset.sh/cli/install.sh | sh`, auth with `SUPERSET_API_KEY`, run host-service in **foreground** with the v2 client selected via a temporary env knob — note sprites auto-suspend and are unsuitable), `bun apps/relay2/scripts/e2e-probe.ts` passes; median keystroke RTT within 15ms of the same probe pointed at the old relay from the same client machine; `superset workspaces list --host <sandbox>` succeeds end-to-end through relay2's HTTP path.

### Milestone 3: resumable streams

Terminal and event-bus streams (host→client direction) gain sequence numbers and replay (D-7). The DO wraps spliced frames for *resumable* stream kinds: host→client frames are prefixed with a 4-byte little-endian sequence counter (binary framing, not JSON, to keep per-frame cost trivial); the DO appends each frame to a per-stream ring buffer in DO storage capped at 256KB (oldest evicted); client→host frames are unmodified. A client re-attaches with `GET /hosts/:hostId/s/terminal/<id>?resumeFrom=<seq>`: if the buffer still contains `seq+1`, the DO replays from there and splices live (the host keeps its side open through short client absences — the DO holds the host-side stream for a grace period, target 60s, after client disconnect before telling the host to close); if not, it signals `{type:"reset"}` and the client falls back to today's full-redraw path. `packages/host-client/src/lib/relaySocket.ts` gains resume support (track last seq, reconnect with `resumeFrom`), used by terminal and event-bus consumers.

The concrete user-visible outcome, and the acceptance test: run `wrangler deploy` while typing in a remote terminal — the terminal freezes for a beat and continues **with no lost output and no redraw**, verified by the probe script's deploy-survival mode (`e2e-probe.ts --deploy-test` streams a slow counter, triggers a deploy mid-stream via `wrangler deploy`, and asserts the received byte stream is gap-free across the reconnect).

### Milestone 4: client adoption + API-served endpoint config

API: add `relayEndpoint` to what hosts and clients already fetch — `host.register`/host bootstrap returns `{relayEndpoint: {url, proto}}` for the host-service, and the workspace/host payloads clients already load carry the same for the client side. Rollout control is a server-side rule (per-org / per-user / percentage — implement as a simple DB-backed setting read by the API, not a PostHog flag; D-4). Default remains the old relay.

Host-service: `connect.ts` selects tunnel v1 or v2 from `relayEndpoint.proto`. Ship in the normal lockstep release (desktop == host-service == cli versions; see `scripts/release/README.md`). Old daemons that never learn v2 keep using v1 against the old relay until they auto-update — both relays run in parallel throughout.

Clients: desktop main + renderer, web, and CLI replace flag-based `getRelayUrl`/`useRelayUrl` with the API-served endpoint (keep a hardcoded fallback to the old relay for resilience). Desktop CSP `<meta>` gains `https://superset-relay2.avi-6ac.workers.dev` (and drops nothing yet). `primeRelayAffinity` is skipped when `proto === 2` (the `_whoowns` probe remains available for error-reason reporting on failures). Terminal + event-bus consumers adopt resumable `relaySocket`.

Acceptance: with the rollout rule set to "Satya's user only", the production desktop app (post-release) opens a workspace on a v2-routed host: terminal works, `wrangler deploy` mid-session does not wipe the terminal, event bus stays live, and no `primeRelayAffinity` requests appear in the renderer console. Every other user's traffic is untouched (verify: Fly fleet request volume unchanged).

### Milestone 5: rollout, hostname cutover, decommission, rename

Widen the rollout rule stepwise (team org → percentage → all), watching Sentry (wire relay2 into the existing `relay` Sentry project conventions from the 2026-08 error-handling contract: capture unexpected exceptions only, expected churn classified out at the throw site) and the Fly fleet's declining traffic.

Then the hostname cutover (D-11/D-14), which lets the long tail of un-updated apps and daemons migrate themselves: mount the v1-protocol compatibility layer (the validated `apps/relay-do` prototype code — same wire protocol as the Fly relay) inside relay2 under the same routes the old relay served (D-12). Set up the Cloudflare for SaaS custom hostname: activate a spare org-owned domain as a CF zone for the fallback origin, add the validation TXT record on Vercel DNS, then repoint the `relay.superset.sh` CNAME from `superset-relay.fly.dev` to the fallback origin during a low-traffic window, with a written rollback (repoint the CNAME back — the Fly fleet stays running untouched until after the cutover is verified). Verify with the e2e probe against `https://relay.superset.sh` in both protocols, and confirm a **stale** desktop build (pre-CSP-change) works against it — that is the entire point of cutting over on this name.

When Fly-relay traffic (now only bypass/direct `fly.dev` stragglers) is zero for 14 days: delete `apps/relay` and `apps/relay-do`, the Fly app + deploy workflows, the Upstash directory database, `packages/shared/src/tunnel-protocol.ts`, `tunnel-client.ts`, and `primeRelayAffinity.ts`; drop the v1 compat layer from relay2 once v1 connections hit zero; remove the `workers.dev` relay host from the desktop CSP (keeping `relay.superset.sh`); retire the `relay-url-override` PostHog flag; rename `apps/relay2` → `apps/relay` (mcp-v2 precedent, D-1); run `bun run lint` + `bun run typecheck` + full test suite; update `AGENTS.md`-adjacent docs and the deploy runbook.

Acceptance: repo contains exactly one relay app named `apps/relay` (the DO one); `fly apps list` no longer shows `superset-relay`; `https://relay.superset.sh/health` returns relay2's `{"ok":true,"region":"cf","proto":2}`; a fresh host + fresh desktop install and a deliberately stale desktop build both communicate through relay2 on the canonical hostname; the e2e probe passes against `https://relay.superset.sh`.

## Concrete Steps

Milestone-specific commands appear above. Universal ones, always from the repo root unless noted:

    bun install                       # after adding apps/relay2
    bun run lint && bun run typecheck # must be clean before any push (CI fails on warnings)
    cd apps/relay2 && bunx wrangler deploy --dry-run --outdir /tmp/relay2-dist   # bundle check
    bunx wrangler deploy              # real deploy (needs wrangler login or CLOUDFLARE_API_TOKEN)
    bunx wrangler tail                # live logs while testing
    bun apps/relay2/scripts/e2e-probe.ts   # E2E acceptance instrument (needs SUPERSET_API_KEY + a live test host)

Database changes (the `relayOnlineVersion` column in Milestone 1) follow `.agents/skills/db-migrations/SKILL.md`: edit `packages/db/src/schema/`, then ask the user to run `drizzle-kit generate` — never hand-edit `packages/db/drizzle/`.

## Validation and Acceptance

Each milestone's acceptance is defined inline above; the plan-level bar is behavioral: a user on a v2 host can open a remote terminal from the production desktop app, type with latency indistinguishable from the Fly relay (median echo delta <15ms on the probe), survive a relay deploy mid-session without losing terminal output, and see their host's online status track reality through host churn — while `apps/relay`, its fleet, and its directory no longer exist in the repo or in production.

## Idempotence and Recovery

Everything through Milestone 3 is additive and touches no production traffic; redeploying relay2 is always safe (hosts reconnect in seconds; after Milestone 3, without losing terminal state). Milestone 4's rollout is reversible at any moment by flipping the server-side rule back — both relays run in parallel until Milestone 5, and hosts/clients that lose the API mid-flight fall back to the old relay URL. The only irreversible step is the Milestone 5 deletion, gated on 14 days of zero Fly traffic. If relay2 misbehaves at any rollout percentage, set the rule to 0%, and the fleet is back on Fly within one reconnect cycle (~5s per host).

## Artifacts and Notes

Prototype evidence (2026-08-04 canary, same host/PTY/script, client in SF, host in Azure US-East):

    metric                     Fly relay      DO relay
    WS connect (cold)          149ms          ~800ms
    keystroke echo median      124ms          121–125ms
    1.49MB PTY burst           560ms          777ms
    largest frame observed     4.1KB          12.4KB
    deploy recovery            n/a            ≤10s, automatic

The ~800ms cold connect is edge JWT verify + uncached checkAccess + DO wake; Milestone 2's ticketed dial does not add to it, and warm reconnects are far cheaper. If it matters post-launch, cache JWKS/access results in Workers KV.

## Interfaces and Dependencies

- `apps/relay2`: `hono` (Worker routing), `jose` (JWKS JWT verify), `lru-cache` (access caches), `superjson` + `@trpc/client` + `@superset/trpc` types (API calls: `host.checkAccess`, `host.setOnline`), `@superset/shared` (`parseHostRoutingKey`, tunnel-v2 protocol types). Exact-pinned versions ≥3 days old.
- `packages/shared/src/tunnel-v2-protocol.ts`: exports `ControlMessage` (union above), `HttpHeaderFrame`, `HttpResponseHeaderFrame`, and `RESUMABLE_STREAM_KINDS`.
- `packages/host-service/src/tunnel/tunnel-client-v2.ts`: `class TunnelClientV2` with the same constructor-options shape as `TunnelClient` plus `relayEndpoint: {url: string; proto: 2}`.
- `apps/api`: `host.setOnline` gains optional `version: number`; host bootstrap + workspace payloads gain `relayEndpoint: {url: string; proto: 1 | 2}`; a `relay_rollout` setting (org/user/percentage) controls what is served.
- Cloudflare account: the one hosting `electric-proxy` (`avi-6ac`), Workers paid plan, DO SQLite classes; CI secret `CLOUDFLARE_API_TOKEN` with Workers deploy rights.

---

Revision note (2026-08-04): Resolved the hostname question after discussion. `relay.superset.sh` becomes relay2's canonical endpoint at the Milestone 5 cutover (D-11) via a Cloudflare for SaaS custom hostname so superset.sh DNS never leaves Vercel (D-14); the wire-compatible prototype from PR #6165 is repurposed as relay2's v1-compat layer for the cutover tail (D-12). Milestone 5, Assumptions, and Open Questions updated accordingly; remaining open question is only D-13 (predictive echo follow-up).

Revision note (2026-08-05): Decision walkthrough with Satya resolved: D-3 transport confirmed (dial-back per stream; clarified the dial cost is per-stream-open, not per-frame), D-4 confirmed (API-served endpoint), D-7 timing confirmed (resumable streams built before client adoption), and added D-15 (buy-over-build with a partyserver/partysocket spike gating Milestone 1 — cleanest end-state wins, full PartyKit adoption if it fits) and D-16 (rename the Cloudflare account from avi-6ac to a Superset-branded name before Milestone 4). Spike section added at the top of Plan of Work.

Revision note (2026-08-10): Brought the plan up to shipped reality after the config-fix session. Milestones 1 (CI deploy), 3 (resumable — resolved as not-needed; terminal already resumes app-layer), and 4 (v2 client + API-served config in stable 1.20.2) marked done. Added D-20 (wait-for-drain cutover, not a v1 compat layer) and D-21 (relay-resolution is a bug class; the cutover deletes it). Open: internal team fully ported (Kiet/Avi restart pending), Cloudflare account rename, and the M5 cutover itself.
